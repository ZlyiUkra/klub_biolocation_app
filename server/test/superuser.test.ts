// The superuser module (T060 of specs/001-self-hosted-club-site; security-review-superuser.md sections 2, 4 and 6):
// the server command's three steps, the unique index, and the recovery codes. Needs the development database.

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { verifyPassword } from "../src/auth/password.js";
import { createSession } from "../src/auth/session.js";
import {
  RecoveryLimits,
  canonicalCode,
  hashCode,
  issueRecoverySet,
  redeemRecoveryCode,
  unspentCodeCount,
} from "../src/users/recovery.js";
import {
  createSuperuser,
  handOverNow,
  setSuperuserPassword,
  superuserStatus,
} from "../src/users/superuser.js";
import {
  createTestDatabase,
  skipWithoutDatabase,
  type TestDatabase,
} from "./helpers/db.js";

let db: TestDatabase;
before(async () => {
  if (skipWithoutDatabase) return;
  db = await createTestDatabase();
});
after(async () => {
  if (!skipWithoutDatabase) await db.drop();
});

const opts = { skip: skipWithoutDatabase };
const password = "a long enough password";

async function account(email: string, status = "guest"): Promise<number> {
  const row = await db.pool.query(
    `insert into users (email, display_name, status, blocked_at)
     values ($1, $1, $2, case when $2 = 'blocked' then now() end) returning id`,
    [email, status],
  );
  return Number(row.rows[0].id);
}
async function sessionsOf(userId: number): Promise<number> {
  const r = await db.pool.query(
    "select count(*)::int as n from sessions where user_id = $1",
    [userId],
  );
  return r.rows[0].n;
}
const address = { address: "198.51.100.7", addressPrefix: "198.51.100" };

test("the codes: canonical form, a stable digest, no look-alike confusion", () => {
  assert.equal(
    canonicalCode(" 7m2k-9qxd-o4vt-he5r "),
    "7M2K9QXD04VTHE5R".toUpperCase(),
  );
  assert.deepEqual(
    hashCode("7M2K-9QXD-04VT-HE5R"),
    hashCode("7m2k9qxdo4vthe5r"),
  );
  assert.equal(hashCode("7M2K-9QXD-04VT-HE5R").length, 32);
  // I and L are read as 1, O as 0 (Crockford).
  assert.equal(canonicalCode("IL-O"), "110");
});

test(
  "create makes an account, issues ten codes, refuses a second superuser, and the index agrees",
  opts,
  async () => {
    const first = await createSuperuser(db.pool, {
      email: "boss@example.test",
      password,
    });
    assert.ok(first.ok);
    assert.equal(first.promoted, false);
    assert.equal(first.codes.length, 10);
    assert.equal(new Set(first.codes).size, 10);
    const row = await db.pool.query(
      "select status, is_superuser, password_hash from users where id = $1",
      [first.userId],
    );
    assert.equal(row.rows[0].status, "admin");
    assert.equal(row.rows[0].is_superuser, true);
    assert.equal(
      await verifyPassword(password, row.rows[0].password_hash),
      true,
    );
    // Only digests are stored: no plaintext code is in the table.
    const stored = JSON.stringify(
      (await db.pool.query("select * from recovery_codes")).rows,
    );
    for (const code of first.codes) assert.ok(!stored.includes(code));
    assert.equal(await unspentCodeCount(db.pool, first.userId), 10);

    const second = await createSuperuser(db.pool, {
      email: "other@example.test",
      password,
    });
    assert.deepEqual(second, { ok: false, reason: "exists" });

    // The index holds even against a direct statement.
    const other = await account("direct@example.test", "admin");
    await assert.rejects(
      db.pool.query("update users set is_superuser = true where id = $1", [
        other,
      ]),
      /users_one_superuser/,
    );
    const audit = await db.pool.query(
      "select actor_id, action, detail from audit_log where action = 'superuser_created'",
    );
    assert.equal(audit.rowCount, 1);
    assert.equal(audit.rows[0].actor_id, null);
    assert.ok(!JSON.stringify(audit.rows).includes(password));
  },
);

test(
  "set-password: new hash, sessions ended, codes untouched, refusals",
  opts,
  async () => {
    const status = await superuserStatus(db.pool);
    const id = status.superuser!.id;
    await createSession(db.pool, {
      userId: id,
      status: "admin",
      superuser: true,
    });
    assert.equal(await sessionsOf(id), 1);
    const codesBefore = await unspentCodeCount(db.pool, id);

    const weak = await setSuperuserPassword(db.pool, "short");
    assert.deepEqual(weak, {
      ok: false,
      reason: "password",
      problem: "too_short",
    });
    const changed = await setSuperuserPassword(
      db.pool,
      "another long password",
    );
    assert.ok(changed.ok);
    const row = await db.pool.query(
      "select password_hash from users where id = $1",
      [id],
    );
    assert.equal(
      await verifyPassword("another long password", row.rows[0].password_hash),
      true,
    );
    assert.equal(await sessionsOf(id), 0);
    assert.equal(await unspentCodeCount(db.pool, id), codesBefore);
  },
);

test(
  "hand-over by the command: any account becomes the admin holder, sessions and old codes end, status stays admin for the old",
  opts,
  async () => {
    const before = (await superuserStatus(db.pool)).superuser!;
    const guest = await account("guest@example.test", "blocked");
    await createSession(db.pool, { userId: guest, status: "blocked" });
    await createSession(db.pool, {
      userId: before.id,
      status: "admin",
      superuser: true,
    });

    assert.deepEqual(await handOverNow(db.pool, "nobody@example.test"), {
      ok: false,
      reason: "missing",
    });
    assert.deepEqual(await handOverNow(db.pool, before.email), {
      ok: false,
      reason: "same",
    });
    const moved = await handOverNow(db.pool, "GUEST@example.test");
    assert.ok(moved.ok);

    const rows = await db.pool.query(
      "select id, status, is_superuser, blocked_at, blocked_by from users where id = any($1::bigint[]) order by id",
      [[before.id, guest]],
    );
    const old = rows.rows.find((r) => Number(r.id) === before.id);
    const next = rows.rows.find((r) => Number(r.id) === guest);
    assert.equal(old.is_superuser, false);
    assert.equal(old.status, "admin");
    assert.equal(next.is_superuser, true);
    assert.equal(next.status, "admin");
    assert.equal(next.blocked_at, null);
    assert.equal(await sessionsOf(before.id), 0);
    assert.equal(await sessionsOf(guest), 0);
    assert.equal(await unspentCodeCount(db.pool, before.id), 0);
    const audit = await db.pool.query(
      "select detail from audit_log where action = 'superuser_handed_over'",
    );
    assert.equal(audit.rows[0].detail.via, "command");
  },
);

test(
  "create on an existing guest promotes it (when there is no holder), keeping the address and lifting a block",
  opts,
  async () => {
    // Clear the holder the earlier steps left, the way a test of this step needs: the flag is cleared by a statement
    // here only because this is a test of what `create` does on an empty site.
    await db.pool.query(
      "update users set is_superuser = false where is_superuser",
    );
    const id = await account("promote@example.test", "blocked");
    const result = await createSuperuser(db.pool, {
      email: "Promote@Example.Test",
      password,
    });
    assert.ok(result.ok);
    assert.equal(result.promoted, true);
    assert.equal(result.userId, id);
    const row = await db.pool.query(
      "select status, is_superuser, blocked_at, blocked_by, email from users where id = $1",
      [id],
    );
    assert.equal(row.rows[0].status, "admin");
    assert.equal(row.rows[0].blocked_at, null);
    assert.equal(row.rows[0].email, "promote@example.test");
  },
);

test(
  "a recovery code sets a password once, ends the sessions, voids the rest and gives a fresh set",
  opts,
  async () => {
    const holder = (await superuserStatus(db.pool)).superuser!;
    const codes = await issueRecoverySet(db.pool, holder.id);
    assert.equal(codes.length, 10);
    await createSession(db.pool, {
      userId: holder.id,
      status: "admin",
      superuser: true,
    });
    const limits = new RecoveryLimits();

    const ok = await redeemRecoveryCode(
      db.pool,
      {
        identifier: holder.email.toUpperCase(),
        code: codes[0]!.toLowerCase(),
        newPassword: "a recovered password",
        ...address,
      },
      limits,
    );
    assert.ok(ok.ok);
    assert.equal(ok.codes.length, 10);
    assert.ok(ok.codes.every((c) => !codes.includes(c)));
    const row = await db.pool.query(
      "select password_hash, must_change from users where id = $1",
      [holder.id],
    );
    assert.equal(
      await verifyPassword("a recovered password", row.rows[0].password_hash),
      true,
    );
    assert.equal(await sessionsOf(holder.id), 0);

    // The spent code, and every other code of the old set, are refused with one and the same answer.
    const refusals = [];
    for (const code of [codes[0]!, codes[1]!, "ZZZZ-ZZZZ-ZZZZ-ZZZZ", "bad"]) {
      refusals.push(
        await redeemRecoveryCode(
          db.pool,
          {
            identifier: holder.email,
            code,
            newPassword: "another password",
            ...address,
          },
          limits,
        ),
      );
    }
    for (const r of refusals)
      assert.deepEqual(r, { ok: false, reason: "invalid" });
    // The fresh set works; its code with another identifier does not.
    const wrongWho = await redeemRecoveryCode(
      db.pool,
      {
        identifier: "nobody@example.test",
        code: ok.codes[0]!,
        newPassword: "another password",
        ...address,
      },
      limits,
    );
    assert.deepEqual(wrongWho, { ok: false, reason: "invalid" });
    assert.equal(await unspentCodeCount(db.pool, holder.id), 10);
  },
);

test(
  "a code of an account that is not the superuser is the same invalid answer",
  opts,
  async () => {
    const other = await account("plain@example.test", "admin");
    const codes = await issueRecoverySet(db.pool, other);
    const r = await redeemRecoveryCode(
      db.pool,
      {
        identifier: "plain@example.test",
        code: codes[0]!,
        newPassword: "a long password",
        ...address,
      },
      new RecoveryLimits(),
    );
    assert.deepEqual(r, { ok: false, reason: "invalid" });
  },
);

test(
  "a short new password is refused before the code is looked at, and the failures are limited per address and globally",
  opts,
  async () => {
    const limits = new RecoveryLimits();
    const weak = await redeemRecoveryCode(
      db.pool,
      {
        identifier: "x@example.test",
        code: "0000-0000-0000-0000",
        newPassword: "short",
        ...address,
      },
      limits,
    );
    assert.deepEqual(weak, {
      ok: false,
      reason: "password",
      problem: "too_short",
    });
    // Five failures from one address, then it is paused whatever it sends.
    for (let i = 0; i < 5; i++) {
      const r = await redeemRecoveryCode(
        db.pool,
        {
          identifier: "x@example.test",
          code: "0000-0000-0000-0000",
          newPassword: "a long password",
          ...address,
        },
        limits,
      );
      assert.equal(r.ok, false);
    }
    const sixth = await redeemRecoveryCode(
      db.pool,
      {
        identifier: "x@example.test",
        code: "0000-0000-0000-0000",
        newPassword: "a long password",
        ...address,
      },
      limits,
    );
    assert.equal(sixth.ok, false);
    assert.equal(!sixth.ok && sixth.reason, "limited");
    // Another address is not paused by the first one's failures...
    const elsewhere = await redeemRecoveryCode(
      db.pool,
      {
        identifier: "x@example.test",
        code: "0000-0000-0000-0000",
        newPassword: "a long password",
        address: "203.0.113.9",
        addressPrefix: "203.0.113",
      },
      limits,
    );
    assert.equal(!elsewhere.ok && elsewhere.reason, "invalid");
    // ...until the global ceiling of thirty is reached.
    const global = new RecoveryLimits();
    for (let i = 0; i < 30; i++) {
      await redeemRecoveryCode(
        db.pool,
        {
          identifier: "x@example.test",
          code: "0000-0000-0000-0000",
          newPassword: "a long password",
          address: `192.0.2.${i}`,
          addressPrefix: "192.0.2",
        },
        global,
      );
    }
    const capped = await redeemRecoveryCode(
      db.pool,
      {
        identifier: "x@example.test",
        code: "0000-0000-0000-0000",
        newPassword: "a long password",
        address: "198.18.0.1",
        addressPrefix: "198.18.0",
      },
      global,
    );
    assert.equal(!capped.ok && capped.reason, "limited");
  },
);
