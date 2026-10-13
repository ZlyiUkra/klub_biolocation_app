// The `npm run import:video-sources -- <path>` command (T136 of specs/001-self-hosted-club-site).
//
// Reads the sources file given as the argument (the old repository's git-ignored workers/video-access/videos.local.json
// has the shape) and stores each source against its paid video, which `npm run import:content` must have created.
// Prints counts only: the file holds the club's private links and none of them is ever written to the output. Safe to
// run again.

import { readFile } from "node:fs/promises";
import { loadDatabaseUrl } from "../config.js";
import { createPool } from "../db/pool.js";
import { parseSources, storeSources } from "../content/video-sources.js";

const path = process.argv[2];
if (path === undefined) {
  console.error(
    "Usage: npm run import:video-sources -- <path to the sources file>",
  );
  process.exit(1);
}

const pool = createPool(loadDatabaseUrl());
try {
  const sources = parseSources(await readFile(path, "utf8"));
  const report = await storeSources(pool, sources);
  const providers = new Map<string, number>();
  for (const { provider } of sources.values()) {
    providers.set(provider, (providers.get(provider) ?? 0) + 1);
  }
  console.log(
    `video sources: ${report.created} created, ${report.updated} updated, ${report.unchanged} unchanged`,
  );
  for (const [provider, count] of providers) {
    console.log(`  ${provider}: ${count}`);
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
