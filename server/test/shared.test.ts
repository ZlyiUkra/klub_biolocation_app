// The modules the site and the backend share (T025 of specs/001-self-hosted-club-site; constitution III).
//
// They live in the site's src/ so that there is one copy of each rule: a card summary, a post's address, a post's
// front matter, the Markdown options. The backend compiles and runs them from there (server/tsconfig.json, rootDir).
// Two things must stay true, and this file checks both: they import nothing from Astro's virtual modules (the
// backend has no Astro runtime), and they do what the site relies on when run under plain Node.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { postFields } from "../../src/content/post-fields.js";
import { formatIsoDate } from "../../src/lib/date.js";
import { postUrl } from "../../src/lib/post-url.js";
import { summary } from "../../src/lib/summary.js";
import { guestViewer } from "../../src/lib/viewer.js";
import { markdownOptions } from "../../src/markdown/options.js";

const shared = [
  // Added 2026-10-10 (T031): the wire types and the site's client of the backend are plain modules too.
  "src/content/api-types.ts",
  "src/lib/api-client.ts",
  // Added 2026-10-10 (T033): the viewer type and the guest.
  "src/lib/viewer.ts",
  // Added 2026-10-10 (T034): the reading time rule.
  "src/lib/reading-time.ts",
  "src/content/post-fields.ts",
  // Added 2026-10-10 (T150): the rules for a video's text.
  "src/content/video-guards.ts",
  "src/lib/date.ts",
  // Added 2026-10-10 (T162): the rules of cutting a list into pages and years.
  "src/lib/pagination.ts",
  // Added 2026-10-11 (T043): the session lifetimes by tier.
  "src/lib/session-lifetimes.ts",
  // Added 2026-10-11 (T056): the redirect-after-sign-in rule, used by the backend's routes and the site's middleware.
  "src/lib/next-path.ts",
  // Added 2026-10-11 (T067): the handover cooling period and the recovery code count.
  "src/lib/handover-rules.ts",
  // Added 2026-10-10 (T163): the rules of the search, run by the backend and by the page script.
  "src/lib/search-rules.ts",
  "src/lib/post-url.ts",
  // Added 2026-10-13 (T109): the feedback form's topics and lengths, read by the route and by the form.
  "src/lib/feedback-rules.ts",
  // Added 2026-10-13 (T188): the fill-time rule, read by the feedback and sign-up routes and the sign-up page.
  "src/lib/fill-time.ts",
  "src/lib/summary.ts",
  "src/markdown/options.ts",
  "src/markdown/remark-no-raw-html.ts",
];

test("the shared modules import nothing from Astro's virtual modules", () => {
  const root = new URL("../../../../", import.meta.url);
  for (const file of shared) {
    const source = readFileSync(fileURLToPath(new URL(file, root)), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(
      source,
      /from\s+["'](?:astro:[^"']+|astro)["']/,
      `${file} must not import "astro" or an "astro:" module`,
    );
  }
});

test("a post's address is built in one place", () => {
  assert.equal(postUrl({ slug: "map-dowsing" }), "/posts/map-dowsing/");
});

test("the card summary is cut by the site's rule", () => {
  const long = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
  const cut = summary(long);
  assert.ok(cut.length <= 141, "at most 140 characters and an ellipsis");
  assert.ok(cut.endsWith("…"));
});

test("front matter is checked by the site's schema", () => {
  const ok = postFields.safeParse({
    title: "T",
    date: "2026-09-04T12:00:00+03:00",
    tags: ["Pendulum"],
  });
  assert.ok(ok.success);
  assert.deepEqual(ok.data.tags, ["pendulum"], "tags are lower-cased");
  assert.equal(postFields.safeParse({ date: "2026-09-04" }).success, false);
});

test("the Markdown options carry math and the highlighter themes", () => {
  assert.equal(markdownOptions.remarkPlugins.length, 1);
  assert.equal(markdownOptions.rehypePlugins.length, 1);
  assert.deepEqual(markdownOptions.shikiConfig.themes, {
    light: "github-light",
    dark: "github-dark",
  });
});

test("a date is formatted by the site's rule", () => {
  assert.match(
    formatIsoDate(new Date("2026-09-04T12:00:00+03:00")),
    /^2026-09-0[34]/,
  );
});

test("a guest viewer is a new object with no account every time", () => {
  const a = guestViewer();
  assert.deepEqual(a, { userId: null, status: "guest" });
  a.status = "admin";
  assert.equal(guestViewer().status, "guest");
});
