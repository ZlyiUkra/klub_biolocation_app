// The one list of Markdown options of the site (task T025 of specs/001-self-hosted-club-site).
//
// Two places turn Markdown into HTML: `astro build` and `astro dev` for the pages as they are today, and the
// backend's save-time renderer (server/src/content/render.ts, T026) for what the database stores. They must produce
// the same bytes - a post's formula, its code block, its smart quotes - so both read this object, and neither
// carries a copy. Moved here from `astro.config.mjs`, where the same three entries stood, on 2026-10-10.
//
// What is NOT in this list, on purpose: the project's own sanitizer, `remarkNoRawHtml`
// (src/markdown/remark-no-raw-html.ts). The pages are still built by Astro for the video entries, whose members-only
// block is raw HTML (`<div data-members-only>`) until phase 4 moves it into its own column; stripping raw HTML in the
// site-wide configuration would remove that block. The backend adds the sanitizer in front of these plugins itself,
// for the posts and video descriptions it renders. A post carries no raw HTML today (checked 2026-10-10), so for
// the posts the two outputs are identical, which server/test/render.test.ts proves byte for byte.
//
// This file imports no Astro module, so the backend can load it.

import type { AstroMarkdownOptions } from "@astrojs/markdown-remark";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";

export const markdownOptions = {
  // Math is parsed out of the Markdown by remark-math and typeset at build time by rehype-katex (the owner's decision
  // of 2026-09-22; the long note in astro.config.mjs tells why client-side rendering was dropped).
  remarkPlugins: [remarkMath],
  rehypePlugins: [rehypeKatex],
  // Closest match to the theme's Chroma styles "github" / "github-dark" (MIGRATION-PLAN.md section 6).
  shikiConfig: {
    themes: { light: "github-light", dark: "github-dark" },
    wrap: false,
  },
} satisfies AstroMarkdownOptions;

// The version stamp of the pipeline, stored beside every rendered entry (`render_version`). A row whose stamp is lower
// than this is rendered again when it is read, so a change in how Markdown becomes HTML reaches every entry without a
// manual re-import. Raise it by hand whenever the options above, the sanitizer, or the version of a package in the
// pipeline changes; server/test/render-version.test.ts fails until it is raised, and says which input changed.
export const renderVersion = 1;
