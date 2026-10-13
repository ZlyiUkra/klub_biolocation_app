// Sessions (T043 of specs/001-self-hosted-club-site; research.md section 5, data-model "sessions"). Written before the
// module (T048) and the tables (T046). The cases that touch the database need the throwaway database of the other
// tests and the `users` and `sessions` tables of migration 012. T048 wrote the module and removed the `todo` flags.
//
// Specified here:
// - the id is 256 random bits, never repeated, and only its SHA-256 is stored (a read of the table cannot be replayed);
// - the cookie is `__Host-`, Secure, HttpOnly, SameSite=Lax, Path=/ and has no Domain (OWASP Session Management
//   Cheat Sheet; MDN, Set-Cookie);
// - each account tier has two clocks (src/lib/session-lifetimes.ts): the idle one is pushed forward by use and never
//   past the absolute one, which never moves;
// - a session is renewed - a new id, the old one dead - on sign-in and when the account's rights or password change,
//   and a change of rights ends every other session of that account;
// - ending a session, or blocking its account, makes the id useless at once.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import type { Pool } from "../src/db/pool.js";
import {
  addressPrefixOf,
  buildSessionCookie,
  clearSessionCookie,
  createSession,
  endOtherSessions,
  deleteExpiredSessions,
  endSession,
  generateSessionId,
  hashSessionId,
  listSessions,
  readSessionCookie,
  renewSession,
  resolveSession,
  sessionCookieName,
} from "../src/auth/session.js";
import {
  lifetimeOf,
  sessionLifetimes,
  tierOf,
} from "../../src/lib/session-lifetimes.js";
import { createTestDatabase, skipWithoutDatabase } from "./helpers/db.js";

const minute = 60 * 1000;
const hour = 60 * minute;
const day = 24 * hour;

let counter = 0;
async function insertAccount(pool: Pool, status = "guest"): Promise<number> {
  counter += 1;
  const result = await pool.query(
    `insert into users (email, status) values ($1, $2) returning id`,
    [`member${counter}@example.test`, status],
  );
  return result.rows[0].id;
}

test("the lifetimes are the owner's variant A, by tier, and the superuser flag outranks the status", () => {
  // These numbers are the constants of src/lib/session-lifetimes.ts, which also feeds src/config.ts; the test pins the
  // owner's decision of 2026-10-10 so that a change of them is a visible edit of a test and not a silent one.
  assert.equal(sessionLifetimes.member.idleMs, 14 * day);
  assert.equal(sessionLifetimes.member.absoluteMs, 60 * day);
  assert.equal(sessionLifetimes.editor.idleMs, 8 * hour);
  assert.equal(sessionLifetimes.editor.absoluteMs, 7 * day);
  assert.equal(sessionLifetimes.superuser.idleMs, 1 * hour);
  assert.equal(sessionLifetimes.superuser.absoluteMs, 12 * hour);

  for (const status of ["guest", "student", "expert", "master"] as const) {
    assert.equal(tierOf(status, false), "member", status);
  }
  for (const status of ["metr", "admin", "blocked"] as const) {
    assert.equal(tierOf(status, false), "editor", status);
  }
  assert.equal(tierOf("student", true), "superuser");
  assert.equal(tierOf("admin", true), "superuser");
  // The idle clock is never longer than the absolute one in any tier, or it could not matter.
  for (const lifetime of Object.values(sessionLifetimes)) {
    assert.ok(lifetime.idleMs < lifetime.absoluteMs);
  }
  assert.deepEqual(lifetimeOf("metr"), sessionLifetimes.editor);
});

test("an id is 256 random bits, never repeats, and only its SHA-256 is the stored value", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 500; i++) {
    const { id, hash } = generateSessionId();
    // 32 bytes in URL safe base64 without padding are 43 characters.
    assert.match(id, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(hash.length, 32);
    assert.deepEqual(hash, createHash("sha256").update(id).digest());
    assert.deepEqual(hashSessionId(id), hash);
    assert.ok(!seen.has(id), "an id is never reused");
    seen.add(id);
  }
});

test("the cookie is __Host-, Secure, HttpOnly, SameSite=Lax, Path=/ and has no Domain", () => {
  assert.ok(sessionCookieName.startsWith("__Host-"));
  const header = buildSessionCookie("abc", 3600);
  const parts = header.split(";").map((part) => part.trim());
  assert.equal(parts[0], `${sessionCookieName}=abc`);
  for (const wanted of [
    "Secure",
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=3600",
  ]) {
    assert.ok(parts.includes(wanted), `${wanted} is present`);
  }
  assert.ok(
    !parts.some((part) => part.toLowerCase().startsWith("domain")),
    "no Domain: a __Host- cookie must not have one",
  );
  const cleared = clearSessionCookie();
  assert.match(cleared, /Max-Age=0/);
  assert.ok(cleared.startsWith(`${sessionCookieName}=;`));
});

test("the session id is read from the Cookie header only under our own name", () => {
  assert.equal(
    readSessionCookie(`theme=dark; ${sessionCookieName}=abc123; other=1`),
    "abc123",
  );
  assert.equal(readSessionCookie("theme=dark"), null);
  assert.equal(readSessionCookie(undefined), null);
  assert.equal(readSessionCookie(""), null);
  // The same value under a name without the prefix is not ours: a subdomain could have set that one.
  assert.equal(readSessionCookie("session=abc123"), null);
  assert.equal(readSessionCookie(`${sessionCookieName}=`), null);
});

test(
  "a session stores the hash and never the id, with both clocks from the account's tier",
  { skip: skipWithoutDatabase },
  async () => {
    const db = await createTestDatabase();
    try {
      const now = new Date("2026-10-11T10:00:00Z");
      const student = await insertAccount(db.pool, "student");
      const metr = await insertAccount(db.pool, "metr");

      const a = await createSession(
        db.pool,
        {
          userId: student,
          status: "student",
          userAgent: "Edge",
          address: "203.0.113.77",
        },
        now,
      );
      assert.equal(
        a.session.idleExpiresAt.getTime(),
        now.getTime() + sessionLifetimes.member.idleMs,
      );
      assert.equal(
        a.session.absoluteExpiresAt.getTime(),
        now.getTime() + sessionLifetimes.member.absoluteMs,
      );
      // The stored row holds the hash, and nowhere the id nor the full address.
      const rows = await db.pool.query("select * from sessions");
      assert.equal(rows.rowCount, 1);
      const dump = JSON.stringify(rows.rows);
      assert.ok(!dump.includes(a.id), "the id is not stored");
      assert.ok(
        !dump.includes("203.0.113.77"),
        "the full address is not stored",
      );

      const b = await createSession(
        db.pool,
        { userId: metr, status: "metr" },
        now,
      );
      assert.equal(
        b.session.absoluteExpiresAt.getTime(),
        now.getTime() + sessionLifetimes.editor.absoluteMs,
      );
      const root = await createSession(
        db.pool,
        { userId: metr, status: "metr", superuser: true },
        now,
      );
      assert.equal(
        root.session.idleExpiresAt.getTime(),
        now.getTime() + sessionLifetimes.superuser.idleMs,
      );
    } finally {
      await db.drop();
    }
  },
);

test(
  "use pushes the idle clock forward but never past the absolute one; either clock ending makes the id useless",
  { skip: skipWithoutDatabase },
  async () => {
    const db = await createTestDatabase();
    try {
      const t0 = new Date("2026-10-11T10:00:00Z");
      const user = await insertAccount(db.pool, "metr");
      const { id } = await createSession(
        db.pool,
        { userId: user, status: "metr" },
        t0,
      );
      const idle = sessionLifetimes.editor.idleMs;
      const absolute = sessionLifetimes.editor.absoluteMs;

      // Used 6 hours later: still alive (idle is 8 hours) and the idle clock moved.
      const t1 = new Date(t0.getTime() + 6 * hour);
      const used = await resolveSession(db.pool, id, t1);
      assert.ok(used);
      assert.equal(used.idleExpiresAt.getTime(), t1.getTime() + idle);

      // Not used for longer than the idle clock: gone.
      const t2 = new Date(t1.getTime() + idle + minute);
      assert.equal(await resolveSession(db.pool, id, t2), null);

      // A busy session: used every 7 hours, it still dies at the absolute clock and the idle clock never passes it.
      const busy = await createSession(
        db.pool,
        { userId: user, status: "metr" },
        t0,
      );
      let at = t0.getTime();
      let last: Awaited<ReturnType<typeof resolveSession>> = null;
      while (at + 7 * hour < t0.getTime() + absolute) {
        at += 7 * hour;
        last = await resolveSession(db.pool, busy.id, new Date(at));
        assert.ok(last, "used in time, so alive");
        assert.ok(last.idleExpiresAt.getTime() <= t0.getTime() + absolute);
      }
      const afterAbsolute = new Date(t0.getTime() + absolute + minute);
      assert.equal(await resolveSession(db.pool, busy.id, afterAbsolute), null);
    } finally {
      await db.drop();
    }
  },
);

test(
  "renewal gives a new id and kills the old one; a change of rights ends every other session",
  { skip: skipWithoutDatabase },
  async () => {
    const db = await createTestDatabase();
    try {
      const now = new Date("2026-10-11T10:00:00Z");
      const user = await insertAccount(db.pool, "student");
      const phone = await createSession(
        db.pool,
        { userId: user, status: "student" },
        now,
      );
      const laptop = await createSession(
        db.pool,
        { userId: user, status: "student" },
        now,
      );
      const other = await insertAccount(db.pool, "student");
      const strangers = await createSession(
        db.pool,
        { userId: other, status: "student" },
        now,
      );

      // The account was promoted: the session that did it is renewed under the new rights, the rest end.
      const renewed = await renewSession(
        db.pool,
        laptop.id,
        { userId: user, status: "master" },
        now,
      );
      assert.notEqual(renewed.id, laptop.id, "a new id: no fixation");
      assert.equal(
        await resolveSession(db.pool, laptop.id, now),
        null,
        "the old id is dead",
      );
      assert.ok(await resolveSession(db.pool, renewed.id, now));
      assert.equal(await endOtherSessions(db.pool, user, renewed.id), 1);
      assert.equal(await resolveSession(db.pool, phone.id, now), null);
      // Another account is never touched.
      assert.ok(await resolveSession(db.pool, strangers.id, now));
      assert.equal((await listSessions(db.pool, user, now)).length, 1);
    } finally {
      await db.drop();
    }
  },
);

test(
  "ending a session, ending all, and blocking an account make the ids useless at once",
  { skip: skipWithoutDatabase },
  async () => {
    const db = await createTestDatabase();
    try {
      const now = new Date("2026-10-11T10:00:00Z");
      const user = await insertAccount(db.pool, "expert");
      const a = await createSession(
        db.pool,
        { userId: user, status: "expert" },
        now,
      );
      const b = await createSession(
        db.pool,
        { userId: user, status: "expert" },
        now,
      );
      assert.equal(await endSession(db.pool, a.id), true);
      assert.equal(
        await endSession(db.pool, a.id),
        false,
        "a second end finds nothing",
      );
      assert.equal(await resolveSession(db.pool, a.id, now), null);
      assert.ok(await resolveSession(db.pool, b.id, now));

      // Blocking an account ends all its sessions: no keep-list.
      assert.equal(await endOtherSessions(db.pool, user), 1);
      assert.equal(await resolveSession(db.pool, b.id, now), null);
      assert.deepEqual(await listSessions(db.pool, user, now), []);

      // An id that was never issued, or that is empty, is simply no session.
      assert.equal(await resolveSession(db.pool, "", now), null);
      assert.equal(await resolveSession(db.pool, "not-an-id", now), null);
    } finally {
      await db.drop();
    }
  },
);

test(
  "a limited account gets a limited session, and the flag is carried in the record",
  { skip: skipWithoutDatabase },
  async () => {
    const db = await createTestDatabase();
    try {
      const user = await insertAccount(db.pool, "guest");
      const { id, session } = await createSession(
        db.pool,
        { userId: user, status: "guest", limited: true },
        new Date("2026-10-11T10:00:00Z"),
      );
      assert.equal(session.limited, true);
      assert.equal((await resolveSession(db.pool, id))?.limited, true);
    } finally {
      await db.drop();
    }
  },
);

test("only a prefix of the address is kept, for both families and for the mapped form", () => {
  // Added with T048: the stored value must identify a place, never a person.
  assert.equal(addressPrefixOf("203.0.113.77"), "203.0.113");
  assert.equal(addressPrefixOf("::ffff:203.0.113.77"), "203.0.113");
  assert.equal(addressPrefixOf("2001:DB8:1:2:3:4:5:6"), "2001:db8:1:2");
  // A compressed spelling gives the same groups as the full one.
  assert.equal(addressPrefixOf("2001:db8::1"), "2001:db8:0:0");
  assert.equal(addressPrefixOf("::1"), "0:0:0:0");
  assert.equal(addressPrefixOf("not an address"), "");
  assert.equal(addressPrefixOf(undefined), "");
});

test(
  "a use within the minute does not write, a later one does, and an expired session is swept",
  { skip: skipWithoutDatabase },
  async () => {
    const db = await createTestDatabase();
    try {
      const t0 = new Date("2026-10-11T10:00:00Z");
      const user = await insertAccount(db.pool, "student");
      const { id } = await createSession(
        db.pool,
        { userId: user, status: "student" },
        t0,
      );
      const soon = await resolveSession(
        db.pool,
        id,
        new Date(t0.getTime() + 30_000),
      );
      assert.ok(soon);
      assert.equal(
        soon.idleExpiresAt.getTime(),
        t0.getTime() + sessionLifetimes.member.idleMs,
        "the idle clock did not move inside the minute",
      );
      const later = await resolveSession(
        db.pool,
        id,
        new Date(t0.getTime() + 2 * minute),
      );
      assert.ok(later);
      assert.equal(
        later.idleExpiresAt.getTime(),
        t0.getTime() + 2 * minute + sessionLifetimes.member.idleMs,
      );

      // After the absolute clock the row is still there until the sweep, and the sweep takes it.
      const end = new Date(
        t0.getTime() + sessionLifetimes.member.absoluteMs + minute,
      );
      assert.equal(await resolveSession(db.pool, id, end), null);
      assert.equal(await deleteExpiredSessions(db.pool, end), 1);
      assert.equal(await deleteExpiredSessions(db.pool, end), 0);
    } finally {
      await db.drop();
    }
  },
);
