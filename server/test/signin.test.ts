// Signing in (T044 of specs/001-self-hosted-club-site; research.md sections 5 and 8, data-model "users"). Written before
// the modules (T047, T049, T050); all of them run since T050. The numbers are the owner's of 2026-10-11 (variant A): five
// failures in a row bring a pause of 1 minute, five more 5 minutes, then 15 minutes at every fifth, never permanent;
// one address may fail 20 times in 15
// minutes. The address limit is the project's own code, not a package.
// Specified here:
// - the first field is an address when it holds `@` and a login name otherwise, case-insensitively;
// - an unknown identifier, a wrong password, an expired temporary password and an account with no password all answer
//   with the very same refusal, so the form cannot be used to find out which addresses have accounts; and the pause
//   applies to an unknown identifier too, or the pause itself would tell them apart;
// - a visitor in a pause is refused even with the right password, told how long, and attempts made during the pause
//   neither count nor extend it (or an owner who keeps trying would lock himself deeper);
// - a temporary password signs in but only into the change-password form;
// - an account that has been blocked still signs in (it sees the public part of the site only), because being blocked
//   is a status and not a lock-out of the door.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pool } from "../src/db/pool.js";
import { hashPassword } from "../src/auth/password.js";
import {
  AddressLimiter,
  pauseAfterFailures,
  signinLimits,
} from "../src/auth/limits.js";
import { classifyIdentifier, signIn } from "../src/auth/signin.js";
import { createTestDatabase, skipWithoutDatabase } from "./helpers/db.js";

const minute = 60_000;

test("the first field is an address when it holds @ and a login name otherwise, lower-cased and trimmed", () => {
  assert.deepEqual(classifyIdentifier("  Ann@Example.Test "), {
    kind: "email",
    value: "ann@example.test",
  });
  assert.deepEqual(classifyIdentifier("Dowser.77"), {
    kind: "login",
    value: "dowser.77",
  });
  // A login name can never contain @, so the presence of it is the whole rule.
  assert.equal(classifyIdentifier("a@b").kind, "email");
  assert.equal(classifyIdentifier("ab-c_d.e").kind, "login");
});

test("the pause grows 1, 5, 15 minutes at every fifth failure, stays at 15, and is never permanent", () => {
  assert.deepEqual(signinLimits.pausesMs, [
    1 * minute,
    5 * minute,
    15 * minute,
  ]);
  for (const n of [0, 1, 2, 3, 4])
    assert.equal(pauseAfterFailures(n), 0, `${n}`);
  assert.equal(pauseAfterFailures(5), 1 * minute);
  for (const n of [6, 7, 8, 9]) assert.equal(pauseAfterFailures(n), 0, `${n}`);
  assert.equal(pauseAfterFailures(10), 5 * minute);
  assert.equal(pauseAfterFailures(15), 15 * minute);
  assert.equal(pauseAfterFailures(20), 15 * minute);
  assert.equal(pauseAfterFailures(500), 15 * minute);
  // Whatever the count, no pause is longer than 15 minutes.
  for (let n = 0; n < 1000; n++) {
    assert.ok(pauseAfterFailures(n) <= 15 * minute);
  }
});

test("one address may fail 20 times in 15 minutes, then waits until the oldest failure leaves the window", () => {
  assert.equal(signinLimits.addressMaxFailures, 20);
  assert.equal(signinLimits.addressWindowMs, 15 * minute);
  const limiter = new AddressLimiter();
  const t0 = new Date("2026-10-11T10:00:00Z");
  for (let i = 0; i < 20; i++) {
    assert.deepEqual(limiter.check("203.0.113.9", t0), { allowed: true });
    limiter.recordFailure("203.0.113.9", new Date(t0.getTime() + i * 1000));
  }
  const blocked = limiter.check("203.0.113.9", new Date(t0.getTime() + 30_000));
  assert.equal(blocked.allowed, false);
  if (!blocked.allowed) {
    // The oldest failure was at t0, so it leaves at t0 + 15 minutes.
    assert.ok(blocked.retryAfterSeconds > 0);
    assert.ok(blocked.retryAfterSeconds <= 15 * 60);
  }
  // Another address is not touched, and the window slides: after 15 minutes the first failures are forgotten.
  assert.deepEqual(limiter.check("198.51.100.4", t0), { allowed: true });
  assert.deepEqual(
    limiter.check("203.0.113.9", new Date(t0.getTime() + 16 * minute)),
    { allowed: true },
  );
});

let counter = 0;
async function insertAccount(
  pool: Pool,
  over: {
    email?: string;
    login?: string | null;
    password?: string | null;
    status?: string;
    mustChange?: boolean;
    passwordExpiresAt?: Date | null;
  } = {},
): Promise<{ id: number; email: string }> {
  counter += 1;
  const email = over.email ?? `member${counter}@example.test`;
  const hash =
    over.password === null
      ? null
      : await hashPassword(over.password ?? "correct horse battery");
  const result = await pool.query(
    `insert into users (email, login, status, password_hash, must_change, password_expires_at, blocked_at)
     values ($1, $2, $3, $4, $5, $6, case when $3 = 'blocked' then now() end) returning id`,
    [
      email,
      over.login ?? null,
      over.status ?? "guest",
      hash,
      over.mustChange ?? false,
      over.passwordExpiresAt ?? null,
    ],
  );
  // bigint comes back as a string; the module hands out numbers, as its type says.
  return { id: Number(result.rows[0].id), email };
}

test(
  "an address or a login name signs in, in any case; the right password is needed",
  { skip: skipWithoutDatabase },
  async () => {
    const db = await createTestDatabase();
    try {
      const account = await insertAccount(db.pool, {
        email: "Ann@Example.Test",
        login: "ann.d",
        status: "student",
      });
      const limiter = new AddressLimiter();
      const context = { limiter, now: new Date("2026-10-11T10:00:00Z") };
      const base = {
        password: "correct horse battery",
        address: "203.0.113.5",
      };
      for (const identifier of [
        "ann@example.test",
        "ANN@EXAMPLE.TEST",
        "ann.d",
        "Ann.D",
      ]) {
        const result = await signIn(db.pool, { ...base, identifier }, context);
        assert.deepEqual(result, {
          ok: true,
          userId: account.id,
          status: "student",
          mustChange: false,
        });
      }
    } finally {
      await db.drop();
    }
  },
);

test(
  "an unknown identifier, a wrong password, an expired temporary password and no password all give one answer",
  { skip: skipWithoutDatabase },
  async () => {
    const db = await createTestDatabase();
    try {
      const now = new Date("2026-10-11T10:00:00Z");
      const wrong = await insertAccount(db.pool, {
        email: "wrong@example.test",
      });
      const expired = await insertAccount(db.pool, {
        email: "expired@example.test",
        password: "temporary-1",
        mustChange: true,
        passwordExpiresAt: new Date(now.getTime() - 24 * 60 * minute),
      });
      const none = await insertAccount(db.pool, {
        email: "imported@example.test",
        password: null,
      });
      const limiter = new AddressLimiter();
      const answers = await Promise.all([
        signIn(
          db.pool,
          {
            identifier: "nobody@example.test",
            password: "whatever12",
            address: "a1",
          },
          { limiter, now },
        ),
        signIn(
          db.pool,
          {
            identifier: wrong.email,
            password: "not the password",
            address: "a2",
          },
          { limiter, now },
        ),
        signIn(
          db.pool,
          { identifier: expired.email, password: "temporary-1", address: "a3" },
          { limiter, now },
        ),
        // An imported account has no password at all: no password can sign it in, the empty one included.
        signIn(
          db.pool,
          { identifier: none.email, password: "", address: "a4" },
          { limiter, now },
        ),
      ]);
      for (const answer of answers) {
        assert.deepEqual(answer, { ok: false, reason: "invalid" });
      }
    } finally {
      await db.drop();
    }
  },
);

test(
  "five failures bring a pause of a minute even for the right password; attempts in a pause do not count; then 5 minutes",
  { skip: skipWithoutDatabase },
  async () => {
    const db = await createTestDatabase();
    try {
      const account = await insertAccount(db.pool, {
        email: "slow@example.test",
      });
      // Every attempt comes from its own address, so the address limit does not interfere with the account's.
      let n = 0;
      const attempt = (
        password: string,
        at: Date,
        identifier = account.email,
      ) =>
        signIn(
          db.pool,
          { identifier, password, address: `10.0.0.${(n += 1)}` },
          { limiter: new AddressLimiter(), now: at },
        );

      const t0 = new Date("2026-10-11T10:00:00Z");
      // Changed 2026-10-11 (T053): from the third failure of a step the answer says how many tries are left, and the
      // fifth says at once how long the pause is. The first two are the bare refusal.
      const told: unknown[] = [];
      for (let i = 0; i < 5; i++) {
        told.push(await attempt("wrong password", t0));
      }
      assert.deepEqual(told, [
        { ok: false, reason: "invalid" },
        { ok: false, reason: "invalid" },
        { ok: false, reason: "invalid", attemptsLeft: 2 },
        { ok: false, reason: "invalid", attemptsLeft: 1 },
        { ok: false, reason: "invalid", attemptsLeft: 0, pauseSeconds: 60 },
      ]);
      // In the pause the right password is refused and the visitor is told how long.
      const during = await attempt(
        "correct horse battery",
        new Date(t0.getTime() + 10_000),
      );
      assert.equal(during.ok, false);
      assert.ok(!during.ok && during.reason === "locked");
      assert.ok(
        !during.ok &&
          during.reason === "locked" &&
          during.retryAfterSeconds <= 60,
      );
      // Attempts made in the pause did not count: after it the count is still five, so five more bring 5 minutes.
      const t1 = new Date(t0.getTime() + 61_000);
      // The sixth to the ninth failure are the first four of the next step; the tenth earns 5 minutes.
      for (let i = 0; i < 4; i++) {
        const answer = await attempt("wrong password", t1);
        assert.ok(!answer.ok && answer.reason === "invalid");
      }
      const fifth = await attempt("wrong password", t1);
      assert.deepEqual(fifth, {
        ok: false,
        reason: "invalid",
        attemptsLeft: 0,
        pauseSeconds: 300,
      });
      const second = await attempt(
        "correct horse battery",
        new Date(t1.getTime() + 60_000),
      );
      assert.ok(!second.ok && second.reason === "locked");
      assert.ok(
        !second.ok &&
          second.reason === "locked" &&
          second.retryAfterSeconds > 60,
      );
      // After 5 minutes the right password signs in and clears the count.
      const t2 = new Date(t1.getTime() + 5 * minute + 1000);
      const ok = await attempt("correct horse battery", t2);
      assert.ok(ok.ok);
      const row = await db.pool.query(
        "select failed_count, locked_until from users where id = $1",
        [account.id],
      );
      assert.equal(row.rows[0].failed_count, 0);
      assert.equal(row.rows[0].locked_until, null);
    } finally {
      await db.drop();
    }
  },
);

test(
  "an unknown identifier is paused in the same way, so the pause cannot be used to find accounts",
  { skip: skipWithoutDatabase },
  async () => {
    const db = await createTestDatabase();
    try {
      const real = await insertAccount(db.pool, { email: "real@example.test" });
      let n = 0;
      const attempt = (identifier: string, at: Date) =>
        signIn(
          db.pool,
          {
            identifier,
            password: "wrong password",
            address: `10.1.0.${(n += 1)}`,
          },
          { limiter: new AddressLimiter(), now: at },
        );
      const at = new Date("2026-10-11T10:00:00Z");
      const outcomes: unknown[] = [];
      for (const identifier of [real.email, "ghost@example.test"]) {
        const seen: unknown[] = [];
        for (let i = 0; i < 7; i++) {
          const answer = await attempt(identifier, new Date(at.getTime() + i));
          seen.push(answer.ok ? "ok" : answer.reason);
        }
        outcomes.push(seen);
      }
      // The same sequence of answers for the account that exists and the one that does not.
      assert.deepEqual(outcomes[0], outcomes[1]);
      assert.deepEqual(outcomes[0], [
        "invalid",
        "invalid",
        "invalid",
        "invalid",
        "invalid",
        "locked",
        "locked",
      ]);
    } finally {
      await db.drop();
    }
  },
);

test(
  "a temporary password signs in but only into the change form; a blocked account still signs in",
  { skip: skipWithoutDatabase },
  async () => {
    const db = await createTestDatabase();
    try {
      const now = new Date("2026-10-11T10:00:00Z");
      const temporary = await insertAccount(db.pool, {
        email: "temp@example.test",
        password: "temporary-2",
        mustChange: true,
        passwordExpiresAt: new Date(now.getTime() + 30 * 24 * 60 * minute),
      });
      const blocked = await insertAccount(db.pool, {
        email: "blocked@example.test",
        status: "blocked",
      });
      const limiter = new AddressLimiter();
      const first = await signIn(
        db.pool,
        { identifier: temporary.email, password: "temporary-2", address: "b1" },
        { limiter, now },
      );
      assert.deepEqual(first, {
        ok: true,
        userId: temporary.id,
        status: "guest",
        mustChange: true,
      });
      const second = await signIn(
        db.pool,
        {
          identifier: blocked.email,
          password: "correct horse battery",
          address: "b2",
        },
        { limiter, now },
      );
      assert.ok(second.ok && second.status === "blocked");
    } finally {
      await db.drop();
    }
  },
);

test(
  "an address past its limit is refused with a wait, even with the right password",
  { skip: skipWithoutDatabase },
  async () => {
    const db = await createTestDatabase();
    try {
      const account = await insertAccount(db.pool, {
        email: "calm@example.test",
      });
      const limiter = new AddressLimiter();
      const now = new Date("2026-10-11T10:00:00Z");
      // Twenty failures from one address against twenty different identifiers: no account is paused, the address is.
      for (let i = 0; i < 20; i++) {
        await signIn(
          db.pool,
          {
            identifier: `nobody${i}@example.test`,
            password: "wrong password",
            address: "203.0.113.50",
          },
          { limiter, now },
        );
      }
      const refused = await signIn(
        db.pool,
        {
          identifier: account.email,
          password: "correct horse battery",
          address: "203.0.113.50",
        },
        { limiter, now },
      );
      assert.ok(!refused.ok && refused.reason === "too_many");
      assert.ok(
        !refused.ok &&
          refused.reason === "too_many" &&
          refused.retryAfterSeconds > 0,
      );
      // The same account from another address signs in.
      const elsewhere = await signIn(
        db.pool,
        {
          identifier: account.email,
          password: "correct horse battery",
          address: "198.51.100.8",
        },
        { limiter, now },
      );
      assert.ok(elsewhere.ok);
    } finally {
      await db.drop();
    }
  },
);
