// The site's client of the backend (T031 of specs/001-self-hosted-club-site). Needs the development database: it
// imports the site's real content into a throwaway database, starts the application and reads it back through
// src/lib/api-client.ts the way a page will.

import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import {
  ApiError,
  getPost,
  getVideo,
  listPosts,
  listTerms,
  searchContent,
  listVideos,
} from "../../src/lib/api-client.js";
import { importContent } from "../src/cli/import-content.js";
import { createApp } from "../src/http/app.js";
import {
  createTestDatabase,
  skipWithoutDatabase,
  type TestDatabase,
} from "./helpers/db.js";

let db: TestDatabase;
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
  process.env["BACKEND_ORIGIN"] =
    `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  close = () => new Promise((resolve) => server.close(() => resolve()));
});

after(async () => {
  delete process.env["BACKEND_ORIGIN"];
  if (skipWithoutDatabase) return;
  await close();
  await db.drop();
});

test(
  "lists, entries, terms and the index come back typed and in order",
  { skip: skipWithoutDatabase },
  async () => {
    const posts = await listPosts();
    assert.equal(posts.length, 23);
    const videos = await listVideos();
    assert.equal(videos.length, 21); // lecture-4 added 2026-10-11

    const tag = posts.find((p) => p.tags.length > 0)?.tags[0] as string;
    const narrowed = await listPosts({ tag });
    assert.ok(
      narrowed.length >= 1 && narrowed.every((p) => p.tags.includes(tag)),
    );

    const second = posts[1] as { slug: string };
    const answer = await getPost(second.slug);
    assert.ok(answer);
    assert.equal(answer.entry.content?.kind, "post");
    assert.equal(answer.next?.slug, (posts[0] as { slug: string }).slug);

    const video = await getVideo("video-1");
    assert.equal(video?.entry.content?.kind, "video");

    assert.ok((await listTerms()).length > 0);
    // T163: the whole index is not an API any more; the search answers with how many entries it covers.
    assert.equal(
      (await searchContent({ q: "", sections: [], categories: [], tags: [] }))
        .total,
      44, // 23 posts and 21 videos; lecture-4 added 2026-10-11
    );
  },
);

test(
  "a hidden entry and a missing one are both null, and a slug is encoded",
  { skip: skipWithoutDatabase },
  async () => {
    assert.equal(await getPost("draft"), null);
    assert.equal(await getPost("no-such-post"), null);
    assert.equal(await getPost("a/../../etc"), null);
    assert.equal(await getVideo("paid-demo"), null);
  },
);

test("another failure throws ApiError with the status", async () => {
  const server = createServer((_req, res) => {
    res.statusCode = 500;
    res.end("{}");
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const saved = process.env["BACKEND_ORIGIN"];
  process.env["BACKEND_ORIGIN"] =
    `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await assert.rejects(listPosts(), (error: unknown) => {
      return error instanceof ApiError && error.status === 500;
    });
  } finally {
    if (saved === undefined) delete process.env["BACKEND_ORIGIN"];
    else process.env["BACKEND_ORIGIN"] = saved;
    server.close();
  }
});

test("the visitor's cookie is passed on, and nothing else about them", async () => {
  let seen: string | undefined;
  const server = createServer((req, res) => {
    seen = req.headers["cookie"];
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ items: [] }));
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const saved = process.env["BACKEND_ORIGIN"];
  process.env["BACKEND_ORIGIN"] =
    `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await listPosts({}, { cookie: "session=abc" });
    assert.equal(seen, "session=abc");
    seen = "unset";
    await listPosts();
    assert.equal(seen, undefined);
  } finally {
    if (saved === undefined) delete process.env["BACKEND_ORIGIN"];
    else process.env["BACKEND_ORIGIN"] = saved;
    server.close();
  }
});
