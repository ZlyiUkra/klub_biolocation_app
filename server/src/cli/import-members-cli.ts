// The `npm run import:members -- <path> [--dry-run]` command (T055 of specs/001-self-hosted-club-site).
//
// Reads the members file given as the argument (a plain list of addresses, or the previous provider's CSV export; the
// formats and the rules are in import-members.ts) and creates a guest account without a password for every address
// that has none. The file is the club's private list and is never committed: the path is an argument, and the output
// holds counts, column names and line numbers only. Safe to run again. `--dry-run` reports what a run would do and
// writes nothing.

import { readFile } from "node:fs/promises";
import { loadDatabaseUrl } from "../config.js";
import { createPool } from "../db/pool.js";
import { importMembers, parseMembers } from "./import-members.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const path = args.find((a) => !a.startsWith("--"));
if (path === undefined) {
  console.error(
    "Usage: npm run import:members -- <path to the members file> [--dry-run]",
  );
  process.exit(1);
}

const pool = createPool(loadDatabaseUrl());
try {
  const parsed = parseMembers(await readFile(path, "utf8"));
  if (parsed.problems.length > 0) {
    // The whole file is refused (the owner's rule), with a line number and a reason each and never the line itself.
    console.error(
      `The file is refused as a whole, nothing was written: ${parsed.problems.length} line(s) cannot be used.`,
    );
    for (const problem of parsed.problems.slice(0, 50)) {
      console.error(`  line ${problem.line}: ${problem.reason}`);
    }
    if (parsed.problems.length > 50) {
      console.error(`  ... and ${parsed.problems.length - 50} more`);
    }
    process.exitCode = 1;
  } else if (parsed.members.length === 0) {
    console.error("The file holds no address; nothing to do.");
    process.exitCode = 1;
  } else {
    const report = await importMembers(pool, parsed, { dryRun });
    console.log(
      `${dryRun ? "dry run, nothing written: " : ""}members: ${report.created} created, ${report.existed} already existed, ${report.withoutName} without a name`,
    );
    console.log(
      `logins: ${report.loginsSet} set, ${report.loginsLeftOut} left out (not valid or taken)`,
    );
    // Added 2026-10-11 (T152): the old paid-until dates are the one thing besides the address that a file may carry.
    console.log(
      `lecture dates from the file: ${report.withAccessDate} (the accounts stay guests; the date lets them in)`,
    );
    if (report.ignoredColumns.length > 0) {
      console.log(
        `columns not used: ${report.ignoredColumns.join(", ")} (statuses are not imported: every member starts as a guest)`,
      );
    }
  }
} catch (error) {
  console.error(
    "Import failed, nothing was written:",
    error instanceof Error ? error.message : "unknown error",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
