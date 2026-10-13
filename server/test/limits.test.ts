// The database part of the sign-in limits (T049 of specs/001-self-hosted-club-site; research.md section 5). The
// numbers and the address window are tested in signin.test.ts; this file tests what is stored: an account's pause
// lives in `users`, the pause of an identifier that matches no account is derived from `login_attempts` and follows
// the same function, a success forgives, attempts older than the retention are deleted, and the in-memory window stays
// bounded under a flood of invented addresses.

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AddressLimiter,
  clearFailedAttempts,
  deleteOldAttempts,
  identifierKey,
  pauseRemainingSeconds,
  recordFailedAttempt,
  signinLimits,
  type AttemptSubject,
} from "../src/auth/limits.js";
import { createTestDatabase, skipWithoutDatabase } from "./helpers/db.js";

const minute = 60_000;
const t0 = new Date("2026-10-11T10:00:00Z");

test(
  "an account and an unknown identifier are paused by the same numbers: 5 failures, 1 minute, 5 more, 5 minutes",
  { skip: skipWithoutDatabase },
  async () => {
    const db = await createTestDatabase();
    try {
      const user = (
        await db.pool.query(
          "insert into users (email) values ('a@example.test') returning id",
        )
      ).rows[0].id as number;
      const subjects: AttemptSubject[] = [
        { kind: "account", userId: user },
        { kind: "identifier", hash: identifierKey("ghost@example.test") },
      ];
      for (const subject of subjects) {
        assert.equal(await pauseRemainingSeconds(db.pool, subject, t0), 0);
        for (let i = 0; i < 4; i++) {
          await recordFailedAttempt(db.pool, subject, t0);
        }
        assert.equal(
          await pauseRemainingSeconds(db.pool, subject, t0),
          0,
          "four failures bring no pause",
        );
        await recordFailedAttempt(db.pool, subject, t0);
        assert.equal(await pauseRemainingSeconds(db.pool, subject, t0), 60);
        assert.equal(
          await pauseRemainingSeconds(
            db.pool,
            subject,
            new Date(t0.getTime() + 30_000),
          ),
          30,
        );
        const after = new Date(t0.getTime() + minute + 1000);
        assert.equal(await pauseRemainingSeconds(db.pool, subject, after), 0);
        for (let i = 0; i < 5; i++) {
          await recordFailedAttempt(db.pool, subject, after);
        }
        assert.equal(
          await pauseRemainingSeconds(db.pool, subject, after),
          5 * 60,
        );
      }
    } finally {
      await db.drop();
    }
  },
);

test(
  "a success forgives an account, and attempts past the retention are deleted with nothing else",
  { skip: skipWithoutDatabase },
  async () => {
    const db = await createTestDatabase();
    try {
      const user = (
        await db.pool.query(
          "insert into users (email) values ('b@example.test') returning id",
        )
      ).rows[0].id as number;
      const subject: AttemptSubject = { kind: "account", userId: user };
      for (let i = 0; i < 5; i++) {
        await recordFailedAttempt(db.pool, subject, t0);
      }
      assert.ok((await pauseRemainingSeconds(db.pool, subject, t0)) > 0);
      await clearFailedAttempts(db.pool, user);
      assert.equal(await pauseRemainingSeconds(db.pool, subject, t0), 0);
      const row = await db.pool.query(
        "select failed_count, locked_until from users where id = $1",
        [user],
      );
      assert.deepEqual(row.rows[0], { failed_count: 0, locked_until: null });

      const old = new Date(t0.getTime() - 31 * 24 * 60 * minute);
      const recent = new Date(t0.getTime() - 29 * 24 * 60 * minute);
      const hash = identifierKey("someone@example.test");
      await recordFailedAttempt(db.pool, { kind: "identifier", hash }, old);
      await recordFailedAttempt(db.pool, { kind: "identifier", hash }, recent);
      assert.equal(await deleteOldAttempts(db.pool, t0), 1);
      const left = await db.pool.query(
        "select count(*)::int as n from login_attempts",
      );
      assert.equal(left.rows[0].n, 1);
      // What is stored is the hash and never the text typed.
      const dump = JSON.stringify(
        (await db.pool.query("select * from login_attempts")).rows,
      );
      assert.ok(!dump.includes("someone@example.test"));
    } finally {
      await db.drop();
    }
  },
);

test("the address window stays bounded under a flood of invented addresses", () => {
  const limiter = new AddressLimiter();
  for (let i = 0; i < signinLimits.maxTrackedAddresses + 500; i++) {
    limiter.recordFailure(
      `10.${i >> 8}.${i & 255}.1`,
      new Date(t0.getTime() + i),
    );
  }
  // The newest are tracked and the oldest were let go; either way nothing throws and a fresh address is allowed.
  assert.deepEqual(limiter.check("192.0.2.1", t0), { allowed: true });
  const size = (limiter as unknown as { failures: Map<string, number[]> })
    .failures.size;
  assert.ok(size <= signinLimits.maxTrackedAddresses, `${size} tracked`);
});
