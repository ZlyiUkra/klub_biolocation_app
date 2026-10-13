// Who may see which /auth/ page (T056 of specs/001-self-hosted-club-site; FR-016). The REAL built site behind the REAL
// backend on a throwaway database: the middleware of src/middleware.ts decides, so a fake handler would test nothing.
// Skipped when there is no database or the site has not been built (npm run build).
//
// What is pinned: a visitor with no session sees sign-in and sign-up and is sent from the account page to sign-in; a
// signed-in visitor is sent from sign-in and sign-up to `next` when it is a page of this site and to the account page
// otherwise (and never in a loop); a session that must change its password is sent to the account page from sign-in
// and sign-up, and is shown the account page; every redirect is no-store; a blocked account is an ordinary signed-in
// visitor; the rest of the site is open to a session that must change its password.

import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { createSession } from "../src/auth/session.js";
import { createApp } from "../src/http/app.js";
import { loadSite, type Site } from "../src/http/site.js";
import {
  createTestDatabase,
  skipWithoutDatabase,
  type TestDatabase,
} from "./helpers/db.js";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
let db: TestDatabase;
let site: Site | null = null;
let base = "";
let close: () => Promise<void>;
const cookies: Record<string, string> = {};
let previousOrigin: string | undefined;

const skip = (): string | false =>
  skipWithoutDatabase ||
  (site === null ? "the site is not built (npm run build)" : false);

before(async () => {
  if (skipWithoutDatabase) return;
  site = await loadSite(root);
  if (site === null) return;
  db = await createTestDatabase();
  const make = async (email: string, status: string, mustChange = false) => {
    const row = await db.pool.query(
      `insert into users (email, status, must_change, password_hash, blocked_at)
       values ($1, $2, $3, case when $3 then repeat('x', 30) end, case when $2 = 'blocked' then now() end)
       returning id`,
      [email, status, mustChange],
    );
    const { id } = await createSession(db.pool, {
      userId: Number(row.rows[0].id),
      status: status as "guest",
      limited: mustChange,
    });
    return id;
  };
  cookies["member"] = await make("member@example.test", "student");
  cookies["limited"] = await make("limited@example.test", "guest", true);
  cookies["blocked"] = await make("blocked@example.test", "blocked");
  const server = createApp({
    pool: db.pool,
    siteOrigin: "http://localhost:4321",
    site,
  }).listen(0);
  await once(server, "listening");
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // The site's page code asks the backend over this address; it is read on every call, so setting it here is enough.
  previousOrigin = process.env["BACKEND_ORIGIN"];
  process.env["BACKEND_ORIGIN"] = base;
  close = () => new Promise((resolve) => server.close(() => resolve()));
});

after(async () => {
  if (previousOrigin === undefined) delete process.env["BACKEND_ORIGIN"];
  else process.env["BACKEND_ORIGIN"] = previousOrigin;
  if (site !== null && !skipWithoutDatabase) {
    await close();
    await db.drop();
  }
});

async function visit(
  path: string,
  who?: "member" | "limited" | "blocked",
): Promise<{ status: number; location: string | null; cache: string | null }> {
  const res = await fetch(base + path, {
    redirect: "manual",
    headers: who ? { cookie: `__Host-session=${cookies[who]}` } : {},
  });
  await res.arrayBuffer();
  return {
    status: res.status,
    location: res.headers.get("location"),
    cache: res.headers.get("cache-control"),
  };
}

test("a visitor with no session sees sign-in and sign-up, and is sent from the account page to sign-in", async (t) => {
  if (skip()) return t.skip(String(skip()));
  assert.equal((await visit("/auth/signin/")).status, 200);
  assert.equal((await visit("/auth/signup/")).status, 200);
  const account = await visit("/auth/account/");
  assert.equal(account.status, 302);
  assert.equal(account.location, "/auth/signin/");
  assert.equal(account.cache, "no-store");
});

test("a signed-in visitor is sent from sign-in and sign-up to next, or to the account page, never in a loop", async (t) => {
  if (skip()) return t.skip(String(skip()));
  const plain = await visit("/auth/signin/", "member");
  assert.equal(plain.status, 302);
  assert.equal(plain.location, "/auth/account/");
  assert.equal(plain.cache, "no-store");

  const next = await visit(
    "/auth/signin/?next=%2Fvideo%2Fsome-lecture%2F%3Ft%3D90",
    "member",
  );
  assert.equal(next.location, "/video/some-lecture/?t=90");

  // Another host, a backslash trick and the sign-in page itself all fall back to the account page.
  for (const bad of [
    "https%3A%2F%2Fevil.example%2F",
    "%2F%5Cevil.example%2F",
    "%2Fauth%2Fsignin%2F",
    "%2Fauth%2Fsignup%2F%3Fnext%3D%2Fx",
  ]) {
    const result = await visit(`/auth/signin/?next=${bad}`, "member");
    assert.equal(result.location, "/auth/account/", bad);
  }
  const signup = await visit("/auth/signup/", "member");
  assert.equal(signup.location, "/auth/account/");
  assert.equal((await visit("/auth/account/", "member")).status, 200);
});

test("a session that must change its password is sent to the account page, which it is shown; the rest of the site is open to it", async (t) => {
  if (skip()) return t.skip(String(skip()));
  for (const path of ["/auth/signin/", "/auth/signup/"]) {
    const result = await visit(path, "limited");
    assert.equal(result.status, 302, path);
    assert.equal(result.location, "/auth/account/", path);
  }
  assert.equal((await visit("/auth/account/", "limited")).status, 200);
  assert.equal((await visit("/about/", "limited")).status, 200);
  assert.equal((await visit("/posts/", "limited")).status, 200);
});

test("a blocked account is an ordinary signed-in visitor of these pages", async (t) => {
  if (skip()) return t.skip(String(skip()));
  assert.equal(
    (await visit("/auth/signin/", "blocked")).location,
    "/auth/account/",
  );
  assert.equal((await visit("/auth/account/", "blocked")).status, 200);
});

test("a dead or invented session cookie is a visitor with no session", async (t) => {
  if (skip()) return t.skip(String(skip()));
  const res = await fetch(base + "/auth/account/", {
    redirect: "manual",
    headers: { cookie: "__Host-session=not-a-real-session-id" },
  });
  await res.arrayBuffer();
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "/auth/signin/");
});
