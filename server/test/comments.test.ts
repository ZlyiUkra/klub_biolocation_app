// Comments on posts and videos (T103 and T151 of specs/001-self-hosted-club-site; contracts/http-api.md "Comments",
// data-model.md "comments", FR-032, spec User Story 7; tests first, red until T106 builds the routes, the table and the
// page component). Needs the development database for everything but the first block.
//
// What is fixed here (the owner's decisions of 2026-10-13 are marked; the rest he may still change, as with T095):
// - Who writes (owner): an account whose status opens the lectures and whose date (the person's one clock, T152) has
//   not ended, a guest account that holds a paying date (the old members), and an editor (metr, admin) always; a
//   lecture status with no date at all does not write (a row like that is a mistake or a damaged database). A signed-out
//   visitor is 401 `unauthorized`, a guest account without a date and an account whose date ended are 403
//   `forbidden`, a blocked account is 403 `blocked`.
// - The list (owner): flat and newest first; every comment says whether it is the viewer's own (`mine`) and when it
//   was changed (`editedAt`). The author may change or delete their own comment during one day after writing it
//   (owner): after that 403, someone else's comment or one that is hidden or deleted is 404. A deletion keeps the row.
// - At most `commentLimits.maxPerEntry` comments under one entry per account (owner), 409 `conflict` past it;
//   deleted ones do not count.
// - Who reads: whoever the entry is not `none` for (data-model.md), which is what T151 asks for a paid lecture shown as
//   a teaser: a guest reads its comments and cannot write. An entry nobody sees has no comments anywhere, an editor
//   included (a draft is seen through the preview route, not through the entry routes).
// - What is stored: the text as typed, ends trimmed, inner lines kept; plain text only, never rendered; at most
//   `commentLimits.maxChars`; NUL refused (the database cannot hold it, and that must be a 400, not a 500).
// - Hide and restore: metr and admin; anyone else gets the same 404 as an unknown id; both are audited as
//   `comment_hidden` and `comment_restored` against the entry with the comment's id in `detail`, never its text; a
//   repeat changes nothing and writes no second row.
// - Limit B (owner: 5 in 10 minutes): `commentLimits`, per account, counting stored comments only; changing, deleting
//   and hiding are not under it.

import assert from "node:assert/strict";
import { once } from "node:events";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { commentLimits } from "../src/comments/routes.js";
import { createSession } from "../src/auth/session.js";
import { createApp } from "../src/http/app.js";
import {
  createTestDatabase,
  skipWithoutDatabase,
  type TestDatabase,
} from "./helpers/db.js";

const opts = { skip: skipWithoutDatabase };
const ORIGIN = "http://localhost:4321";
const repo = fileURLToPath(new URL("../../../../", import.meta.url));

// ---- the previous comment service is gone, and the page shows text only (no database) ----

/** Every file under `dir` whose name ends with one of `endings`. */
function files(dir: string, endings: string[]): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...files(path, endings));
    else if (endings.some((e) => name.endsWith(e))) out.push(path);
  }
  return out;
}

test("the previous comment service is gone from the site and the new component prints text only", () => {
  // T106: `Disqus.astro`, the count script of `Base.astro` and `site.disqus` are removed. T151: with them goes the
  // reveal button of the paid lectures' comments, which is why no file may still ask for it.
  assert.equal(
    existsSync(join(repo, "src/components/Disqus.astro")),
    false,
    "src/components/Disqus.astro is removed",
  );
  const config = readFileSync(join(repo, "src/config.ts"), "utf8");
  assert.equal(/^\s*disqus\s*:/m.test(config), false, "site.disqus is removed");
  const base = readFileSync(join(repo, "src/layouts/Base.astro"), "utf8");
  // Not the word (a comment may say what was removed), the host the count script was loaded from.
  assert.equal(/disqus\.com/i.test(base), false, "no count script");
  for (const file of files(join(repo, "src"), [".astro", ".ts"])) {
    const text = readFileSync(file, "utf8");
    assert.equal(
      /<Disqus[\s/>]|from\s+["'][^"']*Disqus\.astro["']/.test(text),
      false,
      `${file} still uses the previous comment component`,
    );
  }
  const component = join(repo, "src/components/Comments.astro");
  assert.ok(existsSync(component), "src/components/Comments.astro exists");
  // "Text only": nothing in the component or in its script may turn a comment into markup.
  const sources = [component];
  const script = join(repo, "src/scripts/comments.ts");
  if (existsSync(script)) sources.push(script);
  for (const file of sources) {
    // Comments stripped first (a note may name what the file does not do), as the access-boundary test does.
    const text = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    assert.equal(/set:html/.test(text), false, `${file} uses set:html`);
    assert.equal(/innerHTML|insertAdjacentHTML/.test(text), false, file);
  }
});

// ---- the database ----

let db: TestDatabase;
let base: string;
let close: () => Promise<void>;
const ids: Record<string, number> = {};
const cookies: Record<string, string> = {};
let counter = 0;

/** A day relative to today's UTC day, as the database sees it, so a test never depends on the wall clock. */
const day = (offset: number) =>
  `((now() at time zone 'utc')::date + (${offset})::int)`;

/**
 * A new account with its own session. Every test makes the accounts it writes with, because the limit counts per
 * account and a shared one would carry its count from one test into the next.
 */
async function account(
  status: string,
  until: number | null,
  name?: string,
): Promise<string> {
  const key = `${status}${++counter}`;
  const row = await db.pool.query(
    `insert into users (email, display_name, status, access_until, blocked_by, blocked_at)
     values ($1, $2, $3, ${until === null ? "null" : day(until)}, null,
             case when $3 = 'blocked' then now() end)
     returning id`,
    [`${key}@example.test`, name ?? `Name ${key}`, status],
  );
  ids[key] = Number(row.rows[0].id);
  const { id } = await createSession(db.pool, {
    userId: ids[key]!,
    status: status as "guest",
    superuser: false,
  });
  cookies[key] = id;
  return key;
}

type Entry = {
  kind: "post" | "video";
  slug: string;
  id: number;
  path: string;
};

/** An entry; `audience` and `teaser` are set after the save, as the panel's audience form does. */
async function entry(
  kind: "post" | "video",
  slug: string,
  over: { audience?: string; teaser?: boolean; published?: string } = {},
): Promise<Entry> {
  const published = over.published ?? "2026-01-01T00:00:00Z";
  if (kind === "post") {
    await db.pool.query(
      `select store_post($1, 'A post', 'd', false, $2::timestamptz, null, null, null, 'b', '<p>b</p>',
                         '[]'::jsonb, 'b', 's', '{}', '{}', 1)`,
      [slug, published],
    );
  } else {
    await db.pool.query(
      `select store_video($1, 'A video', '', false, $2::timestamptz, false, 'd', '<p>d</p>', '[]'::jsonb, null,
                          null, 'youtube', null, true, null, '{}', '{}', 1)`,
      [slug, published],
    );
  }
  const row = await db.pool.query(
    "select id from entries where kind = $1 and slug = $2",
    [kind, slug],
  );
  const id = Number(row.rows[0].id);
  if (over.audience !== undefined || over.teaser !== undefined) {
    await db.pool.query(
      `update entries set audience = coalesce($2, audience), teaser = coalesce($3, teaser) where id = $1`,
      [id, over.audience ?? null, over.teaser ?? null],
    );
  }
  return { kind, slug, id, path: `/api/entries/${kind}/${slug}/comments` };
}

let entryNumber = 0;
const post = (over: Parameters<typeof entry>[2] = {}) =>
  entry("post", `post-${++entryNumber}`, over);
const lecture = (over: Parameters<typeof entry>[2] = {}) =>
  entry("video", `lecture-${++entryNumber}`, over);

async function call(
  method: string,
  path: string,
  who: string | null,
  body?: unknown,
  raw?: string,
): Promise<{ status: number; body: any; headers: Headers }> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    origin: ORIGIN,
  };
  if (who) headers["cookie"] = `__Host-session=${cookies[who]}`;
  const res = await fetch(base + path, {
    method,
    headers,
    body:
      raw !== undefined
        ? raw
        : body === undefined
          ? undefined
          : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed, headers: res.headers };
}

const write = (e: Entry, who: string | null, text: unknown) =>
  call("POST", e.path, who, { body: text });
const read = (e: Entry, who: string | null) => call("GET", e.path, who);
const rowCount = async (entryId: number): Promise<number> =>
  Number(
    (
      await db.pool.query(
        "select count(*)::int as n from comments where entry_id = $1",
        [entryId],
      )
    ).rows[0].n,
  );
const audit = async (action: string) =>
  (
    await db.pool.query(
      "select actor_id, target_kind, target_id, detail from audit_log where action = $1 order by id",
      [action],
    )
  ).rows;

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
  "a guest reads and cannot write: nobody signed out, a guest account, an account whose date ended",
  opts,
  async () => {
    const e = await post();
    const guest = await account("guest", null);
    const lapsed = await account("student", -1);

    const first = await read(e, null);
    assert.equal(first.status, 200);
    assert.deepEqual(first.body, []);

    const signedOut = await write(e, null, "Hello");
    assert.equal(signedOut.status, 401);
    assert.equal(signedOut.body.error, "unauthorized");

    const asGuest = await write(e, guest, "Hello");
    assert.equal(asGuest.status, 403);
    assert.equal(asGuest.body.error, "forbidden");

    const expired = await write(e, lapsed, "Hello");
    assert.equal(expired.status, 403);
    assert.equal(expired.body.error, "forbidden");

    assert.equal(await rowCount(e.id), 0, "nothing was stored");
  },
);

test(
  "the old paying guest writes; a lecture status with no date at all does not (owner, 2026-10-13)",
  opts,
  async () => {
    const e = await post();
    const paying = await account("guest", 5, "Old Member");
    const lastDay = await account("guest", 0);
    const lapsedGuest = await account("guest", -1);
    const noDate = await account("student", null);

    assert.equal((await write(e, paying, "I paid")).status, 201);
    assert.equal((await write(e, lastDay, "The last day counts")).status, 201);
    for (const who of [lapsedGuest, noDate]) {
      const r = await write(e, who, "Not me");
      assert.equal(r.status, 403, who);
      assert.equal(r.body.error, "forbidden");
    }
    assert.equal(await rowCount(e.id), 2);
  },
);

test(
  "a student, a metr and an admin write; a blocked account is refused as blocked",
  opts,
  async () => {
    const e = await post();
    const student = await account("student", 0, "Ann Student");
    const metr = await account("metr", null, "Mark Metr");
    const admin = await account("admin", null, "Ada Admin");
    const blocked = await account("blocked", 30);

    for (const who of [student, metr, admin]) {
      const r = await write(e, who, `Comment of ${who}`);
      assert.equal(r.status, 201, who);
      assert.equal(r.body.body, `Comment of ${who}`);
      assert.ok(Number.isInteger(r.body.id));
    }
    const refused = await write(e, blocked, "Let me in");
    assert.equal(refused.status, 403);
    assert.equal(refused.body.error, "blocked");
    assert.equal(await rowCount(e.id), 3);

    const authors = await db.pool.query(
      "select author_id from comments where entry_id = $1 order by id",
      [e.id],
    );
    assert.deepEqual(
      authors.rows.map((r) => Number(r.author_id)),
      [ids[student]!, ids[metr]!, ids[admin]!],
    );
  },
);

test(
  "a comment answer carries the id, the author's display name, the text, the times and `mine`, newest first, and no address",
  opts,
  async () => {
    const e = await post();
    const ann = await account("student", 0, "Ann Student");
    const bob = await account("expert", 0, "Bob Expert");
    const reader = await account("guest", null);

    const a = await write(e, ann, "First");
    const b = await write(e, bob, "Second");
    assert.deepEqual(Object.keys(a.body).sort(), [
      "author",
      "body",
      "createdAt",
      "editedAt",
      "id",
      "mine",
    ]);
    assert.equal(a.body.editedAt, null);
    assert.equal(a.body.mine, true, "the writer's own answer");

    const list = await read(e, reader);
    assert.equal(list.status, 200);
    assert.deepEqual(
      list.body.map((c: { body: string }) => c.body),
      ["Second", "First"],
      "newest first",
    );
    assert.deepEqual(
      list.body.map((c: { author: string }) => c.author),
      ["Bob Expert", "Ann Student"],
    );
    assert.deepEqual(
      list.body.map((c: { id: number }) => c.id),
      [b.body.id, a.body.id],
    );
    assert.ok(
      Number.isFinite(Date.parse(list.body[0].createdAt)),
      "createdAt is a date",
    );
    // `mine` is true only for the viewer's own comments, and false for a reader and for a signed-out visitor.
    assert.deepEqual(
      list.body.map((c: { mine: boolean }) => c.mine),
      [false, false],
    );
    const asAnn = await read(e, ann);
    assert.deepEqual(
      asAnn.body.map((c: { mine: boolean }) => c.mine),
      [false, true],
    );
    assert.deepEqual(
      (await read(e, null)).body.map((c: { mine: boolean }) => c.mine),
      [false, false],
    );
    const text = JSON.stringify(list.body);
    assert.equal(text.includes("@example.test"), false, "no address");
    assert.equal(/"hidden"/.test(text), false, "a reader is not told");
  },
);

test(
  "markup is stored as typed and read back as the same text, in a JSON answer",
  opts,
  async () => {
    const e = await post();
    const who = await account("student", 0);
    const typed =
      "<script>alert(1)</script> <b>bold</b> <img src=x onerror=alert(1)> [a](javascript:alert(1)) &amp; `code`";

    const stored = await write(e, who, typed);
    assert.equal(stored.status, 201);
    assert.equal(stored.body.body, typed);

    const row = await db.pool.query(
      "select body from comments where entry_id = $1",
      [e.id],
    );
    assert.equal(row.rows[0].body, typed, "the table holds what was typed");

    const list = await read(e, null);
    assert.equal(list.body[0].body, typed);
    assert.match(
      list.headers.get("content-type") ?? "",
      /^application\/json/,
      "never HTML",
    );
  },
);

test(
  "the body rules: trimmed, inner lines kept, empty and over-long refused, NUL a 400, an oversized request 413",
  opts,
  async () => {
    const e = await post();
    const who = await account("student", 0);

    const padded = await write(e, who, "  one\n\n two  \n");
    assert.equal(padded.status, 201);
    assert.equal(padded.body.body, "one\n\n two");

    const exact = await write(e, who, "x".repeat(commentLimits.maxChars));
    assert.equal(exact.status, 201, "the longest comment is allowed");

    const stored = await rowCount(e.id);
    const refused: unknown[] = [
      "",
      "   \n\t ",
      "x".repeat(commentLimits.maxChars + 1),
      "a\u0000b",
      null,
      42,
      { text: "no" },
    ];
    for (const text of refused) {
      const r = await write(e, who, text);
      assert.equal(r.status, 400, JSON.stringify(text)?.slice(0, 40));
      assert.equal(r.body.error, "invalid_input");
      assert.equal(r.body.field, "body");
    }
    const missing = await call("POST", e.path, who, {});
    assert.equal(missing.status, 400);
    assert.equal(missing.body.field, "body");
    assert.equal(await rowCount(e.id), stored, "no refused text was stored");

    // Past the parser's own limit the answer is the contract's 413, and nothing is stored either.
    const huge = await call(
      "POST",
      e.path,
      who,
      undefined,
      JSON.stringify({ body: "y".repeat(150_000) }),
    );
    assert.equal(huge.status, 413);
    assert.equal(huge.body.error, "too_large");
    assert.equal(await rowCount(e.id), stored);
  },
);

test(
  "a metr hides a comment and restores it; readers lose it and get it back; both are audited once",
  opts,
  async () => {
    const e = await lecture({ audience: "everyone" });
    const student = await account("student", 0);
    const metr = await account("metr", null);
    const admin = await account("admin", null);
    const guest = await account("guest", null);

    const kept = await write(e, student, "Stays");
    const target = await write(e, student, "Goes for a while");
    assert.equal(kept.status, 201);

    const hide = await call(
      "POST",
      `/api/comments/${target.body.id}/hide`,
      metr,
      {},
    );
    assert.equal(hide.status, 200);
    assert.equal(hide.body.hidden, true);

    const bodies = (r: { body: { body: string }[] }) =>
      r.body.map((c) => c.body);
    for (const who of [null, guest, student]) {
      assert.deepEqual(bodies(await read(e, who)), ["Stays"], String(who));
    }
    // The editors still see it, marked, so that they can restore it.
    for (const who of [metr, admin]) {
      const r = await read(e, who);
      assert.deepEqual(bodies(r), ["Goes for a while", "Stays"]);
      assert.deepEqual(
        r.body.map((c: { hidden: boolean }) => c.hidden),
        [true, false],
      );
    }
    const row = await db.pool.query(
      "select hidden_by, hidden_at from comments where id = $1",
      [target.body.id],
    );
    assert.equal(Number(row.rows[0].hidden_by), ids[metr]);
    assert.ok(row.rows[0].hidden_at);

    // A repeat changes nothing and writes no second audit row.
    const again = await call(
      "POST",
      `/api/comments/${target.body.id}/hide`,
      admin,
      {},
    );
    assert.equal(again.status, 200);
    assert.equal((await audit("comment_hidden")).length, 1);

    const restore = await call(
      "POST",
      `/api/comments/${target.body.id}/restore`,
      admin,
      {},
    );
    assert.equal(restore.status, 200);
    assert.equal(restore.body.hidden, false);
    assert.deepEqual(bodies(await read(e, guest)), [
      "Goes for a while",
      "Stays",
    ]);
    const restoredRow = await db.pool.query(
      "select hidden_by, hidden_at from comments where id = $1",
      [target.body.id],
    );
    assert.equal(restoredRow.rows[0].hidden_by, null);
    assert.equal(restoredRow.rows[0].hidden_at, null);
    const restoreAgain = await call(
      "POST",
      `/api/comments/${target.body.id}/restore`,
      admin,
      {},
    );
    assert.equal(restoreAgain.status, 200);

    const hidden = await audit("comment_hidden");
    const restored = await audit("comment_restored");
    assert.equal(hidden.length, 1);
    assert.equal(restored.length, 1);
    assert.equal(Number(hidden[0].actor_id), ids[metr]);
    assert.equal(Number(restored[0].actor_id), ids[admin]);
    for (const row of [hidden[0], restored[0]]) {
      assert.equal(row.target_kind, "entry");
      assert.equal(Number(row.target_id), e.id);
      assert.equal(Number(row.detail.commentId), target.body.id);
      assert.equal(
        JSON.stringify(row.detail).includes("Goes for a while"),
        false,
        "the text is not copied into the audit trail",
      );
    }
  },
);

test(
  "only a metr or an admin can hide: everybody else gets the 404 of an unknown id, and nothing changes",
  opts,
  async () => {
    const e = await post();
    const student = await account("student", 0);
    const expert = await account("expert", 0);
    const guest = await account("guest", null);
    const metr = await account("metr", null);
    const c = await write(e, student, "Mine");
    const hiddenBefore = (await audit("comment_hidden")).length;

    for (const who of [null, guest, student, expert]) {
      for (const verb of ["hide", "restore"]) {
        const r = await call(
          "POST",
          `/api/comments/${c.body.id}/${verb}`,
          who,
          {},
        );
        assert.equal(r.status, 404, `${verb} as ${who}`);
        assert.equal(r.body.error, "not_found");
      }
    }
    for (const id of ["999999999", "0", "-1", "abc", "1.5"]) {
      const r = await call("POST", `/api/comments/${id}/hide`, metr, {});
      assert.equal(r.status, 404, id);
    }
    const row = await db.pool.query(
      "select hidden_by from comments where id = $1",
      [c.body.id],
    );
    assert.equal(row.rows[0].hidden_by, null);
    assert.equal((await audit("comment_hidden")).length, hiddenBefore);
  },
);

test(
  "a paid lecture shown as a teaser: a guest reads its comments and cannot write (T151); without a teaser it is not there at all",
  opts,
  async () => {
    const teaser = await lecture({ audience: "members", teaser: true });
    const closed = await lecture({ audience: "members", teaser: false });
    const student = await account("student", 0);
    const guest = await account("guest", null);

    const said = await write(teaser, student, "What a lecture");
    assert.equal(said.status, 201, "a student with access writes");

    for (const who of [null, guest]) {
      const r = await read(teaser, who);
      assert.equal(r.status, 200, String(who));
      assert.deepEqual(
        r.body.map((c: { body: string }) => c.body),
        ["What a lecture"],
      );
    }
    const guestWrite = await write(teaser, guest, "Let me in");
    assert.equal(guestWrite.status, 403);
    assert.equal(guestWrite.body.error, "forbidden");

    // The entry that is not even a teaser is, for a signed-out visitor, as if it did not exist, for reading and for
    // writing. (A signed-in guest account is a member of the audience "members", so it sees the entry in full, reads
    // the comments, and is refused writing as everywhere else: 403, not 404.)
    assert.equal((await read(closed, null)).status, 404);
    assert.equal((await write(closed, null, "Hi")).status, 404);
    assert.equal((await read(closed, guest)).status, 200);
    assert.equal((await write(closed, guest, "Hi")).status, 403);
    assert.equal(await rowCount(closed.id), 0);
    assert.equal((await write(closed, student, "Inside")).status, 201);
  },
);

test(
  "an entry nobody may see has no comments anywhere, an admin included, and they come back with the entry",
  opts,
  async () => {
    const e = await post({ audience: "everyone" });
    const student = await account("student", 0);
    const admin = await account("admin", null);
    const metr = await account("metr", null);
    const said = await write(e, student, "Written while it was public");
    assert.equal(said.status, 201);

    const asleep = [
      [
        "a hidden audience",
        `update entries set audience = 'hidden' where id = $1`,
      ],
      [
        "a date in the future",
        `update entries set published_at = now() + interval '30 days' where id = $1`,
      ],
      [
        "a deleted entry",
        `update entries set deleted_at = now() where id = $1`,
      ],
    ] as const;
    for (const [what, sql] of asleep) {
      await db.pool.query(
        `update entries set audience = 'everyone', published_at = '2026-01-01T00:00:00Z', deleted_at = null where id = $1`,
        [e.id],
      );
      await db.pool.query(sql, [e.id]);
      for (const who of [null, student, metr, admin]) {
        const r = await read(e, who);
        assert.equal(r.status, 404, `${what}, read as ${who}`);
        assert.equal(r.body.error, "not_found");
      }
      assert.equal(
        (await write(e, admin, "Nobody sees this")).status,
        404,
        what,
      );
      const hide = await call(
        "POST",
        `/api/comments/${said.body.id}/hide`,
        admin,
        {},
      );
      assert.equal(hide.status, 404, `${what}: hide`);
    }
    assert.equal(
      await rowCount(e.id),
      1,
      "the comment outlives the entry's sleep",
    );

    await db.pool.query(
      `update entries set audience = 'everyone', published_at = '2026-01-01T00:00:00Z', deleted_at = null where id = $1`,
      [e.id],
    );
    const back = await read(e, null);
    assert.deepEqual(
      back.body.map((c: { body: string }) => c.body),
      ["Written while it was public"],
    );
  },
);

test(
  "a thread belongs to one entry and one kind, and an unknown kind or slug is a 404",
  opts,
  async () => {
    const who = await account("student", 0);
    const p = await entry("post", "same-slug");
    const v = await entry("video", "same-slug", { audience: "everyone" });
    await write(p, who, "On the post");
    await write(v, who, "On the video");

    assert.deepEqual(
      (await read(p, null)).body.map((c: { body: string }) => c.body),
      ["On the post"],
    );
    assert.deepEqual(
      (await read(v, null)).body.map((c: { body: string }) => c.body),
      ["On the video"],
    );
    for (const path of [
      "/api/entries/page/same-slug/comments",
      "/api/entries/post/no-such-entry/comments",
      "/api/entries/video/no-such-entry/comments",
    ]) {
      assert.equal((await call("GET", path, null)).status, 404, path);
      assert.equal(
        (await call("POST", path, who, { body: "x" })).status,
        404,
        path,
      );
    }
  },
);

test(
  "a blocked author's comments stay; blocking does not delete a word",
  opts,
  async () => {
    const e = await post();
    const who = await account("student", 0, "Soon Blocked");
    await write(e, who, "Said before the block");
    await db.pool.query(
      "update users set status = 'blocked', blocked_at = now() where id = $1",
      [ids[who]],
    );
    const r = await read(e, null);
    assert.deepEqual(
      r.body.map((c: { body: string; author: string }) => [c.body, c.author]),
      [["Said before the block", "Soon Blocked"]],
    );
  },
);

test(
  "the author changes their own comment within a day: the text, `editedAt`, nobody else's, nothing after a day",
  opts,
  async () => {
    const e = await post();
    const ann = await account("student", 0, "Ann Student");
    const bob = await account("student", 0);
    const metr = await account("metr", null);
    const mine = await write(e, ann, "First version");
    const bobs = await write(e, bob, "Bob's");
    const path = `/api/comments/${mine.body.id}`;

    const changed = await call("PATCH", path, ann, {
      body: "  Second version ",
    });
    assert.equal(changed.status, 200);
    assert.equal(changed.body.body, "Second version");
    assert.equal(changed.body.id, mine.body.id);
    assert.ok(Number.isFinite(Date.parse(changed.body.editedAt)));
    const listed = (await read(e, null)).body.find(
      (c: { id: number }) => c.id === mine.body.id,
    );
    assert.equal(listed.body, "Second version");
    assert.ok(listed.editedAt, "readers are told it was changed");
    assert.equal(
      listed.createdAt,
      mine.body.createdAt,
      "the time of writing stays",
    );

    // The body rules are the same, and a refusal changes nothing.
    for (const text of [
      "",
      "   ",
      "x".repeat(commentLimits.maxChars + 1),
      "a\u0000b",
      7,
    ]) {
      const r = await call("PATCH", path, ann, { body: text });
      assert.equal(r.status, 400, JSON.stringify(text)?.slice(0, 30));
      assert.equal(r.body.field, "body");
    }

    // Someone else's comment, a metr (who hides, not rewrites) and a signed-out visitor: the 404 of an unknown id.
    for (const who of [bob, metr]) {
      const r = await call("PATCH", path, who, { body: "Mine now" });
      assert.equal(r.status, 404, String(who));
    }
    assert.equal((await call("PATCH", path, null, { body: "x" })).status, 404);
    const kept = await db.pool.query(
      "select body from comments where id = $1",
      [mine.body.id],
    );
    assert.equal(kept.rows[0].body, "Second version");
    assert.equal(bobs.status, 201);

    // A day on: neither a change nor a deletion, and the answer is the contract's 403.
    await db.pool.query(
      `update comments set created_at = now() - interval '25 hours' where id = $1`,
      [mine.body.id],
    );
    const late = await call("PATCH", path, ann, { body: "Too late" });
    assert.equal(late.status, 403);
    assert.equal(late.body.error, "forbidden");
    const lateDelete = await call("DELETE", path, ann);
    assert.equal(lateDelete.status, 403);
    assert.equal(await rowCount(e.id), 2);

    // The last minutes of the day still count.
    await db.pool.query(
      `update comments set created_at = now() - interval '23 hours 50 minutes' where id = $1`,
      [mine.body.id],
    );
    assert.equal(
      (await call("PATCH", path, ann, { body: "Just in time" })).status,
      200,
    );
  },
);

test(
  "the author deletes their own comment within a day: out of every answer, the row stays, nobody else can",
  opts,
  async () => {
    const e = await post();
    const ann = await account("student", 0);
    const bob = await account("student", 0);
    const metr = await account("metr", null);
    const guest = await account("guest", null);
    const first = await write(e, ann, "Delete me");
    await write(e, bob, "Stay");
    const path = `/api/comments/${first.body.id}`;

    for (const who of [bob, metr, guest]) {
      const r = await call("DELETE", path, who);
      assert.equal(r.status, 404, String(who));
    }
    assert.equal((await call("DELETE", path, null)).status, 404);
    assert.equal((await read(e, null)).body.length, 2);

    const gone = await call("DELETE", path, ann);
    assert.equal(gone.status, 200);
    assert.equal(gone.body.deleted, true);
    for (const who of [null, ann, bob, guest, metr]) {
      const r = await read(e, who);
      assert.deepEqual(
        r.body.map((c: { body: string }) => c.body),
        ["Stay"],
        `read as ${who}`,
      );
    }
    const row = await db.pool.query(
      "select body, deleted_at from comments where id = $1",
      [first.body.id],
    );
    assert.equal(row.rowCount, 1, "the row stays");
    assert.ok(row.rows[0].deleted_at);

    // A deleted comment is gone for every route: no second delete, no change, no hide, no restore.
    assert.equal((await call("DELETE", path, ann)).status, 404);
    assert.equal(
      (await call("PATCH", path, ann, { body: "Back" })).status,
      404,
    );
    assert.equal((await call("POST", `${path}/hide`, metr, {})).status, 404);
    assert.equal((await call("POST", `${path}/restore`, metr, {})).status, 404);
  },
);

test(
  "a hidden comment cannot be changed or deleted by its author: the editors' decision stands",
  opts,
  async () => {
    const e = await post();
    const ann = await account("student", 0);
    const metr = await account("metr", null);
    const c = await write(e, ann, "Reported");
    await call("POST", `/api/comments/${c.body.id}/hide`, metr, {});

    const path = `/api/comments/${c.body.id}`;
    assert.equal(
      (await call("PATCH", path, ann, { body: "Reworded" })).status,
      404,
    );
    assert.equal((await call("DELETE", path, ann)).status, 404);
    const row = await db.pool.query(
      "select body, hidden_by, deleted_at from comments where id = $1",
      [c.body.id],
    );
    assert.equal(row.rows[0].body, "Reported");
    assert.equal(Number(row.rows[0].hidden_by), ids[metr]);
    assert.equal(row.rows[0].deleted_at, null);
  },
);

test(
  "at most 20 comments under one entry per account (owner): the next is 409 `entry_cap`, a deletion makes room, another entry and another account are untouched",
  opts,
  async () => {
    const e = await post();
    const other = await post();
    const busy = await account("student", 0);
    const quiet = await account("student", 0);
    // Nineteen written long ago, straight into the table, so that this test does not wait for limit B's window.
    await db.pool.query(
      `insert into comments (entry_id, author_id, body, created_at)
       select $1, $2, 'Old ' || n, now() - interval '3 days' + n * interval '1 minute'
         from generate_series(1, ${commentLimits.maxPerEntry - 1}) as n`,
      [e.id, ids[busy]],
    );

    const twentieth = await write(e, busy, "The twentieth");
    assert.equal(twentieth.status, 201);
    const over = await write(e, busy, "The twenty-first");
    assert.equal(over.status, 409);
    assert.equal(over.body.error, "conflict");
    assert.equal(over.body.field, "body");
    assert.equal(over.body.problem, "entry_cap");
    assert.equal(await rowCount(e.id), commentLimits.maxPerEntry);

    assert.equal((await write(other, busy, "Elsewhere")).status, 201);
    assert.equal((await write(e, quiet, "Another account")).status, 201);

    // A deleted comment is not counted, so the account may write again.
    const del = await call(
      "DELETE",
      `/api/comments/${twentieth.body.id}`,
      busy,
    );
    assert.equal(del.status, 200);
    assert.equal((await write(e, busy, "Room again")).status, 201);
  },
);

test(
  "limit B: past the number per window the next comment is 429 with Retry-After and nothing is stored; others and editors are untouched",
  opts,
  async () => {
    const e = await post();
    const busy = await account("student", 0);
    const other = await account("student", 0);
    const metr = await account("metr", null);

    const written: number[] = [];
    for (let i = 0; i < commentLimits.maxPerWindow; i += 1) {
      const r = await write(e, busy, `Comment ${i}`);
      assert.equal(r.status, 201, `comment ${i}`);
      written.push(r.body.id);
    }
    const over = await write(e, busy, "One too many");
    assert.equal(over.status, 429);
    assert.equal(over.body.error, "rate_limited");
    const wait = Number(over.headers.get("retry-after"));
    assert.ok(Number.isInteger(wait) && wait > 0, "Retry-After in seconds");
    assert.equal(await rowCount(e.id), commentLimits.maxPerWindow);

    assert.equal((await write(e, other, "Still fine")).status, 201);
    assert.equal((await read(e, busy)).status, 200, "reading is not limited");

    // Moderation is not the writer's limit: the editor hides every one of them in a row.
    for (const id of written) {
      const r = await call("POST", `/api/comments/${id}/hide`, metr, {});
      assert.equal(r.status, 200, `hide ${id}`);
    }
  },
);
