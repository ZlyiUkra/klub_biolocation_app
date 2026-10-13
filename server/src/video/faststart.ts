// The faststart check of an MP4 (T078 of specs/001-self-hosted-club-site; research.md section 10, FR-027, spec edge
// case "a file that cannot start before it is fully downloaded").
//
// A player can start an MP4 before it has the whole file only when the `moov` box (the index of the streams) stands
// BEFORE the `mdat` box (the media bytes). Otherwise the browser has to fetch the end of the file first, which for a
// two-hour lecture is a visible stall and, behind a range-serving proxy, a long wait. The register command
// (T079) refuses such a file and says how to repair it with ffmpeg's `-movflags +faststart`.
//
// Decisions that would otherwise look like mistakes:
// - No `ffprobe` and no new dependency (the owner, 2026-10-11, on the recommendation of the report of T078): the rule
//   needs only the order of the top-level boxes, which is a few dozen lines, needs nothing installed in the image and
//   cannot be made to run a program by a hostile file. What this check does NOT know is whether the streams inside
//   `moov` are playable; that is the browser's business and the owner's check (T085).
// - Only the headers of the top-level boxes are read, never their contents, and the walk stops at the first `moov` or
//   the first `mdat`, so the cost is a handful of small reads however large the file is.
// - A box header is 8 bytes (size, type); size 1 means a 64-bit size follows, size 0 means "to the end of the file".
//   A size below the header, a box that runs past the end of the file, or more than `maxBoxes` boxes before either
//   marker is a file this check does not understand, and it is refused (fail closed), with its own reason.
// - The first box must be `ftyp`: it is what makes the file an MP4 at all, and a text file renamed `.mp4` is refused
//   here with the reason `not_mp4` instead of being mistaken for "no moov".

import { open } from "node:fs/promises";

export type FaststartResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        "not_mp4" | "moov_after_mdat" | "no_moov" | "truncated" | "unreadable";
    };

const maxBoxes = 64;

/** Reads the top-level boxes of the file at `path` and says whether the index stands before the media data. */
export async function checkFaststart(path: string): Promise<FaststartResult> {
  let handle;
  try {
    handle = await open(path, "r");
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  try {
    const { size } = await handle.stat();
    const header = Buffer.alloc(16);
    let offset = 0n;
    const length = BigInt(size);
    for (let index = 0; index < maxBoxes; index++) {
      if (offset + 8n > length) {
        // Nothing left: the end of the file was reached with no `moov` and no `mdat` seen.
        return { ok: false, reason: index === 0 ? "not_mp4" : "no_moov" };
      }
      const read = await handle.read(header, 0, 16, Number(offset));
      if (read.bytesRead < 8) return { ok: false, reason: "truncated" };
      let boxSize = BigInt(header.readUInt32BE(0));
      const type = header.toString("latin1", 4, 8);
      let headerSize = 8n;
      if (boxSize === 1n) {
        if (read.bytesRead < 16) return { ok: false, reason: "truncated" };
        boxSize = header.readBigUInt64BE(8);
        headerSize = 16n;
      } else if (boxSize === 0n) {
        boxSize = length - offset;
      }
      if (index === 0 && type !== "ftyp") {
        return { ok: false, reason: "not_mp4" };
      }
      if (boxSize < headerSize || offset + boxSize > length) {
        return { ok: false, reason: "truncated" };
      }
      if (type === "moov") return { ok: true };
      if (type === "mdat") return { ok: false, reason: "moov_after_mdat" };
      offset += boxSize;
    }
    return { ok: false, reason: "no_moov" };
  } finally {
    await handle.close();
  }
}

/** The sentence the register command prints for a refusal; never names the path. */
export function faststartMessage(
  reason: Exclude<FaststartResult, { ok: true }>["reason"],
): string {
  switch (reason) {
    case "moov_after_mdat":
      return "the index of the file is after the media data, so it cannot start before it is fully downloaded; repair it with: ffmpeg -i in.mp4 -c copy -movflags +faststart out.mp4";
    case "not_mp4":
      return "the file does not start with an MP4 header";
    case "no_moov":
      return "the file has no index (moov) among its first boxes";
    case "truncated":
      return "the file is cut off or has a damaged box header";
    case "unreadable":
      return "the file cannot be read";
  }
}
