// Sources of paid lectures (task T136 of specs/001-self-hosted-club-site; migration 006).
//
// The old site kept them outside the repository on purpose: a map of slug -> source in the video-access Worker's
// secret `VIDEOS`, locally the git-ignored `workers/video-access/videos.local.json` of the old repository. This module
// reads that same shape, so the owner's file goes in as it is, and writes each source to `video_sources` through the
// database function `store_video_source`.
//
// Decisions that would otherwise look like mistakes:
// - The value of a source is never printed, logged or put into an error message: only the slug and the word for what
//   happened. A failed check names the slug and the rule, not the link.
// - The accepted shapes are the old Worker's, no looser: a bare string is a YouTube id of eleven characters; an object
//   with a single key `yandexDisk` holds the public link of one file, https://disk.yandex.ru/i/<key> (disk.yandex.com
//   too). Anything else is refused whole, so a typo cannot store a half-understood source.
// - The whole file is written in one transaction: either every source is stored or none is.
// - The slug must be a paid video already in the database (the importer ran first); the SQL function refuses
//   otherwise.

import type { Pool } from "../db/pool.js";

export type VideoSourceProvider = "youtube" | "yandex-disk";
export type VideoSource = {
  provider: VideoSourceProvider;
  reference: string;
};

const slugShape = new RegExp("^[a-z0-9]+(-[a-z0-9]+)*$");
const youtubeId = new RegExp("^[A-Za-z0-9_-]{11}$");
const yandexDiskLink = new RegExp(
  "^https://disk[.]yandex[.](ru|com)/i/[A-Za-z0-9_-]+$",
);

/** Reads the JSON text of a sources file. Throws an Error naming the slug and the rule, never the value. */
export function parseSources(text: string): Map<string, VideoSource> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("the sources file is not valid JSON");
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("the sources file must be one object of slug -> source");
  }
  const sources = new Map<string, VideoSource>();
  for (const [slug, value] of Object.entries(raw)) {
    if (!slugShape.test(slug)) {
      throw new Error(`"${slug}" is not a slug`);
    }
    if (typeof value === "string") {
      if (!youtubeId.test(value)) {
        throw new Error(`${slug}: a bare string must be a YouTube id`);
      }
      sources.set(slug, { provider: "youtube", reference: value });
      continue;
    }
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const keys = Object.keys(value);
      const link: unknown = (value as Record<string, unknown>)["yandexDisk"];
      if (
        keys.length === 1 &&
        typeof link === "string" &&
        yandexDiskLink.test(link)
      ) {
        sources.set(slug, { provider: "yandex-disk", reference: link });
        continue;
      }
    }
    throw new Error(`${slug}: not a source this site understands`);
  }
  return sources;
}

export type SourcesReport = {
  created: number;
  updated: number;
  unchanged: number;
};

/** Stores the sources in one transaction. Returns counts only. */
export async function storeSources(
  pool: Pool,
  sources: Map<string, VideoSource>,
): Promise<SourcesReport> {
  const report: SourcesReport = { created: 0, updated: 0, unchanged: 0 };
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const [slug, source] of sources) {
      const result = await client.query<{ result: keyof SourcesReport }>(
        "select store_video_source($1, $2, $3) as result",
        [slug, source.provider, source.reference],
      );
      const outcome = result.rows[0]?.result;
      if (outcome === undefined) throw new Error(`${slug}: nothing stored`);
      report[outcome] += 1;
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    // The database's message names the slug, never the reference; keep it as it is.
    throw error;
  } finally {
    client.release();
  }
  return report;
}
