// The `npm run import:content` command (T028 of specs/001-self-hosted-club-site).
//
// Imports the posts of src/content/posts and the videos of src/content/video into the database DATABASE_URL names,
// prints what it created, updated and left unchanged, and exits with 1 on any failure (the run is one transaction,
// so a failure writes nothing). Safe to run again at any time.

import { fileURLToPath } from "node:url";
import { loadDatabaseUrl } from "../config.js";
import { createPool } from "../db/pool.js";
import { importContent } from "./import-content.js";

// This file is server/dist/server/src/cli/import-content-cli.js once compiled, five levels below the repository.
const repository = new URL("../../../../../", import.meta.url);
const sources = {
  postsDir: fileURLToPath(new URL("src/content/posts/", repository)),
  videoDir: fileURLToPath(new URL("src/content/video/", repository)),
};

const pool = createPool(loadDatabaseUrl());
try {
  const report = await importContent(pool, sources);
  for (const [kind, counts] of Object.entries(report)) {
    console.log(
      `${kind}: ${counts.created} created, ${counts.updated} updated, ${counts.unchanged} unchanged`,
    );
  }
} catch (error) {
  console.error(
    "Import failed, nothing was written:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
