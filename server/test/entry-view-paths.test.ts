// The two ways to ask the visibility rule give one answer (T091 of specs/001-self-hosted-club-site; migration 018).
// Needs the development database.
//
// `entry_view(viewer, status, entry)` fetches an entry by id; the list queries of the access module ask the same rule
// from the row's own columns (`viewOfEntry`, which calls `entry_view_of`). They must never disagree: this file compares
// them for every audience, with and without a teaser, deleted, dated in the future and plain, for a signed-out visitor
// and for an account of every status, listed or not, named or not.

import assert from "node:assert/strict";
import { test } from "node:test";
import { viewOfEntry } from "../src/access/entries.js";
import { createTestDatabase, skipWithoutDatabase } from "./helpers/db.js";

const opts = skipWithoutDatabase ? { skip: skipWithoutDatabase } : {};

test(
  "entry_view by id and the by-columns form agree for every entry and every viewer",
  opts,
  async () => {
    const db = await createTestDatabase();
    try {
      const person = async (email: string): Promise<number> =>
        Number(
          (
            await db.pool.query(
              "insert into users (email, display_name, status) values ($1, $1, 'guest') returning id",
              [email],
            )
          ).rows[0].id,
        );
      const named = await person("named@example.test");
      const other = await person("other@example.test");

      let n = 0;
      for (const audience of ["everyone", "members", "restricted", "hidden"]) {
        for (const teaser of [false, true]) {
          for (const state of ["plain", "deleted", "future"]) {
            n += 1;
            const row = await db.pool.query(
              `insert into entries (kind, slug, title, audience, teaser, published_at, deleted_at)
               values ('post', $1, 'T', $2, $3,
                       case when $4 = 'future' then now() + interval '1 day' else '2026-01-01T00:00:00Z'::timestamptz end,
                       case when $4 = 'deleted' then now() end) returning id`,
              [`e${n}`, audience, teaser, state],
            );
            const id = Number(row.rows[0].id);
            if (audience === "restricted") {
              for (const status of ["student", "blocked"]) {
                await db.pool.query(
                  "insert into entry_audience_statuses (entry_id, status) values ($1, $2)",
                  [id, status],
                );
              }
              await db.pool.query(
                "insert into entry_audience_users (entry_id, user_id) values ($1, $2)",
                [id, named],
              );
            }
          }
        }
      }

      const viewers: [number | null, string | null][] = [
        [null, "guest"],
        [null, null],
        ...[
          "guest",
          "student",
          "expert",
          "master",
          "metr",
          "admin",
          "blocked",
        ].flatMap((status): [number | null, string | null][] => [
          [other, status],
          [named, status],
        ]),
      ];
      let compared = 0;
      for (const [viewerId, status] of viewers) {
        const rows = await db.pool.query(
          `select e.slug,
                  entry_view($1::bigint, $2::text, e.id) as by_id,
                  ${viewOfEntry} as by_columns
             from entries e order by e.id`,
          [viewerId, status],
        );
        assert.equal(rows.rows.length, n);
        for (const row of rows.rows) {
          assert.equal(
            row.by_columns,
            row.by_id,
            `${row.slug} for viewer ${String(viewerId)} / ${String(status)}`,
          );
          compared += 1;
        }
      }
      assert.ok(
        compared === n * viewers.length,
        "every entry was compared for every viewer",
      );

      const index = await db.pool.query(
        "select 1 from pg_indexes where indexname = 'entries_kind_published_idx'",
      );
      assert.equal(index.rowCount, 1, "the index of the neighbour lookups");
    } finally {
      await db.drop();
    }
  },
);
