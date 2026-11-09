// The site's own visit counter (T190 of specs/001-self-hosted-club-site; FR-048; migration 024; routes in
// server/src/views/routes.ts). Needs the development database for everything but the first block.
//
// What is fixed here (the owner's words of 2026-11-09):
// - The outside counter is replaced by the site's own: every load of a page counts, as the outside one counted, and the
//   numbers start at zero.
// - One number for the whole site and one for each post and video; a post or a video raises both, any other page raises
//   the site's alone.
// - Nothing about a visitor is stored, and the entry route follows the entry's visibility: an entry the viewer may not
//   see is a 404 and nothing is counted.
// - A load by a program that is not a person's browser (a crawler, a monitor, a command-line client) is answered with the
//   current numbers and not counted, and so is a load past the window of one address.

import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { createApp } from "../src/http/app.js";
import {
  botPattern,
  isPersonsBrowser,
  viewLimits,
} from "../src/views/routes.js";
import {
  createTestDatabase,
  skipWithoutDatabase,
  type TestDatabase,
} from "./helpers/db.js";

const opts = { skip: skipWithoutDatabase };
const ORIGIN = "http://localhost:4321";
const BROWSER =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ---- who is a person's browser (no database) ----

test("real browsers are counted and crawlers, monitors and command-line clients are not", () => {
  const people = [
    BROWSER,
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 EdgA/120.0.0.0",
  ];
  for (const agent of people)
    assert.equal(isPersonsBrowser(agent), true, agent);
  const programs = [
    undefined,
    "",
    "Googlebot/2.1 (+http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)",
    "Mozilla/5.0 (compatible; bingbot/2.0)",
    "facebookexternalhit/1.1",
    "Slackbot-LinkExpanding 1.0",
    "curl/8.4.0",
    "Wget/1.21",
    "python-requests/2.31.0",
    "Go-http-client/2.0",
    "okhttp/4.12.0",
    "UptimeRobot/2.0",
    "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0.0.0 Safari/537.36",
    "Chrome-Lighthouse",
  ];
  for (const agent of programs)
    assert.equal(isPersonsBrowser(agent), false, String(agent));
  assert.ok(botPattern instanceof RegExp);
});

// ---- the database ----

let db: TestDatabase;
let base: string;
let close: () => Promise<void>;
let counter = 0;

async function serve(): Promise<{ base: string; close: () => Promise<void> }> {
  const server = createApp({ pool: db.pool, siteOrigin: ORIGIN }).listen(0);
  await once(server, "listening");
  return {
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

type Answer = {
  status: number;
  body: { page?: unknown; site?: unknown; error?: string };
};

/** A load as a browser makes it: a POST of an empty JSON object, from the site's own origin. */
async function load(
  path: string,
  over: { agent?: string; json?: boolean; at?: string } = {},
): Promise<Answer> {
  const headers: Record<string, string> = {
    origin: ORIGIN,
    "user-agent": over.agent ?? BROWSER,
  };
  if (over.json !== false) headers["content-type"] = "application/json";
  const res = await fetch((over.at ?? base) + path, {
    method: "POST",
    headers,
    body: over.json === false ? undefined : "{}",
  });
  return { status: res.status, body: (await res.json()) as Answer["body"] };
}

async function entry(
  kind: "post" | "video",
  audience?: string,
): Promise<{ id: number; slug: string; path: string }> {
  const slug = `${kind}-${++counter}`;
  if (kind === "post") {
    await db.pool.query(
      `select store_post($1, 'A post', 'd', false, '2026-01-01T00:00:00Z'::timestamptz, null, null, null, 'b',
                         '<p>b</p>', '[]'::jsonb, 'b', 's', '{}', '{}', 1)`,
      [slug],
    );
  } else {
    await db.pool.query(
      `select store_video($1, 'A video', '', false, '2026-01-01T00:00:00Z'::timestamptz, false, 'd', '<p>d</p>',
                          '[]'::jsonb, null, null, 'youtube', null, true, null, '{}', '{}', 1)`,
      [slug],
    );
  }
  const row = await db.pool.query(
    "select id from entries where kind = $1 and slug = $2",
    [kind, slug],
  );
  const id = Number(row.rows[0].id);
  if (audience !== undefined)
    await db.pool.query("update entries set audience = $2 where id = $1", [
      id,
      audience,
    ]);
  return { id, slug, path: `/api/entries/${kind}/${slug}/views` };
}

const siteTotal = async (): Promise<number> =>
  Number(
    (await db.pool.query("select views from site_views where id")).rows[0]
      .views,
  );
const entryCount = async (id: number): Promise<number | null> => {
  const rows = (
    await db.pool.query("select views from entry_views where entry_id = $1", [
      id,
    ])
  ).rows;
  return rows.length === 0 ? null : Number(rows[0].views);
};

before(async () => {
  if (skipWithoutDatabase) return;
  db = await createTestDatabase();
  const served = await serve();
  base = served.base;
  close = served.close;
});
after(async () => {
  if (skipWithoutDatabase) return;
  await close();
  await db.drop();
});

test(
  "the site total starts at zero, in one row, and a second row cannot be made",
  opts,
  async () => {
    const rows = (await db.pool.query("select id, views from site_views")).rows;
    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0].views), 0);
    await assert.rejects(
      db.pool.query("insert into site_views (id, views) values (false, 0)"),
      /site_views_id_check|violates check constraint/,
    );
    assert.equal(
      (await db.pool.query("select count(*)::int as n from entry_views"))
        .rows[0].n,
      0,
      "no entry has a row before it is loaded",
    );
  },
);

test(
  "every load of a page that is not an entry raises the site total by one, and the answer is a number",
  opts,
  async () => {
    const first = await load("/api/views");
    assert.equal(first.status, 200);
    assert.deepEqual(first.body, { site: 1 });
    assert.equal(
      typeof first.body.site,
      "number",
      "int8 comes back as text and is turned into a number",
    );
    assert.deepEqual((await load("/api/views")).body, { site: 2 });
    assert.equal(await siteTotal(), 2);
  },
);

test(
  "a post or a video raises its own count and the site total, one by one",
  opts,
  async () => {
    const before = await siteTotal();
    const post = await entry("post");
    const video = await entry("video");

    assert.deepEqual((await load(post.path)).body, {
      page: 1,
      site: before + 1,
    });
    assert.deepEqual((await load(post.path)).body, {
      page: 2,
      site: before + 2,
    });
    assert.deepEqual((await load(video.path)).body, {
      page: 1,
      site: before + 3,
    });
    assert.deepEqual((await load(post.path)).body, {
      page: 3,
      site: before + 4,
    });

    assert.equal(await entryCount(post.id), 3);
    assert.equal(await entryCount(video.id), 1);
    assert.equal(await siteTotal(), before + 4);
  },
);

test(
  "an entry the viewer may not see is a 404 and nothing is counted, for it or for the site",
  opts,
  async () => {
    const before = await siteTotal();
    const hidden = await entry("post", "hidden");
    const answer = await load(hidden.path);
    assert.equal(answer.status, 404);
    assert.equal(answer.body.error, "not_found");
    assert.equal(await entryCount(hidden.id), null);
    assert.equal(await siteTotal(), before);

    // The same 404 for a kind that does not exist and for a slug that does not.
    assert.equal((await load("/api/entries/page/anything/views")).status, 404);
    assert.equal(
      (await load("/api/entries/post/no-such-slug/views")).status,
      404,
    );
    assert.equal(await siteTotal(), before);
  },
);

test(
  "a crawler or a command-line client gets the numbers and does not move them",
  opts,
  async () => {
    const post = await entry("post");
    await load(post.path);
    const total = await siteTotal();

    for (const agent of [
      "Googlebot/2.1",
      "curl/8.4.0",
      "python-requests/2.31.0",
    ]) {
      const asked = await load(post.path, { agent });
      assert.equal(asked.status, 200, agent);
      assert.deepEqual(asked.body, { page: 1, site: total }, agent);
      const site = await load("/api/views", { agent });
      assert.deepEqual(site.body, { site: total }, agent);
    }
    assert.equal(await entryCount(post.id), 1);
    assert.equal(await siteTotal(), total);
  },
);

test(
  "twenty loads at the same instant are twenty: none is lost",
  opts,
  async () => {
    const before = await siteTotal();
    const post = await entry("post");
    const answers = await Promise.all(
      Array.from({ length: 20 }, () => load(post.path)),
    );
    assert.ok(answers.every((a) => a.status === 200));
    // Every load saw a different count: the numbers 1 to 20 each came back exactly once.
    const pages = answers.map((a) => Number(a.body.page)).sort((a, b) => a - b);
    assert.deepEqual(
      pages,
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
    assert.equal(await entryCount(post.id), 20);
    assert.equal(await siteTotal(), before + 20);
  },
);

test(
  "a write that is not a JSON request from the site is refused like every other write",
  opts,
  async () => {
    const before = await siteTotal();
    const noType = await load("/api/views", { json: false });
    assert.equal(noType.status, 403);
    assert.equal(noType.body.error, "cross_site");
    assert.equal(await siteTotal(), before);
  },
);

test(
  "one address may add only so many loads inside the window; the rest get the numbers",
  opts,
  async () => {
    // A server of its own, so that its window is empty whatever the tests above have counted.
    const fresh = await serve();
    try {
      const before = await siteTotal();
      const extra = 5;
      let last: Answer | undefined;
      for (let i = 0; i < viewLimits.maxPerWindow + extra; i++) {
        last = await load("/api/views", { at: fresh.base });
        assert.equal(
          last.status,
          200,
          "a load past the window is not an error",
        );
      }
      assert.equal(await siteTotal(), before + viewLimits.maxPerWindow);
      assert.deepEqual(last?.body, { site: before + viewLimits.maxPerWindow });
    } finally {
      await fresh.close();
    }
  },
);
