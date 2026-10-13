// The pictures of the panel (T143 of specs/001-self-hosted-club-site, 2026-10-12): the upload, the check by content, the
// cap and the disk rule, the list, the public address, and that nobody but a metr or an admin may use the routes.
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createSession } from "../src/auth/session.js";
import { createApp } from "../src/http/app.js";
import { sniffImage } from "../src/content/images.js";
import {
  createTestDatabase,
  skipWithoutDatabase,
  type TestDatabase,
} from "./helpers/db.js";

const ORIGIN = "http://localhost:4321";
const MiB = 1024 * 1024;
let db: TestDatabase;
let volume: string;
let base: string;
let baseFullDisk: string;
const closers: (() => Promise<void>)[] = [];
const cookies: Record<string, string> = {};

async function seed(key: string, status: string) {
  const row = await db.pool.query(
    `insert into users (email, display_name, status) values ($1, $2, $3) returning id`,
    [`${key}@example.test`, key, status],
  );
  const { id } = await createSession(db.pool, {
    userId: Number(row.rows[0].id),
    status: status as "guest",
    limited: false,
  });
  cookies[key] = id;
}

async function listen(deps: Record<string, unknown>): Promise<string> {
  const server = createApp({
    pool: db.pool,
    siteOrigin: ORIGIN,
    videoRoot: volume,
    ...deps,
  }).listen(0);
  await once(server, "listening");
  closers.push(
    () => new Promise<void>((resolve) => server.close(() => resolve())),
  );
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

before(async () => {
  if (skipWithoutDatabase) return;
  db = await createTestDatabase();
  volume = await mkdtemp(join(tmpdir(), "kb-images-volume-"));
  await seed("admin", "admin");
  await seed("metr", "metr");
  await seed("student", "student");
  // A 1 MiB cap keeps the over-cap case small; the reserve is off so that the machine's own disk is not judged.
  base = await listen({ imageCapBytes: 1 * MiB, freeReserveBytes: 0 });
  baseFullDisk = await listen({
    imageCapBytes: 1 * MiB,
    freeReserveBytes: 1024 * MiB,
    volumeSpace: async () => ({ freeBytes: 10 * MiB, totalBytes: 100 * MiB }),
  });
});

after(async () => {
  if (skipWithoutDatabase) return;
  for (const close of closers) await close();
  await db.drop();
  await rm(volume, { recursive: true, force: true });
});

const opts = { skip: skipWithoutDatabase };

// The first bytes of each type, padded: enough for the content check, not a picture a browser would draw.
const png = (extra = 16) =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(extra, 7),
  ]);
const jpeg = () =>
  Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16, 3)]);
const gif = () =>
  Buffer.concat([Buffer.from("GIF89a", "latin1"), Buffer.alloc(16, 5)]);
const webp = () =>
  Buffer.concat([
    Buffer.from("RIFF", "latin1"),
    Buffer.from([16, 0, 0, 0]),
    Buffer.from("WEBP", "latin1"),
    Buffer.alloc(8, 1),
  ]);

async function put(
  bytes: Buffer,
  type: string,
  who: string | null,
  query = "",
  at = base,
) {
  const headers: Record<string, string> = {
    "content-type": type,
    origin: ORIGIN,
  };
  if (who) headers["cookie"] = `__Host-session=${cookies[who]}`;
  const res = await fetch(`${at}/api/admin/images${query}`, {
    method: "PUT",
    headers,
    body: bytes,
  });
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = undefined;
  }
  return { status: res.status, body, text };
}

async function list(who: string | null) {
  const headers: Record<string, string> = { origin: ORIGIN };
  if (who) headers["cookie"] = `__Host-session=${cookies[who]}`;
  const res = await fetch(`${base}/api/admin/images`, { headers });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
}

test("the content check knows the four types and nothing else", () => {
  assert.equal(sniffImage(png()), "png");
  assert.equal(sniffImage(jpeg()), "jpg");
  assert.equal(sniffImage(gif()), "gif");
  assert.equal(sniffImage(webp()), "webp");
  assert.equal(sniffImage(Buffer.from("<svg onload=alert(1)>")), null);
  assert.equal(sniffImage(Buffer.from("MZ binary")), null);
  assert.equal(sniffImage(Buffer.alloc(0)), null);
});

test(
  "a picture is stored under its hash, listed, served publicly and said once in the audit",
  opts,
  async () => {
    const bytes = png(64);
    const first = await put(
      bytes,
      "image/png",
      "admin",
      "?name=Схема%20урока.png",
    );
    assert.equal(first.status, 201, first.text);
    assert.match(first.body.image.url, /^\/images\/u\/[0-9a-f]{64}\.png$/);
    assert.equal(first.body.image.name, "Схема урока.png");
    assert.equal(first.body.existing, false);

    const served = await fetch(base + first.body.image.url);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get("content-type"), "image/png");
    assert.equal(served.headers.get("x-content-type-options"), "nosniff");
    assert.match(served.headers.get("cache-control") ?? "", /immutable/);
    assert.deepEqual(Buffer.from(await served.arrayBuffer()), bytes);

    // The same bytes again, by a metr: one file, one row, the first name stays.
    const again = await put(bytes, "image/png", "metr", "?name=other.png");
    assert.equal(again.status, 200);
    assert.equal(again.body.existing, true);
    assert.equal(again.body.image.url, first.body.image.url);
    const listed = await list("admin");
    assert.equal(listed.status, 200);
    assert.equal(listed.body.total, 1);
    assert.equal(listed.body.items[0].name, "Схема урока.png");
    assert.equal(listed.body.capBytes, 1 * MiB);

    const audits = await db.pool.query(
      "select action, detail from audit_log where action = 'image_uploaded'",
    );
    assert.equal(audits.rowCount, 1);
    assert.ok(!JSON.stringify(audits.rows).includes("урока"));
    assert.equal((await readdir(join(volume, "images"))).length, 1);
  },
);

test(
  "jpeg, webp and gif are taken, with the extension the content decided",
  opts,
  async () => {
    for (const [bytes, type, ext] of [
      [jpeg(), "image/jpeg", "jpg"],
      [webp(), "image/webp", "webp"],
      [gif(), "image/gif", "gif"],
    ] as const) {
      const r = await put(bytes, type, "admin");
      assert.equal(r.status, 201, r.text);
      assert.ok(r.body.image.url.endsWith(`.${ext}`));
    }
  },
);

test(
  "a file that is not the picture it says it is is refused, and svg is not a type",
  opts,
  async () => {
    const text = await put(
      Buffer.from("just some text, not a picture"),
      "image/png",
      "admin",
    );
    assert.equal(text.status, 422);
    assert.equal(text.body.reason, "not_an_image");
    const wrong = await put(png(), "image/jpeg", "admin");
    assert.equal(wrong.status, 422, "png bytes sent as jpeg");
    const svg = await put(Buffer.from("<svg></svg>"), "image/svg+xml", "admin");
    assert.equal(svg.status, 400);
    assert.equal(svg.body.problems[0].field, "Content-Type");
  },
);

test(
  "the cap and the disk rule are decided from the announced length",
  opts,
  async () => {
    const over = await put(Buffer.alloc(1 * MiB + 1, 1), "image/png", "admin");
    assert.equal(over.status, 413);
    assert.equal(over.body.reason, "over_cap");
    assert.equal(over.body.limitBytes, 1 * MiB);
    const full = await put(png(), "image/png", "admin", "", baseFullDisk);
    assert.equal(full.status, 413);
    assert.equal(full.body.reason, "no_space");
  },
);

test(
  "anyone who is not a metr or an admin is told there is no such route",
  opts,
  async () => {
    for (const who of [null, "student"] as const) {
      assert.equal((await put(png(), "image/png", who)).status, 404);
      assert.equal((await list(who)).status, 404);
    }
  },
);

test(
  "the name of a file is text for the list and never part of a path",
  opts,
  async () => {
    const hostile = await put(
      png(40),
      "image/png",
      "admin",
      `?name=${encodeURIComponent("../../etc/passwd\u0000.png")}`,
    );
    assert.equal(hostile.status, 201);
    assert.ok(!hostile.body.image.url.includes(".."));
    assert.equal(hostile.body.image.name.includes("\u0000"), false);
    const missing = await fetch(`${base}/images/u/${"0".repeat(64)}.png`);
    assert.equal(missing.status, 404);
  },
);
