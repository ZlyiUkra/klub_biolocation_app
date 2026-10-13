// "Type your password again": the check every sensitive step of the superuser's pages makes (T068, T069 of
// specs/001-self-hosted-club-site; security-review-superuser.md section 4, mitigation 5).
//
// It is the same rule as the current password of a password change (auth/accounts.ts `changePassword`): a pause in
// force is answered before the password is looked at, a wrong password is held against the ACCOUNT and earns the same
// pauses as a wrong sign-in, and the wrong answer tells how many tries are left. So a stolen session cannot be used to
// guess the password faster than a stranger at the sign-in form could, and a person who mistypes is told when to stop.
//
// A success does not clear the account's failure count: forgiving failures is what a real sign-in does (signin.ts),
// and a check that clears them would let one correct answer reset the counter in the middle of a guessing run.

import type { Pool } from "../db/pool.js";
import {
  pauseRemainingSeconds,
  recordFailedAttempt,
  standingAfterFailure,
} from "../auth/limits.js";
import { spendHashingTime, verifyPassword } from "../auth/password.js";

export type ReauthResult =
  | { ok: true }
  | { ok: false; reason: "locked"; retryAfterSeconds: number }
  | {
      ok: false;
      reason: "wrong";
      attemptsLeft?: number;
      pauseSeconds?: number;
    };

export async function checkPasswordAgain(
  pool: Pool,
  userId: number,
  password: string,
  now: Date = new Date(),
): Promise<ReauthResult> {
  const subject = { kind: "account", userId } as const;
  const left = await pauseRemainingSeconds(pool, subject, now);
  if (left > 0) return { ok: false, reason: "locked", retryAfterSeconds: left };
  const row = (
    await pool.query<{ password_hash: string | null }>(
      "select password_hash from users where id = $1",
      [userId],
    )
  ).rows[0];
  const matches =
    row?.password_hash != null
      ? await verifyPassword(password, row.password_hash)
      : await spendHashingTime(password);
  if (matches) return { ok: true };
  const count = await recordFailedAttempt(pool, subject, now);
  return { ok: false, reason: "wrong", ...standingAfterFailure(count) };
}
