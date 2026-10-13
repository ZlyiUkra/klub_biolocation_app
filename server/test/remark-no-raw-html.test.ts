// The project's own sanitizer plugin (src/markdown/remark-no-raw-html.ts; T026 wires it into the renderer).
//
// It is loaded the way scripts/check-content-admin.mjs loads src/content/post-fields.ts: the source is transpiled with
// the project's TypeScript and imported from a data URL, which works because the plugin has no runtime imports and
// because server/ cannot compile files outside its own folder. It is then run inside the real processor,
// `createMarkdownProcessor` of @astrojs/markdown-remark, so the order of the pipeline is the production one.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import ts from "typescript";

type Render = (source: string) => Promise<string>;
let render: Render;

before(async () => {
  const file = fileURLToPath(
    new URL("../../../../src/markdown/remark-no-raw-html.ts", import.meta.url),
  );
  const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const loaded: unknown = await import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );
  assert.ok(
    typeof loaded === "object" &&
      loaded !== null &&
      "remarkNoRawHtml" in loaded &&
      typeof loaded.remarkNoRawHtml === "function",
    "the module exports remarkNoRawHtml",
  );
  const plugin = loaded.remarkNoRawHtml as () => () => void;
  const processor = await createMarkdownProcessor({
    remarkPlugins: [plugin],
    syntaxHighlight: false,
  });
  render = async (source) => (await processor.render(source)).code;
});

test("block and inline raw HTML is removed, the text around it stays", async () => {
  const html = await render(
    'before\n\n<script>alert(1)</script>\n\nmiddle <b onclick="x()">bold</b> and <img src=x onerror=alert(1)> end\n\n<div class="callout">boxed</div>\n\nafter',
  );
  assert.doesNotMatch(html, /<script|<b|<img|<div|onclick|onerror|alert/i);
  for (const word of ["before", "middle", "end", "after"]) {
    assert.match(html, new RegExp(word));
  }
});

test("a link keeps its text when its address is a script", async () => {
  const html = await render(
    "[plain](javascript:alert(1)) [mixed](JaVaScRiPt:alert(2)) [vb](vbscript:x) [data](data:text/html;base64,AAA) [ok](https://example.org/) [rel](/posts/a/) [anchor](#top) [mail](mailto:a@b.c)",
  );
  assert.doesNotMatch(html, /javascript:|vbscript:|data:/i);
  for (const text of ["plain", "mixed", "vb", "data"]) {
    assert.match(html, new RegExp(text), `the text of "${text}" survives`);
  }
  for (const href of [
    "https://example.org/",
    "/posts/a/",
    "#top",
    "mailto:a@b.c",
  ]) {
    assert.ok(html.includes(`href="${href}"`), `${href} is kept`);
  }
});

test("a script scheme hidden by control characters or entities is still caught", async () => {
  const html = await render(
    "[a](java&#10;script:alert(1)) [b](&#106;avascript:alert(2)) [c](<java\tscript:alert(3)>)",
  );
  assert.doesNotMatch(html, /script:/i);
});

test("an image or a reference definition with a script address is dropped", async () => {
  const html = await render(
    "![pic](javascript:alert(1)) ![fine](/images/a.png)\n\n[ref]: javascript:alert(2)\n\nSee [ref].",
  );
  assert.doesNotMatch(html, /javascript:/i);
  assert.match(html, /src="\/images\/a\.png"/);
});

test("code, inline code and ordinary Markdown are left alone", async () => {
  const html = await render(
    "## Heading\n\n`<script>` in code and **bold**\n\n```html\n<div>shown, not run</div>\n```\n\n- one\n- two\n",
  );
  assert.match(html, /<h2/);
  assert.match(html, /&#x3C;script>|&lt;script>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /&#x3C;div>shown, not run|&lt;div>shown, not run/);
  assert.match(html, /<li>one<\/li>/);
});
