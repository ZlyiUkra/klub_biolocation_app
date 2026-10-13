// Registering a copied MP4 against a video (T079 of specs/001-self-hosted-club-site; quickstart phase 4, step 1). The
// command `npm run video:register -- <slug> <file>` is the thin shell around this function.
//
// The file is copied to the video volume by the owner first (the volume is a mounted folder; research.md section 10);
// this registers it. Checks, in order, each with its own refusal and none of them naming a path outside the volume:
// 1. The file is inside the volume. The argument may be a path relative to the volume or an absolute one; both are
//    resolved with `realpath` (so a symlink out of the volume is seen for what it points at) and the result must stay
//    below the volume's own real path.
// 2. It is a regular file and not a link, and not empty.
// 3. Its index stands before its media data (T078, faststart.ts).
// 4. The database accepts it (access/video-files.ts): the entry is a video, and a source row is replaced only when
//    asked for.
// Nothing is moved, copied or deleted on the volume: the file stays where the owner put it.
//
// Changed 2026-10-12 (T138): the size cap of `space.ts` applies here when the caller passes it (`capBytes`; the
// command passes VIDEO_UPLOAD_CAP_MB). The free-space reserve does not: the file is already on the disk, so refusing it
// would free nothing.

import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import {
  registerVideoFile,
  RegisterRefused,
  type Registered,
} from "../access/video-files.js";
import type { Pool } from "../db/pool.js";
import { checkFaststart, faststartMessage } from "./faststart.js";

export type RegisterFailure =
  | "volume_missing"
  | "file_missing"
  | "outside_volume"
  | "not_a_file"
  | "empty"
  | "too_large"
  | "not_faststart"
  | "no_such_video"
  | "has_source";

export class RegisterVideoError extends Error {
  readonly code: RegisterFailure;
  constructor(code: RegisterFailure, message: string) {
    super(message);
    this.name = "RegisterVideoError";
    this.code = code;
  }
}

export type RegisterVideoResult = Registered & {
  volumePath: string;
  sizeBytes: number;
};

export async function registerVideo(
  pool: Pool,
  input: {
    root: string;
    slug: string;
    file: string;
    replaceSource: boolean;
    /** The size cap of T138; left out, no cap is applied. */
    capBytes?: number;
  },
): Promise<RegisterVideoResult> {
  let root: string;
  try {
    root = await realpath(input.root);
  } catch {
    throw new RegisterVideoError(
      "volume_missing",
      "the video volume folder does not exist",
    );
  }
  const wanted = isAbsolute(input.file)
    ? input.file
    : resolve(root, input.file);
  let real: string;
  try {
    real = await realpath(wanted);
  } catch {
    throw new RegisterVideoError("file_missing", "the file does not exist");
  }
  const inside = relative(root, real);
  if (inside === "" || inside.startsWith("..") || isAbsolute(inside)) {
    throw new RegisterVideoError(
      "outside_volume",
      "the file is not inside the video volume",
    );
  }
  // `realpath` followed any link, so a link is only visible on the path as given; refuse a link as the file itself.
  const linkInfo = await lstat(wanted);
  const info = await lstat(real);
  if (linkInfo.isSymbolicLink() || !info.isFile()) {
    throw new RegisterVideoError("not_a_file", "it is not a regular file");
  }
  if (info.size === 0) {
    throw new RegisterVideoError("empty", "the file is empty");
  }
  if (input.capBytes !== undefined && info.size > input.capBytes) {
    throw new RegisterVideoError(
      "too_large",
      `the file is larger than the cap of ${Math.floor(input.capBytes / (1024 * 1024))} MiB (VIDEO_UPLOAD_CAP_MB)`,
    );
  }
  const checked = await checkFaststart(real);
  if (!checked.ok) {
    throw new RegisterVideoError(
      "not_faststart",
      faststartMessage(checked.reason),
    );
  }
  const volumePath = inside.split(sep).join("/");
  try {
    const done = await registerVideoFile(pool, {
      slug: input.slug,
      volumePath,
      sizeBytes: info.size,
      replaceSource: input.replaceSource,
    });
    return { ...done, volumePath, sizeBytes: info.size };
  } catch (error) {
    if (error instanceof RegisterRefused) {
      throw new RegisterVideoError(
        error.code,
        error.code === "no_such_video"
          ? "there is no video with that slug"
          : "this video has a source row; run again with --replace-source to delete it and use the file instead",
      );
    }
    throw error;
  }
}
