// The dates of the paid lectures' access (T152 of specs/001-self-hosted-club-site; design-member-until.md sections 9 to
// 11, the owner's rules of 2026-10-11): the person's date as the one clock, the video's own period, the status change
// that starts the clock, the route that sets the date, the old paying guests from the members file. Needs the
// development database for everything but the first block.

import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import {
  addYears,
  defaultAccessEnd,
  isRealDay,
  lectureRules,
  utcDay,
} from "../../src/lib/lecture-rules.js";
import { createSession } from "../src/auth/session.js";
import { importMembers, parseMembers } from "../src/cli/import-members.js";
import { createApp } from "../src/http/app.js";
import { accessDateAfterStatusChange } from "../src/users/lecture-access.js";
import {
  createTestDatabase,
  skipWithoutDatabase,
  type TestDatabase,
} from "./helpers/db.js";

const opts = { skip: skipWithoutDatabase };
const ORIGIN = "http://localhost:4321";
const repo = fileURLToPath(new URL("../../../../", import.meta.url));
const T = new Date("2026-10-11T12:00:00Z");

// ---- the pure rules (no database) ----

test("a real day, a leap day and the default end", () => {
  assert.equal(isRealDay("2026-10-11"), true);
  assert.equal(isRealDay("2026-02-30"), false);
  assert.equal(isRealDay("2026-13-01"), false);
  assert.equal(isRealDay("11.10.2026"), false);
  assert.equal(isRealDay(null), false);
  assert.equal(addYears("2028-02-29", 100), "2128-02-29");
  assert.equal(addYears("2028-02-29", 99), "2127-02-28");
  assert.equal(utcDay(new Date("2026-10-11T23:59:59Z")), "2026-10-11");
  assert.equal(utcDay(new Date("2026-10-12T00:00:00Z")), "2026-10-12");
  assert.equal(defaultAccessEnd(T), "2126-10-11");
  assert.equal(lectureRules.defaultYears, 100);
});

test("a status change starts, keeps or ends the date by the owner's rule", () => {
  const until = "2027-01-01";
  // Becoming a user starts the clock, from guest and from blocked alike, whatever the old date was.
  assert.equal(
    accessDateAfterStatusChange("guest", "student", null, T),
    "2126-10-11",
  );
  assert.equal(
    accessDateAfterStatusChange("guest", "student", until, T),
    "2126-10-11",
  );
  assert.equal(
    accessDateAfterStatusChange("blocked", "expert", until, T),
    "2126-10-11",
  );
  // Between the statuses that open the lectures the date is not touched, a limit set on purpose included.
  assert.equal(
    accessDateAfterStatusChange("student", "expert", until, T),
    until,
  );
  assert.equal(accessDateAfterStatusChange("master", "admin", null, T), null);
  // Blocking ends it: the date becomes the day before today (UTC); no date stays no date; a repeat changes nothing.
  // Nobody is given guest, but if it happened the date would go.
  assert.equal(
    accessDateAfterStatusChange("student", "blocked", until, T),
    utcDay(new Date(T.getTime() - 24 * 60 * 60 * 1000)),
  );
  assert.equal(accessDateAfterStatusChange("guest", "blocked", null, T), null);
  assert.equal(
    accessDateAfterStatusChange("blocked", "blocked", "2020-01-01", T),
    "2020-01-01",
  );
  assert.equal(accessDateAfterStatusChange("student", "guest", until, T), null);
});

test("the constants agree: the status list of the site's config, the 100 years of the column default", () => {
  const config = readFileSync(join(repo, "src/config.ts"), "utf8");
  const listed = /lectureViewers:\s*(\[[^\]]*\])/.exec(config)?.[1];
  assert.ok(listed, "config.ts lists lectureViewers");
  assert.deepEqual(JSON.parse(listed.replace(/'/g, '"')), [
    ...lectureRules.openingStatuses,
  ]);
  const migration = readFileSync(
    join(repo, "server/migrations/014.do.access-dates.sql"),
    "utf8",
  );
  assert.ok(
    migration.includes(`interval '${lectureRules.defaultYears} years'`),
    "the SQL default repeats the constant",
  );
});

// ---- the database ----

let db: TestDatabase;
let base: string;
let close: () => Promise<void>;
const ids: Record<string, number> = {};
const cookies: Record<string, string> = {};

/** A day relative to today's UTC day, as the database sees it, so a test never depends on the wall clock. */
const day = (offset: number) =>
  `((now() at time zone 'utc')::date + (${offset})::int)`;

async function account(
  key: string,
  status: string,
  until: number | null,
  superuser = false,
): Promise<void> {
  const row = await db.pool.query(
    `insert into users (email, display_name, status, is_superuser, access_until, blocked_by, blocked_at)
     values ($1, $1, $2, $3, ${until === null ? "null" : day(until)}, null,
             case when $2 = 'blocked' then now() end)
     returning id`,
    [`${key}@example.test`, status, superuser],
  );
  ids[key] = Number(row.rows[0].id);
  const { id } = await createSession(db.pool, {
    userId: ids[key]!,
    status: status as "guest",
    superuser,
  });
  cookies[key] = id;
}

async function video(
  slug: string,
  over: {
    paid?: boolean;
    until?: number | null;
    hidden?: boolean;
    published?: string;
  } = {},
): Promise<number> {
  const paid = over.paid ?? true;
  const r = await db.pool.query(
    `select store_video($1, $1, '', $2, $3::timestamptz, false, 'd', '<p>d</p>', '[]'::jsonb, null, null,
                        'youtube', $4, $5, null, '{}', '{}', 1, ${over.until === undefined || over.until === null ? "null::date" : day(over.until)}) as outcome`,
    [
      slug,
      over.hidden ?? false,
      over.published ?? "2026-01-01T00:00:00Z",
      paid ? null : "abc123",
      paid,
    ],
  );
  assert.ok(["created", "updated", "unchanged"].includes(r.rows[0].outcome));
  const e = await db.pool.query(
    "select id from entries where kind = 'video' and slug = $1",
    [slug],
  );
  return Number(e.rows[0].id);
}

async function view(viewer: string | null, entryId: number): Promise<string> {
  const r = await db.pool.query("select lecture_view($1, $2) as v", [
    viewer === null ? null : ids[viewer],
    entryId,
  ]);
  return r.rows[0].v;
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
  return { status: res.status, body: await res.json() };
}

before(async () => {
  if (skipWithoutDatabase) return;
  db = await createTestDatabase();
  await account("admin", "admin", null);
  await account("boss", "admin", null, true);
  await account("metr", "metr", null);
  await account("guest", "guest", null);
  await account("payingGuest", "guest", 5);
  await account("lapsedGuest", "guest", -1);
  await account("studentToday", "student", 0);
  await account("studentYesterday", "student", -1);
  await account("studentTomorrow", "student", 1);
  await account("studentNoDate", "student", null);
  await account("blockedWithDate", "blocked", 30);
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
  "lecture_view: the person's date is the clock, the last day counts, metr and admin are never limited",
  opts,
  async () => {
    const paid = await video("paid-open");
    assert.equal(await view(null, paid), "guest");
    assert.equal(await view("guest", paid), "no_access");
    assert.equal(await view("payingGuest", paid), "open");
    assert.equal(await view("lapsedGuest", paid), "no_access");
    assert.equal(await view("studentToday", paid), "open");
    assert.equal(await view("studentTomorrow", paid), "open");
    assert.equal(await view("studentYesterday", paid), "no_access");
    assert.equal(await view("studentNoDate", paid), "no_access");
    assert.equal(await view("blockedWithDate", paid), "blocked");
    assert.equal(await view("metr", paid), "open");
    assert.equal(await view("admin", paid), "open");
    assert.equal(await view("boss", paid), "open");
  },
);

test(
  "lecture_view: a free video is open to everybody, a blocked account included",
  opts,
  async () => {
    const free = await video("free-open", { paid: false });
    for (const who of [null, "guest", "studentYesterday", "blockedWithDate"]) {
      assert.equal(await view(who, free), "open", String(who));
    }
  },
);

test(
  "lecture_view: after a video's own period nobody but an editor plays it, whatever they hold",
  opts,
  async () => {
    const ended = await video("paid-ended", { until: -1 });
    const endedFree = await video("free-ended", { paid: false, until: -1 });
    const lastDay = await video("paid-last-day", { until: 0 });
    for (const entry of [ended, endedFree]) {
      assert.equal(await view(null, entry), "expired");
      assert.equal(await view("studentTomorrow", entry), "expired");
      assert.equal(await view("blockedWithDate", entry), "expired");
      assert.equal(await view("metr", entry), "open");
      assert.equal(await view("admin", entry), "open");
    }
    // The last day of the video is included, like the person's.
    assert.equal(await view("studentTomorrow", lastDay), "open");
  },
);

test(
  "lecture_view: an entry the viewer cannot see at all is none, and so is an id that is not a video",
  opts,
  async () => {
    const later = await video("paid-later", {
      published: "2999-01-01T00:00:00Z",
    });
    const hidden = await video("paid-hidden", { hidden: true });
    assert.equal(await view("admin", later), "none");
    assert.equal(await view("admin", hidden), "none");
    const post = await db.pool.query(
      `select store_post('a-post', 'A post', 'd', false, '2026-01-01T00:00:00Z', null, null, null, 'b', '<p>b</p>',
                       '[]'::jsonb, 'b', 's', '{}', '{}', 1)`,
    );
    assert.ok(post.rowCount === 1);
    const e = await db.pool.query(
      "select id from entries where kind = 'post' and slug = 'a-post'",
    );
    assert.equal(await view("admin", Number(e.rows[0].id)), "none");
    assert.equal(await view("admin", 999_999_999), "none");
  },
);

test(
  "store_video: no date leaves the default, a date is set and compared, null never overwrites one",
  opts,
  async () => {
    const plain = await video("date-default", { paid: false });
    const row = (id: number) =>
      db.pool.query(
        "select to_char(available_until, 'YYYY-MM-DD') as d from videos where entry_id = $1",
        [id],
      );
    const expected = await db.pool.query(
      "select to_char((now() at time zone 'utc')::date + interval '100 years', 'YYYY-MM-DD') as d",
    );
    assert.equal((await row(plain)).rows[0].d, expected.rows[0].d);

    const dated = await video("date-set", { paid: false, until: 10 });
    const first = (await row(dated)).rows[0].d;
    // The same call again changes nothing; a call with no date leaves the stored one alone.
    const again = await db.pool.query(
      `select store_video('date-set', 'date-set', '', false, '2026-01-01T00:00:00Z'::timestamptz, false, 'd',
                        '<p>d</p>', '[]'::jsonb, null, null, 'youtube', 'abc123', false, null, '{}', '{}', 1,
                        null::date) as outcome`,
    );
    assert.equal(again.rows[0].outcome, "unchanged");
    assert.equal((await row(dated)).rows[0].d, first);
    const moved = await db.pool.query(
      `select store_video('date-set', 'date-set', '', false, '2026-01-01T00:00:00Z'::timestamptz, false, 'd',
                        '<p>d</p>', '[]'::jsonb, null, null, 'youtube', 'abc123', false, null, '{}', '{}', 1,
                        ${day(20)}) as outcome`,
    );
    assert.equal(moved.rows[0].outcome, "updated");
    assert.notEqual((await row(dated)).rows[0].d, first);
  },
);

test(
  "a metr sets the date of a guest, a student or a blocked account; nobody else's, and never an invalid day",
  opts,
  async () => {
    const set = (who: string, target: string, accessUntil: unknown) =>
      call("PATCH", `/api/admin/users/${ids[target]}/access`, who, {
        accessUntil,
      });
    const ok = await set("metr", "guest", "2030-06-30");
    assert.equal(ok.status, 200);
    assert.equal(ok.body.user.accessUntil, "2030-06-30");
    const audit = await db.pool.query(
      `select detail from audit_log where action = 'access_until_changed' and target_id = $1`,
      [ids["guest"]],
    );
    assert.deepEqual(audit.rows[0].detail, { from: null, to: "2030-06-30" });
    // The same value again is a no-op and writes nothing.
    const same = await set("metr", "guest", "2030-06-30");
    assert.equal(same.body.unchanged, true);
    // A null takes the right away.
    const cleared = await set("metr", "guest", null);
    assert.equal(cleared.body.user.accessUntil, null);
    // The refusals carry their reason and change nothing.
    assert.equal((await set("metr", "admin", "2030-06-30")).status, 403);
    assert.equal((await set("metr", "metr", "2030-06-30")).status, 403);
    assert.equal(
      (await set("admin", "boss", "2030-06-30")).body.reason,
      "protected",
    );
    assert.equal(
      (await set("admin", "admin", "2030-06-30")).body.reason,
      "self",
    );
    assert.equal(
      (
        await set("guest", "student", "2030-06-30").catch(() => ({
          status: 404,
        }))
      ).status,
      404,
    );
    for (const bad of ["2030-02-30", "30.06.2030", "", 5, undefined]) {
      assert.equal((await set("metr", "guest", bad)).status, 400, String(bad));
    }
    assert.equal(
      (
        await db.pool.query("select access_until from users where id = $1", [
          ids["boss"],
        ])
      ).rows[0].access_until,
      null,
    );
  },
);

test(
  "a status change over HTTP sets, keeps or leaves the date, and the account page reads it",
  opts,
  async () => {
    await account("newcomer", "guest", null);
    const status = (target: string, wanted: string) =>
      call("PATCH", `/api/admin/users/${ids[target]}/status`, "metr", {
        status: wanted,
      });
    const toStudent = await status("newcomer", "student");
    assert.equal(toStudent.body.user.accessUntil, defaultAccessEnd());
    // A date an administrator shortened stays through a promotion between opening statuses.
    await call("PATCH", `/api/admin/users/${ids["newcomer"]}/access`, "admin", {
      accessUntil: "2027-03-01",
    });
    const toExpert = await status("newcomer", "expert");
    assert.equal(toExpert.body.user.accessUntil, "2027-03-01");
    // Blocking sets it to yesterday; lifting the block into a user status starts the clock again.
    const blocked = await status("newcomer", "blocked");
    assert.equal(
      blocked.body.user.accessUntil,
      utcDay(new Date(Date.now() - 24 * 60 * 60 * 1000)),
    );
    const back = await status("newcomer", "student");
    assert.equal(back.body.user.accessUntil, defaultAccessEnd());
    // The viewer JSON of the account page carries it.
    cookies["newcomer"] = (
      await createSession(db.pool, {
        userId: ids["newcomer"]!,
        status: "student",
      })
    ).id;
    const me = await call("GET", "/api/auth/me", "newcomer");
    assert.equal(me.body.viewer.accessUntil, defaultAccessEnd());
  },
);

test(
  "the members file: an old paying guest keeps the date and stays a guest; a bad date refuses the file",
  opts,
  async () => {
    const good = parseMembers(
      [
        "primary_email_address,first_name,member,memberUntil",
        "paid@example.test,Paid,true,2031-05-04",
        "lapsed-flag@example.test,Flag,false,2031-05-04",
        "no-date@example.test,None,true,",
      ].join("\n"),
    );
    assert.deepEqual(good.problems, []);
    assert.deepEqual(
      good.members.map((m) => m.accessUntil),
      ["2031-05-04", null, null],
    );
    const bad = parseMembers(
      [
        "primary_email_address,memberUntil",
        "x@example.test,2031-02-30",
        "y@example.test,soon",
      ].join("\n"),
    );
    assert.deepEqual(
      bad.problems.map((p) => p.reason),
      ["not_a_date", "not_a_date"],
    );

    const report = await importMembers(db.pool, good);
    assert.equal(report.created, 3);
    assert.equal(report.withAccessDate, 1);
    const row = await db.pool.query(
      "select status, to_char(access_until, 'YYYY-MM-DD') as d from users where email = 'paid@example.test'",
    );
    assert.deepEqual(row.rows[0], { status: "guest", d: "2031-05-04" });
    const lecture = await video("paid-for-import");
    const who = await db.pool.query(
      "select id from users where email = 'paid@example.test'",
    );
    const r = await db.pool.query("select lecture_view($1, $2) as v", [
      who.rows[0].id,
      lecture,
    ]);
    assert.equal(r.rows[0].v, "open");
  },
);
