# Article page: wiring in the new components

Written on 2026-09-15 against `main` at `e68baaa` (the `src/` tree is identical to `855d46f`, "Article page"). It
explains why the article components added in the last commits do not appear on the site, and gives a verified fix.

The fix keeps the components and their markup. It connects them to the post route, repairs the calls that would
break the build, and brings the output in line with the Hugo template the components were ported from.

## 0. What is already applied

Updated on 2026-09-16 and again on 2026-09-22; the last paragraph of this section is the current state.

Applied, as a separate "make the checks pass" change:

- Step 3, the `t("key")` calls, in `PostNav.astro`, `ShareWidget.astro` and `TableOfContents.astro`.
- Part B, the malformed element in `Footer.astro` and the unused `busuanziScript` constant, replaced by a comment
  that points at `Head.astro`, where the counter script is loaded exactly as Hugo loads it from `head.html`.
- Typed props for `TableOfContents.astro`, `SEO.astro`, `SocialMeta.astro` and `Base.astro`, plus the local `site`
  object in `Base.astro` renamed to `seoSite` because it clashed with the import. The rendered pages are unchanged.
- The "has headings" condition for the table of contents moved into `ArticleLayout.astro`, so that Prettier can
  parse `TableOfContents.astro` (see step 8).
- `Content.astro` now destructures `Content` from `entry.render()`, which was the last type error in it. The file is
  still unused and step 2 still deletes it.
- The unused import in `src/lib/seo.ts`.

After that change `npm run check` is green (0 errors, 0 warnings), `npm run build` is green, and `npm run dev`
starts without the dependency-scan error.

Updated on 2026-09-22. The wiring (steps 1, 2 and 4 to 9) went in with the colleague's commit `1941a5c` of
2026-09-17, which also deleted `SocialMeta.astro` and `Content.astro`; the sidebar followed on 2026-09-18 and the
frame moved to plain props on 2026-09-22 (VIDEO-PAGE.md, section 4). Still open: the theme link typo in the footer
(part B, item 3); `DisqusLazy.astro`, which nothing imports; and from section 7, a post still carries `og:type`
`website` with no `article:*` meta (7.1; the head itself renders once now - one title, one description, one
`og:title` in the build of 2026-09-22) and the `telegram` placeholder (7.2).

## 1. Summary

The state of 2026-09-15, kept as written; section 0 says what has changed since.

- The post route `src/pages/posts/[slug].astro` renders `src/layouts/Post.astro`, which is still the `TODO` stub: a
  bare `<h1>` and the body. The live page `/posts/article/` shows exactly that.
- `src/components/Content.astro` was meant to be the entry point, but nothing imports it. It could not work from
  `src/components/` anyway: `getStaticPaths` only runs in `src/pages/`, and it renders `<Content />`, which is not
  defined in that file.
- So `ArticleLayout.astro`, `PostNav.astro`, `ShareWidget.astro`, `TableOfContents.astro`, `Terms.astro` and
  `DisqusLazy.astro` are never compiled. That is also why `npm run build` and the deployment stayed green.
- Wiring them in was not enough on its own: the build failed with `t is not a function`. Those calls are fixed now
  (step 3), so the wiring is what remains.
- A separate, older problem in `Footer.astro` broke `npm run dev` and `npm run check`. Fixed as well (part B).

## 2. Before you start

```
git pull
npm ci
```

Node 20 is required (`.npmrc` has `engine-strict=true`). Every push to `main` deploys the site, so run the checks in
section 5 locally before pushing.

## 3. Part A: the article page

### Step 1: pass headings and previous/next posts from the route

`getPosts()` returns posts newest first. In Hugo, `.NextInSection` on an older post points to the newer one: the Hugo
build of `/posts/article/` (the older post) shows only a "Next" link, to `/posts/radiesthesia-and-energy-fields/`.
So `next` is the element before the current one in the list, and `prev` the element after it. The logic in
`Content.astro` had them the other way round.

Replace `src/pages/posts/[slug].astro` with:

```astro
---
// One route per post: /posts/<file name>/, same as Hugo.
import type { InferGetStaticPropsType } from "astro";
import Post from "../../layouts/Post.astro";
import { getPosts } from "../../lib/posts";

export async function getStaticPaths() {
  // getPosts() is newest first. Hugo's .NextInSection on an older post points to the NEWER
  // one, so "next" is the element before this one in the list and "prev" the element after.
  // Checked against the Hugo build: /posts/article/ (older) shows only "Next".
  const posts = await getPosts();
  return posts.map((post, i) => ({
    params: { slug: post.slug },
    props: { post, next: posts[i - 1] ?? null, prev: posts[i + 1] ?? null },
  }));
}

type Props = InferGetStaticPropsType<typeof getStaticPaths>;

const { post, prev, next } = Astro.props;
const { Content, headings } = await post.render();
---

<Post post={post} headings={headings} prev={prev} next={next}>
  <Content />
</Post>
```

### Step 2: render ArticleLayout inside Base

`ArticleLayout.astro` renders only the `{{ define "main" }}` part of `single.html`. Used on its own, the page would
have no `<html>`, no head, no header and no stylesheet, so it has to sit inside `Base.astro`. Replace
`src/layouts/Post.astro` (this also removes its `TODO` comment) with:

```astro
---
// Single post layout (MIGRATION-PLAN.md §4): Base.astro, the port of baseof.html, around
// ArticleLayout.astro, the port of themes/void/layouts/_default/single.html. Kept as a thin
// wrapper so that src/pages/posts/[slug].astro stays the only file that knows about routing
// and about which posts are previous and next.
import Base from "./Base.astro";
import ArticleLayout from "./ArticleLayout.astro";
import type { MarkdownHeading } from "astro";
import type { Post } from "../lib/posts";

interface Props {
  post: Post;
  headings: MarkdownHeading[];
  prev: Post | null;
  next: Post | null;
}

const { post, headings, prev, next } = Astro.props;
---

<Base title={post.data.title} description={post.data.description}>
  <ArticleLayout entry={post} headings={headings} prev={prev} next={next}>
    <slot />
  </ArticleLayout>
</Base>
```

Then delete `src/components/Content.astro`. Its job is now done by the route.

### Step 3: fix the `t` calls - already applied

This was the error that broke the build as soon as the components were wired in:

```
t is not a function
```

`t` in `src/i18n/strings.ts` is an object, not a function; the finished pages read it as `t.back_to_home`. Every
`t("key")` has to become `t.key`:

```astro
{t("pagination_previous")}
```

becomes

```astro
{t.pagination_previous}
```

This affected `PostNav.astro`, `ShareWidget.astro` and `TableOfContents.astro`, and is done. `ArticleLayout.astro`
still has the import commented out and the strings written as literals, so the page would print the raw key:
`{"reading_time"}` renders the text `reading_time`. Step 4 fixes that; the full files in steps 4 to 8 all contain
the finished form.

### Step 4: ArticleLayout.astro

Differences from the Hugo template found by comparing the built page with `../klub_biolocation/public/posts/article/`:

- `datetime` was `2026-09-04T09:00:00.000Z`; Hugo prints `2026-09-04T12:00:00+03:00`. Fixed with a new
  `formatDateTime()` in `src/lib/date.ts` (step 9).
- The reading time was `1 min read`; Hugo prints `0 min read`. Hugo does not clamp the value, and
  `readingTime()` in `src/lib/posts.ts` already ports its formula, so use it instead of `Math.max(1, ...)`.
- The category link had a trailing slash. Hugo prints `/categories/blog` without one (string concatenation, the same
  quirk as the tag links on the list pages). **Superseded on 2026-09-19 evening:** the slash is back, on this link and
  on the tag links, because Astro's dev and preview servers answer the slash-less address with 404 and the owner
  reported it; see `REVIEW-FIXES.md` section 5.
- The share widget was wrapped in an extra `div` (step 6).
- The Disqus block was rendered. `hugo.toml` sets no Disqus shortname, so Hugo leaves the `theme-card` div empty and
  loads no script. `DisqusLazy.astro` requested `YOUR_SHORTNAME.disqus.com` instead. Delete
  `src/components/DisqusLazy.astro`. The planned home for Disqus is the existing stub `src/components/Disqus.astro`,
  and only once a shortname exists.
- The `style` attribute had a typo: `--tw-prose-code-bg: # #f3f4f6`.
- Props are now typed, which removes the `any` errors reported by `astro check`.

Replace `src/layouts/ArticleLayout.astro` with:

```astro
---
// Port of ../klub_biolocation/themes/void/layouts/_default/single.html (MIGRATION-PLAN.md §4),
// the {{ define "main" }} block. Base.astro supplies baseof.html around it and Post.astro wires
// the two together. Class attributes are copied verbatim: they are the visual contract.
//
// Go template -> Astro:
//   first 1 .Params.categories, urlize  -> data.categories[0], encodeSlug(urlize(...))
//   .Title                              -> data.title
//   $shareTitle, $shareText             -> shareTitle, shareText below
//   .Permalink                          -> new URL(Astro.url.pathname, Astro.site)
//   .Date | time.Format, .Date.Format   -> formatDateTime(), formatIsoDate() in src/lib/date.ts
//   math.Round (div (countwords .Content) 200.0) -> readingTime(body) in src/lib/posts.ts
//   .TableOfContents                    -> TableOfContents.astro, tocHtml() in src/lib/toc.ts
//   .Content                            -> the default slot
//   .Lastmod (GitInfo is off)           -> data.lastmod ?? data.date
//   partial "terms.html" (tags)         -> Terms.astro
//   .PrevInSection, .NextInSection      -> prev, next, computed in src/pages/posts/[slug].astro
//   i18n "key"                          -> t.key from src/i18n/strings.ts
//   partial "disqus_lazy.html"          -> nothing. hugo.toml sets no Disqus shortname, so Hugo
//                                          leaves the theme-card div empty; keep the empty div.
//
// Decisions that look like mistakes but match Hugo:
// - The category link has no trailing slash (/categories/blog). Hugo concatenates the string,
//   exactly as for the tag links on the list pages. Do not add the slash.
//   (Superseded on 2026-09-19 evening: the slash was added after all, because the slash-less
//   address is a 404 on Astro's dev and preview servers; REVIEW-FIXES.md, section 5.)
// - The reading time can be 0 ("0 min read"). Hugo does not clamp it.
// - shareText is cut with slice(0, 120). Hugo's truncate also avoids splitting a word and adds an
//   ellipsis; the result is identical for every current post, all shorter than 120 characters.
//
// Verified 2026-09-15 against the Hugo output of /posts/article/ and
// /posts/radiesthesia-and-energy-fields/: the structure of main is identical except for the
// Markdown body (plan §6: math, callout shortcode, typographic entities) and, on posts with
// headings, Hugo's heading anchor links (plan §7).
import ShareWidget from "../components/ShareWidget.astro";
import TableOfContents from "../components/TableOfContents.astro";
import PostNav from "../components/PostNav.astro";
import Terms from "../components/Terms.astro";
import { site } from "../config";
import { t } from "../i18n/strings";
import { formatDateTime, formatIsoDate } from "../lib/date";
import { readingTime, type Post } from "../lib/posts";
import { encodeSlug, urlize } from "../lib/urlize";
import type { MarkdownHeading } from "astro";

interface Props {
  entry: Post;
  headings: MarkdownHeading[];
  prev: Post | null;
  next: Post | null;
}

const { entry, headings, prev, next } = Astro.props;
const { data, body } = entry;

const dateMachine = formatDateTime(data.date);
const dateHuman = formatIsoDate(data.date);
const readingMinutes = readingTime(body);
const updatedHuman = formatIsoDate(data.lastmod ?? data.date);

// Hugo: share_title, else .Title; share_description, else .Description, else .Summary, else
// site.Title; then plainify, collapse whitespace, truncate to 120.
const shareTitle = data.share_title ?? data.title;
const shareText = (
  data.share_description ??
  data.description ??
  data.summary ??
  site.title
)
  .replace(/<[^>]*>/g, "")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, 120);
---

<article
  class="mx-auto max-w-4xl overflow-hidden rounded-lg bg-white shadow-md"
>
  <header class="relative border-b border-gray-100">
    <div class="article-inner py-8">
      {
        data.categories.length > 0 && (
          <div class="mb-3 flex">
            <a
              href={`/categories/${encodeSlug(urlize(data.categories[0]))}`}
              class="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-600 transition-colors hover:bg-blue-100"
            >
              {data.categories[0]}
            </a>
          </div>
        )
      }

      <h1 class="relative mb-4 text-3xl font-bold text-gray-900 sm:text-4xl">
        {data.title}
      </h1>

      <div
        class="relative flex flex-wrap items-center gap-4 text-sm text-gray-500"
      >
        <time datetime={dateMachine} class="flex items-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="mr-1.5 h-4 w-4 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            ></path>
          </svg>
          {dateHuman}
        </time>

        <span class="flex items-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="mr-1.5 h-4 w-4 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          {readingMinutes}
          {t.reading_time}
        </span>

        <span
          id="busuanzi_container_page_pv"
          class="inline-flex items-center whitespace-nowrap"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="mr-1.5 inline-block h-4 w-4 flex-shrink-0 text-gray-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            ></path>
          </svg>
          <span class="whitespace-nowrap">
            {t.page_views}
            <span id="busuanzi_value_page_pv"></span>
          </span>
        </span>

        <ShareWidget
          url={new URL(Astro.url.pathname, Astro.site).toString()}
          title={shareTitle}
          text={shareText}
        />
      </div>
    </div>
  </header>

  {headings.length > 0 && <TableOfContents headings={headings} />}

  <div
    class="article-inner article-prose prose prose-sm sm:prose lg:prose-lg max-w-none py-7"
  >
    <slot />
  </div>

  <div class="article-inner flex items-center pb-2 text-sm text-gray-500">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="mr-1.5 h-4 w-4 text-gray-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
      ></path>
    </svg>
    {t.last_updated}
    {updatedHuman}
  </div>

  <footer class="border-t border-gray-100 bg-gray-50 py-6">
    <div class="article-inner">
      <Terms tags={data.tags} />

      <PostNav prev={prev} next={next} />

      <div class="mt-6 flex justify-center">
        <a
          href="/"
          class="inline-flex items-center text-gray-600 transition-colors hover:text-blue-600"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="mr-2 h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
          </svg>
          {t.back_to_home}
        </a>
      </div>
    </div>
  </footer>
</article>

<div
  class="theme-card mx-auto mt-8 max-w-4xl overflow-hidden rounded-lg bg-white shadow-md"
  style="--tw-prose-body: #374151; --tw-prose-headings: #111827; --tw-prose-links: #2563eb; --tw-prose-links-hover: #1d4ed8; --tw-prose-code-bg: #f3f4f6; color: #374151;"
>
</div>
```

### Step 5: PostNav.astro

The `t` calls are already fixed in the repository; what is left here is the header comment and the typed props. The
markup already matched Hugo. Replace `src/components/PostNav.astro` with:

```astro
---
// Previous/next navigation from themes/void/layouts/_default/single.html (MIGRATION-PLAN.md §4).
// Class attributes are copied verbatim.
//
// Go template -> Astro:
//   $prev := .PrevInSection, $next := .NextInSection -> prev, next props, computed in
//                                                       src/pages/posts/[slug].astro
//   $prev.RelPermalink, $prev.Title                   -> /posts/<slug>/, prev.data.title
//   i18n "pagination_previous" | default "Previous"   -> t.pagination_previous (the key exists,
//                                                       so the default is never used)
import { t } from "../i18n/strings";
import type { Post } from "../lib/posts";

interface Props {
  prev: Post | null;
  next: Post | null;
}

const { prev, next } = Astro.props;
---

{
  (prev || next) && (
    <nav class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
      {prev && (
        <a
          href={`/posts/${prev.slug}/`}
          class="group block rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-blue-300 hover:bg-blue-50/30"
        >
          <div class="mb-1 flex items-center text-xs text-gray-500">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="mr-1.5 h-4 w-4 text-gray-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M15 19l-7-7 7-7"
              />
            </svg>
            {t.pagination_previous}
          </div>
          <div class="line-clamp-2 text-sm font-medium text-gray-900 group-hover:text-blue-700">
            {prev.data.title}
          </div>
        </a>
      )}

      {next && (
        <a
          href={`/posts/${next.slug}/`}
          class="group block rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-blue-300 hover:bg-blue-50/30 sm:col-start-2 sm:text-right"
        >
          <div class="mb-1 flex items-center text-xs text-gray-500 sm:justify-end">
            <span class="mr-0 sm:order-1 sm:ml-1">{t.pagination_next}</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="ml-1.5 h-4 w-4 text-gray-400 sm:order-2 sm:ml-1 sm:mr-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </div>
          <div class="line-clamp-2 text-sm font-medium text-gray-900 group-hover:text-blue-700">
            {next.data.title}
          </div>
        </a>
      )}
    </nav>
  )
}
```

### Step 6: ShareWidget.astro

Hugo puts the `data-share-*` attributes and a bare `data-share-widget` attribute on the `div.sm:ml-auto` itself.
The component had its own `div.share-widget` inside that `div`. The theme script (`assets/js/main.js`, plan §7)
finds the widget with `document.querySelectorAll("[data-share-widget]")`, so the extra wrapper would stop the button
from ever working. Until §7 is ported the button renders and does nothing, which is expected. Replace
`src/components/ShareWidget.astro` with:

```astro
---
// Share block from ../klub_biolocation/themes/void/layouts/_default/single.html
// (MIGRATION-PLAN.md §4). Class attributes are copied verbatim.
//
// The data attributes sit on the div.sm:ml-auto itself, exactly as in Hugo, and there is no
// extra wrapper element: the theme script (assets/js/main.js, still to be ported in plan §7)
// finds the widget with document.querySelectorAll("[data-share-widget]"). Until that script is
// ported the button renders but does nothing, which is expected.
//
// Go template -> Astro:
//   .Permalink, $shareTitle, $shareText         -> url, title, text props from ArticleLayout
//   i18n "share" | default "Share" (and others)  -> t.share, t.share_copied, ... (all keys exist)
import { t } from "../i18n/strings";

interface Props {
  url: string;
  title: string;
  text: string;
}

const { url, title, text } = Astro.props;
---

<div
  class="sm:ml-auto"
  data-share-widget
  data-share-url={url}
  data-share-title={title}
  data-share-text={text}
  data-share-label-default={t.share}
  data-share-label-success={t.share_copied}
  data-share-copy-summary-success={t.share_copy_summary_success}
  data-share-copy-failed={t.share_copy_failed}
>
  <button
    type="button"
    class="share-trigger inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm transition-colors"
    data-share-copy-summary
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M8.59 13.51l6.83 3.98M15.41 6.51L8.59 10.49"></path>
      <circle cx="18" cy="5" r="3"></circle>
      <circle cx="6" cy="12" r="3"></circle>
      <circle cx="18" cy="19" r="3"></circle>
    </svg>
    <span data-share-label>{t.share}</span>
  </button>
</div>
```

### Step 7: Terms.astro

The component did not follow `partials/terms.html`: no "Tags:" label, no tag icon, different colours and sizes, a
`#` prefix, lower-case names, and `px-2.55`, which is not a Tailwind class. Hugo prints the title-cased name
(`Hugo`, not `#hugo`) and a percent-encoded link with a trailing slash. Replace `src/components/Terms.astro` with:

```astro
---
// Port of ../klub_biolocation/themes/void/layouts/partials/terms.html (MIGRATION-PLAN.md §4),
// called from single.html with taxonomy "tags". Class attributes are copied verbatim.
//
// Go template -> Astro:
//   with $page.GetTerms "tags"      -> tags.length > 0 (the tag list from the front matter)
//   (index . 0).Parent.LinkTitle    -> "Tags", the taxonomy title Hugo prints; hard-coded
//   .RelPermalink                   -> /tags/<encodeSlug(urlize(tag))>/, percent-encoded like Hugo
//   .LinkTitle                      -> titleize(tag), e.g. "hugo" -> "Hugo"
//   i18n "tag_icon_title"           -> t.tag_icon_title
//
// Every chip repeats id="tagIconTitle". That duplicate id is in the Hugo output too; keep it.
import { t } from "../i18n/strings";
import { titleize } from "../lib/titleize";
import { encodeSlug, urlize } from "../lib/urlize";

interface Props {
  tags: string[];
}

const { tags } = Astro.props;
---

{
  tags.length > 0 && (
    <div class="tags-container">
      <div class="mb-2 font-medium text-gray-700 dark:text-gray-300">Tags:</div>
      <div class="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <a
            href={`/tags/${encodeSlug(urlize(tag))}/`}
            class="tag-chip inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700 transition-colors hover:bg-blue-100 dark:bg-slate-800 dark:text-blue-300 dark:hover:bg-slate-700"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="mr-1.5 h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-labelledby="tagIconTitle"
              role="img"
            >
              <title id="tagIconTitle">{t.tag_icon_title}</title>
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
              />
            </svg>
            {titleize(tag)}
          </a>
        ))}
      </div>
    </div>
  )
}
```

### Step 8: TableOfContents.astro and a new src/lib/toc.ts

The component built a flat list of h2 and h3 with its own classes. Hugo prints `.TableOfContents` with the settings in
`hugo.toml` (`startLevel = 1`, `endLevel = 6`, unordered) inside `div.prose`, and nests every heading by level.
Because the posts start at h2, Hugo wraps the whole list in one empty top-level `<li>`. The Alpine.js toggle itself
is fine: `Head.astro` already loads Alpine from the CDN and `main.css` already has the `x-cloak` rule.

The show/hide condition moves into `ArticleLayout.astro` (step 4 already contains it). Inside a JSX expression
Prettier cannot parse Alpine's `@click` attribute, which is why `prettier --check` failed on this file. That move is
already applied, and the file in the repository is typed but still renders the flat list; the version below replaces
the list itself.

Create `src/lib/toc.ts`:

```ts
import type { MarkdownHeading } from "astro";

// Rebuilds Hugo's .TableOfContents for this site's settings in ../klub_biolocation/hugo.toml:
// [markup.tableOfContents] startLevel = 1, endLevel = 6, ordered = false. Used by
// src/components/TableOfContents.astro (MIGRATION-PLAN.md §6, "TOC").
//
// Hugo nests every heading by its level counted from startLevel, and a level that has no
// heading of its own still gets a list item. Posts start at h2, so the whole list sits inside
// one empty top-level item: <ul><li><ul><li>First</li>...</ul></li></ul>. That wrapper is Hugo
// behaviour, verified on 2026-09-15 against Hugo's output for a post with h2, h3, h2 headings;
// do not "clean it up".
//
// Hugo takes the link text from the rendered heading HTML, Astro gives plain text. The two only
// differ for headings with inline markup such as code spans.
const startLevel = 1;
const endLevel = 6;

type TocNode = { heading?: MarkdownHeading; children: TocNode[] };

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderList(nodes: TocNode[]): string {
  if (nodes.length === 0) return "";
  const items = nodes.map((node) => {
    const link = node.heading
      ? `<a href="#${escapeHtml(node.heading.slug)}">${escapeHtml(node.heading.text)}</a>`
      : "";
    return `<li>${link}${renderList(node.children)}</li>`;
  });
  return `<ul>${items.join("")}</ul>`;
}

/** Hugo's TOC nav element as HTML, or an empty string when the post has no headings. */
export function tocHtml(headings: MarkdownHeading[]): string {
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
  const list = renderList(root.children);
  return list ? `<nav id="TableOfContents">${list}</nav>` : "";
}
```

Replace `src/components/TableOfContents.astro` with:

```astro
---
// Port of the collapsible table of contents in
// ../klub_biolocation/themes/void/layouts/_default/single.html (MIGRATION-PLAN.md §4 and §6).
// The markup is copied verbatim; .TableOfContents itself is rebuilt by tocHtml() in
// src/lib/toc.ts. The open/close toggle is Alpine.js, which Head.astro already loads from the
// CDN exactly as the theme does, and main.css already carries the x-cloak rule.
//
// Go template -> Astro:
//   .TableOfContents, then the replaceRE sanitising  -> tocHtml(headings). Hugo strips on*,
//                                                      style and class attributes and external
//                                                      hrefs; tocHtml() never emits any of them.
//   if gt (len ($tocSanitized | plainify)) 0         -> headings.length > 0, checked in
//                                                      ArticleLayout.astro. The condition lives
//                                                      in the parent because Prettier cannot
//                                                      parse Alpine's @click attribute inside a
//                                                      JSX expression.
//   i18n "table_of_contents"                         -> t.table_of_contents
import type { MarkdownHeading } from "astro";
import { t } from "../i18n/strings";
import { tocHtml } from "../lib/toc";

interface Props {
  headings: MarkdownHeading[];
}

const { headings } = Astro.props;
const toc = tocHtml(headings);
---

<div class="article-inner pt-6" x-data="{ open: false }">
  <button
    class="flex w-full items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-200 dark:hover:bg-slate-700"
    @click="open = !open"
    aria-controls="toc-content"
    :aria-expanded="open.toString()"
  >
    <span>{t.table_of_contents}</span>
    <svg
      x-show="!open"
      xmlns="http://www.w3.org/2000/svg"
      class="h-4 w-4"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fill-rule="evenodd"
        d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"
        clip-rule="evenodd"></path>
    </svg>
    <svg
      x-show="open"
      xmlns="http://www.w3.org/2000/svg"
      class="h-4 w-4"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fill-rule="evenodd"
        d="M5 9a1 1 0 000 2h10a1 1 0 100-2H5z"
        clip-rule="evenodd"></path>
    </svg>
  </button>
  <div
    id="toc-content"
    x-cloak
    x-show="open"
    x-transition
    class="mt-3 rounded-md border border-gray-100 bg-white p-4 text-sm leading-relaxed"
  >
    <div class="prose prose-sm max-w-none" set:html={toc} />
  </div>
</div>
```

### Step 9: add formatDateTime() to src/lib/date.ts

Append at the end of `src/lib/date.ts`. It reuses the `+03:00` front-matter offset that the file already documents:

```ts
// Hugo layout "2006-01-02T15:04:05-07:00", used for the datetime attribute of a post date.
export function formatDateTime(date: Date): string {
  const d = shifted(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  const offset = Math.abs(FRONT_MATTER_OFFSET_MINUTES);
  const sign = FRONT_MATTER_OFFSET_MINUTES < 0 ? "-" : "+";
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  return `${formatIsoDate(date)}T${time}${sign}${pad(Math.floor(offset / 60))}:${pad(offset % 60)}`;
}
```

### Colours: nothing to pin

The components use `blue-50`, `blue-100`, `gray-50`, `gray-100` and `gray-200`, which `tailwind.config.cjs` does not
pin. That is correct: converted from `reference/hugo-main.css`, their Tailwind 4 values are identical to the
Tailwind 3 defaults (`#eff6ff`, `#dbeafe`, `#f9fafb`, `#f3f4f6`, `#e5e7eb`). The other colours they use are already
pinned. See README, "The palette is pinned to the Tailwind 4 values".

## 4. Part B: the footer script tag - applied, except the link typo

`src/components/Footer.astro` contained a malformed element: the `>` closed the opening tag before `src`, so the URL
ended up as the element's text. The browser therefore ran that text as code and stopped; the counter never loaded
from there. It caused three failures:

- `npm run dev` logged `Failed to scan for dependencies from entries ... Unexpected end of file`, pointing at
  `Footer.astro`. This is the pitfall described in `CLAUDE.md`: Vite's pre-scan reads script tags as plain text.
- `prettier --check` stopped with `SyntaxError` in `Footer.astro`, so `npm run check` failed.
- `astro check` reported `Expression expected` at `Footer.astro:125`.

The element is not needed. In Hugo the counter script is loaded once, from `head.html` (`footer.html` even says so
in a comment), and `Head.astro` already ports that, with the same protocol-relative URL. Three edits:

1. Delete the whole malformed element near the end of the file, from the line with the opening tag and `async` down to
   the line with the closing tag. **Applied.** In its place the file now carries a comment saying where the loader
   lives, mirroring the note Hugo keeps in `footer.html`. The broken markup itself must not be left behind as a
   comment: a literal script tag inside a comment is what breaks the Vite pre-scan in the first place.
2. Delete the unused constant `busuanziScript` in the frontmatter together with the comment line above it. It holds
   the same tag inside a template literal, which is exactly what the Vite pre-scan trips over. **Applied.**
3. Fix the theme link: `https://github.com/Dauaucloud/hugo-theme-void` must be
   `https://github.com/Daucloud/hugo-theme-void`, as in `footer.html`. **Still open.**

The visit counter keeps working: the loader is in `Head.astro` on every page, and the two spans it fills in,
`busuanzi_container_site_pv` and `busuanzi_value_site_pv`, are still in the footer. Checked in the built pages.
The per-page counter, `busuanzi_container_page_pv`, lives in `ArticleLayout.astro` and appears once part A is done.

Verified after the edits: `npm run dev` starts without the scan error, `prettier --check` is clean and `astro check`
reports nothing in `Footer.astro`.

The footer as a whole is still plan step 5 (`partials/footer.html` -> `Footer.astro`). When porting it, compare the
rest against `footer.html` too; for example, the "Total visits" span is not in the Hugo footer.

## 5. Verification

Run, in this order:

```
npm run fix
npm run build
npm run check
npx astro dev --port 4387
```

Expected results, all measured on a copy of `main` with parts A and B applied:

- `npm run fix` formats the touched files; the code above is already in Prettier's style.
- `npm run build` is green and builds the same 15 routes as before. Route parity with
  `reference/hugo-routes.txt` differs only by the nine Hugo-only `/page/1/` aliases.
- `npm run check` is green: Prettier is clean, and `astro check` reports 0 errors and 0 warnings. It became green on
  2026-09-16, when the props that `SEO.astro`, `SocialMeta.astro` and `Base.astro` were already being passed were
  declared. The head duplication behind those errors is untouched; see section 7.
- The dev server starts without `Failed to scan for dependencies`, and `/`, `/posts/article/` and
  `/posts/radiesthesia-and-energy-fields/` answer 200. Stop it by process id afterwards, not by closing the `npx`
  window (see `CLAUDE.md`, "Workflow").

Then look at `http://localhost:4387/posts/article/` in the browser, in both themes:

- Category chip, title, date, "0 min read", "Page Views", Share button.
- Body, then "Last updated on 2026-09-04".
- "Tags:" with blue chips `Hugo` and `Void`, then a "Next" card to the other post, then "Back to Home".
- An empty white card below the article: that is the Disqus card, empty in Hugo too.

Markup parity, as described in `CLAUDE.md`: compare the `<main>` region of `dist/posts/article/index.html` with
`../klub_biolocation/public/posts/article/index.html` (read only; do not rebuild Hugo). Remaining differences that
are expected:

- The Markdown body: `$E = mc^2$`, the `callout` shortcode shown as raw text, and typographic entities. That is the
  Markdown pipeline, plan §6.
- On posts with headings, Hugo adds a `heading-anchor` link inside every heading. Plan §7 (client-side JavaScript)
  covers the anchors.
- Whitespace inside the `style` attribute of the Disqus card, removed by Hugo's minifier.
- The Share button does nothing until `assets/js/main.js` is ported (plan §7).

## 6. Bookkeeping, then commit

`CLAUDE.md` asks for these when a `TODO` is done:

- `README.md`, "Skeleton status": add a row for the single-post layout (`single.html`, `partials/terms.html`) pointing
  at `src/layouts/Post.astro`, `src/layouts/ArticleLayout.astro` and the components; remove "the single-post layout"
  from the "Not done" sentence, together with the pointer to this file.
- `MIGRATION-PLAN.md`, "Progress": the row `§4 single.html -> Post.astro` moves from `Stub` to `Done`, with the note
  that the body waits on the §6 Markdown pipeline. Update the sentence below the table that says session 3 waits on
  `Post.astro`.
- `CLAUDE.md`, "Next steps": item 4 (`Post.astro`) is done apart from §6.
- Delete this file once the fix is merged, or keep it and mark it as applied at the top.

Commit messages in English, without the file list (git records it). Suggested split, so that each commit builds on
its own:

1. `Fix the footer script tag that breaks the dev server` (part B).
2. `Wire the article components into the post page` (part A and the bookkeeping).

Then `git push`, watch the "Deploy to GitHub Pages" run in the Actions tab, and open
`https://debi7.github.io/posts/article/`.

## 7. Other problems found in the same review (not fixed by this guide)

These do not block the article page, and `npm run check` no longer fails because of them: on 2026-09-16 the type
errors were silenced by declaring the props that were already being passed, which changed no rendered tag. The
duplication itself is still there. The notes below are based on reading the code and the built pages; they have not
been built and verified like parts A and B.

### 7.1 The head is rendered three times

`Base.astro` renders `SEO.astro`, which renders `SocialMeta.astro` again, and `Head.astro` renders `SocialMeta.astro`
as well. The built `/posts/article/` therefore has two `<title>` elements (the first one empty), three
`og:title`, three `description` tags, and wrong values:

- `og:site_name` is `Klub biolocation`, while the site title in `src/config.ts`, and in every `<title>`, is
  `Radiesthesia Club`. `Base.astro` defines a second site object with that title (section 9).
- `og:image` points at `/images/default-share.png`, which does not exist in `public/images/`.
- `<meta name="robots" content="index, follow">` only repeats what search engines do by default and can be dropped.
- On a post, `og:type` should be `article`, with `article:published_time`, `article:modified_time` and one
  `article:tag` per tag. `SEO.astro` already contains that code, but the post page does not pass the data yet.

Revised on 2026-09-16. An earlier version of this section suggested porting the Hugo partial into
`SocialMeta.astro` and deleting `SEO.astro`. The project now follows Astro practice rather than the Hugo layout, so
the suggestion is the opposite: keep `SEO.astro` and delete `SocialMeta.astro`. Section 8 explains why, section 9
covers the second site object.

### 7.2 Smaller points

- `src/config.ts` gained `telegram: "@name"`, which the footer renders as `href="@name"`. The social values are still
  placeholders.
- `Base.astro` declares `content`, `isArticle`, `publishDate`, `updatedDate`, `tags` and `params` for `SEO.astro`,
  but no page passes them yet. The post page should pass them (section 8.6).

### 7.3 Project conventions that apply to all of this

From `CLAUDE.md`, briefly:

- Code comments, docs and commit messages in English. Several new files have comments in another language.
- Every ported file opens with a comment naming its Hugo source and the plan section, then the Go template to Astro
  mapping, then the decisions that look like mistakes. The files in part A follow that shape.
- Copy class attributes verbatim from the Hugo template; do not restyle ported markup.
- Use `encodeSlug()` on any slug segment of a hand-built link (non-ASCII tags).
- Never write a literal script or style tag inside a comment or string in an `.astro` file (part B is that bug).
- Before calling a step done: `npm run fix`, `npm run check`, `npm run build`, and `npm run dev` once.

## 8. SEO.astro and SocialMeta.astro: one file or two

Added on 2026-09-16 and revised the same day: the project now follows Astro practice, so the Hugo layout is no longer
an argument for how these files are organised.

The question: splitting the head tags into `SEO.astro` for search tags and `SocialMeta.astro` for social tags looks
cleaner. Why keep one file?

### 8.1 Short answer

The number of files is not the problem. Whatever the layout, three things must hold:

1. Every tag is rendered once.
2. There is one site object, `site` from `src/config.ts` (section 9).
3. The tags are rendered from one place.

Two files can meet all three. They do not today. One file is recommended because it is simpler, not because two
files are wrong.

### 8.2 What the built page contains today

Measured on `dist/posts/article/index.html`, built from `ff518fd`:

- Two `meta charset` and two `title` elements, and the first title is empty. `SEO.astro` renders a title from its
  `title` prop, and `Base.astro` never passes one. A browser uses the first title element: in headless Edge
  `document.title` on that page is an empty string. All 16 built pages carry the empty title, so no browser tab and
  no bookmark shows the page name.
- `description`, `og:type`, `og:title`, `og:description` and `og:image` appear three times each, with different
  values. `og:title` is `Hello!`, then empty, then `Hello! | Radiesthesia Club`; `og:image` is once a URL and twice
  empty. A search engine or a messenger preview picks one of them, and which one is not up to us.
- The wrong values listed in 7.1.

Where the three copies come from:

- `Base.astro` renders `SEO.astro`: title, canonical, description, robots, Open Graph, Twitter and article tags.
- `SEO.astro` renders `SocialMeta.astro` at its end, passing the `title` that nobody set.
- `Head.astro` renders its own title and `SocialMeta.astro` a second time.

So the current two files do not separate search tags from social tags: `description`, `og:*` and `twitter:*` are
in both. The split exists in the file names, not in the output.

### 8.3 Which file has the better code

`SEO.astro` together with `src/lib/seo.ts`. It covers title, canonical, description, Open Graph, Twitter and article
tags, with typed helpers and fallbacks for the title, the description and the share image. `SocialMeta.astro` is a
smaller set of the same tags. Both options below keep `SEO.astro` and `src/lib/seo.ts` as the base.

### 8.4 Option 1: one component, SEO.astro (recommended)

- `SEO.astro` renders the title, canonical, description, Open Graph, Twitter and article tags. No other file renders
  any of them.
- The title keeps today's text: `Hello! | Radiesthesia Club` on a post, `Radiesthesia Club` alone on the home page.
  That formula is in `Head.astro` now and moves into `SEO.astro`.
- `Base.astro` renders `SEO` once, inside `head`. It already has the page data that `SEO.astro` needs.
- `Head.astro` loses its `title` and its `SocialMeta`. Everything else in it stays.
- One `meta charset`, as the first tag in `head`: keep the one in `Base.astro`, remove the one in `Head.astro`.
- Delete `SocialMeta.astro`.

Strengths:

- The shared values are computed once. `meta description`, `og:description` and `twitter:description` are the same
  string; `canonical` and `og:url` are the same URL. Nothing is passed between files, and the tags cannot drift apart.
- To find or change any tag that describes the page, there is one file to open.
- It is how Astro projects usually do it. The official Astro blog starter keeps title, canonical, description, Open
  Graph and Twitter tags in one `BaseHead.astro`, and the `astro-seo` package is one `SEO` component that takes all
  of them as props.
- The smallest change: most of the code already exists.

Weaknesses:

- About 35 lines of markup in one file; search tags and social tags are not physically separated. A comment line
  between the groups covers most of that.
- The file grows when JSON-LD or hreflang are added. At that point JSON-LD can become its own component.

### 8.5 Option 2: two components with a strict boundary

- `SEO.astro` renders the title, canonical and description.
- `SocialMeta.astro` renders the Open Graph, Twitter and article tags.
- `Base.astro` renders both, one after the other. Neither renders the other.

Strengths:

- Search tags and link-preview tags are edited and reviewed separately, and each file is short.
- Each side can grow on its own.
- `src/lib/seo.ts` already holds the shared logic, so neither file has to copy code.

Weaknesses:

- Both files need the same inputs: the description and the canonical URL are used on both sides. Either both call the
  helpers, which gives two places to keep in sync, or `Base.astro` computes the values and passes them to both.
- `Base.astro` passes the page data to two components instead of one.
- The boundary is kept by hand: no tag may appear in both files. The duplication in 8.2 is what happens when that
  slips.

### 8.6 What either option has to meet

- One `title`, one `meta charset`, and one each of the description, canonical, Open Graph and Twitter tags,
  rendered from `Base.astro` only.
- `site` from `src/config.ts` is the only site object, so `og:site_name` is `Radiesthesia Club` (section 9).
- No link to a missing image: without an image in the front matter, the share image falls back to
  `/images/avatar.png`.
- No `robots` tag.
- On a post, `og:type` is `article`, and the three `article:` tags are present. For that, `Post.astro` passes
  `isArticle`, `publishDate` (`data.date`), `updatedDate` (`data.lastmod`, else `data.date`) and `tags` to
  `Base.astro`.
- Check: `dist/posts/article/index.html` contains exactly one each of `title`, `meta description`, `canonical`,
  `og:title` and `og:image`; `npm run check` and `npm run build` are green; the browser tab on `/posts/article/`
  reads `Hello! | Radiesthesia Club`.

### 8.7 Recommendation

Option 1. It computes the shared values once, matches how Astro projects usually organise head tags, and is the
smaller change. Option 2 is also correct if 8.6 holds.

## 9. Two `site` variables in Base.astro

Added on 2026-09-16. The question: `src/config.ts` exports `site`, and `Base.astro` imports it. `Base.astro` also
declared its own `site` object with slightly different data. Should there be only one, or both with one renamed?

### 9.1 Short answer

Keep one source of data: `site` from `src/config.ts`. The helpers in `src/lib/seo.ts` expect a different shape, so a
second object is fine, but it must be built from `site`, not filled with its own values.

The rename to `seoSite` in `ff518fd` only made `astro check` pass without changing the page. It is not the fix: the
two objects still disagree.

### 9.2 What is different

- `title`: `Radiesthesia Club` in `src/config.ts`, `Klub biolocation` in `Base.astro`. Every `title` element uses
  the first; `og:site_name` uses the second. A link preview shows a different site name than the browser tab.
- `share.defaultImage`: only in `Base.astro`, `/images/default-share.png`. That file does not exist.
- `avatar`: the same path in both, in a different shape: a string in `src/config.ts`, `{ url }` in `Base.astro`.
- `language`: `ru` in both.
- `baseUrl`: only in `Base.astro`, read from `Astro.site`, which is `site` in `astro.config.mjs`. That is not a copy:
  it is where Astro keeps the site URL, and `Astro.site` is the documented way to build absolute URLs.

So the local object adds nothing of its own that is right, and two values that are wrong.

### 9.3 Option A: keep both, one renamed (the current state)

Strengths:

- The smallest change. It compiles, and `src/config.ts` and `src/lib/seo.ts` stay untouched.

Weaknesses:

- Two places hold the same data, they already disagree, and the page shows the wrong title.
- A change in `src/config.ts`, a new title for example, never reaches the SEO tags. Nothing fails, so nobody notices.
- The rename hides the conflict from the compiler, not from the page.

### 9.4 Option B: one `site`, the SEO object built from it (recommended)

```astro
---
import { site } from "../config";
import type { SiteConfig } from "../lib/seo";

// Built from src/config.ts, with no values of its own, so the tags always follow the config.
// The shape differs because the helpers in src/lib/seo.ts expect SiteConfig. baseUrl comes from
// astro.config.mjs through Astro.site. No share.defaultImage: there is no such image, so the
// share image falls back to the avatar.
const seoSite: SiteConfig = {
  title: site.title,
  baseUrl: Astro.site?.toString() ?? "",
  language: site.language,
  avatar: { url: site.avatar },
};
---
```

Strengths:

- The title and the avatar are changed in one place, and the tags follow.
- The wrong values disappear: `og:site_name` becomes `Radiesthesia Club`, and `og:image` points at
  `/images/avatar.png` instead of a missing file.
- `src/lib/seo.ts` does not change.

Weaknesses:

- There are still two variables. Without the comment above, the next reader asks why.
- When a field is added to `SiteConfig`, the mapping needs one more line.

### 9.5 Option C: one `site`, no second object

The helpers in `src/lib/seo.ts` take `site` from `src/config.ts` directly, plus the base URL as a separate argument.

Strengths:

- Literally one variable, and no mapping.

Weaknesses:

- Every helper signature in `src/lib/seo.ts` changes, and so does every call.
- `src/lib/seo.ts` becomes tied to the exact shape of `src/config.ts`.
- A bigger change than B for the same page.

### 9.6 Where the object goes

With option 1 from section 8, the object from 9.4 lives inside `SEO.astro`, which imports `site` itself. `SEO.astro`
then takes only the `page` prop. `Base.astro` keeps its import of `site` for `html lang` and builds only `page`.

Check: `dist/posts/article/index.html` has `og:site_name` `Radiesthesia Club` and an `og:image` ending in
`/images/avatar.png`, and `npm run check` is green.

## 10. The "addListener is deprecated" hint in site.js

Added on 2026-09-16.

### 10.1 What it is

- VS Code crosses out `addListener` in `src/scripts/site.js`, lines 94 and 158, with the message
  `'addListener' is deprecated. ts(6385)`.
- It is a hint, not an error. `npm run check` is green and reports `0 errors, 0 warnings, 6 hints`; four of the six
  hints come from these two lines. The site works.
- Both places first call `addEventListener("change", ...)`. `addListener` is only an `else if` fallback for browsers
  where `MediaQueryList` has no `addEventListener`: Safari before version 14, released in 2020. No current browser
  reaches that branch.
- TypeScript marks `addListener` as `@deprecated` in its DOM types, so the editor crosses it out wherever it is
  written, even inside a fallback that never runs.

### 10.2 What to do

Remove the fallback branch in both places and call `addEventListener` directly. Keep the `try`/`catch` around it:
in a browser without `addEventListener` the call throws, the `catch` swallows the error, and the result is the same
as having no listener at all.

Place 1, inside `themeInit`, lines 92-94. Before:

```js
      if (media && media.addEventListener)
        media.addEventListener("change", handler);
      else if (media && media.addListener) media.addListener(handler);
    } catch (_) {}
```

After:

```js
      // Changed 2026-09-16: the addListener fallback was removed. It only served browsers without
      // addEventListener on MediaQueryList (Safari before 14), and TypeScript flags it as deprecated.
      // In such a browser this call throws and the catch below swallows it: no live theme sync.
      media.addEventListener("change", handler);
    } catch (_) {}
```

Place 2, inside `menuInit`, lines 157-158. Before:

```js
      if (wide.addEventListener) wide.addEventListener("change", sync);
      else if (wide.addListener) wide.addListener(sync);
    } catch (_) {}
```

After:

```js
      // Changed 2026-09-16: addListener fallback removed for the same reason as in themeInit above.
      wide.addEventListener("change", sync);
    } catch (_) {}
```

### 10.3 What changes for a visitor

- In every browser from 2020 on: nothing.
- In Safari 13 and older: the theme no longer follows a change of the system theme while the page is open, and an
  open mobile menu is not closed when the window is widened past 640px. The look of the site does not change.

### 10.4 Check

Run `npm run fix`, `npm run check` and `npm run build`. Measured with this change applied:

- Prettier is clean.
- `astro check` reports `0 errors, 0 warnings, 2 hints`.
- The build is green, 16 pages.
- In VS Code the strikethrough in `site.js` is gone.

### 10.5 The two hints that remain

`'event' is deprecated` at `src/components/PostList.astro` line 120 and `src/pages/tags/[slug].astro` line 136,
both on `onclick="event.stopPropagation();"`. This is a false alarm: inside an inline `onclick` attribute, `event` is
the handler's own argument, not the deprecated global `window.event`. Leave these two as they are.
