// The content import (task T028 of specs/001-self-hosted-club-site; `npm run import:content` runs it).
//
// It reads every `*.md` of the two source folders, checks the front matter against the site's own schemas
// (src/content/post-fields.ts and video-fields.ts - the same rules the build applies), renders the text with the
// save-time renderer (server/src/content/render.ts), and stores each entry through the database functions
// `store_post` and `store_video` (migration 004). The whole run is one transaction, so a bad file leaves the
// database as it was.
//
// Properties that matter, and the places they come from:
// - Idempotent. The functions answer 'created', 'updated' or 'unchanged'; a second run writes nothing.
// - It never reads the content tables (constitution III, the boundary test of T024): what to write is decided inside
//   the storing functions, not here.
// - Nothing is deleted. A file that disappears leaves its entry where it is.
// - A paid lecture is imported with `teaser` true, `paid` true and no video id, and keeps audience `everyone`, which
//   is what today's site does: its page is public, the player is not.
// - The members-only block of a paid lecture (src/lib/members-only.ts) is cut out of the description before anything
//   is rendered and stored in its own columns. Left in, the sanitizer would drop the wrapping tags and leave the
//   members' text as ordinary paragraphs of the public description.
// - A draft is stored hidden.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import { postFields } from "../../../src/content/post-fields.js";
import { videoFields } from "../../../src/content/video-fields.js";
// Added 2026-10-10 (T150): the rules for a video's text, shared with the editors' save path and the old build guard.
import { videoTextProblems } from "../../../src/content/video-guards.js";
import { splitMembersOnly } from "../../../src/lib/members-only.js";
import { renderMarkdown } from "../content/render.js";
import { withTransaction, type Pool } from "../db/pool.js";

export type ImportSources = {
  /** Folder of post sources, `src/content/posts` in the repository. */
  postsDir: string;
  /** Folder of video sources, `src/content/video` in the repository. */
  videoDir: string;
};

export type ImportCounts = {
  created: number;
  updated: number;
  unchanged: number;
};

export type ImportReport = {
  posts: ImportCounts;
  videos: ImportCounts;
};

// gray-matter parses YAML, JSON and - by default - JavaScript front matter, and the JavaScript is run with eval
// (its lib/engines.js). A source file must never be able to run code in the importer, so the two names that select
// that engine ("---js" and "---javascript") are replaced by one that refuses. Passing options also keeps the
// package's per-text cache out of the way, which hands back one shared object for equal text.
function refuseJavaScript(): never {
  throw new Error("JavaScript front matter is not allowed");
}
const frontMatter = {
  engines: { javascript: refuseJavaScript, js: refuseJavaScript },
};

// Changed 2026-10-10 (T160, then migration 010): the list of platforms that stood here is gone. The importer writes the
// source of a public video into video_sources through store_video, and the providers a source may have are the rows of
// video_providers, so the database is the one home of that list and answers for an unknown one ("unknown video
// provider"). A file on this server's volume is registered in video_files, not through a platform name in front matter.

type Outcome = keyof ImportCounts;

function isOutcome(value: unknown): value is Outcome {
  return value === "created" || value === "updated" || value === "unchanged";
}

// The text after the front matter, without the blank lines that separate the two.
function bodyOf(parsed: { content: string }): string {
  return parsed.content.replace(/^(?:\r?\n)+/, "");
}

async function sourceFiles(dir: string): Promise<string[]> {
  return (await readdir(dir)).filter((name) => name.endsWith(".md")).sort();
}

function describe(file: string, error: unknown): Error {
  const reason = error instanceof Error ? error.message : String(error);
  return new Error(`${file}: ${reason}`);
}

export async function importContent(
  pool: Pool,
  sources: ImportSources,
): Promise<ImportReport> {
  const report: ImportReport = {
    posts: { created: 0, updated: 0, unchanged: 0 },
    videos: { created: 0, updated: 0, unchanged: 0 },
  };

  return withTransaction(pool, async (client) => {
    for (const name of await sourceFiles(sources.postsDir)) {
      const file = join(sources.postsDir, name);
      try {
        const parsed = matter(await readFile(file, "utf8"), frontMatter);
        const fields = postFields.parse(parsed.data);
        const body = bodyOf(parsed);
        const rendered = await renderMarkdown(body);
        const result = await client.query(
          "select store_post($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) as outcome",
          [
            name.slice(0, -3),
            fields.title,
            fields.description,
            fields.draft,
            fields.date,
            fields.lastmod ?? null,
            fields.share_title ?? null,
            fields.share_description ?? null,
            body,
            rendered.html,
            JSON.stringify(rendered.headings),
            rendered.plainText,
            fields.summary ?? rendered.summary,
            fields.tags,
            fields.categories,
            rendered.renderVersion,
          ],
        );
        const outcome: unknown = result.rows[0]?.outcome;
        if (!isOutcome(outcome))
          throw new Error("unexpected store_post answer");
        report.posts[outcome] += 1;
      } catch (error) {
        throw describe(file, error);
      }
    }

    for (const name of await sourceFiles(sources.videoDir)) {
      const file = join(sources.videoDir, name);
      try {
        const parsed = matter(await readFile(file, "utf8"), frontMatter);
        const fields = videoFields.parse(parsed.data);
        const paid = fields.access === "paid";
        // Added 2026-10-10 (T150): the build guards of getVideos() as rules of the import. A refused file stops the
        // whole run, and nothing is written (one transaction).
        const textProblems = videoTextProblems({
          paid,
          body: bodyOf(parsed),
          description: fields.description,
        });
        if (textProblems.length > 0) {
          throw new Error(textProblems.map((p) => p.message).join("; "));
        }
        const { publicBody, membersOnlyBody } = splitMembersOnly(
          bodyOf(parsed),
        );
        const description = await renderMarkdown(publicBody);
        const locked =
          membersOnlyBody === ""
            ? undefined
            : await renderMarkdown(membersOnlyBody);
        const result = await client.query(
          "select store_video($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19::date) as outcome",
          [
            name.slice(0, -3),
            fields.title,
            fields.description,
            fields.draft,
            fields.date,
            paid,
            publicBody,
            description.html,
            // Added 2026-10-10 (T139, migration 007): the headings of the public part, for the page's contents.
            JSON.stringify(description.headings),
            locked === undefined ? null : membersOnlyBody,
            locked === undefined ? null : locked.html,
            fields.videoPlatform,
            fields.videoId ?? null,
            paid,
            fields.duration ?? null,
            fields.tags,
            fields.categories,
            description.renderVersion,
            // Added 2026-10-11 (T152): the UTC day, or null so the column's default (100 years) stands.
            fields.availableUntil
              ? fields.availableUntil.toISOString().slice(0, 10)
              : null,
          ],
        );
        const outcome: unknown = result.rows[0]?.outcome;
        if (!isOutcome(outcome))
          throw new Error("unexpected store_video answer");
        report.videos[outcome] += 1;
      } catch (error) {
        throw describe(file, error);
      }
    }
    return report;
  });
}
