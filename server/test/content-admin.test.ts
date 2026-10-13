// The admin routes of posts and videos (T095 of specs/001-self-hosted-club-site; the routes are T097, the upload T098,
// the disk rule T138; the shapes are in contracts/http-api.md, "Posts and videos in the panel"). Written first: it is
// red until those tasks exist. Needs the development database.
//
// What it pins, for posts and for videos alike (the owner, 2026-10-12: the video flow is worked out like a post):
//   - the gate: anyone who is not a metr or an admin with a full session gets 404 on every route, and an editor gets
//     something else on the same routes, so a route that does not exist at all cannot pass for a closed one;
//   - the save: the rules of server/src/content/rules.ts, a refused save writes nothing, a slug never changes, the
//     audience form (restricted to statuses and to named people), the draft;
//   - `If-Match`: required, a stale save is 409 and writes nothing, the two-editor sequence that ends in a re-read;
//   - the soft delete and the restore, and that an address stays taken;
//   - the preview is the stored render, byte for byte, and hostile text is neutral in both;
//   - the sources of a video: a link, a file, the confirmed switch between them, a paid reference that is write-only;
//   - the upload: streamed (the memory of the process does not follow the file), faststart refused with nothing left on
//     the volume, the cap decided from `Content-Length`, and the raised body limit belonging to the admin routes only;
//   - the audit trail, which never carries a text or a reference.
// A 500 MiB upload is part of it (`KB_SKIP_BIG_UPLOAD=1` leaves that one test out).

import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { request as httpRequest } from "node:http";
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
const MiB = 1024 * 1024;
let db: TestDatabase;
let volume: string;
let base: string;
let baseDefaultCap: string;
const closers: (() => Promise<void>)[] = [];
const cookies: Record<string, string> = {};
const ids: Record<string, number> = {};

async function seed(key: string, status: string, limited = false) {
  // A blocked account names who blocked it (the table's users_blocked_pair rule).
  const blockedBy = status === "blocked" ? ids["admin"] : null;
  const row = await db.pool.query(
    `insert into users (email, display_name, status, blocked_by, blocked_at, password_hash, must_change)
     values ($1, $2, $3, $5, case when $3 = 'blocked' then now() end,
             case when $4 then repeat('x', 30) end, $4) returning id`,
    [`${key}@example.test`, key, status, limited, blockedBy],
  );
  ids[key] = Number(row.rows[0].id);
  const { id } = await createSession(db.pool, {
    userId: ids[key]!,
    status: status as "guest",
    limited,
  });
  cookies[key] = id;
}

async function listen(deps: {
  uploadCapBytes?: number;
  freeReserveBytes?: number;
  volumeSpace?: () => Promise<{ freeBytes: number; totalBytes: number }>;
}): Promise<string> {
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
  volume = await mkdtemp(join(tmpdir(), "kb-admin-volume-"));
  await seed("admin", "admin");
  await seed("metr", "metr");
  await seed("metr2", "metr");
  await seed("guest", "guest");
  await seed("student", "student");
  await seed("expert", "expert");
  await seed("blocked", "blocked");
  await seed("limitedMetr", "metr", true);
  // T138: these two apps switch the free-space reserve off; the disk of the machine that runs the tests is not theirs to
  // judge. The rule has tests of its own below, on an app with a simulated disk.
  base = await listen({ uploadCapBytes: 1 * MiB, freeReserveBytes: 0 });
  baseDefaultCap = await listen({ freeReserveBytes: 0 });
});

after(async () => {
  if (skipWithoutDatabase) return;
  for (const close of closers) await close();
  await db.drop();
  await rm(volume, { recursive: true, force: true });
});

type Answer = { status: number; body: any; headers: Headers; text: string };

async function call(
  method: string,
  path: string,
  who: string | null,
  body?: unknown,
  extra: Record<string, string> = {},
  at = base,
): Promise<Answer> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    origin: ORIGIN,
    ...extra,
  };
  if (who) headers["cookie"] = `__Host-session=${cookies[who]}`;
  const res = await fetch(at + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }
  return { status: res.status, body: parsed, headers: res.headers, text };
}

const opts = { skip: skipWithoutDatabase };
let counter = 0;
const nextSlug = (prefix: string) => `${prefix}-${++counter}`;

function postFields(over: Record<string, unknown> = {}) {
  return {
    slug: nextSlug("post"),
    title: "Запись панели",
    description: "Описание",
    publishedAt: "2026-10-01T12:00:00+03:00",
    tags: ["проверка"],
    categories: ["blog"],
    audience: "everyone",
    body: "Первый абзац.\n\n## Раздел\n\nТекст со *звёздочкой*.",
    ...over,
  };
}

function videoFields(over: Record<string, unknown> = {}) {
  return {
    slug: nextSlug("video"),
    title: "Лекция панели",
    description: "Описание лекции",
    publishedAt: "2026-10-02T12:00:00+03:00",
    tags: ["video"],
    categories: ["обучающие видео"],
    audience: "everyone",
    paid: false,
    availableUntil: null,
    body: "Текст под плеером.",
    membersOnly: null,
    // A public video is created with its link; a paid one may have no source yet (a file or a link comes next).
    ...(over["paid"] === true || "source" in over
      ? {}
      : { source: { provider: "youtube", reference: "dQw4w9WgXcQ" } }),
    ...over,
  };
}

async function createPost(over: Record<string, unknown> = {}, who = "admin") {
  const r = await call("POST", "/api/admin/posts", who, postFields(over));
  assert.equal(r.status, 201, r.text);
  return r.body.post as any;
}

async function createVideo(over: Record<string, unknown> = {}, who = "admin") {
  const r = await call("POST", "/api/admin/videos", who, videoFields(over));
  assert.equal(r.status, 201, r.text);
  return r.body.video as any;
}

const rows = async (sql: string, params: unknown[] = []) =>
  (await db.pool.query(sql, params)).rows as any[];
const count = async (table: string) =>
  Number((await rows(`select count(*)::int as n from ${table}`))[0].n);

// An MP4 built box by box, as faststart.test.ts does: the index before the media data or after it.
function box(type: string, payload: Buffer = Buffer.alloc(8)): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + payload.length, 0);
  head.write(type, 4, "latin1");
  return Buffer.concat([head, payload]);
}
const fastMp4 = (media = 32) =>
  Buffer.concat([box("ftyp"), box("moov"), box("mdat", Buffer.alloc(media))]);
const slowMp4 = () =>
  Buffer.concat([box("ftyp"), box("mdat", Buffer.alloc(32)), box("moov")]);

async function upload(
  id: number,
  who: string | null,
  bytes: Buffer,
  { type = "video/mp4", query = "", at = base } = {},
): Promise<Answer> {
  const headers: Record<string, string> = {
    "content-type": type,
    origin: ORIGIN,
  };
  if (who) headers["cookie"] = `__Host-session=${cookies[who]}`;
  const res = await fetch(`${at}/api/admin/videos/${id}/file${query}`, {
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
  return { status: res.status, body, headers: res.headers, text };
}

// ---- the gate ---------------------------------------------------------------------------------------------------

test(
  "anyone who is not a metr or an admin with a full session gets 404 on every route, and an editor does not",
  opts,
  async () => {
    const post = await createPost();
    const video = await createVideo();
    const routes: [string, string, unknown?][] = [
      ["GET", "/api/admin/posts"],
      ["GET", `/api/admin/posts/${post.id}`],
      ["POST", "/api/admin/posts", postFields()],
      ["PATCH", `/api/admin/posts/${post.id}`, { title: "x" }],
      ["DELETE", `/api/admin/posts/${post.id}`],
      ["POST", `/api/admin/posts/${post.id}/restore`, {}],
      ["GET", "/api/admin/videos"],
      ["GET", `/api/admin/videos/${video.id}`],
      ["POST", "/api/admin/videos", videoFields()],
      ["PATCH", `/api/admin/videos/${video.id}`, { title: "x" }],
      ["DELETE", `/api/admin/videos/${video.id}`],
      ["POST", `/api/admin/videos/${video.id}/restore`, {}],
      [
        "PUT",
        `/api/admin/videos/${video.id}/source`,
        { provider: "youtube", reference: "dQw4w9WgXcQ" },
      ],
      ["POST", "/api/admin/preview", { markdown: "x" }],
    ];
    const entriesBefore = await count("entries");
    const auditBefore = await count("audit_log");
    for (const who of [
      null,
      "limitedMetr",
      "guest",
      "student",
      "expert",
      "blocked",
    ]) {
      for (const [method, path, body] of routes) {
        const r = await call(method, path, who, body, {
          "if-match": '"x"',
        });
        assert.equal(r.status, 404, `${who} ${method} ${path}`);
        assert.equal(r.body?.error, "not_found", `${who} ${method} ${path}`);
      }
      const put = await upload(video.id, who, fastMp4());
      assert.equal(put.status, 404, `${who} PUT file`);
    }
    assert.equal(await count("entries"), entriesBefore);
    assert.equal(await count("audit_log"), auditBefore);
    // The control: the same GET routes are not 404 for the editors, so "404 everywhere" cannot pass for "closed".
    for (const who of ["metr", "admin"]) {
      for (const path of [
        "/api/admin/posts",
        `/api/admin/posts/${post.id}`,
        "/api/admin/videos",
        `/api/admin/videos/${video.id}`,
      ]) {
        assert.equal((await call("GET", path, who)).status, 200, path);
      }
      assert.equal(
        (await call("POST", "/api/admin/preview", who, { markdown: "x" }))
          .status,
        200,
      );
    }
  },
);

test(
  "a cross-site request to an admin route is refused before anything else",
  opts,
  async () => {
    const r = await fetch(`${base}/api/admin/preview`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://evil.example",
        cookie: `__Host-session=${cookies["admin"]}`,
      },
      body: JSON.stringify({ markdown: "x" }),
    });
    assert.equal(r.status, 403);
    assert.equal(((await r.json()) as any).error, "cross_site");
  },
);

// ---- posts: create, read, rules -----------------------------------------------------------------------------------

test(
  "a post is created, read back whole, listed, audited, and its stored render is the preview of its text",
  opts,
  async () => {
    const fields = postFields({
      tags: ["Биолокация", "проверка"],
      body: "Абзац со *звёздочкой* и [ссылкой](/posts/x/).\n\n## Раздел\n\nТекст.",
    });
    const created = await call("POST", "/api/admin/posts", "metr", fields);
    assert.equal(created.status, 201, created.text);
    const post = created.body.post;
    assert.equal(post.slug, fields.slug);
    assert.deepEqual(
      post.tags,
      ["биолокация", "проверка"],
      "tags are lower-case",
    );
    assert.equal(post.audience, "everyone");
    assert.equal(typeof post.updatedAt, "string");
    assert.equal(created.headers.get("cache-control"), "no-store");

    const got = await call("GET", `/api/admin/posts/${post.id}`, "admin");
    assert.equal(got.status, 200);
    assert.equal(
      got.body.post.body,
      fields.body,
      "the Markdown is kept as written",
    );
    assert.equal(got.headers.get("etag"), `"${got.body.post.updatedAt}"`);

    const listed = await call("GET", "/api/admin/posts?limit=100", "admin");
    assert.ok(
      listed.body.items.some(
        (i: any) => i.id === post.id && i.slug === fields.slug,
      ),
    );
    assert.ok(listed.body.total >= 1);

    const stored = (
      await rows(
        `select e.created_by, p.body_html, p.render_version from entries e join posts p on p.entry_id = e.id where e.id = $1`,
        [post.id],
      )
    )[0];
    assert.equal(
      Number(stored.created_by),
      ids["metr"],
      "the author is the actor",
    );
    const preview = await call("POST", "/api/admin/preview", "admin", {
      markdown: fields.body,
    });
    assert.equal(preview.status, 200);
    assert.equal(
      preview.body.html,
      stored.body_html,
      "preview equals the stored render",
    );
    // The preview is not gated (an editor sees what a paste would become), so hostile text is shown neutralised.
    const hostile = await call("POST", "/api/admin/preview", "admin", {
      markdown: "Текст <script>alert(1)</script> и [x](javascript:alert(1)).",
    });
    assert.equal(hostile.status, 200);
    assert.doesNotMatch(
      hostile.body.html,
      /<script|javascript:|onerror/i,
      "hostile text is neutral in the preview",
    );

    const audit = await rows(
      `select actor_id, action, target_kind, target_id, detail::text as detail from audit_log
        where target_id = $1 and action = 'entry_created'`,
      [post.id],
    );
    assert.equal(audit.length, 1);
    assert.equal(audit[0].target_kind, "entry");
    assert.equal(Number(audit[0].actor_id), ids["metr"]);
    assert.doesNotMatch(
      audit[0].detail,
      /Абзац|alert/,
      "the audit row names fields, not the text",
    );

    // On the public surface a guest sees it at once (the content version moved with the write).
    const publicList = await call("GET", "/api/posts", null);
    assert.ok(publicList.body.items.some((i: any) => i.slug === fields.slug));
  },
);

test(
  "a save that breaks a rule is 400 with the field and the code, and writes nothing",
  opts,
  async () => {
    const entriesBefore = await count("entries");
    const auditBefore = await count("audit_log");
    const cases: [string, Record<string, unknown>, string, string][] = [
      ["a slug that is a year", { slug: "2026" }, "slug", "reserved"],
      ["a slug with a capital", { slug: "Bad" }, "slug", "format"],
      ["an empty title", { title: " " }, "title", "required"],
      ["a title with a line break", { title: "a\nb" }, "title", "line_break"],
      [
        "a date without an offset",
        { publishedAt: "2026-10-01T10:00:00" },
        "publishedAt",
        "format",
      ],
      ["a script tag", { body: "<script>alert(1)</script>" }, "body", "html"],
      [
        "a javascript: link",
        { body: "[x](javascript:alert(1))" },
        "body",
        "link",
      ],
      [
        "the reference bypass of RISKS.md",
        {
          body:
            String.raw`[a\]b]` +
            "\n\n" +
            String.raw`[a\]b]: javascript:alert(1)`,
        },
        "body",
        "link",
      ],
      ["an unknown field", { access: "paid" }, "access", "unknown"],
    ];
    for (const [name, over, field, code] of cases) {
      const r = await call(
        "POST",
        "/api/admin/posts",
        "admin",
        postFields(over),
      );
      assert.equal(r.status, 400, `${name}: ${r.text}`);
      assert.equal(r.body.error, "invalid_input");
      assert.ok(
        r.body.problems.some((p: any) => p.field === field && p.code === code),
        `${name}: ${JSON.stringify(r.body.problems)}`,
      );
    }
    assert.equal(await count("entries"), entriesBefore);
    assert.equal(await count("audit_log"), auditBefore);
  },
);

test(
  "a taken address is 409 exists, a deleted entry's too, and the slug of a saved post never changes",
  opts,
  async () => {
    const post = await createPost();
    const again = await call(
      "POST",
      "/api/admin/posts",
      "admin",
      postFields({ slug: post.slug }),
    );
    assert.equal(again.status, 409);
    assert.equal(again.body.error, "conflict");
    assert.equal(again.body.reason, "exists");

    const got = await call("GET", `/api/admin/posts/${post.id}`, "admin");
    const renamed = await call(
      "PATCH",
      `/api/admin/posts/${post.id}`,
      "admin",
      { slug: "another-address" },
      { "if-match": got.headers.get("etag")! },
    );
    assert.equal(renamed.status, 400);
    assert.ok(
      renamed.body.problems.some(
        (p: any) => p.field === "slug" && p.code === "unknown",
      ),
    );

    assert.equal(
      (await call("DELETE", `/api/admin/posts/${post.id}`, "admin")).status,
      200,
    );
    const reuse = await call(
      "POST",
      "/api/admin/posts",
      "admin",
      postFields({ slug: post.slug }),
    );
    assert.equal(
      reuse.status,
      409,
      "the address of a deleted post stays taken",
    );
  },
);

// ---- If-Match ---------------------------------------------------------------------------------------------------

test(
  "a save needs If-Match, a stale one is 409 and writes nothing, and two editors end with a re-read",
  opts,
  async () => {
    const post = await createPost({ title: "Исходный" });
    const first = await call("GET", `/api/admin/posts/${post.id}`, "metr");
    const second = await call("GET", `/api/admin/posts/${post.id}`, "metr2");
    const tagA = first.headers.get("etag")!;
    const tagB = second.headers.get("etag")!;
    assert.equal(tagA, tagB);

    const without = await call("PATCH", `/api/admin/posts/${post.id}`, "metr", {
      title: "Без заголовка",
    });
    assert.equal(without.status, 400);
    assert.equal(without.body.error, "invalid_input");

    const saved = await call(
      "PATCH",
      `/api/admin/posts/${post.id}`,
      "metr",
      { title: "Первый" },
      { "if-match": tagA },
    );
    assert.equal(saved.status, 200, saved.text);
    assert.equal(saved.body.post.title, "Первый");
    assert.notEqual(
      saved.body.post.updatedAt,
      first.body.post.updatedAt,
      "the stamp moved",
    );

    const stale = await call(
      "PATCH",
      `/api/admin/posts/${post.id}`,
      "metr2",
      { title: "Второй" },
      { "if-match": tagB },
    );
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error, "conflict");
    assert.equal(stale.body.reason, "stale");
    assert.equal(stale.body.current.updatedAt, saved.body.post.updatedAt);
    assert.equal(
      (await rows("select title from entries where id = $1", [post.id]))[0]
        .title,
      "Первый",
      "nothing of the stale save was written",
    );

    const reread = await call("GET", `/api/admin/posts/${post.id}`, "metr2");
    const retried = await call(
      "PATCH",
      `/api/admin/posts/${post.id}`,
      "metr2",
      { title: "Второй" },
      { "if-match": reread.headers.get("etag")! },
    );
    assert.equal(retried.status, 200);
    assert.equal(retried.body.post.title, "Второй");
  },
);

test(
  "a partial save changes only what it names, renders again when the body changes, and is audited by field names",
  opts,
  async () => {
    const post = await createPost({ body: "Старый текст.", tags: ["a", "b"] });
    const before = (
      await rows(
        "select body_html, plain_text, summary from posts where entry_id = $1",
        [post.id],
      )
    )[0];
    const tag = (
      await call("GET", `/api/admin/posts/${post.id}`, "admin")
    ).headers.get("etag")!;

    const onlyTitle = await call(
      "PATCH",
      `/api/admin/posts/${post.id}`,
      "admin",
      { title: "Новый заголовок" },
      { "if-match": tag },
    );
    assert.equal(onlyTitle.status, 200);
    const unchanged = (
      await rows(
        "select body_html, plain_text, summary, tags from posts where entry_id = $1",
        [post.id],
      )
    )[0];
    assert.equal(unchanged.body_html, before.body_html);
    assert.deepEqual(unchanged.tags, ["a", "b"]);

    const body = await call(
      "PATCH",
      `/api/admin/posts/${post.id}`,
      "admin",
      { body: "Совсем **другой** текст." },
      { "if-match": `"${onlyTitle.body.post.updatedAt}"` },
    );
    assert.equal(body.status, 200);
    const changed = (
      await rows(
        "select body_html, plain_text, summary from posts where entry_id = $1",
        [post.id],
      )
    )[0];
    assert.match(changed.body_html, /<strong>другой<\/strong>/);
    assert.match(changed.plain_text, /Совсем другой текст/);
    assert.notEqual(changed.summary, before.summary);

    const audit = await rows(
      `select detail::text as detail from audit_log where target_id = $1 and action = 'entry_updated' order by id`,
      [post.id],
    );
    assert.equal(audit.length, 2);
    assert.match(audit[0].detail, /title/);
    assert.match(audit[1].detail, /body/);
    assert.doesNotMatch(audit[1].detail, /другой/);
  },
);

// ---- audience and draft -----------------------------------------------------------------------------------------

test(
  "the audience form: a draft is hidden, restricted to a status or to a named person, and the entry page agrees",
  opts,
  async () => {
    const draft = await createPost({ audience: "hidden" });
    assert.equal(
      (await call("GET", `/api/posts/${draft.slug}`, null)).status,
      404,
    );
    assert.equal(
      (await call("GET", `/api/posts/${draft.slug}`, "admin")).status,
      404,
      "a draft is not on the public route, even for an editor",
    );
    assert.equal(
      (await call("GET", `/api/admin/posts/${draft.id}`, "admin")).status,
      200,
      "it is in the panel",
    );

    const forExperts = await createPost({
      audience: "restricted",
      statuses: ["expert"],
    });
    assert.equal(
      (await call("GET", `/api/posts/${forExperts.slug}`, null)).status,
      404,
    );
    assert.equal(
      (await call("GET", `/api/posts/${forExperts.slug}`, "student")).status,
      404,
    );
    assert.equal(
      (await call("GET", `/api/posts/${forExperts.slug}`, "expert")).status,
      200,
    );

    const named = await createPost({
      audience: "restricted",
      userIds: [ids["student"]],
    });
    assert.equal(
      (await call("GET", `/api/posts/${named.slug}`, "student")).status,
      200,
    );
    assert.equal(
      (await call("GET", `/api/posts/${named.slug}`, "expert")).status,
      404,
    );

    const members = await createPost({ audience: "members" });
    assert.equal(
      (await call("GET", `/api/posts/${members.slug}`, null)).status,
      404,
    );
    assert.equal(
      (await call("GET", `/api/posts/${members.slug}`, "guest")).status,
      200,
    );

    const read = await call(
      "GET",
      `/api/admin/posts/${forExperts.id}`,
      "admin",
    );
    assert.deepEqual(read.body.post.statuses, ["expert"]);
    const bad = await call(
      "POST",
      "/api/admin/posts",
      "admin",
      postFields({ audience: "restricted", statuses: ["emperor"] }),
    );
    assert.equal(bad.status, 400);
  },
);

// ---- delete and restore -------------------------------------------------------------------------------------------

test(
  "a delete is soft: gone from every public surface, still readable by an editor, restorable, audited",
  opts,
  async () => {
    const post = await createPost();
    assert.equal(
      (await call("GET", `/api/posts/${post.slug}`, null)).status,
      200,
    );

    const deleted = await call("DELETE", `/api/admin/posts/${post.id}`, "metr");
    assert.equal(deleted.status, 200, deleted.text);
    assert.equal(
      (await call("GET", `/api/posts/${post.slug}`, null)).status,
      404,
    );
    assert.equal(
      (await call("GET", `/api/posts/${post.slug}`, "admin")).status,
      404,
      "not even for an editor on the public route",
    );
    const publicList = await call("GET", "/api/posts", null);
    assert.ok(!publicList.body.items.some((i: any) => i.slug === post.slug));
    const row = (
      await rows("select deleted_at from entries where id = $1", [post.id])
    )[0];
    assert.notEqual(row.deleted_at, null, "the row is kept");

    const still = await call("GET", `/api/admin/posts/${post.id}`, "admin");
    assert.equal(still.status, 200);
    assert.equal(still.body.post.deleted, true);
    const hidden = await call("GET", "/api/admin/posts?limit=100", "admin");
    assert.ok(
      !hidden.body.items.some((i: any) => i.id === post.id),
      "the list leaves it out",
    );
    const withDeleted = await call(
      "GET",
      "/api/admin/posts?deleted=1&limit=100",
      "admin",
    );
    assert.ok(
      withDeleted.body.items.some(
        (i: any) => i.id === post.id && i.deleted === true,
      ),
    );

    const restored = await call(
      "POST",
      `/api/admin/posts/${post.id}/restore`,
      "metr",
      {},
    );
    assert.equal(restored.status, 200);
    assert.equal(
      (await call("GET", `/api/posts/${post.slug}`, null)).status,
      200,
    );
    const actions = (
      await rows(
        "select action from audit_log where target_id = $1 order by id",
        [post.id],
      )
    ).map((r) => r.action);
    assert.deepEqual(actions, [
      "entry_created",
      "entry_deleted",
      "entry_restored",
    ]);
  },
);

// ---- preview ----------------------------------------------------------------------------------------------------

test(
  "the preview is the saved render for formulas and code too, and a large text goes through the raised limit",
  opts,
  async () => {
    const markdown =
      "Формула $a^2 + b^2$.\n\n```js\nconst x = 1;\n```\n\n[ссылка](/posts/x/)";
    const saved = await createPost({ body: markdown });
    const preview = await call("POST", "/api/admin/preview", "admin", {
      markdown,
    });
    const stored = (
      await rows("select body_html from posts where entry_id = $1", [saved.id])
    )[0];
    assert.equal(preview.body.html, stored.body_html);
    assert.match(preview.body.html, /katex/);

    const large = "Слово ".repeat(25_000); // 150 000 characters, about 275 kB on the wire: over 100 kB, under both caps
    const big = await call("POST", "/api/admin/preview", "admin", {
      markdown: large,
    });
    assert.equal(big.status, 200, big.text.slice(0, 120));

    const tooBig = await call("POST", "/api/admin/preview", "admin", {
      markdown: "а".repeat(300_000),
    });
    assert.equal(tooBig.status, 413);
    assert.equal(tooBig.body.error, "too_large");
  },
);

test(
  "the raised body limit belongs to the admin content routes only",
  opts,
  async () => {
    const filler = "x".repeat(150 * 1024);
    const other = await call("POST", "/api/auth/signin", null, {
      identifier: "a",
      password: filler,
    });
    assert.equal(
      other.status,
      413,
      "a 150 kB sign-in is over the 100 kB limit of everything else",
    );
    assert.equal(other.body.error, "too_large");
  },
);

// ---- videos ------------------------------------------------------------------------------------------------------

test(
  "a public video is created with its link, shown on the public page, and its reference is readable by an editor",
  opts,
  async () => {
    const created = await call(
      "POST",
      "/api/admin/videos",
      "admin",
      videoFields({
        source: { provider: "youtube", reference: "dQw4w9WgXcQ" },
      }),
    );
    assert.equal(created.status, 201, created.text);
    const video = created.body.video;
    assert.equal(video.paid, false);
    assert.equal(video.source.kind, "link");
    assert.equal(video.source.provider, "youtube");
    assert.equal(video.source.reference, "dQw4w9WgXcQ");
    const publicPage = await call("GET", `/api/videos/${video.slug}`, null);
    assert.equal(publicPage.status, 200);
    const noSource = await call(
      "POST",
      "/api/admin/videos",
      "admin",
      videoFields({ source: undefined }),
    );
    assert.equal(noSource.status, 400, "a public video needs its source");
    assert.ok(noSource.body.problems.some((p: any) => p.field === "source"));
  },
);

test(
  // Changed 2026-10-12 (the owner's order): the editor's own answers carry a paid reference (an editor cannot change
  // what he cannot see); the list, the public API and pages, and the audit rows still never do.
  "a paid lecture's reference is shown to the editor in his answers and in no list, page, public answer or audit row",
  opts,
  async () => {
    const secret = "https://disk.yandex.ru/i/SECRETlectureREFERENCE123";
    const created = await call(
      "POST",
      "/api/admin/videos",
      "admin",
      videoFields({
        paid: true,
        audience: "everyone",
        teaser: true,
        membersOnly: "Материалы к лекции.",
        source: { provider: "yandex-disk", reference: secret },
      }),
    );
    assert.equal(created.status, 201, created.text);
    const video = created.body.video;
    assert.deepEqual(video.source, {
      kind: "link",
      provider: "yandex-disk",
      referenceSet: true,
      reference: secret,
    });
    const opened = await call("GET", `/api/admin/videos/${video.id}`, "admin");
    assert.equal(opened.body.video.source.reference, secret);
    const everything = [
      (await call("GET", "/api/admin/videos?limit=100", "admin")).text,
      (await call("GET", `/api/videos/${video.slug}`, "admin")).text,
      (await call("GET", `/api/videos/${video.slug}`, null)).text,
      (await call("GET", "/api/videos", null)).text,
      JSON.stringify(await rows("select detail from audit_log")),
    ];
    for (const text of everything) assert.ok(!text.includes(secret));
    assert.equal(
      (
        await rows(
          "select count(*)::int as n from video_sources where entry_id = $1",
          [video.id],
        )
      )[0].n,
      1,
      "it is stored, for the access module only",
    );
  },
);

// Added 2026-10-12 (T175): the copy of a lecture is made by the server and carries the original's source over.
test(
  "a copy of a paid lecture is a draft with the same source, and no list or audit row carries the reference",
  opts,
  async () => {
    const secret = "https://disk.yandex.ru/i/COPYsecretREFERENCE987654";
    const original = (
      await call(
        "POST",
        "/api/admin/videos",
        "admin",
        videoFields({
          paid: true,
          audience: "everyone",
          membersOnly: "Материалы.",
          source: { provider: "yandex-disk", reference: secret },
        }),
      )
    ).body.video;
    const copied = await call(
      "POST",
      `/api/admin/videos/${original.id}/copy`,
      "admin",
      { slug: "lecture-copy" },
    );
    assert.equal(copied.status, 201, copied.text);
    assert.equal(copied.body.video.audience, "hidden");
    assert.equal(copied.body.video.paid, true);
    assert.equal(copied.body.video.membersOnly, "Материалы.");
    assert.deepEqual(copied.body.video.source, {
      kind: "link",
      provider: "yandex-disk",
      referenceSet: true,
      reference: secret,
    });
    const stored = await rows(
      "select reference from video_sources where entry_id = $1",
      [copied.body.video.id],
    );
    assert.equal(stored[0].reference, secret, "the copy holds the link too");
    const list = await call("GET", "/api/admin/videos?limit=100", "admin");
    const row = list.body.items.find((i: any) => i.slug === "lecture-copy");
    assert.deepEqual(row.source, { kind: "link", provider: "yandex-disk" });
    assert.equal(row.paid, true);
    for (const text of [
      list.text,
      JSON.stringify(await rows("select detail from audit_log")),
    ]) {
      assert.ok(!text.includes(secret));
    }
    const again = await call(
      "POST",
      `/api/admin/videos/${original.id}/copy`,
      "admin",
      { slug: "lecture-copy" },
    );
    assert.equal(again.status, 409);
    assert.equal(again.body.reason, "exists");
    assert.equal(
      (
        await call("POST", `/api/admin/videos/${original.id}/copy`, null, {
          slug: "x-copy",
        })
      ).status,
      404,
    );
  },
);

test(
  "a paid lecture's text is held to the guards: no YouTube address, no block in a public video",
  opts,
  async () => {
    const paid = await call(
      "POST",
      "/api/admin/videos",
      "admin",
      videoFields({
        paid: true,
        source: {
          provider: "yandex-disk",
          reference: "https://disk.yandex.ru/i/refkey",
        },
        body: "Смотреть: https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      }),
    );
    assert.equal(paid.status, 400);
    assert.ok(
      paid.body.problems.some((p: any) => p.code === "youtube_in_paid"),
    );
    const block = await call(
      "POST",
      "/api/admin/videos",
      "admin",
      videoFields({
        source: { provider: "youtube", reference: "dQw4w9WgXcQ" },
        membersOnly: "Закрытый блок.",
      }),
    );
    assert.equal(block.status, 400);
    assert.ok(
      block.body.problems.some((p: any) => p.code === "block_in_public"),
    );
  },
);

test(
  "a video has the same save, If-Match, draft and delete as a post",
  opts,
  async () => {
    const video = await createVideo({
      audience: "hidden",
      source: { provider: "youtube", reference: "dQw4w9WgXcQ" },
    });
    assert.equal(
      (await call("GET", `/api/videos/${video.slug}`, null)).status,
      404,
      "a draft",
    );
    const read = await call("GET", `/api/admin/videos/${video.id}`, "metr");
    const stale = await call(
      "PATCH",
      `/api/admin/videos/${video.id}`,
      "metr",
      { title: "x" },
      { "if-match": '"2000-01-01T00:00:00.000000Z"' },
    );
    assert.equal(stale.status, 409);
    const ok = await call(
      "PATCH",
      `/api/admin/videos/${video.id}`,
      "metr",
      { audience: "everyone", availableUntil: "2031-12-31" },
      { "if-match": read.headers.get("etag")! },
    );
    assert.equal(ok.status, 200, ok.text);
    assert.equal(ok.body.video.availableUntil, "2031-12-31");
    assert.equal(
      (await call("GET", `/api/videos/${video.slug}`, null)).status,
      200,
    );
    assert.equal(
      (await call("DELETE", `/api/admin/videos/${video.id}`, "metr")).status,
      200,
    );
    assert.equal(
      (await call("GET", `/api/videos/${video.slug}`, null)).status,
      404,
    );
  },
);

// ---- upload -----------------------------------------------------------------------------------------------------

test(
  "an upload is stored on the volume, registered with faststart verified, and audited",
  opts,
  async () => {
    const video = await createVideo({ paid: true, teaser: true });
    const bytes = fastMp4(64);
    const r = await upload(video.id, "admin", bytes);
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.body.video.source, {
      kind: "file",
      sizeBytes: bytes.length,
    });
    const file = (
      await rows(
        "select volume_path, size_bytes, faststart_ok from video_files where entry_id = $1",
        [video.id],
      )
    )[0];
    assert.equal(Number(file.size_bytes), bytes.length);
    assert.equal(file.faststart_ok, true);
    assert.equal(
      (await stat(join(volume, file.volume_path))).size,
      bytes.length,
    );
    const audit = await rows(
      `select detail::text as detail from audit_log where target_id = $1 and action = 'video_file_uploaded'`,
      [video.id],
    );
    assert.equal(audit.length, 1);
    assert.doesNotMatch(
      audit[0].detail,
      /\.mp4/,
      "no path on the volume in the audit row",
    );
  },
);

test(
  "a file that cannot start before it is fully downloaded is 422 and leaves nothing on the volume",
  opts,
  async () => {
    const video = await createVideo({ paid: true });
    const before = (await readdir(volume)).sort();
    const r = await upload(video.id, "admin", slowMp4());
    assert.equal(r.status, 422, r.text);
    assert.equal(r.body.error, "unprocessable");
    assert.equal(r.body.reason, "not_faststart");
    assert.deepEqual((await readdir(volume)).sort(), before);
    assert.equal(
      (await rows("select 1 from video_files where entry_id = $1", [video.id]))
        .length,
      0,
    );
  },
);

test(
  "an upload that is not an MP4, to a missing video, or over the cap, is refused and writes nothing",
  opts,
  async () => {
    const video = await createVideo({ paid: true });
    const before = (await readdir(volume)).sort();
    const wrongType = await upload(video.id, "admin", fastMp4(), {
      type: "text/plain",
    });
    assert.equal(wrongType.status, 400);
    const missing = await upload(999_999, "admin", fastMp4());
    assert.equal(missing.status, 404);
    const over = await upload(
      video.id,
      "admin",
      Buffer.concat([fastMp4(), Buffer.alloc(1 * MiB)]),
    );
    assert.equal(over.status, 413, "the test app's cap is 1 MiB");
    assert.equal(over.body.error, "too_large");
    assert.deepEqual((await readdir(volume)).sort(), before);
  },
);

test(
  "a second file or a link over a registered file needs a confirmation, and the old bytes stay",
  opts,
  async () => {
    const video = await createVideo({ paid: true });
    const first = await upload(video.id, "admin", fastMp4(40));
    assert.equal(first.status, 200);
    const path = (
      await rows("select volume_path from video_files where entry_id = $1", [
        video.id,
      ])
    )[0].volume_path;

    const again = await upload(video.id, "admin", fastMp4(48));
    assert.equal(again.status, 409);
    assert.equal(again.body.reason, "has_source");

    const link = await call(
      "PUT",
      `/api/admin/videos/${video.id}/source`,
      "admin",
      { provider: "youtube", reference: "dQw4w9WgXcQ" },
    );
    assert.equal(link.status, 409);
    assert.equal(link.body.reason, "has_file");
    assert.equal(
      (await rows("select 1 from video_files where entry_id = $1", [video.id]))
        .length,
      1,
    );

    const confirmed = await call(
      "PUT",
      `/api/admin/videos/${video.id}/source`,
      "admin",
      {
        provider: "youtube",
        reference: "dQw4w9WgXcQ",
        replace: true,
      },
    );
    assert.equal(confirmed.status, 200, confirmed.text);
    assert.equal(confirmed.body.video.source.kind, "link");
    assert.equal(
      (await rows("select 1 from video_files where entry_id = $1", [video.id]))
        .length,
      0,
    );
    assert.equal(
      (await stat(join(volume, path))).size,
      fastMp4(40).length,
      "nothing was deleted from the volume",
    );
    const actions = (
      await rows(
        "select action from audit_log where target_id = $1 order by id",
        [video.id],
      )
    ).map((r) => r.action);
    assert.ok(
      actions.includes("video_file_uploaded") &&
        actions.includes("video_source_set"),
    );

    const back = await upload(video.id, "admin", fastMp4(56), {
      query: "?replace=1",
    });
    assert.equal(back.status, 200, back.text);
    assert.equal(back.body.video.source.kind, "file");
    assert.equal(
      (
        await rows("select 1 from video_sources where entry_id = $1", [
          video.id,
        ])
      ).length,
      0,
    );
  },
);

// ---- the big one: streamed, not buffered; the cap from Content-Length ------------------------------------------------

function mp4Head(mediaBytes: number): Buffer {
  // ftyp, moov, then a 64-bit-size mdat header whose payload the caller streams.
  const mdat = Buffer.alloc(16);
  mdat.writeUInt32BE(1, 0);
  mdat.write("mdat", 4, "latin1");
  mdat.writeBigUInt64BE(BigInt(16 + mediaBytes), 8);
  return Buffer.concat([box("ftyp"), box("moov"), mdat]);
}

const bigOpts = {
  skip:
    skipWithoutDatabase || process.env["KB_SKIP_BIG_UPLOAD"] === "1"
      ? "database or KB_SKIP_BIG_UPLOAD"
      : false,
  timeout: 180_000,
};

test(
  "a file of exactly the default cap, 500 MiB, is streamed to the volume without buffering it",
  bigOpts,
  async () => {
    const video = await createVideo({ paid: true });
    const head = mp4Head(0);
    const media = 500 * MiB - head.length; // the whole file is 500 MiB, mdat header included
    const total = head.length + media;
    assert.equal(total, 500 * MiB);
    const chunk = Buffer.alloc(1 * MiB, 7);
    async function* body(): AsyncGenerator<Buffer> {
      yield head;
      let left = media;
      while (left > 0) {
        const part = left >= chunk.length ? chunk : chunk.subarray(0, left);
        left -= part.length;
        yield part;
      }
    }
    // mp4Head(0) wrote the mdat size for zero media; patch it for the real payload.
    head.writeBigUInt64BE(BigInt(16 + media), head.length - 8);

    const rssBefore = process.memoryUsage().rss;
    let peak = rssBefore;
    const timer = setInterval(() => {
      peak = Math.max(peak, process.memoryUsage().rss);
    }, 50);
    let status = 0;
    let text = "";
    try {
      const res = await fetch(
        `${baseDefaultCap}/api/admin/videos/${video.id}/file`,
        {
          method: "PUT",
          headers: {
            "content-type": "video/mp4",
            "content-length": String(total),
            origin: ORIGIN,
            cookie: `__Host-session=${cookies["admin"]}`,
          },
          body: ReadableStream.from(body()),
          // Node's fetch needs `duplex` for a streamed request body.
          duplex: "half",
        },
      );
      status = res.status;
      text = await res.text();
    } finally {
      clearInterval(timer);
    }
    assert.equal(status, 200, text.slice(0, 200));
    const file = (
      await rows(
        "select volume_path, size_bytes from video_files where entry_id = $1",
        [video.id],
      )
    )[0];
    assert.equal(Number(file.size_bytes), total);
    assert.equal((await stat(join(volume, file.volume_path))).size, total);
    assert.ok(
      peak - rssBefore < 200 * MiB,
      `the process grew by ${Math.round((peak - rssBefore) / MiB)} MiB for a 500 MiB upload`,
    );
    await rm(join(volume, file.volume_path), { force: true });
  },
);

test(
  "one byte over the default cap is 413 from Content-Length alone, before any byte is read",
  opts,
  async () => {
    const video = await createVideo({ paid: true });
    const before = (await readdir(volume)).sort();
    const url = new URL(`${baseDefaultCap}/api/admin/videos/${video.id}/file`);
    const status = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        {
          host: url.hostname,
          port: url.port,
          path: url.pathname,
          method: "PUT",
          headers: {
            "content-type": "video/mp4",
            "content-length": String(500 * MiB + 1),
            origin: ORIGIN,
            cookie: `__Host-session=${cookies["admin"]}`,
          },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
          req.destroy();
        },
      );
      req.on("error", (e) => {
        if ((e as NodeJS.ErrnoException).code === "ECONNRESET") return;
        reject(e);
      });
      req.write(Buffer.alloc(16)); // a few bytes, never the 500 MiB the header promises
    });
    assert.equal(status, 413);
    assert.deepEqual((await readdir(volume)).sort(), before);
  },
);

// ---- the disk rule (T138) ---------------------------------------------------------------------------------------------

test(
  "an upload that would leave less than the reserve free is refused from the announced length, and the panel can ask for the room",
  opts,
  async () => {
    // A simulated disk: 100 MiB free, 8 MiB reserve, 50 MiB cap, so the room is 50 MiB; then 10 MiB free, room 2 MiB.
    let free = 100 * MiB;
    const at = await listen({
      uploadCapBytes: 50 * MiB,
      freeReserveBytes: 8 * MiB,
      volumeSpace: async () => ({ freeBytes: free, totalBytes: 1000 * MiB }),
    });
    const room = await call(
      "GET",
      "/api/admin/videos/space",
      "admin",
      undefined,
      {},
      at,
    );
    assert.equal(room.status, 200, room.text);
    assert.deepEqual(room.body, {
      freeBytes: 100 * MiB,
      totalBytes: 1000 * MiB,
      reserveBytes: 8 * MiB,
      capBytes: 50 * MiB,
      roomBytes: 50 * MiB,
    });
    free = 10 * MiB;
    const tight = await call(
      "GET",
      "/api/admin/videos/space",
      "metr",
      undefined,
      {},
      at,
    );
    assert.equal(tight.body.roomBytes, 2 * MiB);
    free = 0;
    assert.equal(
      (await call("GET", "/api/admin/videos/space", "metr", undefined, {}, at))
        .body.roomBytes,
      0,
      "never negative",
    );

    free = 10 * MiB;
    const video = await createVideo({ paid: true });
    const before = (await readdir(volume)).sort();
    const big = fastMp4(3 * MiB);
    const refused = await upload(video.id, "admin", big, { at });
    assert.equal(refused.status, 413, refused.text);
    assert.equal(refused.body.error, "too_large");
    assert.equal(refused.body.reason, "no_space");
    assert.equal(refused.body.freeBytes, 10 * MiB);
    assert.deepEqual(
      (await readdir(volume)).sort(),
      before,
      "nothing left on the volume",
    );
    assert.equal(
      (await rows("select 1 from video_files where entry_id = $1", [video.id]))
        .length,
      0,
    );

    // The same file once the room is there, and a file over the cap is the other reason.
    free = 100 * MiB;
    const ok = await upload(video.id, "admin", big, { at });
    assert.equal(ok.status, 200, ok.text);
    const other = await createVideo({ paid: true });
    const over = await upload(
      other.id,
      "admin",
      Buffer.concat([fastMp4(), Buffer.alloc(50 * MiB)]),
      { at },
    );
    assert.equal(over.status, 413);
    assert.equal(over.body.reason, "over_cap");
  },
);

test(
  "the free-space route is closed to everyone but the editors",
  opts,
  async () => {
    for (const who of [
      null,
      "guest",
      "student",
      "expert",
      "blocked",
      "limitedMetr",
    ]) {
      const r = await call("GET", "/api/admin/videos/space", who);
      assert.equal(r.status, 404, String(who));
    }
    const real = await call("GET", "/api/admin/videos/space", "admin");
    assert.equal(real.status, 200, real.text);
    assert.ok(
      real.body.freeBytes > 0 && real.body.totalBytes >= real.body.freeBytes,
    );
  },
);

// Added 2026-10-12 (T102, the owner asked for a guarantee that every video host is allowed into the database and plays):
// each provider, created through the panel with the address an editor would paste, is stored in its canonical form and
// the public source route answers the player address of the host (Yandex Disk is stored only: its address is asked of
// Yandex's own API, which a test must not call).
test(
  "every provider the panel offers is written to the database and plays: the stored id and the player address",
  opts,
  async () => {
    const cases: [string, string, string, string | null][] = [
      [
        "youtube",
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=9",
        "dQw4w9WgXcQ",
        "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0",
      ],
      [
        "vk",
        "https://vk.com/video-12345_67890",
        "-12345_67890",
        "https://vk.com/video_ext.php?oid=-12345&id=67890",
      ],
      [
        "rutube",
        "https://rutube.ru/video/0123456789abcdef0123456789abcdef/",
        "0123456789abcdef0123456789abcdef",
        "https://rutube.ru/play/embed/0123456789abcdef0123456789abcdef",
      ],
      [
        "vimeo",
        "https://vimeo.com/123456789/abcdef1234",
        "123456789/abcdef1234",
        "https://player.vimeo.com/video/123456789?h=abcdef1234",
      ],
      [
        "ok",
        "https://ok.ru/video/9876543210",
        "9876543210",
        "https://ok.ru/videoembed/9876543210",
      ],
      [
        "yandex-disk",
        "https://yadi.sk/i/AbC-123_x",
        "https://disk.yandex.ru/i/AbC-123_x",
        null,
      ],
    ];
    for (const [provider, pasted, stored, embed] of cases) {
      const created = await call(
        "POST",
        "/api/admin/videos",
        "admin",
        videoFields({ source: { provider, reference: pasted } }),
      );
      assert.equal(created.status, 201, `${provider}: ${created.text}`);
      const rowsOfSource = await rows(
        "select provider, reference from video_sources where entry_id = $1",
        [created.body.video.id],
      );
      assert.deepEqual(
        rowsOfSource.map((r) => [r.provider, r.reference]),
        [[provider, stored]],
        `${provider} is stored in its canonical form`,
      );
      if (embed !== null) {
        const played = await call(
          "GET",
          `/api/videos/${created.body.video.slug}/source`,
          null,
        );
        assert.equal(played.status, 200, `${provider}: ${played.text}`);
        assert.deepEqual(played.body, { embedUrl: embed });
      }
    }
    // A text that is no address of the host is not written at all.
    const refused = await call(
      "POST",
      "/api/admin/videos",
      "admin",
      videoFields({
        source: {
          provider: "vimeo",
          reference: "https://youtu.be/dQw4w9WgXcQ",
        },
      }),
    );
    assert.equal(refused.status, 400);
    assert.ok(
      refused.body.problems.some(
        (p: any) => p.field === "source" && p.code === "reference_shape",
      ),
    );
  },
);
