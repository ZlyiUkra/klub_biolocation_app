// The disk rule (T138 of specs/001-self-hosted-club-site). No database needed.

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadFreeReserveBytes, ConfigError } from "../src/config.js";
import {
  roomForUpload,
  spaceVerdict,
  volumeSpace,
} from "../src/video/space.js";

const MiB = 1024 * 1024;

test("a file within the cap that leaves the reserve free is taken", () => {
  assert.equal(
    spaceVerdict({
      fileBytes: 100 * MiB,
      capBytes: 500 * MiB,
      reserveBytes: 2048 * MiB,
      freeBytes: 3000 * MiB,
    }),
    "ok",
  );
});

test("a file that would leave exactly the reserve is taken, one byte less is refused", () => {
  const base = { capBytes: 500 * MiB, reserveBytes: 2048 * MiB };
  assert.equal(
    spaceVerdict({ ...base, fileBytes: 100 * MiB, freeBytes: 2148 * MiB }),
    "ok",
  );
  assert.equal(
    spaceVerdict({ ...base, fileBytes: 100 * MiB, freeBytes: 2148 * MiB - 1 }),
    "no_space",
  );
});

test("a file over the cap is refused first, whatever the disk holds", () => {
  assert.equal(
    spaceVerdict({
      fileBytes: 500 * MiB + 1,
      capBytes: 500 * MiB,
      reserveBytes: 0,
      freeBytes: 10_000 * MiB,
    }),
    "over_cap",
  );
  assert.equal(
    spaceVerdict({
      fileBytes: 500 * MiB,
      capBytes: 500 * MiB,
      reserveBytes: 0,
      freeBytes: 10_000 * MiB,
    }),
    "ok",
  );
});

test("the room is the free space above the reserve, within the cap, never below zero", () => {
  assert.equal(
    roomForUpload({
      capBytes: 500 * MiB,
      reserveBytes: 2048 * MiB,
      freeBytes: 5000 * MiB,
    }),
    500 * MiB,
  );
  assert.equal(
    roomForUpload({
      capBytes: 500 * MiB,
      reserveBytes: 2048 * MiB,
      freeBytes: 2548 * MiB - 1,
    }),
    500 * MiB - 1,
  );
  assert.equal(
    roomForUpload({
      capBytes: 500 * MiB,
      reserveBytes: 2048 * MiB,
      freeBytes: 1000 * MiB,
    }),
    0,
  );
});

test("the real volume reports a positive free space no larger than its size", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kb-space-"));
  try {
    const space = await volumeSpace(dir);
    assert.ok(space.freeBytes > 0);
    assert.ok(space.totalBytes >= space.freeBytes);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the reserve is 2 GiB by default, set in MiB, 0 switches it off, a bad value stops the start", () => {
  assert.equal(loadFreeReserveBytes({}), 2048 * MiB);
  assert.equal(loadFreeReserveBytes({ VIDEO_FREE_RESERVE_MB: "" }), 2048 * MiB);
  assert.equal(loadFreeReserveBytes({ VIDEO_FREE_RESERVE_MB: "0" }), 0);
  assert.equal(
    loadFreeReserveBytes({ VIDEO_FREE_RESERVE_MB: "512" }),
    512 * MiB,
  );
  for (const bad of ["-1", "1.5", "2GB", "abc", "10000001"]) {
    assert.throws(
      () => loadFreeReserveBytes({ VIDEO_FREE_RESERVE_MB: bad }),
      ConfigError,
      bad,
    );
  }
});
