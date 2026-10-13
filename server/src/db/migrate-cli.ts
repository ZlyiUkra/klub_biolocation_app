// The `npm run db:migrate` command (T010 of specs/001-self-hosted-club-site).
//
// Reads DATABASE_URL only (see config.ts), applies every pending migration, prints what it applied, and ends the
// connection. Exit code 1 on any failure, with the migrations that did apply listed first: postgrator decorates
// its error with `appliedMigrations` when a run stops half way.

import pg from "pg";
import { loadDatabaseUrl } from "../config.js";
import { migrate } from "./migrate.js";

const client = new pg.Client({ connectionString: loadDatabaseUrl() });
try {
  await client.connect();
  const applied = await migrate(client);
  if (applied.length === 0)
    console.log("Database is up to date; nothing to apply.");
  for (const m of applied)
    console.log(
      `applied ${String(m.version).padStart(3, "0")} ${m.action} ${m.name}`,
    );
} catch (error) {
  const partial = (
    error as { appliedMigrations?: { version: number; name: string }[] }
  ).appliedMigrations;
  if (partial?.length)
    console.error(
      "Applied before the failure:",
      partial.map((m) => m.name).join(", "),
    );
  console.error(
    "Migration failed:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
