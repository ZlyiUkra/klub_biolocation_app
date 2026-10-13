// A future publication date (T020 of specs/001-self-hosted-club-site). Written before the access module (T024) and
// the tables (T022), so it is red until then. Needs the development database.
//
// Specified here (spec FR-008, data-model "The visibility function" rule 1, and the owner's rule of 2026-09-19 that a
// post dated in the future stays off the published site until its date): an entry whose `published_at` is in the
// future is absent from every surface for every viewer, administrators included - an editor's preview is a separate
// route, not these functions. The surfaces here are the ones the access module feeds: lists (which the feeds and the
// sitemap are built from), term counts, the search index and the entry itself.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pool } from "../src/db/pool.js";
import {
  getEntry,
  listEntries,
  listTerms,
  searchIndex,
  type EntryKind,
  type Viewer,
} from "../src/access/entries.js";
import { createTestDatabase, skipWithoutDatabase } from "./helpers/db.js";

const guest: Viewer = { userId: null, status: "guest" };
const admin: Viewer = { userId: 1, status: "admin" };

async function insertEntry(
  pool: Pool,
  kind: EntryKind,
  slug: string,
  publishedAt: string,
  tag: string,
): Promise<void> {
  const entry = await pool.query(
    `insert into entries (kind, slug, title, audience, published_at)
     values ($1, $2, $3, 'everyone', $4) returning id`,
    [kind, slug, `Title of ${slug}`, publishedAt],
  );
  const id = entry.rows[0].id;
  if (kind === "post") {
    await pool.query(
      `insert into posts (entry_id, body_markdown, body_html, headings, plain_text, summary, tags, categories, render_version)
       values ($1, 'text', '<p>text</p>', '[]', $2, 'summary', $3, '{}', 1)`,
      [id, `findable words of ${slug}`, ["shared", tag]],
    );
  } else {
    // Changed 2026-10-10 (T160): the source is a row of video_sources, written in the same statement because a public
    // video without one is refused when the transaction ends.
    await pool.query(
      `with v as (
         insert into videos (entry_id, description_markdown, description_html, paid, tags, categories, render_version)
         values ($1, 'text', '<p>text</p>', false, $2, '{}', 1) returning entry_id)
       insert into video_sources (entry_id, provider, reference) select entry_id, 'youtube', 'abc' from v`,
      [id, ["shared", tag]],
    );
  }
}

test(
  "an entry dated in the future is absent from every surface for every viewer",
  { skip: skipWithoutDatabase },
  async () => {
    const db = await createTestDatabase();
    try {
      const past = "2026-01-01T00:00:00Z";
      const future = new Date(Date.now() + 36 * 3600 * 1000).toISOString();
      await insertEntry(db.pool, "post", "visible-post", past, "past-tag");
      await insertEntry(db.pool, "post", "future-post", future, "future-tag");
      await insertEntry(db.pool, "video", "visible-video", past, "past-tag");
      await insertEntry(db.pool, "video", "future-video", future, "future-tag");

      for (const viewer of [guest, admin]) {
        const label = viewer.status;
        for (const kind of ["post", "video"] as const) {
          const slugs = (await listEntries(db.pool, viewer, kind)).map(
            (e) => e.slug,
          );
          assert.deepEqual(
            slugs,
            [`visible-${kind}`],
            `${label}: ${kind} list`,
          );
          assert.equal(
            await getEntry(db.pool, viewer, kind, `future-${kind}`),
            null,
            `${label}: the ${kind} itself is a 404`,
          );
          assert.ok(
            await getEntry(db.pool, viewer, kind, `visible-${kind}`),
            `${label}: the dated-in-the-past ${kind} is there`,
          );
        }

        const terms = await listTerms(db.pool, viewer);
        assert.ok(
          !terms.some((t) => t.name === "future-tag"),
          `${label}: a tag only a future entry carries does not exist yet`,
        );
        const shared = terms.find((t) => t.name === "shared");
        assert.equal(
          shared?.count,
          2,
          `${label}: counts include visible entries only`,
        );

        const found = (await searchIndex(db.pool, viewer)).map((i) => i.slug);
        assert.deepEqual(
          found.sort(),
          ["visible-post", "visible-video"],
          `${label}: search`,
        );
      }

      // The date arrives: the same row appears everywhere without any other change.
      await db.pool.query(
        "update entries set published_at = now() - interval '1 minute' where slug = 'future-post'",
      );
      const slugs = (await listEntries(db.pool, guest, "post")).map(
        (e) => e.slug,
      );
      assert.deepEqual(slugs.sort(), ["future-post", "visible-post"]);
      assert.ok(await getEntry(db.pool, guest, "post", "future-post"));
    } finally {
      await db.drop();
    }
  },
);
