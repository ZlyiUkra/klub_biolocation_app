// The error codes and the texts a visitor reads for them (T179 of specs/001-self-hosted-club-site; contracts/http-api.md,
// "Conventions"; FR-043 to FR-046).
//
// Three things must not drift apart: the list of codes (src/lib/error-codes.ts), the codes the routes really send (every
// `sendError(res, <status>, "<code>", ...)` and `new HttpError(<status>, "<code>", ...)` under server/src), and the texts
// of the site (src/i18n/errors.ts), which exist in both languages for every code. The type system already forces the
// record to cover the list; this test also reads the source, so a code written as a string where the type cannot see it
// (a cast, a template) still fails here, and an empty or untranslated text fails too.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { errorCodes, isErrorCode } from "../../src/lib/error-codes.js";
import {
  refusalOf,
  refusals,
  unknownRefusal,
} from "../../src/i18n/errors.js";

const root = fileURLToPath(new URL("../../../../", import.meta.url));

function sources(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...sources(path));
    else if (name.endsWith(".ts")) found.push(path);
  }
  return found;
}

test("every code of the list has a non-empty text in both languages", () => {
  for (const code of errorCodes) {
    const phrase = refusals[code];
    assert.ok(phrase.ru.trim().length > 0, `${code}: Russian text`);
    assert.ok(phrase.en.trim().length > 0, `${code}: English text`);
    assert.notEqual(phrase.ru, phrase.en, `${code}: the two languages differ`);
    assert.match(phrase.ru, /[Ѐ-ӿ]/, `${code}: Russian has Cyrillic`);
    assert.doesNotMatch(
      phrase.en,
      /[Ѐ-ӿ]/,
      `${code}: English has none`,
    );
  }
  assert.deepEqual(
    Object.keys(refusals).sort(),
    [...errorCodes].sort(),
    "the record covers exactly the list",
  );
});

test("a code no list knows gets the general sentence, never the raw code", () => {
  for (const unknown of ["teapot", "", undefined, null, 42, { error: "x" }]) {
    assert.equal(isErrorCode(unknown), false);
    assert.deepEqual(refusalOf(unknown), unknownRefusal);
  }
  assert.deepEqual(refusalOf("forbidden"), refusals.forbidden);
});

test("every code a route sends is in the list", () => {
  const sent = new Set<string>();
  const patterns = [
    /sendError\(\s*res,\s*\d+,\s*"([a-z_]+)"/g,
    /new HttpError\(\s*\d+,\s*"([a-z_]+)"/g,
    /error:\s*"([a-z_]+)"/g,
  ];
  for (const file of sources(join(root, "server", "src"))) {
    const text = readFileSync(file, "utf8");
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const code = match[1];
        if (code !== undefined) sent.add(code);
      }
    }
  }
  assert.ok(sent.size >= 8, `read ${sent.size} codes from the routes`);
  // `error: "<x>"` also matches a few non-code uses (the status page's own words); only a snake_case word that the
  // list lacks AND that a sendError or HttpError call sends is a failure, so those two patterns are checked alone.
  const strict = new Set<string>();
  for (const file of sources(join(root, "server", "src"))) {
    const text = readFileSync(file, "utf8");
    for (const pattern of patterns.slice(0, 2)) {
      for (const match of text.matchAll(pattern)) {
        const code = match[1];
        if (code !== undefined) strict.add(code);
      }
    }
  }
  const missing = [...strict].filter((code) => !isErrorCode(code));
  assert.deepEqual(missing, [], "codes sent but missing from the list");
});
