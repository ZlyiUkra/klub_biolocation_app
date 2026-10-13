// Nothing but the superuser module writes the superuser flag (T061 of specs/001-self-hosted-club-site;
// security-review-superuser.md section 4, mitigation 8: "nothing about the rule lives in two places"). The test reads the
// server's and the site's sources and fails if a statement outside `server/src/users/superuser.ts` sets or inserts
// `is_superuser`, so a new route or command that tries to change the role is caught the day it is written.

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repo = fileURLToPath(new URL("../../../../", import.meta.url));
const allowed = "server/src/users/superuser.ts";

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.(ts|mjs|js|astro)$/.test(name)) out.push(path);
  }
  return out;
}

function withoutComments(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join("\n");
}

test("no statement outside the superuser module sets or inserts is_superuser", () => {
  const roots = [
    join(repo, "server/src"),
    join(repo, "src"),
    join(repo, "scripts"),
  ];
  const offenders: string[] = [];
  for (const root of roots) {
    for (const file of sources(root)) {
      const rel = relative(repo, file).replace(/\\/g, "/");
      if (rel === allowed) continue;
      const code = withoutComments(readFileSync(file, "utf8"));
      const writes =
        /\bset\b[^;`'"]*\bis_superuser\s*=/is.test(code) ||
        /insert\s+into\s+users\b[^;]*\bis_superuser\b/is.test(code) ||
        /\bis_superuser\s*:\s*(true|false)\b/.test(code);
      if (writes) offenders.push(rel);
    }
  }
  assert.deepEqual(offenders, [], "these files write the superuser flag");
});

test("the superuser module itself does write it (the detector sees it)", () => {
  const code = withoutComments(readFileSync(join(repo, allowed), "utf8"));
  assert.ok(/\bis_superuser\s*=\s*true/i.test(code));
});
