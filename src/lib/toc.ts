// The table of contents of an article: the headings Astro hands back from render(), arranged into
// the nesting Hugo's .TableOfContents produces. Rendered by src/components/TocList.astro.
//
// Changed 2026-09-22: this file used to build the markup itself. It held renderList(), which
// concatenated `<ul>`, `<li>` and `<a>` into a string, and escapeHtml(), written here because a
// heading's text goes into that string raw, and TableOfContents.astro dropped the result in with
// set:html. Nothing was wrong with it - the escaping was correct - but it is markup assembled by
// hand in a project whose templating language exists to assemble markup, and the safety of every
// future edit depended on remembering to call escapeHtml. What is left here is the part that is
// really data: the tree. TocList.astro renders it with Astro.self (Astro 4, API Reference), which
// escapes text and attributes by itself, so there is no set:html and no escaping left to forget.
import type { MarkdownHeading } from "astro";

// Hugo's [markup.tableOfContents] defaults, which the theme does not override: every level from
// h1 to h6 takes part. startLevel is why a post whose first heading is an h2 gets an empty
// wrapping <li> - the h1 level is present in the tree with no heading of its own. That is what
// Hugo emits too, so it stays.
const startLevel = 1;
const endLevel = 6;

/**
 * One entry of the table of contents. `heading` is absent on a level that exists only to hold
 * deeper ones - see the note on startLevel above.
 */
export type TocNode = { heading?: MarkdownHeading; children: TocNode[] };

/** The headings of one article as a tree, in document order. Empty when there are no headings. */
export function tocTree(headings: MarkdownHeading[]): TocNode[] {
  const root: TocNode = { children: [] };
  for (const heading of headings) {
    if (heading.depth < startLevel || heading.depth > endLevel) continue;
    let parent = root;
    for (let level = startLevel; level < heading.depth; level++) {
      if (parent.children.length === 0) parent.children.push({ children: [] });
      parent = parent.children[parent.children.length - 1];
    }
    parent.children.push({ heading, children: [] });
  }
  return root.children;
}
