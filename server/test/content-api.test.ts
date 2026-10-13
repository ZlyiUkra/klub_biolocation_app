// The content read API (T030 of specs/001-self-hosted-club-site; contracts/http-api.md, "Content read").
// Needs the development database. It imports the site's real posts and videos into a throwaway database and reads
// them back over HTTP.

import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { importContent } from "../src/cli/import-content.js";
import { createApp } from "../src/http/app.js";
import {
  createTestDatabase,
  skipWithoutDatabase,
  type TestDatabase,
} from "./helpers/db.js";

const ORIGIN = "http://localhost:4321";
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
  const server = createApp({ pool: db.pool, siteOrigin: ORIGIN }).listen(0);
  await once(server, "listening");
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => new Promise((resolve) => server.close(() => resolve()));
});

after(async () => {
  if (skipWithoutDatabase) return;
  await close();
  await db.drop();
});

async function get(
  path: string,
): Promise<{ status: number; body: any; headers: Headers }> {
  const res = await fetch(base + path);
  return { status: res.status, body: await res.json(), headers: res.headers };
}

test(
  "the posts list holds the visible posts, newest first, and not the draft",
  { skip: skipWithoutDatabase },
  async () => {
    const { status, body, headers } = await get("/api/posts");
    assert.equal(status, 200);
    assert.equal(headers.get("cache-control"), "no-store");
    assert.equal(body.items.length, 23, "24 posts, one of them a draft");
    assert.ok(!body.items.some((i: { slug: string }) => i.slug === "draft"));
    const dates: number[] = body.items.map((i: { date: string }) =>
      Date.parse(i.date),
    );
    assert.deepEqual(
      [...dates].sort((a, b) => b - a),
      dates,
      "newest first",
    );
    const first = body.items[0];
    for (const key of [
      "slug",
      "title",
      "description",
      "date",
      "summary",
      "tags",
      "categories",
      "view",
    ]) {
      assert.ok(key in first, `a card carries ${key}`);
    }
    assert.equal(first.view, "full");
  },
);

test(
  "a list can be narrowed by tag or category and refuses nonsense",
  { skip: skipWithoutDatabase },
  async () => {
    const all = (await get("/api/posts")).body.items as {
      tags: string[];
      categories: string[];
    }[];
    const tag = all.find((i) => i.tags.length > 0)?.tags[0] as string;
    const narrowed = (await get(`/api/posts?tag=${encodeURIComponent(tag)}`))
      .body.items;
    assert.ok(narrowed.length >= 1 && narrowed.length <= all.length);
    assert.ok(narrowed.every((i: { tags: string[] }) => i.tags.includes(tag)));
    assert.equal((await get("/api/posts?tag=")).status, 400);
    assert.equal((await get("/api/posts?tag=a&tag=b")).status, 400);
    assert.equal((await get("/api/posts?tag=" + "x".repeat(61))).status, 400);
  },
);

test(
  "a post comes with its rendered body, its headings and its neighbours",
  { skip: skipWithoutDatabase },
  async () => {
    const list = (await get("/api/posts")).body.items as { slug: string }[];
    const middle = list[1] as { slug: string };
    const { status, body } = await get(`/api/posts/${middle.slug}`);
    assert.equal(status, 200);
    assert.equal(body.entry.view, "full");
    assert.equal(body.entry.content.kind, "post");
    assert.match(body.entry.content.html, /<p>/);
    assert.equal(
      body.next.slug,
      (list[0] as { slug: string }).slug,
      "the newer neighbour",
    );
    assert.equal(
      body.prev.slug,
      (list[2] as { slug: string }).slug,
      "the older neighbour",
    );
    const newest = (
      await get(`/api/posts/${(list[0] as { slug: string }).slug}`)
    ).body;
    assert.equal(newest.next, null, "nothing newer than the newest");
    const article = (await get("/api/posts/article")).body.entry.content;
    assert.ok(Array.isArray(article.headings) && article.headings.length > 0);
    assert.match(article.html, /astro-code/, "the code block is highlighted");
  },
);

test(
  "a hidden entry and a missing one are the same 404",
  { skip: skipWithoutDatabase },
  async () => {
    const hidden = await get("/api/posts/draft");
    const missing = await get("/api/posts/no-such-post");
    assert.equal(hidden.status, 404);
    assert.deepEqual(hidden.body, missing.body);
    assert.equal(hidden.body.error, "not_found");
    assert.equal(
      (await get("/api/videos/paid-demo")).status,
      404,
      "a hidden paid draft",
    );
  },
);

test(
  "videos: the public ones list, a paid lecture carries no embed id, its block comes apart",
  { skip: skipWithoutDatabase },
  async () => {
    const list = (await get("/api/videos")).body.items as { slug: string }[];
    assert.equal(
      list.length,
      21,
      "22 videos, one hidden draft (lecture-4 added 2026-10-11)",
    );
    const open = (await get("/api/videos/video-1")).body.entry;
    assert.equal(open.content.kind, "video");
    assert.equal(open.content.paid, false);
    assert.ok(open.content.externalId, "a public video has its embed id");
    assert.equal(open.content.duration, "12:34");
    const paid = (await get("/api/videos/lecture-part-3")).body.entry;
    assert.equal(paid.content.paid, true);
    assert.equal(paid.content.externalId, null);
    // Changed 2026-10-11 (T081): the setting is `locked` by default, so a guest receives no block at all; the cases
    // for a viewer with access and for the "hidden" setting are in members-block.test.ts.
    assert.equal(paid.content.membersOnlyHtml, null);
    assert.equal(paid.content.membersOnlyHidden, false);
    assert.doesNotMatch(
      paid.content.descriptionHtml,
      /Материалы к лекции|data-members-only/,
    );
  },
);

test(
  "terms count only what the viewer may see",
  { skip: skipWithoutDatabase },
  async () => {
    const { terms } = (await get("/api/terms")).body as {
      terms: { kind: string; name: string; count: number }[];
    };
    assert.ok(terms.length > 0);
    const video = terms.find((t) => t.kind === "tag" && t.name === "video");
    assert.ok(video, "the tag every video carries");
    const posts = (await get("/api/posts")).body.items.length;
    const videos = (await get("/api/videos")).body.items.length;
    assert.ok(video.count <= posts + videos);
    assert.ok(terms.every((t) => t.count > 0));
  },
);

// Changed 2026-10-10 (T163): the guest index is read through the search now (GET /api/search-index was removed).
test(
  "the guest search covers the visible entries and follows the content",
  { skip: skipWithoutDatabase },
  async () => {
    const a = (await get("/api/search")).body;
    assert.equal(
      a.total,
      44,
      "23 posts and 21 videos (lecture-4 added 2026-10-11)",
    );
    const draft = (await get("/api/search?q=draft")).body;
    assert.ok(!draft.results.some((i: { slug: string }) => i.slug === "draft"));

    await db.pool.query(
      "update entries set title = title || ' (edited)' where kind = 'post' and slug = 'article'",
    );
    const c = (await get("/api/search?q=%28edited%29")).body;
    assert.ok(
      c.results.some((i: { title: string }) => i.title.endsWith("(edited)")),
      "a write shows in the search at once",
    );
  },
);

test(
  "an unknown API route is still a JSON 404",
  { skip: skipWithoutDatabase },
  async () => {
    const res = await get("/api/nothing-here");
    assert.equal(res.status, 404);
    assert.equal(res.body.error, "not_found");
  },
);
