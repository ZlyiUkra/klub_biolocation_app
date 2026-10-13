// What the editors' panel reads and writes of posts and videos (T097 of specs/001-self-hosted-club-site; shapes in
// contracts/http-api.md, "Posts and videos in the panel"; routes in server/src/content/admin-routes.ts).
//
// It lives under server/src/access/ because the access-boundary test allows only this folder to read the content
// tables (constitution III): the public reads are `entries.ts`, the panel's are here, and the routes know no SQL.
//
// Decisions that would otherwise look like mistakes:
// - `updated_at` is compared and returned as text with microseconds (`to_char`, `US`). A JavaScript Date keeps
//   milliseconds only, and two saves inside one millisecond would then look like the same version: the `If-Match` of a
//   panel is this string, opaque to it, and the database compares it under the row's lock.
// - A write takes the entry's row with `FOR UPDATE OF e` before it compares the stamp, so the second of two editors
//   waits for the first, then sees a stale stamp and is told so, instead of both passing a check made before either
//   wrote (PostgreSQL docs, "Explicit Locking", row-level locks).
// - Rendering is not done here. The caller renders the changed texts first and hands the HTML in, so the row's lock is
//   held for a few statements and not for a Markdown pipeline.
// - A delete is `deleted_at`, never a `delete from entries`: the address stays taken, comments and the audit trail keep
//   their anchor, and an editor can restore it. The audience rows of an entry are replaced as a set.
// - A video's link was write-only for a paid lecture: `describe()` left the reference out of anything it returned for
//   a paid video, and said only that one is set. Reversed 2026-10-12 at the owner's order: `describe()` returns it to
//   the panel (see the note beside the code); the lists and everything public still never carry it.
// - The database's own deferred constraints (a public video has a source, a video has a link or a file, never both) are
//   the last word; a violation reaches the route as a PostgreSQL error with the code 23514 and is turned into a 400.

import type pg from "pg";
import type { Pool } from "../db/pool.js";
import type { EntryKind } from "./entries.js";

export type Rendered = {
  markdown: string;
  html: string;
  headings: unknown[];
  plainText: string;
  summary: string;
};

export type VideoSource =
  | { kind: "none" }
  | { kind: "file"; sizeBytes: number }
  | { kind: "link"; provider: string; referenceSet: true; reference?: string };

export type AdminEntry = {
  id: number;
  kind: EntryKind;
  slug: string;
  title: string;
  description: string;
  publishedAt: string;
  updatedAt: string;
  deleted: boolean;
  audience: string;
  statuses: string[];
  userIds: number[];
  teaser: boolean;
  tags: string[];
  categories: string[];
  body: string;
  paid?: boolean;
  availableUntil?: string;
  membersOnly?: string | null;
  source?: VideoSource;
};

export type AdminListItem = {
  id: number;
  slug: string;
  title: string;
  publishedAt: string;
  updatedAt: string;
  audience: string;
  deleted: boolean;
  // Videos only (T175): paid or not, and the kind of source with the provider's name; never the reference.
  paid?: boolean;
  source?:
    { kind: "none" } | { kind: "file" } | { kind: "link"; provider: string };
};

/** The stamp, as the panel keeps it: UTC, microseconds. */
const stamp = (column: string) =>
  `to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

type Row = {
  id: string;
  kind: EntryKind;
  slug: string;
  title: string;
  description: string;
  audience: string;
  teaser: boolean;
  published_at: Date;
  updated_at: string;
  deleted: boolean;
  tags: string[];
  categories: string[];
  post_markdown: string | null;
  video_markdown: string | null;
  members_only_markdown: string | null;
  paid: boolean | null;
  available_until: string | null;
  statuses: string[];
  user_ids: number[];
  provider: string | null;
  reference: string | null;
  file_size: string | null;
};

const select = `
  select e.id, e.kind, e.slug, e.title, e.description, e.audience, e.teaser, e.published_at,
         ${stamp("e.updated_at")} as updated_at, e.deleted_at is not null as deleted,
         coalesce(p.tags, v.tags, '{}') as tags, coalesce(p.categories, v.categories, '{}') as categories,
         p.body_markdown as post_markdown, v.description_markdown as video_markdown,
         v.members_only_markdown, v.paid, v.available_until::text as available_until,
         (select coalesce(array_agg(s.status order by s.status), '{}') from entry_audience_statuses s
           where s.entry_id = e.id) as statuses,
         (select coalesce(array_agg(u.user_id::int order by u.user_id), '{}') from entry_audience_users u
           where u.entry_id = e.id) as user_ids,
         src.provider, src.reference, f.size_bytes as file_size
    from entries e
    left join posts p on p.entry_id = e.id
    left join videos v on v.entry_id = e.id
    left join video_sources src on src.entry_id = e.id
    left join video_files f on f.entry_id = e.id
   where e.id = $1 and e.kind = $2`;

function describe(row: Row): AdminEntry {
  const entry: AdminEntry = {
    id: Number(row.id),
    kind: row.kind,
    slug: row.slug,
    title: row.title,
    description: row.description,
    publishedAt: row.published_at.toISOString(),
    updatedAt: row.updated_at,
    deleted: row.deleted,
    audience: row.audience,
    statuses: row.statuses,
    userIds: row.user_ids,
    teaser: row.teaser,
    tags: row.tags,
    categories: row.categories,
    body:
      row.kind === "post"
        ? (row.post_markdown ?? "")
        : (row.video_markdown ?? ""),
  };
  if (row.kind === "video") {
    entry.paid = row.paid === true;
    entry.availableUntil = row.available_until ?? "";
    entry.membersOnly = row.members_only_markdown;
    entry.source =
      row.file_size !== null
        ? { kind: "file", sizeBytes: Number(row.file_size) }
        : row.provider !== null
          ? {
              kind: "link",
              provider: row.provider,
              referenceSet: true,
              // Changed 2026-10-12 (the owner's order): the editor sees the reference of a paid lecture too, as the
              // old site's local file showed it - an editor cannot change what he cannot see. It is in the answers of
              // this router only (metr and admin, `no-store`); no list, public page, public API or audit row has it.
              ...(row.reference === null ? {} : { reference: row.reference }),
            }
          : { kind: "none" };
  }
  return entry;
}

/** Anything that can run a query: the pool, or the client of a transaction. */
export type Db = Pick<pg.Pool, "query">;

export async function readAdminEntry(
  db: Db,
  kind: EntryKind,
  id: number,
  options: { lock?: boolean } = {},
): Promise<AdminEntry | null> {
  const sql = options.lock === true ? `${select} for update of e` : select;
  const result = await db.query<Row>(sql, [id, kind]);
  const row = result.rows[0];
  return row === undefined ? null : describe(row);
}

export async function listAdminEntries(
  pool: Pool,
  kind: EntryKind,
  query: { q: string; deleted: boolean; page: number; limit: number },
): Promise<{ items: AdminListItem[]; total: number }> {
  const needle = query.q.toLowerCase();
  const params = [kind, query.deleted, needle];
  const where = `e.kind = $1 and (e.deleted_at is not null) = $2
                 and ($3 = '' or strpos(lower(e.title || ' ' || e.slug), $3) > 0)`;
  const total = await pool.query<{ n: number }>(
    `select count(*)::int as n from entries e where ${where}`,
    params,
  );
  const rows = await pool.query<{
    id: string;
    slug: string;
    title: string;
    published_at: Date;
    updated_at: string;
    audience: string;
    deleted: boolean;
    paid: boolean | null;
    provider: string | null;
    has_file: boolean;
  }>(
    // Changed 2026-10-12 (T175): a video's row also says whether it is paid and where it lives (the provider's name or
    // a file; never the reference), so the list of the panel can show the source without opening each video.
    `select e.id, e.slug, e.title, e.published_at, ${stamp("e.updated_at")} as updated_at, e.audience,
            e.deleted_at is not null as deleted, v.paid, src.provider, f.entry_id is not null as has_file
       from entries e
       left join videos v on v.entry_id = e.id
       left join video_sources src on src.entry_id = e.id
       left join video_files f on f.entry_id = e.id
      where ${where}
      order by e.published_at desc, e.id desc limit $4 offset $5`,
    [...params, query.limit, (query.page - 1) * query.limit],
  );
  return {
    total: total.rows[0]?.n ?? 0,
    items: rows.rows.map((r) => ({
      id: Number(r.id),
      slug: r.slug,
      title: r.title,
      publishedAt: r.published_at.toISOString(),
      updatedAt: r.updated_at,
      audience: r.audience,
      deleted: r.deleted,
      ...(kind === "video" && {
        paid: r.paid === true,
        source:
          r.provider !== null
            ? { kind: "link" as const, provider: r.provider }
            : r.has_file
              ? { kind: "file" as const }
              : { kind: "none" as const },
      }),
    })),
  };
}

export type NewEntry = {
  kind: EntryKind;
  slug: string;
  title: string;
  description: string;
  publishedAt: string;
  audience: string;
  statuses: string[];
  userIds: number[];
  teaser: boolean;
  tags: string[];
  categories: string[];
  body: Rendered;
  createdBy: number;
  video?: {
    paid: boolean;
    availableUntil: string | null;
    membersOnly: Rendered | null;
    source: { provider: string; reference: string } | null;
  };
};

export class SlugTaken extends Error {}

/** Writes a new entry and its child rows inside the caller's transaction; returns its id. */
export async function insertAdminEntry(
  client: pg.PoolClient,
  entry: NewEntry,
  renderVersion: number,
): Promise<number> {
  let id: number;
  try {
    const created = await client.query<{ id: string }>(
      `insert into entries (kind, slug, title, description, audience, teaser, published_at, created_by)
       values ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8) returning id`,
      [
        entry.kind,
        entry.slug,
        entry.title,
        entry.description,
        entry.audience,
        entry.teaser,
        entry.publishedAt,
        entry.createdBy,
      ],
    );
    id = Number(created.rows[0]?.id);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new SlugTaken();
    throw error;
  }
  if (entry.kind === "post") {
    await client.query(
      `insert into posts (entry_id, body_markdown, body_html, headings, plain_text, summary, tags, categories,
                          render_version)
       values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)`,
      [
        id,
        entry.body.markdown,
        entry.body.html,
        JSON.stringify(entry.body.headings),
        entry.body.plainText,
        entry.body.summary,
        entry.tags,
        entry.categories,
        renderVersion,
      ],
    );
  } else {
    const video = entry.video;
    if (video === undefined)
      throw new Error("a video entry carries its video part");
    await client.query(
      `insert into videos (entry_id, description_markdown, description_html, headings, members_only_markdown,
                           members_only_html, paid, tags, categories, render_version, available_until)
       values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10,
               coalesce($11::date, ((now() at time zone 'utc')::date + interval '100 years')::date))`,
      [
        id,
        entry.body.markdown,
        entry.body.html,
        JSON.stringify(entry.body.headings),
        video.membersOnly?.markdown ?? null,
        video.membersOnly?.html ?? null,
        video.paid,
        entry.tags,
        entry.categories,
        renderVersion,
        video.availableUntil,
      ],
    );
    if (video.source !== null) {
      await client.query(
        `insert into video_sources (entry_id, provider, reference) values ($1, $2, $3)`,
        [id, video.source.provider, video.source.reference],
      );
    }
  }
  await replaceAudience(client, id, entry.statuses, entry.userIds);
  return id;
}

async function replaceAudience(
  client: pg.PoolClient,
  id: number,
  statuses: string[],
  userIds: number[],
): Promise<void> {
  await client.query(
    "delete from entry_audience_statuses where entry_id = $1",
    [id],
  );
  await client.query("delete from entry_audience_users where entry_id = $1", [
    id,
  ]);
  for (const status of statuses) {
    await client.query(
      "insert into entry_audience_statuses (entry_id, status) values ($1, $2)",
      [id, status],
    );
  }
  for (const userId of userIds) {
    await client.query(
      "insert into entry_audience_users (entry_id, user_id) values ($1, $2)",
      [id, userId],
    );
  }
}

export type EntryPatch = {
  title?: string;
  description?: string;
  publishedAt?: string;
  audience?: string;
  statuses?: string[];
  userIds?: number[];
  teaser?: boolean;
  tags?: string[];
  categories?: string[];
  body?: Rendered;
  paid?: boolean;
  /** `null` puts the default end back (a hundred years on). */
  availableUntil?: string | null;
  membersOnly?: Rendered | null;
};

/** Applies a patch inside the caller's transaction, on a row it has locked; returns the names of what it touched. */
export async function patchAdminEntry(
  client: pg.PoolClient,
  kind: EntryKind,
  id: number,
  patch: EntryPatch,
  renderVersion: number,
): Promise<string[]> {
  const touched: string[] = [];
  const set = (
    sets: string[],
    values: unknown[],
    column: string,
    value: unknown,
    cast = "",
  ) => {
    values.push(value);
    sets.push(`${column} = $${values.length + 1}${cast}`);
  };

  const e: string[] = [];
  const ev: unknown[] = [];
  if (patch.title !== undefined)
    (set(e, ev, "title", patch.title), touched.push("title"));
  if (patch.description !== undefined)
    (set(e, ev, "description", patch.description), touched.push("description"));
  if (patch.publishedAt !== undefined)
    (set(e, ev, "published_at", patch.publishedAt, "::timestamptz"),
      touched.push("publishedAt"));
  if (patch.audience !== undefined)
    (set(e, ev, "audience", patch.audience), touched.push("audience"));
  if (patch.teaser !== undefined)
    (set(e, ev, "teaser", patch.teaser), touched.push("teaser"));
  if (e.length > 0) {
    await client.query(`update entries set ${e.join(", ")} where id = $1`, [
      id,
      ...ev,
    ]);
  }

  const c: string[] = [];
  const cv: unknown[] = [];
  if (patch.tags !== undefined)
    (set(c, cv, "tags", patch.tags), touched.push("tags"));
  if (patch.categories !== undefined)
    (set(c, cv, "categories", patch.categories), touched.push("categories"));
  if (patch.body !== undefined) {
    touched.push("body");
    if (kind === "post") {
      set(c, cv, "body_markdown", patch.body.markdown);
      set(c, cv, "body_html", patch.body.html);
      set(c, cv, "headings", JSON.stringify(patch.body.headings), "::jsonb");
      set(c, cv, "plain_text", patch.body.plainText);
      set(c, cv, "summary", patch.body.summary);
    } else {
      set(c, cv, "description_markdown", patch.body.markdown);
      set(c, cv, "description_html", patch.body.html);
      set(c, cv, "headings", JSON.stringify(patch.body.headings), "::jsonb");
    }
    set(c, cv, "render_version", renderVersion);
  }
  if (kind === "video") {
    if (patch.paid !== undefined)
      (set(c, cv, "paid", patch.paid), touched.push("paid"));
    if (patch.availableUntil !== undefined) {
      cv.push(patch.availableUntil);
      c.push(
        `available_until = coalesce($${cv.length + 1}::date, ((now() at time zone 'utc')::date + interval '100 years')::date)`,
      );
      touched.push("availableUntil");
    }
    if (patch.membersOnly !== undefined) {
      set(c, cv, "members_only_markdown", patch.membersOnly?.markdown ?? null);
      set(c, cv, "members_only_html", patch.membersOnly?.html ?? null);
      touched.push("membersOnly");
    }
  }
  if (c.length > 0) {
    const table = kind === "post" ? "posts" : "videos";
    await client.query(
      `update ${table} set ${c.join(", ")} where entry_id = $1`,
      [id, ...cv],
    );
  }

  if (patch.statuses !== undefined || patch.userIds !== undefined) {
    const current = await client.query<{ statuses: string[]; users: number[] }>(
      `select (select coalesce(array_agg(status), '{}') from entry_audience_statuses where entry_id = $1) as statuses,
              (select coalesce(array_agg(user_id::int), '{}') from entry_audience_users where entry_id = $1) as users`,
      [id],
    );
    await replaceAudience(
      client,
      id,
      patch.statuses ?? current.rows[0]?.statuses ?? [],
      patch.userIds ?? current.rows[0]?.users ?? [],
    );
    if (patch.statuses !== undefined) touched.push("statuses");
    if (patch.userIds !== undefined) touched.push("userIds");
  }
  return touched;
}

/** Sets or clears `deleted_at` on a locked row; false when it already was in that state. */
export async function setAdminDeleted(
  client: pg.PoolClient,
  id: number,
  deleted: boolean,
): Promise<boolean> {
  const result = await client.query(
    `update entries set deleted_at = case when $2 then now() end
      where id = $1 and (deleted_at is not null) <> $2`,
    [id, deleted],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Puts a link in place of whatever source a video has, on a locked row. A registered file is removed from the database
 * only when `replace` is true (its bytes stay on the volume); otherwise `"has_file"`.
 */
export async function setVideoLink(
  client: pg.PoolClient,
  id: number,
  source: { provider: string; reference: string },
  replace: boolean,
): Promise<"ok" | "has_file"> {
  const file = await client.query(
    "select 1 from video_files where entry_id = $1",
    [id],
  );
  if ((file.rowCount ?? 0) > 0) {
    if (!replace) return "has_file";
    await client.query("delete from video_files where entry_id = $1", [id]);
  }
  await client.query(
    `insert into video_sources (entry_id, provider, reference) values ($1, $2, $3)
     on conflict (entry_id) do update set provider = excluded.provider, reference = excluded.reference,
                                          saved_at = now()`,
    [id, source.provider, source.reference],
  );
  return "ok";
}

// Added 2026-10-12 (T175, the copy of a video): the link row of a video as the database holds it, for the server's own
// copy only; the route that calls it never puts the reference into a log or an audit row.
export async function readVideoLink(
  db: Db,
  id: number,
): Promise<{ provider: string; reference: string } | null> {
  const result = await db.query<{ provider: string; reference: string }>(
    "select provider, reference from video_sources where entry_id = $1",
    [id],
  );
  return result.rows[0] ?? null;
}

/** Gives the copy the same file row as the original: the same bytes on the volume, a row of its own. */
export async function copyVideoFile(
  client: Db,
  toId: number,
  fromId: number,
): Promise<void> {
  await client.query(
    `insert into video_files (entry_id, volume_path, size_bytes, content_type, faststart_ok)
     select $1, volume_path, size_bytes, content_type, faststart_ok from video_files where entry_id = $2`,
    [toId, fromId],
  );
}
