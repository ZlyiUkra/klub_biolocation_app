// The limits of the two code routes, recovery and setup (T171 and T172 of specs/001-self-hosted-club-site; the
// consilium of 2026-10-11): a right code is not stopped by the global ceiling, and a burst of parallel wrong codes is
// counted before any of them is looked up. Needs the development database.

import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  redeemRecoveryCode,
  RecoveryLimits,
  type RedeemInput,
} from "../src/users/recovery.js";
import { createSuperuser } from "../src/users/superuser.js";
import { redeemSetup, SetupGate } from "../src/users/setup.js";
import {
  createTestDatabase,
  skipWithoutDatabase,
  type TestDatabase,
} from "./helpers/db.js";

const opts = { skip: skipWithoutDatabase };
const password = "a long enough password";
const next = "another long enough password";
const settingsCode = "a-long-random-setup-code-from-the-settings-0002";
const now = new Date("2026-10-11T12:00:00Z");
let db: TestDatabase;

// A database of its own for each test: the audit log is append-only and keeps the account ids of the actors, so the
// accounts of one test cannot be deleted for the next (the tests that do not use a code as the actor can).
beforeEach(async () => {
  if (skipWithoutDatabase) return;
  db = await createTestDatabase();
});
afterEach(async () => {
  if (!skipWithoutDatabase) await db.drop();
});
async function reset(): Promise<void> {}
const attempt = (code: string, address: string): RedeemInput => ({
  identifier: "owner@example.test",
  code,
  newPassword: next,
  address,
  addressPrefix: "198.51.100.0/24",
});
const WRONG = "ZZZZ-ZZZZ-ZZZZ-ZZZZ";

test(
  "recovery: a right code passes the global ceiling that six addresses exhausted; a wrong one is still limited",
  opts,
  async () => {
    await reset();
    const made = await createSuperuser(db.pool, {
      email: "owner@example.test",
      password,
    });
    assert.ok(made.ok);
    const limits = new RecoveryLimits();
    for (let a = 0; a < 6; a++) {
      for (let i = 0; i < 5; i++) {
        const r = await redeemRecoveryCode(
          db.pool,
          attempt(WRONG, `addr-${a}`),
          limits,
          now,
        );
        assert.deepEqual(r, { ok: false, reason: "invalid" });
      }
    }
    // The ceiling (30 an hour) is spent.
    const wrong = await redeemRecoveryCode(
      db.pool,
      attempt(WRONG, "fresh-address"),
      limits,
      now,
    );
    assert.equal(!wrong.ok && wrong.reason, "limited");
    const right = await redeemRecoveryCode(
      db.pool,
      attempt(made.codes[0]!, "fresh-address"),
      limits,
      now,
    );
    assert.ok(right.ok, "a right code gets through the ceiling");
    // The per-address pause is not lifted for a right code.
    const paused = await redeemRecoveryCode(
      db.pool,
      attempt(right.codes[0]!, "addr-0"),
      limits,
      now,
    );
    assert.equal(!paused.ok && paused.reason, "limited");
  },
);

test(
  "recovery: fifty parallel wrong codes from one address let five through to the lookup and limit the rest",
  opts,
  async () => {
    await reset();
    await createSuperuser(db.pool, { email: "owner@example.test", password });
    const limits = new RecoveryLimits();
    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        redeemRecoveryCode(db.pool, attempt(WRONG, "burst"), limits, now),
      ),
    );
    const invalid = results.filter((r) => !r.ok && r.reason === "invalid");
    const limited = results.filter((r) => !r.ok && r.reason === "limited");
    assert.equal(invalid.length, 5);
    assert.equal(limited.length, 45);
  },
);

test(
  "recovery: a right code is not counted against its address",
  opts,
  async () => {
    await reset();
    const made = await createSuperuser(db.pool, {
      email: "owner@example.test",
      password,
    });
    assert.ok(made.ok);
    const limits = new RecoveryLimits();
    for (let i = 0; i < 4; i++) {
      await redeemRecoveryCode(db.pool, attempt(WRONG, "typos"), limits, now);
    }
    const right = await redeemRecoveryCode(
      db.pool,
      attempt(made.codes[0]!, "typos"),
      limits,
      now,
    );
    assert.ok(right.ok);
    // Four wrong ones and a right one: the window holds four, so one more wrong code is still answered, not limited.
    const fifth = await redeemRecoveryCode(
      db.pool,
      attempt(WRONG, "typos"),
      limits,
      now,
    );
    assert.deepEqual(fifth, { ok: false, reason: "invalid" });
    const sixth = await redeemRecoveryCode(
      db.pool,
      attempt(WRONG, "typos"),
      limits,
      now,
    );
    assert.equal(!sixth.ok && sixth.reason, "limited");
  },
);

test(
  "setup door: the right code passes the global ceiling; the per-address pause still stands",
  opts,
  async () => {
    await reset();
    const gate = new SetupGate({ code: settingsCode, log: () => {} });
    for (let a = 0; a < 6; a++) {
      for (let i = 0; i < 5; i++) {
        const r = await redeemSetup(
          db.pool,
          gate,
          {
            code: `wrong code number ${a}-${i}`,
            email: "owner@example.test",
            password,
            address: `s-${a}`,
          },
          now,
        );
        assert.deepEqual(r, { ok: false, reason: "invalid" });
      }
    }
    const wrong = await redeemSetup(
      db.pool,
      gate,
      {
        code: "another wrong code, fresh address",
        email: "owner@example.test",
        password,
        address: "s-fresh",
      },
      now,
    );
    assert.equal(!wrong.ok && wrong.reason, "limited");
    const pausedAddress = await redeemSetup(
      db.pool,
      gate,
      {
        code: settingsCode,
        email: "owner@example.test",
        password,
        address: "s-0",
      },
      now,
    );
    assert.equal(!pausedAddress.ok && pausedAddress.reason, "limited");
    const right = await redeemSetup(
      db.pool,
      gate,
      {
        code: settingsCode,
        email: "owner@example.test",
        password,
        address: "s-fresh",
      },
      now,
    );
    assert.ok(right.ok, "the right code gets through the exhausted ceiling");
  },
);
