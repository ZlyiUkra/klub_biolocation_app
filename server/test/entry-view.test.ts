// The visibility function (T023 and T087 of specs/001-self-hosted-club-site). Needs the development database.
//
// T023 (migration 003) pinned deletion, a future date, `hidden` and `everyone`, and that anything it did not know
// failed closed. T087 (migration 016) replaced the interim answers for `members` and `restricted` on purpose: this file
// now pins the whole rule of data-model.md for the function itself, one cell at a time. The same rule across every
// surface is server/test/visibility-matrix.test.ts; this file is the function and its two edges (a missing status, and
// `lecture_view`, which asks it).

import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestDatabase, skipWithoutDatabase } from "./helpers/db.js";

const statuses = [
  "guest",
  "student",
  "expert",
  "master",
  "metr",
  "admin",
  "blocked",
] as const;

test(
  "entry_view decides deletion, a future date, hidden and everyone for every status",
  { skip: skipWithoutDatabase },
  async () => {
    const db = await createTestDatabase();
    try {
      const make = async (
        slug: string,
        audience: string,
        publishedAt = "2026-01-01T00:00:00Z",
        deleted = false,
      ): Promise<number> => {
        const r = await db.pool.query(
          `insert into entries (kind, slug, title, audience, published_at, deleted_at)
           values ('post', $1, 'T', $2, $3, ${deleted ? "now()" : "null"}) returning id`,
          [slug, audience, publishedAt],
        );
        return r.rows[0].id as number;
      };
      const view = async (
        id: number,
        status: string | null,
        viewerId: number | null = null,
      ): Promise<string> =>
        (
          await db.pool.query("select entry_view($1, $2, $3) as v", [
            viewerId,
            status,
            id,
          ])
        ).rows[0].v;

      const open = await make("open", "everyone");
      const future = await make(
        "future",
        "everyone",
        new Date(Date.now() + 36 * 3600 * 1000).toISOString(),
      );
      const removed = await make("removed", "everyone", undefined, true);
      const hidden = await make("hidden", "hidden");
      const unknown = await make("unknown", "everyone");
      // An audience the function does not know still fails closed: the check constraint keeps one out of the table, so
      // the row is made by dropping the constraint inside this throwaway database.
      await db.pool.query(
        "alter table entries drop constraint entries_audience_check",
      );
      await db.pool.query(
        "update entries set audience = 'somebody-new' where id = $1",
        [unknown],
      );

      for (const status of statuses) {
        const id = status === "guest" ? null : 7;
        assert.equal(
          await view(open, status, id),
          "full",
          `everyone / ${status}`,
        );
        assert.equal(
          await view(future, status, id),
          "none",
          `future / ${status}`,
        );
        assert.equal(
          await view(removed, status, id),
          "none",
          `deleted / ${status}`,
        );
        assert.equal(
          await view(hidden, status, id),
          "none",
          `hidden / ${status}`,
        );
        assert.equal(
          await view(unknown, status, id),
          "none",
          `an unknown audience fails closed / ${status}`,
        );
      }

      assert.equal(await view(999999, "admin", 1), "none", "no such entry");

      // When the date arrives, the same row is visible with no other change.
      await db.pool.query(
        "update entries set published_at = now() - interval '1 minute' where id = $1",
        [future],
      );
      assert.equal(await view(future, "guest"), "full");

      const meta = await db.pool.query(
        "select provolatile from pg_proc where proname = 'entry_view'",
      );
      assert.equal(meta.rows[0].provolatile, "s", "declared STABLE");
    } finally {
      await db.drop();
    }
  },
);

test(
  "entry_view: members is for any signed-in, non-blocked viewer; a blocked or signed-out one gets the teaser or nothing",
  { skip: skipWithoutDatabase },
  async () => {
    const db = await createTestDatabase();
    try {
      const make = async (slug: string, teaser: boolean): Promise<number> =>
        (
          await db.pool.query(
            `insert into entries (kind, slug, title, audience, teaser, published_at)
             values ('post', $1, 'T', 'members', $2, '2026-01-01T00:00:00Z') returning id`,
            [slug, teaser],
          )
        ).rows[0].id as number;
      const view = async (
        id: number,
        status: string | null,
        viewerId: number | null,
      ): Promise<string> =>
        (
          await db.pool.query("select entry_view($1, $2, $3) as v", [
            viewerId,
            status,
            id,
          ])
        ).rows[0].v;
      const plain = await make("members-plain", false);
      const teased = await make("members-teaser", true);

      for (const status of statuses) {
        const signedIn = status !== "guest";
        // `guest` here is the signed-out visitor (no id); a signed-in guest is checked below.
        const id = signedIn ? 7 : null;
        const full = signedIn && status !== "blocked";
        assert.equal(
          await view(plain, status, id),
          full ? "full" : "none",
          `members / ${status}`,
        );
        assert.equal(
          await view(teased, status, id),
          full ? "full" : "teaser",
          `members with a teaser / ${status}`,
        );
      }
      assert.equal(
        await view(plain, "guest", 7),
        "full",
        "a signed-in account with no status is a member for this rule",
      );
      assert.equal(
        await view(plain, null, 7),
        "full",
        "a missing status is read as guest, not as 'none'",
      );
    } finally {
      await db.drop();
    }
  },
);

test(
  "entry_view: restricted is for a listed status or a named person; a blocked account is a guest and a name does not help it",
  { skip: skipWithoutDatabase },
  async () => {
    const db = await createTestDatabase();
    try {
      const make = async (
        slug: string,
        teaser: boolean,
        listed: string[],
        named: number[],
      ): Promise<number> => {
        const id = (
          await db.pool.query(
            `insert into entries (kind, slug, title, audience, teaser, published_at)
             values ('post', $1, 'T', 'restricted', $2, '2026-01-01T00:00:00Z') returning id`,
            [slug, teaser],
          )
        ).rows[0].id as number;
        for (const status of listed) {
          await db.pool.query(
            "insert into entry_audience_statuses (entry_id, status) values ($1, $2)",
            [id, status],
          );
        }
        for (const user of named) {
          await db.pool.query(
            "insert into entry_audience_users (entry_id, user_id) values ($1, $2)",
            [id, user],
          );
        }
        return id;
      };
      const view = async (
        id: number,
        status: string,
        viewerId: number | null,
      ): Promise<string> =>
        (
          await db.pool.query("select entry_view($1, $2, $3) as v", [
            viewerId,
            status,
            id,
          ])
        ).rows[0].v;

      const person = async (email: string): Promise<number> =>
        (
          await db.pool.query(
            "insert into users (email, display_name, status) values ($1, $1, 'guest') returning id",
            [email],
          )
        ).rows[0].id as number;
      const named42 = await person("named@example.test");
      const named43 = await person("named-blocked@example.test");
      const byStatus = await make(
        "by-status",
        false,
        ["student", "master"],
        [],
      );
      const byName = await make("by-name", true, [], [named42]);
      const guestList = await make("guest-list", false, ["guest"], []);
      const blockedList = await make("blocked-list", false, ["blocked"], []);
      const namedBlocked = await make("named-blocked", true, [], [named43]);

      assert.equal(await view(byStatus, "student", 7), "full");
      assert.equal(await view(byStatus, "master", 7), "full");
      assert.equal(await view(byStatus, "expert", 7), "none", "not listed");
      assert.equal(
        await view(byStatus, "admin", 7),
        "none",
        "an editor is not let in by status alone",
      );
      assert.equal(await view(byStatus, "guest", null), "none");
      assert.equal(await view(byStatus, "blocked", 7), "none");

      assert.equal(
        await view(byName, "guest", named42),
        "full",
        "named, whatever the status",
      );
      assert.equal(await view(byName, "student", named42), "full");
      assert.equal(
        await view(byName, "student", 7),
        "teaser",
        "somebody else, the flag is set",
      );
      assert.equal(await view(byName, "guest", null), "teaser");

      assert.equal(
        await view(guestList, "guest", null),
        "full",
        "a list that names `guest` is open to a visitor with no session",
      );
      assert.equal(await view(guestList, "guest", 7), "full");
      assert.equal(
        await view(guestList, "blocked", 7),
        "full",
        "a blocked account is a guest, so the guest list lets it in",
      );
      assert.equal(await view(guestList, "student", 7), "none");

      assert.equal(
        await view(blockedList, "blocked", 7),
        "none",
        "the status `blocked` listed on an entry never matches: a blocked account counts as a guest",
      );
      assert.equal(
        await view(namedBlocked, "blocked", named43),
        "teaser",
        "a blocked account is not let in by name",
      );
      assert.equal(await view(namedBlocked, "guest", named43), "full");
    } finally {
      await db.drop();
    }
  },
);

test(
  "lecture_view answers none unless the viewer sees the entry in full, and passes the account's own status to entry_view",
  { skip: skipWithoutDatabase },
  async () => {
    const db = await createTestDatabase();
    try {
      const account = async (
        email: string,
        status: string,
        until: string | null,
      ): Promise<number> =>
        (
          await db.pool.query(
            `insert into users (email, display_name, status, access_until, blocked_at)
             values ($1, $1, $2, $3::date, case when $2 = 'blocked' then now() end) returning id`,
            [email, status, until],
          )
        ).rows[0].id as number;
      const student = await account("s@example.test", "student", "2999-01-01");
      const guest = await account("g@example.test", "guest", null);
      const named = await account("n@example.test", "guest", null);
      const blocked = await account("b@example.test", "blocked", "2999-01-01");

      const lecture = async (
        slug: string,
        audience: string,
        teaser: boolean,
      ): Promise<number> => {
        await db.pool.query(
          `select store_video($1, $1, 'd', false, '2026-01-01T00:00:00Z'::timestamptz, false, 'text', '<p>text</p>',
                              '[]'::jsonb, null, null, 'youtube', 'abc123def45', false, null, '{}', '{}', 1, null::date)`,
          [slug],
        );
        const id = (
          await db.pool.query(
            "select id from entries where kind = 'video' and slug = $1",
            [slug],
          )
        ).rows[0].id as number;
        await db.pool.query(
          "update entries set audience = $1, teaser = $2 where id = $3",
          [audience, teaser, id],
        );
        return id;
      };
      const lectureOf = async (
        who: number | null,
        id: number,
      ): Promise<string> =>
        (await db.pool.query("select lecture_view($1, $2) as v", [who, id]))
          .rows[0].v;

      const members = await lecture("lec-members", "members", true);
      const restricted = await lecture("lec-restricted", "restricted", true);
      await db.pool.query(
        "insert into entry_audience_users (entry_id, user_id) values ($1, $2)",
        [restricted, named],
      );

      // A free video, members audience: open for a signed-in account of any non-blocked status, `none` for the rest
      // (a teaser viewer sees the card and cannot play it).
      assert.equal(await lectureOf(student, members), "open");
      assert.equal(await lectureOf(guest, members), "open");
      assert.equal(await lectureOf(blocked, members), "none");
      assert.equal(await lectureOf(null, members), "none");
      assert.equal(await lectureOf(named, restricted), "open");
      assert.equal(await lectureOf(student, restricted), "none");
    } finally {
      await db.drop();
    }
  },
);
