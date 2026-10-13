// The pipeline version stamp (T026 of specs/001-self-hosted-club-site).
//
// Every rendered entry is stored with `renderVersion`, and a row with a lower stamp is rendered again when it is read.
// That only works if someone raises the number when the pipeline changes. This test takes the fingerprint of what the
// pipeline is made of - the versions of the packages in it, the options file and the sanitizer - and compares it with
// the one recorded here for the current stamp. Change a package, an option or the sanitizer and the test fails until
// `renderVersion` in src/markdown/options.ts is raised and the pair below is updated, so stored HTML cannot silently
// fall out of step with what the site would render now.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { renderVersion } from "../../src/markdown/options.js";

// The pair to update together: the stamp, and the fingerprint printed by the failing assertion below.
const recorded = { renderVersion: 1, fingerprint: "3359af37d49c3dae" };

const packages = [
  "@astrojs/markdown-remark",
  "unified",
  "remark-parse",
  "remark-gfm",
  "remark-smartypants",
  "remark-math",
  "remark-rehype",
  "rehype-raw",
  "rehype-katex",
  "rehype-stringify",
  "katex",
  "shiki",
];

function fingerprint(): string {
  const root = new URL("../../../../", import.meta.url);
  const read = (path: string) =>
    readFileSync(fileURLToPath(new URL(path, root)), "utf8");
  const versions = packages.map(
    (name) =>
      `${name}@${JSON.parse(read(`node_modules/${name}/package.json`)).version}`,
  );
  // The stamp's own line is left out, otherwise raising it would change the fingerprint it is compared with.
  const options = read("src/markdown/options.ts")
    .split("\n")
    .filter((line) => !line.startsWith("export const renderVersion"))
    .join("\n");
  const sanitizer = read("src/markdown/remark-no-raw-html.ts");
  return createHash("sha256")
    .update([versions.join("\n"), options, sanitizer].join("\n---\n"))
    .digest("hex")
    .slice(0, 16);
}

test("the render version is raised whenever the pipeline changes", () => {
  assert.equal(
    renderVersion,
    recorded.renderVersion,
    "renderVersion in src/markdown/options.ts and the recorded pair in this test must be changed together",
  );
  assert.equal(
    fingerprint(),
    recorded.fingerprint,
    "the pipeline changed: raise renderVersion in src/markdown/options.ts, then put the new fingerprint here",
  );
});
