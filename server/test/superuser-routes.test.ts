// The superuser's routes over HTTP (T068, T069 of specs/001-self-hosted-club-site; contracts/http-api.md). Needs the
// development database. The decisions are tested in superuser.test.ts and handover.test.ts; this file tests what only
// the routes decide: who gets a 404, the answers and status codes, and that the recovery route says one thing to every
// failure and is paused per address.

import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { hashPassword } from "../src/auth/password.js";
import { createSession } from "../src/auth/session.js";
import { createApp } from "../src/http/app.js";
import {
  createTestDatabase,
  skipWithoutDatabase,
  type TestDatabase,
} from "./helpers/db.js";
import { issueRecoverySet } from "../src/users/recovery.js";

const ORIGIN = "http://localhost:4321";
const password = "a long enough password";
let db: TestDatabase;
let base: string;
let close: () => Promise<void>;
const ids: Record<string, number> = {};
const cookies: Record<string, string> = {};
let counter = 0;
const opts = { skip: skipWithoutDatabase };

async function seed(key: string, status: string, superuser = false) {
  const row = await db.pool.query(
    `insert into users (email, display_name, status, is_superuser, password_hash)
     values ($1, $1, $2, $3, $4) returning id`,
    [`${key}@example.test`, status, superuser, await hashPassword(password)],
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

before(async () => {
  if (skipWithoutDatabase) return;
  db = await createTestDatabase();
  await seed("boss", "admin", true);
  await seed("deputy", "admin");
  await seed("student", "student");
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

async function call(
  method: string,
  path: string,
  who: string | null,
  body?: unknown,
  ip?: string,
): Promise<{ status: number; body: any; headers: Headers }> {
  counter += 1;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    origin: ORIGIN,
    "x-forwarded-for": ip ?? `198.51.100.${(counter % 200) + 1}`,
  };
  if (who) headers["cookie"] = `__Host-session=${cookies[who]}`;
  const res = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json(), headers: res.headers };
}

test(
  "the superuser's routes are 404 to everyone else, and the handover state needs a session",
  opts,
  async () => {
    for (const who of [null, "deputy", "student"]) {
      for (const path of [
        "/api/admin/superuser/handover",
        "/api/admin/superuser/recovery-codes",
      ]) {
        const r = await call("POST", path, who, {
          password,
          toUserId: ids["deputy"],
        });
        assert.equal(r.status, 404, `${who} ${path}`);
      }
    }
    assert.equal(
      (await call("GET", "/api/account/handover", null)).status,
      401,
    );
    const none = await call("GET", "/api/account/handover", "boss");
    assert.equal(none.status, 200);
    assert.equal(none.body.handover, null);
    assert.equal(none.headers.get("cache-control"), "no-store");
    // Added 2026-10-11 (T070, step 3b): only the superuser is told how many recovery codes are unspent.
    assert.equal(none.body.recoveryCodesLeft, 0);
    const member = await call("GET", "/api/account/handover", "deputy");
    assert.equal(member.body.recoveryCodesLeft, null);
  },
);

test(
  "a handover through the routes: start, accept, state on both sides, cancel",
  opts,
  async () => {
    const wrong = await call("POST", "/api/admin/superuser/handover", "boss", {
      password: "nope nope nope",
      toUserId: ids["deputy"],
    });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.body.field, "password");

    const toStudent = await call(
      "POST",
      "/api/admin/superuser/handover",
      "boss",
      {
        password,
        toUserId: ids["student"],
      },
    );
    assert.equal(toStudent.status, 400);
    assert.equal(toStudent.body.field, "toUserId");

    const started = await call(
      "POST",
      "/api/admin/superuser/handover",
      "boss",
      {
        password,
        toUserId: ids["deputy"],
      },
    );
    assert.equal(started.status, 200);
    assert.equal(started.body.handover.role, "from");
    assert.equal(
      (
        await call("POST", "/api/admin/superuser/handover", "boss", {
          password,
          toUserId: ids["deputy"],
        })
      ).status,
      409,
    );

    const seenByTarget = await call("GET", "/api/account/handover", "deputy");
    assert.equal(seenByTarget.body.handover.role, "to");

    const badAccept = await call(
      "POST",
      "/api/account/handover/accept",
      "deputy",
      {
        password: "nope nope nope",
      },
    );
    assert.equal(badAccept.status, 400);
    assert.equal(
      (
        await call("POST", "/api/account/handover/accept", "student", {
          password,
        })
      ).status,
      404,
    );
    const accepted = await call(
      "POST",
      "/api/account/handover/accept",
      "deputy",
      { password },
    );
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.completed, false);
    const hours =
      (new Date(accepted.body.effectiveAt).getTime() - Date.now()) / 3_600_000;
    assert.ok(hours > 23.9 && hours <= 24);

    assert.equal(
      (await call("POST", "/api/account/handover/cancel", "deputy", {})).status,
      200,
    );
    assert.equal(
      (await call("POST", "/api/account/handover/cancel", "deputy", {})).status,
      404,
    );
    const holder = await db.pool.query(
      "select id from users where is_superuser",
    );
    assert.equal(Number(holder.rows[0].id), ids["boss"]);
  },
);

test(
  "regenerating the codes needs the password and voids the old set; a code recovers, once, with one answer for every failure",
  opts,
  async () => {
    const first = await issueRecoverySet(db.pool, ids["boss"]!);
    assert.equal(
      (
        await call("POST", "/api/admin/superuser/recovery-codes", "boss", {
          password: "nope nope nope",
        })
      ).status,
      400,
    );
    const fresh = await call(
      "POST",
      "/api/admin/superuser/recovery-codes",
      "boss",
      { password },
    );
    assert.equal(fresh.status, 200);
    assert.equal(fresh.body.codes.length, 10);
    assert.equal(fresh.headers.get("cache-control"), "no-store");

    // The voided old code and an invented one get the same answer as an unknown identifier.
    const answers = [];
    for (const [identifier, code] of [
      ["boss@example.test", first[0]!],
      ["boss@example.test", "ZZZZ-ZZZZ-ZZZZ-ZZZZ"],
      ["nobody@example.test", fresh.body.codes[0]],
      ["deputy@example.test", fresh.body.codes[0]],
    ]) {
      answers.push(
        await call("POST", "/api/superuser/recover", null, {
          identifier,
          code,
          newPassword: "a recovered password",
        }),
      );
    }
    for (const r of answers) {
      assert.equal(r.status, 400);
      assert.deepEqual(r.body, answers[0]!.body);
    }

    const weak = await call("POST", "/api/superuser/recover", null, {
      identifier: "boss@example.test",
      code: fresh.body.codes[0],
      newPassword: "short",
    });
    assert.equal(weak.status, 400);
    assert.equal(weak.body.field, "newPassword");

    const ok = await call("POST", "/api/superuser/recover", null, {
      identifier: "BOSS@example.test",
      code: fresh.body.codes[0],
      newPassword: "a recovered password",
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.codes.length, 10);
    // The old session of the superuser is gone.
    const state = await call("GET", "/api/account/handover", "boss");
    assert.equal(state.status, 401);
    // The same code again is the same invalid answer.
    const again = await call("POST", "/api/superuser/recover", null, {
      identifier: "boss@example.test",
      code: fresh.body.codes[0],
      newPassword: "a recovered password",
    });
    assert.equal(again.status, 400);
    assert.deepEqual(again.body, answers[0]!.body);
  },
);

test(
  "the sixth failed recovery from one address is paused with Retry-After",
  opts,
  async () => {
    const ip = "203.0.113.77";
    for (let i = 0; i < 5; i++) {
      const r = await call(
        "POST",
        "/api/superuser/recover",
        null,
        {
          identifier: "boss@example.test",
          code: "0000-0000-0000-0000",
          newPassword: "a long password",
        },
        ip,
      );
      assert.equal(r.status, 400);
    }
    const paused = await call(
      "POST",
      "/api/superuser/recover",
      null,
      {
        identifier: "boss@example.test",
        code: "0000-0000-0000-0000",
        newPassword: "a long password",
      },
      ip,
    );
    assert.equal(paused.status, 429);
    assert.ok(Number(paused.headers.get("retry-after")) > 0);
  },
);
