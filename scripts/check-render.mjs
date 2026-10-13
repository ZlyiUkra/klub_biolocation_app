// `npm run check:render` (T029 of specs/001-self-hosted-club-site): does the backend render every post exactly as
// today's static build did?
//
// It is the byte comparison of server/test/render.test.ts as a command that tells the story instead of failing a
// test: one line per post, and for a post that differs, where the first difference is and a few characters of each
// side around it. The reference is the one captured by scripts/capture-render-reference.mjs (server/test/fixtures/
// render/); a post whose source changed since the capture is reported as a stale reference, not as a fault.
//
// Run:  npm run check:render      (builds the server first)
// Exit code 1 when any post differs or any reference is stale; 0 when all are identical.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path/posix";
import { pathToFileURL } from "node:url";

const fixtures = "server/test/fixtures/render";
const posts = "src/content/posts";
const rendererPath = "server/dist/server/src/content/render.js";

const { renderMarkdown } = await import(
  pathToFileURL(join(process.cwd().replaceAll("\\", "/"), rendererPath)).href
);

const manifest = JSON.parse(
  await readFile(join(fixtures, "manifest.json"), "utf8"),
);

// The text after the front matter, as a collection entry's body is.
function bodyOf(text) {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(text);
  if (!match) throw new Error("no front matter block");
  return text.slice(match[0].length);
}

const slugs = Object.keys(manifest).sort();
let identical = 0;
let different = 0;
let stale = 0;

for (const slug of slugs) {
  const source = await readFile(join(posts, `${slug}.md`));
  if (createHash("sha256").update(source).digest("hex") !== manifest[slug]) {
    console.log(
      `STALE      ${slug}  (the source changed after the reference was captured)`,
    );
    stale += 1;
    continue;
  }
  const want = (await readFile(join(fixtures, `${slug}.html`), "utf8")).trim();
  const got = (
    await renderMarkdown(bodyOf(source.toString("utf8")))
  ).html.trim();
  if (got === want) {
    console.log(`identical  ${slug}  (${got.length} characters)`);
    identical += 1;
    continue;
  }
  let at = 0;
  while (at < got.length && at < want.length && got[at] === want[at]) at += 1;
  const around = (text) =>
    JSON.stringify(text.slice(Math.max(0, at - 40), at + 80));
  console.log(
    `DIFFERENT  ${slug}  first difference at character ${at} (rendered ${got.length}, reference ${want.length})`,
  );
  console.log(`             rendered:  ${around(got)}`);
  console.log(`             reference: ${around(want)}`);
  different += 1;
}

console.log("");
console.log(
  `${slugs.length} posts: ${identical} identical, ${different} different, ${stale} stale reference${stale === 1 ? "" : "s"}`,
);
process.exit(different > 0 || stale > 0 ? 1 : 0);
