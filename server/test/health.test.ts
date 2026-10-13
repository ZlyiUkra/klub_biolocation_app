// /healthz and the API shell (T014 of specs/001-self-hosted-club-site). Needs the development database.

import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
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

test(
  "GET /healthz answers 200 and {ok:true} when the database answers",
  { skip: skipWithoutDatabase },
  async () => {
    const res = await fetch(base + "/healthz");
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.deepEqual(await res.json(), { ok: true });
  },
);

test(
  "GET /healthz answers 503 when the database does not",
  { skip: skipWithoutDatabase },
  async () => {
    // A second app over a pool that is already closed: every query on it fails.
    const dead = (await import("../src/db/pool.js")).createPool(db.url);
    await dead.end();
    const server = createApp({ pool: dead, siteOrigin: ORIGIN }).listen(0);
    await once(server, "listening");
    try {
      const port = (server.address() as AddressInfo).port;
      const res = await fetch(`http://127.0.0.1:${port}/healthz`);
      assert.equal(res.status, 503);
      assert.deepEqual(await res.json(), { ok: false });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);

test(
  "an unknown API route is a JSON 404 and a cross-site write is a 403",
  { skip: skipWithoutDatabase },
  async () => {
    const notFound = await fetch(base + "/api/nothing");
    assert.equal(notFound.status, 404);
    assert.equal(
      ((await notFound.json()) as { error: string }).error,
      "not_found",
    );

    const blocked = await fetch(base + "/api/nothing", {
      method: "POST",
      body: "{}",
    });
    assert.equal(blocked.status, 403);
  },
);
