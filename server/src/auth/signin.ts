// Signing in (T050 of specs/001-self-hosted-club-site; research.md sections 5 and 8; tests: server/test/signin.test.ts).
// The function that decides whether a password opens an account. It knows nothing of HTTP, cookies or sessions: the
// route (routes.ts) turns the result into a session and a response, which keeps this file testable against a database
// alone.
//
// One shape for every refusal that must not tell a visitor why (an unknown identifier, a wrong password, an expired
// temporary password and an account with no password all answer `invalid`), and the two refusals that do tell
// something, because they are about the visitor and not about the account (a pause, and too many from one address).
//
// Order of the steps, and why it is this one (OWASP Authentication Cheat Sheet, "Authentication Responses" and
// "Account Lockout"):
// 1. The address limit, before anything is looked up, so a flood from one machine costs the database nothing.
// 2. The pause of the account (or of the unknown identifier, from its own rows), before the password is looked at:
//    a visitor in a pause is refused even with the right password, and an attempt made in a pause is neither
//    recorded nor allowed to extend it.
// 3. The password. When there is nothing to compare against (no such account, no password, an expired temporary
//    one) one computation at today's cost is spent anyway (`spendHashingTime`), so the time of the answer does not
//    tell these cases from a wrong password.
// 4. A failure is held against the address and against the account or identifier; a success forgives the account and,
//    if its hash was made with older parameters, replaces the hash while the password is in hand.
// A blocked account signs in like any other: being blocked is a status, not a lock on the door (owner, 2026-10-11).

import type { Pool } from "../db/pool.js";
import {
  clearFailedAttempts,
  identifierKey,
  pauseRemainingSeconds,
  recordFailedAttempt,
  standingAfterFailure,
  type AddressLimiter,
  type AttemptSubject,
} from "./limits.js";
import {
  hashPassword,
  needsRehash,
  spendHashingTime,
  verifyPassword,
} from "./password.js";

/** What the visitor typed in the first field: the address, or the login name. */
export type Identifier = { kind: "email" | "login"; value: string };

/** An address contains `@`; a login name never can (users.login's check), so the presence of `@` decides. */
export function classifyIdentifier(raw: string): Identifier {
  const value = raw.trim().toLowerCase();
  return { kind: value.includes("@") ? "email" : "login", value };
}

export type SignInResult =
  | {
      ok: true;
      userId: number;
      status:
        | "guest"
        | "student"
        | "expert"
        | "master"
        | "metr"
        | "admin"
        | "blocked";
      /** True after a temporary password: the session is limited to the change-password route. */
      mustChange: boolean;
    }
  /** Unknown identifier, wrong password, expired temporary password, no password at all: one answer. */
  | {
      ok: false;
      reason: "invalid";
      /** Tries left before a pause, told from the third failure of a step on (T053). */
      attemptsLeft?: number;
      /** Set when this very failure started a pause: the visitor is told at once how long. */
      pauseSeconds?: number;
    }
  /** The account is in a pause; the visitor is told how long, which does not reveal whether it exists. */
  | { ok: false; reason: "locked"; retryAfterSeconds: number }
  /** The address has made too many failed attempts. */
  | { ok: false; reason: "too_many"; retryAfterSeconds: number };

type AccountRow = {
  id: string | number;
  status: SignInResultOk["status"];
  password_hash: string | null;
  must_change: boolean;
  password_expired: boolean;
};
type SignInResultOk = Extract<SignInResult, { ok: true }>;

export async function signIn(
  pool: Pool,
  input: { identifier: string; password: string; address: string },
  context: { limiter: AddressLimiter; now?: Date },
): Promise<SignInResult> {
  const now = context.now ?? new Date();
  const identifier = classifyIdentifier(input.identifier);

  const gate = context.limiter.check(input.address, now);
  if (!gate.allowed) {
    return {
      ok: false,
      reason: "too_many",
      retryAfterSeconds: gate.retryAfterSeconds,
    };
  }

  // The expiry is decided in the database from the same `now`, so a test that moves the clock moves it for both.
  const found = await pool.query<AccountRow>(
    identifier.kind === "email"
      ? `select id, status, password_hash, must_change,
                coalesce(password_expires_at <= $2, false) as password_expired
           from users where lower(email) = $1`
      : `select id, status, password_hash, must_change,
                coalesce(password_expires_at <= $2, false) as password_expired
           from users where lower(login) = $1`,
    [identifier.value, now],
  );
  const account = found.rows[0];

  // A pause is held against the account when there is one, and against a hash of the typed text when there is not,
  // so that the two are paused by the same rule and the pause itself tells a visitor nothing.
  const subject: AttemptSubject = account
    ? { kind: "account", userId: Number(account.id) }
    : {
        kind: "identifier",
        hash: identifierKey(`${identifier.kind}:${identifier.value}`),
      };
  const left = await pauseRemainingSeconds(pool, subject, now);
  if (left > 0) {
    return { ok: false, reason: "locked", retryAfterSeconds: left };
  }

  const usable =
    account !== undefined &&
    account.password_hash !== null &&
    !account.password_expired;
  const matches = usable
    ? await verifyPassword(input.password, account.password_hash as string)
    : await spendHashingTime(input.password);

  if (!matches || !account) {
    const count = await recordFailedAttempt(pool, subject, now);
    context.limiter.recordFailure(input.address, now);
    return { ok: false, reason: "invalid", ...standingAfterFailure(count) };
  }

  await clearFailedAttempts(pool, Number(account.id));
  const stored = account.password_hash as string;
  if (needsRehash(stored)) {
    // The parameters have moved since this hash was made; the plain password is in hand now and never again.
    await pool.query("update users set password_hash = $2 where id = $1", [
      account.id,
      await hashPassword(input.password),
    ]);
  }
  return {
    ok: true,
    userId: Number(account.id),
    status: account.status,
    mustChange: account.must_change,
  };
}
