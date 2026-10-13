// Who may play a lecture, and what the server answers when they may not (T075 of specs/001-self-hosted-club-site; the
// tests of plan phase 4 are written first, FR-024 to FR-027, contracts/http-api.md "Video", quickstart phase 4).
//
// This file ports the 56 cases of the access Worker's check (scripts/check-video-access.mjs, `npm run
// check:video-access`) to the self-hosted server, and adds what the Worker could not have: a recheck on every request,
// the 404 of an invisible entry and the 401 of a signed-out visitor of a paid entry that exists, the person's date and
// the video's own period of T152, and the internal location answering 404 when asked for directly.
//
// Where the 56 went (the Worker's cases, in the order of its script):
// - Routing and CORS (preflight from the site and from another site, GET not allowed, another path): gone. The routes
//   are the site's own and same-origin; the cross-site guard has its tests (guards.test.ts), and a wrong method or
//   path is the "wrong verb" case below.
// - Fourteen ways a token can be wrong (no token, not a JWT, alg none, HS256, unknown kid, another key, another
//   issuer, expired, not yet valid, another `azp`, no `azp`, no `sid`, pending session, key list unreachable): gone. A
//   session here is an opaque id held by the server (session.test.ts, viewer.test.ts); what is left of "no token" is
//   the 401 of a visitor with no session, and of "a session that ended" the 401 of the same visitor a moment later.
// - The status cases (a blocked paying member, a student, a blocked status with no paid access, the five statuses with
//   no paid access, the six spellings that do not open): the new rule is the person's date (T152): student, expert and
//   master need a date that has not passed, metr and admin need none, a blocked account is refused first, guest and a
//   signed-out visitor are refused. The six wrong spellings cannot be written in a status column (a CHECK refuses
//   them: schema-accounts.test.ts), so they have no case here.
// - The paid-access record (`member` false, "true" in quotes, null, absent, `memberUntil` absent, yesterday, a
//   `31.12.2099` text, `2099-02-31`, today as the last day): the record is a date column now, so the text cases cannot
//   exist (a column holds a real day or null, and the day shape is tested in lecture-access.test.ts); yesterday,
//   today as the last day and no date remain.
// - A known slug (the player address, `Cache-Control: private, no-store`, `Vary: Origin`; a request with no Origin),
//   an unknown slug, `__proto__`, a body that is not JSON, a slug that is not text: the address and the cache header
//   remain; `Vary: Origin` and the body cases are gone (a path segment, no body); the unknown slug and `__proto__`
//   remain.
// - Yandex Disk (not asked for a visitor with no access, a member gets a file address on Yandex's own host, the answer
//   carries no link, Yandex down, another host, a folder link): all remain, now against the adapter of T137.
// - A broken `VIDEOS` setting: becomes "an entry with no source answers 404 no_source" and "a provider that cannot be
//   asked answers 503 unavailable".
// - The timing of 200 requests (the 10 ms CPU limit of the free plan): gone, there is no such limit on the server.
//
// What the file tests need and does not exist yet (so they are marked `todo` and does not fail the run until
// its task lands, the way schema-content.test.ts did for T160):
// - T077: the table `video_files` (data-model.md).
// - T080: `GET /media/video/:slug`, answering a file source with 200 or 206 and the bytes (in development Express
//   serves the ranges itself; behind nginx the same checks end in `X-Accel-Redirect`). `createApp` takes the folder of
//   the volume as `videoRoot`.
// - T137 and T082: the address of a provider's source for the page, `GET /api/videos/:slug/source` -> 200
//   `{embedUrl}` or `{videoUrl}`. The contract has no such route yet: the name is proposed here and needs the owner's
//   word before T137 builds it.
// The refusals are the five states of T149: 401 (signed out, `{error:"signed_out"}`), 403 `forbidden` (signed in with
// no right), 403 `blocked`, 403 `expired` (the video's own period), 404 `no_source`, 503 `unavailable`. An invisible or
// missing entry is a plain 404 with `{error:"not_found"}`, like every other route.

import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createSession } from "../src/auth/session.js";
import { createApp } from "../src/http/app.js";
import {
  createTestDatabase,
  skipWithoutDatabase,
  type TestDatabase,
} from "./helpers/db.js";

const ORIGIN = "http://localhost:4321";
const waiting = "T080: the stream route is not built yet";
// Added 2026-10-11 (T137): the provider route exists, so its tests run for real; only the file tests wait for T077
// and T080.
const live = skipWithoutDatabase ? { skip: skipWithoutDatabase } : {};
const opts = live;

let db: TestDatabase;
let base: string;
let close: () => Promise<void>;
let volume: string;
const ids: Record<string, number> = {};
const cookies: Record<string, string> = {};

// The bytes of a pretend MP4: 2000 distinct values so that a range can be compared exactly.
const bytes = Buffer.from(Array.from({ length: 2000 }, (_, i) => i % 251));

// Yandex Disk's public API, made up as the Worker's check made it up: what it answers is picked by `yandex`, and every
// call is counted with the public link it asked about. Everything else goes through to the real fetch, because the
// test client uses the same one.
const yandexApi =
  "https://cloud-api.yandex.net/v1/disk/public/resources/download?public_key=";
let yandex: "ok" | "down" | "elsewhere" = "ok";
let yandexCalls = 0;
let yandexAskedFor = "";
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
  const address = String(
    typeof input === "object" && input !== null && "url" in input
      ? (input as { url: string }).url
      : input,
  );
  if (!address.startsWith(yandexApi)) {
    return realFetch(input as Parameters<typeof fetch>[0], init);
  }
  yandexCalls++;
  yandexAskedFor = decodeURIComponent(address.slice(yandexApi.length));
  if (yandex === "down") return new Response("down", { status: 503 });
  const host =
    yandex === "elsewhere" ? "evil.example" : "downloader.disk.yandex.ru";
  return new Response(
    JSON.stringify({ href: `https://${host}/disk/test?token=1` }),
  );
}) as typeof fetch;

/** A day relative to today's UTC day, as the database sees it. */
const day = (offset: number) =>
  `((now() at time zone 'utc')::date + (${offset})::int)`;

async function account(
  key: string,
  status: string,
  until: number | null,
): Promise<void> {
  const row = await db.pool.query(
    `insert into users (email, display_name, status, access_until, blocked_by, blocked_at)
     values ($1, $1, $2, ${until === null ? "null" : day(until)}, null,
             case when $2 = 'blocked' then now() end)
     returning id`,
    [`${key}@example.test`, status],
  );
  ids[key] = Number(row.rows[0].id);
  const { id } = await createSession(db.pool, {
    userId: ids[key]!,
    status: status as "guest",
  });
  cookies[key] = id;
}

/** A video entry; `source` is the paid secret or, for a free video, the embed id. */
async function video(
  slug: string,
  over: {
    paid?: boolean;
    until?: number | null;
    hidden?: boolean;
    provider?: string;
    reference?: string | null;
  } = {},
): Promise<number> {
  const paid = over.paid ?? true;
  const r = await db.pool.query(
    `select store_video($1, $1, '', $2, '2026-01-01T00:00:00Z'::timestamptz, false, 'd', '<p>d</p>', '[]'::jsonb, null, null,
                        'youtube', $3, $4, null, '{}', '{}', 1, ${over.until === undefined || over.until === null ? "null::date" : day(over.until)}) as outcome`,
    [slug, over.hidden ?? false, paid ? null : "abc123", paid],
  );
  assert.ok(["created", "updated", "unchanged"].includes(r.rows[0].outcome));
  if (paid && over.reference !== null) {
    await db.pool.query("select store_video_source($1, $2, $3)", [
      slug,
      over.provider ?? "youtube",
      over.reference ?? "paidSecret_01",
    ]);
  }
  const e = await db.pool.query(
    "select id from entries where kind = 'video' and slug = $1",
    [slug],
  );
  return Number(e.rows[0].id);
}

/** Registers `bytes` as the file of a video: a row of video_files (T077) and the file on the test volume. */
async function registerFile(slug: string, entryId: number): Promise<void> {
  const path = `${slug}.mp4`;
  await writeFile(join(volume, path), bytes);
  // What the register command does (T079): the file row goes in and the old source row goes out in ONE transaction,
  // because an entry never has both at commit and a public video never has neither.
  const client = await db.pool.connect();
  try {
    await client.query("begin");
    await client.query("delete from video_sources where entry_id = $1", [
      entryId,
    ]);
    await client.query(
      `insert into video_files (entry_id, volume_path, size_bytes, content_type, faststart_ok)
       values ($1, $2, $3, 'video/mp4', true)`,
      [entryId, path, bytes.length],
    );
    await client.query("commit");
  } finally {
    client.release();
  }
}

type Answer = {
  status: number;
  headers: Headers;
  buffer: Buffer;
  text: string;
  json: () => any;
};

async function get(
  path: string,
  who: string | null,
  extra: Record<string, string> = {},
  method = "GET",
): Promise<Answer> {
  const headers: Record<string, string> = { ...extra };
  if (who) headers["cookie"] = `__Host-session=${cookies[who]}`;
  const res = await fetch(base + path, { method, headers });
  const buffer = Buffer.from(await res.arrayBuffer());
  const text = buffer.toString("utf8");
  return {
    status: res.status,
    headers: res.headers,
    buffer,
    text,
    json: () => JSON.parse(text),
  };
}

const stream = (slug: string, who: string | null, extra = {}) =>
  get(`/media/video/${slug}`, who, extra);
const source = (slug: string, who: string | null) =>
  get(`/api/videos/${slug}/source`, who);

before(async () => {
  if (skipWithoutDatabase) return;
  db = await createTestDatabase();
  volume = await mkdtemp(join(tmpdir(), "kb-video-"));
  await mkdir(volume, { recursive: true });
  await account("admin", "admin", null);
  await account("metr", "metr", null);
  await account("guest", "guest", null);
  await account("payingGuest", "guest", 5);
  await account("lapsedGuest", "guest", -1);
  await account("studentToday", "student", 0);
  await account("studentYesterday", "student", -1);
  await account("studentNoDate", "student", null);
  await account("expert", "expert", 30);
  await account("master", "master", 30);
  await account("blockedWithDate", "blocked", 30);
  await account("blockedNoDate", "blocked", null);
  const server = createApp({
    pool: db.pool,
    siteOrigin: ORIGIN,
    // Proposed option (T080): the folder of the video volume.
    videoRoot: volume,
  } as Parameters<typeof createApp>[0]).listen(0);
  await once(server, "listening");
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => new Promise((resolve) => server.close(() => resolve()));
});
after(async () => {
  globalThis.fetch = realFetch;
  if (skipWithoutDatabase) return;
  await close();
  await db.drop();
  await rm(volume, { recursive: true, force: true });
});

// ---- a file on the server's volume: GET /media/video/:slug ----

test(
  "a file: the person's date decides, the last day counts, metr and admin need none (the Worker's status and paid-access cases)",
  opts,
  async () => {
    await registerFile(
      "file-lecture",
      await video("file-lecture", { reference: null }),
    );
    const open = [
      "studentToday",
      "payingGuest",
      "expert",
      "master",
      "metr",
      "admin",
    ];
    for (const who of open) {
      const a = await stream("file-lecture", who);
      assert.equal(a.status, 200, who);
      assert.deepEqual(a.buffer, bytes, `${who} gets the bytes`);
    }
    for (const who of [
      "studentYesterday",
      "studentNoDate",
      "lapsedGuest",
      "guest",
    ]) {
      const a = await stream("file-lecture", who);
      assert.equal(a.status, 403, who);
      assert.equal(a.json().error, "forbidden", who);
      assert.equal(
        a.buffer.includes(bytes.subarray(0, 64)),
        false,
        `${who} gets no bytes`,
      );
    }
  },
);

test(
  "a file: a blocked account is refused first, with its own word, date or no date",
  opts,
  async () => {
    for (const who of ["blockedWithDate", "blockedNoDate"]) {
      const a = await stream("file-lecture", who);
      assert.equal(a.status, 403, who);
      assert.equal(a.json().error, "blocked", who);
    }
  },
);

test(
  "a file: signed out is 401 for a paid entry that exists; a missing, hidden or odd slug is 404 for everybody",
  opts,
  async () => {
    const signedOut = await stream("file-lecture", null);
    assert.equal(signedOut.status, 401);
    assert.equal(signedOut.json().error, "signed_out");
    await video("hidden-lecture", { hidden: true, reference: null });
    for (const slug of [
      "no-such-lecture",
      "__proto__",
      "..%2Fetc%2Fpasswd",
      "hidden-lecture",
    ]) {
      for (const who of [null, "studentToday", "admin"]) {
        const a = await stream(slug, who);
        assert.equal(a.status, 404, `${slug} for ${who}`);
      }
    }
  },
);

test(
  "a file: a range is answered 206 with the exact bytes, and the answer is private and never cached",
  opts,
  async () => {
    const a = await stream("file-lecture", "studentToday", {
      range: "bytes=100-199",
    });
    assert.equal(a.status, 206);
    assert.deepEqual(a.buffer, bytes.subarray(100, 200));
    assert.equal(
      a.headers.get("content-range"),
      `bytes 100-199/${bytes.length}`,
    );
    assert.equal(a.headers.get("accept-ranges"), "bytes");
    assert.equal(a.headers.get("content-type"), "video/mp4");
    assert.match(a.headers.get("cache-control") ?? "", /private/);
    assert.match(a.headers.get("cache-control") ?? "", /no-store/);
    const tail = await stream("file-lecture", "studentToday", {
      range: "bytes=1900-",
    });
    assert.equal(tail.status, 206);
    assert.deepEqual(tail.buffer, bytes.subarray(1900));
    const beyond = await stream("file-lecture", "studentToday", {
      range: "bytes=5000-6000",
    });
    assert.equal(beyond.status, 416);
  },
);

test(
  "a file: the rights are checked on every request: block the student, and the next seek is refused",
  opts,
  async () => {
    await account("seeker", "student", 30);
    const before = await stream("file-lecture", "seeker", {
      range: "bytes=0-9",
    });
    assert.equal(before.status, 206);
    await db.pool.query(
      `update users set status = 'blocked', blocked_by = $2, blocked_at = now() where id = $1`,
      [ids["seeker"], ids["admin"]],
    );
    const seek = await stream("file-lecture", "seeker", {
      range: "bytes=1000-1009",
    });
    assert.ok([401, 403].includes(seek.status), `refused, got ${seek.status}`);
    assert.equal(seek.buffer.includes(bytes.subarray(1000, 1010)), false);
    // And the date: set it to yesterday and the next seek is refused too.
    await account("seeker2", "student", 30);
    assert.equal((await stream("file-lecture", "seeker2")).status, 200);
    await db.pool.query(
      `update users set access_until = ${day(-1)} where id = $1`,
      [ids["seeker2"]],
    );
    assert.equal((await stream("file-lecture", "seeker2")).status, 403);
  },
);

test(
  "a file: the video's own period (T152): after it nobody but metr and admin plays it, free ones included",
  opts,
  async () => {
    await registerFile(
      "ended-paid",
      await video("ended-paid", { until: -1, reference: null }),
    );
    await registerFile(
      "ended-free",
      await video("ended-free", { paid: false, until: -1 }),
    );
    for (const slug of ["ended-paid", "ended-free"]) {
      const student = await stream(slug, "studentToday");
      assert.equal(student.status, 403, slug);
      assert.equal(student.json().error, "expired", slug);
      assert.equal((await stream(slug, "metr")).status, 200, slug);
      assert.equal((await stream(slug, "admin")).status, 200, slug);
    }
  },
);

test(
  "a file: a free video plays for everybody, a visitor with no session and a blocked account included",
  opts,
  async () => {
    await registerFile("free-file", await video("free-file", { paid: false }));
    for (const who of [null, "guest", "blockedWithDate", "studentToday"]) {
      const a = await stream("free-file", who);
      assert.equal(a.status, 200, String(who));
      assert.deepEqual(a.buffer, bytes);
    }
  },
);

test(
  "the internal location is not reachable directly, and a wrong verb on the route is refused",
  opts,
  async () => {
    for (const path of [
      "/_video/file-lecture.mp4",
      "/_video/",
      "/_video/../x",
    ]) {
      const a = await get(path, "admin");
      assert.equal(a.status, 404, path);
      assert.equal(a.buffer.includes(bytes.subarray(0, 64)), false, path);
    }
    for (const method of ["POST", "PUT", "DELETE"]) {
      const a = await get("/media/video/file-lecture", "admin", {}, method);
      assert.ok([404, 405].includes(a.status), `${method} gave ${a.status}`);
    }
  },
);

test(
  "no answer names the volume path, the registered file or the provider's reference",
  opts,
  async () => {
    for (const who of [null, "guest", "studentYesterday", "blockedWithDate"]) {
      const a = await stream("file-lecture", who);
      assert.equal(a.text.includes("file-lecture.mp4"), false, String(who));
      assert.equal(a.text.includes(volume), false, String(who));
    }
  },
);

// ---- a provider's source: GET /api/videos/:slug/source ----

test(
  "a provider: a paid YouTube lecture gives a member the embed address, private and never cached; the others get the refusals",
  live,
  async () => {
    await video("paid-youtube", { reference: "M7lc1UVf-VE" });
    const ok = await source("paid-youtube", "studentToday");
    assert.equal(ok.status, 200);
    assert.equal(
      ok.json().embedUrl,
      "https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?rel=0",
    );
    assert.match(ok.headers.get("cache-control") ?? "", /private/);
    assert.match(ok.headers.get("cache-control") ?? "", /no-store/);
    assert.equal((await source("paid-youtube", "metr")).status, 200);
    assert.equal((await source("paid-youtube", null)).status, 401);
    assert.equal((await source("paid-youtube", "guest")).status, 403);
    assert.equal(
      (await source("paid-youtube", "studentYesterday")).status,
      403,
    );
    const blocked = await source("paid-youtube", "blockedWithDate");
    assert.equal(blocked.status, 403);
    assert.equal(blocked.json().error, "blocked");
    for (const slug of ["no-such-lecture", "__proto__"]) {
      assert.equal((await source(slug, "studentToday")).status, 404, slug);
    }
  },
);

test(
  "a provider: the reference of a refused visitor never appears in what is sent",
  live,
  async () => {
    for (const who of [null, "guest", "studentYesterday", "blockedWithDate"]) {
      const a = await source("paid-youtube", who);
      assert.equal(a.text.includes("M7lc1UVf-VE"), false, String(who));
    }
  },
);

test(
  "a provider: a paid entry with no source answers 404 no_source to a member",
  live,
  async () => {
    await video("paid-nothing", { reference: null });
    const a = await source("paid-nothing", "studentToday");
    assert.equal(a.status, 404);
    assert.equal(a.json().error, "no_source");
  },
);

test(
  "a provider: a lecture on Yandex Disk - not asked for a visitor with no right, the file address on Yandex's host for a member, no public link in the answer",
  live,
  async () => {
    await video("paid-disk", {
      provider: "yandex-disk",
      reference: "https://disk.yandex.ru/i/testKey-1",
    });
    const before = yandexCalls;
    for (const who of [null, "guest", "studentYesterday", "blockedWithDate"]) {
      await source("paid-disk", who);
    }
    assert.equal(
      yandexCalls,
      before,
      "Yandex is not asked for a visitor with no right",
    );
    const a = await source("paid-disk", "studentToday");
    assert.equal(a.status, 200);
    const answer = a.json();
    assert.equal(
      new URL(answer.videoUrl).hostname,
      "downloader.disk.yandex.ru",
    );
    assert.equal(answer.embedUrl, undefined);
    assert.equal(yandexAskedFor, "https://disk.yandex.ru/i/testKey-1");
    assert.equal(a.text.includes("testKey-1"), false);
    assert.match(a.headers.get("cache-control") ?? "", /no-store/);
  },
);

test(
  "a provider: Yandex Disk down, Yandex giving another host, a folder link: 503 unavailable, never the link",
  live,
  async () => {
    yandex = "down";
    const down = await source("paid-disk", "studentToday");
    assert.equal(down.status, 503);
    assert.equal(down.text.includes("testKey-1"), false);
    yandex = "elsewhere";
    const elsewhere = await source("paid-disk", "studentToday");
    assert.equal(elsewhere.status, 503);
    assert.equal(elsewhere.text.includes("evil.example"), false);
    yandex = "ok";
    await video("paid-folder", {
      provider: "yandex-disk",
      reference: "https://disk.yandex.ru/d/folderKey",
    });
    const folder = await source("paid-folder", "studentToday");
    assert.equal(folder.status, 503);
    assert.equal(folder.json().error, "unavailable");
  },
);

test(
  "the entry's own answer still hides the reference of a paid lecture from everybody, a member included",
  live,
  async () => {
    for (const who of [null, "studentToday", "admin"]) {
      const a = await get("/api/videos/paid-youtube", who);
      assert.equal(a.status, 200, String(who));
      assert.equal(a.text.includes("M7lc1UVf-VE"), false, String(who));
    }
  },
);

test(
  "behind nginx (an internal location is set): the route answers 200 with X-Accel-Redirect and no bytes; refusals are the same",
  live,
  async () => {
    const accel = createApp({
      pool: db.pool,
      siteOrigin: ORIGIN,
      videoRoot: volume,
      videoAccel: "/_video/",
    }).listen(0);
    await once(accel, "listening");
    const address = `http://127.0.0.1:${(accel.address() as AddressInfo).port}`;
    try {
      const ask = async (who: string | null) => {
        const headers: Record<string, string> = {};
        if (who) headers["cookie"] = `__Host-session=${cookies[who]}`;
        const res = await fetch(`${address}/media/video/file-lecture`, {
          headers,
        });
        return { res, body: Buffer.from(await res.arrayBuffer()) };
      };
      const open = await ask("studentToday");
      assert.equal(open.res.status, 200);
      assert.equal(
        open.res.headers.get("x-accel-redirect"),
        "/_video/file-lecture.mp4",
      );
      assert.equal(open.body.length, 0);
      assert.match(open.res.headers.get("cache-control") ?? "", /no-store/);
      assert.equal((await ask(null)).res.status, 401);
      const blocked = await ask("blockedWithDate");
      assert.equal(blocked.res.status, 403);
      assert.equal(blocked.res.headers.get("x-accel-redirect"), null);
    } finally {
      await new Promise<void>((resolve) => accel.close(() => resolve()));
    }
  },
);
