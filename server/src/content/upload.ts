// The file half of a video upload from the panel (T098 of specs/001-self-hosted-club-site; the route and its database
// half are in admin-routes.ts and access/video-files.ts; shapes in contracts/http-api.md, "PUT .../file").
//
// What it does: streams the request body to a temporary file in the video volume, checks that the file can start before
// it is fully downloaded (T078), and only then gives it its final name. Whatever goes wrong, nothing is left behind.
//
// Decisions that would otherwise look like mistakes:
// - Streamed with `pipeline`, never read into memory: a lecture is up to 500 MiB and the process must not grow with it
//   (the test of the 500 MiB upload measures this). `pipeline` also carries back-pressure and closes the file on an
//   error, so a client that disconnects half-way leaves no open handle.
// - The size is bounded twice. The route refuses a declared length over the cap before it reads a byte (a request that
//   announces 5 GiB costs nothing); the counter below enforces the same bound while the bytes arrive, so a client that
//   announces little and sends more is cut off at the declared length (the HTTP parser does that as well; this is the
//   second line, not the first).
// - The temporary file is named by this server (`.upload-<random>.part`) and the final one too (`upload-<entry>-
//   <random>.mp4`). The client's file name is never read, so there is nothing to traverse (OWASP File Upload Cheat
//   Sheet: "do not use the user's file name"), and both sit directly in the volume, on the same filesystem, so the
//   rename is atomic and a half-written file is never visible under a final name.
// - Nothing on the volume is ever deleted except this request's own temporary or refused file. A file that an earlier
//   upload registered stays after a replacement (the owner's rule: bytes are removed by the owner, never by a save).

import { createWriteStream } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { IncomingMessage } from "node:http";
import { checkFaststart, type FaststartResult } from "../video/faststart.js";

export type StreamedUpload =
  | { kind: "stored"; volumePath: string; sizeBytes: number }
  | {
      kind: "not_faststart";
      reason: Exclude<FaststartResult, { ok: true }>["reason"];
    }
  | { kind: "aborted" };

/**
 * Writes `req`'s body, which must be exactly `declaredLength` bytes, into the volume at `root` for the entry `entryId`.
 * Resolves with the final file's name (relative to the volume) or the reason it was refused; rejects only on a fault of
 * the server (a full disk, a missing folder), after removing its temporary file.
 */
export async function streamToVolume(
  req: IncomingMessage,
  input: { root: string; entryId: number; declaredLength: number },
): Promise<StreamedUpload> {
  const temporary = join(
    input.root,
    `.upload-${randomBytes(8).toString("hex")}.part`,
  );
  let received = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      received += chunk.length;
      if (received > input.declaredLength) {
        done(new Error("more bytes than Content-Length announced"));
        return;
      }
      done(null, chunk);
    },
  });
  try {
    await pipeline(
      req,
      counter,
      createWriteStream(temporary, { flags: "wx", mode: 0o640 }),
    );
  } catch (error) {
    await rm(temporary, { force: true });
    // A client that went away, or one that sent more than it announced, is not a fault of the server.
    const code = (error as { code?: string }).code;
    if (
      code === "ERR_STREAM_PREMATURE_CLOSE" ||
      code === "ECONNRESET" ||
      code === "ERR_STREAM_DESTROYED" ||
      (error instanceof Error && error.message.startsWith("more bytes than"))
    ) {
      return { kind: "aborted" };
    }
    throw error;
  }
  if (received !== input.declaredLength) {
    await rm(temporary, { force: true });
    return { kind: "aborted" };
  }
  const checked = await checkFaststart(temporary);
  if (!checked.ok) {
    await rm(temporary, { force: true });
    return { kind: "not_faststart", reason: checked.reason };
  }
  const volumePath = `upload-${input.entryId}-${randomBytes(8).toString("hex")}.mp4`;
  try {
    await rename(temporary, join(input.root, volumePath));
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return { kind: "stored", volumePath, sizeBytes: received };
}
