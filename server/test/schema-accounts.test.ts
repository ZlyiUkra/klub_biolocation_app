// The accounts schema of migration 012 (T046 of specs/001-self-hosted-club-site; data-model "Accounts"). Needs the
// development database. It does not test the modules that will use the tables (T047 to T056, whose tests are the
// `todo` cases of password, session, signin) but the promises the migration itself makes: case-insensitive unique
// address and login, a login that can never be read as an address, the status list, a session whose idle clock is never
// past its absolute one, accounts and sessions that a stray DELETE cannot take with them, and an audit log that
// nothing can change.

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createTestDatabase,
  skipWithoutDatabase,
  type TestDatabase,
} from "./helpers/db.js";

async function rejects(
  db: TestDatabase,
  sql: string,
  params: unknown[],
  pattern: RegExp,
  label: string,
): Promise<void> {
  await assert.rejects(db.pool.query(sql, params), pattern, label);
}

test(
  "an address is unique whatever its case, and a login is lower-case, 3 to 32 characters and has no @",
  { skip: skipWithoutDatabase },
  async () => {
    const db = await createTestDatabase();
    try {
      await db.pool.query(
        "insert into users (email, login) values ('Ann@Example.Test', 'ann.d')",
      );
      await rejects(
        db,
        "insert into users (email) values ('ANN@example.test')",
        [],
        /users_email_lower/,
        "the same address in another case",
      );
      await rejects(
        db,
        "insert into users (email, login) values ('b@example.test', 'ann.d')",
        [],
        /users_login_lower/,
        "the same login",
      );
      for (const login of [
        "Ab.c",
        "ab",
        "a@b.c",
        "x".repeat(33),
        "with space",
      ]) {
        await rejects(
          db,
          "insert into users (email, login) values ($1, $2)",
          [`${Math.random()}@example.test`, login],
          /users_login_shape/,
          `login ${login}`,
        );
      }
      for (const email of [
        "",
        "no-at-sign",
        "a@b@c",
        "two words@example.test",
      ]) {
        await rejects(
          db,
          "insert into users (email) values ($1)",
          [email],
          /users_email_shape/,
          `email ${email}`,
        );
      }
      // A new account is a guest, with no password and not a superuser.
      const row = await db.pool.query(
        "select status, password_hash, is_superuser, failed_count from users",
      );
      assert.deepEqual(row.rows[0], {
        status: "guest",
        password_hash: null,
        is_superuser: false,
        failed_count: 0,
      });
    } finally {
      await db.drop();
    }
  },
);

test(
  "the status is one of the seven, a blocked account says when, and a temporary password needs a password",
  { skip: skipWithoutDatabase },
  async () => {
    const db = await createTestDatabase();
    try {
      await rejects(
        db,
        "insert into users (email, status) values ('a@example.test', 'superman')",
        [],
        /users_status_check/,
        "an unknown status",
      );
      await rejects(
        db,
        "insert into users (email, status) values ('a@example.test', 'blocked')",
        [],
        /users_blocked_pair/,
        "blocked without a time",
      );
      await rejects(
        db,
        "insert into users (email, blocked_at) values ('a@example.test', now())",
        [],
        /users_blocked_pair/,
        "a time without being blocked",
      );
      await db.pool.query(
        "insert into users (email, status, blocked_at) values ('b@example.test', 'blocked', now())",
      );
      await rejects(
        db,
        "insert into users (email, must_change) values ('c@example.test', true)",
        [],
        /users_must_change_has_password/,
        "a temporary password with no password",
      );
    } finally {
      await db.drop();
    }
  },
);

test(
  "a session keeps a 32-byte hash, an idle clock not past the absolute one, and cannot lose its account to a DELETE",
  { skip: skipWithoutDatabase },
  async () => {
    const db = await createTestDatabase();
    try {
      const user = (
        await db.pool.query(
          "insert into users (email) values ('s@example.test') returning id",
        )
      ).rows[0].id;
      const insert = (hash: Buffer, idle: string, absolute: string) =>
        db.pool.query(
          `insert into sessions (id_hash, user_id, created_at, idle_expires_at, absolute_expires_at)
           values ($1, $2, '2026-10-11T10:00:00Z', $3, $4)`,
          [hash, user, idle, absolute],
        );
      await insert(
        Buffer.alloc(32, 1),
        "2026-10-12T10:00:00Z",
        "2026-12-11T10:00:00Z",
      );
      await assert.rejects(
        insert(
          Buffer.alloc(31, 2),
          "2026-10-12T10:00:00Z",
          "2026-12-11T10:00:00Z",
        ),
        /sessions_id_hash_check|check constraint/,
        "a hash of the wrong length",
      );
      await assert.rejects(
        insert(
          Buffer.alloc(32, 3),
          "2026-12-12T10:00:00Z",
          "2026-12-11T10:00:00Z",
        ),
        /sessions_clocks_ordered/,
        "idle past absolute",
      );
      // Changed 2026-11-02: the error's code and constraint instead of its text. A server installed in another language
      // words the message in that language, so the old pattern /foreign key|violates/ failed on the right error.
      await assert.rejects(
        db.pool.query("delete from users where id = $1", [user]),
        { code: "23503", constraint: "sessions_user_id_fkey" },
        "an account with a session is not deleted by a stray DELETE",
      );
    } finally {
      await db.drop();
    }
  },
);

test(
  "the audit log takes rows and refuses to change, delete or truncate them, for the application and the owner alike",
  { skip: skipWithoutDatabase },
  async () => {
    const db = await createTestDatabase();
    try {
      await db.pool.query(
        `insert into audit_log (action, target_kind, target_id, detail)
         values ('status_changed', 'account', 1, '{"from":"guest","to":"student"}')`,
      );
      await rejects(
        db,
        "update audit_log set action = 'x'",
        [],
        /append-only/,
        "update",
      );
      await rejects(db, "delete from audit_log", [], /append-only/, "delete");
      await rejects(db, "truncate audit_log", [], /append-only/, "truncate");
      await rejects(
        db,
        "insert into audit_log (action, target_kind) values ('', 'account')",
        [],
        /audit_log_action_check|check constraint/,
        "an empty action",
      );
      const count = await db.pool.query(
        "select count(*)::int as n from audit_log",
      );
      assert.equal(count.rows[0].n, 1);
    } finally {
      await db.drop();
    }
  },
);

test(
  "the two columns of migration 002 now point at accounts, and the old data satisfies them",
  { skip: skipWithoutDatabase },
  async () => {
    const db = await createTestDatabase();
    try {
      await rejects(
        db,
        `insert into entries (kind, slug, title, created_by) values ('post', 'x', 'X', 999)`,
        [],
        /entries_created_by_fkey/,
        "an entry made by no account",
      );
      const user = (
        await db.pool.query(
          "insert into users (email) values ('e@example.test') returning id",
        )
      ).rows[0].id;
      await db.pool.query(
        `insert into entries (kind, slug, title, created_by) values ('post', 'x', 'X', $1)`,
        [user],
      );
      // The attempts table takes the three kinds of key and nothing else.
      await db.pool.query(
        "insert into login_attempts (kind, key) values ('account', '1'), ('identifier', 'abc'), ('address', '203.0.113')",
      );
      await rejects(
        db,
        "insert into login_attempts (kind, key) values ('cookie', 'x')",
        [],
        /login_attempts_kind_check/,
        "another kind",
      );
    } finally {
      await db.drop();
    }
  },
);
