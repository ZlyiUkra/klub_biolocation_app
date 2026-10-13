// The content tables (T022 of specs/001-self-hosted-club-site): the rules the migration puts in the database itself.
// Needs the development database. The behaviour of reading these tables belongs to the access module (T024).

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pool } from "../src/db/pool.js";
import { createTestDatabase, skipWithoutDatabase } from "./helpers/db.js";

async function rejects(
  pool: Pool,
  sql: string,
  params: unknown[],
  code: string,
) {
  await assert.rejects(
    pool.query(sql, params),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === code,
    `expected SQLSTATE ${code} for: ${sql}`,
  );
}

const CHECK = "23514";
const UNIQUE = "23505";
const FOREIGN_KEY = "23503";

test(
  "the content tables enforce their own rules",
  { skip: skipWithoutDatabase },
  async () => {
    const db = await createTestDatabase();
    try {
      const p = db.pool;
      const entry = (kind: string, slug: string) =>
        p.query(
          "insert into entries (kind, slug, title) values ($1, $2, 'T') returning id",
          [kind, slug],
        );

      const post = await entry("post", "a-post");
      const video = await entry("video", "a-video");
      assert.equal(
        (
          await p.query("select audience, teaser from entries where id = $1", [
            post.rows[0].id,
          ])
        ).rows[0].audience,
        "everyone",
      );

      // Address rules.
      await rejects(
        p,
        "insert into entries (kind, slug, title) values ('post', '2026', 'T')",
        [],
        CHECK,
      );
      await rejects(
        p,
        "insert into entries (kind, slug, title) values ('post', 'a/b', 'T')",
        [],
        CHECK,
      );
      await rejects(
        p,
        "insert into entries (kind, slug, title) values ('post', '', 'T')",
        [],
        CHECK,
      );
      await rejects(
        p,
        "insert into entries (kind, slug, title) values ('post', 'a-post', 'T')",
        [],
        UNIQUE,
      );
      await entry("video", "2026"); // a video may be named after a year; only posts are refused
      await entry("video", "a-post"); // the same slug under the other kind is a different address

      // Fixed sets.
      await rejects(
        p,
        "insert into entries (kind, slug, title, audience) values ('post', 'x', 'T', 'nobody')",
        [],
        CHECK,
      );
      await rejects(
        p,
        "insert into entries (kind, slug, title) values ('page', 'x', 'T')",
        [],
        CHECK,
      );

      // A kind-specific row can only hang on an entry of its own kind.
      await rejects(
        p,
        "insert into posts (entry_id, body_markdown, body_html, render_version) values ($1, 'm', 'h', 1)",
        [video.rows[0].id],
        FOREIGN_KEY,
      );
      await rejects(
        p,
        "insert into videos (entry_id, paid, render_version) values ($1, true, 1)",
        [post.rows[0].id],
        FOREIGN_KEY,
      );

      // Video source rules, as in src/content/config.ts. Changed 2026-10-10 (T160): the source is a row of
      // video_sources, so "a public video has a source" is a deferred constraint trigger, and "a paid video carries
      // no embed id" is the structure: the table has no such column.
      await rejects(
        p,
        "insert into videos (entry_id, paid, render_version) values ($1, false, 1)",
        [video.rows[0].id],
        CHECK,
      );
      await p.query(
        "insert into videos (entry_id, paid, render_version) values ($1, true, 1)",
        [video.rows[0].id],
      );
      // A public video with its source in the same statement is accepted; its source cannot then be removed alone.
      const open = await entry("video", "open-video");
      await p.query(
        `with v as (insert into videos (entry_id, paid, render_version) values ($1, false, 1) returning entry_id)
         insert into video_sources (entry_id, provider, reference) select entry_id, 'youtube', 'abc' from v`,
        [open.rows[0].id],
      );
      await rejects(
        p,
        "delete from video_sources where entry_id = $1",
        [open.rows[0].id],
        CHECK,
      );

      // The save token moves with the entry row and with its kind-specific row, and only then.
      await p.query(
        "insert into posts (entry_id, body_markdown, body_html, render_version) values ($1, 'm', 'h', 1)",
        [post.rows[0].id],
      );
      const token = async () =>
        (
          await p.query("select updated_at from entries where id = $1", [
            post.rows[0].id,
          ])
        ).rows[0].updated_at as Date;
      const t0 = await token();
      assert.equal(
        (await token()).getTime(),
        t0.getTime(),
        "reading changes nothing",
      );
      await p.query(
        "update posts set body_markdown = 'new' where entry_id = $1",
        [post.rows[0].id],
      );
      const t1 = await token();
      assert.ok(t1 > t0, "a change to the body moves the token");
      await p.query("update entries set title = 'Other' where id = $1", [
        post.rows[0].id,
      ]);
      assert.ok((await token()) > t1, "a change to the entry moves it too");

      // Audience tables: one pair once, and only for existing entries.
      await p.query(
        "insert into entry_audience_statuses values ($1, 'student')",
        [post.rows[0].id],
      );
      await rejects(
        p,
        "insert into entry_audience_statuses values ($1, 'student')",
        [post.rows[0].id],
        UNIQUE,
      );
      await rejects(
        p,
        "insert into entry_audience_statuses values ($1, 'wizard')",
        [post.rows[0].id],
        CHECK,
      );
      await rejects(
        p,
        "insert into entry_audience_users values (999999, 1)",
        [],
        FOREIGN_KEY,
      );

      // No application delete: an entry with children cannot be removed by accident.
      await rejects(
        p,
        "delete from entries where id = $1",
        [post.rows[0].id],
        FOREIGN_KEY,
      );
    } finally {
      await db.drop();
    }
  },
);

// Added 2026-10-10 (owner's rule: a postponed data migration is never forgotten). The end state of T160: the source of
// a video has one home, `video_sources`, so `videos` carries neither `platform` nor `external_id`. It was `todo`
// until migration 008 moved the data and dropped the columns (T160, 2026-10-10); the flag is gone.
test(
  "the source of a video has one home: videos has no platform or external_id column",
  { skip: skipWithoutDatabase },
  async () => {
    const db = await createTestDatabase();
    try {
      const columns = await db.pool.query(
        "select column_name from information_schema.columns where table_name = 'videos'",
      );
      const names = columns.rows.map((row) => row.column_name);
      assert.ok(!names.includes("platform"));
      assert.ok(!names.includes("external_id"));
    } finally {
      await db.drop();
    }
  },
);
