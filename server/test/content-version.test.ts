// The content version (T089 of specs/001-self-hosted-club-site; migration 017). Needs the development database.
//
// What the caches of the guest answers key on must move on every write that can change what a guest sees, and must not
// move on a read. The last two cases are the reason the counter exists: a change of an entry's audience tables and the
// guests' cached terms, which the version derived from `entries.updated_at` (until 2026-10-12) did not notice.

import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { contentVersion } from "../src/access/entries.js";
import { createApp } from "../src/http/app.js";
import { createTestDatabase, skipWithoutDatabase } from "./helpers/db.js";

const opts = skipWithoutDatabase ? { skip: skipWithoutDatabase } : {};

const post = (slug: string, body: string) =>
  `select store_post('${slug}', 'T ${slug}', 'd', false, '2026-01-01T00:00:00Z'::timestamptz, null, null, null,
                     '${body}', '<p>${body}</p>', '[]'::jsonb, '${body}', 's', array['tag-${slug}']::text[],
                     array['cat-${slug}']::text[], 1)`;

test(
  "the version moves on every kind of write and stands still on a read and on a save that changes nothing",
  opts,
  async () => {
    const db = await createTestDatabase();
    try {
      const seen = new Set<string>();
      const moved = async (what: string, write: () => Promise<unknown>) => {
        const before = await contentVersion(db.pool);
        await write();
        const after = await contentVersion(db.pool);
        assert.notEqual(after, before, `${what} moves the version`);
        assert.equal(
          seen.has(after),
          false,
          `${what}: a version is never reused`,
        );
        seen.add(after);
        return after;
      };
      const stays = async (what: string, act: () => Promise<unknown>) => {
        const before = await contentVersion(db.pool);
        await act();
        assert.equal(
          await contentVersion(db.pool),
          before,
          `${what} leaves it`,
        );
      };

      await moved("a new post", () => db.pool.query(post("a", "one")));
      await stays("a read", () =>
        db.pool.query("select * from entries where slug = 'a'"),
      );
      await stays("a save of the same text", () =>
        db.pool.query(post("a", "one")),
      );
      await moved("a changed body", () => db.pool.query(post("a", "two")));
      const id = Number(
        (await db.pool.query("select id from entries where slug = 'a'")).rows[0]
          .id,
      );
      await moved("an audience", () =>
        db.pool.query(
          "update entries set audience = 'restricted' where id = $1",
          [id],
        ),
      );
      await moved("a teaser flag", () =>
        db.pool.query("update entries set teaser = true where id = $1", [id]),
      );
      await moved("a status added to the audience", () =>
        db.pool.query(
          "insert into entry_audience_statuses (entry_id, status) values ($1, 'guest')",
          [id],
        ),
      );
      const user = Number(
        (
          await db.pool.query(
            "insert into users (email, display_name, status) values ('p@example.test', 'p', 'guest') returning id",
          )
        ).rows[0].id,
      );
      await moved("a person added to the audience", () =>
        db.pool.query(
          "insert into entry_audience_users (entry_id, user_id) values ($1, $2)",
          [id, user],
        ),
      );
      await moved("a person removed", () =>
        db.pool.query("delete from entry_audience_users where entry_id = $1", [
          id,
        ]),
      );
      await moved("a status removed", () =>
        db.pool.query(
          "delete from entry_audience_statuses where entry_id = $1",
          [id],
        ),
      );
      await moved("a soft delete", () =>
        db.pool.query("update entries set deleted_at = now() where id = $1", [
          id,
        ]),
      );
      await stays("a write to accounts", () =>
        db.pool.query("update users set display_name = 'q' where id = $1", [
          user,
        ]),
      );
    } finally {
      await db.drop();
    }
  },
);

test(
  "an entry whose date arrives changes the version with no write",
  opts,
  async () => {
    const db = await createTestDatabase();
    try {
      await db.pool.query(
        `insert into entries (kind, slug, title, audience, published_at)
         values ('post', 'later', 'T', 'everyone', now() + interval '2 seconds')`,
      );
      const before = await contentVersion(db.pool);
      // Waited for on the database's own clock: the container's clock and this process's need not agree to the second.
      await db.pool.query("select pg_sleep(3)");
      assert.notEqual(await contentVersion(db.pool), before);
    } finally {
      await db.drop();
    }
  },
);

test(
  "a guest's cached terms follow a change of an entry's audience tables at once",
  opts,
  async () => {
    const db = await createTestDatabase();
    const server = createApp({
      pool: db.pool,
      siteOrigin: "http://localhost:4321",
    }).listen(0);
    try {
      await once(server, "listening");
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      await db.pool.query(post("secret", "text"));
      await db.pool.query(
        "update entries set audience = 'restricted' where slug = 'secret'",
      );
      const id = Number(
        (await db.pool.query("select id from entries where slug = 'secret'"))
          .rows[0].id,
      );
      const terms = async (): Promise<string[]> =>
        (
          (await (await fetch(`${base}/api/terms`)).json()) as {
            terms: { name: string }[];
          }
        ).terms.map((t) => t.name);

      assert.deepEqual(
        await terms(),
        [],
        "nobody is listed: a guest sees nothing",
      );
      await db.pool.query(
        "insert into entry_audience_statuses (entry_id, status) values ($1, 'guest')",
        [id],
      );
      assert.ok(
        (await terms()).includes("tag-secret"),
        "the list now names guest: the cached answer was rebuilt",
      );
      await db.pool.query(
        "delete from entry_audience_statuses where entry_id = $1",
        [id],
      );
      assert.deepEqual(await terms(), [], "and it is gone again at once");
    } finally {
      server.close();
      await db.drop();
    }
  },
);
