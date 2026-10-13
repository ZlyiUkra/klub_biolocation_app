// The save-time Markdown renderer (task T026 of specs/001-self-hosted-club-site; research.md section 3).
//
// An entry is rendered once, when it is saved, and the row keeps the HTML, the headings for the table of contents,
// the plain text for search, the card summary and the version stamp of the pipeline that produced them. A page then
// only reads and sends; it never renders Markdown on a request.
//
// The processor is the one Astro itself uses (`createMarkdownProcessor` of @astrojs/markdown-remark), fed with the
// options in src/markdown/options.ts, the same object `astro.config.mjs` spreads, so a formula, a code block and a
// typographic quote come out as they do in today's build. What this module adds in front of those options is the
// project's own sanitizer, `remarkNoRawHtml`: raw HTML and script-scheme links never reach the output, and they are
// gone before Shiki and KaTeX run (the reason the sanitizer is a remark plugin of ours is in its file).
//
// The plain text and the summary are not computed here: `plainifyMarkdown` and `summary` of src/lib/summary.ts are
// the site's rule for both, and a second implementation would drift from it.

import {
  createMarkdownProcessor,
  type MarkdownHeading,
  type MarkdownProcessor,
} from "@astrojs/markdown-remark";
import { plainifyMarkdown, summary } from "../../../src/lib/summary.js";
import {
  markdownOptions,
  renderVersion,
} from "../../../src/markdown/options.js";
import { remarkNoRawHtml } from "../../../src/markdown/remark-no-raw-html.js";

export type RenderedHeading = MarkdownHeading;

export type RenderedMarkdown = {
  /** The article body as the site shows it. */
  html: string;
  /** Headings for the table of contents, in document order. */
  headings: RenderedHeading[];
  /** The text of the body with markup removed, for the search index. */
  plainText: string;
  /** The card summary, by the rule of `src/lib/summary.ts`. */
  summary: string;
  /** The pipeline version that produced this; a lower stored value is re-rendered on read. */
  renderVersion: number;
};

let processor: Promise<MarkdownProcessor> | undefined;

// One processor for the life of the process: creating it loads the highlighter, which is the slow part.
function getProcessor(): Promise<MarkdownProcessor> {
  processor ??= createMarkdownProcessor({
    ...markdownOptions,
    // The sanitizer goes first so that nothing downstream ever sees raw HTML or a script-scheme address.
    remarkPlugins: [remarkNoRawHtml, ...markdownOptions.remarkPlugins],
  });
  return processor;
}

/** Renders the body of an entry (its Markdown without the front matter). */
export async function renderMarkdown(
  source: string,
): Promise<RenderedMarkdown> {
  const rendered = await (await getProcessor()).render(source);
  return {
    html: rendered.code,
    headings: rendered.metadata.headings,
    plainText: plainifyMarkdown(source),
    summary: summary(source),
    renderVersion,
  };
}
