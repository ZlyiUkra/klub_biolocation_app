// The rows of the comments and who may see or touch them (T106 of specs/001-self-hosted-club-site; migration 021;
// contracts/http-api.md "Comments"; tests: server/test/comments.test.ts). The routes are in server/src/comments/
// routes.ts; this file is the only reader of `comments` and the only place that asks `entry_view` for them, and it lives
// in the access module because deciding which entry a viewer may see is this folder's job (constitution III).
//
// Decisions that would otherwise look like mistakes:
// - Every function takes the entry's visibility into account itself, through `entry_view`: an entry the viewer may not
//   see is "not there" for reading, writing, changing, deleting, hiding and restoring alike, an editor included (a
//   draft is shown through the preview route). No caller can forget the check, because there is no function without it.
// - "Not found" and "not yours" are one answer (`null`), so that a comment's existence is not told to anyone who may
//   not touch it. The one distinct answer is `late`: the author sees their own comment, so they are told that its day
//   is over.
// - The author's day is measured by the database clock against `created_at`, with the length passed in by the route
//   (`commentLimits.editWindowMs`), so there is one clock and one number.
// - The writer rule is `person_lecture_access` (migration 021), the person half of the lecture rule; this file only asks
//   it, so "who writes" and "who opens a paid lecture" cannot drift.
// - Writing is serialised per author by a row lock on the author, so two parallel posts cannot both pass the cap of
//   one entry.

import type { Pool } from "../db/pool.js";
import { withTransaction } from "../db/pool.js";
import { writeAudit } from "../users/audit.js";
import type { Viewer } from "./entries.js";

export type EntryKind = "post" | "video";

/** A comment as the route answers it; `hidden` is set only for an editor. */
export type CommentJson = {
  id: number;
  author: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  mine: boolean;
  hidden?: boolean;
};

type Row = {
  id: string | number;
  author: string;
  body: string;
  created_at: Date;
  edited_at: Date | null;
  mine: boolean;
  hidden: boolean;
};

const isEditor = (viewer: Viewer): boolean =>
  viewer.status === "metr" || viewer.status === "admin";

function describe(row: Row, editor: boolean): CommentJson {
  const out: CommentJson = {
    id: Number(row.id),
    author: row.author,
    body: row.body,
    createdAt: row.created_at.toISOString(),
    editedAt: row.edited_at === null ? null : row.edited_at.toISOString(),
    mine: row.mine,
  };
  if (editor) out.hidden = row.hidden;
  return out;
}

const columns = `c.id, u.display_name as author, c.body, c.created_at, c.edited_at,
                 coalesce(c.author_id = $2::bigint, false) as mine, (c.hidden_at is not null) as hidden`;

/** The most one answer carries; a thread is read whole, and no entry of the club comes near it. */
const threadCap = 500;

/** The id of the entry when the viewer may see it at all (`entry_view` is not `none`), else null. */
export async function visibleEntryId(
  pool: Pool,
  viewer: Viewer,
  kind: EntryKind,
  slug: string,
): Promise<number | null> {
  const result = await pool.query<{ id: string | number }>(
    `select e.id from entries e
      where e.kind = $1 and e.slug = $2
        and entry_view($3::bigint, $4::text, e.id) <> 'none'`,
    [kind, slug, viewer.userId, viewer.status],
  );
  const row = result.rows[0];
  return row === undefined ? null : Number(row.id);
}

/** The thread of an entry, newest first; hidden comments only for an editor, deleted ones for nobody. */
export async function listComments(
  pool: Pool,
  viewer: Viewer,
  entryId: number,
): Promise<CommentJson[]> {
  const editor = isEditor(viewer);
  const result = await pool.query<Row>(
    `select ${columns}
       from comments c join users u on u.id = c.author_id
      where c.entry_id = $1 and c.deleted_at is null and ($3::boolean or c.hidden_at is null)
      order by c.created_at desc, c.id desc
      limit ${threadCap}`,
    [entryId, viewer.userId, editor],
  );
  return result.rows.map((row) => describe(row, editor));
}

/** What the person may do with the paid lectures, and so with comments and reactions: the rule of migration 021. */
export async function personAccess(
  pool: Pool,
  userId: number,
): Promise<"open" | "guest" | "no_access" | "blocked"> {
  const result = await pool.query<{
    access: "open" | "guest" | "no_access" | "blocked";
  }>("select person_lecture_access($1::bigint) as access", [userId]);
  return result.rows[0]?.access ?? "guest";
}

export type WriteResult =
  { ok: true; comment: CommentJson } | { ok: false; reason: "cap" };

/** Stores a comment, unless the author already has `maxPerEntry` (not deleted) under this entry. */
export async function writeComment(
  pool: Pool,
  viewer: Viewer & { userId: number },
  entryId: number,
  body: string,
  maxPerEntry: number,
): Promise<WriteResult> {
  return withTransaction(pool, async (client) => {
    // Serialise this author's writes: the count and the insert below are one decision.
    await client.query("select id from users where id = $1 for update", [
      viewer.userId,
    ]);
    const count = await client.query<{ n: number }>(
      `select count(*)::int as n from comments
        where entry_id = $1 and author_id = $2 and deleted_at is null`,
      [entryId, viewer.userId],
    );
    if ((count.rows[0]?.n ?? 0) >= maxPerEntry) {
      return { ok: false as const, reason: "cap" as const };
    }
    const inserted = await client.query<{ id: string | number }>(
      `insert into comments (entry_id, author_id, body) values ($1, $2, $3) returning id`,
      [entryId, viewer.userId, body],
    );
    const id = Number(inserted.rows[0]!.id);
    const row = await client.query<Row>(
      `select ${columns} from comments c join users u on u.id = c.author_id where c.id = $1`,
      [id, viewer.userId],
    );
    return {
      ok: true as const,
      comment: describe(row.rows[0]!, isEditor(viewer)),
    };
  });
}

type Found = {
  id: number;
  entryId: number;
  authorId: number;
  hidden: boolean;
  young: boolean;
};

/** One comment that is not deleted, on an entry the viewer may see; `young` is whether its day is not over. */
async function findTouchable(
  db: Pick<Pool, "query">,
  viewer: Viewer,
  commentId: number,
  windowMs: number,
): Promise<Found | null> {
  const result = await db.query<{
    id: string | number;
    entry_id: string | number;
    author_id: string | number;
    hidden: boolean;
    young: boolean;
  }>(
    `select c.id, c.entry_id, c.author_id, (c.hidden_at is not null) as hidden,
            (c.created_at > clock_timestamp() - ($3::bigint * interval '1 millisecond')) as young
       from comments c
      where c.id = $1 and c.deleted_at is null
        and entry_view($2::bigint, $4::text, c.entry_id) <> 'none'`,
    [commentId, viewer.userId, windowMs, viewer.status],
  );
  const row = result.rows[0];
  if (row === undefined) return null;
  return {
    id: Number(row.id),
    entryId: Number(row.entry_id),
    authorId: Number(row.author_id),
    hidden: row.hidden,
    young: row.young,
  };
}

export type OwnResult =
  | { ok: true; comment: CommentJson }
  | { ok: false; reason: "missing" | "late" };

/**
 * Changes the text of the viewer's own comment within its day. A comment that is someone else's, hidden, deleted or on
 * an entry the viewer may not see is "missing"; after the day it is "late".
 */
export async function changeOwnComment(
  pool: Pool,
  viewer: Viewer & { userId: number },
  commentId: number,
  body: string,
  windowMs: number,
): Promise<OwnResult> {
  const found = await findTouchable(pool, viewer, commentId, windowMs);
  if (found === null || found.authorId !== viewer.userId || found.hidden) {
    return { ok: false, reason: "missing" };
  }
  if (!found.young) return { ok: false, reason: "late" };
  await pool.query(
    "update comments set body = $2, edited_at = clock_timestamp() where id = $1",
    [commentId, body],
  );
  const row = await pool.query<Row>(
    `select ${columns} from comments c join users u on u.id = c.author_id where c.id = $1`,
    [commentId, viewer.userId],
  );
  return {
    ok: true,
    comment: describe(row.rows[0]!, isEditor(viewer)),
  };
}

/** Deletes (softly) the viewer's own comment within its day; the same three answers as a change. */
export async function deleteOwnComment(
  pool: Pool,
  viewer: Viewer & { userId: number },
  commentId: number,
  windowMs: number,
): Promise<{ ok: true } | { ok: false; reason: "missing" | "late" }> {
  const found = await findTouchable(pool, viewer, commentId, windowMs);
  if (found === null || found.authorId !== viewer.userId || found.hidden) {
    return { ok: false, reason: "missing" };
  }
  if (!found.young) return { ok: false, reason: "late" };
  await pool.query(
    "update comments set deleted_at = clock_timestamp() where id = $1 and deleted_at is null",
    [commentId],
  );
  return { ok: true };
}

/**
 * Hides or restores a comment, for a metr or an admin. A repeat is the same answer and writes no second audit row;
 * the audit row is part of the change and carries the comment's id, never its text.
 */
export async function moderateComment(
  pool: Pool,
  viewer: Viewer & { userId: number },
  commentId: number,
  action: "hide" | "restore",
  addressPrefix: string,
): Promise<CommentJson | null> {
  if (!isEditor(viewer)) return null;
  return withTransaction(pool, async (client) => {
    const found = await findTouchable(client, viewer, commentId, 0);
    if (found === null) return null;
    const wantHidden = action === "hide";
    if (found.hidden !== wantHidden) {
      if (wantHidden) {
        await client.query(
          "update comments set hidden_by = $2, hidden_at = clock_timestamp() where id = $1",
          [commentId, viewer.userId],
        );
      } else {
        await client.query(
          "update comments set hidden_by = null, hidden_at = null where id = $1",
          [commentId],
        );
      }
      await writeAudit(client, {
        actorId: viewer.userId,
        action: wantHidden ? "comment_hidden" : "comment_restored",
        targetKind: "entry",
        targetId: found.entryId,
        detail: { commentId },
        addressPrefix,
      });
    }
    const row = await client.query<Row>(
      `select ${columns} from comments c join users u on u.id = c.author_id where c.id = $1`,
      [commentId, viewer.userId],
    );
    return describe(row.rows[0]!, true);
  });
}
