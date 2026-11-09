// The rows of the visit counter (T190 of specs/001-self-hosted-club-site; migration 024; tests: server/test/views.test.ts).
// server/src/views/routes.ts reads the request and decides whether a load counts; this file only reads and raises the
// two numbers.
//
// Decisions that would otherwise look like mistakes:
// - A count is a PostgreSQL `bigint`, and node-postgres returns `int8` as a string by default, because JavaScript cannot
//   hold every 64-bit integer (pg-types README, "use"); so every number leaves this file through `Number(...)`. A site
//   would need more than 9 quadrillion loads before that loses a digit.
// - A raise is one statement that also returns the new value, so the answer a page prints is the number that was
//   stored by that very statement and not a second read that another load may already have moved.
// - The site row exists from migration 024. A missing row is a database that was not migrated, so it throws (a 500)
//   instead of printing a made-up zero.

import type { Pool } from "../db/pool.js";

type ViewsRow = { views: string | number };

function numberOf(row: ViewsRow | undefined): number {
  if (row === undefined)
    throw new Error("site_views has no row: run npm run db:migrate");
  return Number(row.views);
}

/** Raises the site's total by one and returns the new total. */
export async function recordSiteView(pool: Pool): Promise<number> {
  const result = await pool.query<ViewsRow>(
    "update site_views set views = views + 1 where id returning views",
  );
  return numberOf(result.rows[0]);
}

/** The site's total, without raising it. */
export async function readSiteViews(pool: Pool): Promise<number> {
  const result = await pool.query<ViewsRow>(
    "select views from site_views where id",
  );
  return numberOf(result.rows[0]);
}

/** Raises one entry's count by one (the row is made by its first load) and returns the new count. */
export async function recordEntryView(
  pool: Pool,
  entryId: number,
): Promise<number> {
  const result = await pool.query<ViewsRow>(
    `insert into entry_views (entry_id, views) values ($1, 1)
     on conflict (entry_id) do update set views = entry_views.views + 1
     returning views`,
    [entryId],
  );
  return numberOf(result.rows[0]);
}

/** One entry's count, without raising it; zero for an entry that has not been loaded yet. */
export async function readEntryViews(
  pool: Pool,
  entryId: number,
): Promise<number> {
  const result = await pool.query<ViewsRow>(
    "select views from entry_views where entry_id = $1",
    [entryId],
  );
  const row = result.rows[0];
  return row === undefined ? 0 : Number(row.views);
}
