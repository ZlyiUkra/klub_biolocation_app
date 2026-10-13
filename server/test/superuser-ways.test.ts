// The table of the superuser's ways is held against the code and against SUPERUSER.md (T170 of
// specs/001-self-hosted-club-site; the consilium of 2026-10-11, the architect's point that the table should be data
// the tests iterate, not prose). No database needed.

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { superuserWays } from "../src/users/superuser-ways.js";

const repo = fileURLToPath(new URL("../../../../", import.meta.url));

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.ts$/.test(name) && name !== "superuser-ways.ts") out.push(path);
  }
  return out;
}

test("every audit action in the table is written somewhere in the server", () => {
  const code = sources(join(repo, "server/src"))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  const missing: string[] = [];
  for (const way of superuserWays) {
    for (const action of way.audit) {
      if (!code.includes(`"${action}"`)) missing.push(`${way.id}: ${action}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("the ways are A, B, C and D, once each, and SUPERUSER.md names every way and every audit action", () => {
  assert.deepEqual(
    superuserWays.map((w) => w.id),
    ["A", "B", "C", "D"],
  );
  const text = readFileSync(join(repo, "SUPERUSER.md"), "utf8");
  const missing: string[] = [];
  for (const way of superuserWays) {
    if (!text.includes(`Way ${way.id}`)) missing.push(`way ${way.id}`);
    for (const action of way.audit) {
      if (!text.includes(action)) missing.push(`${way.id}: ${action}`);
    }
  }
  assert.deepEqual(missing, []);
});
