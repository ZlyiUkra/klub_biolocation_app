// The sources of paid lectures (T136 of specs/001-self-hosted-club-site; migration 006). Needs the development
// database. The values below are made up; none is a real link or id.

import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { importContent } from "../src/cli/import-content.js";
import { parseSources, storeSources } from "../src/content/video-sources.js";
import { createApp } from "../src/http/app.js";
import {
  createTestDatabase,
  skipWithoutDatabase,
  type TestDatabase,
} from "./helpers/db.js";

const link = "https://disk.yandex.ru/i/AbCdEf_0123-xyz";
const sample = JSON.stringify({
  "paid-demo": "aBcDeFgHiJk",
  "lecture-part-3": { yandexDisk: link },
});

test("a sources file is read in the two shapes of the old Worker", () => {
  const sources = parseSources(sample);
  assert.deepEqual(sources.get("paid-demo"), {
    provider: "youtube",
    reference: "aBcDeFgHiJk",
  });
  assert.deepEqual(sources.get("lecture-part-3"), {
    provider: "yandex-disk",
    reference: link,
  });
});

test("anything else is refused whole, and the message never carries the value", () => {
  const bad = [
    "not json",
    "[]",
    JSON.stringify({ "Bad Slug": "aBcDeFgHiJk" }),
    JSON.stringify({ a: "short" }),
    JSON.stringify({ a: { yandexDisk: "http://disk.yandex.ru/i/x" } }),
    JSON.stringify({ a: { yandexDisk: link, extra: 1 } }),
    JSON.stringify({ a: { vk: "x" } }),
  ];
  for (const text of bad) {
    assert.throws(
      () => parseSources(text),
      (error: Error) => !error.message.includes("AbCdEf"),
    );
  }
});

let db: TestDatabase;
let base: string;
let close: () => Promise<void>;

before(async () => {
  if (skipWithoutDatabase) return;
  db = await createTestDatabase();
  await importContent(db.pool, {
    postsDir: fileURLToPath(
      new URL("../../../../src/content/posts/", import.meta.url),
    ),
    videoDir: fileURLToPath(
      new URL("../../../../src/content/video/", import.meta.url),
    ),
  });
  const server = createApp({
    pool: db.pool,
    siteOrigin: "http://localhost:4321",
  }).listen(0);
  await once(server, "listening");
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => new Promise((resolve) => server.close(() => resolve()));
});

after(async () => {
  if (skipWithoutDatabase) return;
  await close();
  await db.drop();
});

test(
  "sources are stored once, repeat as unchanged, and a changed one is updated",
  { skip: skipWithoutDatabase },
  async () => {
    const sources = parseSources(sample);
    assert.deepEqual(await storeSources(db.pool, sources), {
      created: 2,
      updated: 0,
      unchanged: 0,
    });
    assert.deepEqual(await storeSources(db.pool, sources), {
      created: 0,
      updated: 0,
      unchanged: 2,
    });
    const changed = parseSources(
      JSON.stringify({ "paid-demo": "zYxWvUtSrQp" }),
    );
    assert.deepEqual(await storeSources(db.pool, changed), {
      created: 0,
      updated: 1,
      unchanged: 0,
    });
  },
);

test(
  "a slug that is not a paid video stores nothing, the whole file included",
  { skip: skipWithoutDatabase },
  async () => {
    for (const slug of ["video-1", "no-such-video"]) {
      const sources = parseSources(
        JSON.stringify({ "paid-demo-2": "aBcDeFgHiJk", [slug]: "aBcDeFgHiJk" }),
      );
      await assert.rejects(storeSources(db.pool, sources));
    }
    // Changed 2026-10-10 (T160): every public video has its source in this table too, so only the paid ones are
    // counted; the two stored by the first test are what the failed runs must leave.
    const rows = await db.pool.query(
      `select count(*)::int as n from video_sources s join videos v on v.entry_id = s.entry_id where v.paid`,
    );
    assert.equal(rows.rows[0].n, 2, "nothing was added by the failed runs");
  },
);

test(
  "the API never shows a source",
  { skip: skipWithoutDatabase },
  async () => {
    await storeSources(db.pool, parseSources(sample));
    for (const path of [
      "/api/videos",
      "/api/videos/lecture-part-3",
      "/api/search",
      "/api/search?q=lecture",
    ]) {
      const text = await (await fetch(base + path)).text();
      assert.ok(!text.includes("AbCdEf"), `${path} leaked a link`);
      assert.ok(!text.includes("yandex"), `${path} names the provider`);
    }
  },
);
