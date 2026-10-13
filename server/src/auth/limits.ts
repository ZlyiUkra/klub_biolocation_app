// Limits on sign-in attempts (T049 of specs/001-self-hosted-club-site; research.md section 5; tests:
// server/test/signin.test.ts for the numbers and the address window, server/test/limits.test.ts for the database part).
// Source: OWASP Authentication Cheat Sheet, "Account Lockout" and "Protect Against Automated Attacks" (read for T044).
// The owner chose, on 2026-10-11, variant A and his own code for the address limit instead of express-rate-limit.
//
// Two limits, as OWASP asks: a counter on the ACCOUNT, kept in the database so a restart does not forgive it
// (`users.failed_count`, `users.locked_until`), because an attacker comes from many addresses; and a window on the
// ADDRESS, kept in memory, as a floor against one machine trying many accounts.
//
// Decisions that would otherwise look like mistakes:
// - Never permanent. A permanent lock would let anyone who knows an address lock its owner out for good; the longest
//   pause is 15 minutes, which keeps a guesser to about 20 tries an hour on one account (5 per 15 minutes).
// - Attempts made during a pause neither count nor extend it, so an owner who keeps pressing the button does not dig
//   himself deeper. That is why the callers must ask `pauseRemainingSeconds` first and record only the attempts that
//   were actually checked.
// - An identifier that belongs to no account is paused in exactly the same way, from rows of `login_attempts` of kind
//   `identifier` under a SHA-256 of its normalised text (the text itself is never stored: people type other people's
//   addresses, and passwords, into the wrong field). Without this the pause itself would tell a visitor which addresses
//   have accounts. The pause of such an identifier is derived (count of its rows and the time of the last one), the
//   pause of an account is stored, and both follow the same function `pauseAfterFailures`, so the two cannot drift.
// - The address window is in memory and lost at a restart, on purpose: it is a cheap floor, the account counter is the
//   durable defence, and one process serves the site. It is bounded in size, so a flood of invented addresses cannot
//   grow it without limit.
// - The numbers are one block, `signinLimits`, and nothing else in the tree repeats them.

import { createHash } from "node:crypto";
import type { Pool } from "../db/pool.js";
import { withTransaction } from "../db/pool.js";

/** The numbers, in one block (contracts/http-api.md: "their numbers live in one constant block"). */
export const signinLimits = {
  /** Consecutive failures that bring a pause; the pause is taken again at every multiple of it. */
  failuresPerStep: 5,
  /**
   * From which failure inside a step the visitor is told how many tries are left before the pause (the owner's choice
   * of 2026-10-11, T053: the third of five, so "2 left", then "1 left"). An unknown identifier counts the same way, so
   * the warning tells nobody whether an account exists.
   */
  warnFromFailure: 3,
  /** The pauses in milliseconds: the first, the second, and every one after that. Never permanent. */
  pausesMs: [1 * 60_000, 5 * 60_000, 15 * 60_000],
  /** Failed attempts one address may make inside the window before it is answered with 429. */
  addressMaxFailures: 20,
  addressWindowMs: 15 * 60_000,
  /** Sign-ups one address may make inside the window (owner, 2026-10-11, T159 variant A). */
  signupMaxPerAddress: 10,
  signupWindowMs: 60 * 60_000,
  /** How long a failed attempt is kept (the owner's word, 2026-10-11, as in the plan). */
  attemptRetentionMs: 30 * 24 * 60 * 60_000,
  /** The most addresses the in-memory window tracks at once. */
  maxTrackedAddresses: 10_000,
} as const;

/** The pause that a failed count has just earned: 0 unless the count is a multiple of `failuresPerStep`. */
export function pauseAfterFailures(failedCount: number): number {
  const step = signinLimits.failuresPerStep;
  if (!Number.isInteger(failedCount) || failedCount < step) return 0;
  if (failedCount % step !== 0) return 0;
  const index = Math.min(
    failedCount / step - 1,
    signinLimits.pausesMs.length - 1,
  );
  return signinLimits.pausesMs[index] ?? 0;
}

/**
 * What a failure that brought a count to `failedCount` tells the visitor: how many tries are left before the pause
 * (only from the failure `warnFromFailure` of a step on; absent before that) and the pause just earned, if any.
 */
export function standingAfterFailure(failedCount: number): {
  attemptsLeft?: number;
  pauseSeconds?: number;
} {
  const step = signinLimits.failuresPerStep;
  const pauseMs = pauseAfterFailures(failedCount);
  if (pauseMs > 0) {
    return { attemptsLeft: 0, pauseSeconds: Math.ceil(pauseMs / 1000) };
  }
  const position = failedCount % step;
  if (position >= signinLimits.warnFromFailure) {
    return { attemptsLeft: step - position };
  }
  return {};
}

/** A sliding window of failed attempts per address, in memory. */
export class AddressLimiter {
  // Failure times in ascending order per address. A Map keeps insertion order, which is what the size cap evicts by.
  private readonly failures = new Map<string, number[]>();
  private readonly maxFailures: number;
  private readonly windowMs: number;

  // Changed 2026-10-11 (T050): the numbers are parameters, with the sign-in limit as the default, so the sign-up cap
  // (ten an hour per address) is one more instance of the same code and not a second implementation of the window.
  constructor(options: { maxFailures?: number; windowMs?: number } = {}) {
    this.maxFailures = options.maxFailures ?? signinLimits.addressMaxFailures;
    this.windowMs = options.windowMs ?? signinLimits.addressWindowMs;
  }

  private fresh(address: string, nowMs: number): number[] {
    const kept = (this.failures.get(address) ?? []).filter(
      (at) => at > nowMs - this.windowMs,
    );
    if (kept.length === 0) this.failures.delete(address);
    else this.failures.set(address, kept);
    return kept;
  }

  /** Notes one failed attempt from `address` at `now`. */
  recordFailure(address: string, now: Date): void {
    const nowMs = now.getTime();
    const kept = this.fresh(address, nowMs);
    kept.push(nowMs);
    // More than the maximum is never needed: the answer is the same, and the list stays short.
    if (kept.length > this.maxFailures) kept.shift();
    // Re-inserting moves the address to the end, so the oldest-touched addresses are the ones evicted.
    this.failures.delete(address);
    this.failures.set(address, kept);
    if (this.failures.size > signinLimits.maxTrackedAddresses)
      this.sweep(nowMs);
  }

  /**
   * Takes back the latest failure of `address`. Added 2026-10-11 (T172): a route that must count an attempt before it
   * knows the outcome (so a burst of parallel attempts cannot all pass the check before any is counted) reserves the
   * attempt as a failure and gives it back when the attempt turned out right.
   */
  forgive(address: string, now: Date): void {
    const kept = this.fresh(address, now.getTime());
    if (kept.length === 0) return;
    kept.pop();
    if (kept.length === 0) this.failures.delete(address);
    else this.failures.set(address, kept);
  }

  /** Whether `address` may try, and if not, in how many seconds the oldest failure leaves the window. */
  check(
    address: string,
    now: Date,
  ): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
    const nowMs = now.getTime();
    const kept = this.fresh(address, nowMs);
    if (kept.length < this.maxFailures) return { allowed: true };
    // The failure that will leave the window first frees the place; the oldest of the last `max` is that one.
    const decisive = kept[kept.length - this.maxFailures] ?? 0;
    const leavesAt = decisive + this.windowMs;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((leavesAt - nowMs) / 1000)),
    };
  }

  // Forget the addresses whose failures have all left the window; if that is not enough, the oldest-touched go.
  private sweep(nowMs: number): void {
    for (const address of [...this.failures.keys()]) this.fresh(address, nowMs);
    for (const address of this.failures.keys()) {
      if (this.failures.size <= signinLimits.maxTrackedAddresses) break;
      this.failures.delete(address);
    }
  }
}

/**
 * The two windows of a route that takes a secret code with no session: five failures an address in fifteen minutes and
 * thirty an hour in all. Added 2026-10-11 (T174): the numbers were literals in both the recovery route and the setup
 * door; they are written once here and each route extends this class, so the two keep separate counters (an attacker
 * has to exhaust both) with one definition of the limits (the constitution's third principle).
 */
export class CodeAttemptLimits {
  readonly perAddress = new AddressLimiter({
    maxFailures: 5,
    windowMs: 15 * 60_000,
  });
  readonly global = new AddressLimiter({
    maxFailures: 30,
    windowMs: 3_600_000,
  });
}

/** Who a failed attempt is held against: a real account, or an identifier that matched none. */
export type AttemptSubject =
  { kind: "account"; userId: number } | { kind: "identifier"; hash: string };

/** The key of an unknown identifier: SHA-256 of its normalised text, in hex. The text itself is never stored. */
export function identifierKey(normalised: string): string {
  return createHash("sha256").update(normalised).digest("hex");
}

/** Seconds left of the pause the subject is in, 0 when it may try. Asked before the password is looked at. */
export async function pauseRemainingSeconds(
  pool: Pick<Pool, "query">,
  subject: AttemptSubject,
  now: Date,
): Promise<number> {
  let untilMs = 0;
  if (subject.kind === "account") {
    const result = await pool.query<{ locked_until: Date | null }>(
      "select locked_until from users where id = $1",
      [subject.userId],
    );
    untilMs = result.rows[0]?.locked_until?.getTime() ?? 0;
  } else {
    // Derived: the pause begins at the failure that made the count a multiple of the step, and the count stops
    // growing while it lasts, so the last failure is that one.
    const result = await pool.query<{ n: string; last: Date | null }>(
      `select count(*) as n, max(at) as last from login_attempts where kind = 'identifier' and key = $1`,
      [subject.hash],
    );
    const row = result.rows[0];
    const count = Number(row?.n ?? 0);
    if (row?.last) untilMs = row.last.getTime() + pauseAfterFailures(count);
  }
  const left = untilMs - now.getTime();
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

/**
 * Holds one failed, checked attempt against the subject and starts the pause it has earned. Returns the count the
 * subject has now (changed 2026-10-11, T053: the form tells the visitor how many tries are left).
 */
export async function recordFailedAttempt(
  pool: Pool,
  subject: AttemptSubject,
  now: Date,
): Promise<number> {
  if (subject.kind === "identifier") {
    await pool.query(
      "insert into login_attempts (kind, key, at) values ('identifier', $1, $2)",
      [subject.hash, now],
    );
    const total = await pool.query<{ n: string }>(
      "select count(*) as n from login_attempts where kind = 'identifier' and key = $1",
      [subject.hash],
    );
    return Number(total.rows[0]?.n ?? 0);
  }
  // One transaction: the increment holds the row until the pause is written, so two parallel failures cannot both
  // read the same count and skip a pause.
  return withTransaction(pool, async (client) => {
    const result = await client.query<{ failed_count: number }>(
      "update users set failed_count = failed_count + 1 where id = $1 returning failed_count",
      [subject.userId],
    );
    const count = result.rows[0]?.failed_count ?? 0;
    const pause = pauseAfterFailures(count);
    if (pause > 0) {
      await client.query("update users set locked_until = $2 where id = $1", [
        subject.userId,
        new Date(now.getTime() + pause),
      ]);
    }
    return count;
  });
}

/** A successful sign-in forgives the account's failures and ends any pause. */
export async function clearFailedAttempts(
  pool: Pick<Pool, "query">,
  userId: number,
): Promise<void> {
  await pool.query(
    "update users set failed_count = 0, locked_until = null where id = $1 and (failed_count <> 0 or locked_until is not null)",
    [userId],
  );
}

/** Deletes attempts older than the retention; for the periodic job. Returns how many. */
export async function deleteOldAttempts(
  pool: Pick<Pool, "query">,
  now: Date,
): Promise<number> {
  const result = await pool.query("delete from login_attempts where at < $1", [
    new Date(now.getTime() - signinLimits.attemptRetentionMs),
  ]);
  return result.rowCount ?? 0;
}
