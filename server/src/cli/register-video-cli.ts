// The `npm run video:register -- <slug> <file> [--replace-source]` command (T079 of specs/001-self-hosted-club-site).
//
// Registers an MP4 that was copied into the video volume against a video entry, after the faststart check
// (server/src/video/register.ts). VIDEO_ROOT names the volume folder. Prints the slug, the size and what was
// replaced; never a stored reference and never a path outside the volume. `--replace-source` is needed when the video
// still has its embed id or paid link: that row is deleted in the same transaction, which is why it is asked for.

import {
  loadDatabaseUrl,
  loadUploadCapBytes,
  loadVideoRoot,
} from "../config.js";
import { createPool } from "../db/pool.js";
import { RegisterVideoError, registerVideo } from "../video/register.js";

const args = process.argv.slice(2);
const replaceSource = args.includes("--replace-source");
const [slug, file] = args.filter((a) => !a.startsWith("--"));
if (slug === undefined || file === undefined) {
  console.error(
    "Usage: npm run video:register -- <slug> <file in the video volume> [--replace-source]",
  );
  process.exit(1);
}

const root = loadVideoRoot();
const capBytes = loadUploadCapBytes();
const pool = createPool(loadDatabaseUrl());
try {
  // Changed 2026-10-12 (T138): the same size cap as the panel's upload.
  const done = await registerVideo(pool, {
    root,
    slug,
    file,
    replaceSource,
    capBytes,
  });
  console.log(
    `registered ${slug}: ${done.volumePath} (${done.sizeBytes} bytes)` +
      (done.replacedFile ? "; an earlier file was replaced" : "") +
      (done.replacedSource ? "; its source row was deleted" : ""),
  );
} catch (error) {
  console.error(
    "Not registered, nothing was written:",
    error instanceof RegisterVideoError
      ? error.message
      : "unexpected error (see the server log)",
  );
  if (!(error instanceof RegisterVideoError)) console.error(error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
