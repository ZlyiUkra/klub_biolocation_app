// Content import (T019 of specs/001-self-hosted-club-site). Written before the importer (T028) and before the
// tables (T022), so it is red until then. Needs the development database.
//
// Specified here: the import creates the expected rows from post and video sources, running it twice makes no
// duplicates and changes nothing, and a changed source updates that entry in place (same id, new text).
//
// The sources are small files written to a temporary folder, so the expectations are exact and do not move when
// the club edits a post. One extra test runs the real folders and only counts rows.
//
// These queries select from `entries`, `posts` and `videos` to assert on them. The boundary test of T024 (only
// server/src/access/ may select from those tables) must therefore look at server/src, not at server/test.

import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  importContent,
  type ImportSources,
} from "../src/cli/import-content.js";
import { createTestDatabase, skipWithoutDatabase } from "./helpers/db.js";

type Sources = ImportSources & { root: string };

function writeSources(): Sources {
  const root = mkdtempSync(join(tmpdir(), "kb-import-"));
  const postsDir = join(root, "posts");
  const videoDir = join(root, "video");
  mkdirSync(postsDir);
  mkdirSync(videoDir);

  writeFileSync(
    join(postsDir, "first-post.md"),
    `---
title: "First post"
description: "About the first post"
date: 2026-09-04T12:00:00+03:00
tags: ["Pendulum", "Начинающим"]
categories: ["blog"]
draft: false
---

First paragraph of the first post.

## A heading

Second paragraph.
`,
  );
  writeFileSync(
    join(postsDir, "hidden-draft.md"),
    `---
title: "A draft"
date: 2026-09-05
draft: true
---

Not for the public.
`,
  );
  writeFileSync(
    join(videoDir, "open-lecture.md"),
    `---
title: "Open lecture"
date: "2024-02-14"
videoId: "abc123"
videoPlatform: "youtube"
duration: "12:34"
tags: ["video", "Маятник"]
categories: ["обучающие видео"]
---

Public description of the lecture.
`,
  );
  writeFileSync(
    join(videoDir, "paid-lecture.md"),
    `---
title: "Paid lecture"
date: "2026-09-28"
access: paid
tags: ["video"]
categories: ["обучающие видео"]
---

Public part of the paid lecture.
`,
  );
  return { root, postsDir, videoDir };
}

async function withImportedDatabase(
  fn: (
    ctx: Awaited<ReturnType<typeof createTestDatabase>> & {
      sources: Sources;
    },
  ) => Promise<void>,
): Promise<void> {
  const db = await createTestDatabase();
  const sources = writeSources();
  try {
    await fn({ ...db, sources });
  } finally {
    rmSync(sources.root, { recursive: true, force: true });
    await db.drop();
  }
}

test(
  "the import creates the expected rows",
  { skip: skipWithoutDatabase },
  async () => {
    await withImportedDatabase(async ({ pool, sources }) => {
      const report = await importContent(pool, sources);
      assert.deepEqual(report.posts, { created: 2, updated: 0, unchanged: 0 });
      assert.deepEqual(report.videos, {
        created: 2,
        updated: 0,
        unchanged: 0,
      });

      const posts = await pool.query(
        `select e.kind, e.slug, e.title, e.description, e.audience, e.teaser, e.published_at,
                p.body_markdown, p.body_html, p.summary, p.tags, p.categories, p.render_version
           from entries e join posts p on p.entry_id = e.id
          order by e.slug`,
      );
      assert.equal(posts.rows.length, 2);
      const [first, draft] = posts.rows;
      assert.equal(first.kind, "post");
      assert.equal(first.slug, "first-post");
      assert.equal(first.title, "First post");
      assert.equal(first.description, "About the first post");
      assert.equal(first.audience, "everyone");
      assert.equal(first.teaser, false);
      assert.equal(
        new Date(first.published_at).toISOString(),
        "2026-09-04T09:00:00.000Z",
        "the front matter's offset is honoured",
      );
      assert.match(first.body_markdown, /^First paragraph of the first post\./);
      assert.doesNotMatch(
        first.body_markdown,
        /^---/m,
        "no front matter in the stored source",
      );
      assert.match(
        first.body_html,
        /<p>First paragraph of the first post\.<\/p>/,
      );
      assert.match(first.body_html, /<h2 id="a-heading">A heading<\/h2>/);
      assert.ok(first.summary.length > 0);
      assert.deepEqual(
        first.tags,
        ["pendulum", "начинающим"],
        "tags are lower-cased",
      );
      assert.deepEqual(first.categories, ["blog"]);
      assert.ok(Number.isInteger(first.render_version));
      assert.equal(draft.slug, "hidden-draft");
      assert.equal(draft.audience, "hidden", "a draft is imported hidden");

      const videos = await pool.query(
        `select e.kind, e.slug, e.title, e.teaser, e.published_at,
                v.description_markdown, v.description_html, s.provider as platform, s.reference as external_id,
                v.paid, v.duration, v.tags
           from entries e join videos v on v.entry_id = e.id
           left join video_sources s on s.entry_id = e.id
          order by e.slug`,
      );
      assert.equal(videos.rows.length, 2);
      const [open, paid] = videos.rows;
      assert.equal(open.kind, "video");
      assert.equal(open.slug, "open-lecture");
      assert.equal(open.platform, "youtube");
      assert.equal(open.external_id, "abc123");
      assert.equal(open.paid, false);
      assert.equal(open.duration, "12:34");
      assert.equal(open.teaser, false);
      assert.equal(
        new Date(open.published_at).toISOString(),
        "2024-02-14T00:00:00.000Z",
      );
      assert.deepEqual(open.tags, ["video", "маятник"]);
      assert.match(
        open.description_html,
        /Public description of the lecture\./,
      );
      assert.equal(paid.slug, "paid-lecture");
      assert.equal(paid.paid, true);
      // Changed 2026-10-10 (T160): the source of a video is its video_sources row; the import writes one for a public
      // video only, and a paid lecture's is written by store_video_source (npm run import:video-sources).
      assert.equal(
        paid.external_id,
        null,
        "the import writes no source for a paid lecture",
      );
      assert.equal(
        paid.teaser,
        true,
        "an imported paid lecture shows its teaser by default",
      );
    });
  },
);

test(
  "the import run twice makes no duplicates and changes nothing",
  { skip: skipWithoutDatabase },
  async () => {
    await withImportedDatabase(async ({ pool, sources }) => {
      await importContent(pool, sources);
      const before = await pool.query(
        "select id, slug, updated_at from entries order by id",
      );

      const second = await importContent(pool, sources);
      assert.deepEqual(second.posts, { created: 0, updated: 0, unchanged: 2 });
      assert.deepEqual(second.videos, { created: 0, updated: 0, unchanged: 2 });

      const after = await pool.query(
        "select id, slug, updated_at from entries order by id",
      );
      assert.deepEqual(after.rows, before.rows, "same ids, same save tokens");
    });
  },
);

test(
  "a changed source updates its entry in place",
  { skip: skipWithoutDatabase },
  async () => {
    await withImportedDatabase(async ({ pool, sources }) => {
      await importContent(pool, sources);
      const before = await pool.query(
        "select id, updated_at from entries where kind = 'post' and slug = 'first-post'",
      );

      writeFileSync(
        join(sources.postsDir, "first-post.md"),
        `---
title: "First post, revised"
date: 2026-09-04T12:00:00+03:00
tags: ["pendulum"]
categories: ["blog"]
---

Revised text.
`,
      );
      const report = await importContent(pool, sources);
      assert.deepEqual(report.posts, { created: 0, updated: 1, unchanged: 1 });
      assert.deepEqual(report.videos, { created: 0, updated: 0, unchanged: 2 });

      const after = await pool.query(
        `select e.id, e.title, e.updated_at, p.body_markdown, p.body_html
           from entries e join posts p on p.entry_id = e.id
          where e.kind = 'post' and e.slug = 'first-post'`,
      );
      assert.equal(after.rows.length, 1, "no second row for the same slug");
      const row = after.rows[0];
      assert.equal(row.id, before.rows[0].id, "the entry keeps its id");
      assert.equal(row.title, "First post, revised");
      assert.match(row.body_markdown, /Revised text\./);
      assert.match(row.body_html, /Revised text\./);
      assert.ok(
        new Date(row.updated_at) > new Date(before.rows[0].updated_at),
        "the save token moves when the content changes",
      );

      const total = await pool.query("select count(*)::int as n from entries");
      assert.equal(total.rows[0].n, 4);
    });
  },
);

test(
  "the real folders import one row per file, twice over",
  { skip: skipWithoutDatabase },
  async () => {
    const real: ImportSources = {
      postsDir: fileURLToPath(
        new URL("../../../../src/content/posts/", import.meta.url),
      ),
      videoDir: fileURLToPath(
        new URL("../../../../src/content/video/", import.meta.url),
      ),
    };
    const posts = readdirSync(real.postsDir).filter((f) =>
      f.endsWith(".md"),
    ).length;
    const videos = readdirSync(real.videoDir).filter((f) =>
      f.endsWith(".md"),
    ).length;

    const db = await createTestDatabase();
    try {
      const first = await importContent(db.pool, real);
      assert.equal(first.posts.created, posts);
      assert.equal(first.videos.created, videos);
      const second = await importContent(db.pool, real);
      assert.equal(second.posts.unchanged, posts);
      assert.equal(second.videos.unchanged, videos);

      const counts = await db.pool.query(
        "select kind, count(*)::int as n from entries group by kind order by kind",
      );
      assert.deepEqual(counts.rows, [
        { kind: "post", n: posts },
        { kind: "video", n: videos },
      ]);
    } finally {
      await db.drop();
    }
  },
);

test(
  "the members-only block of a paid lecture is stored apart and never rendered into the description",
  { skip: skipWithoutDatabase },
  async () => {
    await withImportedDatabase(async ({ pool, sources }) => {
      writeFileSync(
        join(sources.videoDir, "paid-with-materials.md"),
        `---
title: "Paid lecture with materials"
date: "2026-09-29"
access: paid
tags: ["video"]
---

Public description of the lecture.

<div data-members-only>

## Materials

Secret handout text for members only.

</div>
`,
      );
      await importContent(pool, sources);
      const row = (
        await pool.query(
          `select v.description_markdown, v.description_html, v.members_only_markdown, v.members_only_html, e.audience
             from entries e join videos v on v.entry_id = e.id where e.slug = 'paid-with-materials'`,
        )
      ).rows[0];
      assert.equal(
        row.audience,
        "everyone",
        "the page is public, the player is not",
      );
      assert.match(row.description_html, /Public description of the lecture\./);
      assert.doesNotMatch(
        row.description_markdown,
        /data-members-only|Secret handout/,
      );
      assert.doesNotMatch(
        row.description_html,
        /Secret handout|Materials|data-members-only/,
      );
      assert.match(row.members_only_markdown, /^## Materials/);
      assert.match(
        row.members_only_html,
        /Secret handout text for members only\./,
      );
      assert.doesNotMatch(row.members_only_html, /<div/);
    });
  },
);

// Added 2026-10-10 (T150): the build guards of getVideos() as rules of the import. Each source is refused with the
// rule's own sentence, and a refused file writes nothing at all (the run is one transaction).
const refusedVideos: { name: string; source: string; message: RegExp }[] = [
  {
    name: "a paid lecture that links to YouTube in its text",
    source: `---
title: "Leaky lecture"
date: "2026-09-29"
access: paid
---

Watch it at https://youtu.be/abcdefghijk?t=30 instead.
`,
    message: /must not link to YouTube/,
  },
  {
    name: "a paid lecture that links to Yandex Disk inside its members-only block",
    source: `---
title: "Leaky lecture"
date: "2026-09-29"
access: paid
---

Public part.

<div data-members-only>

The file: https://disk.yandex.ru/i/AbCdEfGh

</div>
`,
    message: /must not link to Yandex Disk/,
  },
  {
    name: "a public lecture with a members-only block",
    source: `---
title: "Public lecture"
date: "2026-09-29"
videoId: "abcdefghijk"
---

Public part.

<div data-members-only>

Nobody would see this.

</div>
`,
    message: /belongs in a paid video/,
  },
  {
    name: "a paid lecture with a block that cannot be recognised",
    source: `---
title: "Broken block"
date: "2026-09-29"
access: paid
---

Public part.

<div data-members-only>

The closing tag is missing.
`,
    message: /must open with exactly/,
  },
  {
    name: "a public lecture with no embed id",
    source: `---
title: "No player"
date: "2026-09-29"
---

Text.
`,
    message: /a public video needs its videoId/,
  },
  {
    name: "a paid lecture that names its video",
    source: `---
title: "Names its video"
date: "2026-09-29"
access: paid
videoId: "abcdefghijk"
---

Text.
`,
    message: /a paid video must not carry videoId/,
  },
];

for (const { name, source, message } of refusedVideos) {
  test(
    `the import refuses ${name}`,
    { skip: skipWithoutDatabase },
    async () => {
      await withImportedDatabase(async ({ pool, sources }) => {
        writeFileSync(join(sources.videoDir, "refused.md"), source);
        await assert.rejects(
          importContent(pool, sources),
          (error: unknown) =>
            error instanceof Error && message.test(error.message),
        );
        const count = await pool.query(
          "select count(*)::int as n from entries",
        );
        assert.equal(
          count.rows[0].n,
          0,
          "a refused file writes nothing at all",
        );
      });
    },
  );
}

test(
  "front matter that is JavaScript is refused, never run",
  { skip: skipWithoutDatabase },
  async () => {
    await withImportedDatabase(async ({ pool, sources }) => {
      writeFileSync(
        join(sources.postsDir, "evil.md"),
        `---js
{ title: (() => { throw new Error("it ran"); })(), date: "2026-01-01T00:00:00+03:00" }
---

Text.
`,
      );
      await assert.rejects(
        importContent(pool, sources),
        (error: unknown) =>
          error instanceof Error &&
          /JavaScript front matter is not allowed/.test(error.message) &&
          !/it ran/.test(error.message),
      );
      const count = await pool.query("select count(*)::int as n from entries");
      assert.equal(count.rows[0].n, 0, "a refused file writes nothing at all");
    });
  },
);
