// Migration runner (T010 of specs/001-self-hosted-club-site).
//
// Source: postgrator 8.0.0 README, "Usage" (a pg client handed in through `execQuery`, `migrationPattern`,
// checksum validation) and the type declarations of the same version.
//
// Decisions that would otherwise look like mistakes:
// - This is a command's helper, never called at server start: a migration is an operator's act, and a server that
//   migrates itself on boot hides a failed migration inside a restart loop (research.md section 1).
// - Checksums stay on (postgrator's default). An applied migration file that is edited afterwards stops the run;
//   the fix is a new migration, never an edit.
// - The pattern is built from the compiled file's own location, so it is the same from `node server/dist/...` and
//   from the tests. Forward slashes are required by the glob library even on Windows.
// - A migration's SQL runs through the same client as the version bookkeeping, one file at a time.

import { fileURLToPath } from "node:url";
import pg from "pg";
import Postgrator from "postgrator";

// server/dist/server/src/db/migrate.js -> server/migrations (one level deeper than before 2026-10-10, T025)
// server/dist/src/db/migrate.js -> server/migrations   (the layout until then; kept so the history reads in place)
export const MIGRATIONS_DIR = fileURLToPath(
  new URL("../../../../migrations/", import.meta.url),
);

export type AppliedMigration = {
  version: number;
  name: string;
  action: "do" | "undo";
};

export async function migrate(
  client: pg.Client,
  target = "max",
): Promise<AppliedMigration[]> {
  const postgrator = new Postgrator({
    migrationPattern: MIGRATIONS_DIR.replaceAll("\\", "/") + "*",
    driver: "pg",
    database: client.database,
    schemaTable: "schema_version",
    execQuery: (query) => client.query(query),
  });
  const applied = await postgrator.migrate(target);
  return applied.map((m) => ({
    version: m.version,
    name: m.name,
    action: m.action,
  }));
}
