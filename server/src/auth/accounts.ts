// Accounts: reading one, creating one at sign-up, changing its password (T050 of specs/001-self-hosted-club-site;
// FR-012, FR-012a; tests: server/test/accounts.test.ts). Pure database work: no HTTP and no sessions here, the route
// (routes.ts) joins them.
//
// Decisions that would otherwise look like mistakes:
// - A new account is a guest with no extra rights, whatever the form says: this function takes no status at all, so no
//   caller can pass one (FR-012a: the address is not confirmed by mail until phase 9, so it proves nothing).
// - The address is stored as typed and unique whatever its case (the index of migration 012 decides, and a clash comes
//   back as `email_taken`/`login_taken`: the one place that learns it is the insert itself, so there is no check-then-
//   insert race). A login name is lower-case 3 to 32 characters of a-z 0-9 . _ - and holds no `@`, so it can never be
//   read as another account's address (the edge case of the specification).
// - Saying "this address is already registered" is the owner's choice of 2026-10-11 (variant A): there is no mail to
//   carry a neutral answer, so the answer is the truth and the address limit keeps it from being an oracle.
// - Changing the password is what ends a temporary one: `must_change`, the expiry and the failed counter are all
//   cleared in the same statement as the new hash, so there is no moment where the new password exists beside the
//   old flags. The route renews this session and ends the others afterwards.
// - Audit rows are written for the two events that matter later (an account was created, a password was changed) and
//   never carry a password or a hash.

import type { Pool } from "../db/pool.js";
import { withTransaction } from "../db/pool.js";
import { credentialsChanged } from "../users/credentials.js";
import {
  clearFailedAttempts,
  pauseRemainingSeconds,
  recordFailedAttempt,
  standingAfterFailure,
} from "./limits.js";
import {
  checkPasswordRules,
  hashPassword,
  spendHashingTime,
  verifyPassword,
  type PasswordProblem,
} from "./password.js";

export type Status =
  "guest" | "student" | "expert" | "master" | "metr" | "admin" | "blocked";

/** What the site may know of an account: no hash, no counters. */
export type Account = {
  id: number;
  email: string;
  login: string | null;
  displayName: string;
  status: Status;
  superuser: boolean;
  mustChange: boolean;
  /** For a blocked account: the status of the account that blocked it, so the page can say who closed the access. */
  blockedBy: "admin" | "metr" | null;
  /** The last UTC day (`YYYY-MM-DD`) the account may open the paid lectures, or null (T152, added 2026-10-11). */
  accessUntil: string | null;
};

type AccountRow = {
  id: string | number;
  email: string;
  login: string | null;
  display_name: string;
  status: Status;
  is_superuser: boolean;
  must_change: boolean;
  blocked_by_status: string | null;
  access_until: string | null;
};

// blocked_by_status is the status of the account that blocked this one (a left join on users; null when nobody did).
const accountColumns = `u.id, u.email, u.login, u.display_name, u.status, u.is_superuser, u.must_change,
  b.status as blocked_by_status, to_char(u.access_until, 'YYYY-MM-DD') as access_until`;
// A new account has blocked nobody's hand on it, and an insert has no aliases: its own column list.
const insertedColumns =
  "id, email, login, display_name, status, is_superuser, must_change, null::text as blocked_by_status, null::text as access_until";
const accountFrom = "users u left join users b on b.id = u.blocked_by";

function accountOf(row: AccountRow): Account {
  return {
    id: Number(row.id),
    email: row.email,
    login: row.login,
    displayName: row.display_name,
    status: row.status,
    superuser: row.is_superuser,
    mustChange: row.must_change,
    blockedBy:
      row.blocked_by_status === "admin" || row.blocked_by_status === "metr"
        ? row.blocked_by_status
        : null,
    accessUntil: row.access_until,
  };
}

export async function findAccount(
  pool: Pick<Pool, "query">,
  userId: number,
): Promise<Account | null> {
  const result = await pool.query<AccountRow>(
    `select ${accountColumns} from ${accountFrom} where u.id = $1`,
    [userId],
  );
  const row = result.rows[0];
  return row ? accountOf(row) : null;
}

export type SignUpInput = {
  email: string;
  password: string;
  displayName: string;
  login?: string | null;
};

export type SignUpResult =
  | { ok: true; account: Account }
  | {
      ok: false;
      field: "email" | "password" | "displayName" | "login";
      problem: "invalid" | "taken" | "too_short" | "too_long" | "required";
    };

// The shape the table's check constraint also insists on, so a refusal here is a friendly message and not a 500.
const emailShape = /^[^@\s]+@[^@\s]+$/;
const loginShape = /^[a-z0-9._-]{3,32}$/;
const displayNameMax = 80;

export async function createAccount(
  pool: Pool,
  input: SignUpInput,
  now: Date = new Date(),
): Promise<SignUpResult> {
  const email = input.email.trim();
  if (email === "" || email.length > 254 || !emailShape.test(email)) {
    return { ok: false, field: "email", problem: "invalid" };
  }
  const displayName = input.displayName.trim().replace(/\s+/g, " ");
  if (displayName === "")
    return { ok: false, field: "displayName", problem: "required" };
  if ([...displayName].length > displayNameMax) {
    return { ok: false, field: "displayName", problem: "too_long" };
  }
  const rawLogin = (input.login ?? "").trim().toLowerCase();
  const login = rawLogin === "" ? null : rawLogin;
  if (login !== null && !loginShape.test(login)) {
    return { ok: false, field: "login", problem: "invalid" };
  }
  const rules = checkPasswordRules(input.password);
  if (!rules.ok) {
    return { ok: false, field: "password", problem: rules.problem };
  }

  const hash = await hashPassword(input.password);
  try {
    const result = await pool.query<AccountRow>(
      `insert into users (email, login, display_name, password_hash, password_changed_at)
       values ($1, $2, $3, $4, $5) returning ${insertedColumns}`,
      [email, login, displayName, hash, now],
    );
    const row = result.rows[0];
    if (!row) throw new Error("an account was inserted and not returned");
    const account = accountOf(row);
    await pool.query(
      `insert into audit_log (actor_id, action, target_kind, target_id, detail)
       values ($1, 'account_created', 'account', $1, '{}')`,
      [account.id],
    );
    return { ok: true, account };
  } catch (error) {
    const clash = error as { code?: string; constraint?: string };
    if (clash.code === "23505") {
      if (clash.constraint === "users_login_lower") {
        return { ok: false, field: "login", problem: "taken" };
      }
      return { ok: false, field: "email", problem: "taken" };
    }
    throw error;
  }
}

export type ProfileInput = { displayName?: string; login?: string | null };

export type ProfileResult =
  | { ok: true; account: Account; changed: ("displayName" | "login")[] }
  | {
      ok: false;
      field: "displayName" | "login";
      problem: "invalid" | "taken" | "too_long" | "required";
    };

/**
 * Changes the display name and/or the login name of an account (T146). Added 2026-10-11. The rules are the sign-up's
 * (same constants above, so there is one home for them): a name of 1 to 80 characters with its blanks collapsed, a
 * login of the lower-case shape or none at all (an empty login removes it; the address still signs in). A field that
 * is not in `input` is left as it is, and the email address is not a parameter at all: it waits for phase 9 (FR-012a).
 * The audit row names the fields that changed and never their values.
 */
export async function updateProfile(
  pool: Pool,
  userId: number,
  input: ProfileInput,
): Promise<ProfileResult> {
  const sets: string[] = [];
  const values: unknown[] = [userId];
  const changed: ("displayName" | "login")[] = [];
  if (input.displayName !== undefined) {
    const displayName = input.displayName.trim().replace(/\s+/g, " ");
    if (displayName === "")
      return { ok: false, field: "displayName", problem: "required" };
    if ([...displayName].length > displayNameMax) {
      return { ok: false, field: "displayName", problem: "too_long" };
    }
    values.push(displayName);
    sets.push(`display_name = $${values.length}`);
    changed.push("displayName");
  }
  if (input.login !== undefined) {
    const rawLogin = (input.login ?? "").trim().toLowerCase();
    const login = rawLogin === "" ? null : rawLogin;
    if (login !== null && !loginShape.test(login)) {
      return { ok: false, field: "login", problem: "invalid" };
    }
    values.push(login);
    sets.push(`login = $${values.length}`);
    changed.push("login");
  }
  const current = await findAccount(pool, userId);
  if (!current) throw new Error("the account of a session no longer exists");
  if (sets.length === 0) return { ok: true, account: current, changed };
  try {
    await pool.query(
      `update users set ${sets.join(", ")} where id = $1`,
      values,
    );
  } catch (error) {
    const clash = error as { code?: string; constraint?: string };
    if (clash.code === "23505" && clash.constraint === "users_login_lower") {
      return { ok: false, field: "login", problem: "taken" };
    }
    throw error;
  }
  await pool.query(
    `insert into audit_log (actor_id, action, target_kind, target_id, detail)
     values ($1, 'profile_changed', 'account', $1, $2::jsonb)`,
    [userId, JSON.stringify({ fields: changed })],
  );
  const account = await findAccount(pool, userId);
  if (!account) throw new Error("the account of a session no longer exists");
  return { ok: true, account, changed };
}

export type ChangePasswordResult =
  | { ok: true }
  | {
      ok: false;
      reason: "wrong_current";
      attemptsLeft?: number;
      pauseSeconds?: number;
    }
  | { ok: false; reason: "locked"; retryAfterSeconds: number }
  | { ok: false; reason: "rules"; problem: PasswordProblem | "same" };

/**
 * Changes an account's password after the current one is proved. A wrong current password counts against the account
 * exactly like a wrong sign-in (the owner's choice of 2026-10-11, variant A), so a stolen session cannot be used to
 * guess it without limit; `recordFailure` lets the caller hold the failure against the address too.
 */
export async function changePassword(
  pool: Pool,
  userId: number,
  input: { current: string; next: string },
  context: { now?: Date; recordFailure?: () => void } = {},
): Promise<ChangePasswordResult> {
  const now = context.now ?? new Date();
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
      ? await verifyPassword(input.current, row.password_hash)
      : await spendHashingTime(input.current);
  if (!matches) {
    const count = await recordFailedAttempt(pool, subject, now);
    context.recordFailure?.();
    return {
      ok: false,
      reason: "wrong_current",
      ...standingAfterFailure(count),
    };
  }

  const rules = checkPasswordRules(input.next);
  if (!rules.ok) return { ok: false, reason: "rules", problem: rules.problem };
  // The same password again would keep a temporary one alive in all but name.
  if (input.next.normalize("NFKC") === input.current.normalize("NFKC")) {
    return { ok: false, reason: "rules", problem: "same" };
  }

  const hash = await hashPassword(input.next);
  // Changed 2026-10-11 (T170): the password write has one home, users/credentials.ts, which also closes an open
  // hand-over of the superuser role that was started or accepted with the old password. The route keeps this
  // session and ends the others, so the sessions are not ended here.
  await withTransaction(pool, (client) =>
    credentialsChanged(client, userId, { hash, now, endSessions: false }),
  );
  await clearFailedAttempts(pool, userId);
  await pool.query(
    `insert into audit_log (actor_id, action, target_kind, target_id, detail)
     values ($1, 'password_changed', 'account', $1, '{}')`,
    [userId],
  );
  return { ok: true };
}
