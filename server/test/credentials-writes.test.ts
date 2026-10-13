// Nothing but users/credentials.ts sets a password hash on an existing account (T170 of
// specs/001-self-hosted-club-site; the consilium of 2026-10-11, finding F1). A fifth or sixth place that wrote the
// columns by hand would forget to close an open hand-over of the superuser role; this test fails the day one is added.
//
// Two files are allowed, each for a stated reason, and the test also checks that the first still closes the request:
// - users/routes.ts: an admin's temporary password sets `must_change` and an expiry, which `credentialsChanged` does not;
//   it calls `closeOpenHandovers` itself.
// - auth/signin.ts: rewriting a hash with the current parameters after a successful sign-in; the password is the same.

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repo = fileURLToPath(new URL("../../../../", import.meta.url));
const home = "server/src/users/credentials.ts";
const allowedElsewhere = new Set([
  "server/src/users/routes.ts",
  "server/src/auth/signin.ts",
]);

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.(ts|mjs|js)$/.test(name)) out.push(path);
  }
  return out;
}

function withoutComments(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join("\n");
}

test("no statement outside credentials.ts sets password_hash, bar the two listed", () => {
  const offenders: string[] = [];
  for (const file of sources(join(repo, "server/src"))) {
    const rel = relative(repo, file).replace(/\\/g, "/");
    if (rel === home || allowedElsewhere.has(rel)) continue;
    const code = withoutComments(readFileSync(file, "utf8"));
    if (/\bpassword_hash\s*=/.test(code)) offenders.push(rel);
  }
  assert.deepEqual(offenders, [], "these files write the password hash");
});

test("the allowed exceptions are what the comment says they are", () => {
  const routes = withoutComments(
    readFileSync(join(repo, "server/src/users/routes.ts"), "utf8"),
  );
  assert.ok(
    /closeOpenHandovers\(/.test(routes),
    "the temporary password closes an open hand-over",
  );
  const homeCode = withoutComments(readFileSync(join(repo, home), "utf8"));
  assert.ok(/\bpassword_hash\s*=/.test(homeCode), "the detector sees the home");
});
