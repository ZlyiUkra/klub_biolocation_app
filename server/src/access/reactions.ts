// The rows of the reactions (T186 of specs/001-self-hosted-club-site; migration 022; contracts/http-api.md "Comments";
// tests: server/test/reactions.test.ts). The routes are in server/src/comments/reactions.ts; this file is the only
// reader of `reactions`, next to the only reader of `comments` (access/comments.ts), and it knows nothing of who may
// react: the route asks `entry_view` and `person_lecture_access` (through access/comments.ts) before it calls anything
// here.
//
// Decisions that would otherwise look like mistakes:
// - The kind is a plain string here. The list of the six is `reactionKinds` in server/src/comments/routes.ts and the
//   route refuses anything else before a function of this file runs; the check constraint of migration 022 is the net
//   behind it. Keeping the list out of this file keeps the dependency pointing one way (routes ask access).
// - Setting is one statement: an insert that becomes an update of the same row when the account already reacted. The
//   primary key makes it atomic under parallel requests (PostgreSQL's INSERT ... ON CONFLICT DO UPDATE guarantees one
//   of the two outcomes), and the `where` clause leaves the row untouched, `updated_at` included, when the kind is the
//   one already stored, so repeating a request changes nothing.
// - The counts and the viewer's own kind come from one query, so they are one snapshot.

import type { Pool } from "../db/pool.js";

/** What is stored under one entry: the number of reactions per kind and the viewer's own kind, if any. */
export type StoredReactions = {
  byKind: Record<string, number>;
  mine: string | null;
};

/** The reactions of an entry; `userId` is the viewer's account, or null for a signed-out visitor (no `mine`). */
export async function readReactions(
  pool: Pool,
  entryId: number,
  userId: number | null,
): Promise<StoredReactions> {
  const result = await pool.query<{
    kind: string;
    n: number;
    mine: boolean | null;
  }>(
    `select kind, count(*)::int as n, coalesce(bool_or(user_id = $2::bigint), false) as mine
       from reactions
      where entry_id = $1
      group by kind`,
    [entryId, userId],
  );
  const byKind: Record<string, number> = {};
  let mine: string | null = null;
  for (const row of result.rows) {
    byKind[row.kind] = row.n;
    if (row.mine === true) mine = row.kind;
  }
  return { byKind, mine };
}

/** Gives the account's reaction, or changes its kind; the same kind again changes nothing. */
export async function setReaction(
  pool: Pool,
  entryId: number,
  userId: number,
  kind: string,
): Promise<void> {
  await pool.query(
    `insert into reactions (entry_id, user_id, kind) values ($1, $2, $3)
     on conflict (entry_id, user_id) do update
       set kind = excluded.kind, updated_at = clock_timestamp()
       where reactions.kind <> excluded.kind`,
    [entryId, userId, kind],
  );
}

/** Takes the account's reaction back; there is nothing to do when it has none. */
export async function removeReaction(
  pool: Pool,
  entryId: number,
  userId: number,
): Promise<void> {
  await pool.query(
    "delete from reactions where entry_id = $1 and user_id = $2",
    [entryId, userId],
  );
}
