// One page of a list cut by the database (T162 of specs/001-self-hosted-club-site; GET /api/list).
// Needs the development database. It writes its own entries into a throwaway database and reads them back over HTTP.
//
// What is specified here: the year is the calendar year in the site's fixed offset (+03:00) and not UTC; years come
// from the data, so a library spanning forty years has forty of them and no year is spelled anywhere; a page is five
// entries; entries dated the same instant are ordered by the shared comparator, with posts before videos when kinds
// merge; a tag narrows both the years and the entries; a missing year or page is a 404; a future entry is absent.

import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import type { Pool } from "../src/db/pool.js";
import { createApp } from "../src/http/app.js";
import {
  createTestDatabase,
  skipWithoutDatabase,
  type TestDatabase,
} from "./helpers/db.js";

let db: TestDatabase;
let base: string;
let close: () => Promise<void>;

async function insert(
  pool: Pool,
  kind: "post" | "video",
  slug: string,
  title: string,
  publishedAt: string,
  tags: string[],
): Promise<void> {
  const entry = await pool.query(
    `insert into entries (kind, slug, title, audience, published_at)
     values ($1, $2, $3, 'everyone', $4) returning id`,
    [kind, slug, title, publishedAt],
  );
  const id = entry.rows[0].id;
  if (kind === "post") {
    await pool.query(
      `insert into posts (entry_id, body_markdown, body_html, headings, plain_text, summary, tags, categories, render_version)
       values ($1, 'text', '<p>text</p>', '[]', 'text', 'summary', $2, '{}', 1)`,
      [id, tags],
    );
  } else {
    await pool.query(
      `with v as (
         insert into videos (entry_id, description_markdown, description_html, paid, tags, categories, render_version)
         values ($1, 'text', '<p>text</p>', false, $2, '{}', 1) returning entry_id)
       insert into video_sources (entry_id, provider, reference) select entry_id, 'youtube', 'abc' from v`,
      [id, tags],
    );
  }
}

before(async () => {
  if (skipWithoutDatabase) return;
  db = await createTestDatabase();
  // Forty years of one post each, 1986 to 2025, and one entry in 2030 that is not yet published.
  for (let year = 1986; year <= 2025; year++) {
    await insert(
      db.pool,
      "post",
      `year-${year}`,
      `Year ${year}`,
      `${year}-06-15T12:00:00Z`,
      ["old"],
    );
  }
  await insert(
    db.pool,
    "post",
    "from-the-future",
    "Future",
    "2030-01-01T00:00:00Z",
    ["old"],
  );
  // The year boundary in the site's offset: 21:00 UTC on 31 December is midnight in +03:00 and belongs to the NEW year.
  await insert(
    db.pool,
    "post",
    "before-midnight",
    "Before midnight",
    "2023-12-31T20:59:59Z",
    ["edge"],
  );
  await insert(
    db.pool,
    "post",
    "after-midnight",
    "After midnight",
    "2023-12-31T21:00:00Z",
    ["edge"],
  );
  // Seven posts and a video in 2024, two pairs with the very same instant.
  const same = "2024-03-01T10:00:00Z";
  await insert(db.pool, "post", "b-post", "B post", same, ["busy"]);
  await insert(db.pool, "post", "a-post", "A post", same, ["busy"]);
  await insert(db.pool, "video", "a-video", "A video", same, ["busy"]);
  for (let i = 1; i <= 5; i++) {
    await insert(
      db.pool,
      "post",
      `busy-${i}`,
      `Busy ${i}`,
      `2024-0${i}-10T10:00:00Z`,
      ["busy"],
    );
  }
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

async function get(path: string): Promise<{ status: number; body: any }> {
  const res = await fetch(base + path);
  return { status: res.status, body: await res.json() };
}

type Slugged = { slug: string };

test(
  "the years come from the data: forty past years, no future one, newest first with counts",
  { skip: skipWithoutDatabase },
  async () => {
    const { status, body } = await get("/api/list?kind=post");
    assert.equal(status, 200);
    const years: string[] = body.years.map((y: { year: string }) => y.year);
    // 1986..2025 is forty years; 2023 and 2024 hold more than one entry, and the future year is absent.
    assert.equal(years.length, 40);
    assert.equal(years[0], "2025");
    assert.equal(years.at(-1), "1986");
    assert.ok(!years.includes("2030"));
    assert.deepEqual(
      years,
      [...years].sort((a, b) => Number(b) - Number(a)),
    );
    // With no year asked for, the newest year is shown.
    assert.equal(body.year, "2025");
    assert.deepEqual(
      body.items.map((i: Slugged) => i.slug),
      ["year-2025"],
    );
    assert.equal(body.last, 1);
  },
);

test(
  "a year is a calendar year in the site's offset, not in UTC",
  { skip: skipWithoutDatabase },
  async () => {
    // 2023-12-31T21:00:00Z is 2024-01-01 00:00 in +03:00.
    const edge = await get("/api/list?kind=post&tag=edge&year=2024");
    assert.deepEqual(
      edge.body.items.map((i: Slugged) => i.slug),
      ["after-midnight"],
    );
    const before2024 = await get("/api/list?kind=post&tag=edge&year=2023");
    assert.deepEqual(
      before2024.body.items.map((i: Slugged) => i.slug),
      ["before-midnight"],
    );
  },
);

test(
  "pages hold five entries, ties follow the shared order and posts come before videos",
  { skip: skipWithoutDatabase },
  async () => {
    const first = await get("/api/list?tag=busy&year=2024&page=1");
    assert.equal(first.status, 200);
    assert.equal(first.body.last, 2, "eight entries are two pages of five");
    assert.equal(first.body.items.length, 5);
    // Newest first; the three entries of the same instant: both posts (title order) and then the video.
    assert.deepEqual(
      first.body.items.map((i: Slugged) => i.slug),
      // 2024-05-10, 04-10, 03-10, then the three of 2024-03-01: two posts by title, then the video.
      ["busy-5", "busy-4", "busy-3", "a-post", "b-post"],
    );
    const second = await get("/api/list?tag=busy&year=2024&page=2");
    assert.deepEqual(
      second.body.items.map((i: Slugged) => i.slug),
      ["a-video", "busy-2", "busy-1"],
    );
    assert.deepEqual(first.body.years, [{ year: "2024", count: 8 }]);
  },
);

test(
  "a kind narrows the list and a missing year or page is a 404",
  { skip: skipWithoutDatabase },
  async () => {
    const videos = await get("/api/list?kind=video");
    assert.deepEqual(
      videos.body.items.map((i: Slugged) => i.slug),
      ["a-video"],
    );
    assert.equal((await get("/api/list?kind=post&year=2030")).status, 404);
    assert.equal((await get("/api/list?kind=post&year=1900")).status, 404);
    assert.equal(
      (await get("/api/list?tag=busy&year=2024&page=3")).status,
      404,
    );
    assert.equal((await get("/api/list?year=abc")).status, 400);
    assert.equal((await get("/api/list?kind=nothing")).status, 400);
  },
);

test(
  "a tag nobody has answers one empty page; its address still leads somewhere",
  { skip: skipWithoutDatabase },
  async () => {
    const { status, body } = await get("/api/list?tag=nobody-has-this");
    assert.equal(status, 200);
    assert.deepEqual(body, {
      items: [],
      year: null,
      page: 1,
      last: 1,
      years: [],
    });
    assert.equal(
      (await get("/api/list?tag=nobody-has-this&year=2024")).status,
      404,
    );
  },
);

test(
  "a guest's years are kept until the content changes, then they are read again",
  { skip: skipWithoutDatabase },
  async () => {
    const before = await get("/api/list?kind=post&tag=fresh");
    assert.equal(before.body.years.length, 0);
    // A second read is answered from what is kept; a new entry must still show at once.
    await get("/api/list?kind=post&tag=fresh");
    await insert(
      db.pool,
      "post",
      "fresh-post",
      "Fresh",
      "2025-02-02T10:00:00Z",
      ["fresh"],
    );
    const after = await get("/api/list?kind=post&tag=fresh");
    assert.deepEqual(after.body.years, [{ year: "2025", count: 1 }]);
    const terms = await get("/api/terms");
    assert.ok(
      terms.body.terms.some((t: { name: string }) => t.name === "fresh"),
    );
  },
);

test(
  "neighbours are found around the entry's date and agree with the full list, ties included",
  { skip: skipWithoutDatabase },
  async () => {
    const around = async (kind: "posts" | "videos", slug: string) => {
      const { body } = await get(`/api/${kind}/${slug}`);
      return [body.next?.slug ?? null, body.prev?.slug ?? null];
    };
    // Two posts of one instant ("A post" before "B post" by title), with newer and older entries on both sides.
    assert.deepEqual(await around("posts", "a-post"), ["busy-3", "b-post"]);
    assert.deepEqual(await around("posts", "b-post"), ["a-post", "busy-2"]);
    // The ends of the list: nothing newer than the newest, nothing older than the oldest.
    assert.deepEqual(await around("posts", "year-2025"), [null, "fresh-post"]);
    assert.deepEqual(await around("posts", "year-1986"), ["year-1987", null]);
    // A video is a neighbour of videos only.
    assert.deepEqual(await around("videos", "a-video"), [null, null]);
    // And every post agrees with the whole list, which is what the old code used.
    const { body } = await get("/api/posts");
    const slugs: string[] = body.items.map((i: Slugged) => i.slug);
    for (const [i, slug] of slugs.entries()) {
      assert.deepEqual(
        await around("posts", slug),
        [slugs[i - 1] ?? null, slugs[i + 1] ?? null],
        slug,
      );
    }
  },
);
