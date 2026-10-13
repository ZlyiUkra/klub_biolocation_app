// The one place a video's file row is written (T079 of specs/001-self-hosted-club-site; migration 015). It lives in the
// access module because the access boundary (access-boundary.test.ts) lets only this folder touch the content tables;
// server/src/video/register.ts does the file work and calls this for the database work.
//
// Rules:
// - The entry must be a video. A post, a missing slug and a deleted entry are all "no such video".
// - A video has a source row (an embed id or a link, public or secret) or a file row, never both (the deferred trigger
//   of migration 015 would refuse at commit; this function refuses earlier, with a reason). Registering a file for a
//   video that has a source row is allowed only when the caller says `replaceSource`, and then the source row is
//   DELETED in the same transaction. That is destructive (a paid lecture's secret link is not recoverable from here),
//   so it is asked for, never a default (CLAUDE.md).
// - Registering again replaces the file row of the same video (at most one current file).
// - An audit row records the registration: the slug, the size and whether a source or an earlier file was replaced.
//   Never a path of the volume and never a stored reference.

import { withTransaction, type Pool } from "../db/pool.js";
import { writeAudit } from "../users/audit.js";

export type RegisterRefusal = "no_such_video" | "has_source";

export class RegisterRefused extends Error {
  readonly code: RegisterRefusal;
  constructor(code: RegisterRefusal) {
    super(code);
    this.name = "RegisterRefused";
    this.code = code;
  }
}

export type Registered = {
  replacedSource: boolean;
  replacedFile: boolean;
};

export async function registerVideoFile(
  pool: Pool,
  input: {
    slug: string;
    volumePath: string;
    sizeBytes: number;
    replaceSource: boolean;
  },
): Promise<Registered> {
  return withTransaction(pool, async (client) => {
    const found = await client.query<{
      id: string;
      has_source: boolean;
      has_file: boolean;
    }>(
      `select e.id,
              exists (select 1 from video_sources s where s.entry_id = e.id) as has_source,
              exists (select 1 from video_files f where f.entry_id = e.id) as has_file
         from entries e
         join videos v on v.entry_id = e.id
        where e.kind = 'video' and e.slug = $1 and e.deleted_at is null
          for update of v`,
      [input.slug],
    );
    const row = found.rows[0];
    if (row === undefined) throw new RegisterRefused("no_such_video");
    if (row.has_source && !input.replaceSource) {
      throw new RegisterRefused("has_source");
    }
    const entryId = Number(row.id);
    if (row.has_source) {
      await client.query("delete from video_sources where entry_id = $1", [
        entryId,
      ]);
    }
    await client.query(
      `insert into video_files (entry_id, volume_path, size_bytes, content_type, faststart_ok)
       values ($1, $2, $3, 'video/mp4', true)
       on conflict (entry_id) do update
         set volume_path = excluded.volume_path, size_bytes = excluded.size_bytes,
             content_type = excluded.content_type, faststart_ok = excluded.faststart_ok,
             registered_at = clock_timestamp()`,
      [entryId, input.volumePath, input.sizeBytes],
    );
    await writeAudit(client, {
      actorId: null,
      action: "video_file_registered",
      targetKind: "entry",
      targetId: entryId,
      detail: {
        slug: input.slug,
        sizeBytes: input.sizeBytes,
        replacedSource: row.has_source,
        replacedFile: row.has_file,
      },
    });
    return { replacedSource: row.has_source, replacedFile: row.has_file };
  });
}

/**
 * Added 2026-10-12 (T098): the database half of an upload from the panel, on a client whose entry row is already locked
 * (`readAdminEntry(..., {lock: true})`). Same rules as `registerVideoFile`: a video that has a link or a file is refused
 * unless `replace` is true, and then the link row (a paid link is not recoverable) or the old file row goes in this
 * transaction; the old bytes stay on the volume. The caller writes the audit row, which names the entry and the size.
 */
export async function attachUploadedFile(
  client: Pick<import("pg").PoolClient, "query">,
  entryId: number,
  file: { volumePath: string; sizeBytes: number },
  replace: boolean,
): Promise<
  | { ok: true; replacedSource: boolean; replacedFile: boolean }
  | { ok: false; refused: "has_source" }
> {
  const has = await client.query<{ has_source: boolean; has_file: boolean }>(
    `select exists (select 1 from video_sources s where s.entry_id = $1) as has_source,
            exists (select 1 from video_files f where f.entry_id = $1) as has_file`,
    [entryId],
  );
  const row = has.rows[0] as { has_source: boolean; has_file: boolean };
  if ((row.has_source || row.has_file) && !replace) {
    return { ok: false, refused: "has_source" };
  }
  if (row.has_source) {
    await client.query("delete from video_sources where entry_id = $1", [
      entryId,
    ]);
  }
  await client.query(
    `insert into video_files (entry_id, volume_path, size_bytes, content_type, faststart_ok)
     values ($1, $2, $3, 'video/mp4', true)
     on conflict (entry_id) do update
       set volume_path = excluded.volume_path, size_bytes = excluded.size_bytes,
           content_type = excluded.content_type, faststart_ok = excluded.faststart_ok,
           registered_at = clock_timestamp()`,
    [entryId, file.volumePath, file.sizeBytes],
  );
  return {
    ok: true,
    replacedSource: row.has_source,
    replacedFile: row.has_file,
  };
}

/**
 * Added 2026-10-11 (T080): what the stream route needs about one video for one viewer: the answer of the lecture rule
 * and the registered file, if any. The path is relative to the video volume and never leaves the server; the caller
 * applies `lecture` before it uses anything else. null when there is no such video.
 */
export async function getVideoFile(
  pool: Pool,
  viewer: { userId: number | null },
  slug: string,
): Promise<{ lecture: string; volumePath: string | null } | null> {
  const result = await pool.query<{
    lecture: string;
    volume_path: string | null;
  }>(
    `select lecture_view($1::bigint, e.id) as lecture, f.volume_path
       from entries e
       join videos v on v.entry_id = e.id
       left join video_files f on f.entry_id = e.id
      where e.kind = 'video' and e.slug = $2`,
    [viewer.userId, slug],
  );
  const row = result.rows[0];
  return row === undefined
    ? null
    : { lecture: row.lecture, volumePath: row.volume_path };
}
