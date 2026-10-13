// The sign-in routes over HTTP (T050 of specs/001-self-hosted-club-site; contracts/http-api.md, "Accounts and
// sessions"). Needs the development database. The numbers and the module rules are tested in signin, limits, session
// and accounts tests; this file tests what only the routes decide: the cookie a browser receives, the answers, which
// route a limited session may reach, that an old session id dies at sign-in, and that the cross-site guard stands in
// front of all of it.

import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { hashPassword } from "../src/auth/password.js";
import { createApp } from "../src/http/app.js";
import {
  createTestDatabase,
  skipWithoutDatabase,
  type TestDatabase,
} from "./helpers/db.js";

const ORIGIN = "http://localhost:4321";
const password = "correct horse battery";
let db: TestDatabase;
let base: string;
let close: () => Promise<void>;
let counter = 0;

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

type Answer = {
  status: number;
  body: any;
  headers: Headers;
  cookie: string | null;
  cleared: boolean;
};

// Every call comes from its own address (the last X-Forwarded-For entry, trusted once), so the windows of one test
// never leak into another.
async function call(
  method: string,
  path: string,
  options: {
    body?: unknown;
    cookie?: string | null;
    ip?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<Answer> {
  counter += 1;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    origin: ORIGIN,
    "x-forwarded-for": options.ip ?? `198.51.100.${counter % 250}`,
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0",
    ...options.headers,
  };
  if (options.cookie) headers["cookie"] = `__Host-session=${options.cookie}`;
  // Added 2026-10-13 (T188): a sign-up carries the time its form was opened and the route refuses one sent at once. A
  // call that names no `startedAt` gets one ten seconds ago, as a person who filled the form would send; a case that
  // tests the rule names its own (an `undefined` leaves it out of the body, as a bot that never read the page would).
  let body = options.body;
  if (
    path === "/api/auth/signup" &&
    typeof body === "object" &&
    body !== null &&
    !("startedAt" in body)
  ) {
    body = { ...body, startedAt: Date.now() - 10_000 };
  }
  const res = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const lines = res.headers.getSetCookie();
  const line = lines.find((l) => l.startsWith("__Host-session=")) ?? null;
  const value = line ? line.split(";")[0]!.slice("__Host-session=".length) : "";
  return {
    status: res.status,
    body: await res.json(),
    headers: res.headers,
    cookie: value === "" ? null : value,
    cleared: line !== null && value === "",
  };
}

async function seed(
  email: string,
  over: { mustChange?: boolean; status?: string } = {},
): Promise<number> {
  const hash = await hashPassword(
    over.mustChange ? "temporary-pass" : password,
  );
  const result = await db.pool.query(
    `insert into users (email, status, password_hash, must_change, password_expires_at, display_name)
     values ($1, $2, $3, $4, $5, 'Seed') returning id`,
    [
      email,
      over.status ?? "student",
      hash,
      over.mustChange ?? false,
      over.mustChange ? new Date(Date.now() + 30 * 86400_000) : null,
    ],
  );
  return Number(result.rows[0].id);
}

test(
  "sign-up makes a guest, signs in with a __Host- cookie, and an address already registered says so",
  { skip: skipWithoutDatabase },
  async () => {
    const first = await call("POST", "/api/auth/signup", {
      body: {
        email: "New.Member@Example.Test",
        password,
        displayName: "  New   Member ",
        login: "Dowser.1",
      },
    });
    assert.equal(first.status, 201);
    assert.equal(first.body.viewer.status, "guest");
    assert.equal(first.body.viewer.displayName, "New Member");
    assert.equal(first.body.viewer.login, "dowser.1");
    assert.ok(first.cookie, "a session cookie came with it");
    assert.equal(first.headers.get("cache-control"), "no-store");
    const setCookie = first.headers.getSetCookie().join("\n");
    for (const part of ["Secure", "HttpOnly", "SameSite=Lax", "Path=/"]) {
      assert.ok(setCookie.includes(part), part);
    }
    assert.ok(!/domain=/i.test(setCookie));

    const me = await call("GET", "/api/auth/me", { cookie: first.cookie });
    assert.equal(me.body.viewer.email, "New.Member@Example.Test");

    // The same address in another case, and the same login: refused with the field named.
    const again = await call("POST", "/api/auth/signup", {
      body: { email: "new.member@example.test", password, displayName: "X" },
    });
    assert.equal(again.status, 409);
    assert.equal(again.body.field, "email");
    const loginClash = await call("POST", "/api/auth/signup", {
      body: {
        email: "other@example.test",
        password,
        displayName: "Y",
        login: "DOWSER.1",
      },
    });
    assert.equal(loginClash.status, 409);
    assert.equal(loginClash.body.field, "login");
  },
);

test(
  "sign-up refuses a weak password, a filled honeypot, an address-like login and a request from another origin",
  { skip: skipWithoutDatabase },
  async () => {
    const weak = await call("POST", "/api/auth/signup", {
      body: { email: "w@example.test", password: "short", displayName: "W" },
    });
    assert.equal(weak.status, 400);
    assert.equal(weak.body.field, "password");

    const bot = await call("POST", "/api/auth/signup", {
      body: {
        email: "bot@example.test",
        password,
        displayName: "Bot",
        website: "http://spam.example",
      },
    });
    assert.equal(bot.status, 400);
    const count = await db.pool.query(
      "select count(*)::int as n from users where email = 'bot@example.test'",
    );
    assert.equal(count.rows[0].n, 0);

    const looksLikeAddress = await call("POST", "/api/auth/signup", {
      body: {
        email: "l@example.test",
        password,
        displayName: "L",
        login: "someone@example.test",
      },
    });
    assert.equal(looksLikeAddress.status, 400);
    assert.equal(looksLikeAddress.body.field, "login");

    const crossSite = await call("POST", "/api/auth/signup", {
      body: { email: "c@example.test", password, displayName: "C" },
      headers: { origin: "https://evil.example" },
    });
    assert.equal(crossSite.status, 403);
    assert.equal(crossSite.body.error, "cross_site");
  },
);

test(
  "sign-up refuses a form sent at once, with no opening time, from the future or a day old: the plain 400 of the honeypot, nothing stored",
  { skip: skipWithoutDatabase },
  async () => {
    // Added 2026-10-13 (T188). The same plain answer as the honeypot (and as the feedback form's), which names no
    // check, so a bot learns nothing about which of its fields was wrong.
    const honeypot = await call("POST", "/api/auth/signup", {
      body: {
        email: "plain-0@example.test",
        password,
        displayName: "P",
        website: "http://spam.example",
      },
    });
    assert.equal(honeypot.status, 400);

    const now = Date.now();
    const cases: [string, Record<string, unknown>][] = [
      ["sent at once", { startedAt: now - 400 }],
      ["no opening time", { startedAt: undefined }],
      ["an opening time that is not a number", { startedAt: "yesterday" }],
      ["from the future", { startedAt: now + 60_000 }],
      ["older than a day", { startedAt: now - 25 * 60 * 60_000 }],
      ["zero", { startedAt: 0 }],
    ];
    let n = 0;
    for (const [what, extra] of cases) {
      n += 1;
      const email = `plain-${n}@example.test`;
      const res = await call("POST", "/api/auth/signup", {
        body: { email, password, displayName: "P", ...extra },
      });
      assert.equal(res.status, 400, what);
      assert.deepEqual(
        res.body,
        honeypot.body,
        `${what}: the same plain answer`,
      );
      assert.equal(res.cookie, null, `${what}: no session`);
      const rows = await db.pool.query(
        "select count(*)::int as n from users where email = $1",
        [email],
      );
      assert.equal(rows.rows[0].n, 0, `${what}: nothing stored`);
    }

    // The edge of the rule: just over three seconds goes through, and a day minus a minute does too.
    const edge = await call("POST", "/api/auth/signup", {
      body: {
        email: "plain-edge@example.test",
        password,
        displayName: "P",
        startedAt: Date.now() - 3_200,
      },
    });
    assert.equal(edge.status, 201);
    const old = await call("POST", "/api/auth/signup", {
      body: {
        email: "plain-old@example.test",
        password,
        displayName: "P",
        startedAt: Date.now() - (24 * 60 - 1) * 60_000,
      },
    });
    assert.equal(old.status, 201);
  },
);

test(
  "the eleventh sign-up from one address in an hour is refused with Retry-After",
  { skip: skipWithoutDatabase },
  async () => {
    const ip = "203.0.113.200";
    for (let i = 0; i < 10; i++) {
      const res = await call("POST", "/api/auth/signup", {
        ip,
        body: {
          email: `bulk${i}@example.test`,
          password,
          displayName: `Bulk ${i}`,
        },
      });
      assert.equal(res.status, 201, `sign-up ${i}`);
    }
    const eleventh = await call("POST", "/api/auth/signup", {
      ip,
      body: { email: "bulk10@example.test", password, displayName: "Bulk 10" },
    });
    assert.equal(eleventh.status, 429);
    assert.ok(Number(eleventh.headers.get("retry-after")) > 0);
  },
);

test(
  "sign-in follows a page of this site, falls back from another host, and one text answers every refusal",
  { skip: skipWithoutDatabase },
  async () => {
    await seed("ann@example.test");
    const good = await call("POST", "/api/auth/signin", {
      body: {
        identifier: "ANN@example.test",
        password,
        next: "/video/lecture-1/?t=90",
      },
    });
    assert.equal(good.status, 200);
    assert.equal(good.body.redirect, "/video/lecture-1/?t=90");
    assert.equal(good.body.viewer.status, "student");

    const away = await call("POST", "/api/auth/signin", {
      body: {
        identifier: "ann@example.test",
        password,
        next: "/\\evil.example/",
      },
    });
    assert.equal(away.body.redirect, "/auth/account/");

    const wrong = await call("POST", "/api/auth/signin", {
      body: { identifier: "ann@example.test", password: "nope nope nope" },
    });
    const unknown = await call("POST", "/api/auth/signin", {
      body: { identifier: "nobody@example.test", password: "nope nope nope" },
    });
    assert.equal(wrong.status, 401);
    assert.deepEqual(wrong.body, unknown.body);
    assert.equal(wrong.cookie, null);
  },
);

test(
  "five wrong passwords pause the account even for the right one, with Retry-After",
  { skip: skipWithoutDatabase },
  async () => {
    await seed("slow@example.test");
    // The form is told how many tries are left from the third failure on, and the length of the pause at the fifth.
    const bodies: any[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await call("POST", "/api/auth/signin", {
        body: { identifier: "slow@example.test", password: "wrong password" },
      });
      assert.equal(res.status, 401);
      bodies.push(res.body);
    }
    assert.equal(bodies[1].attemptsLeft, undefined);
    assert.equal(bodies[2].attemptsLeft, 2);
    assert.equal(bodies[3].attemptsLeft, 1);
    assert.equal(bodies[4].attemptsLeft, 0);
    assert.equal(bodies[4].retryAfterSeconds, 60);
    const paused = await call("POST", "/api/auth/signin", {
      body: { identifier: "slow@example.test", password },
    });
    assert.equal(paused.status, 429);
    assert.ok(Number(paused.headers.get("retry-after")) > 0);
    assert.equal(paused.cookie, null);
  },
);

test(
  "signing in replaces the session id the browser brought; signing out and ending a session kill the ids",
  { skip: skipWithoutDatabase },
  async () => {
    await seed("two@example.test");
    const signin = () =>
      call("POST", "/api/auth/signin", {
        body: { identifier: "two@example.test", password },
      });
    const phone = await signin();
    const laptop = await signin();
    assert.ok(phone.cookie && laptop.cookie);

    // The laptop signs in again with its old cookie: the old id is dead and the new one lives.
    const again = await call("POST", "/api/auth/signin", {
      body: { identifier: "two@example.test", password },
      cookie: laptop.cookie,
    });
    assert.ok(again.cookie && again.cookie !== laptop.cookie);
    assert.equal(
      (await call("GET", "/api/auth/me", { cookie: laptop.cookie })).body
        .viewer,
      null,
    );

    const list = await call("GET", "/api/auth/sessions", {
      cookie: again.cookie,
    });
    assert.equal(list.status, 200);
    assert.equal(list.body.length, 2);
    assert.equal(list.body.filter((s: any) => s.current).length, 1);
    assert.equal(list.body[0].device, "Edge, Windows");
    // The handle is not the cookie value.
    assert.ok(!list.body.some((s: any) => s.id === again.cookie));

    // End the phone's session by its handle; a second end finds nothing.
    const other = list.body.find((s: any) => !s.current);
    const ended = await call("DELETE", `/api/auth/sessions/${other.id}`, {
      cookie: again.cookie,
    });
    assert.equal(ended.status, 200);
    assert.equal(
      (await call("GET", "/api/auth/me", { cookie: phone.cookie })).body.viewer,
      null,
    );
    const missing = await call("DELETE", `/api/auth/sessions/${other.id}`, {
      cookie: again.cookie,
    });
    assert.equal(missing.status, 404);

    const out = await call("POST", "/api/auth/signout", {
      cookie: again.cookie,
    });
    assert.equal(out.status, 200);
    assert.equal(out.cleared, true);
    assert.equal(
      (await call("GET", "/api/auth/me", { cookie: again.cookie })).body.viewer,
      null,
    );
    assert.equal((await call("POST", "/api/auth/signout")).status, 401);
  },
);

test(
  "a temporary password signs in to the change form only; changing it ends the other sessions",
  { skip: skipWithoutDatabase },
  async () => {
    await seed("temp@example.test", { mustChange: true });
    const signin = await call("POST", "/api/auth/signin", {
      body: { identifier: "temp@example.test", password: "temporary-pass" },
    });
    assert.equal(signin.status, 200);
    assert.equal(signin.body.viewer.mustChange, true);
    assert.equal(signin.body.redirect, "/auth/account/");
    const second = await call("POST", "/api/auth/signin", {
      body: { identifier: "temp@example.test", password: "temporary-pass" },
    });

    // The limited session reaches `me` and the change form, and nothing else of the account.
    const sessions = await call("GET", "/api/auth/sessions", {
      cookie: signin.cookie,
    });
    assert.equal(sessions.status, 403);
    assert.equal(
      (await call("GET", "/api/auth/me", { cookie: signin.cookie })).status,
      200,
    );

    const wrongCurrent = await call("POST", "/api/auth/change-password", {
      cookie: signin.cookie,
      body: { current: "not it at all", next: "a brand new password" },
    });
    assert.equal(wrongCurrent.status, 400);
    assert.equal(wrongCurrent.body.field, "current");
    const same = await call("POST", "/api/auth/change-password", {
      cookie: signin.cookie,
      body: { current: "temporary-pass", next: "temporary-pass" },
    });
    assert.equal(same.status, 400);
    assert.equal(same.body.field, "next");

    const changed = await call("POST", "/api/auth/change-password", {
      cookie: signin.cookie,
      body: { current: "temporary-pass", next: "a brand new password" },
    });
    assert.equal(changed.status, 200);
    assert.equal(changed.body.viewer.mustChange, false);
    assert.ok(changed.cookie && changed.cookie !== signin.cookie);
    // The old ids are dead, the new one is a full session.
    assert.equal(
      (await call("GET", "/api/auth/me", { cookie: signin.cookie })).body
        .viewer,
      null,
    );
    assert.equal(
      (await call("GET", "/api/auth/me", { cookie: second.cookie })).body
        .viewer,
      null,
    );
    assert.equal(
      (await call("GET", "/api/auth/sessions", { cookie: changed.cookie }))
        .status,
      200,
    );
    // The new password signs in, the temporary one no longer does.
    const fresh = await call("POST", "/api/auth/signin", {
      body: {
        identifier: "temp@example.test",
        password: "a brand new password",
      },
    });
    assert.equal(fresh.status, 200);
    assert.equal(fresh.body.viewer.mustChange, false);
    const old = await call("POST", "/api/auth/signin", {
      body: { identifier: "temp@example.test", password: "temporary-pass" },
    });
    assert.equal(old.status, 401);

    const audit = await db.pool.query(
      "select action from audit_log where action = 'password_changed'",
    );
    assert.equal(audit.rowCount, 1);
  },
);

test(
  "the profile route changes the name and the login by the sign-up's rules, and never the address or the rights",
  { skip: skipWithoutDatabase },
  async () => {
    await seed("prof@example.test");
    await seed("holder@example.test");
    await db.pool.query(
      "update users set login = 'taken.one' where email = 'holder@example.test'",
    );
    const signin = await call("POST", "/api/auth/signin", {
      body: { identifier: "prof@example.test", password },
    });
    const cookie = signin.cookie;
    assert.ok(cookie);

    // No session: 401. A name and a login: 200 with the new viewer; the login is lower-cased, the name's blanks collapse.
    assert.equal(
      (await call("PATCH", "/api/auth/profile", { body: { displayName: "X" } }))
        .status,
      401,
    );
    const ok = await call("PATCH", "/api/auth/profile", {
      cookie,
      body: { displayName: "  New   Name ", login: "Prof.Login" },
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.viewer.displayName, "New Name");
    assert.equal(ok.body.viewer.login, "prof.login");
    assert.equal(ok.body.viewer.email, "prof@example.test");

    // A field left out stays; the address and the status in the body are not read at all.
    const partial = await call("PATCH", "/api/auth/profile", {
      cookie,
      body: {
        displayName: "Only Name",
        email: "x@example.test",
        status: "admin",
      },
    });
    assert.equal(partial.status, 200);
    assert.equal(partial.body.viewer.login, "prof.login");
    assert.equal(partial.body.viewer.email, "prof@example.test");
    assert.equal(partial.body.viewer.status, "student");

    // Refusals name the field: empty name, too long, a login that is another account's, a login shaped like an address.
    const empty = await call("PATCH", "/api/auth/profile", {
      cookie,
      body: { displayName: "   " },
    });
    assert.equal(empty.status, 400);
    assert.equal(empty.body.field, "displayName");
    const long = await call("PATCH", "/api/auth/profile", {
      cookie,
      body: { displayName: "x".repeat(81) },
    });
    assert.equal(long.body.problem, "too_long");
    const clash = await call("PATCH", "/api/auth/profile", {
      cookie,
      body: { login: "TAKEN.ONE" },
    });
    assert.equal(clash.status, 409);
    assert.equal(clash.body.field, "login");
    const shaped = await call("PATCH", "/api/auth/profile", {
      cookie,
      body: { login: "a@b.test" },
    });
    assert.equal(shaped.status, 400);
    assert.equal(shaped.body.field, "login");
    const wrongType = await call("PATCH", "/api/auth/profile", {
      cookie,
      body: { displayName: 5 },
    });
    assert.equal(wrongType.status, 400);

    // An empty login removes it; the address still signs in.
    const removed = await call("PATCH", "/api/auth/profile", {
      cookie,
      body: { login: "" },
    });
    assert.equal(removed.status, 200);
    assert.equal(removed.body.viewer.login, null);

    // The audit rows name the fields and carry no value.
    const audit = JSON.stringify(
      (
        await db.pool.query(
          "select detail from audit_log where action = 'profile_changed'",
        )
      ).rows,
    );
    assert.ok(audit.includes("displayName") && audit.includes("login"));
    for (const value of ["New Name", "prof.login", "Only Name"]) {
      assert.ok(!audit.includes(value), `${value} is not in the audit`);
    }

    // A session that must still change its password reaches no profile route.
    await seed("lim@example.test", { mustChange: true });
    const limited = await call("POST", "/api/auth/signin", {
      body: { identifier: "lim@example.test", password: "temporary-pass" },
    });
    assert.equal(
      (
        await call("PATCH", "/api/auth/profile", {
          cookie: limited.cookie,
          body: { displayName: "Nope" },
        })
      ).status,
      403,
    );
  },
);

test(
  "a blocked account signs in and the audit trail never carries a password",
  { skip: skipWithoutDatabase },
  async () => {
    const id = await seed("blocked@example.test");
    await db.pool.query(
      "update users set status = 'blocked', blocked_at = now() where id = $1",
      [id],
    );
    const res = await call("POST", "/api/auth/signin", {
      body: { identifier: "blocked@example.test", password },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.viewer.status, "blocked");
    const audit = JSON.stringify(
      (await db.pool.query("select * from audit_log")).rows,
    );
    assert.ok(!audit.includes(password));
  },
);
