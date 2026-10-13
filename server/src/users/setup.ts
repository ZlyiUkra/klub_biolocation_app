// The setup door: a way to make the first superuser (and, with the emergency switch, a new one) on a hosting with no
// command line (T169 of specs/001-self-hosted-club-site; security-review-superuser.md; the owner's choices of
// 2026-10-11: variant A2, the code in an environment variable, with the emergency switch and a code in the log as the
// fallback). The decision of who may become the superuser stays in superuser.ts (`setupSuperuser`), the only code that
// writes the flag; this file decides only whether the door is open and whether the code typed is the right one.
//
// Decisions that would otherwise look like mistakes:
// - The door is open while no account holds the role. It is open also when ALLOW_SUPERUSER_SETUP=1, the emergency
//   switch: then the new account takes the role and the old holder stays an admin. Both are decided by the state of
//   the database on every request, never remembered, so the moment the first superuser exists the door is shut with
//   no timer and no restart.
// - Where the code comes from, in this order: the SETUP_CODE variable, which the owner writes in the hosting's
//   settings (the one place every hosting has, with no command line and no log reader); or, when it is not set, a
//   code the server makes by itself and prints in its log, renewed every hour while the door is open (the owner's
//   choice of 2026-10-11, with the reasons in tasks.md T169). A code in the settings is refused when it is shorter
//   than 24 characters: the page is public, and a short code would be a password everybody may try.
// - The code is kept in memory and never in the database, never in a response and never in an audit row. What is
//   compared is its SHA-256, in constant time, so the comparison does not tell a wrong guess from a close one.
// - A wrong code, an unknown address, a spent door: one answer for the code (`invalid`) and a plain 404 when the door
//   is shut, so the page is not a way to learn which of them was wrong. Failures are counted like the recovery codes':
//   five an address in fifteen minutes and thirty an hour in all.
// - The hashing time of the password is spent on a failure too, so the clock does not tell a failure from a success.
//
// Changed 2026-10-11 (T170, the consilium of that day; .specify/consilium/2026-10-11-superuser-mechanism.md). The
// paragraph above says the switch opens the door "although a superuser exists"; three limits now stand on it:
// - The switch works only together with SETUP_CODE. With no SETUP_CODE the code is one the server prints in its log,
//   and a log can be read by people who are not the owner (hosting staff, a log shipper): a code that anyone who can
//   read the log may use must never replace a holder. The switch is ignored then, with a line in the log that says so.
// - The switch is one use: after a use the door is shut again until the next start. A settings code that stays valid
//   for any number of uses is a standing key to the role for as long as the switch is left on.
// - The switch lives 30 minutes after the process starts (`emergencyWindowMs`). The owner sets it, restarts, uses it;
//   a switch that is forgotten cannot stay open. Another restart opens a new window.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Pool } from "../db/pool.js";
import { CodeAttemptLimits } from "../auth/limits.js";
import {
  checkPasswordRules,
  hashPassword,
  type PasswordProblem,
} from "../auth/password.js";
import { isAcceptableAddress, setupSuperuser } from "./superuser.js";

/** The shortest code accepted from the settings; the generated one is 128 bits. */
export const minimumSetupCodeLength = 24;
/** How long a generated code lives before the next one is made and printed. */
export const generatedCodeLifetimeMs = 60 * 60_000;
/** How long after the process starts the emergency switch works (the owner's choice of 2026-10-11). */
export const emergencyWindowMs = 30 * 60_000;

export class SetupConfigError extends Error {}

export type SetupOptions = {
  /** The code from SETUP_CODE; undefined when the owner set none. */
  code?: string | undefined;
  /** ALLOW_SUPERUSER_SETUP=1: the door is open although a superuser exists (only with a code from the settings). */
  emergency?: boolean;
  /** Where a line for the owner goes; the server's log. */
  log?: (line: string) => void;
  /** When the process started; the window of the emergency switch counts from it. */
  startedAt?: Date;
};

/** Reads SETUP_CODE and ALLOW_SUPERUSER_SETUP from the environment; a value that cannot be right stops the start. */
export function loadSetupOptions(
  env: NodeJS.ProcessEnv = process.env,
): SetupOptions {
  const raw = env["SETUP_CODE"];
  const code = raw === undefined || raw.trim() === "" ? undefined : raw.trim();
  if (code !== undefined && code.length < minimumSetupCodeLength) {
    throw new SetupConfigError(
      `SETUP_CODE must be at least ${minimumSetupCodeLength} characters (it opens a public page); make it long and random, or remove it to have the server print a code in its log`,
    );
  }
  const flag = env["ALLOW_SUPERUSER_SETUP"];
  if (flag !== undefined && flag !== "" && flag !== "0" && flag !== "1") {
    throw new SetupConfigError(
      `ALLOW_SUPERUSER_SETUP must be 1 or empty, got "${flag}"`,
    );
  }
  return { code, emergency: flag === "1" };
}

const digestOf = (text: string): Buffer =>
  createHash("sha256").update(text).digest();

/** The windows of the route, in memory like the recovery codes' (a single process, research.md section 7). */
// Changed 2026-10-11 (T174): the numbers are `CodeAttemptLimits`'s, shared with the recovery route; separate counters.
export class SetupLimits extends CodeAttemptLimits {}

export class SetupGate {
  readonly mode: "settings" | "generated";
  /** True when the switch is set AND there is a code from the settings; the switch alone is ignored. */
  readonly emergency: boolean;
  /** True when the owner asked for the switch, whether or not it can work. */
  readonly emergencyRequested: boolean;
  readonly limits = new SetupLimits();
  private digest: Buffer | null = null;
  private expiresAt = 0;
  private emergencyUsed = false;
  private warned = false;
  private windowClosedSaid = false;
  private readonly startedAt: number;
  private readonly hasSettingsCode: boolean;
  private readonly log: (line: string) => void;

  constructor(options: SetupOptions = {}) {
    this.emergencyRequested = options.emergency === true;
    this.hasSettingsCode = options.code !== undefined;
    this.emergency = this.emergencyRequested && this.hasSettingsCode;
    this.startedAt = (options.startedAt ?? new Date()).getTime();
    this.log = options.log ?? ((line) => console.log(line));
    if (options.code !== undefined) {
      this.mode = "settings";
      this.digest = digestOf(options.code);
    } else {
      this.mode = "generated";
    }
  }

  /** The switch is on, has not been used and its 30 minutes since the start have not passed. */
  private emergencyOpen(now: Date): boolean {
    return (
      this.emergency &&
      !this.emergencyUsed &&
      now.getTime() < this.startedAt + emergencyWindowMs
    );
  }

  private async hasHolder(pool: Pick<Pool, "query">): Promise<boolean> {
    const holder = await pool.query("select 1 from users where is_superuser");
    return (holder.rowCount ?? 0) > 0;
  }

  /** Whether the page and the route exist now. Read from the database on every call. */
  async isOpen(
    pool: Pick<Pool, "query">,
    now: Date = new Date(),
  ): Promise<boolean> {
    if (this.emergencyOpen(now)) return true;
    return !(await this.hasHolder(pool));
  }

  /** One-time lines at the first tick: what the switch and a leftover code mean on this start. */
  private warnOnce(holder: boolean): void {
    if (this.warned) return;
    this.warned = true;
    const minutes = emergencyWindowMs / 60_000;
    if (this.emergencyRequested && !this.emergency) {
      this.log(
        "SETUP WARNING: ALLOW_SUPERUSER_SETUP=1 is ignored because SETUP_CODE is not set: a code printed in the log must never replace a holder. Set SETUP_CODE (24 characters or more) and restart to use the switch.",
      );
    } else if (this.emergency) {
      this.log(
        `SETUP WARNING: the emergency switch is ON. For ${minutes} minutes after this start the page /auth/setup/ lets whoever holds SETUP_CODE take the superuser role, once. Remove ALLOW_SUPERUSER_SETUP from the settings when done.`,
      );
    } else if (holder && this.hasSettingsCode) {
      this.log(
        "SETUP NOTE: SETUP_CODE is still set although a superuser exists. The page is shut; remove SETUP_CODE from the settings so it is not left lying about.",
      );
    }
  }

  /**
   * Called at start and once a minute. While the door is open: in settings mode it says so once (without the code),
   * in generated mode it makes a code when there is none or the last one is an hour old, and prints it.
   */
  async tick(pool: Pick<Pool, "query">, now: Date = new Date()): Promise<void> {
    const holder = await this.hasHolder(pool);
    this.warnOnce(holder);
    if (
      this.emergency &&
      !this.emergencyUsed &&
      !this.windowClosedSaid &&
      now.getTime() >= this.startedAt + emergencyWindowMs
    ) {
      this.windowClosedSaid = true;
      this.log(
        "SETUP: the 30 minutes of the emergency switch have passed and it was not used; the page is shut. Restart the server to open a new window, or remove ALLOW_SUPERUSER_SETUP.",
      );
    }
    const open = this.emergencyOpen(now) || !holder;
    if (!open) {
      this.digest = this.mode === "settings" ? this.digest : null;
      return;
    }
    if (this.mode === "settings") {
      if (this.expiresAt === 0) {
        this.expiresAt = Number.MAX_SAFE_INTEGER;
        this.log(
          holder
            ? "SETUP: the emergency switch is open - the setup page /auth/setup/ takes the code in SETUP_CODE once."
            : "SETUP: no superuser exists - the setup page /auth/setup/ is open; the code is SETUP_CODE from the settings.",
        );
      }
      return;
    }
    if (this.digest !== null && now.getTime() < this.expiresAt) return;
    const code = [...Array(4)]
      .map(() => randomBytes(4).toString("hex"))
      .join("-");
    this.digest = digestOf(code);
    this.expiresAt = now.getTime() + generatedCodeLifetimeMs;
    this.log(
      `SETUP: no superuser exists, the setup page /auth/setup/ is open. Code (valid one hour, then a new one is printed): ${code}`,
    );
  }

  /** True when `code` is the one the door is waiting for. Constant time, and false when there is none. */
  verify(code: string, now: Date = new Date()): boolean {
    if (this.digest === null) return false;
    if (this.mode === "generated" && now.getTime() >= this.expiresAt) {
      return false;
    }
    const given = digestOf(code.trim());
    return (
      given.length === this.digest.length && timingSafeEqual(given, this.digest)
    );
  }

  /**
   * Forgets a generated code once it has done its work, and shuts the emergency switch for this process. The code of
   * the settings stays the owner's to remove; what ends its power while the switch is on is the use itself.
   */
  spend(): void {
    if (this.emergency) this.emergencyUsed = true;
    if (this.mode === "generated") {
      this.digest = null;
      this.expiresAt = 0;
    }
  }
}

export type RedeemSetupInput = {
  code: string;
  email: string;
  password: string;
  address: string;
};

export type RedeemSetupResult =
  | { ok: true; userId: number; codes: string[]; replaced: boolean }
  | { ok: false; reason: "closed" }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "email" }
  | { ok: false; reason: "password"; problem: PasswordProblem }
  | { ok: false; reason: "limited"; retryAfterSeconds: number };

/** One use of the setup door: checks the limits and the code, then asks superuser.ts to make the account. */
export async function redeemSetup(
  pool: Pool,
  gate: SetupGate,
  input: RedeemSetupInput,
  now: Date = new Date(),
): Promise<RedeemSetupResult> {
  if (!(await gate.isOpen(pool, now))) return { ok: false, reason: "closed" };

  // Changed 2026-10-11 (T171): the global ceiling does not stop a RIGHT code (the same reasoning as the recovery
  // route: the code cannot be guessed online, and the owner must not be locked out by an attacker who keeps the
  // ceiling exhausted). The comparison is in memory, so it is asked before the limit. The per-address pause stays.
  const perAddress = gate.limits.perAddress.check(input.address, now);
  const global = gate.limits.global.check("global", now);
  const rightCode = gate.verify(input.code, now);
  if (!perAddress.allowed || (!global.allowed && !rightCode)) {
    const wait = Math.max(
      perAddress.allowed ? 0 : perAddress.retryAfterSeconds,
      global.allowed ? 0 : global.retryAfterSeconds,
    );
    return { ok: false, reason: "limited", retryAfterSeconds: wait };
  }

  // The fields that say nothing about the code are answered first, in words, and are not counted as failures.
  const email = input.email.trim();
  if (!isAcceptableAddress(email)) return { ok: false, reason: "email" };
  const rules = checkPasswordRules(input.password);
  if (!rules.ok) {
    return { ok: false, reason: "password", problem: rules.problem };
  }

  if (!gate.verify(input.code, now)) {
    gate.limits.perAddress.recordFailure(input.address, now);
    gate.limits.global.recordFailure("global", now);
    // The time a hash would have taken, so a success and a failure are not told apart by the clock.
    await hashPassword(input.password);
    return { ok: false, reason: "invalid" };
  }

  const made = await setupSuperuser(
    pool,
    { email, password: input.password },
    { replace: gate.emergency },
  );
  if (!made.ok) {
    // `exists` is a second caller that got there first, or a door that shut between the two statements.
    if (made.reason === "exists") return { ok: false, reason: "closed" };
    if (made.reason === "email") return { ok: false, reason: "email" };
    return { ok: false, reason: "password", problem: made.problem };
  }
  gate.spend();
  return {
    ok: true,
    userId: made.userId,
    codes: made.codes,
    replaced: made.replaced,
  };
}
