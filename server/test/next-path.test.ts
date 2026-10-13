// The redirect after sign-in (T045 of specs/001-self-hosted-club-site; research.md section 5). The rule is `nextPath()`
// of `src/scripts/auth.ts`, which moved to the server unchanged in T051 (with a length cap added).
//
// Why the rule is what it is (the paid-video consilium of 2026-09-28, .specify/consilium/2026-09-28-paid-video-
// access.md): a test "starts with / and not //" let two addresses through that a browser reads as another host.
// `/\evil.example/` passes it and the URL parser treats the backslash as a slash; `/<TAB>/evil.example/` passes it too
// and the parser drops the tab. Both were followed by a headless browser to the other host. So the address is resolved
// the way the browser will resolve it, and only a result on this origin is kept: its path, query and fragment, never
// the raw string. This file pins both of those cases and the ones next to them.

import assert from "node:assert/strict";
import { test } from "node:test";
import { nextPath } from "../src/auth/next-path.js";

const origin = "https://club.example.test";
const fallback = "/auth/account/";
const next = (raw: string | null | undefined) =>
  nextPath(raw, origin, fallback);

test("a path of this site is followed, with its query and fragment", () => {
  assert.equal(next("/posts/map-dowsing/"), "/posts/map-dowsing/");
  assert.equal(
    next("/video/lecture-1/?t=90#part-2"),
    "/video/lecture-1/?t=90#part-2",
  );
  assert.equal(next("/"), "/");
});

test("nothing, empty, or not starting with a slash falls back", () => {
  for (const raw of [
    null,
    undefined,
    "",
    "posts/x/",
    "javascript:alert(1)",
    "data:text/html,x",
    "mailto:a@b.c",
  ]) {
    assert.equal(next(raw), fallback, String(raw));
  }
});

test("another origin falls back: a full address and a protocol-relative one", () => {
  for (const raw of [
    "https://evil.example/",
    "http://evil.example/steal",
    "//evil.example/",
    "///evil.example/",
    `https://club.example.test.evil.example/`,
    "https://club.example.test@evil.example/",
  ]) {
    assert.equal(next(raw), fallback, raw);
  }
});

test("the two cases of 2026-09-28 fall back: a backslash and a tab after the first slash", () => {
  assert.equal(
    next("/\\evil.example/"),
    fallback,
    "/\\host/ is read as //host",
  );
  assert.equal(
    next("/\t/evil.example/"),
    fallback,
    "the tab is dropped, leaving //host",
  );
  // The same through the other control characters the URL parser removes.
  assert.equal(next("/\n/evil.example/"), fallback);
  assert.equal(next("/\r/evil.example/"), fallback);
  assert.equal(next("/\\/evil.example/"), fallback);
  assert.equal(next("/\\\\evil.example/"), fallback);
});

test("what is kept is what the browser resolves, normalised, never the raw string", () => {
  assert.equal(next("/a/../b/"), "/b/");
  assert.equal(next("/a/./b/"), "/a/b/");
  // A tab inside a path is dropped by the parser, so what is returned has none.
  assert.equal(next("/pos\tts/x/"), "/posts/x/");
  // Percent-encoded forms stay encoded: they are an ordinary path on this site and harmless.
  assert.equal(next("/%5Cevil.example/"), "/%5Cevil.example/");
  assert.equal(next("/%09/evil.example/"), "/%09/evil.example/");
});

test("a very long address falls back instead of being echoed", () => {
  assert.equal(next("/" + "a".repeat(5000)), fallback);
  assert.equal(next("/" + "a".repeat(1000)), "/" + "a".repeat(1000));
});
