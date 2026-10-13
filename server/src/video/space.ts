// The rule for the server's disk before a video is accepted (T138 of specs/001-self-hosted-club-site; added at the
// owner's word on 2026-10-10: the planned server is small).
//
// The rule, in one place so that the upload route and the register command cannot drift apart:
// - a file larger than the cap (`VIDEO_UPLOAD_CAP_MB`, default 500 MiB) is refused whatever the disk holds;
// - an upload that would leave less than the reserve (`VIDEO_FREE_RESERVE_MB`, default 2 GiB) free is refused, so the
//   database, its backups of the day and the operating system always keep room to work in.
//
// Decisions that would otherwise look like mistakes:
// - The free space is what `statfs` reports as available to an unprivileged user (`bavail`), not `bfree`: the blocks a
//   file system keeps back for root are not room this process can write into (Node 20 docs, File system, `fs.StatFs`).
// - Both numbers are read when the request arrives, never cached: a lecture copied by hand, or a backup written
//   meanwhile, changes them, and a stale "plenty of room" is the failure the rule exists to prevent.
// - The volume is the folder `VIDEO_ROOT`; a deployment that puts the database's data or its backups on the same
//   file system defeats the rule, which is why the deployment notes keep them apart (quickstart, phase 4).
// - The reserve is not applied to `video:register`: the file is already on the disk, so refusing to register it frees
//   nothing. The cap is applied there (an oversized file is the owner's to see before it is served).

import { statfs } from "node:fs/promises";

export type VolumeSpace = { freeBytes: number; totalBytes: number };

/** What the file system holding `root` has: bytes free for this process and bytes in all. */
export async function volumeSpace(root: string): Promise<VolumeSpace> {
  const stats = await statfs(root, { bigint: true });
  const unit = stats.bsize;
  return {
    freeBytes: Number(stats.bavail * unit),
    totalBytes: Number(stats.blocks * unit),
  };
}

export type SpaceVerdict = "ok" | "over_cap" | "no_space";

/** Whether a file of `fileBytes` may be taken: within the cap, and leaving at least the reserve free. */
export function spaceVerdict(input: {
  fileBytes: number;
  capBytes: number;
  reserveBytes: number;
  freeBytes: number;
}): SpaceVerdict {
  if (input.fileBytes > input.capBytes) return "over_cap";
  if (input.freeBytes - input.fileBytes < input.reserveBytes) return "no_space";
  return "ok";
}

/** The largest file the disk would take now: the free space above the reserve, never more than the cap. */
export function roomForUpload(input: {
  capBytes: number;
  reserveBytes: number;
  freeBytes: number;
}): number {
  return Math.max(
    0,
    Math.min(input.capBytes, input.freeBytes - input.reserveBytes),
  );
}
