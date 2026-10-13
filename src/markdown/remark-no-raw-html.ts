// remarkNoRawHtml - this project's own Markdown sanitizer. It is not a package, is not published anywhere and
// has no dependency of its own; it lives in this repository, is read by `astro.config.mjs` (through
// `src/markdown/options.ts`) and by the backend's save-time renderer, and is maintained with the project.
//
// What it does, in one sentence: a post or a video description may not carry raw HTML, and a link or an image may
// not point at a script, so both are removed from the Markdown syntax tree before anything is rendered.
//
// Why it is ours and why it is a remark plugin (research.md section 3; the finding of 2026-10-10):
// - In `@astrojs/markdown-remark` 5.3.0 the order is: Markdown tree (mdast) -> remark plugins -> HTML tree (hast) ->
//   Shiki -> the user's rehype plugins (KaTeX is one) -> `rehype-raw` -> stringify. `rehype-raw` is last, so while
//   a rehype plugin runs, raw HTML is still an unparsed string and Shiki's styled output is already there. A
//   package such as `rehype-sanitize` can only be placed in that gap: it would meet Shiki's inline styles and
//   strip them, and it would meet raw HTML before it is a tree. Nothing in the pipeline lets it run "before
//   KaTeX and Shiki", which is what the plan asks for.
// - A remark plugin runs first. Raw HTML in Markdown is an `html` node there, so removing it is a tree walk of a
//   few lines, Shiki and KaTeX only ever see what is already safe, and the rule can be read in one minute:
//   "no raw HTML in a post".
//
// Written for this stack: unified 11, remark-parse 11 and mdast 4, as shipped with @astrojs/markdown-remark 5.3.0
// (Astro 4.16). Its types come from `@types/mdast`, as type imports only, so the compiled file has no imports at
// all and can be loaded by plain Node in a test. A change of the Markdown processor's major version is a reason to
// re-read this file, not a thing that happens silently: server/test/render.test.ts and
// server/test/remark-no-raw-html.test.ts hold the behaviour.
//
// What it deliberately does not do:
// - It does not allow "safe" tags. A tag list is a policy that grows; no post needs one (checked on 2026-10-10: no
//   current post carries raw HTML). A page that needs a callout gets a component, not a `div` in Markdown.
// - It does not touch code, inline code or math: their text reaches the output escaped, and KaTeX runs with its
//   default `trust: false`, which refuses `\href` to a script.
// - It is the first layer, not the only one. The Content-Security-Policy header of phases 2 and 8 is the second.
//
// The video entries' members-only block (`<div data-members-only>`) is not handled here: from phase 4 it is stored in
// its own column and rendered by its own path (data-model.md, `videos.members_only_markdown`).

import type { Nodes, Parent, Root } from "mdast";

// Schemes a link may carry. No scheme at all (a path, `#anchor`, `?query`, `//host/path`) is always fine.
const allowedSchemes = new Set(["http", "https", "mailto", "tel"]);

/**
 * True when `url` is something a browser could run: it has a scheme and the scheme is not in the allowed list.
 * Browsers ignore tabs, newlines and other control characters inside a scheme (`java\nscript:`), so they are removed
 * before the scheme is read.
 */
function isUnsafeUrl(url: string): boolean {
  const compact = url.replace(/[\u0000- \u007f-\u009f]/g, "");
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(compact);
  return (
    scheme !== null && !allowedSchemes.has((scheme[1] ?? "").toLowerCase())
  );
}

/** The children of `parent` after the rules are applied; a link with an unsafe address is replaced by its text. */
function clean(parent: Parent): Nodes[] {
  const kept: Nodes[] = [];
  for (const child of parent.children as Nodes[]) {
    if (child.type === "html") continue;
    if (child.type === "definition") {
      if (!isUnsafeUrl(child.url)) kept.push(child);
      continue;
    }
    if (child.type === "image") {
      if (!isUnsafeUrl(child.url)) kept.push(child);
      continue;
    }
    if ("children" in child) {
      child.children = clean(child as Parent) as typeof child.children;
    }
    if (child.type === "link" && isUnsafeUrl(child.url)) {
      kept.push(...(child.children as Nodes[]));
      continue;
    }
    kept.push(child);
  }
  return kept;
}

/** The unified plugin: pass the function itself in `remarkPlugins`, with no options. */
export function remarkNoRawHtml() {
  return (tree: Root): void => {
    tree.children = clean(tree) as Root["children"];
  };
}
