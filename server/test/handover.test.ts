// The handover of the superuser role (T060, T068 of specs/001-self-hosted-club-site; security-review-superuser.md
// sections 4 and 6). Needs the development database. Time is passed in, so the cooling period and the lapse are
// tested without waiting.

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { hashPassword } from "../src/auth/password.js";
import { createSession } from "../src/auth/session.js";
import {
  acceptHandover,
  cancelHandover,
  completeDueHandovers,
  handoverStateOf,
  startHandover,
} from "../src/users/handover.js";
import { issueRecoverySet, unspentCodeCount } from "../src/users/recovery.js";
import {
  createTestDatabase,
  skipWithoutDatabase,
  type TestDatabase,
} from "./helpers/db.js";

let db: TestDatabase;
const ids: Record<string, number> = {};
const opts = { skip: skipWithoutDatabase };
const password = "a long enough password";
const hour = 3_600_000;
const t0 = new Date("2026-10-11T12:00:00Z");
const at = (hours: number) => new Date(t0.getTime() + hours * hour);

async function seed(
  key: string,
  status: string,
  superuser = false,
): Promise<void> {
  const row = await db.pool.query(
    `insert into users (email, display_name, status, is_superuser, password_hash, blocked_at)
     values ($1, $1, $2, $3, $4, case when $2 = 'blocked' then now() end) returning id`,
    [`${key}@example.test`, status, superuser, await hashPassword(password)],
  );
  ids[key] = Number(row.rows[0].id);
}
async function reset(): Promise<void> {
  await db.pool.query(
    "delete from handover_requests; update users set failed_count = 0, locked_until = null",
  );
}
async function holder(): Promise<number> {
  const r = await db.pool.query("select id from users where is_superuser");
  return Number(r.rows[0].id);
}

before(async () => {
  if (skipWithoutDatabase) return;
  db = await createTestDatabase();
  await seed("boss", "admin", true);
  await seed("deputy", "admin");
  await seed("metr", "metr");
  await seed("guest", "guest");
});
after(async () => {
  if (!skipWithoutDatabase) await db.drop();
});

test(
  "start: the password is typed again, the target must be an admin, one request at a time",
  opts,
  async () => {
    const wrong = await startHandover(
      db.pool,
      ids["boss"]!,
      "nope nope nope",
      ids["deputy"]!,
      t0,
    );
    assert.equal(!wrong.ok && wrong.reason, "wrong");
    await reset();
    for (const bad of ["metr", "guest", "boss"]) {
      const r = await startHandover(
        db.pool,
        ids["boss"]!,
        password,
        ids[bad]!,
        t0,
      );
      assert.deepEqual(r, { ok: false, reason: "bad_target" }, bad);
    }
    // Somebody who is not the superuser cannot start one.
    const notBoss = await startHandover(
      db.pool,
      ids["deputy"]!,
      password,
      ids["metr"]!,
      t0,
    );
    assert.equal(!notBoss.ok && notBoss.reason, "not_superuser");

    const started = await startHandover(
      db.pool,
      ids["boss"]!,
      password,
      ids["deputy"]!,
      t0,
    );
    assert.ok(started.ok);
    assert.equal(started.state.role, "from");
    assert.equal(started.state.other.id, ids["deputy"]);
    const second = await startHandover(
      db.pool,
      ids["boss"]!,
      password,
      ids["deputy"]!,
      t0,
    );
    assert.deepEqual(second, { ok: false, reason: "open_exists" });
    await reset();
  },
);

test(
  "accept: the target's own password, then the role waits the cooling period and moves after it",
  opts,
  async () => {
    await startHandover(db.pool, ids["boss"]!, password, ids["deputy"]!, t0);
    await createSession(db.pool, {
      userId: ids["boss"]!,
      status: "admin",
      superuser: true,
    });
    await createSession(db.pool, { userId: ids["deputy"]!, status: "admin" });
    await issueRecoverySet(db.pool, ids["boss"]!);

    // Nobody else has anything to accept; the wrong password is refused and counted.
    assert.deepEqual(
      await acceptHandover(db.pool, ids["metr"]!, password, t0),
      {
        ok: false,
        reason: "none",
      },
    );
    const wrong = await acceptHandover(
      db.pool,
      ids["deputy"]!,
      "not it at all",
      t0,
    );
    assert.equal(!wrong.ok && wrong.reason, "wrong");
    // The superuser's own password is not the target's.
    const accepted = await acceptHandover(
      db.pool,
      ids["deputy"]!,
      password,
      at(1),
    );
    assert.ok(accepted.ok);
    assert.equal(accepted.completed, false);
    assert.equal(accepted.effectiveAt, at(25).toISOString());

    // Before the period ends nothing moves; after it, it does.
    assert.equal(await completeDueHandovers(db.pool, at(24)), 0);
    assert.equal(await holder(), ids["boss"]);
    assert.equal(await completeDueHandovers(db.pool, at(25)), 1);
    assert.equal(await holder(), ids["deputy"]);
    const old = await db.pool.query(
      "select status, is_superuser from users where id = $1",
      [ids["boss"]],
    );
    assert.deepEqual(old.rows[0], { status: "admin", is_superuser: false });
    for (const key of ["boss", "deputy"]) {
      const n = await db.pool.query(
        "select count(*)::int as n from sessions where user_id = $1",
        [ids[key]],
      );
      assert.equal(n.rows[0].n, 0, key);
    }
    assert.equal(await unspentCodeCount(db.pool, ids["boss"]!), 0);
    const request = await db.pool.query(
      "select completed_at, cancelled_at from handover_requests",
    );
    assert.ok(request.rows[0].completed_at);
    assert.equal(request.rows[0].cancelled_at, null);
    // A second run completes nothing.
    assert.equal(await completeDueHandovers(db.pool, at(30)), 0);

    // Put the role back for the tests that follow.
    await db.pool.query(
      "update users set is_superuser = false where is_superuser",
    );
    await db.pool.query("update users set is_superuser = true where id = $1", [
      ids["boss"],
    ]);
    await reset();
  },
);

test(
  "either side may cancel before the role moves, and a cancelled request never completes",
  opts,
  async () => {
    for (const who of ["boss", "deputy"] as const) {
      await startHandover(db.pool, ids["boss"]!, password, ids["deputy"]!, t0);
      await acceptHandover(db.pool, ids["deputy"]!, password, t0);
      assert.equal(await cancelHandover(db.pool, ids[who]!, at(2)), true, who);
      assert.equal(await handoverStateOf(db.pool, ids["boss"]!, at(2)), null);
      assert.equal(await completeDueHandovers(db.pool, at(48)), 0);
      assert.equal(await holder(), ids["boss"]);
      await reset();
    }
    assert.equal(await cancelHandover(db.pool, ids["metr"]!, t0), false);
  },
);

test(
  "a request nobody accepts lapses after seven days and does not block a new one",
  opts,
  async () => {
    await startHandover(db.pool, ids["boss"]!, password, ids["deputy"]!, t0);
    const lateAccept = await acceptHandover(
      db.pool,
      ids["deputy"]!,
      password,
      at(24 * 7 + 1),
    );
    assert.deepEqual(lateAccept, { ok: false, reason: "none" });
    const again = await startHandover(
      db.pool,
      ids["boss"]!,
      password,
      ids["deputy"]!,
      at(24 * 7 + 2),
    );
    assert.ok(again.ok);
    await reset();
  },
);

test(
  "when the target stops being an admin, or the source stops being the superuser, the request is closed and the role does not move",
  opts,
  async () => {
    await startHandover(db.pool, ids["boss"]!, password, ids["deputy"]!, t0);
    await acceptHandover(db.pool, ids["deputy"]!, password, t0);
    await db.pool.query("update users set status = 'student' where id = $1", [
      ids["deputy"],
    ]);
    assert.equal(await completeDueHandovers(db.pool, at(30)), 0);
    assert.equal(await holder(), ids["boss"]);
    const closed = await db.pool.query(
      "select cancelled_at, completed_at from handover_requests",
    );
    assert.ok(closed.rows[0].cancelled_at);
    assert.equal(closed.rows[0].completed_at, null);
    await db.pool.query("update users set status = 'admin' where id = $1", [
      ids["deputy"],
    ]);
    await reset();

    // The role moved by the command in between: the request does not move it a second time.
    await startHandover(db.pool, ids["boss"]!, password, ids["deputy"]!, t0);
    await acceptHandover(db.pool, ids["deputy"]!, password, t0);
    await db.pool.query("update users set is_superuser = false where id = $1", [
      ids["boss"],
    ]);
    await db.pool.query("update users set is_superuser = true where id = $1", [
      ids["metr"],
    ]);
    assert.equal(await completeDueHandovers(db.pool, at(30)), 0);
    assert.equal(await holder(), ids["metr"]);
  },
);
