// The schema of video files and settings (migration 015, T077 of specs/001-self-hosted-club-site; data-model.md).
// Needs the development database server. A database per test where a rule is checked at commit, so one test's rows
// never colour another.
//
// Specified here: a file row belongs to a video and only one per video; a volume path cannot leave the volume; a file
// row and a source row never stand together at commit, while a switch from one to the other in one transaction is
// allowed; a public video must keep a source row or a file row; the members block's mode is `locked` by default and
// can hold only `locked` or `hidden`; every change of a setting is logged by the database and the log cannot be
// edited.
//
// These queries select from the content tables to assert on them; the boundary test of T024 looks at server/src, not
// at server/test.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pool } from "../src/db/pool.js";
import { createTestDatabase, skipWithoutDatabase } from "./helpers/db.js";

const opts = { skip: skipWithoutDatabase };

async function video(pool: Pool, slug: string, paid: boolean): Promise<number> {
  await pool.query(
    `select store_video($1, 't', 'd', false, '2026-01-01T00:00:00Z', false, 'x', '<p>x</p>', '[]'::jsonb,
                        null, null, 'youtube', $2, $3, null, '{}', '{}', 1)`,
    [slug, paid ? null : "publicId0001", paid],
  );
  const r = await pool.query(
    "select id from entries where kind = 'video' and slug = $1",
    [slug],
  );
  return Number(r.rows[0].id);
}

const file = (pool: Pool, entry: number, path = "a/b.mp4") =>
  pool.query(
    `insert into video_files (entry_id, volume_path, size_bytes, content_type, faststart_ok)
     values ($1, $2, 1000, 'video/mp4', true)`,
    [entry, path],
  );

async function refused(run: () => Promise<unknown>, code: string) {
  await assert.rejects(run, (error: { code?: string }) => error.code === code);
}

test(
  "a video has at most one file, and a file belongs to a video",
  opts,
  async () => {
    const db = await createTestDatabase();
    try {
      const paid = await video(db.pool, "paid-one", true);
      await file(db.pool, paid);
      await refused(() => file(db.pool, paid, "other.mp4"), "23505");
      await db.pool.query(
        `insert into entries (kind, slug, title, description, audience, teaser, published_at)
       values ('post', 'a-post', 't', 'd', 'everyone', false, now())`,
      );
      const post = await db.pool.query(
        "select id from entries where slug = 'a-post'",
      );
      await refused(() => file(db.pool, Number(post.rows[0].id)), "23503");
    } finally {
      await db.drop();
    }
  },
);

test(
  "a volume path cannot leave the volume, and only faststart-checked MP4 files are stored",
  opts,
  async () => {
    const db = await createTestDatabase();
    try {
      const entry = await video(db.pool, "paid-two", true);
      for (const bad of [
        "",
        "/etc/passwd",
        "../x.mp4",
        "a/../x.mp4",
        "a\\b.mp4",
        "a\nb.mp4",
      ]) {
        await refused(() => file(db.pool, entry, bad), "23514");
      }
      await refused(
        () =>
          db.pool.query(
            `insert into video_files (entry_id, volume_path, size_bytes, content_type, faststart_ok)
           values ($1, 'a.mp4', 10, 'video/webm', true)`,
            [entry],
          ),
        "23514",
      );
      await refused(
        () =>
          db.pool.query(
            `insert into video_files (entry_id, volume_path, size_bytes, content_type, faststart_ok)
           values ($1, 'a.mp4', 10, 'video/mp4', false)`,
            [entry],
          ),
        "23514",
      );
      await file(db.pool, entry, "ok/dotted.name..mp4");
    } finally {
      await db.drop();
    }
  },
);

test(
  "a source row and a file row never stand together at commit; a switch in one transaction is allowed",
  opts,
  async () => {
    const db = await createTestDatabase();
    try {
      const entry = await video(db.pool, "public-one", false);
      // Both at once: refused when the transaction ends.
      await refused(() => file(db.pool, entry), "23514");
      // The switch: file in, source out, one transaction.
      const client = await db.pool.connect();
      try {
        await client.query("begin");
        await client.query(
          `insert into video_files (entry_id, volume_path, size_bytes, content_type, faststart_ok)
         values ($1, 'x.mp4', 10, 'video/mp4', true)`,
          [entry],
        );
        await client.query("delete from video_sources where entry_id = $1", [
          entry,
        ]);
        await client.query("commit");
      } finally {
        client.release();
      }
      const left = await db.pool.query(
        "select (select count(*) from video_sources where entry_id = $1)::int as s, (select count(*) from video_files where entry_id = $1)::int as f",
        [entry],
      );
      assert.deepEqual(left.rows[0], { s: 0, f: 1 });
      // Back: a public video must keep one of the two, so removing the file alone is refused.
      await refused(
        () =>
          db.pool.query("delete from video_files where entry_id = $1", [entry]),
        "23514",
      );
      // A paid video may have neither (its source is written later), and may have the file alone.
      const paid = await video(db.pool, "paid-three", true);
      await file(db.pool, paid);
      await db.pool.query("delete from video_files where entry_id = $1", [
        paid,
      ]);
    } finally {
      await db.drop();
    }
  },
);

test(
  "deleting a video removes its file row without tripping the public-source rule",
  opts,
  async () => {
    const db = await createTestDatabase();
    try {
      const entry = await video(db.pool, "public-two", false);
      const client = await db.pool.connect();
      try {
        await client.query("begin");
        await client.query(
          `insert into video_files (entry_id, volume_path, size_bytes, content_type, faststart_ok)
         values ($1, 'y.mp4', 10, 'video/mp4', true)`,
          [entry],
        );
        await client.query("delete from video_sources where entry_id = $1", [
          entry,
        ]);
        await client.query("commit");
      } finally {
        client.release();
      }
      await db.pool.query("delete from videos where entry_id = $1", [entry]);
      const rows = await db.pool.query(
        "select count(*)::int as n from video_files",
      );
      assert.equal(rows.rows[0].n, 0);
    } finally {
      await db.drop();
    }
  },
);

test(
  "settings: locked by default, only known keys and modes, every change logged and the log append-only",
  opts,
  async () => {
    const db = await createTestDatabase();
    try {
      const first = await db.pool.query(
        "select value from settings where key = 'members_block_mode'",
      );
      assert.equal(first.rows[0].value, "locked");
      await refused(
        () =>
          db.pool.query(
            "update settings set value = '\"open\"'::jsonb where key = 'members_block_mode'",
          ),
        "23514",
      );
      await refused(
        () =>
          db.pool.query(
            "insert into settings (key, value) values ('nothing', '1')",
          ),
        "23514",
      );
      await db.pool.query(
        "update settings set value = '\"hidden\"'::jsonb where key = 'members_block_mode'",
      );
      // An update that changes nothing writes no log line.
      await db.pool.query(
        "update settings set value = '\"hidden\"'::jsonb where key = 'members_block_mode'",
      );
      const log = await db.pool.query(
        "select old_value, new_value from settings_log where key = 'members_block_mode' order by id",
      );
      assert.deepEqual(log.rows, [
        { old_value: null, new_value: "locked" },
        { old_value: "locked", new_value: "hidden" },
      ]);
      await refused(
        () => db.pool.query("update settings_log set key = 'x'"),
        "42501",
      );
      await refused(() => db.pool.query("delete from settings_log"), "42501");
      await refused(() => db.pool.query("truncate settings_log"), "42501");
    } finally {
      await db.drop();
    }
  },
);
