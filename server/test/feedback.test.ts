// The feedback form's API and the mail queue's worker step (T104 and T144 of specs/001-self-hosted-club-site;
// contracts/http-api.md "Feedback", data-model.md "feedback" and "mail_queue", FR-033 to FR-036, spec User Story 8;
// tests first, red until T107 builds the route and the tables and T108 the worker). Needs the development database.
//
// What is fixed here, and the owner may change any of it (the same arrangement as T095):
// - Stored before mail: the request writes the message and its `feedback_notice` mail row in one transaction and
//   sends nothing; the worker (`deliverDue`) sends later. A mail failure keeps the message, counts an attempt,
//   records the error and moves the next attempt later; success sets `mailed_at` and clears `mail_error`.
// - Refused with nothing stored: a filled honeypot (`website`), a fill time under 3 seconds, missing, future or older
//   than a day, an oversized text, a line break in a one-line field, NUL, a subject outside the fixed list, a
//   cross-site post, a burst (limit C: 5 stored messages an hour per address, then 429 with `Retry-After`). The
//   honeypot and the fill time answer a plain 400 that does not say which check failed.
// - Visitor text never reaches a header: the mail row's subject is built from fixed texts, its recipient is the
//   setting, and the message handed to a transport has exactly `to`, `subject` and `text`.
// - The admin list is for metr and admin; anyone else gets the 404 of an unknown route.

import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { createSession } from "../src/auth/session.js";
import { feedbackLimits, feedbackSubjects } from "../src/feedback/routes.js";
import { createApp } from "../src/http/app.js";
import {
  deliverDue,
  type MailMessage,
  type MailTransport,
} from "../src/mail/queue.js";
import {
  createTestDatabase,
  skipWithoutDatabase,
  type TestDatabase,
} from "./helpers/db.js";

const opts = { skip: skipWithoutDatabase };
const ORIGIN = "http://localhost:4321";
const RECIPIENT = "club-desk@example.test";

let db: TestDatabase;
let base: string;
let close: () => Promise<void>;
let counter = 0;
const cookies: Record<string, string> = {};

/** A fresh address for one scenario, so the per-address limit of one test is never another's (trust proxy is 1). */
const freshAddress = () => `10.77.${++counter}.9`;

async function account(status: string): Promise<string> {
  const key = `${status}${++counter}`;
  const row = await db.pool.query(
    `insert into users (email, display_name, status, access_until, blocked_by, blocked_at)
     values ($1, $1, $2, null, null, null) returning id`,
    [`${key}@example.test`, status],
  );
  const { id } = await createSession(db.pool, {
    userId: Number(row.rows[0].id),
    status: status as "guest",
    superuser: false,
  });
  cookies[key] = id;
  return key;
}

type Sent = { status: number; body: any; headers: Headers };

async function call(
  method: string,
  path: string,
  options: {
    body?: unknown;
    raw?: string;
    address?: string;
    who?: string | null;
    origin?: string;
  } = {},
): Promise<Sent> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    origin: options.origin ?? ORIGIN,
  };
  if (options.address) headers["x-forwarded-for"] = options.address;
  if (options.who) headers["cookie"] = `__Host-session=${cookies[options.who]}`;
  const res = await fetch(base + path, {
    method,
    headers,
    body:
      options.raw !== undefined
        ? options.raw
        : options.body === undefined
          ? undefined
          : JSON.stringify(options.body),
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

/** A valid form, opened ten seconds ago; `over` replaces or adds members (an `undefined` removes one). */
function form(over: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {
    body: "The sign-in page says my address is unknown.",
    name: "Ann",
    contact: "ann@example.test",
    website: "",
    startedAt: Date.now() - 10_000,
    ...over,
  };
  for (const key of Object.keys(out)) {
    if (out[key] === undefined) delete out[key];
  }
  return out;
}

const send = (
  over: Record<string, unknown> = {},
  address: string = freshAddress(),
) => call("POST", "/api/feedback", { body: form(over), address });

const count = async (table: "feedback" | "mail_queue"): Promise<number> =>
  Number(
    (await db.pool.query(`select count(*)::int as n from ${table}`)).rows[0].n,
  );

before(async () => {
  if (skipWithoutDatabase) return;
  db = await createTestDatabase();
  await db.pool.query(
    `insert into settings (key, value) values ('feedback_recipient', $1::jsonb)`,
    [JSON.stringify(RECIPIENT)],
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
  "a valid message is stored with its mail row at once, and nothing is sent inside the request",
  opts,
  async () => {
    const address = "10.77.200.123";
    const r = await call("POST", "/api/feedback", {
      body: form({ subject: "signin_problem" }),
      address,
    });
    assert.equal(r.status, 201);
    assert.deepEqual(r.body, { received: true });

    const row = (
      await db.pool.query(
        `select body, name, contact, subject, received_at, address_prefix, mailed_at, mail_error
           from feedback order by id desc limit 1`,
      )
    ).rows[0];
    assert.equal(row.body, "The sign-in page says my address is unknown.");
    assert.equal(row.name, "Ann");
    assert.equal(row.contact, "ann@example.test");
    assert.equal(row.subject, "signin_problem");
    assert.ok(row.received_at);
    assert.equal(row.mailed_at, null);
    assert.equal(row.mail_error, null);
    // The network part only: the full address is nowhere in what is kept.
    assert.equal(row.address_prefix, "10.77.200");
    assert.equal(JSON.stringify(row).includes(address), false);

    const mail = (
      await db.pool.query(
        `select kind, to_address, subject, body, attempts, sent_at
           from mail_queue order by id desc limit 1`,
      )
    ).rows[0];
    assert.equal(mail.kind, "feedback_notice");
    assert.equal(mail.to_address, RECIPIENT);
    assert.equal(Number(mail.attempts), 0);
    assert.equal(mail.sent_at, null, "the request did not send it");
    assert.ok(
      mail.body.includes("The sign-in page says my address is unknown."),
    );
    assert.ok(mail.body.includes("ann@example.test"));
  },
);

test(
  "the message stays when the mail fails: the error is kept, the next attempt is later, a success marks it mailed",
  opts,
  async () => {
    await db.pool.query("delete from mail_queue");
    const r = await send({ body: "Please keep this one" });
    assert.equal(r.status, 201);
    const storedBefore = await count("feedback");

    const failing: MailTransport = {
      async send() {
        throw new Error("550 mailbox unavailable");
      },
    };
    const first = new Date(Date.now() + 60_000);
    const failed = await deliverDue(db.pool, failing, first);
    assert.deepEqual(failed, { sent: 0, failed: 1 });

    assert.equal(await count("feedback"), storedBefore, "the message is kept");
    const mail = (
      await db.pool.query(
        `select attempts, last_error, sent_at, next_attempt_at from mail_queue`,
      )
    ).rows[0];
    assert.equal(Number(mail.attempts), 1);
    assert.match(mail.last_error, /mailbox unavailable/);
    assert.equal(mail.sent_at, null);
    assert.ok(new Date(mail.next_attempt_at).getTime() > first.getTime());
    const kept = (
      await db.pool.query(
        `select body, mailed_at, mail_error from feedback order by id desc limit 1`,
      )
    ).rows[0];
    assert.equal(kept.body, "Please keep this one");
    assert.equal(kept.mailed_at, null);
    assert.match(kept.mail_error, /mailbox unavailable/);

    // Not due yet: the transport is not asked again.
    const sent: MailMessage[] = [];
    const working: MailTransport = {
      async send(message) {
        sent.push(message);
      },
    };
    const early = await deliverDue(
      db.pool,
      working,
      new Date(first.getTime() + 1_000),
    );
    assert.deepEqual(early, { sent: 0, failed: 0 });
    assert.equal(sent.length, 0);

    // A day on it is due, goes out, and the message says so.
    const later = new Date(first.getTime() + 24 * 60 * 60_000);
    const done = await deliverDue(db.pool, working, later);
    assert.deepEqual(done, { sent: 1, failed: 0 });
    assert.equal(sent.length, 1);
    const mailedRow = (
      await db.pool.query(
        `select mailed_at, mail_error from feedback order by id desc limit 1`,
      )
    ).rows[0];
    assert.ok(mailedRow.mailed_at);
    assert.equal(mailedRow.mail_error, null);
    const mailAfter = (await db.pool.query(`select sent_at from mail_queue`))
      .rows[0];
    assert.ok(mailAfter.sent_at);
    // A sent row is not sent again.
    assert.deepEqual(
      await deliverDue(db.pool, working, new Date(later.getTime() + 60_000)),
      { sent: 0, failed: 0 },
    );
  },
);

test(
  "visitor text never reaches a header: fixed subject, the setting as recipient, three members in the message",
  opts,
  async () => {
    await db.pool.query("delete from mail_queue");
    const attack = "x\r\nBcc: attacker@example.test\r\nSubject: pwned";
    // The body is free text, so a line break is allowed there and stays text.
    const r = await send({
      body: `Hello ${attack}`,
      subject: "signin_problem",
    });
    assert.equal(r.status, 201);

    const sent: MailMessage[] = [];
    await deliverDue(
      db.pool,
      {
        async send(message) {
          sent.push(message);
        },
      },
      new Date(Date.now() + 60_000),
    );
    assert.equal(sent.length, 1);
    const message = sent[0]!;
    assert.deepEqual(Object.keys(message).sort(), ["subject", "text", "to"]);
    assert.equal(message.to, RECIPIENT);
    assert.equal(/[\r\n]/.test(message.subject), false, "one line");
    assert.equal(message.subject.length > 0, true);
    for (const piece of ["attacker", "pwned", "Hello", "Ann", "ann@"]) {
      assert.equal(
        message.subject.includes(piece),
        false,
        `the subject does not carry ${piece}`,
      );
    }
    assert.ok(
      message.text.includes(attack),
      "the text is in the body, as text",
    );

    // The one-line fields refuse a line break instead of keeping it for a header that may one day use them.
    for (const field of ["name", "contact"]) {
      const bad = await send({ [field]: "Ann\r\nBcc: attacker@example.test" });
      assert.equal(bad.status, 400, field);
      assert.equal(bad.body.error, "invalid_input");
      assert.equal(bad.body.field, field);
    }
    assert.equal((await send({ name: "a\u0000b" })).status, 400);
  },
);

test(
  "the subject is a code of the fixed list or nothing; any other text is a 400 on `subject` (T144)",
  opts,
  async () => {
    const stored = await count("feedback");
    for (const code of feedbackSubjects) {
      assert.equal((await send({ subject: code })).status, 201, code);
    }
    assert.equal((await send({ subject: undefined })).status, 201);
    assert.equal((await send({ subject: null })).status, 201);
    assert.equal(await count("feedback"), stored + feedbackSubjects.length + 2);

    for (const bad of ["sign-in problem", "Bcc: x", "", "SIGNIN_PROBLEM", 5]) {
      const r = await send({ subject: bad });
      assert.equal(r.status, 400, JSON.stringify(bad));
      assert.equal(r.body.error, "invalid_input");
      assert.equal(r.body.field, "subject");
    }
    assert.equal(await count("feedback"), stored + feedbackSubjects.length + 2);
  },
);

test(
  "a filled honeypot, and a fill time that is too short, missing, in the future or a day old: a plain 400, nothing stored",
  opts,
  async () => {
    const stored = await count("feedback");
    const queued = await count("mail_queue");
    const now = Date.now();
    const cases: [string, Record<string, unknown>][] = [
      ["honeypot filled", { website: "https://spam.example" }],
      ["honeypot with text and spaces", { website: "   x " }],
      ["a form sent at once", { startedAt: now - 500 }],
      ["a form sent in the same instant", { startedAt: now }],
      ["no fill time", { startedAt: undefined }],
      ["a fill time that is not a number", { startedAt: "yesterday" }],
      ["a fill time in the future", { startedAt: now + 60_000 }],
      [
        "a fill time over a day old",
        { startedAt: now - feedbackLimits.maxFillAgeMs - 60_000 },
      ],
      ["a fill time of zero", { startedAt: 0 }],
    ];
    for (const [what, over] of cases) {
      const r = await send(over);
      assert.equal(r.status, 400, what);
      assert.equal(r.body.error, "invalid_input", what);
      assert.equal(
        Object.prototype.hasOwnProperty.call(r.body, "field"),
        false,
        `${what}: the answer does not name the check`,
      );
    }
    assert.equal(await count("feedback"), stored);
    assert.equal(await count("mail_queue"), queued);

    // The honeypot absent altogether is the same as empty.
    assert.equal((await send({ website: undefined })).status, 201);
    // The edge of the window is allowed.
    assert.equal(
      (await send({ startedAt: Date.now() - feedbackLimits.minFillMs - 200 }))
        .status,
      201,
    );
  },
);

test(
  "size rules: the longest message passes, one more character is a 400 on `body`, and a huge request is a 413",
  opts,
  async () => {
    const stored = await count("feedback");
    assert.equal(
      (await send({ body: "x".repeat(feedbackLimits.maxBodyChars) })).status,
      201,
      "the longest message",
    );
    const padded = await send({ body: "  trimmed \n" });
    assert.equal(padded.status, 201);
    assert.equal(
      (
        await db.pool.query(
          "select body from feedback order by id desc limit 1",
        )
      ).rows[0].body,
      "trimmed",
    );

    const refused: [string, Record<string, unknown>, string][] = [
      ["empty", { body: "" }, "body"],
      ["spaces", { body: "  \n " }, "body"],
      ["missing", { body: undefined }, "body"],
      ["not text", { body: { x: 1 } }, "body"],
      ["NUL", { body: "a\u0000b" }, "body"],
      [
        "too long",
        { body: "x".repeat(feedbackLimits.maxBodyChars + 1) },
        "body",
      ],
      [
        "name too long",
        { name: "n".repeat(feedbackLimits.maxNameChars + 1) },
        "name",
      ],
      [
        "contact too long",
        { contact: "c".repeat(feedbackLimits.maxContactChars + 1) },
        "contact",
      ],
    ];
    for (const [what, over, field] of refused) {
      const r = await send(over);
      assert.equal(r.status, 400, what);
      assert.equal(r.body.error, "invalid_input", what);
      assert.equal(r.body.field, field, what);
    }
    assert.equal(await count("feedback"), stored + 2);

    const huge = await call("POST", "/api/feedback", {
      raw: JSON.stringify(form({ body: "y".repeat(150_000) })),
      address: freshAddress(),
    });
    assert.equal(huge.status, 413);
    assert.equal(huge.body.error, "too_large");
    assert.equal(await count("feedback"), stored + 2);
  },
);

test("a cross-site post is refused with nothing stored", opts, async () => {
  const stored = await count("feedback");
  const r = await call("POST", "/api/feedback", {
    body: form(),
    address: freshAddress(),
    origin: "https://evil.example",
  });
  assert.equal(r.status, 403);
  assert.equal(r.body.error, "cross_site");
  assert.equal(await count("feedback"), stored);
});

test(
  "limit C: past the number per window an address gets 429 with Retry-After and nothing is stored; refusals and other addresses are untouched",
  opts,
  async () => {
    const busy = freshAddress();
    // Attempts the form refuses are not held against the address.
    for (let i = 0; i < feedbackLimits.maxPerWindow + 2; i += 1) {
      const r = await send({ website: "bot" }, busy);
      assert.equal(r.status, 400);
    }
    for (let i = 0; i < feedbackLimits.maxPerWindow; i += 1) {
      const r = await send({ body: `Message ${i}` }, busy);
      assert.equal(r.status, 201, `message ${i}`);
    }
    const stored = await count("feedback");
    const queued = await count("mail_queue");

    const over = await send({ body: "One too many" }, busy);
    assert.equal(over.status, 429);
    assert.equal(over.body.error, "rate_limited");
    const wait = Number(over.headers.get("retry-after"));
    assert.ok(Number.isInteger(wait) && wait > 0, "Retry-After in seconds");
    assert.equal(await count("feedback"), stored, "nothing stored");
    assert.equal(await count("mail_queue"), queued, "nothing queued");

    assert.equal((await send({ body: "Another visitor" })).status, 201);
  },
);

test(
  "the admin list is for a metr and an admin, newest first; anyone else gets the 404 of an unknown route",
  opts,
  async () => {
    await send({ body: "First of the list", name: "Early" });
    await send({ body: "Second of the list", name: "Late" });
    const metr = await account("metr");
    const admin = await account("admin");
    const student = await account("student");
    const guest = await account("guest");

    for (const who of [null, guest, student]) {
      const r = await call("GET", "/api/admin/feedback", { who });
      assert.equal(r.status, 404, String(who));
      assert.equal(r.body.error, "not_found");
    }
    for (const who of [metr, admin]) {
      const r = await call("GET", "/api/admin/feedback", { who });
      assert.equal(r.status, 200, who);
      // Changed 2026-10-13 (the owner's order, after T107): the answer is one page and the count of the whole list,
      // `{items, total}`, as the posts' and the people's lists are, and no longer a bare array.
      assert.ok(Array.isArray(r.body.items));
      assert.equal(typeof r.body.total, "number");
      const bodies = r.body.items.map((m: { body: string }) => m.body);
      assert.ok(
        bodies.indexOf("Second of the list") <
          bodies.indexOf("First of the list"),
        "newest first",
      );
      const item = r.body.items[bodies.indexOf("Second of the list")];
      assert.equal(item.name, "Late");
      assert.ok(item.receivedAt);
      assert.ok("mailedAt" in item, "the mail state is shown");
      assert.ok("mailError" in item);
      // The full address is nowhere: only the network part.
      assert.match(item.addressPrefix, /^10\.77\.\d+$/);
      assert.equal(/10.77.d+.9/.test(JSON.stringify(r.body)), false);
    }
  },
);

// Added 2026-10-13 (the owner's order after T107): the admin list is paged on the server and can be searched, the way
// the posts' and the people's lists of the panel are (`page`, `limit`, `q`; the answer `{items, total}`).
// - The rows are planted straight into the table with a known age, so the order is fixed and the form's own limit C is
//   not in the way; every test finds its rows by a marker word of its own, since the database is shared by the file.
// - The search looks at what the visitor wrote (the text, the name, the contact), as a plain substring that ignores
//   case: `%` and `_` are ordinary characters. The network part of the address and the subject code are not searched.

type Planted = {
  body: string;
  name?: string | null;
  contact?: string | null;
  minutesAgo: number;
};

async function plant(rows: Planted[]): Promise<void> {
  for (const row of rows) {
    await db.pool.query(
      `insert into feedback (body, name, contact, received_at, address_prefix)
       values ($1, $2, $3, now() - ($4 || ' minutes')::interval, '10.88.1')`,
      [row.body, row.name ?? null, row.contact ?? null, String(row.minutesAgo)],
    );
  }
}

type Listed = {
  items: { id: number; body: string; name: string | null }[];
  total: number;
};

async function listFor(
  who: string,
  query: Record<string, string> = {},
): Promise<Listed> {
  const r = await call(
    "GET",
    `/api/admin/feedback?${new URLSearchParams(query)}`,
    { who },
  );
  assert.equal(r.status, 200, JSON.stringify(query));
  return r.body as Listed;
}

test(
  "the admin list is paged on the server: twenty to a page, the page and the limit are honoured, the pages hold every message once, newest first",
  opts,
  async () => {
    const metr = await account("metr");
    const planted: Planted[] = [];
    // 45 messages, "zz-pager 45" the newest (one minute old) and "zz-pager 1" the oldest.
    for (let i = 1; i <= 45; i += 1) {
      planted.push({ body: `zz-pager ${i}`, minutesAgo: 46 - i });
    }
    await plant(planted);
    const marker = { q: "zz-pager" };

    const first = await listFor(metr, marker);
    assert.equal(first.total, 45);
    assert.equal(first.items.length, 20, "twenty to a page by default");
    assert.equal(first.items[0]!.body, "zz-pager 45", "the newest first");

    const seen: string[] = [];
    for (let page = 1; page <= 3; page += 1) {
      const one = await listFor(metr, { ...marker, page: String(page) });
      assert.equal(one.total, 45, "the total is the whole list on every page");
      seen.push(...one.items.map((m) => m.body));
    }
    assert.equal(seen.length, 45, "three pages: 20, 20 and 5");
    assert.deepEqual(
      seen,
      Array.from({ length: 45 }, (_, i) => `zz-pager ${45 - i}`),
      "every message once, in order, none missing between two pages",
    );

    const tenth = await listFor(metr, { ...marker, limit: "10", page: "5" });
    assert.deepEqual(
      tenth.items.map((m) => m.body),
      ["zz-pager 5", "zz-pager 4", "zz-pager 3", "zz-pager 2", "zz-pager 1"],
    );

    const capped = await listFor(metr, { ...marker, limit: "1000" });
    assert.equal(capped.items.length, 45, "limit is capped at 50, not at 20");
    assert.equal(
      (await listFor(metr, { ...marker, limit: "51" })).items.length,
      45,
    );

    const past = await listFor(metr, { ...marker, page: "99" });
    assert.deepEqual(past.items, [], "a page past the end is empty");
    assert.equal(past.total, 45, "and still says how many there are");

    for (const junk of [
      { page: "abc", limit: "-3" },
      { page: "0", limit: "0" },
      { page: "1.5", limit: "x" },
    ]) {
      const one = await listFor(metr, { ...marker, ...junk });
      assert.equal(one.items.length, 20, JSON.stringify(junk));
      assert.equal(one.items[0]!.body, "zz-pager 45", JSON.stringify(junk));
    }
  },
);

test(
  "the admin list can be searched: the text, the name and the contact, ignoring case, as a plain substring; the network part and the subject code are not searched",
  opts,
  async () => {
    const metr = await account("metr");
    await plant([
      {
        body: "zz-find Не могу войти на сайт",
        name: "Ольга",
        contact: "olga@example.test",
        minutesAgo: 6,
      },
      { body: "zz-find hello there", name: "Boris Search", minutesAgo: 5 },
      { body: "zz-find a sure 100% thing", minutesAgo: 4 },
      { body: "zz-find snake_case words", minutesAgo: 3 },
      // The end of one field and the start of the next must not join into a match.
      {
        body: "zz-find the very end",
        name: "start of a name",
        contact: "c@example.test",
        minutesAgo: 2,
      },
    ]);
    const bodiesOf = async (q: string) =>
      (await listFor(metr, { q })).items.map((m) => m.body);

    assert.equal((await listFor(metr, { q: "zz-find" })).total, 5);
    // The name, in capitals and in Cyrillic.
    assert.deepEqual(await bodiesOf("ОЛЬГА"), [
      "zz-find Не могу войти на сайт",
    ]);
    // The text, with spaces around the query.
    assert.deepEqual(await bodiesOf("  МОГУ войти  "), [
      "zz-find Не могу войти на сайт",
    ]);
    // The contact, in capitals.
    assert.deepEqual(await bodiesOf("OLGA@EXAMPLE"), [
      "zz-find Не могу войти на сайт",
    ]);
    assert.deepEqual(await bodiesOf("boris SEARCH"), ["zz-find hello there"]);
    // Wildcards of a pattern language are plain characters here.
    assert.deepEqual(await bodiesOf("100%"), ["zz-find a sure 100% thing"]);
    assert.deepEqual(await bodiesOf("snake_case"), [
      "zz-find snake_case words",
    ]);
    assert.deepEqual(
      await bodiesOf("zz-find sna_e"),
      [],
      "_ is not a wildcard",
    );
    assert.deepEqual(
      await bodiesOf("zz-find%words"),
      [],
      "% is not a wildcard",
    );
    assert.deepEqual(await bodiesOf("\\"), [], "a backslash is a character");
    // One field at a time.
    assert.deepEqual(await bodiesOf("end start"), []);
    // What is not the visitor's own text is not searched.
    assert.equal((await listFor(metr, { q: "10.88.1" })).total, 0);
    assert.equal((await listFor(metr, { q: "signin_problem" })).total, 0);

    const none = await listFor(metr, { q: "no message has this" });
    assert.deepEqual(none, { items: [], total: 0 });

    // The query is cut at 100 characters, as the posts' search cuts it; a long one is no error.
    const long = await call(
      "GET",
      `/api/admin/feedback?${new URLSearchParams({ q: "x".repeat(5000) })}`,
      { who: metr },
    );
    assert.equal(long.status, 200);
    // A query given twice is not text: it is ignored, as the posts' search ignores it.
    const twice = await call("GET", "/api/admin/feedback?q=zz&q=find", {
      who: metr,
    });
    assert.equal(twice.status, 200);
    assert.equal(twice.body.total, (await listFor(metr)).total);

    // A search and a page together: the total is the matches, the page is cut from the matches.
    const paged = await listFor(metr, { q: "zz-find", limit: "2", page: "3" });
    assert.equal(paged.total, 5);
    assert.deepEqual(
      paged.items.map((m) => m.body),
      ["zz-find Не могу войти на сайт"],
      "page 3 of 2: the oldest match alone",
    );
  },
);
