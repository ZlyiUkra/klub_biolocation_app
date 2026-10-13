// The members-only block of a paid lecture, under both values of the setting (T076 of specs/001-self-hosted-club-site;
// FR-026, FR-035, user story 5 scenario 4, user story 8 scenario 3; written first for plan phase 4).
//
// The rule: the block is held in its own column and is sent only to a viewer for whom `lecture_view` says `open`
// (a student, expert or master whose date has not passed; a metr or an admin) while the setting `members_block_mode`
// is `locked`, which is the default. Under `hidden` it is sent to everybody and the page keeps it hidden until the
// player appears, as the site did before the rewrite. Nobody else gets it in ANY response: not the entry, not a list,
// not the search, whatever the setting says elsewhere.
//
// T077 (migration 015) gave the table `settings`, seeded `locked`; `setMode` below writes its one row. T081 made the backend
// decide what is sent: `content.membersOnlyHidden` is `true` when the block is sent to a viewer who may not play the
// video (so the page keeps it hidden) and `false` otherwise.

import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { createSession } from "../src/auth/session.js";
import { createApp } from "../src/http/app.js";
import {
  createTestDatabase,
  skipWithoutDatabase,
  type TestDatabase,
} from "./helpers/db.js";

const ORIGIN = "http://localhost:4321";
const opts = skipWithoutDatabase ? { skip: skipWithoutDatabase } : {};

// A word that appears nowhere else, so that a search or a scan of a whole response can tell whether it leaked.
const MARKER = "zqxjvmembersblockmarker";
const BLOCK = `<p>${MARKER} the second part of the lecture text</p>`;

let db: TestDatabase;
let base: string;
let close: () => Promise<void>;
const ids: Record<string, number> = {};
const cookies: Record<string, string> = {};

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
  cookies[key] = (
    await createSession(db.pool, {
      userId: ids[key]!,
      status: status as "guest",
    })
  ).id;
}

async function lecture(slug: string, paid: boolean): Promise<void> {
  await db.pool.query(
    `select store_video($1, $1, '', false, '2026-01-01T00:00:00Z'::timestamptz, false, 'the public part',
                        '<p>the public part</p>', '[]'::jsonb, 'x', $2,
                        'youtube', $3, $4, null, '{}', '{}', 1, null::date)`,
    [slug, BLOCK, paid ? null : "abc123def45", paid],
  );
  if (paid) {
    await db.pool.query("select store_video_source($1, 'youtube', $2)", [
      slug,
      "paidSecret_01",
    ]);
  }
}

/** Sets the switch the way T077's table holds it; the one place a test writes the setting. */
async function setMode(mode: "locked" | "hidden"): Promise<void> {
  await db.pool.query(
    `insert into settings (key, value) values ('members_block_mode', to_jsonb($1::text))
     on conflict (key) do update set value = excluded.value`,
    [mode],
  );
}

async function get(
  path: string,
  who: string | null,
): Promise<{ status: number; text: string; json: () => any }> {
  const headers: Record<string, string> = {};
  if (who) headers["cookie"] = `__Host-session=${cookies[who]}`;
  const res = await fetch(base + path, { headers });
  const text = await res.text();
  return { status: res.status, text, json: () => JSON.parse(text) };
}

const viewers = [
  "guest",
  "studentNoDate",
  "studentExpired",
  "blocked",
] as const;
// An old paying guest (a guest with a date that has not passed) is a viewer for whom the lecture is open too.
const allowed = [
  "payingGuest",
  "student",
  "expert",
  "master",
  "metr",
  "admin",
] as const;

before(async () => {
  if (skipWithoutDatabase) return;
  db = await createTestDatabase();
  await account("guest", "guest", null);
  await account("payingGuest", "guest", 5);
  await account("studentNoDate", "student", null);
  await account("studentExpired", "student", -1);
  await account("blocked", "blocked", 30);
  await account("student", "student", 30);
  await account("expert", "expert", 30);
  await account("master", "master", 30);
  await account("metr", "metr", null);
  await account("admin", "admin", null);
  await lecture("paid-lecture", true);
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

const entryOf = async (who: string | null) =>
  (await get("/api/videos/paid-lecture", who)).json().entry.content;

test(
  "locked (the default, the row migration 015 seeds): only a viewer for whom the lecture is open receives the block",
  opts,
  async () => {
    for (const who of allowed) {
      const content = await entryOf(who);
      assert.ok(String(content.membersOnlyHtml).includes(MARKER), who);
      assert.equal(content.membersOnlyHidden, false, who);
    }
    for (const who of [null, ...viewers]) {
      const content = await entryOf(who);
      assert.equal(content.membersOnlyHtml, null, String(who));
    }
  },
);

test(
  "locked: the block is in no other response either - lists, the list page, the search by its own words",
  opts,
  async () => {
    for (const who of [null, ...viewers]) {
      for (const path of [
        "/api/videos",
        "/api/list?kind=video",
        "/api/list?kind=both",
        "/api/search?q=" + MARKER,
        "/api/search?q=second+part",
        "/api/videos/paid-lecture",
      ]) {
        const answer = await get(path, who);
        assert.equal(
          answer.text.includes(MARKER),
          false,
          `${path} for ${String(who)}`,
        );
      }
    }
  },
);

test(
  "hidden: the block is sent to everybody and marked hidden for those who may not play, shown for those who may",
  opts,
  async () => {
    await setMode("hidden");
    for (const who of [null, ...viewers]) {
      const content = await entryOf(who);
      assert.ok(String(content.membersOnlyHtml).includes(MARKER), String(who));
      assert.equal(content.membersOnlyHidden, true, String(who));
    }
    for (const who of allowed) {
      const content = await entryOf(who);
      assert.ok(String(content.membersOnlyHtml).includes(MARKER), who);
      assert.equal(content.membersOnlyHidden, false, who);
    }
  },
);

test(
  "hidden: even then the block is not in lists or the search; a text that is not in the public part is not indexed",
  opts,
  async () => {
    for (const who of [null, "guest", "student"]) {
      for (const path of [
        "/api/videos",
        "/api/list?kind=video",
        "/api/search?q=" + MARKER,
      ]) {
        assert.equal(
          (await get(path, who)).text.includes(MARKER),
          false,
          `${path} for ${String(who)}`,
        );
      }
    }
  },
);

test(
  "the switch takes effect on the next request, guests' cached answers included, in both directions",
  opts,
  async () => {
    await setMode("hidden");
    assert.ok(String((await entryOf(null)).membersOnlyHtml).includes(MARKER));
    await setMode("locked");
    assert.equal((await entryOf(null)).membersOnlyHtml, null);
    assert.equal((await entryOf("guest")).membersOnlyHtml, null);
    assert.ok(
      String((await entryOf("student")).membersOnlyHtml).includes(MARKER),
    );
    await setMode("hidden");
    assert.ok(String((await entryOf(null)).membersOnlyHtml).includes(MARKER));
  },
);

test(
  "a blocked account is a guest for the block: under locked it never has it, whatever its date says",
  opts,
  async () => {
    await setMode("locked");
    const content = await entryOf("blocked");
    assert.equal(content.membersOnlyHtml, null);
    assert.equal(content.lecture, "blocked");
  },
);

test(
  "a value in the setting that is neither locked nor hidden cannot be stored (migration 015), so nothing can open the block by accident",
  opts,
  async () => {
    await assert.rejects(
      db.pool.query(
        `update settings set value = to_jsonb('open'::text) where key = 'members_block_mode'`,
      ),
      (error: { code?: string }) => error.code === "23514",
    );
    await setMode("locked");
  },
);
