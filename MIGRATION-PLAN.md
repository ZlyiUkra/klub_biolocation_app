# Astro migration plan

Rewrite this Hugo site as an Astro 4 project with the same visual result. This file is written so that it can be executed step by step, in several short sessions, by a person or an AI assistant with limited context. Each phase ends with a check that can be run without judgement calls.

Hugo reference project: `../klub_biolocation`. Every `themes/void/...`, `layouts/...`, `content/...` and `public/...` path below is relative to it. What is already implemented is tracked in the "Progress" section directly below, section by section; [README.md](README.md), "Skeleton status", lists the same thing file by file. Keep both current when a step is finished.

## Progress

Note of 2026-10-10: the self-hosted rewrite (branch `main` of this repository, `specs/001-self-hosted-club-site/`) moved the rendering of every list, term page and post to the backend; the table below still describes the Astro port and its files, and the list code of `src/lib/lists.ts` now lives in `src/lib/pagination.ts` (the page output is byte for byte the same, compared by `npm run check:markup`). The rewrite's own log is `REWRITE.md`.

Note of 2026-10-12: the interface is in English and Russian (the current site got it that day; carried over here in plan phase 6, T176 to T181). Every string of the interface is once in `src/i18n/`; the table below still names the Hugo `en.toml` as its source for the theme's strings, which `src/i18n/strings.ts` now holds in both languages. The parity checks compare against the current site's build at `495e959` (T180); `npm run check:lang` is the language check.

Note of 2026-10-13: what the rewrite deferred to its plan phase 9 (mail confirmation and reset, PostgreSQL full-text search, argon2) is listed in section 11 with the condition under which each item starts. Nothing of it is built.

Note of 2026-10-12: plan phase 4 of the rewrite (lectures) is built; its owner check T085 is the one thing left. The video page's player, the paid lectures' access rule, the dates of access (a person's and a video's), the stream route for files on the server's volume and the provider adapters moved to the backend, and the access Worker of `workers/video-access/` is deleted. This document still describes the Astro port; the account is in README.md ("Video from the club's own server") and in `REWRITE.md`.

Note of 2026-10-12 (later): plan phase 5 of the rewrite (the audience on every surface) is built; its owner check T093 is the one thing left. `entry_view` knows the members, restricted, named-person and teaser audiences, a locked entry has its own page and card, the feeds, the sitemap and the site's search carry cache headers by audience, and the visibility rule is a function of the row's columns with an index for the neighbour lookups. This document still describes the Astro port; the account is in README.md ("The audience holds on every surface") and in `REWRITE.md`.

Note of 2026-10-13: plan phase 7 of the rewrite (comments, reactions, feedback and settings) is built and its owner check T113 passed on 2026-10-13 at the owner's word; T111 (the mailbox to send from) moved to plan phase 8. The previous comment service is gone from the pages: the comments and the six reactions are the site's own, the feedback form posts to the club's own route and is mailed by a worker, and the superuser's settings page holds the recipient and the locked-or-hidden switch. The rows below that name Disqus describe the Astro port and stay as history; the account is in `README.md` ("Comments, reactions, feedback and settings") and `REWRITE.md` (the session log of 2026-10-13).

Note of 2026-10-12 (latest): plan phase 6 of the rewrite (content administration, with the interface languages) is built; its owner check T102 is the one thing left. Posts and videos are added, edited, deleted and restored at `/admin/posts/` and `/admin/videos/` against the club's own backend, with the audience, named people, teaser, preview and conflicts; a video's link (YouTube, VK, Rutube, Vimeo, Odnoklassniki, Yandex Disk) or an uploaded file is managed from the form, with the disk rule; pictures are uploaded or linked into a text; a lecture can be copied. The Worker that wrote posts to GitHub (`workers/content-admin/`) and everything that served it is deleted. This document still describes the Astro port; the account is in README.md ("Content administration on the club's own backend") and in `REWRITE.md`.

Status as of 2026-09-22. "Stub" means the file and its route exist and the build is green, but the page still renders placeholder markup and the file carries a `TODO(migration §N)` comment naming its Hugo source.

| Plan section                                         | Status      | Where it stands                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §2 Phase 0 - freeze the reference                    | Partly      | Route list and compiled CSS frozen (`reference/hugo-routes.txt`, `reference/hugo-main.css`). **Step 3, the reference screenshots, is still missing**                                                                                                                                                                                    |
| §3.1 Scaffold                                        | Done        | Astro 4.16, `@astrojs/tailwind` 5, Tailwind 3.4, MDX, remark-math, Prettier                                                                                                                                                                                                                                                             |
| §3.2 `main.css` to Tailwind 3                        | Done        | All 1,219 theme rules pasted verbatim; every `@apply` block verified to compile to the same values as the Hugo CSS. See amendment 1                                                                                                                                                                                                     |
| §3.3 `custom.css`                                    | Done        | Copied unchanged                                                                                                                                                                                                                                                                                                                        |
| §4 `baseof.html` -> `Base.astro`                     | Done        |                                                                                                                                                                                                                                                                                                                                         |
| §4 `head.html` -> `Head.astro`                       | Done        | Title logic, theme bootstrap, anti-flash style, favicons, fonts, CDN tags                                                                                                                                                                                                                                                               |
| §4 `social_meta.html` -> `SEO.astro`                 | Changed     | The colleague's `SEO.astro` (2026-09-17) renders the head meta from `Base.astro`; `SocialMeta.astro` was deleted that day. Not a port: a post still gets `og:type` `website`, see ARTICLE-PAGE-FIX.md 7.1                                                                                                                               |
| §4 `list.html` -> `CardList.astro`                   | Done        | Shared by /posts/ and /categories/<slug>/. Paginated since 2026-09-19, 5 posts a page, every list by year with a year switcher, through `ListByYear.astro` - see [PAGINATION.md](PAGINATION.md)                                                                                                                                         |
| §4 `tag.terms.html`, `tag.html` -> tag pages         | Done        | The Tags menu item and every /tags/<slug>/, paginated since 2026-09-19, by year since that evening                                                                                                                                                                                                                                      |
| §4 `about/single.html` -> `about.astro`              | Done        | `page/about.html` is dead code in this site and was not ported                                                                                                                                                                                                                                                                          |
| §4 `header.html` + `menu.html` -> `Header`/`Menu`    | Done        | Includes the theme toggle button. See amendment 3                                                                                                                                                                                                                                                                                       |
| §4 `footer.html` -> `Footer.astro`                   | Changed     | The colleague's own footer (2026-09-13), not a port: social links from `src/config.ts`, a visit counter Hugo has not. The theme link typo (ARTICLE-PAGE-FIX.md, part B) is still open                                                                                                                                                   |
| §4 `home.html` -> `index.astro` + `Carousel.astro`   | Done        | Full-bleed carousel, title block, round menu buttons                                                                                                                                                                                                                                                                                    |
| §4 `single.html` -> `Post.astro`                     | Done        | Renders since 2026-09-17 (the colleague's `ArticleLayout.astro`: sidebar, share links, Disqus); on plain props, shared with the videos, since 2026-09-22. Not yet diffed against Hugo, see §8                                                                                                                                           |
| §4 `category.terms.html` -> `categories/index.astro` | Done        | The Categories menu item. Accordion, counts, dates, back-link                                                                                                                                                                                                                                                                           |
| §4 `Callout.astro`, `Disqus.astro`                   | Partly      | `Disqus.astro` is the colleague's component (2026-09-17), on every post and video; `Callout.astro` is still the stub                                                                                                                                                                                                                    |
| §4 `en.toml` -> `src/i18n/strings.ts`                | Done        | All keys ported; the two that take a value in Hugo are functions                                                                                                                                                                                                                                                                        |
| §5.1-5.4 Collections, drafts, slugs, reading time    | Done        | `src/content/config.ts`, `src/lib/*.ts`, `src/config.ts`                                                                                                                                                                                                                                                                                |
| §5.5 Route parity                                    | Done        | Only the nine Hugo-only `/page/1/` aliases differ, as accepted in §9; since 2026-09-22 also the `/video/...` routes, which Hugo never had (VIDEO-PAGE.md)                                                                                                                                                                               |
| §6 Markdown pipeline (code blocks, footnotes)        | Not started |                                                                                                                                                                                                                                                                                                                                         |
| §7 Client-side JavaScript                            | Partly      | Theme bootstrap, CDN tags and the carousel script are in place; the theme toggle was pulled forward, and `site.js` became `site.ts` on 2026-09-22. The KaTeX delimiter call that was also pulled forward is gone with the move to build-time math (§6 row "Math"). The rest of `head/js.html` and `assets/js/main.js` are still to come |
| §8 Verification                                      | Partly      | Routes verified. Every page except the single-post layout diffed and screenshotted against Hugo in both themes; see the note below                                                                                                                                                                                                      |
| §9 Accepted deviations                               | Changed     | 2026-09-19: pagination is built, 5 posts a page (the owner's choice; Hugo's default is 10), and each page shows its own posts, unlike the theme's templates                                                                                                                                                                             |

**The self-hosted rewrite (2026-10-10).** This plan describes the Hugo to Astro port and its table is unchanged. The next stage, the move to an Express backend and PostgreSQL, has its own plan: the consilium verdict `.specify/consilium/2026-10-09-self-hosted-rewrite.md`, the feature `specs/001-self-hosted-club-site/` and [REWRITE.md](REWRITE.md). Its phase 0, the skeleton, is built and checked (tasks T001 to T017, owner check passed 2026-10-10). Phase 1, posts from the database, is next. (Status of 2026-10-11: plan phases 0 to 2 are done and accepted by the owner; phase 3, the statuses, the administrators and the superuser, is built through T072 and waits for the owner's check T074; the running record is `REWRITE.md` and the tracker, not this table.)

Section 4.1 tracks the same thing per **menu item**, which is the unit the work is actually done in. **All five Hugo menu items are ported**: Home, Categories, Posts, Tags and About, together with every page they link to; the single-post layout, the last of them, has rendered the article since 2026-09-17. The sixth item, Video, is the colleague's addition of 2026-09-20 to 2026-09-22 with no Hugo counterpart (VIDEO-PAGE.md).

Against the session split in §10: sessions 1 to 4 are complete (`Footer.astro` and the article page are the colleague's components rather than ports, see the rows above); session 5 has its table of contents (`TableOfContents.astro` and the sidebar in `ArticleLayout.astro`) but not the §6 rehype plugins; session 6 has not started.

**Verification reached so far.** Every route except the two single-post pages has been diffed against the Hugo build node by node and screenshotted at 1280x900 in both themes. `/`, `/about/` and `/tags/` are pixel-identical. The rest differ only at the level of antialiasing: the count digits on `/categories/` (55 pixels, max 4/255) and the year-badge gradient on the list and tag pages (up to 5,845 pixels, max 3/255 - see deviation 6 in §9). Markup differences are limited to what Hugo's own HTML minifier does to its output. `aria-current` on the menu matches Hugo on all six routes. `npm run check` exits 0, `npm run build` is green and `npm run dev` starts clean.

### Amendments to the plan, discovered while executing it

1. **The palette had to be pinned (§3.2).** Tailwind 4 did not merely re-encode the v3 palette in `oklch`, it re-tuned it: converted back to sRGB, `blue-600` (the link colour) differs by 17/255 and `green-600` by 22/255, while the greys differ by at most 3/255. §3.2's config table did not cover this. `theme.extend.colors` now pins the 19 colours the compiled Hugo stylesheet defines. Tailwind 4 tree-shakes its theme, so that file lists only the colours the site uses today: a colour class introduced by a later step must have its value re-derived from `reference/hugo-main.css` rather than taken from the Tailwind 3 default.
2. **`@types/node` added as a devDependency.** `Carousel.astro` reads `public/images/carousel/` at build time, which is what §4 prescribes; without the Node types `astro check` fails. This does not touch the pinned Astro or Tailwind versions.
3. **The active menu item is not highlighted, by design (§4).** The Hugo menu partial emits two `class` attributes on the current link, so the `active font-bold` half is dropped by the browser and `.active` is styled nowhere. `Menu.astro` reproduces the rendered result and emits only `aria-current`. Adding the highlight would be a design change, not a port fix. **Superseded on 2026-09-19 evening:** the owner asked for the highlight, and `Menu.astro` merges the classes now; see §9.
4. **`npm run build` alone is not a sufficient check.** Only `astro dev` runs Vite's dependency pre-scan, which searches `.astro` files for script and style tags without parsing the frontmatter - a literal script tag inside a _comment_ breaks the dev server while the production build stays green. Start the dev server once before calling a step done.

## 0. Goal and hard constraints

| Constraint    | Value                                                                                  |
| ------------- | -------------------------------------------------------------------------------------- |
| Target        | Astro **4.x** (not 5: the content API changed there; 4 is what the plan below assumes) |
| Runtime       | Node **20.x**, enforced by `engines` + `.npmrc engine-strict=true` as in this repo     |
| CSS           | Tailwind CSS **3.4.x** via `@astrojs/tailwind` 5.x. **Not** Tailwind 4                 |
| Visual parity | Pixel-level on every page type, light and dark. Deviations only from the list in §9    |
| URLs          | Identical to Hugo output (see §5). Trailing slashes everywhere                         |
| Language      | Code comments, docs and commit messages in English; site strings unchanged             |

The work happens in this folder (`klub_biolocation_astro/`), next to the Hugo repository, which stays intact as the reference to compare against. Before going further, commit the Hugo repository as it is (it currently has no commits at all).

## 1. Target stack (pin these)

```json
{
  "engines": { "node": ">=20.0.0 <21" },
  "dependencies": {
    "astro": "^4.16.0",
    "@astrojs/tailwind": "^5.1.0",
    "@astrojs/mdx": "^3.1.0",
    "tailwindcss": "^3.4.0"
  },
  "devDependencies": {
    "prettier": "^3.3.0",
    "prettier-plugin-astro": "^0.14.0",
    "prettier-plugin-tailwindcss": "^0.6.0",
    "remark-math": "^6.0.0"
  }
}
```

Notes:

- `@astrojs/mdx` is needed only for the `callout` shortcode (§6). If posts never use it, skip MDX and stay on `.md`.
- **Do not install `@tailwindcss/typography`.** The Hugo build does not have it active (verified: the compiled CSS contains no `--tw-prose-*` variables). `prose` and `not-prose` are plain hook classes styled by the theme's own `main.css`. Adding the plugin would change the typography.
- `prettier-plugin-tailwindcss` must be a version whose peer dependency allows `tailwindcss ^3` (0.6.x does).
- Scripts to keep the same muscle memory: `dev` = `astro dev`, `build` = `astro build`, `check` = `astro check && prettier --check .`, `fix` = `prettier --write .`.

## 2. Phase 0 - freeze the reference (Hugo side, 15 min)

1. In the Hugo project: delete `public/` first, then `npm run build`, and keep the result as the reference output. Hugo does not remove stale pages, and a dirty `public/` produced phantom routes (`/posts/hello-world/`, `/taxonomy/`) on the first attempt.
2. Save the route list: `find public -name index.html | sed 's|public||;s|index.html$||' | sort > ../klub_biolocation_astro/reference/hugo-routes.txt`. **Done**: `reference/hugo-routes.txt` (production build, so drafts are absent).
3. Take reference screenshots (light + dark) of: `/`, `/posts/`, one post, `/tags/`, one tag page, `/categories/`, one category page, `/about/`. Headless Edge works: `msedge --headless=new --screenshot=out.png --window-size=1280,2000 <url>` against `hugo server -D`. Force dark by temporarily adding the `dark` class in `head.html` (revert afterwards), or by setting `localStorage.theme = "dark"` in a normal browser.
4. Copy the compiled CSS aside: `cp public/css/main.*.css ../klub_biolocation_astro/reference/hugo-main.css`. **Done**: `reference/hugo-main.css`. It is the source of truth for "what does utility X actually render as today" (§3.2).

## 3. Phase 1 - scaffold and CSS

### 3.1 Scaffold

```sh
npm create astro@4 -- klub_biolocation_astro --template minimal --no-install --typescript strict
cd klub_biolocation_astro
npm i astro@^4.16 @astrojs/tailwind@^5 tailwindcss@^3.4 @astrojs/mdx@^3 remark-math@^6
npm i -D prettier prettier-plugin-astro prettier-plugin-tailwindcss@^0.6
```

`astro.config.mjs`:

```js
import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import mdx from "@astrojs/mdx";
import remarkMath from "remark-math";

export default defineConfig({
  site: "http://localhost:1313/", // set the real URL before deploying, as in hugo.toml
  trailingSlash: "always",
  build: { format: "directory" },
  integrations: [tailwind({ applyBaseStyles: false }), mdx()],
  markdown: {
    remarkPlugins: [remarkMath], // keeps $...$ intact; KaTeX itself renders client-side, see §7
    shikiConfig: {
      themes: { light: "github-light", dark: "github-dark" },
      wrap: false,
    },
  },
});
```

`applyBaseStyles: false` is required: the base layer is imported by our own `main.css` so that the order (base, theme rules, custom.css) is under control.

### 3.2 Convert `main.css` from Tailwind 4 syntax to Tailwind 3

Source: `themes/void/assets/css/main.css` (about 1,000 lines). Target: `src/styles/main.css`. Mechanical replacements:

| Tailwind 4 (current file)                                             | Tailwind 3 (target)                                                                    |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `@import "tailwindcss";`                                              | `@tailwind base; @tailwind components; @tailwind utilities;`                           |
| `@custom-variant dark (&:where(.dark, .dark *));`                     | delete; `darkMode: "class"` in `tailwind.config.cjs`                                   |
| `@source "hugo_stats.json";`                                          | delete; `content` globs in the config                                                  |
| `@theme { --font-bilingual: ...; --font-code: ...; --font-ui: ...; }` | delete; same three stacks under `theme.extend.fontFamily` as `bilingual`, `code`, `ui` |
| `var(--font-bilingual)` etc. in plain rules                           | keep working by re-declaring the three variables on `:root` in `main.css`              |
| `@apply ...` blocks                                                   | unchanged. Tailwind 3 accepts the same utilities used in this file                     |

Everything else in the file is plain CSS and moves verbatim.

`tailwind.config.cjs` - the part that guarantees parity. The theme was written with Tailwind 3 class names but is currently **compiled by Tailwind 4**, whose defaults differ. The rendered site is the v4 result, so v3 has to be configured to emit the same values. All numbers below were read from the compiled Hugo CSS:

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./src/**/*.{astro,html,md,mdx,js,ts}"],
  theme: {
    extend: {
      fontFamily: {
        bilingual: [
          '"Source Serif 4"',
          '"Noto Serif SC"',
          '"Source Han Serif SC"',
          '"Source Han Serif CN"',
          '"Songti SC"',
          "STSong",
          "ui-serif",
          "serif",
        ],
        code: [
          '"IBM Plex Mono"',
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          '"Liberation Mono"',
          '"Courier New"',
          "monospace",
        ],
        ui: [
          '"IBM Plex Sans"',
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "sans-serif",
        ],
      },
      // v4 renders `shadow-sm` and `shadow` identically (v3's `shadow` value). Keep the class names, change the values.
      boxShadow: {
        sm: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
        DEFAULT:
          "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
      },
      // v4 preflight: `border` without a colour class renders currentColor, not gray-200.
      borderColor: { DEFAULT: "currentColor" },
      // Bare `ring` and `blur` produce nothing in the current build; neutralise them instead of editing templates.
      ringWidth: { DEFAULT: "0px" },
      blur: { DEFAULT: "0" },
    },
  },
  plugins: [],
};
```

Values that are already identical between v3 and v4 and need nothing: `shadow-md`, `shadow-inner`, `rounded` (0.25rem), `rounded-md`, `rounded-lg`, `rounded-full`, `ring-2`, `blur-sm` (8px), `bg-gradient-to-*`, all spacing and text sizes.

Two preflight differences that cannot be configured: v3 sets `cursor: pointer` on buttons (v4 does not; the theme adds it explicitly where it matters, so no visible change) and v3 colours `::placeholder` gray-400 (the site has no inputs). Ignore both.

### 3.3 `custom.css`

Copy `assets/css/custom.css` to `src/styles/custom.css` unchanged and import it in the base layout **after** `main.css`. The `!important` rules keep working. Simplifying them (the theme is now first-party, so the palette variables could be used directly) is optional and should be a separate step after parity is confirmed.

Check for this phase: `astro build` succeeds and `dist/_astro/*.css` contains `.shadow-sm{--tw-shadow:0 1px 3px 0`, `.font-bilingual`, and the theme's `.dark body` rule.

## 4. Phase 2 - layouts and components

Hugo merges the project `layouts/` over `themes/void/layouts/`; the merged result is the source. Mapping:

| Hugo source (merged)                                                         | Astro target                                          | Notes                                                                                                                                         |
| ---------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `themes/void/layouts/_default/baseof.html`                                   | `src/layouts/Base.astro`                              | `<html class="h-full">`, `<body class="flex flex-col bg-gray-50 font-bilingual">`, header/main/footer                                         |
| `layouts/partials/head.html` (root override, use this one)                   | `src/components/Head.astro`                           | Title logic, theme script, anti-flash `<style>`, favicons, fonts, both CSS imports, Busuanzi script                                           |
| `themes/void/layouts/partials/social_meta.html`                              | `src/components/SocialMeta.astro`                     | OG/Twitter tags; needs `site` from config                                                                                                     |
| `themes/void/layouts/partials/header.html` + `menu.html`                     | `src/components/Header.astro`, `Menu.astro`           | Menu items from a `src/config.ts` array (copy `[[menus.main]]` from `hugo.toml`)                                                              |
| `themes/void/layouts/partials/footer.html`                                   | `src/components/Footer.astro`                         | Social links from `src/config.ts`; keep the "count links, change layout class" logic                                                          |
| `themes/void/layouts/partials/head/js.html`                                  | `src/scripts/site.ts` + `<script is:inline>`          | See §7. `site.js` until 2026-09-22, renamed so that `astro check` covers it                                                                   |
| `layouts/_default/home.html` (root override)                                 | `src/pages/index.astro` + `Carousel.astro`            | Slides from `public/images/carousel/` via `fs.readdirSync` at build time; `alt` map and interval as now                                       |
| `themes/void/layouts/_default/list.html`                                     | `src/pages/posts/[...page].astro`                     | Posts grouped by year with the year badge; paginated                                                                                          |
| `themes/void/layouts/_default/single.html`                                   | `src/layouts/Post.astro`                              | Date, reading time (`words / 200`, rounded), tags, TOC, content, Disqus placeholder                                                           |
| `themes/void/layouts/page/about.html` + `about/single.html`                  | `src/pages/about.astro`                               | Avatar URL and social links from `src/config.ts`                                                                                              |
| `themes/void/layouts/taxonomy/tag.terms.html` + `partials/terms.html`        | `src/pages/tags/index.astro`                          | Tag chips with counts                                                                                                                         |
| `themes/void/layouts/taxonomy/tag.html`                                      | `src/pages/tags/[slug]/[...page].astro`               | `getStaticPaths` over all tags and their pages                                                                                                |
| `themes/void/layouts/taxonomy/category.terms.html`                           | `src/pages/categories/index.astro`                    |                                                                                                                                               |
| (Hugo default list for one category)                                         | `src/pages/categories/[slug]/[...page].astro`         | Hugo uses `list.html` here; reuse the posts-list component                                                                                    |
| `themes/void/layouts/shortcodes/callout.html`                                | `src/components/Callout.astro`                        | Only if MDX is used (§6)                                                                                                                      |
| `themes/void/layouts/_default/_markup/render-codeblock.html`                 | rehype plugin, see §6                                 |                                                                                                                                               |
| `themes/void/layouts/_default/_markup/render-heading.html`                   | not needed; ids come from Astro, anchors from JS (§7) |                                                                                                                                               |
| `themes/void/layouts/partials/disqus_lazy.html` + `assets/js/disqus-lazy.js` | `src/components/Disqus.astro`                         | Only if a Disqus shortname is configured; otherwise render nothing, as now                                                                    |
| `themes/void/i18n/en.toml`                                                   | `src/i18n/strings.ts`                                 | Hugo currently uses **en** (no `defaultContentLanguage = 'ru'` set). Port `en.toml`, not `ru.toml`, to stay identical; switch later if wanted |

Rule for every template: copy the HTML and the class attributes verbatim, replace Go template syntax with Astro expressions, and do not "improve" markup. The class names are the visual contract.

Check: `astro build` renders `/`, `/posts/`, `/about/` and diff the `<body>` markup against the Hugo `public/` files (`diff <(sed -n '/<body/,/<\/body>/p' public/index.html) <(... dist/index.html)`). Differences should be limited to asset hashes and whitespace.

### 4.1 Porting one menu item at a time

The mapping table above is organised by Hugo source file. In practice the work is easier to order by **menu item**: each entry in the header menu is a page a visitor can actually reach, so porting one is a self-contained unit with its own check. This table says which files belong to which menu item.

| Menu item      | URL            | Hugo template(s)                                                       | Astro files                                              | Status |
| -------------- | -------------- | ---------------------------------------------------------------------- | -------------------------------------------------------- | ------ |
| **Home**       | `/`            | `layouts/_default/home.html` (root override)                           | `src/pages/index.astro`, `src/components/Carousel.astro` | Done   |
| **Categories** | `/categories/` | `themes/void/layouts/taxonomy/category.terms.html`                     | `src/pages/categories/index.astro`                       | Done   |
| **Posts**      | `/posts/`      | `themes/void/layouts/_default/list.html`                               | `src/pages/posts/[...page].astro`, `CardList.astro`      | Done   |
| **Tags**       | `/tags/`       | `themes/void/layouts/taxonomy/tag.terms.html` + `partials/terms.html`  | `src/pages/tags/index.astro`                             | Done   |
| **About**      | `/about/`      | `themes/void/layouts/about/single.html` (page/about.html is dead code) | `src/pages/about.astro`                                  | Done   |
| **Video**      | `/video/`      | none - added by the colleague on 2026-09-20, see VIDEO-PAGE.md         | `src/pages/video/`, `VideoLayout.astro`                  | Done   |

Pages that are **not** reachable from the menu but share its templates, and so are best done together with the menu item that owns them:

| URL                   | Hugo template                         | Astro file                                    | Owner menu item | Status |
| --------------------- | ------------------------------------- | --------------------------------------------- | --------------- | ------ |
| `/posts/<slug>/`      | `_default/single.html`                | `src/layouts/Post.astro`                      | Posts           | Done   |
| `/tags/<slug>/`       | `taxonomy/tag.html`                   | `src/pages/tags/[slug]/[...page].astro`       | Tags            | Done   |
| `/categories/<slug>/` | `_default/list.html` (Hugo's default) | `src/pages/categories/[slug]/[...page].astro` | Posts           | Done   |

Note on `/categories/<slug>/`: nothing links to it. The Categories page is an accordion that expands in place and links straight to `/posts/<slug>/`, so the category detail pages exist only because Hugo generates them. They share `list.html` with `/posts/`, which is why they are listed under the Posts menu item rather than Categories.

**The procedure for one menu item.** Every step is mechanical; none of them needs a judgement call.

1. Open the Hugo template named above, and only that one. `themes/void/i18n/en.toml` and the rendered `../klub_biolocation/public/<url>/index.html` are the other two files worth having open - the rendered one settles every question about what the template actually produces.
2. Copy the markup verbatim, class attributes included. Replace Go expressions with Astro ones; do not restructure. Where Hugo makes a non-anchor element clickable from a `data-` attribute, keep it that way.
3. `{{ i18n "key" }}` becomes `t.key` from `src/i18n/strings.ts`. Watch for `{{ i18n "key" | default "literal" }}`: if the key is missing from `en.toml`, Hugo renders the literal, so the literal belongs in the component and the key must **not** be invented in `strings.ts`.
4. Inline `script` and `style` blocks become `is:inline` (see the pitfalls in the project CLAUDE.md).
5. `npm run build`, then diff the markup against the Hugo page. Differences are acceptable only where Hugo's HTML minifier caused them: dropped `xmlns`, collapsed whitespace, shortened SVG path commands, self-closing versus explicit end tags, and the order of classes inside an attribute.
6. Screenshot the page against the Hugo build in both themes (see the project CLAUDE.md, "Visual check"). The target is zero differing pixels.
7. Delete the `TODO(migration §N)` comment, then update the Progress table above, this table's Status column, and the README.

## 5. Phase 3 - content and routes

### 5.1 Collection

`src/content/config.ts`:

```ts
import { defineCollection, z } from "astro:content";

const posts = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    draft: z.boolean().default(false),
    description: z.string().default(""),
    tags: z
      .array(z.string())
      .default([])
      .transform((t) => t.map((s) => s.toLowerCase())), // hugo.toml: tags = [":lower"]
    categories: z.array(z.string()).default([]),
  }),
});

export const collections = { posts };
```

### 5.2 Frontmatter conversion

Hugo files use TOML frontmatter (`+++`); Astro reads YAML only. Convert the five files by hand (`content/posts/*.md`, `content/about.md`): `+++` -> `---`, `key = 'value'` -> `key: 'value'`, arrays stay as `['a', 'b']`. `content/posts/_index.md` has no Astro equivalent (the list page is `posts/index.astro`; since 2026-09-19 `posts/[...page].astro`, which also renders the further pages). The `archetypes/posts.md` template becomes a documented snippet in CONTENT.md. (Done differently on 2026-09-19: the templates are files in `templates/`, and CONTENT.md, with the Hugo guide's headings, explains how to use them; its sections on images, the About page, the home page and the menu are still to be written.)

### 5.3 Drafts

Hugo runs with `-D`, so drafts are visible in dev and hidden in production. Replicate: `getCollection("posts", (p) => import.meta.env.DEV || !p.data.draft)`. Put this in one helper (`src/lib/posts.ts`) and use it everywhere, so no page forgets the filter. (Added 2026-09-19: the owner asked for Hugo's other default as well, `buildFuture = false` - a post dated in the future is left out of the published site until its date and is still shown in dev. The same helper does it; see [PAGINATION.md](PAGINATION.md), section 2.)

### 5.4 Slugs

Hugo's `urlize` for tag and category URLs: lowercase, trim, whitespace -> `-`, keep Unicode letters and digits. Cyrillic stays Cyrillic (`/tags/энергетика-человека/`). Implement once in `src/lib/urlize.ts` and use it for every taxonomy link and `getStaticPaths` param. Post slugs are the file names, already lowercase Latin.

### 5.5 Route parity

Every route in `hugo-routes.txt` (Phase 0) must exist in `dist/`. The Hugo output also contains 9 alias pages that are not real content: `/page/1/` under `/posts/` and under every tag and category (paginator aliases; see `reference/hugo-routes.txt`). Decide once: reproduce as `redirects` in `astro.config.mjs`, or drop them (they only matter for links that were already shared). Also add `src/pages/404.astro` (Hugo has none; hosting serves its own).

Check: `find dist -name index.html | sed 's|dist||;s|index.html$||' | sort > astro-routes.txt; diff hugo-routes.txt astro-routes.txt`. Expected diff: only the `/page/1/` alias pages (§9).

## 6. Phase 4 - Markdown pipeline

| Feature              | Hugo today                                                                                                                                                            | Astro                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Code blocks          | `render-codeblock.html`: `.code-block-container` with header (language label, copy button) and two Chroma variants, `github` / `github-dark`, line numbers as a table | Shiki with `github-light` / `github-dark` dual themes (closest match), plus a small rehype plugin that wraps `<pre>` in the same container/header markup and adds a line-number gutter. Colours will be near-identical, not byte-identical (§9)                                                                                                                                            |
| Heading ids          | `render-heading.html` + Hugo slugifier                                                                                                                                | Astro's default ids (github-slugger). Slugs of Cyrillic headings may differ slightly (§9)                                                                                                                                                                                                                                                                                                  |
| Heading anchor icons | Added by JS at runtime                                                                                                                                                | Same JS, unchanged (§7)                                                                                                                                                                                                                                                                                                                                                                    |
| TOC                  | `.TableOfContents` from Hugo, levels 1-6, unordered                                                                                                                   | Build `<nav id="TableOfContents"><ul>...` from `headings` returned by `post.render()`, nested by depth, same markup and ids as the theme's CSS expects                                                                                                                                                                                                                                     |
| Footnotes            | Goldmark: `.footnotes`, `.footnote-ref`, `.footnote-backref`, ids `fn:1` / `fnref:1`                                                                                  | remark-gfm emits `section[data-footnotes]`, ids `user-content-fn-1`, class `data-footnote-backref`. Add a 20-line rehype plugin that renames these to the Goldmark names so the theme's CSS and JS keep working                                                                                                                                                                            |
| Math                 | KaTeX auto-render from CDN, client-side, `$`/`$$` delimiters                                                                                                          | Changed 2026-09-22 by the owner: typeset at build time with `remark-math` + `rehype-katex`, stylesheet imported from the npm package in `ArticleLayout.astro`, no CDN tags and no client-side pass. The plan to the left was built and never worked: `remark-math` consumes the dollars auto-render looks for, so no formula was ever typeset. See README, "Math is typeset at build time" |
| `callout` shortcode  | `{{< callout title="..." type="tip" >}}...{{< /callout >}}`                                                                                                           | Convert those posts to `.mdx` and use `<Callout title="..." type="tip">...</Callout>` with markup copied from `callout.html`. Only two posts use it today                                                                                                                                                                                                                                  |
| Reading time         | `countwords / 200`, rounded, with the i18n label                                                                                                                      | Same formula on `post.body`                                                                                                                                                                                                                                                                                                                                                                |
| Raw HTML in Markdown | `unsafe = true`                                                                                                                                                       | Astro allows raw HTML in `.md` by default; nothing to do                                                                                                                                                                                                                                                                                                                                   |

## 7. Phase 5 - client-side JavaScript

The theme has no build-time JS framework. Keep it that way:

| Script                                                                                           | Where it goes                                                                                       |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Theme bootstrap (reads `localStorage.theme`, adds `dark` to `<html>`)                            | `<script is:inline>` in `Head.astro`, **before** any stylesheet                                     |
| Theme toggle, hash highlight, TOC active state, heading anchor copy (`head/js.html`, ~300 lines) | `src/scripts/site.ts`, loaded with `<script src>` via Astro (bundled, hashed). Copy verbatim        |
| Code copy buttons                                                                                | Same file; the rehype wrapper must emit `[data-code-block]` and `.copy-button` as the theme expects |
| Footnote back-link highlight                                                                     | Same file                                                                                           |
| `assets/js/main.js` (footnote cleanup inside callouts)                                           | Same file                                                                                           |
| Carousel (`home.html`, inline)                                                                   | `<script>` inside `Carousel.astro`; copy verbatim                                                   |
| Alpine.js, KaTeX + auto-render, Busuanzi                                                         | CDN `<script>` tags in `Head.astro`, same URLs and versions                                         |
| Disqus lazy loader                                                                               | Only with a configured shortname                                                                    |

Astro processes `<script>` tags by default (bundling, TS). Use `is:inline` only for the theme bootstrap and the CDN tags.

## 8. Phase 6 - verification

1. **Routes**: the diff from §5.5 is empty apart from the accepted list.
2. **Markup**: for each page type, diff the `<body>` of Hugo `public/` vs Astro `dist/` as in §4. Investigate every class-attribute difference; whitespace and asset hashes are fine.
3. **Screenshots**: repeat Phase 0 step 3 against `astro dev`, same viewport, light and dark, and compare with the reference images. `npx odiff` or `npx pixelmatch` gives a numeric diff; anything above a fraction of a percent needs a look.
4. **Console**: no errors on any page (theme toggle, copy buttons, carousel, KaTeX all initialise).
5. **Tooling**: `npm run check` exits 0; `.gitattributes`, `.npmrc`, `.vscode/settings.json` and `prettier.config.mjs` carried over from this repo (swap the Tailwind stylesheet path to `src/styles/main.css` and add `prettier-plugin-astro` to the overrides).
6. **Docs**: rewrite `README.md` and `CONTENT.md` for the new stack; keep the same headings so that the colleague finds things in the same places. Copy the "Colours and custom CSS" section almost verbatim - the mechanism is the same file.

## 9. Accepted deviations

Everything not on this list is a bug.

- Syntax-highlighting colours in code blocks: Shiki `github-light`/`github-dark` vs Chroma `github`/`github-dark`. Same palette family, not identical token colours.
- Heading ids for Cyrillic headings may differ (`github-slugger` vs Hugo). Only visible in the URL bar.
- Hugo's `/page/1/` alias pages unless reproduced as redirects.
- Search. The theme has no search page and no search of any kind; the only trace of one is `search_placeholder` in its `en.toml`. Added here on 2026-09-22 at the owner's request, as `/search/` plus `/search/data.json` and a magnifier in the header, with no dependency, with filters by section, category and tag. It is a departure from Hugo rather than a gap in the port - see README, "Search".
- `index.xml` (RSS) and `sitemap.xml`: not produced unless `@astrojs/rss` and `@astrojs/sitemap` are added. Both are small; add them once parity is done. Settled 2026-09-22: both are in the tree, and what unblocked them was the deploy address rather than parity - a feed and a sitemap are built from absolute addresses. The addresses differ from Hugo's: two feeds, `/rss.xml` and `/video/rss.xml`, instead of one `index.xml`, because posts and videos are separate subscriptions here; each carries the newest 20 entries. See README, "Feeds and sitemap".
- Fingerprinted asset paths (`/css/main.<hash>.css` -> `/_astro/*.css`). Invisible to visitors.
- Gradient interpolation. Tailwind 3 and 4 build the stop list for `bg-gradient-to-* from-<colour> to-transparent` slightly differently, so the year badge on the list and tag pages and its trailing rule differ by at most 3/255 per channel. Invisible; measured, not guessed.
- The home carousel runs under the fixed header (2026-09-09). This is the first deviation the owner asked for rather than one the stack forced, so it is worth stating plainly: `Base.astro` offsets the content by `pt-24` (6rem) while the header is shorter than that, which left a band of page background between the header and the carousel. The carousel now starts at the top of the document with `margin-top:-6rem`, and the same 6rem is added back to its height, so nothing below it moves and the visible strip grows by whatever the gap used to be. Chosen over trimming `pt-24` because that value is verbatim theme markup shared by every page, and over a measured offset because the header height varies with the viewport. Consequence: `/` is no longer pixel-identical to Hugo, and its reference screenshot has to be retaken from the Astro build rather than the Hugo one. Everything below the carousel is still expected to match.
- A responsive menu below 640px (2026-09-09), asked for by the owner. Hugo's answer at narrow widths is to let the header scroll sideways, which puts menu items behind a scrollbar. Below 640px the horizontal menu and the theme toggle are now replaced by a hamburger that opens a panel under the header, with the theme toggle inside it; at 640px and up the header is exactly what Hugo renders. The new elements are the hamburger button and the panel, both `sm:hidden`, so they are `display:none` at the widths the parity screenshots are taken at - `/about/`, `/tags/` and `/categories/` are byte-identical to Hugo at 1280px after the change. `ThemeToggle.astro` was extracted because the switch now exists twice in the document; it lost its `id`, which nothing referenced from CSS.
- The menu keeps its compact sizes until 768px instead of 640px (2026-09-09). Hugo grows the row at `sm:` - `sm:space-x-4`, `sm:text-lg`, `sm:px-3 sm:py-2` - but between 640px and 767px the grown row plus the title plus the theme toggle stopped fitting, and because the header is `fixed` the excess could not be scrolled to: at 700px the row reached 680px against 661px of usable width and the theme toggle was cut off. Those three bumps moved to `md:`, which closes the band without touching the hamburger threshold - the owner chose to keep that at 640px. Verified: nothing extends past the right edge at 645, 700, 760 or 1280px, and `/about/` is byte-identical to Hugo at both 800px and 1280px, so the change really is inert from 768px up.
- The carousel's pause button changes its icon (2026-09-09), asked for by the owner. The theme's own script assigns `iconPause.hidden = paused`, and `hidden` is an `HTMLElement` property while these icons are `SVGElement`, so the assignment did nothing and the button kept one icon forever - measured in a headless browser, and true of the Hugo site as well. The two assignments became `setAttribute`/`removeAttribute`; the markup, which declares the initial state with the same attribute, is untouched. This is a deliberate divergence from a faithful port: the port reproduced the bug correctly.
- The wordmark collapses to its initials below 400px (2026-09-09), asked for by the owner. Under that width the logo plus "Radiesthesia Club" no longer fit and `truncate` produced "Radiesthes...", which reads worse than a monogram. `Header.astro` derives the initials from `site.title` rather than hard-coding "RC", and swaps the two spans with the arbitrary variant `min-[400px]:`, so no Tailwind screen had to be added for a single rule. The anchor gained `aria-label={site.title}`: the accessible name is then the full title at every width, whichever span is painted. 400px is a judgement call, not a measurement - verified by eye at 320, 360, 400 and 480.
- The About page avatar doubles as a header logo below 640px (2026-09-09), asked for by the owner. `site.avatar` renders as a 32px round image inside the existing home link, `sm:hidden`, so it is `display:none` at 640px and up. The wordmark's `max-w-[40%]` had to become `max-w-[70%]` at the same breakpoint, otherwise the title truncated to "Radiesthes..."; `sm:max-w-md` above it is untouched. The image is `alt=""` on purpose - the link's own text already announces the site name.
- The tag cloud under the home carousel, and the round menu links hidden below 640px (2026-09-22). Hugo has neither: its home page has no cloud at all, and it prints the row of round links at every width. The owner asked for the cloud after a reference site he gave, and in the same conversation for the two blocks to trade places at the width where the header's menu becomes a hamburger, so `/` departs from the Hugo screenshot in a second way on top of the carousel offset above. Which block takes which side was settled the same evening, after one reversal: the cloud shows below 640px, the round links from 640px up. README, "The tag cloud under the carousel", carries the reasoning; `src/components/TagCloud.astro` carries the rest, including why it is HTML and not the canvas the reference uses.
- The tag chips under a card are title-cased (2026-09-22). Hugo prints `.Params.tags` verbatim, so a chip on `/posts/` and on a tag page reads "биолокация" there and now reads "Биолокация" here. It is the consequence of a mechanism the owner asked for the same evening: what a term is called is decided once, by `termLabel()` in `src/lib/lists.ts`, so that renaming a tag for the reader in `site.termLabels` reaches every place it is printed. The chips were the only ones outside that rule, and leaving them outside meant a renamed tag would keep its old word there. `CardList.astro` and the copy of those chips in `tags/[slug]/[...page].astro` both changed; the never-matching `$isCurrentTag` comparison beside them is untouched and still compares the raw name.
- Half the spacing in the header menu (2026-09-22). The reviewer found the items too far apart and the owner asked for the distance to be halved: from 1024px the gap between them was Hugo's `space-x-6` (24px) and is `space-x-3` now, and the links lost `lg:px-3` for the `px-1.5` they already carry below that width. About 132px narrower at desktop widths, so `/` and every other page differ from the Hugo screenshot in the header from 1024px up - which until this change was the one region that matched it exactly. The band from 640px to 1024px is untouched: those values are what makes six items, the title, the logo and the theme switch share one row at all.
- `main.overflow-x-auto` instead of `main` in the carousel stylesheet (2026-09-09). This one is a bug fix, not a deviation the owner asked for: `Base.astro` gives `main` the utility classes `overflow-x-auto sm:overflow-visible`, and a class selector beats an element selector, so Hugo's own `main{overflow:visible}` never applied below 640px. `overflow-x:auto` forces `overflow-y` to compute to `auto`, which made `main` a scroll container - it clipped the carousel's negative top margin, so the gap under the header reappeared on narrow screens, and the full-bleed carousel gave `main` a horizontal scrollbar along the bottom of the viewport. Hugo has both symptoms. Measured after the fix at 475-676px on `/`, `/about/`, `/posts/` and `/tags/hugo/`: no horizontal scrollbar and no inner scroll container anywhere. The home page still reports 7px of `scrollWidth` overflow, because `width:100vw` on the carousel counts the vertical scrollbar; `html{overflow-x:clip}` swallows it and no scrollbar appears.
- Pagination is not built. Hugo paginates lists at 10 items and the site has two posts, so Hugo currently emits no pagination markup at all and there is nothing to match. This has to be revisited before an eleventh post is published; Hugo's URLs are `/posts/page/2/`. **Superseded on 2026-09-19:** the owner asked for pagination, and it is built - 5 posts a page (the owner's choice, not Hugo's 10), Hugo's URLs, and the theme's own Previous and Next markup. The Posts list is paginated by year, as the owner asked: /posts/<year>/ holds only that year, and Previous and Next stay inside it; a year switcher above the list chooses the year. Tag and category pages were paginated across years for a few hours and are split by year too since the evening of 2026-09-19, at the owner's request, through the same code (`paginateByYear()`, `ListByYear.astro`): `/tags/<slug>/<year>/`, `/tags/<slug>/<year>/page/<n>/`, and the same for categories. One deliberate difference from the theme: each page shows only its own posts, whereas both theme templates loop over every post and would repeat the whole list on every page. Twenty-one posts were added so that the pages exist, and a stress test with up to 100 pages a year passed. See [PAGINATION.md](PAGINATION.md).
- The pagination buttons are the same on every list (2026-09-19), the owner's decision after the reviewer noticed two shapes. The theme's `list.html` gives Previous and Next `rounded-md` with dark-mode colours; its `tag.html` gives them `rounded-full` and no `dark:` classes, so the tag pages had round buttons that stayed white in dark mode. The Hugo site never rendered either block, so the difference was never visible there. `tags/[slug]/[...page].astro` now puts `list.html`'s classes on its buttons and page numbers, keeps tag.html's SVG arrows, and lists the theme's original classes in a comment. Later the same day the block became one component, `src/components/Pagination.astro`, for every list, and the owner chose tag.html's SVG chevrons for its arrows - so the Posts list and the category pages now show chevrons where `list.html` has the text arrows `&larr;` and `&rarr;`. The theme's original classes moved to a comment in the component.
- The light palette is no longer the theme's (commit `125643b`, 2026-09-19, made on GitHub while the pagination work was in progress and brought in with a rebase, unchanged). `custom.css` sets the page background to `#f5f5f4` (Tailwind `stone-100`, was the theme's `gray-50`, `#f9fafb`) and the panels - header bar, post cards, About card - to `#fafaf9` (`stone-50`, was white). Dark mode is untouched. The same commit added three candidate colours to `tailwind.config.cjs`, `bio-mint`, `bio-lavender` and `bio-warm`, faint tints of light grey; no class uses them yet. They had been written as a second `colors` key of `theme.extend`, which JavaScript resolves to the last one, so the pinned palette silently replaced them; they were moved into the pinned block, with the original lines kept as a comment. Nothing to check against the Hugo stylesheet: these colours are new.
- The hand-built links to tags and categories end with a slash (2026-09-19 evening): the tag chips on the cards, "All Tags" at the foot of a tag page and the category label above an article now point at `/tags/hugo/`, `/tags/` and `/categories/blog/`, where Hugo prints them without the slash. The owner reported the result: under `trailingSlash: "always"` Astro's dev and preview servers answer the slash-less address with 404 (GitHub Pages redirects it). The addresses of the pages are unchanged. See `REVIEW-FIXES.md` section 5.
- The menu highlights the item of the page being read (2026-09-19 evening), asked for by the owner. The theme meant to (`active font-bold` on the current page's entry, `ancestor font-semibold` on its section's) but emits those as a second `class` attribute, which browsers drop, so the Hugo site never showed it and amendment 3 kept it that way. `Menu.astro` merges the classes now, in the header row and in the hamburger panel, and its section match is wider than Hugo's `HasMenuCurrent`: Posts covers the year pages and the articles, Tags and Categories their term pages, where Hugo marked nothing; Home matches only the home page. The weight alone was too subtle, so the highlighted entry also takes the year switcher's colours, `bg-blue-50 text-blue-700` (`bg-slate-700 text-blue-300` in dark mode). See `REVIEW-FIXES.md` section 6.
- `main` is a stacking context (`isolate`, 2026-09-19 evening). A bug fix after a review remark, not a design change: hovering a footer social icon, whose hover scales it with a transition, made the text of the tag chips and the year badges flicker in Chromium, because their `z-10`/`z-20` stacked them against the document root and after the footer in paint order, where the compositor re-rasterises them for as long as the icon animates. Nothing visible changes; Hugo has the same flicker. See `REVIEW-FIXES.md` section 8.
- No card indent below 640px (2026-09-19 evening), after a review remark from a phone. The theme's `ml-8` on the card list under the year badge holds at every width; on a phone it left the first card 80px from the left edge and 48px from the right, so the cards read as pushed right. `PostList.astro` and the tag route use `sm:ml-8` now: the cards span the column below 640px, 48px on both sides, and from 640px up the indent is what it was, so the parity screenshots at 1280px are unaffected. Same threshold as the responsive menu. See `REVIEW-FIXES.md` section 9.
- A Video section (the colleague, 2026-09-20 to 2026-09-22): a sixth menu item, Video, between Posts and Tags, a `video` collection, and the routes `/video/`, `/video/<year>/`, `/video/<year>/page/<n>/` and `/video/<slug>/`. Hugo never had it, so those routes are the second accepted difference in the route list after the `/page/1/` aliases. Since 2026-09-22 evening the list and the article page are the posts' code on plain data, with the two entities kept apart; see `VIDEO-PAGE.md`.
- The site is closed to guests (2026-09-25 evening), the owner's decision with the first sign-in (`AUTH.md` section 10; the sign-in is Clerk since the branch `clerk-auth`). A guest sees the home page with the carousel alone and a header of Home, the theme switch and the sign-in icon; every other page sends a guest to the sign-in page. Hugo's site is open, so for a guest every page differs from the reference; for a signed-in member nothing changes, and the parity checks are taken signed in (a valid `kb-auth-expires` flag in localStorage is enough for the frame). The same evening the menu gained a seventh item, `Account`, the member's page, before About and members-only; Hugo's menu never had it. Reopened the same day after the colleague's review (`AUTH.md` section 11): a guest sees every page again, so the only departure left from this entry is the `Account` item, shown to members only.
- The site's own sign-in (2026-10-11, plan phase 2 of the self-hosted rewrite): accounts, sessions, limits, the three `/auth/` pages and the members import are built in the backend and the site, and the Clerk pages and flag are gone from the pages. `README.md`, "Sign-up and sign-in"; `REWRITE.md`. The statement above that the sign-in is Clerk describes the branch `clerk-auth` and is history.
- The carousel on a touch screen (2026-09-28), the colleague's proposal as the owner settled it. Hugo shows the arrows at every width, half-visible where there is no hover; on a device whose main pointer is coarse they are hidden now, since a swipe turns the photos there, and a finger held on the photo pauses it until it is lifted, so a long press no longer opens the browser's image menu. The pause button is 24px instead of 32px below 640px. With a mouse nothing changed except that the hover pause listens to a mouse only (`pointerenter` with `pointerType` "mouse"), because a tap on a phone set it through the compatibility mouse events and left the carousel paused. Checked in headless Edge with touch emulation: hold 7 s and the photo stays, release and it moves on, swipes both ways, a tap does not freeze it, the pause button pauses; with a mouse the arrows and the hover pause are as before.
- Every hover effect also shows while the element is pressed (2026-09-29, the colleague's request through the owner): a PostCSS plugin in `postcss.config.cjs` adds an `:active` twin to every `:hover` rule of the build, the theme's included, so a phone shows on a tap what a mouse shows on hover. Hugo's site has hover only. README, "Hover effects show on touch screens too". On 2026-09-30 the press became instant on a touch screen (`transition-duration: 0s` for the twins under `@media (hover: none)`), because the hover animations outlasted a tap.
- The hover background of the white controls in light mode (2026-09-30, from the Tailwind 3.4 audit the owner ordered): the pagination, the year switcher and the account page's buttons turn `gray-100` on hover, the previous/next cards under an article a faint blue. Hugo's `custom.css` paints every `.bg-white` with `!important` as ours does, so on the Hugo site these hovers never show; two rules in `custom.css` let them through. The feedback form's heading moved to the site's serif at the same time (the colleague's component, no Hugo counterpart). README, "Tailwind 3.4 audit".
- The sign-in icon sits 8px closer to the right edge (2026-09-28, kept by the owner after a look): `-mr-2` cancels the right half of its `p-2`, so the header's right gap reads 26px against the logo's 24px; it read 34px. Not a Hugo element - the icon is the colleague's - but it changes what the header looks like.

## 10. Suggested session split

Each block fits one short session with limited context; finish the check before moving on.

1. §2 + §3 (scaffold, CSS, config) - the build must be green with an empty page that already loads both stylesheets.
2. §4 for `Base`, `Head`, `Header`, `Footer`, `index.astro` with the carousel - compare the home page.
3. §5 + `posts/index.astro` + `Post.astro` - compare the list and one post.
4. Taxonomy pages + About - compare all four.
5. §6 rehype plugins (code blocks, footnotes) + TOC - compare a post with code, footnotes and math.
6. §7 scripts + §8 full verification + §9 review + docs.

Do not start a session by re-reading the whole Hugo theme: the tables above name the exact source file for each target, and the reference `public/` output shows what the result must look like.

## 11. Deferred items of the rewrite (plan phase 9)

Recorded 2026-10-13 (T132). The self-hosted rewrite (`specs/001-self-hosted-club-site/`) was delivered in plan phases 0 to 8 and deferred three independent items, sized at 3 to 6 days for all of them (plan.md, the phase table; item 9 of the verdict of 2026-10-09). None of them has a task: each starts only when its own condition below is met, and only at the owner's word.

- **Address confirmation and password reset by mail.**
  - Stands today: an account's address is not confirmed by mail and proves nothing about its holder, so it grants nothing beyond guest (FR-012a). A lost member password is reset by an administrator, who gives a temporary password that must be changed at the next sign-in (FR-042). The superuser's hand-over and recovery events are not announced by mail (RISKS.md, entry 3). Changing an account's own address waits for this item (T146).
  - Starts when: (1) a sending mailbox that its provider lets the server use exists and has passed `npm run mail:check` (T111 in plan phase 8; so far only the development outbox and a stand-in server have been exercised); (2) the owner has decided in which language letters to members are written, since the account holds no language and the choice stays with the device (spec.md, the note on languages; plan.md, open question 7); (3) the owner asks for it. The address must be confirmed before it is first used as a channel to members (the verdict of 2026-10-09).
  - Documentation servers the verdict names: `nodemailer-docs`, `owasp-docs`.
- **Full-text search in PostgreSQL.**
  - Stands today: the search runs on the server with the page's own rules and no morphology (T163). The owner decided on 2026-10-10 against PostgreSQL full-text search for now, because it would find other words than the page does today; it is a feature to ask for separately. At 10 000 posts a query that matches every post takes 14 ms, so there is no performance reason to move.
  - Starts when: the owner asks for stemming or ranking as a feature of its own, accepting that the results change. To settle then: the text search configuration (the dictionary list in the PostgreSQL 16 documentation has a Russian snowball stemmer and none for Ukrainian; the posts today are in Russian); that the search page keeps its look and its facets (SC-002); and that the audience rule still decides who may see a hit, as it does today.
  - Documentation server: `postgresql-docs`.
- **A change of the password hash to argon2.**
  - Stands today: scrypt from Node's own `crypto`, at the first setting of OWASP's Password Storage Cheat Sheet (N=2^17, r=8, p=1), chosen in place of argon2 so that no native package is needed. The stored string carries its parameters and `needsRehash` names the hashes to replace at the next sign-in, so a raise of cost needs no reset; a string of another algorithm is refused as a plain "false" (`server/src/auth/password.ts`).
  - Starts when: the owner prefers argon2 to scrypt and consents to the package, which the constitution's first principle asks of every new dependency (purpose, size, consent). Then `verifyPassword` must learn the new prefix and old hashes move at the next sign-in. Nothing in the rewrite needs it.
  - Documentation server: `argon2-docs`.
