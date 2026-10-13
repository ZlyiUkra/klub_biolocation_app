// The built site behind the API (T036 of specs/001-self-hosted-club-site). No database: the pool is never used by the
// routes under test, and the "site" is a temporary directory and a fake handler, so this checks the mounting and not
// Astro.

import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createApp } from "../src/http/app.js";
import { loadSite, type Site } from "../src/http/site.js";

const dir = mkdtempSync(join(tmpdir(), "kb-site-"));
let base: string;
let close: () => Promise<void>;
let handlerArguments: number[] = [];

before(async () => {
  mkdirSync(join(dir, "client", "_astro"), { recursive: true });
  writeFileSync(join(dir, "client", "index.html"), "<p>static home</p>");
  writeFileSync(join(dir, "client", "_astro", "a.1234.css"), "body{}");
  writeFileSync(join(dir, "client", ".secret"), "no");
  const site: Site = {
    clientDir: join(dir, "client"),
    handler: (...args: unknown[]) => {
      handlerArguments.push(args.length);
      const res = args[1] as { statusCode: number; end(text: string): void };
      res.statusCode = 200;
      res.end("rendered on demand");
    },
  };
  const pool = {} as never;
  const server = createApp({
    pool,
    siteOrigin: "http://localhost:4321",
    site,
  }).listen(0);
  await once(server, "listening");
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => new Promise((resolve) => server.close(() => resolve()));
});

after(async () => {
  await close();
  rmSync(dir, { recursive: true, force: true });
});

test("a built file is served as a file, and a hashed asset is immutable", async () => {
  const page = await fetch(base + "/");
  assert.equal(await page.text(), "<p>static home</p>");
  const css = await fetch(base + "/_astro/a.1234.css");
  assert.equal(css.status, 200);
  assert.match(css.headers.get("cache-control") ?? "", /immutable/);
});

test("anything else goes to the handler, which is not given `next`", async () => {
  handlerArguments = [];
  const res = await fetch(base + "/posts/anything/");
  assert.equal(await res.text(), "rendered on demand");
  assert.deepEqual(handlerArguments, [2], "request and response only");
});

test("the API keeps its own JSON answers and is never the site's", async () => {
  const missing = await fetch(base + "/api/no-such-route");
  assert.equal(missing.status, 404);
  const body: { error: string } = JSON.parse(await missing.text());
  assert.equal(body.error, "not_found");
});

test("a dotfile in the built directory is not served as a file", async () => {
  handlerArguments = [];
  const res = await fetch(base + "/.secret");
  assert.equal(await res.text(), "rendered on demand");
});

test("a missing build is reported as null, not as an error", async () => {
  assert.equal(await loadSite(join(dir, "nothing-here")), null);
});
