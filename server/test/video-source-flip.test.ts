// The rules for a video that changes between public and paid (migration 009; consilium of 2026-10-10,
// .specify/consilium/2026-10-10-video-source-structure.md). Needs the development database server.
//
// Specified here: a public video flipped to paid loses its public embed id as its source row, a paid video flipped to
// public must bring a new embed id and gets it as its row, and the database itself refuses a public video whose source
// has a provider that has no public embed id, whoever writes it.
//
// These queries select from `videos` and `video_sources` to assert on them; the boundary test of T024 looks at
// server/src, not at server/test.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pool } from "../src/db/pool.js";
import { createTestDatabase, skipWithoutDatabase } from "./helpers/db.js";

// store_video has 18 positional parameters; this keeps the order in one place.
async function storeVideo(
  pool: Pool,
  slug: string,
  options: { paid: boolean; platform?: string; externalId?: string | null },
): Promise<string> {
  const result = await pool.query(
    `select store_video($1, 'Title', 'Description', false, '2026-01-01T00:00:00Z', false,
                        'text', '<p>text</p>', '[]'::jsonb, null, null,
                        $2, $3, $4, null, '{}', '{}', 1) as outcome`,
    [
      slug,
      options.platform ?? "youtube",
      options.externalId === undefined ? null : options.externalId,
      options.paid,
    ],
  );
  return result.rows[0].outcome as string;
}

async function sourceOf(
  pool: Pool,
  slug: string,
): Promise<{ provider: string; reference: string } | undefined> {
  const result = await pool.query(
    `select s.provider, s.reference
       from entries e join video_sources s on s.entry_id = e.id
      where e.slug = $1 and e.kind = 'video'`,
    [slug],
  );
  return result.rows[0];
}

test(
  "a public video flipped to paid loses its public embed id as its source",
  { skip: skipWithoutDatabase },
  async () => {
    const db = await createTestDatabase();
    try {
      await storeVideo(db.pool, "flip", {
        paid: false,
        externalId: "publicId0001",
      });
      assert.deepEqual(await sourceOf(db.pool, "flip"), {
        provider: "youtube",
        reference: "publicId0001",
      });

      assert.equal(
        await storeVideo(db.pool, "flip", { paid: true, externalId: null }),
        "updated",
      );
      assert.equal(
        await sourceOf(db.pool, "flip"),
        undefined,
        "the old public id is not left behind as the secret",
      );

      // The real secret arrives through its own writer, and a paid lecture may use Yandex Disk.
      await db.pool.query(
        "select store_video_source('flip', 'yandex-disk', 'https://disk.yandex.ru/i/AbCdEfGh')",
      );
      assert.equal((await sourceOf(db.pool, "flip"))?.provider, "yandex-disk");

      // Running the same paid save again changes nothing and keeps the secret.
      assert.equal(
        await storeVideo(db.pool, "flip", { paid: true, externalId: null }),
        "unchanged",
      );
      assert.equal((await sourceOf(db.pool, "flip"))?.provider, "yandex-disk");
    } finally {
      await db.drop();
    }
  },
);

test(
  "a paid video flipped to public needs a new embed id and gets it as its source",
  { skip: skipWithoutDatabase },
  async () => {
    const db = await createTestDatabase();
    try {
      await storeVideo(db.pool, "back", { paid: true, externalId: null });
      await db.pool.query(
        "select store_video_source('back', 'yandex-disk', 'https://disk.yandex.ru/i/AbCdEfGh')",
      );

      await assert.rejects(
        storeVideo(db.pool, "back", { paid: false, externalId: null }),
        /needs its source reference/,
      );
      assert.equal(
        (await sourceOf(db.pool, "back"))?.provider,
        "yandex-disk",
        "a refused flip changes nothing",
      );

      await storeVideo(db.pool, "back", {
        paid: false,
        platform: "youtube",
        externalId: "newPublicId1",
      });
      assert.deepEqual(await sourceOf(db.pool, "back"), {
        provider: "youtube",
        reference: "newPublicId1",
      });
    } finally {
      await db.drop();
    }
  },
);

test(
  "a public video may be hosted on any registered provider, and a new provider is one row",
  { skip: skipWithoutDatabase },
  async () => {
    const db = await createTestDatabase();
    try {
      // Yandex Disk is a registered provider, so a public lecture may live there: its reference is the public link.
      await storeVideo(db.pool, "public-on-disk", {
        paid: false,
        platform: "yandex-disk",
        externalId: "https://disk.yandex.ru/i/AbCdEfGh",
      });
      assert.deepEqual(await sourceOf(db.pool, "public-on-disk"), {
        provider: "yandex-disk",
        reference: "https://disk.yandex.ru/i/AbCdEfGh",
      });

      // Vimeo is registered by migration 011, so a public video there is accepted at once.
      await storeVideo(db.pool, "on-vimeo", {
        paid: false,
        platform: "vimeo",
        externalId: "123456789",
      });
      assert.equal((await sourceOf(db.pool, "on-vimeo"))?.provider, "vimeo");

      // A provider nobody registered is refused, with the database's own sentence.
      await assert.rejects(
        storeVideo(db.pool, "on-other", {
          paid: false,
          platform: "dailymotion",
          externalId: "123456789",
        }),
        /unknown video provider dailymotion/,
      );
      assert.equal(await sourceOf(db.pool, "on-other"), undefined);

      // One row makes it known; no migration of a constraint, no change of code in the importer.
      await db.pool.query(
        "insert into video_providers (code, label) values ('dailymotion', 'Dailymotion')",
      );
      await storeVideo(db.pool, "on-other", {
        paid: false,
        platform: "dailymotion",
        externalId: "123456789",
      });
      assert.equal(
        (await sourceOf(db.pool, "on-other"))?.provider,
        "dailymotion",
      );

      // The foreign key stops a hand-made write of an unregistered provider too.
      await assert.rejects(
        db.pool.query(
          "update video_sources set provider = 'nowhere' where reference = '123456789'",
        ),
        /video_sources_provider_fkey/,
      );
    } finally {
      await db.drop();
    }
  },
);
