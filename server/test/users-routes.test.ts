// The users routes over HTTP (T065 of specs/001-self-hosted-club-site; contracts/http-api.md "Administration").
// Needs the development database. The rules themselves are tested in status-rules.test.ts; this file tests what only the
// routes decide: who gets a 404, that a change is applied and audited in one step, the shape of the answers, the search
// and paging, and everything a temporary password does to the account.

import { defaultAccessEnd } from "../../src/lib/lecture-rules.js";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { verifyPassword } from "../src/auth/password.js";
import { createSession } from "../src/auth/session.js";
import { createApp } from "../src/http/app.js";
import {
  createTestDatabase,
  skipWithoutDatabase,
  type TestDatabase,
} from "./helpers/db.js";

const ORIGIN = "http://localhost:4321";
let db: TestDatabase;
let base: string;
let close: () => Promise<void>;
const cookies: Record<string, string> = {};
const ids: Record<string, number> = {};

async function seed(
  key: string,
  status: string,
  over: {
    superuser?: boolean;
    limited?: boolean;
    name?: string;
    blockedBy?: string;
  } = {},
): Promise<void> {
  const blockedBy = over.blockedBy ? ids[over.blockedBy] : null;
  const row = await db.pool.query(
    `insert into users (email, display_name, status, is_superuser, blocked_by, blocked_at, password_hash, must_change)
     values ($1, $2, $3, $4, $5, case when $3 = 'blocked' then now() end,
             case when $6 then repeat('x', 30) end, $6) returning id`,
    [
      `${key}@example.test`,
      over.name ?? key,
      status,
      over.superuser ?? false,
      blockedBy,
      over.limited ?? false,
    ],
  );
  ids[key] = Number(row.rows[0].id);
  const { id } = await createSession(db.pool, {
    userId: ids[key]!,
    status: status as "guest",
    limited: over.limited ?? false,
  });
  cookies[key] = id;
}

before(async () => {
  if (skipWithoutDatabase) return;
  db = await createTestDatabase();
  await seed("admin", "admin");
  await seed("boss", "admin", { superuser: true });
  await seed("metr", "metr");
  await seed("metr2", "metr");
  await seed("guest", "guest");
  await seed("student", "student");
  await seed("expert", "expert", { name: "Эксперт" });
  await seed("blockedByAdmin", "blocked", { blockedBy: "admin" });
  await seed("blockedByMetr", "blocked", { blockedBy: "metr" });
  await seed("limitedMetr", "metr", { limited: true });
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
): Promise<{ status: number; body: any; headers: Headers }> {
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
  return { status: res.status, body: await res.json(), headers: res.headers };
}

const opts = { skip: skipWithoutDatabase };

test(
  "a visitor, a limited session and a plain member get 404 on every users route; so does a blocked account",
  opts,
  async () => {
    for (const who of [
      null,
      "limitedMetr",
      "guest",
      "student",
      "blockedByAdmin",
    ]) {
      for (const [method, path, body] of [
        ["GET", "/api/admin/users", undefined],
        [
          "PATCH",
          `/api/admin/users/${ids["student"]}/status`,
          { status: "master" },
        ],
        ["POST", `/api/admin/users/${ids["student"]}/temp-password`, {}],
      ] as const) {
        const r = await call(method, path, who, body);
        assert.equal(r.status, 404, `${who} ${method} ${path}`);
        assert.equal(r.body.error, "not_found");
      }
    }
    const state = await db.pool.query(
      "select status from users where id = $1",
      [ids["student"]],
    );
    assert.equal(state.rows[0].status, "student");
  },
);

test(
  "the list: what the metr may give, a page, the search, no-store",
  opts,
  async () => {
    const r = await call("GET", "/api/admin/users", "metr");
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal(r.body.total, 10);
    assert.deepEqual(r.body.you.assignable, [
      "student",
      "expert",
      "master",
      "blocked",
    ]);
    const boss = r.body.users.find((u: any) => u.id === ids["boss"]);
    assert.equal(boss.protected, true);
    const me = r.body.users.find((u: any) => u.id === ids["metr"]);
    assert.equal(me.self, true);
    const blocked = r.body.users.find(
      (u: any) => u.id === ids["blockedByAdmin"],
    );
    assert.equal(blocked.statusBy, "admin");
    // No hash and no counters in a row.
    assert.ok(!JSON.stringify(r.body).includes("password_hash"));

    const paged = await call("GET", "/api/admin/users?limit=3&page=2", "admin");
    assert.equal(paged.body.users.length, 3);
    assert.equal(paged.body.page, 2);
    assert.equal(paged.body.pageSize, 3);
    assert.equal(paged.body.total, 10);

    const found = await call(
      "GET",
      "/api/admin/users?q=%D0%AD%D0%BA%D1%81",
      "admin",
    );
    assert.deepEqual(
      found.body.users.map((u: any) => u.id),
      [ids["expert"]],
    );
    // A `%` or `_` is an ordinary character in the search, not a wildcard.
    const wild = await call("GET", "/api/admin/users?q=%25", "admin");
    assert.equal(wild.body.total, 0);
    const underscore = await call("GET", "/api/admin/users?q=_", "admin");
    assert.equal(underscore.body.total, 0);

    // Added 2026-10-11 (T070, step 3b): `?status=` lists one status only (the superuser's list of administrators),
    // composes with the search, and an unknown value is ignored rather than refused.
    const admins = await call("GET", "/api/admin/users?status=admin", "admin");
    assert.equal(admins.status, 200);
    assert.ok(admins.body.total >= 2);
    assert.ok(admins.body.users.every((u: any) => u.status === "admin"));
    const none = await call(
      "GET",
      "/api/admin/users?status=admin&q=zzzzzz-no-such",
      "admin",
    );
    assert.equal(none.body.total, 0);
    const unknown = await call(
      "GET",
      "/api/admin/users?status=nonsense",
      "admin",
    );
    assert.equal(unknown.status, 200);
    assert.ok(unknown.body.total > admins.body.total);
  },
);

test(
  "a metr changes a member's status; the change and its audit row are one step",
  opts,
  async () => {
    const r = await call(
      "PATCH",
      `/api/admin/users/${ids["guest"]}/status`,
      "metr",
      { status: "student" },
    );
    assert.equal(r.status, 200);
    assert.equal(r.body.user.status, "student");
    const audit = await db.pool.query(
      `select actor_id, action, target_id, detail from audit_log where action = 'status_changed' and target_id = $1`,
      [ids["guest"]],
    );
    assert.equal(audit.rowCount, 1);
    assert.equal(Number(audit.rows[0].actor_id), ids["metr"]);
    // Changed 2026-10-11 (T152): becoming a user starts the clock, so the row also says the date it set.
    const until = defaultAccessEnd();
    assert.equal(r.body.user.accessUntil, until);
    assert.deepEqual(audit.rows[0].detail, {
      from: "guest",
      to: "student",
      accessUntil: { from: null, to: until },
    });
    // Saying the same again changes nothing and writes nothing.
    const again = await call(
      "PATCH",
      `/api/admin/users/${ids["guest"]}/status`,
      "metr",
      { status: "student" },
    );
    assert.equal(again.status, 200);
    assert.equal(again.body.unchanged, true);
    const count = await db.pool.query(
      `select count(*)::int as n from audit_log where action = 'status_changed' and target_id = $1`,
      [ids["guest"]],
    );
    assert.equal(count.rows[0].n, 1);
  },
);

test("the refusals carry a reason, and nothing changes", opts, async () => {
  const cases: [string, string, string, string][] = [
    ["metr", "student", "metr", "rank"],
    ["metr", "student", "admin", "rank"],
    ["metr", "metr2", "student", "rank"],
    ["metr", "admin", "student", "rank"],
    ["metr", "metr", "master", "self"],
    ["metr", "boss", "student", "protected"],
    ["admin", "boss", "student", "protected"],
    ["admin", "admin", "student", "self"],
    ["admin", "student", "guest", "guest"],
    ["metr", "blockedByAdmin", "student", "rank"],
  ];
  for (const [who, whom, wanted, reason] of cases) {
    const before = await db.pool.query(
      "select status from users where id = $1",
      [ids[whom]],
    );
    const r = await call("PATCH", `/api/admin/users/${ids[whom]}/status`, who, {
      status: wanted,
    });
    assert.equal(r.status, 403, `${who} -> ${whom} to ${wanted}`);
    assert.equal(r.body.reason, reason, `${who} -> ${whom} to ${wanted}`);
    const after = await db.pool.query(
      "select status from users where id = $1",
      [ids[whom]],
    );
    assert.equal(after.rows[0].status, before.rows[0].status);
  }
  assert.equal(
    (
      await call("PATCH", `/api/admin/users/${ids["student"]}/status`, "metr", {
        status: "owner",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "PATCH",
        `/api/admin/users/${ids["student"]}/status`,
        "metr",
        {},
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call("PATCH", `/api/admin/users/999999/status`, "metr", {
        status: "student",
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await call("PATCH", `/api/admin/users/abc/status`, "metr", {
        status: "student",
      })
    ).status,
    400,
  );
});

test(
  "an admin makes a metr, blocks and lifts; a block records who set it",
  opts,
  async () => {
    const made = await call(
      "PATCH",
      `/api/admin/users/${ids["expert"]}/status`,
      "admin",
      { status: "metr" },
    );
    assert.equal(made.status, 200);
    assert.equal(made.body.user.status, "metr");

    const blocked = await call(
      "PATCH",
      `/api/admin/users/${ids["student"]}/status`,
      "metr",
      { status: "blocked" },
    );
    assert.equal(blocked.status, 200);
    assert.equal(blocked.body.user.status, "blocked");
    assert.equal(blocked.body.user.statusBy, "metr");
    const row = await db.pool.query(
      "select blocked_by, blocked_at from users where id = $1",
      [ids["student"]],
    );
    assert.equal(Number(row.rows[0].blocked_by), ids["metr"]);
    assert.ok(row.rows[0].blocked_at);
    const audit = await db.pool.query(
      "select detail from audit_log where action = 'account_blocked' and target_id = $1",
      [ids["student"]],
    );
    assert.deepEqual(audit.rows[0].detail, { from: "student", to: "blocked" });

    // A metr lifts a metr's block; the block's marks are cleared.
    const lifted = await call(
      "PATCH",
      `/api/admin/users/${ids["student"]}/status`,
      "metr2",
      { status: "student" },
    );
    assert.equal(lifted.status, 200);
    const cleared = await db.pool.query(
      "select blocked_by, blocked_at from users where id = $1",
      [ids["student"]],
    );
    assert.equal(cleared.rows[0].blocked_by, null);
    assert.equal(cleared.rows[0].blocked_at, null);
    assert.equal(
      (
        await db.pool.query(
          "select count(*)::int as n from audit_log where action = 'account_unblocked' and target_id = $1",
          [ids["student"]],
        )
      ).rows[0].n,
      1,
    );

    // An admin lifts a block an admin set.
    const adminLift = await call(
      "PATCH",
      `/api/admin/users/${ids["blockedByAdmin"]}/status`,
      "admin",
      { status: "master" },
    );
    assert.equal(adminLift.status, 200);
  },
);

test(
  "a temporary password: shown once, replaces the password, ends the sessions, clears the pause, is audited without its value",
  opts,
  async () => {
    // The target has a session and a pause on its account.
    await db.pool.query(
      "update users set failed_count = 5, locked_until = now() + interval '1 hour' where id = $1",
      [ids["guest"]],
    );
    const r = await call(
      "POST",
      `/api/admin/users/${ids["guest"]}/temp-password`,
      "metr",
      {},
    );
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.match(r.body.password, /^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/);
    const row = await db.pool.query(
      "select password_hash, must_change, password_expires_at, failed_count, locked_until from users where id = $1",
      [ids["guest"]],
    );
    assert.equal(row.rows[0].must_change, true);
    assert.equal(row.rows[0].failed_count, 0);
    assert.equal(row.rows[0].locked_until, null);
    assert.equal(
      await verifyPassword(r.body.password, row.rows[0].password_hash),
      true,
    );
    const days =
      (new Date(row.rows[0].password_expires_at).getTime() - Date.now()) /
      86400_000;
    assert.ok(days > 29.9 && days <= 30);
    // The target's session is gone.
    const sessions = await db.pool.query(
      "select count(*)::int as n from sessions where user_id = $1",
      [ids["guest"]],
    );
    assert.equal(sessions.rows[0].n, 0);

    // Issuing another voids the first.
    const second = await call(
      "POST",
      `/api/admin/users/${ids["guest"]}/temp-password`,
      "admin",
      {},
    );
    const after = await db.pool.query(
      "select password_hash from users where id = $1",
      [ids["guest"]],
    );
    assert.notEqual(second.body.password, r.body.password);
    assert.equal(
      await verifyPassword(r.body.password, after.rows[0].password_hash),
      false,
    );
    assert.equal(
      await verifyPassword(second.body.password, after.rows[0].password_hash),
      true,
    );

    const audit = JSON.stringify(
      (
        await db.pool.query(
          "select * from audit_log where action = 'temp_password_issued'",
        )
      ).rows,
    );
    assert.ok(!audit.includes(r.body.password));
    assert.ok(!audit.includes(second.body.password));
    assert.ok(!audit.includes("password_hash"));
  },
);

test(
  "a temporary password is refused for the superuser, for oneself, and above a metr's reach",
  opts,
  async () => {
    const cases: [string, string, string][] = [
      ["admin", "boss", "protected"],
      ["metr", "boss", "protected"],
      ["admin", "admin", "self"],
      ["metr", "admin", "rank"],
      ["metr", "metr2", "rank"],
    ];
    for (const [who, whom, reason] of cases) {
      const before = await db.pool.query(
        "select password_hash, must_change from users where id = $1",
        [ids[whom]],
      );
      const r = await call(
        "POST",
        `/api/admin/users/${ids[whom]}/temp-password`,
        who,
        {},
      );
      assert.equal(r.status, 403, `${who} -> ${whom}`);
      assert.equal(r.body.reason, reason, `${who} -> ${whom}`);
      const after = await db.pool.query(
        "select password_hash, must_change from users where id = $1",
        [ids[whom]],
      );
      assert.deepEqual(after.rows[0], before.rows[0]);
    }
    assert.equal(
      (await call("POST", `/api/admin/users/999999/temp-password`, "admin", {}))
        .status,
      404,
    );
  },
);

test(
  "a write from another origin is refused before anything is decided",
  opts,
  async () => {
    const res = await fetch(`${base}/api/admin/users/${ids["guest"]}/status`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        origin: "https://evil.example",
        cookie: `__Host-session=${cookies["admin"]}`,
      },
      body: JSON.stringify({ status: "blocked" }),
    });
    assert.equal(res.status, 403);
    assert.equal(((await res.json()) as { error: string }).error, "cross_site");
  },
);

test(
  "no statement anywhere in the server changes or removes an audit row, and none deletes an account",
  opts,
  async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const root = fileURLToPath(new URL("../../../src/", import.meta.url));
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (path.endsWith(".ts")) files.push(path);
      }
    };
    walk(root);
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      const code = text
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n");
      assert.ok(
        !/(update|delete\s+from)\s+audit_log/i.test(code),
        `${file} changes the audit log`,
      );
      assert.ok(
        !/delete\s+from\s+users\b/i.test(code),
        `${file} deletes an account`,
      );
    }
  },
);
