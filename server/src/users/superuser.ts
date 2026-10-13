// The superuser: the one account that holds the role, and the only code that writes `users.is_superuser` (T061, T066 of
// specs/001-self-hosted-club-site; security-review-superuser.md; tests: server/test/superuser.test.ts and
// superuser-writes.test.ts).
//
// The role moves in exactly three ways (review, section 2): the server command (`create`, `set-password`, `hand-over`
// of src/cli/superuser-cli.ts, whose authority is access to the server), an accepted handover (handover.ts) and a
// recovery code (recovery.ts, which only sets a password and never moves the role). Everything that sets or clears the
// flag goes through `moveRole` below, and a source test fails if a statement elsewhere writes the column.
//
// Decisions that would otherwise look like mistakes:
// - `create` makes an account or promotes the one that exists, a guest included (the owner's choice, 2026-10-11): the
//   person who holds the server decides, and the account is an admin from then on. A blocked account is lifted by it.
// - `hand-over` from the command goes to ANY existing account, which becomes an admin as part of the move (the owner's
//   choice, 2026-10-11): it is the emergency path, and requiring the target to be an admin first would make it harder
//   exactly when it is needed. The handover started from the page keeps the stricter rule (handover.ts).
// - The role moves in one transaction: the old flag is cleared before the new one is set, the unique index is never
//   violated and never leaves the site with no superuser, every session of both accounts ends (T11 of the review),
//   the old holder's unspent recovery codes are void (they were a key to a role it no longer holds), and an open
//   handover request is closed.
// - `set-password` ends every session of the superuser and leaves the recovery codes as they are (the owner's choice,
//   2026-10-11): a new set is made from the page after signing in, with the password typed again.
// - Every step writes an audit row with no actor: the server command acts as nobody signed in.
//
// Added 2026-10-11 (T169, T170): "exactly three ways" above is out of date; there are four, the fourth being the setup
// door (`setupSuperuser` below, with setup.ts deciding that the door is open). SUPERUSER.md is the document that says
// which way for which situation, and `superuser-ways.ts` the table the tests hold against the code. Two more rules
// that stand on every way: the password is written only by credentials.ts, and a changed password or a moved role
// closes an open hand-over; accounts are locked in id order through `lockAccounts`.

import type { Pool } from "../db/pool.js";
import { withTransaction } from "../db/pool.js";
import {
  checkPasswordRules,
  hashPassword,
  type PasswordProblem,
} from "../auth/password.js";
import { writeAudit, type Queryable } from "./audit.js";
// Added 2026-10-11 (T170): the password write and the closing of an open hand-over have one home, credentials.ts.
import { closeOpenHandovers, credentialsChanged } from "./credentials.js";
import { issueRecoverySet, unspentCodeCount } from "./recovery.js";

const emailShape = /^[^@\s]+@[^@\s]+$/;

/**
 * Whether `email` may name the superuser's account. Added 2026-10-11 (T174): the same three conditions were written in
 * `createSuperuser`, in `setupSuperuser` and in the setup door's own check; they are one function now.
 */
export function isAcceptableAddress(email: string): boolean {
  const trimmed = email.trim();
  return trimmed !== "" && trimmed.length <= 254 && emailShape.test(trimmed);
}

export type CreateResult =
  | { ok: true; userId: number; promoted: boolean; codes: string[] }
  | { ok: false; reason: "exists" }
  | { ok: false; reason: "email" }
  | { ok: false; reason: "password"; problem: PasswordProblem };

/** Makes `email` the superuser, creating the account when there is none. Refuses when a superuser already exists. */
export async function createSuperuser(
  pool: Pool,
  input: { email: string; password: string },
): Promise<CreateResult> {
  const email = input.email.trim();
  if (!isAcceptableAddress(email)) return { ok: false, reason: "email" };
  const rules = checkPasswordRules(input.password);
  if (!rules.ok)
    return { ok: false, reason: "password", problem: rules.problem };
  const hash = await hashPassword(input.password);
  // Changed 2026-10-11 (T169): with no holder the lock below locks nothing, so two creations at once (two callers of the
  // setup door) both pass it and the second meets the unique index. That is the guard working, and it is the answer
  // "exists", not a failure of the request.
  try {
    return await createInTransaction(pool, email, hash);
  } catch (error) {
    if (isOneSuperuserViolation(error)) return { ok: false, reason: "exists" };
    throw error;
  }
}

function isOneSuperuserViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505" &&
    "constraint" in error &&
    error.constraint === "users_one_superuser"
  );
}

async function createInTransaction(
  pool: Pool,
  email: string,
  hash: string,
): Promise<CreateResult> {
  return withTransaction(pool, async (client): Promise<CreateResult> => {
    const existing = await client.query(
      "select id from users where is_superuser for update",
    );
    if ((existing.rowCount ?? 0) > 0) return { ok: false, reason: "exists" };

    const account = await client.query<{ id: string; status: string }>(
      "select id, status from users where lower(email) = lower($1) for update",
      [email],
    );
    let userId: number;
    let promoted: boolean;
    if (account.rows[0]) {
      userId = Number(account.rows[0].id);
      promoted = true;
      // Changed 2026-10-11 (T170): the password columns, the sessions and the closing of an open hand-over are
      // credentials.ts's; this statement keeps only the status and the flag.
      await client.query(
        `update users
            set status = 'admin', is_superuser = true, blocked_by = null, blocked_at = null,
                updated_at = clock_timestamp()
          where id = $1`,
        [userId],
      );
      await credentialsChanged(client, userId, { hash });
    } else {
      promoted = false;
      const inserted = await client.query<{ id: string }>(
        `insert into users (email, display_name, status, is_superuser, password_hash, password_changed_at)
         values ($1, $2, 'admin', true, $3, now()) returning id`,
        [email, email.split("@")[0] ?? "", hash],
      );
      userId = Number(inserted.rows[0]!.id);
    }
    // Whatever sessions the account had are from before it held the role: `credentialsChanged` above ended them for
    // an account that existed (changed 2026-10-11, T170); a new account has none.
    const codes = await issueRecoverySet(client, userId);
    await writeAudit(client, {
      actorId: null,
      action: "superuser_created",
      targetKind: "account",
      targetId: userId,
      detail: {
        promoted,
        from: promoted ? (account.rows[0]?.status ?? null) : null,
      },
    });
    return { ok: true, userId, promoted, codes };
  });
}

export type SetPasswordResult =
  | { ok: true; userId: number }
  | { ok: false; reason: "none" }
  | { ok: false; reason: "password"; problem: PasswordProblem };

/** A new password for the superuser, from the server command. Ends every session of the account. */
export async function setSuperuserPassword(
  pool: Pool,
  password: string,
): Promise<SetPasswordResult> {
  const rules = checkPasswordRules(password);
  if (!rules.ok)
    return { ok: false, reason: "password", problem: rules.problem };
  const hash = await hashPassword(password);
  return withTransaction(pool, async (client): Promise<SetPasswordResult> => {
    const found = await client.query<{ id: string }>(
      "select id from users where is_superuser for update",
    );
    const row = found.rows[0];
    if (!row) return { ok: false, reason: "none" };
    const userId = Number(row.id);
    // Changed 2026-10-11 (T170): one function writes the password, ends the sessions and closes an open hand-over.
    const { closedHandovers } = await credentialsChanged(client, userId, {
      hash,
    });
    await writeAudit(client, {
      actorId: null,
      action: "superuser_password_set",
      targetKind: "account",
      targetId: userId,
      detail: { via: "command", closedHandovers },
    });
    return { ok: true, userId };
  });
}

/**
 * Moves the role from `fromId` to `toId` inside the caller's transaction, and is the only place that writes the flag.
 * Both rows must already be locked by the caller. The old holder stays an admin.
 */
export async function moveRole(
  client: Queryable,
  fromId: number,
  toId: number,
): Promise<void> {
  await client.query(
    "update users set is_superuser = false, updated_at = clock_timestamp() where id = $1 and is_superuser",
    [fromId],
  );
  await client.query(
    `update users
        set is_superuser = true, status = 'admin', blocked_by = null, blocked_at = null,
            updated_at = clock_timestamp()
      where id = $1`,
    [toId],
  );
  await client.query("delete from sessions where user_id = any($1::bigint[])", [
    [fromId, toId],
  ]);
  await client.query(
    `update recovery_codes set voided_at = now()
      where user_id = $1 and used_at is null and voided_at is null`,
    [fromId],
  );
  // Changed 2026-10-11 (T170): the same closing as a changed password, with its audit row; it was silent before.
  await closeOpenHandovers(client, { reason: "role_moved" });
}

/**
 * Locks the given accounts in ascending id order and says who holds the role and with what status (T170, F7 of the
 * consilium of 2026-10-11). PostgreSQL's advice against deadlocks is a consistent lock order everywhere (explicit
 * locking, "Deadlocks"); the statement `where id in (...) for update` without an ORDER BY leaves the order to the
 * plan. Every path that takes two accounts takes them through here.
 */
export async function lockAccounts(
  client: Queryable,
  ids: number[],
): Promise<Map<number, { isSuperuser: boolean; status: string }>> {
  const rows = await client.query<{
    id: string;
    is_superuser: boolean;
    status: string;
  }>(
    `select id, is_superuser, status from users
      where id = any($1::bigint[]) order by id for update`,
    [ids],
  );
  return new Map(
    rows.rows.map((r) => [
      Number(r.id),
      { isSuperuser: r.is_superuser, status: r.status },
    ]),
  );
}

export type HandOverResult =
  | { ok: true; fromId: number; toId: number }
  | { ok: false; reason: "none" | "missing" | "same" };

/** The server command's hand-over: instant, to any existing account, which becomes an admin as part of the move. */
export async function handOverNow(
  pool: Pool,
  email: string,
): Promise<HandOverResult> {
  return withTransaction(pool, async (client): Promise<HandOverResult> => {
    // Changed 2026-10-11 (T170): both rows are named first and then locked together in id order (`lockAccounts`),
    // so two paths that take the same pair cannot wait for each other. The holder is checked again once locked.
    const current = await client.query<{ id: string }>(
      "select id from users where is_superuser",
    );
    const from = current.rows[0];
    if (!from) return { ok: false, reason: "none" };
    const target = await client.query<{ id: string }>(
      "select id from users where lower(email) = lower($1)",
      [email.trim()],
    );
    const to = target.rows[0];
    if (!to) return { ok: false, reason: "missing" };
    const fromId = Number(from.id);
    const toId = Number(to.id);
    if (fromId === toId) return { ok: false, reason: "same" };
    const locked = await lockAccounts(client, [fromId, toId]);
    if (locked.get(fromId)?.isSuperuser !== true || !locked.has(toId)) {
      return { ok: false, reason: "none" };
    }
    await moveRole(client, fromId, toId);
    await writeAudit(client, {
      actorId: null,
      action: "superuser_handed_over",
      targetKind: "account",
      targetId: toId,
      detail: { from: fromId, via: "command" },
    });
    return { ok: true, fromId, toId };
  });
}

export type SuperuserStatus = {
  superuser: { id: number; email: string; displayName: string } | null;
  unspentCodes: number;
  openRequest: {
    toEmail: string;
    createdAt: string;
    expiresAt: string;
    acceptedAt: string | null;
    effectiveAt: string | null;
  } | null;
};

/** Who holds the role and whether a handover is open: names, never a secret. For the status command. */
export async function superuserStatus(pool: Pool): Promise<SuperuserStatus> {
  const holder = await pool.query<{
    id: string;
    email: string;
    display_name: string;
  }>("select id, email, display_name from users where is_superuser");
  const row = holder.rows[0];
  if (!row) return { superuser: null, unspentCodes: 0, openRequest: null };
  const userId = Number(row.id);
  const open = await pool.query<{
    email: string;
    created_at: Date;
    expires_at: Date;
    accepted_at: Date | null;
    effective_at: Date | null;
  }>(
    `select u.email, h.created_at, h.expires_at, h.accepted_at, h.effective_at
       from handover_requests h join users u on u.id = h.to_user
      where h.completed_at is null and h.cancelled_at is null`,
  );
  const request = open.rows[0];
  return {
    superuser: { id: userId, email: row.email, displayName: row.display_name },
    unspentCodes: await unspentCodeCount(pool, userId),
    openRequest: request
      ? {
          toEmail: request.email,
          createdAt: request.created_at.toISOString(),
          expiresAt: request.expires_at.toISOString(),
          acceptedAt: request.accepted_at?.toISOString() ?? null,
          effectiveAt: request.effective_at?.toISOString() ?? null,
        }
      : null,
  };
}

export type SetupSuperuserResult =
  | {
      ok: true;
      userId: number;
      promoted: boolean;
      codes: string[];
      /** True when an existing holder was replaced (the emergency switch), false for a first superuser. */
      replaced: boolean;
    }
  | { ok: false; reason: "exists" }
  | { ok: false; reason: "email" }
  | { ok: false; reason: "password"; problem: PasswordProblem };

/**
 * The setup door's step (T169; setup.ts decides that the door is open and the code is right). With no superuser it is
 * `createSuperuser`. With `replace` and a holder it is the emergency path: the account of `email` (made if it does not
 * exist, promoted if it does) takes the role, the old holder stays an admin, every session of both ends, the old
 * holder's unspent recovery codes are void, and an open handover request is closed - the same move as a handover
 * (`moveRole`), with a password and a fresh set of codes for the new holder. Typing the holder's own address sets
 * a new password and a fresh set of codes and moves nothing.
 */
export async function setupSuperuser(
  pool: Pool,
  input: { email: string; password: string },
  options: { replace: boolean },
): Promise<SetupSuperuserResult> {
  const holderNow = options.replace
    ? await pool.query("select 1 from users where is_superuser")
    : null;
  if (holderNow === null || (holderNow.rowCount ?? 0) === 0) {
    const created = await createSuperuser(pool, input);
    return created.ok ? { ...created, replaced: false } : created;
  }

  const email = input.email.trim();
  if (!isAcceptableAddress(email)) return { ok: false, reason: "email" };
  const rules = checkPasswordRules(input.password);
  if (!rules.ok)
    return { ok: false, reason: "password", problem: rules.problem };
  const hash = await hashPassword(input.password);
  return withTransaction(
    pool,
    async (client): Promise<SetupSuperuserResult> => {
      // Changed 2026-10-11 (T170): the holder and the target are named first and locked together in id order, the
      // holder is checked again once locked, and the password goes through credentials.ts.
      const holder = await client.query<{ id: string }>(
        "select id from users where is_superuser",
      );
      const from = holder.rows[0];
      // The role was given away between the two statements: the caller starts again and takes the ordinary path.
      if (!from) return { ok: false, reason: "exists" };
      const fromId = Number(from.id);
      const target = await client.query<{ id: string }>(
        "select id from users where lower(email) = lower($1)",
        [email],
      );
      const known = target.rows[0] ? Number(target.rows[0].id) : null;
      const locked = await lockAccounts(
        client,
        known === null ? [fromId] : [fromId, known],
      );
      if (locked.get(fromId)?.isSuperuser !== true) {
        return { ok: false, reason: "exists" };
      }
      let toId: number;
      let promoted: boolean;
      if (known !== null && locked.has(known)) {
        toId = known;
        promoted = true;
        await credentialsChanged(client, toId, { hash });
      } else {
        promoted = false;
        const inserted = await client.query<{ id: string }>(
          `insert into users (email, display_name, status, password_hash, password_changed_at)
           values ($1, $2, 'admin', $3, now()) returning id`,
          [email, email.split("@")[0] ?? "", hash],
        );
        toId = Number(inserted.rows[0]!.id);
      }
      const sameAccount = toId === fromId;
      if (!sameAccount) await moveRole(client, fromId, toId);
      const codes = await issueRecoverySet(client, toId);
      // Changed 2026-10-11 (T170): typing the holder's own address moves nothing, so it is recorded as a password
      // set through the door, not as a replacement.
      await writeAudit(client, {
        actorId: null,
        action: sameAccount
          ? "superuser_password_set"
          : "superuser_setup_replaced",
        targetKind: "account",
        targetId: toId,
        detail: sameAccount
          ? { via: "setup_door" }
          : { from: fromId, promoted },
      });
      return {
        ok: true,
        userId: toId,
        promoted,
        codes,
        replaced: !sameAccount,
      };
    },
  );
}
