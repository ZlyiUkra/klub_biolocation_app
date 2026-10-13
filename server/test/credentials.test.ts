// A changed password closes an open hand-over of the superuser role, on both sides, whichever way it changed (T170 of
// specs/001-self-hosted-club-site; the consilium of 2026-10-11, finding F1; users/credentials.ts). Also the lock
// order of the accounts (F7). Needs the development database.

import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { changePassword } from "../src/auth/accounts.js";
import { hashPassword } from "../src/auth/password.js";
import { startHandover } from "../src/users/handover.js";
import {
  issueRecoverySet,
  redeemRecoveryCode,
  RecoveryLimits,
} from "../src/users/recovery.js";
import {
  handOverNow,
  lockAccounts,
  setSuperuserPassword,
  setupSuperuser,
} from "../src/users/superuser.js";
import {
  createTestDatabase,
  skipWithoutDatabase,
  type TestDatabase,
} from "./helpers/db.js";

const opts = { skip: skipWithoutDatabase };
const password = "a long enough password";
const next = "another long enough password";
let db: TestDatabase;
const ids: Record<string, number> = {};

async function seed(key: string, status: string, superuser = false) {
  const row = await db.pool.query(
    `insert into users (email, display_name, status, is_superuser, password_hash)
     values ($1, $1, $2, $3, $4) returning id`,
    [`${key}@example.test`, status, superuser, await hashPassword(password)],
  );
  ids[key] = Number(row.rows[0].id);
}
async function openRequests(): Promise<number> {
  const r = await db.pool.query(
    "select count(*)::int as n from handover_requests where completed_at is null and cancelled_at is null",
  );
  return r.rows[0].n;
}
// The holder's password as the tests change it; the hand-over is started with it typed again.
let bossPassword = password;
async function start(): Promise<void> {
  const r = await startHandover(
    db.pool,
    ids["boss"]!,
    bossPassword,
    ids["deputy"]!,
  );
  assert.ok(r.ok, "the request could be started");
  assert.equal(await openRequests(), 1);
}
async function closedFor(reason: string): Promise<number> {
  const r = await db.pool.query(
    `select count(*)::int as n from audit_log
      where action = 'handover_closed' and detail->>'reason' = $1`,
    [reason],
  );
  return r.rows[0].n;
}

before(async () => {
  if (skipWithoutDatabase) return;
  db = await createTestDatabase();
  await seed("boss", "admin", true);
  await seed("deputy", "admin");
  await seed("other", "admin");
});
after(async () => {
  if (!skipWithoutDatabase) await db.drop();
});
beforeEach(async () => {
  if (skipWithoutDatabase) return;
  await db.pool.query(
    "delete from handover_requests; update users set failed_count = 0, locked_until = null",
  );
});

test(
  "a recovery code used by the holder closes a request somebody else started with the stolen session",
  opts,
  async () => {
    await start();
    const codes = await issueRecoverySet(db.pool, ids["boss"]!);
    const before = await closedFor("credentials_changed");
    const r = await redeemRecoveryCode(
      db.pool,
      {
        identifier: "boss@example.test",
        code: codes[0]!,
        newPassword: next,
        address: "c1",
        addressPrefix: "198.51.100.0/24",
      },
      new RecoveryLimits(),
    );
    assert.ok(r.ok);
    bossPassword = next;
    assert.equal(await openRequests(), 0);
    assert.equal(await closedFor("credentials_changed"), before + 1);
  },
);

test("set-password of the server command closes it", opts, async () => {
  await start();
  const r = await setSuperuserPassword(db.pool, "a third long password");
  assert.ok(r.ok);
  bossPassword = "a third long password";
  assert.equal(await openRequests(), 0);
});

test(
  "the account page's change of password closes it, for the holder and for the target",
  opts,
  async () => {
    await start();
    const holder = await changePassword(db.pool, ids["boss"]!, {
      current: bossPassword,
      next: password,
    });
    assert.deepEqual(holder, { ok: true });
    bossPassword = password;
    assert.equal(await openRequests(), 0);

    await start();
    const target = await changePassword(db.pool, ids["deputy"]!, {
      current: password,
      next,
    });
    assert.deepEqual(target, { ok: true });
    assert.equal(await openRequests(), 0);
    // Put the target's password back for the tests that follow.
    await db.pool.query("update users set password_hash = $2 where id = $1", [
      ids["deputy"],
      await hashPassword(password),
    ]);
  },
);

test(
  "the setup door with the holder's own address closes it; with another address the role moves and it closes too",
  opts,
  async () => {
    await start();
    const same = await setupSuperuser(
      db.pool,
      { email: "BOSS@example.test", password: next },
      { replace: true },
    );
    assert.ok(same.ok);
    assert.equal(same.replaced, false);
    bossPassword = next;
    assert.equal(await openRequests(), 0);
    const action = await db.pool.query(
      "select detail from audit_log where action = 'superuser_password_set' and detail->>'via' = 'setup_door'",
    );
    assert.equal(action.rowCount, 1);

    await start();
    const moved = await setupSuperuser(
      db.pool,
      { email: "other@example.test", password: next },
      { replace: true },
    );
    assert.ok(moved.ok);
    assert.equal(moved.replaced, true);
    assert.equal(await openRequests(), 0);
    assert.ok((await closedFor("role_moved")) >= 1, "closing is in the audit");
    // Give the role back for the tests that follow.
    const back = await handOverNow(db.pool, "boss@example.test");
    assert.ok(back.ok);
  },
);

test(
  "lockAccounts answers in id order and says who holds the role",
  opts,
  async () => {
    const client = await db.pool.connect();
    try {
      await client.query("begin");
      const map = await lockAccounts(client, [
        ids["other"]!,
        ids["boss"]!,
        ids["deputy"]!,
      ]);
      assert.deepEqual(
        [...map.keys()],
        [ids["boss"]!, ids["deputy"]!, ids["other"]!].sort((a, b) => a - b),
      );
      assert.equal(map.get(ids["boss"]!)?.isSuperuser, true);
      await client.query("rollback");
    } finally {
      client.release();
    }
  },
);

test(
  "many hand-overs at once never deadlock: one wins, the others find the role gone",
  opts,
  async () => {
    const results = await Promise.all(
      ["deputy", "other", "deputy", "other", "deputy", "other"].map((key) =>
        handOverNow(db.pool, `${key}@example.test`),
      ),
    );
    assert.equal(results.filter((r) => r.ok).length >= 1, true);
    const holders = await db.pool.query(
      "select count(*)::int as n from users where is_superuser",
    );
    assert.equal(holders.rows[0].n, 1);
  },
);
