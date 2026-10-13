# src/markdown

Markdown pipeline code that belongs to this project and to its stack: Astro 4.16 with `@astrojs/markdown-remark`
5.3.0 (unified 11, remark-parse 11, mdast 4). Nothing in this folder is published or meant to be used elsewhere.

- `remark-no-raw-html.ts` - the project's own sanitizer, a remark plugin: raw HTML and script-scheme links are
  removed from the Markdown tree before anything is rendered. Why it is a plugin of our own and not a package is in
  the header of the file. Tests: `server/test/remark-no-raw-html.test.ts` and `server/test/render.test.ts`.
- `options.ts` (task T025, not written yet) will hold the one list of Markdown options that `astro.config.mjs` and the
  backend's save-time renderer both read.

Files here import nothing from Astro, so the backend can run them too. Keep it that way.
