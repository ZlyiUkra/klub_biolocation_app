// The access boundary (T024 of specs/001-self-hosted-club-site; constitution III and IV).
//
// Only server/src/access/ may read the content tables. A second reader is a second place that decides who sees what,
// which is the drift the constitution forbids and the way a hidden entry leaks into one more surface. This test reads
// every TypeScript file under server/src (and every script under scripts/) outside that folder and fails on a `from`
// or `join` of a content table in SQL text.
//
// Writers are not flagged: `insert into` and `update ... set` are how the content store saves. A writer that needs to
// know whether a row exists uses `insert ... on conflict`; it does not select. A `delete from` is flagged on purpose:
// nothing in this system deletes entries (they are soft-deleted).
//
// Comments are stripped first, so prose that names a table does not trip it. The detector is checked against a
// sample below, so a broken pattern cannot pass silently.

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const tables =
  "entries|posts|videos|video_files|video_sources|entry_audience_statuses|entry_audience_users";
const readOf = new RegExp(
  `\\b(?:from|join)\\s+(?:public\\.)?(?:${tables})\\b`,
  "i",
);

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

function sourcesUnder(dir: string, pattern: RegExp): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory())
      found.push(...sourcesUnder(path, pattern));
    else if (pattern.test(name)) found.push(path);
  }
  return found;
}

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const serverSrc = join(root, "server", "src");
const accessDir = join(serverSrc, "access");

test("the detector recognises a read and ignores a write and a comment", () => {
  assert.ok(readOf.test("select 1 from entries e"));
  assert.ok(readOf.test("... left join posts p on p.entry_id = e.id"));
  assert.ok(readOf.test("select * from\n  videos"));
  assert.ok(readOf.test("delete from entries"));
  assert.ok(!readOf.test("insert into entries (kind) values ($1)"));
  assert.ok(!readOf.test("update posts set body_html = $1"));
  assert.ok(!readOf.test("select 1 from users"));
  assert.equal(
    readOf.test(stripComments("// reads from entries here\nconst a = 1;")),
    false,
  );
});

test("no file outside server/src/access reads the content tables", () => {
  const files = [
    ...sourcesUnder(serverSrc, /\.ts$/),
    ...sourcesUnder(join(root, "scripts"), /\.(?:mjs|js|ts)$/),
  ].filter(
    (file) =>
      !file.startsWith(accessDir + "\\") && !file.startsWith(accessDir + "/"),
  );

  assert.ok(files.length > 0, "the scan finds files");
  const offenders = files.filter((file) =>
    readOf.test(stripComments(readFileSync(file, "utf8"))),
  );
  assert.deepEqual(
    offenders.map((file) => relative(root, file)),
    [],
    "these files read the content tables; route the read through server/src/access/entries.ts",
  );
});
