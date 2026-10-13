// Markdown rendering (T018 of specs/001-self-hosted-club-site). Written before the renderer (T026), so it is red
// until then: `renderMarkdown` in server/src/content/render.ts throws "not implemented".
//
// Two things are specified here.
//
// 1. Parity (FR-004, research.md section 3): for every post that today's static build publishes, the HTML the
//    backend renders from the same Markdown equals the HTML in the article body of that build, byte for byte once
//    the whitespace Astro's template puts around the slot is trimmed. The reference is the post's own Markdown part of that body:
//    the route's separator and the comments widget after it are cut off by the capture script. The reference is captured by
//    scripts/capture-render-reference.mjs into server/test/fixtures/render/ while the site is still static; the
//    manifest there holds the SHA-256 of the Markdown file each reference came from, so a post edited after the
//    capture is reported as a stale reference and not as a rendering fault.
// 2. The sanitizer: raw HTML and script never reach the output, links with a script scheme do not survive, and
//    what the site relies on does - math classes and code blocks.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { renderMarkdown } from "../src/content/render.js";

// The compiled file lives in server/dist/test, the fixtures in server/test/fixtures, the posts in src/content.
const fixtures = new URL("../../../test/fixtures/render/", import.meta.url);
const posts = new URL("../../../../src/content/posts/", import.meta.url);

function readText(url: URL): string {
  return readFileSync(fileURLToPath(url), "utf8");
}

/** The Markdown after the front matter block, which is what a collection entry calls its body. */
function bodyOf(file: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(file);
  assert.ok(match, "the file starts with a front matter block");
  return file.slice(match[0].length);
}

const manifest: Record<string, string> = JSON.parse(
  readText(new URL("manifest.json", fixtures)),
);
const slugs = Object.keys(manifest).sort();

test("the reference covers every published post", () => {
  const onDisk = readdirSync(fileURLToPath(fixtures))
    .filter((f) => f.endsWith(".html"))
    .map((f) => f.slice(0, -5))
    .sort();
  assert.deepEqual(onDisk, slugs);
  assert.ok(slugs.length >= 23, "the capture holds the 23 posts of 2026-10-10");
});

for (const slug of slugs) {
  test(`post "${slug}" renders to today's build`, async () => {
    const source = readFileSync(fileURLToPath(new URL(`${slug}.md`, posts)));
    const sha = createHash("sha256").update(source).digest("hex");
    assert.equal(
      sha,
      manifest[slug],
      `src/content/posts/${slug}.md changed after the reference was captured; capture it again from a static build`,
    );

    const expected = readText(new URL(`${slug}.html`, fixtures)).trim();
    const rendered = await renderMarkdown(bodyOf(source.toString("utf8")));
    assert.equal(rendered.html.trim(), expected);
  });
}

test("raw HTML and script are removed", async () => {
  const cases: [string, RegExp][] = [
    ["a script block", /<script|alert\(1\)/i],
    ["an inline event handler", /onerror|<img/i],
    ["a frame", /<iframe|evil\.example/i],
    ["a styled block", /<div|<span|onclick/i],
    ["a form", /<form|<input/i],
  ];
  const sources = [
    "before\n\n<script>alert(1)</script>\n\nafter",
    'before <img src="x" onerror="alert(1)"> after',
    '<iframe src="https://evil.example/"></iframe>',
    '<div class="callout" onclick="steal()">boxed</div>\n\ntext <span style="x">inline</span>',
    '<form action="/api/x"><input name="a"></form>',
  ];
  for (const [index, [label, forbidden]] of cases.entries()) {
    const { html } = await renderMarkdown(sources[index] ?? "");
    assert.doesNotMatch(html, forbidden, `${label} must not reach the output`);
  }
});

test("the text around removed HTML survives", async () => {
  const { html } = await renderMarkdown(
    "before\n\n<script>alert(1)</script>\n\nafter",
  );
  assert.match(html, /before/);
  assert.match(html, /after/);
});

test("a link or an image with a script scheme does not survive", async () => {
  const { html } = await renderMarkdown(
    "[click](javascript:alert(1)) ![pic](javascript:alert(2)) [ok](https://example.org/)",
  );
  assert.doesNotMatch(html, /javascript:/i);
  assert.match(html, /href="https:\/\/example\.org\/"/);
});

test("math keeps its KaTeX markup", async () => {
  const inline = await renderMarkdown("Energy is $E = mc^2$ here.");
  assert.match(inline.html, /class="katex"/);
  const display = await renderMarkdown("$$\n\\int_0^1 x\\,dx\n$$");
  assert.match(display.html, /class="katex-display"/);
});

test("a fenced code block keeps its highlighted markup", async () => {
  const { html } = await renderMarkdown("```js\nconst answer = 42;\n```\n");
  assert.match(html, /<pre class="astro-code/);
  assert.match(html, /style="background-color:/);
  assert.match(html, /answer/);
});

test("the pipeline stamp is a stable positive integer", async () => {
  const a = await renderMarkdown("text");
  const b = await renderMarkdown("other text");
  assert.ok(Number.isInteger(a.renderVersion) && a.renderVersion > 0);
  assert.equal(a.renderVersion, b.renderVersion);
});
