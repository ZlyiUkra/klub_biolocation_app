// The fill-time rule of the club's forms (T188 of specs/001-self-hosted-club-site; T104 wrote it for the feedback form,
// T159 and T050 left it for sign-up; tests written first, red until src/lib/fill-time.ts exists and both routes use it).
//
// A form that was open for less than three seconds, that names no opening time, that comes from the future or that is
// older than a day was not filled by a person at a keyboard. The numbers and the yes-or-no are one plain module that
// the feedback route, the sign-up route and the sign-up page's script all read, so the page can wait out the few
// seconds a fast person (a password manager filling the fields at once) would otherwise lose to the rule.
//
// What is fixed here:
// - The three seconds and the day, and that a boundary counts as accepted on both sides.
// - Anything that is not a finite number is refused: a string, null, a missing member, NaN, Infinity.
// - The feedback route's numbers (`feedbackLimits.minFillMs`, `maxFillAgeMs`) are these numbers, not copies; a second
//   definition of the rule in either route would be found by the source check below.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { fillTime, fillTimeAccepted } from "../../src/lib/fill-time.js";
import { feedbackLimits } from "../src/feedback/routes.js";

test("the numbers: three seconds at least, a day at most", () => {
  assert.equal(fillTime.minMs, 3_000);
  assert.equal(fillTime.maxAgeMs, 24 * 60 * 60_000);
});

test("a form opened long enough ago and not too long ago is accepted, the boundaries included", () => {
  const now = 1_800_000_000_000;
  assert.equal(fillTimeAccepted(now - 10_000, now), true);
  assert.equal(fillTimeAccepted(now - fillTime.minMs, now), true);
  assert.equal(fillTimeAccepted(now - fillTime.maxAgeMs, now), true);
});

test("too quick, in the future, too old, missing or not a number: refused", () => {
  const now = 1_800_000_000_000;
  const refused: [string, unknown][] = [
    ["sent at once", now - 500],
    ["sent in the same instant", now],
    ["a hair under the minimum", now - fillTime.minMs + 1],
    ["from the future", now + 60_000],
    ["a day and a millisecond old", now - fillTime.maxAgeMs - 1],
    ["zero", 0],
    ["missing", undefined],
    ["null", null],
    ["a string", String(now - 10_000)],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
    ["an object", {}],
  ];
  for (const [what, value] of refused) {
    assert.equal(fillTimeAccepted(value, now), false, what);
  }
});

test("the feedback route's numbers are this rule's, and neither route spells the rule out again", () => {
  assert.equal(feedbackLimits.minFillMs, fillTime.minMs);
  assert.equal(feedbackLimits.maxFillAgeMs, fillTime.maxAgeMs);
  const root = new URL("../../../../", import.meta.url);
  for (const file of [
    "server/src/feedback/routes.ts",
    "server/src/auth/routes.ts",
  ]) {
    const source = readFileSync(fileURLToPath(new URL(file, root)), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    assert.match(source, /fill-time\.js/, `${file} reads the shared rule`);
    assert.doesNotMatch(
      source,
      /\b3_000\b|\b3000\b|24 \* 60 \* 60_000/,
      `${file} has no copy of the numbers`,
    );
  }
});
