// Registering a copied MP4 (T079: server/src/video/register.ts, server/src/access/video-files.ts). Needs the
// development database server; every test has its own database and its own volume folder.
//
// Specified here: a faststart file inside the volume is registered; a video with a source row is refused until the
// source is asked to be replaced, and then the row is deleted in the same transaction; registering again replaces the
// file row; a file outside the volume, a missing, empty or non-faststart file and an unknown slug are refused with
// nothing written; the audit row carries the slug and the size and never a path or a reference.
//
// These queries select from the content tables to assert on them; the boundary test looks at server/src only.

import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Pool } from "../src/db/pool.js";
import { RegisterVideoError, registerVideo } from "../src/video/register.js";
import { createTestDatabase, skipWithoutDatabase } from "./helpers/db.js";

const opts = { skip: skipWithoutDatabase };

function box(type: string, payload = Buffer.alloc(8)): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + payload.length, 0);
  head.write(type, 4, "latin1");
  return Buffer.concat([head, payload]);
}
const fast = Buffer.concat([
  box("ftyp"),
  box("moov"),
  box("mdat", Buffer.alloc(500)),
]);
const slow = Buffer.concat([
  box("ftyp"),
  box("mdat", Buffer.alloc(500)),
  box("moov"),
]);

async function withWorld(
  run: (world: { pool: Pool; root: string; outside: string }) => Promise<void>,
) {
  const db = await createTestDatabase();
  const base = await mkdtemp(join(tmpdir(), "kb-register-"));
  const root = join(base, "volume");
  const outside = join(base, "elsewhere");
  await mkdir(root);
  await mkdir(outside);
  try {
    await run({ pool: db.pool, root, outside });
  } finally {
    await db.drop();
    await rm(base, { recursive: true, force: true });
  }
}

async function video(
  pool: Pool,
  slug: string,
  paid: boolean,
  withSource = paid,
) {
  await pool.query(
    `select store_video($1, 't', 'd', false, '2026-01-01T00:00:00Z', false, 'x', '<p>x</p>', '[]'::jsonb,
                        null, null, 'youtube', $2, $3, null, '{}', '{}', 1)`,
    [slug, paid ? null : "publicId0001", paid],
  );
  if (paid && withSource) {
    await pool.query(
      "select store_video_source($1, 'youtube', 'paidSecret_01')",
      [slug],
    );
  }
}

const counts = async (pool: Pool, slug: string) => {
  const r = await pool.query(
    `select (select count(*) from video_sources s join entries e on e.id = s.entry_id where e.slug = $1)::int as sources,
            (select count(*) from video_files f join entries e on e.id = f.entry_id where e.slug = $1)::int as files`,
    [slug],
  );
  return r.rows[0] as { sources: number; files: number };
};

async function refusal(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof RegisterVideoError, String(error));
    return error.code;
  }
  assert.fail("expected a refusal");
}

test(
  "a faststart file inside the volume is registered, with an audit row and no path outside the volume",
  opts,
  async () => {
    await withWorld(async ({ pool, root }) => {
      await video(pool, "lecture-a", true, false);
      await mkdir(join(root, "club"));
      await writeFile(join(root, "club", "a.mp4"), fast);
      // A paid lecture with no source row needs no flag.
      const done = await registerVideo(pool, {
        root,
        slug: "lecture-a",
        file: "club/a.mp4",
        replaceSource: false,
      });
      assert.deepEqual(
        { ...done },
        {
          volumePath: "club/a.mp4",
          sizeBytes: fast.length,
          replacedSource: false,
          replacedFile: false,
        },
      );
      const row = await pool.query(
        `select f.volume_path, f.size_bytes, f.content_type, f.faststart_ok from video_files f
         join entries e on e.id = f.entry_id where e.slug = 'lecture-a'`,
      );
      assert.deepEqual(row.rows[0], {
        volume_path: "club/a.mp4",
        size_bytes: String(fast.length),
        content_type: "video/mp4",
        faststart_ok: true,
      });
      const audit = await pool.query(
        "select detail from audit_log where action = 'video_file_registered'",
      );
      assert.equal(audit.rowCount, 1);
      assert.deepEqual(audit.rows[0].detail, {
        slug: "lecture-a",
        sizeBytes: fast.length,
        replacedSource: false,
        replacedFile: false,
      });
      assert.equal(JSON.stringify(audit.rows[0]).includes(root), false);
    });
  },
);

test(
  "a video with a source row is refused until the source is asked to be replaced, then the row goes with it",
  opts,
  async () => {
    await withWorld(async ({ pool, root }) => {
      await video(pool, "public-lecture", false);
      await video(pool, "paid-lecture", true);
      await pool.query(
        "select store_video_source('paid-lecture', 'youtube', 'paidSecret_02')",
      );
      await writeFile(join(root, "p.mp4"), fast);
      for (const slug of ["public-lecture", "paid-lecture"]) {
        // The paid lecture's row was written above; the public one has its embed row.
        assert.deepEqual(await counts(pool, slug), { sources: 1, files: 0 });
        assert.equal(
          await refusal(() =>
            registerVideo(pool, {
              root,
              slug,
              file: "p.mp4",
              replaceSource: false,
            }),
          ),
          "has_source",
        );
        assert.deepEqual(
          await counts(pool, slug),
          { sources: 1, files: 0 },
          "nothing was written",
        );
        const done = await registerVideo(pool, {
          root,
          slug,
          file: "p.mp4",
          replaceSource: true,
        });
        assert.equal(done.replacedSource, true);
        assert.deepEqual(await counts(pool, slug), { sources: 0, files: 1 });
      }
    });
  },
);

test(
  "registering again replaces the file row of the same video",
  opts,
  async () => {
    await withWorld(async ({ pool, root }) => {
      await video(pool, "again", true, false);
      await writeFile(join(root, "one.mp4"), fast);
      await writeFile(
        join(root, "two.mp4"),
        Buffer.concat([fast, Buffer.alloc(100)]),
      );
      await registerVideo(pool, {
        root,
        slug: "again",
        file: "one.mp4",
        replaceSource: false,
      });
      const second = await registerVideo(pool, {
        root,
        slug: "again",
        file: join(root, "two.mp4"),
        replaceSource: false,
      });
      assert.equal(second.replacedFile, true);
      assert.equal(second.volumePath, "two.mp4");
      assert.deepEqual(await counts(pool, "again"), { sources: 0, files: 1 });
    });
  },
);

test(
  "a file outside the volume, a missing, empty, non-faststart or directory path, and an unknown slug are refused, nothing written",
  opts,
  async () => {
    await withWorld(async ({ pool, root, outside }) => {
      await video(pool, "refusals", true, false);
      await writeFile(join(outside, "x.mp4"), fast);
      await writeFile(join(root, "slow.mp4"), slow);
      await writeFile(join(root, "empty.mp4"), Buffer.alloc(0));
      await mkdir(join(root, "folder"));
      const attempt = (file: string, slug = "refusals") =>
        refusal(() =>
          registerVideo(pool, { root, slug, file, replaceSource: false }),
        );
      assert.equal(await attempt(join(outside, "x.mp4")), "outside_volume");
      assert.equal(await attempt("../elsewhere/x.mp4"), "outside_volume");
      assert.equal(await attempt("nothing.mp4"), "file_missing");
      assert.equal(await attempt("empty.mp4"), "empty");
      assert.equal(await attempt("slow.mp4"), "not_faststart");
      assert.equal(await attempt("folder"), "not_a_file");
      await writeFile(join(root, "ok.mp4"), fast);
      assert.equal(await attempt("ok.mp4", "no-such-slug"), "no_such_video");
      assert.deepEqual(await counts(pool, "refusals"), {
        sources: 0,
        files: 0,
      });
      const audit = await pool.query(
        "select count(*)::int as n from audit_log where action = 'video_file_registered'",
      );
      assert.equal(audit.rows[0].n, 0);
    });
  },
);

test(
  "a post is not a video; a link inside the volume that points outside is refused",
  opts,
  async () => {
    await withWorld(async ({ pool, root, outside }) => {
      await pool.query(
        `insert into entries (kind, slug, title, description, audience, teaser, published_at)
       values ('post', 'just-a-post', 't', 'd', 'everyone', false, now())`,
      );
      await writeFile(join(root, "ok.mp4"), fast);
      assert.equal(
        await refusal(() =>
          registerVideo(pool, {
            root,
            slug: "just-a-post",
            file: "ok.mp4",
            replaceSource: false,
          }),
        ),
        "no_such_video",
      );
      await video(pool, "linked", true);
      await writeFile(join(outside, "real.mp4"), fast);
      try {
        await symlink(join(outside, "real.mp4"), join(root, "link.mp4"));
      } catch {
        return; // creating a link needs a privilege some machines do not grant; the rest is covered above
      }
      assert.equal(
        await refusal(() =>
          registerVideo(pool, {
            root,
            slug: "linked",
            file: "link.mp4",
            replaceSource: false,
          }),
        ),
        "outside_volume",
      );
    });
  },
);

// Added 2026-10-12 (T138): the size cap applies to the command when the caller passes it.
test(
  "a file over the cap is refused with its own code, and a file at the cap is registered",
  opts,
  async () => {
    await withWorld(async ({ pool, root }) => {
      await video(pool, "lecture-cap", true, false);
      await writeFile(join(root, "a.mp4"), fast);
      assert.equal(
        await refusal(() =>
          registerVideo(pool, {
            root,
            slug: "lecture-cap",
            file: "a.mp4",
            replaceSource: false,
            capBytes: fast.length - 1,
          }),
        ),
        "too_large",
      );
      assert.equal((await counts(pool, "lecture-cap")).files, 0);
      const done = await registerVideo(pool, {
        root,
        slug: "lecture-cap",
        file: "a.mp4",
        replaceSource: false,
        capBytes: fast.length,
      });
      assert.equal(done.sizeBytes, fast.length);
    });
  },
);

test("a missing volume folder is its own refusal", opts, async () => {
  await withWorld(async ({ pool, root }) => {
    assert.equal(
      await refusal(() =>
        registerVideo(pool, {
          root: join(root, "nope"),
          slug: "x",
          file: "a.mp4",
          replaceSource: false,
        }),
      ),
      "volume_missing",
    );
  });
});
