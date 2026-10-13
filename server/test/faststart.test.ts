// The faststart check of T078 (server/src/video/faststart.ts): files are built here box by box, so no real video is
// needed and every case is exact. No database.

import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { checkFaststart, faststartMessage } from "../src/video/faststart.js";

function box(type: string, payload = Buffer.alloc(8), large = false): Buffer {
  if (large) {
    const head = Buffer.alloc(16);
    head.writeUInt32BE(1, 0);
    head.write(type, 4, "latin1");
    head.writeBigUInt64BE(BigInt(16 + payload.length), 8);
    return Buffer.concat([head, payload]);
  }
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + payload.length, 0);
  head.write(type, 4, "latin1");
  return Buffer.concat([head, payload]);
}

let dir: string;
before(async () => {
  dir = await mkdtemp(join(tmpdir(), "kb-faststart-"));
});
after(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function check(name: string, bytes: Buffer) {
  const path = join(dir, name);
  await writeFile(path, bytes);
  return checkFaststart(path);
}

test("moov before mdat is accepted; mdat before moov is refused with the reason", async () => {
  assert.deepEqual(
    await check(
      "fast.mp4",
      Buffer.concat([box("ftyp"), box("moov"), box("mdat")]),
    ),
    { ok: true },
  );
  assert.deepEqual(
    await check(
      "slow.mp4",
      Buffer.concat([box("ftyp"), box("mdat"), box("moov")]),
    ),
    { ok: false, reason: "moov_after_mdat" },
  );
});

test("other boxes in front (free, wide, skip) do not matter; a 64-bit size is read", async () => {
  assert.deepEqual(
    await check(
      "extra.mp4",
      Buffer.concat([
        box("ftyp"),
        box("free"),
        box("wide"),
        box("moov", Buffer.alloc(8), true),
        box("mdat"),
      ]),
    ),
    { ok: true },
  );
  assert.deepEqual(
    await check(
      "large-mdat.mp4",
      Buffer.concat([
        box("ftyp"),
        box("mdat", Buffer.alloc(8), true),
        box("moov"),
      ]),
    ),
    { ok: false, reason: "moov_after_mdat" },
  );
});

test("a size of zero means to the end of the file", async () => {
  const last = Buffer.concat([
    Buffer.alloc(4),
    Buffer.from("mdat", "latin1"),
    Buffer.alloc(20),
  ]);
  assert.deepEqual(
    await check("zero.mp4", Buffer.concat([box("ftyp"), last])),
    { ok: false, reason: "moov_after_mdat" },
  );
});

test("a file that is not an MP4, an empty file, a cut file and a damaged header are refused, never accepted", async () => {
  assert.deepEqual(
    await check("text.mp4", Buffer.from("hello, this is not a video at all")),
    {
      ok: false,
      reason: "not_mp4",
    },
  );
  assert.deepEqual(await check("empty.mp4", Buffer.alloc(0)), {
    ok: false,
    reason: "not_mp4",
  });
  assert.deepEqual(await check("only-ftyp.mp4", box("ftyp")), {
    ok: false,
    reason: "no_moov",
  });
  const cut = box("moov", Buffer.alloc(100)).subarray(0, 50);
  assert.deepEqual(await check("cut.mp4", Buffer.concat([box("ftyp"), cut])), {
    ok: false,
    reason: "truncated",
  });
  const bad = box("free");
  bad.writeUInt32BE(3, 0);
  assert.deepEqual(
    await check("bad.mp4", Buffer.concat([box("ftyp"), bad, box("moov")])),
    {
      ok: false,
      reason: "truncated",
    },
  );
});

test("a missing file is unreadable, and no refusal sentence names a path", async () => {
  assert.deepEqual(await checkFaststart(join(dir, "nothing-here.mp4")), {
    ok: false,
    reason: "unreadable",
  });
  for (const reason of [
    "moov_after_mdat",
    "not_mp4",
    "no_moov",
    "truncated",
    "unreadable",
  ] as const) {
    assert.equal(faststartMessage(reason).includes("/"), false);
  }
  assert.match(faststartMessage("moov_after_mdat"), /movflags \+faststart/);
});

test("many boxes before the marker are refused, not walked forever", async () => {
  const many = Buffer.concat([
    box("ftyp"),
    ...Array.from({ length: 80 }, () => box("free")),
  ]);
  assert.deepEqual(
    await check("many.mp4", Buffer.concat([many, box("moov")])),
    {
      ok: false,
      reason: "no_moov",
    },
  );
});
