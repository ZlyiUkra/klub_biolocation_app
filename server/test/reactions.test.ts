// The reactions of a post or a video (T185 of specs/001-self-hosted-club-site; contracts/http-api.md "Comments",
// data-model.md "reactions", FR-047, the owner's decisions of 2026-10-13; tests first, red until T186 builds the
// table and the routes and T187 the component and the pictures). Needs the development database for everything but
// the first block.
//
// What is fixed here:
// - Six kinds, the previous comment service's: upvote, funny, love, surprised, angry, sad (`reactionKinds`).
// - Who gives one (owner): a writer of comments, one rule for both (see comments.test.ts); a signed-out visitor is 401
//   `unauthorized`, a guest account and a student with no date or an ended one are 403 `forbidden`, a blocked account
//   is 403 `blocked`. Who reads the counts: whoever may see the entry; an entry nobody may see is 404 for all.
// - One reaction per account per entry, changed in place or removed (owner); the counts are over what is stored, and
//   `mine` is the viewer's own kind or null.
// - The pictures are files of the site's own (`public/images/reactions/<kind>.svg`, Noto Emoji, Apache 2.0, with its
//   licence beside them), never a request to the previous service.
//   Corrected 2026-10-13 (T187): the licence of that source is the SIL Open Font License 1.1 (its LICENSE file, since
//   2024-07-29) and its README still says Apache 2.0; the file beside the pictures keeps both texts and says so
//   (RISKS.md 5). The test asks only that a licence file is there.

import assert from "node:assert/strict";
import { once } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { reactionKinds } from "../src/comments/routes.js";
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

// ---- the pictures and the labels (no database) ----

test("the six pictures are files of the site, with the licence of their source beside them", () => {
  for (const kind of reactionKinds) {
    const file = join(repo, "public/images/reactions", `${kind}.svg`);
    assert.ok(existsSync(file), `${kind}.svg is on the site`);
    const text = readFileSync(file, "utf8");
    assert.match(text, /<svg[\s>]/, `${kind}.svg is a picture`);
    // Nothing a page loads from here may point at another host.
    assert.equal(/https?:\/\/(?!www\.w3\.org)/.test(text), false, kind);
  }
  assert.ok(
    existsSync(join(repo, "public/images/reactions/LICENSE.txt")),
    "the licence text of the pictures",
  );
});

test("the component names the reactions through the site's dictionary, in both languages", () => {
  const dictionary = readFileSync(join(repo, "src/i18n/strings.ts"), "utf8");
  for (const kind of reactionKinds) {
    assert.ok(
      new RegExp(`\\b${kind}\\b`).test(dictionary),
      `the label of ${kind} is in src/i18n/strings.ts`,
    );
  }
  const component = join(repo, "src/components/Reactions.astro");
  assert.ok(existsSync(component), "src/components/Reactions.astro exists");
  const text = readFileSync(component, "utf8");
  assert.equal(/set:html|innerHTML/.test(text), false, "no markup from data");
});

// ---- the database ----

let db: TestDatabase;
let base: string;
let close: () => Promise<void>;
const ids: Record<string, number> = {};
const cookies: Record<string, string> = {};
let counter = 0;

const day = (offset: number) =>
  `((now() at time zone 'utc')::date + (${offset})::int)`;

/** A new account with its own session. */
async function account(status: string, until: number | null): Promise<string> {
  const key = `${status}${++counter}`;
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
    superuser: false,
  });
  cookies[key] = id;
  return key;
}

type Entry = { id: number; path: string };

async function entry(
  kind: "post" | "video",
  over: { audience?: string; teaser?: boolean } = {},
): Promise<Entry> {
  const slug = `${kind}-${++counter}`;
  if (kind === "post") {
    await db.pool.query(
      `select store_post($1, 'A post', 'd', false, '2026-01-01T00:00:00Z'::timestamptz, null, null, null, 'b',
                         '<p>b</p>', '[]'::jsonb, 'b', 's', '{}', '{}', 1)`,
      [slug],
    );
  } else {
    await db.pool.query(
      `select store_video($1, 'A video', '', false, '2026-01-01T00:00:00Z'::timestamptz, false, 'd', '<p>d</p>',
                          '[]'::jsonb, null, null, 'youtube', null, true, null, '{}', '{}', 1)`,
      [slug],
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
  return { id, path: `/api/entries/${kind}/${slug}/reactions` };
}

async function call(
  method: string,
  path: string,
  who: string | null,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    origin: ORIGIN,
  };
  if (who) headers["cookie"] = `__Host-session=${cookies[who]}`;
  const res = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

const react = (e: Entry, who: string | null, kind: unknown) =>
  call("PUT", e.path, who, { kind });
const counts = (e: Entry, who: string | null) => call("GET", e.path, who);
const rows = async (entryId: number): Promise<number> =>
  Number(
    (
      await db.pool.query(
        "select count(*)::int as n from reactions where entry_id = $1",
        [entryId],
      )
    ).rows[0].n,
  );

const zero = Object.fromEntries(reactionKinds.map((k) => [k, 0]));

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
  "an entry with no reaction reads as six zeros and no choice, for a signed-out visitor too",
  opts,
  async () => {
    const e = await entry("post");
    for (const who of [null, await account("guest", null)]) {
      const r = await counts(e, who);
      assert.equal(r.status, 200);
      assert.deepEqual(r.body, { counts: zero, total: 0, mine: null });
    }
  },
);

test(
  "a writer picks a reaction, changes it and removes it: one per account, the counts follow",
  opts,
  async () => {
    const e = await entry("video", { audience: "everyone" });
    const ann = await account("student", 0);
    const bob = await account("expert", 0);

    const first = await react(e, ann, "love");
    assert.equal(first.status, 200);
    assert.deepEqual(first.body, {
      counts: { ...zero, love: 1 },
      total: 1,
      mine: "love",
    });

    // The same kind again changes nothing; another kind replaces it, it does not add one.
    assert.deepEqual((await react(e, ann, "love")).body.counts, {
      ...zero,
      love: 1,
    });
    const changed = await react(e, ann, "funny");
    assert.deepEqual(changed.body, {
      counts: { ...zero, funny: 1 },
      total: 1,
      mine: "funny",
    });
    assert.equal(await rows(e.id), 1, "one row per account and entry");

    const second = await react(e, bob, "upvote");
    assert.deepEqual(second.body.counts, { ...zero, funny: 1, upvote: 1 });
    assert.equal(second.body.total, 2);

    // Everybody sees the counts; only the viewer's own `mine`.
    assert.deepEqual((await counts(e, null)).body, {
      counts: { ...zero, funny: 1, upvote: 1 },
      total: 2,
      mine: null,
    });
    assert.equal((await counts(e, ann)).body.mine, "funny");
    assert.equal((await counts(e, bob)).body.mine, "upvote");

    const removed = await call("DELETE", e.path, ann);
    assert.equal(removed.status, 200);
    assert.deepEqual(removed.body, {
      counts: { ...zero, upvote: 1 },
      total: 1,
      mine: null,
    });
    assert.equal(
      (await call("DELETE", e.path, ann)).status,
      200,
      "a repeat is a 200",
    );
    assert.equal(await rows(e.id), 1);
  },
);

test(
  "who gives one: a student with a date, the old paying guest, a metr and an admin; nobody else",
  opts,
  async () => {
    const e = await entry("post");
    for (const [status, until] of [
      ["student", 0],
      ["guest", 3],
      ["metr", null],
      ["admin", null],
    ] as const) {
      const who = await account(status, until);
      assert.equal((await react(e, who, "sad")).status, 200, `${status}`);
    }
    assert.equal(await rows(e.id), 4);

    const refusedCases: [string, string | null, number, string][] = [
      ["signed out", null, 401, "unauthorized"],
      ["a guest account", await account("guest", null), 403, "forbidden"],
      [
        "a student with no date",
        await account("student", null),
        403,
        "forbidden",
      ],
      [
        "a student whose date ended",
        await account("student", -1),
        403,
        "forbidden",
      ],
      ["a blocked account", await account("blocked", 30), 403, "blocked"],
    ];
    for (const [what, who, status, code] of refusedCases) {
      for (const verb of ["PUT", "DELETE"]) {
        const r = await call(verb, e.path, who, { kind: "love" });
        assert.equal(r.status, status, `${what}, ${verb}`);
        assert.equal(r.body.error, code, `${what}, ${verb}`);
      }
    }
    assert.equal(await rows(e.id), 4, "a refusal changes nothing");
  },
);

test(
  "an unknown kind is a 400 on `kind` and nothing is stored",
  opts,
  async () => {
    const e = await entry("post");
    const who = await account("student", 0);
    for (const kind of ["like", "", "LOVE", null, 3, ["love"], undefined]) {
      const r = await react(e, who, kind);
      assert.equal(r.status, 400, JSON.stringify(kind) ?? "undefined");
      assert.equal(r.body.error, "invalid_input");
      assert.equal(r.body.field, "kind");
    }
    assert.equal(await rows(e.id), 0);
  },
);

test(
  "a reaction follows the entry: a teaser is read by a guest, an entry nobody sees is a 404 for everyone",
  opts,
  async () => {
    const teaser = await entry("video", { audience: "members", teaser: true });
    const closed = await entry("video", { audience: "members", teaser: false });
    const hidden = await entry("post", { audience: "hidden" });
    const student = await account("student", 0);
    const guest = await account("guest", null);
    const admin = await account("admin", null);

    assert.equal((await react(teaser, student, "angry")).status, 200);
    for (const who of [null, guest]) {
      const r = await counts(teaser, who);
      assert.equal(r.status, 200, String(who));
      assert.equal(r.body.counts.angry, 1);
    }
    assert.equal((await react(teaser, guest, "angry")).status, 403);

    // Corrected 2026-10-13 (T186), as the same case of comments.test.ts was when it went green: a members entry with
    // no teaser is "none" for a signed-out visitor only; any signed-in account that is not blocked sees it in full
    // (entry_view, audience `members`), a guest account too, so the counts are readable there and a guest still may
    // not give one. The first version of this test said 404 for the guest and the admin, which the rule never meant.
    assert.equal((await counts(closed, null)).status, 404);
    assert.equal((await react(closed, null, "love")).status, 404);
    assert.equal((await counts(closed, guest)).status, 200);
    assert.equal((await react(closed, guest, "love")).status, 403);
    assert.equal((await react(closed, student, "love")).status, 200);
    assert.equal((await counts(closed, admin)).body.counts.love, 1);

    // An entry that is hidden is nobody's: an admin gets the 404 too (a draft is shown through the preview route).
    for (const who of [null, guest, student, admin]) {
      assert.equal((await counts(hidden, who)).status, 404, String(who));
      assert.equal((await react(hidden, who, "love")).status, 404);
    }
    assert.equal(await rows(hidden.id), 0);
    assert.equal(
      (await call("GET", "/api/entries/page/x/reactions", null)).status,
      404,
    );
    assert.equal(
      (await call("GET", "/api/entries/post/no-such/reactions", null)).status,
      404,
    );
  },
);

test(
  "a blocked account's reaction stays in the counts, and an entry's reactions return with it",
  opts,
  async () => {
    const e = await entry("post", { audience: "everyone" });
    const who = await account("student", 0);
    await react(e, who, "surprised");
    await db.pool.query(
      "update users set status = 'blocked', blocked_at = now() where id = $1",
      [ids[who]],
    );
    assert.equal((await counts(e, null)).body.counts.surprised, 1);

    await db.pool.query(
      "update entries set audience = 'hidden' where id = $1",
      [e.id],
    );
    assert.equal((await counts(e, null)).status, 404);
    await db.pool.query(
      "update entries set audience = 'everyone' where id = $1",
      [e.id],
    );
    assert.equal((await counts(e, null)).body.total, 1);
  },
);
