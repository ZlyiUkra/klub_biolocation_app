// Captures "today's build" of every post body as the reference of T018 (specs/001-self-hosted-club-site).
//
// What the reference is: the HTML that the static build of the current site puts inside the article body
// (`div.article-prose` of dist/posts/<slug>/index.html) for the post's own Markdown - the route's separator and the
// comments widget that follow it in the same div are cut off, see `postBody` - taken after `npm run build`, one file per post under
// server/test/fixtures/render/, plus a manifest holding the SHA-256 of the Markdown source each file was captured
// from. server/test/render.test.ts renders the same Markdown with the backend's processor and compares.
//
// Why files and not a read of dist/ in the test: from T032 on the posts are rendered on demand, so dist/ no longer
// holds them; the reference has to be frozen while the site is still static. The manifest is how the test notices
// that a post changed after the capture (it then says so instead of reporting a false rendering fault).
//
// Run:  npm run build && node scripts/capture-render-reference.mjs
// It only works while `output` is "static". It overwrites the fixtures and nothing else.

import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path/posix";

const postsDir = "src/content/posts";
// Changed 2026-10-10 (T032): with the Node adapter the built pages are in dist/client.
const distPosts = "dist/client/posts";
const outDir = "server/test/fixtures/render";

/** Inner HTML of the first `div` whose class list contains `article-prose`, by balancing div tags. */
function articleBody(html) {
  const open = /<div\b[^>]*\bclass="[^"]*\barticle-prose\b[^"]*"[^>]*>/.exec(
    html,
  );
  if (!open) return null;
  const start = open.index + open[0].length;
  const tag = /<(\/?)div\b[^>]*>/g;
  tag.lastIndex = start;
  let depth = 1;
  for (let m = tag.exec(html); m; m = tag.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index);
  }
  return null;
}

// The route (src/pages/posts/[slug].astro) puts, after the rendered Markdown, an `<hr class="my-8 border-gray-200">`
// and the comments widget inside the same div. A thematic break written in Markdown renders as a bare `<hr>`, so
// the class string marks the route's own separator; everything from the last one on is not the post's text.
const routeSeparator = '<hr class="my-8 border-gray-200">';
function postBody(articleHtml) {
  const cut = articleHtml.lastIndexOf(routeSeparator);
  return cut === -1 ? articleHtml : articleHtml.slice(0, cut);
}

await mkdir(outDir, { recursive: true });
const manifest = {};
const skipped = [];

for (const file of (await readdir(postsDir))
  .filter((f) => f.endsWith(".md"))
  .sort()) {
  const slug = file.slice(0, -3);
  let built;
  try {
    built = await readFile(join(distPosts, slug, "index.html"), "utf8");
  } catch {
    skipped.push(`${slug} (not in dist: a draft or a future date)`);
    continue;
  }
  const body = articleBody(built);
  if (body === null) {
    console.error(`No article body found in dist/posts/${slug}/index.html`);
    process.exit(1);
  }
  const source = await readFile(join(postsDir, file));
  await writeFile(join(outDir, `${slug}.html`), postBody(body), "utf8");
  manifest[slug] = createHash("sha256").update(source).digest("hex");
}

await writeFile(
  join(outDir, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
  "utf8",
);
console.log(
  `Captured ${Object.keys(manifest).length} post bodies into ${outDir}`,
);
for (const s of skipped) console.log(`  skipped: ${s}`);
