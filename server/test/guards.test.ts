// Cross-site guard cases (T014 of specs/001-self-hosted-club-site). No database needed.

import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import express from "express";
import { errorHandler } from "../src/http/errors.js";
import { crossSiteGuard } from "../src/http/guards.js";

const ORIGIN = "http://localhost:4321";
let base: string;
let close: () => Promise<void>;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use(crossSiteGuard(ORIGIN));
  app.get("/x", (_req, res) => res.json({ ok: true }));
  app.post("/x", (_req, res) => res.json({ ok: true }));
  // Added 2026-10-12 (T098): the video upload path, the one write allowed to carry video/mp4 (guards.ts).
  app.put("/admin/videos/:id/file", (_req, res) => res.json({ ok: true }));
  app.put("/admin/other", (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  const server = app.listen(0);
  await once(server, "listening");
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => new Promise((resolve) => server.close(() => resolve()));
});

after(async () => {
  await close();
});

function post(headers: Record<string, string>) {
  return fetch(base + "/x", { method: "POST", headers, body: "{}" });
}

test("a same-origin JSON write passes", async () => {
  const res = await post({
    "content-type": "application/json",
    origin: ORIGIN,
    "sec-fetch-site": "same-origin",
  });
  assert.equal(res.status, 200);
});

// Added 2026-10-11: the guard may be given a list, which is how SITE_ORIGIN lists localhost and 127.0.0.1 together.
test("every origin of a list passes and any other is refused", async () => {
  const app = express();
  app.use(express.json());
  app.use(crossSiteGuard(["http://localhost:3000", "http://127.0.0.1:3000"]));
  app.post("/x", (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  const server = app.listen(0);
  await once(server, "listening");
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/x`;
  try {
    for (const [origin, status] of [
      ["http://localhost:3000", 200],
      ["http://127.0.0.1:3000", 200],
      ["http://localhost:4321", 403],
      ["http://localhost:3000.evil.example", 403],
    ] as const) {
      const res = await fetch(url, {
        method: "POST",
        // connection: close - this server is torn down at the end, and a kept-alive socket to a port that another
        // test's server later reuses makes the next fetch fail ("fetch failed") when files run in parallel.
        headers: {
          "content-type": "application/json",
          origin,
          connection: "close",
        },
        body: "{}",
      });
      assert.equal(res.status, status, origin);
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("a write without Origin is refused with cross_site", async () => {
  const res = await post({ "content-type": "application/json" });
  assert.equal(res.status, 403);
  assert.deepEqual((await res.json()) as { error: string }, {
    error: "cross_site",
    message: "The request did not come from this site.",
  });
});

test("a write from another origin is refused", async () => {
  const res = await post({
    "content-type": "application/json",
    origin: "https://evil.example",
  });
  assert.equal(res.status, 403);
});

test("a write that is not JSON is refused", async () => {
  const res = await post({ "content-type": "text/plain", origin: ORIGIN });
  assert.equal(res.status, 403);
});

test("a cross-site fetch-metadata header is refused even with the right Origin", async () => {
  const res = await post({
    "content-type": "application/json",
    origin: ORIGIN,
    "sec-fetch-site": "cross-site",
  });
  assert.equal(res.status, 403);
});

test("a GET needs none of it", async () => {
  const res = await fetch(base + "/x");
  assert.equal(res.status, 200);
});

// Added 2026-10-12 (T098): the exception for the upload is one method, one type and one path; the origin checks stay.
test("the video upload path takes a non-JSON body from the site's origin, and no other path does", async () => {
  const put = (
    path: string,
    headers: Record<string, string>,
    type = "video/mp4",
  ) =>
    fetch(base + path, {
      method: "PUT",
      headers: { "content-type": type, ...headers },
      body: "x",
    });
  assert.equal(
    (await put("/admin/videos/7/file", { origin: ORIGIN })).status,
    200,
  );
  assert.equal(
    (await put("/admin/videos/7/file", { origin: "https://evil.example" }))
      .status,
    403,
    "another origin",
  );
  assert.equal(
    (await put("/admin/videos/7/file", {})).status,
    403,
    "no origin",
  );
  assert.equal(
    (
      await put("/admin/videos/7/file", {
        origin: ORIGIN,
        "sec-fetch-site": "cross-site",
      })
    ).status,
    403,
    "cross-site fetch metadata",
  );
  assert.equal(
    (await put("/admin/other", { origin: ORIGIN })).status,
    403,
    "video/mp4 on another path",
  );
  assert.equal(
    (await put("/admin/videos/7/file", { origin: ORIGIN }, "text/plain"))
      .status,
    200,
    "the type of the upload is the route's to check, not the guard's",
  );
});

test("a charset parameter on the content type is accepted", async () => {
  const res = await post({
    "content-type": "application/json; charset=utf-8",
    origin: ORIGIN,
  });
  assert.equal(res.status, 200);
});
