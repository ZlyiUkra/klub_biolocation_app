// The one place a password is written for an account that signs in, and the one place an open hand-over of the
// superuser role is closed because credentials or the role changed (T170 of specs/001-self-hosted-club-site; the
// consilium of 2026-10-11, .specify/consilium/2026-10-11-superuser-mechanism.md; security-review-superuser.md section 2).
//
// Why it exists: a request to hand the role over was started with the holder's password and accepted with the target's
// password. If either password changes afterwards (recovery by a code, the server command, the setup door, the account
// page, a temporary password from an admin), the request would still complete 24 hours later on credentials nobody
// holds any more. Before this file the closing lived only inside `moveRole`, and five places wrote the password
// columns by hand, so a sixth would have forgotten it. A source test (`credentials-writes.test.ts`) fails when a
// statement outside this file sets `password_hash`, except the two listed there with the reason.
//
// Decisions that would otherwise look like mistakes:
// - A request is closed when EITHER side's password changes, not only the holder's: the target proved itself with a
//   password that is not the one it holds now.
// - The closing writes an audit row (`handover_closed`, with the reason) in the same transaction, the same row that
//   `completeOne` writes when the situation changed. The role moving closes every open request the same way, with the
//   reason `role_moved`; before 2026-10-11 that happened without a row.
// - `endSessions` is true unless the caller handles sessions itself: the account page keeps the session that changed
//   the password and ends the others (`endOtherSessions`).
// - Failed-attempt counters and the pause are cleared with the password: a new password is a new start.

import { writeAudit, type Queryable } from "./audit.js";

export type CloseReason = "credentials_changed" | "role_moved";

/**
 * Closes the open hand-over requests (there is at most one) that involve one of `userIds`, or every open one when no
 * ids are given. Writes an audit row for each. Runs inside the caller's transaction. Returns how many were closed.
 */
export async function closeOpenHandovers(
  db: Queryable,
  options: { reason: CloseReason; userIds?: number[]; now?: Date },
): Promise<number> {
  const params: unknown[] = [options.now ?? new Date()];
  let scope = "";
  if (options.userIds !== undefined) {
    params.push(options.userIds);
    scope =
      "and (from_user = any($2::bigint[]) or to_user = any($2::bigint[]))";
  }
  const closed = await db.query<{ id: string; to_user: string }>(
    `update handover_requests set cancelled_at = $1
      where completed_at is null and cancelled_at is null ${scope}
  returning id, to_user`,
    params,
  );
  for (const row of closed.rows) {
    await writeAudit(db, {
      actorId: null,
      action: "handover_closed",
      targetKind: "account",
      targetId: Number(row.to_user),
      detail: { reason: options.reason },
    });
  }
  return closed.rowCount ?? 0;
}

export type CredentialsChange = {
  /** The new password hash; the caller hashes before taking any lock. */
  hash: string;
  now?: Date;
  /** True by default; false when the caller keeps the current session and ends the others itself. */
  endSessions?: boolean;
};

/** Sets a new password for the account and closes what acted on the old one. Inside the caller's transaction. */
export async function credentialsChanged(
  client: Queryable,
  userId: number,
  change: CredentialsChange,
): Promise<{ closedHandovers: number }> {
  const now = change.now ?? new Date();
  await client.query(
    `update users
        set password_hash = $2, must_change = false, password_expires_at = null,
            password_changed_at = $3, failed_count = 0, locked_until = null,
            updated_at = clock_timestamp()
      where id = $1`,
    [userId, change.hash, now],
  );
  if (change.endSessions !== false) {
    await client.query("delete from sessions where user_id = $1", [userId]);
  }
  const closedHandovers = await closeOpenHandovers(client, {
    reason: "credentials_changed",
    userIds: [userId],
    now,
  });
  return { closedHandovers };
}
