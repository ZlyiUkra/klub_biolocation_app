// The setup door (T169 of specs/001-self-hosted-club-site). Needs the development database. Time is passed in, so the
// hour of a generated code is tested without waiting. The decisions are in server/src/users/setup.ts and superuser.ts.

import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { createApp } from "../src/http/app.js";
import { createSession } from "../src/auth/session.js";
import {
  SetupConfigError,
  SetupGate,
  generatedCodeLifetimeMs,
  loadSetupOptions,
  redeemSetup,
} from "../src/users/setup.js";
import { createSuperuser } from "../src/users/superuser.js";
import { unspentCodeCount } from "../src/users/recovery.js";
import {
  createTestDatabase,
  skipWithoutDatabase,
  type TestDatabase,
} from "./helpers/db.js";

const ORIGIN = "http://localhost:4321";
const password = "a long enough password";
const settingsCode = "a-long-random-setup-code-from-the-settings-0001";
const opts = { skip: skipWithoutDatabase };
let db: TestDatabase;

before(async () => {
  if (skipWithoutDatabase) return;
  db = await createTestDatabase();
});
after(async () => {
  if (!skipWithoutDatabase) await db.drop();
});
async function reset(): Promise<void> {
  await db.pool.query(
    "delete from handover_requests; delete from sessions; delete from recovery_codes; delete from users",
  );
}
const holders = async () =>
  (
    await db.pool.query(
      "select email from users where is_superuser order by id",
    )
  ).rows.map((r) => r.email as string);

test("the environment: a short code and a bad switch stop the start, a good pair is read", () => {
  assert.throws(
    () => loadSetupOptions({ SETUP_CODE: "too short" }),
    SetupConfigError,
  );
  assert.throws(
    () => loadSetupOptions({ ALLOW_SUPERUSER_SETUP: "yes" }),
    SetupConfigError,
  );
  assert.deepEqual(loadSetupOptions({}), { code: undefined, emergency: false });
  assert.deepEqual(
    loadSetupOptions({
      SETUP_CODE: ` ${settingsCode} `,
      ALLOW_SUPERUSER_SETUP: "1",
    }),
    { code: settingsCode, emergency: true },
  );
  assert.equal(
    loadSetupOptions({ ALLOW_SUPERUSER_SETUP: "0" }).emergency,
    false,
  );
});

test(
  "a generated code is made once, printed, kept for an hour, then replaced; none while a superuser exists",
  opts,
  async () => {
    await reset();
    const lines: string[] = [];
    const gate = new SetupGate({ log: (line) => lines.push(line) });
    const t0 = new Date("2026-10-11T12:00:00Z");
    await gate.tick(db.pool, t0);
    assert.equal(lines.length, 1);
    const first = /: ([0-9a-f]{8}(-[0-9a-f]{8}){3})$/.exec(lines[0]!)?.[1];
    assert.ok(first, "the line carries a 128 bit code");
    assert.equal(gate.verify(first!, t0), true);
    assert.equal(gate.verify(first!.toUpperCase(), t0), false);
    // The same code stands for the hour; the log is not filled once a minute.
    await gate.tick(db.pool, new Date(t0.getTime() + 30 * 60_000));
    assert.equal(lines.length, 1);
    // After the hour the old code is dead and a new one is printed.
    const later = new Date(t0.getTime() + generatedCodeLifetimeMs + 1000);
    assert.equal(gate.verify(first!, later), false);
    await gate.tick(db.pool, later);
    assert.equal(lines.length, 2);
    const second = /: ([0-9a-f]{8}(-[0-9a-f]{8}){3})$/.exec(lines[1]!)?.[1];
    assert.notEqual(second, first);
    assert.equal(gate.verify(second!, later), true);
    // The first superuser exists: the door is shut, the code is forgotten and nothing is printed.
    await createSuperuser(db.pool, { email: "owner@example.test", password });
    await gate.tick(db.pool, later);
    assert.equal(await gate.isOpen(db.pool), false);
    assert.equal(gate.verify(second!, later), false);
    assert.equal(lines.length, 2);
  },
);

test(
  "the first superuser through the door: the right code once, ten codes, then the door is shut and the code is refused",
  opts,
  async () => {
    await reset();
    const gate = new SetupGate({ code: settingsCode, log: () => {} });
    const wrong = await redeemSetup(db.pool, gate, {
      code: "not the code",
      email: "owner@example.test",
      password,
      address: "a1",
    });
    assert.deepEqual(wrong, { ok: false, reason: "invalid" });
    assert.deepEqual(await holders(), []);
    const done = await redeemSetup(db.pool, gate, {
      code: `  ${settingsCode}  `,
      email: "owner@example.test",
      password,
      address: "a1",
    });
    assert.ok(done.ok);
    assert.equal(done.codes.length, 10);
    assert.equal(done.replaced, false);
    assert.deepEqual(await holders(), ["owner@example.test"]);
    assert.equal(await unspentCodeCount(db.pool, done.userId), 10);
    // Second use: the door is shut for the very same code.
    const again = await redeemSetup(db.pool, gate, {
      code: settingsCode,
      email: "someone@example.test",
      password,
      address: "a2",
    });
    assert.deepEqual(again, { ok: false, reason: "closed" });
    assert.deepEqual(await holders(), ["owner@example.test"]);
  },
);

test(
  "field problems are told in words and are not counted; wrong codes are counted and paused",
  opts,
  async () => {
    await reset();
    const gate = new SetupGate({ code: settingsCode, log: () => {} });
    const now = new Date("2026-10-11T12:00:00Z");
    for (let i = 0; i < 10; i++) {
      const r = await redeemSetup(
        db.pool,
        gate,
        { code: "wrong", email: "not an address", password, address: "b1" },
        now,
      );
      assert.deepEqual(r, { ok: false, reason: "email" });
    }
    const weak = await redeemSetup(
      db.pool,
      gate,
      {
        code: "wrong",
        email: "owner@example.test",
        password: "short",
        address: "b1",
      },
      now,
    );
    assert.equal(!weak.ok && weak.reason, "password");
    for (let i = 0; i < 5; i++) {
      const r = await redeemSetup(
        db.pool,
        gate,
        {
          code: `wrong ${i}`,
          email: "owner@example.test",
          password,
          address: "b1",
        },
        now,
      );
      assert.deepEqual(r, { ok: false, reason: "invalid" });
    }
    const paused = await redeemSetup(
      db.pool,
      gate,
      {
        code: settingsCode,
        email: "owner@example.test",
        password,
        address: "b1",
      },
      now,
    );
    assert.equal(!paused.ok && paused.reason, "limited");
    // Another address is not paused by the first one's failures.
    const other = await redeemSetup(
      db.pool,
      gate,
      {
        code: settingsCode,
        email: "owner@example.test",
        password,
        address: "b2",
      },
      now,
    );
    assert.ok(other.ok);
  },
);

test(
  "two callers with the right code at once: one becomes the superuser, the other is told the door is shut",
  opts,
  async () => {
    await reset();
    const gate = new SetupGate({ code: settingsCode, log: () => {} });
    const [x, y] = await Promise.all([
      redeemSetup(db.pool, gate, {
        code: settingsCode,
        email: "first@example.test",
        password,
        address: "c1",
      }),
      redeemSetup(db.pool, gate, {
        code: settingsCode,
        email: "second@example.test",
        password,
        address: "c2",
      }),
    ]);
    assert.equal([x, y].filter((r) => r.ok).length, 1);
    assert.equal((await holders()).length, 1);
  },
);

test(
  "the emergency switch: a new account takes the role, the old holder stays an admin, both lose their sessions and codes",
  opts,
  async () => {
    await reset();
    const made = await createSuperuser(db.pool, {
      email: "old@example.test",
      password,
    });
    assert.ok(made.ok);
    await createSession(db.pool, {
      userId: made.userId,
      status: "admin",
      superuser: true,
    });
    const closed = new SetupGate({ code: settingsCode, log: () => {} });
    assert.equal(await closed.isOpen(db.pool), false);
    const gate = new SetupGate({
      code: settingsCode,
      emergency: true,
      log: () => {},
    });
    assert.equal(await gate.isOpen(db.pool), true);
    const done = await redeemSetup(db.pool, gate, {
      code: settingsCode,
      email: "new@example.test",
      password: "a different long password",
      address: "d1",
    });
    assert.ok(done.ok);
    assert.equal(done.replaced, true);
    assert.deepEqual(await holders(), ["new@example.test"]);
    const old = await db.pool.query(
      "select status, is_superuser from users where email = 'old@example.test'",
    );
    assert.deepEqual(old.rows[0], { status: "admin", is_superuser: false });
    assert.equal(await unspentCodeCount(db.pool, made.userId), 0);
    assert.equal(await unspentCodeCount(db.pool, done.userId), 10);
    const sessions = await db.pool.query(
      "select count(*)::int as n from sessions where user_id = any($1::bigint[])",
      [[made.userId, done.userId]],
    );
    assert.equal(sessions.rows[0].n, 0);
    const audit = await db.pool.query(
      "select action from audit_log where action = 'superuser_setup_replaced'",
    );
    assert.equal(audit.rowCount, 1);
    // Changed 2026-10-11 (T170): the switch is one use per start, so the same gate is shut now...
    const spent = await redeemSetup(db.pool, gate, {
      code: settingsCode,
      email: "NEW@example.test",
      password: "yet another long password",
      address: "d2",
    });
    assert.deepEqual(spent, { ok: false, reason: "closed" });
    // ...and a fresh start (a new gate) with the holder's own address sets a new password and moves nothing.
    const restarted = new SetupGate({
      code: settingsCode,
      emergency: true,
      log: () => {},
    });
    const same = await redeemSetup(db.pool, restarted, {
      code: settingsCode,
      email: "NEW@example.test",
      password: "yet another long password",
      address: "d2",
    });
    assert.ok(same.ok);
    assert.equal(same.replaced, false);
    assert.deepEqual(await holders(), ["new@example.test"]);
  },
);

// ---- the limits of the switch (T170, the consilium of 2026-10-11) ----
test(
  "the switch without SETUP_CODE is ignored: a code printed in the log never replaces a holder, and the log says so",
  opts,
  async () => {
    await reset();
    await createSuperuser(db.pool, { email: "old@example.test", password });
    const lines: string[] = [];
    const gate = new SetupGate({
      emergency: true,
      log: (line) => lines.push(line),
    });
    assert.equal(gate.emergencyRequested, true);
    assert.equal(gate.emergency, false);
    await gate.tick(db.pool);
    assert.equal(await gate.isOpen(db.pool), false);
    assert.ok(lines.some((l) => /ALLOW_SUPERUSER_SETUP=1 is ignored/.test(l)));
    // No code is printed for a door that is shut.
    assert.ok(!lines.some((l) => /Code \(/.test(l)));
    const refused = await redeemSetup(db.pool, gate, {
      code: "anything long enough to be tried",
      email: "thief@example.test",
      password,
      address: "e1",
    });
    assert.deepEqual(refused, { ok: false, reason: "closed" });
    assert.deepEqual(await holders(), ["old@example.test"]);
  },
);

test(
  "the switch lives 30 minutes after the start and is shut by its first use; both say so in the log",
  opts,
  async () => {
    await reset();
    await createSuperuser(db.pool, { email: "old@example.test", password });
    const started = new Date("2026-10-11T12:00:00Z");
    const lines: string[] = [];
    const gate = new SetupGate({
      code: settingsCode,
      emergency: true,
      startedAt: started,
      log: (line) => lines.push(line),
    });
    await gate.tick(db.pool, started);
    assert.ok(lines.some((l) => /emergency switch is ON/.test(l)));
    assert.equal(
      await gate.isOpen(db.pool, new Date(started.getTime() + 29 * 60_000)),
      true,
    );
    const after = new Date(started.getTime() + 31 * 60_000);
    assert.equal(await gate.isOpen(db.pool, after), false);
    await gate.tick(db.pool, after);
    assert.ok(lines.some((l) => /30 minutes of the emergency switch/.test(l)));
    // A restart is a new window.
    const restarted = new SetupGate({
      code: settingsCode,
      emergency: true,
      startedAt: after,
      log: () => {},
    });
    assert.equal(await restarted.isOpen(db.pool, after), true);
  },
);

test(
  "a settings code left in place after the first superuser is a note in the log, not a hole",
  opts,
  async () => {
    await reset();
    await createSuperuser(db.pool, { email: "old@example.test", password });
    const lines: string[] = [];
    const gate = new SetupGate({
      code: settingsCode,
      log: (line) => lines.push(line),
    });
    await gate.tick(db.pool);
    assert.equal(await gate.isOpen(db.pool), false);
    assert.ok(lines.some((l) => /SETUP_CODE is still set/.test(l)));
  },
);

// ---- over HTTP ----
let base: string;
let close: () => Promise<void>;
test(
  "HTTP: the state says only open or not, a shut door is a plain 404, an answer never carries the code",
  opts,
  async () => {
    await reset();
    const gate = new SetupGate({ code: settingsCode, log: () => {} });
    const server = createApp({
      pool: db.pool,
      siteOrigin: ORIGIN,
      setup: gate,
    }).listen(0);
    await once(server, "listening");
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => new Promise((resolve) => server.close(() => resolve()));
    try {
      const call = async (path: string, body?: unknown) => {
        const res = await fetch(base + path, {
          method: body === undefined ? "GET" : "POST",
          headers: {
            "content-type": "application/json",
            origin: ORIGIN,
            "x-forwarded-for": "203.0.113.9",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await res.text();
        return { status: res.status, text, headers: res.headers };
      };
      const state = await call("/api/setup/state");
      assert.equal(state.status, 200);
      assert.deepEqual(JSON.parse(state.text), { open: true });
      assert.equal(state.headers.get("cache-control"), "no-store");

      const bad = await call("/api/setup", {
        code: "nope",
        email: "owner@example.test",
        password,
      });
      assert.equal(bad.status, 400);
      assert.ok(!bad.text.includes(settingsCode));

      const ok = await call("/api/setup", {
        code: settingsCode,
        email: "owner@example.test",
        password,
      });
      assert.equal(ok.status, 200);
      assert.equal(JSON.parse(ok.text).codes.length, 10);
      assert.ok(!ok.text.includes(settingsCode));

      const shut = await call("/api/setup", {
        code: settingsCode,
        email: "x@example.test",
        password,
      });
      assert.equal(shut.status, 404);
      assert.deepEqual(JSON.parse((await call("/api/setup/state")).text), {
        open: false,
      });
    } finally {
      await close();
    }
  },
);
