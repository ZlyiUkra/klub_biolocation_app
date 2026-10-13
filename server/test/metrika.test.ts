// Yandex Metrika must stay on the site (the owner, 2026-10-12: "it must work on our site, never remove it"). This test
// fails when a change - the removal of Clerk (T167), a layout clean-up, a Content-Security-Policy written for the new
// server - takes the counter out of the layout, so that it is noticed in a test run and not in the club's statistics.
// The counter and its settings are described in METRIKA.md.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const layout = readFileSync(
  fileURLToPath(new URL("../../../../src/layouts/Base.astro", import.meta.url)),
  "utf8",
);

test("the layout loads the Yandex Metrika counter, with its init call, its page hit and its no-script pixel", () => {
  assert.ok(
    layout.includes("https://mc.yandex.ru/metrika/tag.js?id=113224698"),
  );
  assert.ok(layout.includes('ym(113224698, "init"'));
  assert.ok(layout.includes('ym(113224698, "hit"'));
  assert.ok(layout.includes("https://mc.yandex.ru/watch/113224698"));
});
