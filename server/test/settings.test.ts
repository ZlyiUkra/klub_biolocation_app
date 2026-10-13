// The superuser's settings page API (T105 of specs/001-self-hosted-club-site; contracts/http-api.md "Administration",
// data-model.md "settings", FR-035, FR-036, spec User Story 9; tests first, red until T110 builds the routes). Needs the
// development database for everything but the first block.
//
// What is fixed here, and the owner may change any of it (the same arrangement as T095):
// - Only the superuser reaches the three routes: a plain admin, a metr, a student, a guest and a signed-out visitor
//   get the 404 of an unknown route, on every verb, and nothing changes.
// - Every change re-enters the password in the same request (the check of reauth.ts: 400 on `password`, 429 in a
//   pause). A new recipient takes effect only when its 8-digit code, mailed to the NEW address, is confirmed; the
//   OLD address is mailed that it changed; five wrong codes, 30 minutes or a second request void the first.
// - Every change of a value is a row of `settings_log` (who, from, to) and the code is in no table in the clear.
// - The members-block switch changes the members-only block and nothing else: no other field of the entry answer,
//   no list, no search result, no recipient, no mail; and no file but the entry query and the settings route reads it.

import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync, readdirSync, statSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { hashPassword } from "../src/auth/password.js";
import { createSession } from "../src/auth/session.js";
import { createApp } from "../src/http/app.js";
import { settingsLimits } from "../src/settings/routes.js";
import {
  createTestDatabase,
  skipWithoutDatabase,
  type TestDatabase,
} from "./helpers/db.js";

const opts = { skip: skipWithoutDatabase };
const ORIGIN = "http://localhost:4321";
const PASSWORD = "a long enough password";
const OLD = "club-desk@example.test";
const NEW = "new-desk@example.test";
const serverSrc = fileURLToPath(new URL("../../../src/", import.meta.url));

// ---- who reads the switch (no database) ----

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if (name.endsWith(".ts")) out.push(path);
  }
  return out;
}

test("the switch is read in one place: the entry query; and written by the settings route only", () => {
  const readers = sources(serverSrc)
    .filter((file) => readFileSync(file, "utf8").includes("members_block_mode"))
    .map((file) => relative(serverSrc, file).split(sep).join("/"))
    .sort();
  // The query that decides what an entry answer carries, the route that sets it, and nothing else.
  assert.deepEqual(readers, ["access/entries.ts", "settings/routes.ts"]);
});

// ---- the database ----

let db: TestDatabase;
let base: string;
let close: () => Promise<void>;
const ids: Record<string, number> = {};
const cookies: Record<string, string> = {};
let counter = 0;

async function seed(key: string, status: string, superuser = false) {
  const row = await db.pool.query(
    `insert into users (email, display_name, status, is_superuser, password_hash)
     values ($1, $1, $2, $3, $4) returning id`,
    [`${key}@example.test`, status, superuser, await hashPassword(PASSWORD)],
  );
  ids[key] = Number(row.rows[0].id);
  cookies[key] = (
    await createSession(db.pool, {
      userId: ids[key]!,
      status: status as "admin",
      superuser,
    })
  ).id;
}

type Sent = { status: number; body: any; headers: Headers };

async function call(
  method: string,
  path: string,
  who: string | null,
  body?: unknown,
): Promise<Sent> {
  counter += 1;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    origin: ORIGIN,
    "x-forwarded-for": `198.51.100.${(counter % 200) + 1}`,
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
  return { status: res.status, body: parsed, headers: res.headers };
}

const get = (who: string | null) => call("GET", "/api/admin/settings", who);
const put = (who: string | null, body: unknown) =>
  call("PUT", "/api/admin/settings", who, body);
const confirm = (who: string | null, code: unknown) =>
  call("POST", "/api/admin/settings/recipient/confirm", who, { code });

const setting = async (key: string) =>
  (
    await db.pool.query(
      "select value, updated_by from settings where key = $1",
      [key],
    )
  ).rows[0];
const logRows = async (key: string) =>
  (
    await db.pool.query(
      "select old_value, new_value, changed_by from settings_log where key = $1 order by id",
      [key],
    )
  ).rows;
const mailOf = async (kind: string) =>
  (
    await db.pool.query(
      "select to_address, subject, body from mail_queue where kind = $1 order by id",
      [kind],
    )
  ).rows;
const mailCount = async (): Promise<number> =>
  Number(
    (await db.pool.query("select count(*)::int as n from mail_queue")).rows[0]
      .n,
  );

/** The 8-digit code out of the last `recipient_code` mail. */
async function mailedCode(): Promise<string> {
  const rows = await mailOf("recipient_code");
  const text: string = rows[rows.length - 1]!.body;
  const found = new RegExp(`\\b\\d{${settingsLimits.codeDigits}}\\b`).exec(
    text,
  );
  assert.ok(found, "the mail carries the code");
  return found[0];
}

const MARKER = "zqxjvsettingsblockmarker";

before(async () => {
  if (skipWithoutDatabase) return;
  db = await createTestDatabase();
  await seed("boss", "admin", true);
  await seed("deputy", "admin");
  await seed("metr", "metr");
  await seed("student", "student");
  await seed("guest", "guest");
  await db.pool.query(
    `insert into settings (key, value) values ('feedback_recipient', $1::jsonb)`,
    [JSON.stringify(OLD)],
  );
  // One paid lecture with a members-only block, for the switch test.
  await db.pool.query(
    `select store_video('paid-lecture', 'Paid lecture', '', false, '2026-01-01T00:00:00Z'::timestamptz, false,
                        'the public part', '<p>the public part</p>', '[]'::jsonb, 'x',
                        '<p>${MARKER} second part</p>', 'youtube', null, true, null, '{}', '{}', 1, null::date)`,
  );
  await db.pool.query(
    "select store_video_source('paid-lecture', 'youtube', 'paidSecret_01')",
  );
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
  "only the superuser reaches the settings: everybody else, an admin included, gets the 404 of an unknown route",
  opts,
  async () => {
    for (const who of [null, "deputy", "metr", "student", "guest"]) {
      const reads = await get(who);
      assert.equal(reads.status, 404, `GET as ${who}`);
      assert.equal(reads.body.error, "not_found");
      const writes = await put(who, {
        password: PASSWORD,
        membersBlockMode: "hidden",
      });
      assert.equal(writes.status, 404, `PUT as ${who}`);
      const asks = await put(who, {
        password: PASSWORD,
        feedbackRecipient: NEW,
      });
      assert.equal(asks.status, 404, `PUT recipient as ${who}`);
      assert.equal(
        (await confirm(who, "12345678")).status,
        404,
        `confirm ${who}`,
      );
    }
    assert.equal((await setting("members_block_mode")).value, "locked");
    assert.equal((await setting("feedback_recipient")).value, OLD);
    assert.equal(await mailCount(), 0);
  },
);

test(
  "the superuser reads the settings: the recipient, nothing pending, the switch; never cached",
  opts,
  async () => {
    const r = await get("boss");
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, {
      feedbackRecipient: OLD,
      recipientPending: null,
      membersBlockMode: "locked",
    });
    assert.match(r.headers.get("cache-control") ?? "", /no-store/);
  },
);

test(
  "the members-block switch: the password is re-entered, it is logged, a bad value is refused, and it changes the block only",
  opts,
  async () => {
    const guest = async () =>
      JSON.parse(await (await fetch(base + "/api/videos/paid-lecture")).text())
        .entry;
    const list = async () =>
      await (await fetch(base + "/api/list?kind=video")).text();
    const search = async () =>
      await (await fetch(base + `/api/search?q=${MARKER}`)).text();

    const lockedEntry = await guest();
    const lockedList = await list();
    const lockedSearch = await search();
    assert.equal(
      JSON.stringify(lockedEntry).includes(MARKER),
      false,
      "locked: the block is not sent to a guest",
    );
    const queuedBefore = await mailCount();

    // No password, a wrong one, a bad value: nothing changes and nothing is logged.
    const none = await put("boss", { membersBlockMode: "hidden" });
    assert.equal(none.status, 400);
    assert.equal(none.body.field, "password");
    const wrong = await put("boss", {
      password: "not the password",
      membersBlockMode: "hidden",
    });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.body.field, "password");
    for (const bad of ["open", "", "LOCKED", null, 1, ["hidden"]]) {
      const r = await put("boss", {
        password: PASSWORD,
        membersBlockMode: bad,
      });
      assert.equal(r.status, 400, JSON.stringify(bad));
      assert.equal(r.body.field, "membersBlockMode");
    }
    assert.equal((await setting("members_block_mode")).value, "locked");
    assert.equal((await logRows("members_block_mode")).length, 1, "the seed");

    const set = await put("boss", {
      password: PASSWORD,
      membersBlockMode: "hidden",
    });
    assert.equal(set.status, 200);
    assert.equal(set.body.membersBlockMode, "hidden");
    const row = await setting("members_block_mode");
    assert.equal(row.value, "hidden");
    assert.equal(Number(row.updated_by), ids["boss"]);
    const log = await logRows("members_block_mode");
    assert.equal(log.length, 2);
    assert.equal(log[1]!.old_value, "locked");
    assert.equal(log[1]!.new_value, "hidden");
    assert.equal(Number(log[1]!.changed_by), ids["boss"]);

    // The same value again is a 200 and writes no second row.
    const again = await put("boss", {
      password: PASSWORD,
      membersBlockMode: "hidden",
    });
    assert.equal(again.status, 200);
    assert.equal((await logRows("members_block_mode")).length, 2);

    // Under "hidden" the block is sent; every other member of the answer, every list and every search is as it was.
    const hiddenEntry = await guest();
    assert.equal(JSON.stringify(hiddenEntry).includes(MARKER), true);
    for (const key of ["membersOnlyHtml", "membersOnlyHidden"]) {
      delete lockedEntry.content[key];
      delete hiddenEntry.content[key];
    }
    assert.deepEqual(hiddenEntry, lockedEntry, "nothing but the block moved");
    assert.equal(await list(), lockedList);
    assert.equal(await search(), lockedSearch);
    assert.equal((await setting("feedback_recipient")).value, OLD);
    assert.equal(await mailCount(), queuedBefore, "no mail");

    // Back again, for the tests that follow.
    const back = await put("boss", {
      password: PASSWORD,
      membersBlockMode: "locked",
    });
    assert.equal(back.status, 200);
  },
);

test(
  "a new recipient: asked with the password, mailed a code at the NEW address, active only after the code, the old one told",
  opts,
  async () => {
    const asked = await put("boss", {
      password: PASSWORD,
      feedbackRecipient: NEW,
    });
    assert.equal(asked.status, 202);
    assert.equal(asked.body.recipientPending.address, NEW);
    assert.ok(
      Number.isFinite(Date.parse(asked.body.recipientPending.expiresAt)),
    );

    // Not active yet: the recipient is still the old one, mail still goes there.
    assert.equal((await setting("feedback_recipient")).value, OLD);
    const state = await get("boss");
    assert.equal(state.body.feedbackRecipient, OLD);
    assert.equal(state.body.recipientPending.address, NEW);

    const codeMails = await mailOf("recipient_code");
    assert.equal(codeMails.length, 1);
    assert.equal(
      codeMails[0]!.to_address,
      NEW,
      "the code goes to the new address only",
    );
    const code = await mailedCode();
    assert.equal(
      codeMails[0]!.subject.includes(code),
      false,
      "never in the subject",
    );
    assert.equal(codeMails[0]!.subject.includes(NEW), false);

    // The OLD address is warned as soon as the change is asked for (the Authentication Cheat Sheet, "Changing A User's
    // Registered Email Address": a notification-only message to the current address, a confirmation to the new one),
    // so that its owner can act before the code is entered; that message never carries the code.
    const warned = await mailOf("recipient_change_requested");
    assert.equal(warned.length, 1);
    assert.equal(warned[0]!.to_address, OLD);
    assert.equal(
      warned[0]!.body.includes(code),
      false,
      "no code to the old address",
    );
    assert.equal(/[\r\n]/.test(warned[0]!.subject), false);

    // The code is kept as a hash: nowhere in a table, the log or the audit trail in the clear.
    for (const table of ["settings", "settings_log", "audit_log"]) {
      const text = JSON.stringify(
        (await db.pool.query(`select * from ${table}`)).rows,
      );
      assert.equal(text.includes(code), false, `${table} holds the code`);
    }

    // A wrong code, then the right one.
    const wrong = await confirm(
      "boss",
      code === "00000000" ? "11111111" : "00000000",
    );
    assert.equal(wrong.status, 400);
    assert.equal(wrong.body.field, "code");
    assert.equal((await setting("feedback_recipient")).value, OLD);

    const ok = await confirm("boss", code);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.feedbackRecipient, NEW);
    assert.equal(ok.body.recipientPending, null);
    const row = await setting("feedback_recipient");
    assert.equal(row.value, NEW);
    assert.equal(Number(row.updated_by), ids["boss"]);
    const log = await logRows("feedback_recipient");
    assert.deepEqual(
      log
        .slice(-1)
        .map((r) => [r.old_value, r.new_value, Number(r.changed_by)]),
      [[OLD, NEW, ids["boss"]]],
    );

    // The old address is told, and only that.
    const told = await mailOf("recipient_changed");
    assert.equal(told.length, 1);
    assert.equal(told[0]!.to_address, OLD);
    assert.equal(/[\r\n]/.test(told[0]!.subject), false);

    // A code works once.
    const twice = await confirm("boss", code);
    assert.equal(twice.status, 400);
    assert.equal((await setting("feedback_recipient")).value, NEW);
    assert.equal((await mailOf("recipient_changed")).length, 1);

    // Put the old one back for what follows, through the same flow.
    await put("boss", { password: PASSWORD, feedbackRecipient: OLD });
    assert.equal((await confirm("boss", await mailedCode())).status, 200);
    assert.equal((await setting("feedback_recipient")).value, OLD);
  },
);

test(
  "a request is replaced by the next, expires after its time and is voided by five wrong codes",
  opts,
  async () => {
    // Replaced: the first code no longer works.
    await put("boss", {
      password: PASSWORD,
      feedbackRecipient: "first@example.test",
    });
    const first = await mailedCode();
    await put("boss", {
      password: PASSWORD,
      feedbackRecipient: "second@example.test",
    });
    const second = await mailedCode();
    assert.equal(
      (await get("boss")).body.recipientPending.address,
      "second@example.test",
    );
    if (first !== second) {
      assert.equal((await confirm("boss", first)).status, 400);
    }

    // Five wrong codes void the request, and then the right one does not work either.
    for (let i = 0; i < settingsLimits.codeTries; i += 1) {
      const r = await confirm(
        "boss",
        second === "00000000" ? "11111111" : "00000000",
      );
      assert.equal(r.status, 400, `wrong code ${i}`);
    }
    assert.equal((await get("boss")).body.recipientPending, null);
    assert.equal((await confirm("boss", second)).status, 400);
    assert.equal((await setting("feedback_recipient")).value, OLD);

    // Expired: the pending value's time is moved into the past in the table, the one place a test may.
    await put("boss", {
      password: PASSWORD,
      feedbackRecipient: "late@example.test",
    });
    const late = await mailedCode();
    await db.pool.query(
      `update settings
          set value = jsonb_set(value, '{expiresAt}', to_jsonb(to_char(now() at time zone 'utc' - interval '1 minute',
                                                                      'YYYY-MM-DD"T"HH24:MI:SS"Z"')))
        where key = 'feedback_recipient_pending'`,
    );
    const expired = await confirm("boss", late);
    assert.equal(expired.status, 400);
    assert.equal((await get("boss")).body.recipientPending, null);
    assert.equal((await setting("feedback_recipient")).value, OLD);
  },
);

test(
  "an address that is not one bare address is a 400 on `feedbackRecipient`, with no mail and nothing pending",
  opts,
  async () => {
    const queued = await mailCount();
    const bad: unknown[] = [
      "",
      "   ",
      "not-an-address",
      "a@",
      "@b.test",
      "a@b",
      "Club Desk <desk@example.test>",
      "a@b.test, c@d.test",
      "a@b.test;c@d.test",
      "a@b.test\r\nBcc: x@y.test",
      "a b@example.test",
      `${"x".repeat(settingsLimits.maxAddressChars)}@example.test`,
      OLD,
      null,
      42,
    ];
    for (const address of bad) {
      const r = await put("boss", {
        password: PASSWORD,
        feedbackRecipient: address,
      });
      assert.equal(r.status, 400, JSON.stringify(address)?.slice(0, 40));
      assert.equal(r.body.field, "feedbackRecipient");
    }
    assert.equal(await mailCount(), queued);
    assert.equal((await get("boss")).body.recipientPending, null);
  },
);

test(
  "a wrong password changes nothing and is held against the account: tries left, then a pause that a right one does not skip",
  opts,
  async () => {
    const queued = await mailCount();
    const wrong = await put("boss", {
      password: "not the password",
      feedbackRecipient: NEW,
    });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.body.field, "password");
    assert.equal((await get("boss")).body.recipientPending, null);
    assert.equal(await mailCount(), queued);

    // The same pause as a wrong sign-in earns (reauth.ts): after five wrong ones even the right one is a 429.
    for (let i = 0; i < 4; i += 1) {
      await put("boss", {
        password: "still not it",
        membersBlockMode: "hidden",
      });
    }
    const paused = await put("boss", {
      password: PASSWORD,
      membersBlockMode: "hidden",
    });
    assert.equal(paused.status, 429);
    assert.equal(paused.body.error, "rate_limited");
    assert.ok(Number(paused.headers.get("retry-after")) > 0);
    assert.equal((await setting("members_block_mode")).value, "locked");

    // Leave the account as the others found it.
    await db.pool.query(
      "update users set failed_count = 0, locked_until = null where id = $1",
      [ids["boss"]],
    );
    await db.pool.query("delete from login_attempts");
  },
);
