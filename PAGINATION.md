# Pagination of the post lists, the order of posts, and the years

Written on 2026-09-19. It covers what the owner asked for, how it is built, and how it was checked, including a stress
test with many pages. How an author adds a post, and where that post then appears, is in [CONTENT.md](CONTENT.md).

## 1. What was asked for

The owner's requests, in the order they came on 2026-09-19:

- About fifteen posts on biolocation, shown five to a page, with Previous and Next moving between pages of five, not
  from one post to the next. The same pages of five on a tag's page and on a category's page.
- The order posts are sorted in, written down.
- Then, replacing the first design: the Posts list is paginated by year. Choosing a year shows only that year's
  posts, and Previous and Next move only within that year. Posts on any subject so that 2026 has 8, 2025 has 6 and
  2024 has 9.
- Pagination has to keep working when there are many more pages.
- Then: numbered page links; a post dated in the future stays hidden until its date, as on the Hugo site; and the
  Share button must not get an empty text (that fix is described in [POST-SIDEBAR.md](POST-SIDEBAR.md), section 5).
  Whether the tag and category pages should be split by year as well was left to judgement; see section 5.
- In the evening, while the branch was under review: one style of button on every list (a reviewer's remark, see
  `REVIEW-FIXES.md`); the page numbers by the owner's rule - every number up to five pages, then only the first, the
  current and the last with an ellipsis - in one component for every list, with the year switcher as a separate
  component; then every list split by year, the tag and category pages included, with one component that puts the
  year switcher above a list and the page buttons below it. The owner said the last change may be rolled back after a
  look; sections 5 and 11 say how.

## 2. The order of posts

Every list on the site takes its posts from one function, `getPosts()` in `src/lib/posts.ts` (`published()` in
`src/lib/lists.ts` since 2026-09-22, shared with the videos): the Posts list and its
years, the tag and category pages, the Categories page, and the Previous and Next links at the foot of a single post.
So they all share one order:

1. Newest first, by `date` in the front matter. The time and the time zone count, so two posts on the same day are
   ordered by their time.
2. Two posts with exactly the same date and time: by title, in alphabetical order.
3. Two posts with the same title as well: by file name. No two posts can share one, so the order is always complete.

Before this change only the first rule existed, and posts with the same date and time kept whatever order the content
collection returned them in. With pagination that matters: such a pair on the boundary between two pages could swap
pages from one build to the next. Hugo's default order also falls back to the title after the date.

The year of a post is the year of its `date`, in the time zone written there.

What does not change the order:

- `lastmod`. A post that is edited stays where it is.
- The file name, except in the tie described above.

Two behaviours to know about:

- A draft (`draft: true`) is left out of the published site, but `npm run dev` shows it and counts it. The pages in
  `npm run dev` can therefore differ from the published ones. Today the draft is dated 4 September 2026, so in
  `npm run dev` the year 2026 has 9 posts instead of 8.
- A post dated in the future is left out of the published site until that date, as Hugo does by default; the owner
  decided so on 2026-09-19. Before, it was published at once and went to the top of its year. `npm run dev` still
  shows it, like a draft, so that it can be read before its day. The site is static, so a post appears with the first
  build after its date. Today a build runs only when something is pushed to `main`, so a post dated Monday appears with
  the first push after Monday, not on Monday by itself. See the open questions at the end.

## 3. The Posts list: pages by year

- Every year that has posts gets its own list: `/posts/2025/` is its first page, `/posts/2025/page/2/` its second, and
  so on. A page holds five posts; the number is `pagination.pageSize` in `src/config.ts`.
- A year's pages hold only that year's posts. Previous and Next move only within the year: the first page of a year
  has no Previous, and its last page has no Next, even when an older year exists.
- `/posts/`, where the Posts menu item points, shows the newest year's first page, with the same Previous and Next
  as `/posts/<newest year>/`. Every year keeps its own addresses, so they do not change when a new year begins.
- A year that has only drafts gets no pages on the published site.
- Each page shows the year's badge once, above its posts, as the theme draws it.
- Since the evening of 2026-09-19 every tag and category page is split the same way, through the same code; see
  section 5.

Today's pages, with 23 published posts:

- 2026: 8 posts, pages of 5 and 3;
- 2025: 6 posts, pages of 5 and 1;
- 2024: 9 posts, pages of 5 and 4.

## 4. The year switcher

- Under the title of the Posts list only. The category pages use the same component but do not get the switcher, and
  the tag pages have their own markup; see section 5.
- Shown when the posts span at least two years, newest first.
- Each button opens the first page of its year. The year being shown is highlighted and carries `aria-current`; on
  `/posts/` that is the newest year.
- The buttons use the classes of the theme's own Previous and Next buttons from `list.html`; the highlighted one uses
  the colours of the year badges. So they match the theme in both colour schemes.
- Since later on 2026-09-19 it is a component of its own, `src/components/YearSwitcher.astro`, kept separate from the
  page buttons as the owner asked, with its own rule for many years (`yearSwitcher()` in `src/lib/lists.ts`,
  threshold `pagination.everyYearUpTo` in `src/config.ts`, 5): up to five years every year is shown; with more, the
  newest, the oldest and the year being shown with the year either side of it, and an ellipsis for the years hidden:
  `2026 ... 2023 2022 2021 ... 2015`. The neighbours stay, unlike on the page numbers, because a reader browsing by
  year moves to the year next door far more often than to the first page of a long list; that detail was left to
  this side and is one line to change. Every year shown is a link, the current one included.

## 5. The tag and category pages

Split by year like the Posts list since the evening of 2026-09-19, at the owner's request, through the same code:
`/tags/<tag>/` is the newest year's first page, `/tags/<tag>/2025/` the first page of 2025 and
`/tags/<tag>/2025/page/2/` its second page; the same under `/categories/<category>/`. The year switcher under the
title lists only the years in which that tag or category has posts, and Previous, Next and the page numbers stay
within the year. The count under a tag's title ("19 articles") stays the total across years. The overview pages
`/tags/` and `/categories/` list tags and categories, not posts, and are not paginated.

The pieces are the same for every list: `paginateByYear()` in `src/lib/lists.ts` gives a route its pages by year, and
`ListByYear.astro` puts the year switcher above the list and the page buttons below it. The Posts list and the
category pages render their cards through `CardList.astro` (`PostList.astro` until 2026-09-22), the tag pages
through their own route with `tag.html`'s cards; the two kinds of cards were left as they were. The Video list
(`/video/`) goes through the same code since 2026-09-22; see `VIDEO-PAGE.md`.

Earlier that day the tag and category pages were paginated across all years (`/tags/<tag>/page/2/`), and the
judgement then was that splitting them was not worth it: of the 16 tags, 13 have five posts or fewer and seven a
single post, so by year they give pages of one or two posts under a switcher of up to three buttons; and nothing links
to a category page - the Categories page is an accordion that links straight to the posts. The owner chose the same
navigation on every list over that, and said it may be rolled back: `git revert` of the commit that added
`ListByYear.astro` restores the lists across years, nothing later depends on it.

## 6. Previous, Next and the page numbers

- Shown only when there is a page to go to. Previous goes to newer posts, Next to older ones.
- Between them, numbered links to the pages of the same list, added on 2026-09-19 at the owner's request, so that a
  long list does not take one click per page. The rule is the owner's, set later the same day (`pageNumbers()` in
  `src/lib/lists.ts`, threshold `pagination.everyNumberUpTo` in `src/config.ts`, 5): a list of up to five pages shows
  every number, `1 2 3 4 5`; a longer one shows only the first, the current and the last page, with an ellipsis that
  is not a link between them: `1 ... 7 ... 20`, `1 2 ... 20` on the second page, `1 ... 20` on the first and on the
  last. Only the first and the last page are links there. Five entries at most, so one set fits every width. Until
  then the numbers were a sliding window - two pages either side of the current one, at most nine entries, with a
  second set of one either side for screens below 640px, where nine did not fit on one line.
- The current page is highlighted and is not a link; it carries `aria-current`. Every other number is labelled "Page n"
  for screen readers, with the theme's own string; the button texts come from `src/i18n/strings.ts`, so they translate
  with the rest of the site.
- Below 640px the numbers take a line of their own under Previous and Next; from 640px up the three sit in one line,
  with the numbers centred whether or not both buttons are there.
- The number buttons use the classes of the Previous and Next buttons, and the current page uses the year switcher's
  highlighted colours. The theme has no numbered links, so this markup is new.
- The block is one component since later on 2026-09-19, `src/components/Pagination.astro`, asked for by the owner so
  that any list added later gets the same buttons; the Posts and category pages (`CardList.astro`) and the tag pages
  pass it the addresses of the neighbouring pages and the numbers, plus their own top margin. Its container and
  buttons are the block at the end of the theme's `_default/list.html`; the arrows inside the buttons are the SVG
  chevrons of `taxonomy/tag.html`, the owner's choice over `list.html`'s text arrows - they match the Previous and
  Next cards under an article, and a text arrow depends on the font. Neither theme block had been ported before,
  because the Hugo site never had enough posts to show them.
- The buttons look the same on every list since 2026-09-19: `rounded-md`, with the dark-mode colours. The theme gives
  the two blocks different buttons - `rounded-md` in `list.html`, `rounded-full` and no dark-mode classes in
  `tag.html`, so the tag pages had round buttons that stayed white in dark mode. The reviewer noticed the two shapes
  and the owner chose one for all; the theme's original classes are kept in a comment in `Pagination.astro`. This is
  a deviation from the Hugo output, recorded in [MIGRATION-PLAN.md](MIGRATION-PLAN.md) §9.
- One thing is deliberately not like Hugo. Both theme templates loop over `.Pages`, which is every post of the list,
  and not over `.Paginator.Pages`, the posts of the current page. On the Hugo site every page of a paginated list would
  therefore show all the posts, and only the Previous and Next links would differ. That bug is not reproduced: here a
  page shows its own posts.

Not generated: the `/page/1/` pages. Hugo emits them as redirects to a list's own address. Whether to add them is the
open decision in `MIGRATION-PLAN.md` §5.5; pagination does not change it.

## 7. How it is built

In `src/lib/lists.ts` - `src/lib/posts.ts` until 2026-09-22, when the list code became shared with the Video list
and `posts.ts` kept only what a post is (`VIDEO-PAGE.md`, section 4); `getPosts()` is still there and calls
`published()` in `lists.ts`:

- `getPosts()` - the order in section 2.
- `groupByYear()` - the posts of each year, newest year first. It existed already, for the year badges.
- `paginateList(items, base)` - cuts a list into pages and gives each its posts, its number, the number of the last
  page, and the addresses of the previous and next pages. The base is `/posts/<year>/` for a year, so its links never
  leave the year.
- `pageUrl(base, n)` and `pageParam(n, prefix)` - the address of page n, and the route parameter that produces it.
- `pageNumbers(current, last, base)` - the numbered links of one page, by the rule in section 6; `paginateList()`
  stores them on every page. `yearSwitcher(years, currentYear)` - the entries of the year switcher, by the rule in
  section 4. Both read their threshold from `pagination` in `src/config.ts`.
- `src/components/Pagination.astro` renders Previous, the numbers and Next for every list, and
  `src/components/YearSwitcher.astro` the year buttons; both since later on 2026-09-19, see sections 4 and 6.
- `src/components/ListByYear.astro` places the two around a list - the switcher above, the buttons below - and
  `paginateByYear(posts, base)` gives a route the pages of a list split by year, its own address included; both from
  the evening of 2026-09-19, when every list got years (section 5). The three list routes are a few lines each now.
- `yearLinks(groups)` - the year switcher's buttons.

The list routes are rest-parameter routes, one file per list:

- `src/pages/posts/[...page].astro` - the parameter is undefined for `/posts/`, `2025` for `/posts/2025/` and
  `2025/page/2` for `/posts/2025/page/2/`. It was `src/pages/posts/index.astro`.
- `src/pages/categories/[slug]/[...page].astro` and `src/pages/tags/[slug]/[...page].astro` - the parameter is
  undefined for page 1 and `page/<n>` after it. They were `src/pages/categories/[slug].astro` and
  `src/pages/tags/[slug].astro`.

Each keeps its header comment, with a note on what changed. `src/components/CardList.astro` (`PostList.astro` until 2026-09-22) takes one page (`page`)
instead of the whole list (`posts`), plus the optional `years` and `currentYear`.

Astro has a `paginate()` helper for `getStaticPaths`, but it cannot produce these addresses: in a rest-parameter route
it puts page 2 at `/posts/2/`, and it knows nothing about years. The helpers above are about thirty lines.

The single posts stay in `src/pages/posts/[slug].astro`, which also matches one segment after `/posts/`. The two never
produce the same address as long as no post's file name is a year, like `2025.md`. The templates and `CONTENT.md` say
so. `npm run dev` picks the right one: measured, `/posts/2025/` shows the year and `/posts/working-in-pairs/` the post.

## 8. The posts added to see it

Twenty-one posts were added in `src/content/posts/`, each with `##` sections and `###` subsections, so each also has a
table of contents with 8 to 12 entries:

- fifteen on biolocation: tools, questions, the journal, map and water dowsing, the grids, the ideomotor effect, what
  research has found, the blind self-test and safety;
- six more on field work, to reach the counts the owner asked for: what to take into the field, map and compass,
  marking a site, where to train, working in pairs and documenting a trip.

With the two posts that were there already, 2026 has 8 published posts, 2025 has 6 and 2024 has 9. The order of the
dates follows the links between the posts: a post that another one links to is always the older of the two.

## 9. Checks

- `npm run fix` - only formatting; `npm run check` - 0 errors, 0 warnings, and Prettier passes; `npm run build` - 62
  pages, no warnings.
- In headless Edge, on the built site and on `npm run dev`, at 1280px:
  - every year page shows only its year, with the right number of posts: 5 and 3 for 2026, 5 and 1 for 2025, 5 and 4
    for 2024 (in `npm run dev`, 5 and 4 for 2026, because of the draft);
  - Previous and Next point to the neighbouring pages of the same year, and the last page of a year has no Next;
  - the switcher highlights the year being shown, 2026 on `/posts/`;
  - a click on 2025 on `/posts/` opens `/posts/2025/`, Next then opens `/posts/2025/page/2/`, and Previous brings the
    reader back;
  - a single post one segment after `/posts/` still opens as the post, with its table of contents;
  - no console errors.
- Stress test, on a copy of the site outside the repository; it is now `npm run check:pages:stress`, see section 10.
  159 generated posts were added: one year with a single
  post, one with exactly five, one with six, one with 47, one with 100, three posts in one year with exactly the same
  date and time, a year with only a draft, and two posts dated in the future, one later this year and one next year.
  A script recomputed the expected result from the front matter on its own, walked every year from its first page by
  following Next, and walked back by following Previous. It checked, on every page: the posts and their order, the
  addresses of Previous and Next, that the last page has no Next and no page exists after it, that no post appears
  twice or in the wrong year, the year switcher and its current year, and both sets of page numbers (the current page
  present and not a link, the first and last pages present, the pages around the current one present, every link
  pointing at its page, the most entries allowed, and a gap only where two or more pages are skipped). It walked the
  tag and the category that all generated posts share the same way. And it checked that `/posts/` equals the newest
  year's first page, that the draft-only year has no page, that the future posts have no page and next year has no
  list, and that the Share text of a generated post, which has no description, is the site title.
  - With five posts to a page: 8 years, 182 posts, 40 year pages, and 32 pages each for the tag and the category -
    all checks passed.
  - With one post to a page: 182 year pages, the longest year 100 pages, and 159 pages each for the tag and the
    category - all checks passed.
- Screenshots of the page numbers on the copy with one post to a page - page 50 of 100 and the last page, page 80 of
  159 of the tag - at 1280px and at 390px, light and dark. No horizontal scrolling; at 390px the numbers take one line
  under Previous and Next.
- Colours, against amendment 1 of `MIGRATION-PLAN.md` (a colour class new to the build must be checked against the
  Tailwind 4 values of the Hugo stylesheet). Every colour the buttons use is pinned in `tailwind.config.cjs` except
  `gray-50`, the hover background, which is new to the build, and `blue-50`, which the year badges already used.
  Converted from the oklch values in `reference/hugo-main.css`, both equal the Tailwind 3 values exactly: `#f9fafb`
  and `#eff6ff`. They need no pinning.
- Every route of the Hugo site still exists in the build except the nine `/page/1/` pages, which is the difference
  the plan already accepts, and `/posts/page/1/` among them.
- Later on 2026-09-19 the page numbers got the owner's rule and the year switcher its own (sections 4 and 6), so the
  two notes above on "both sets of page numbers" and on the screenshots of page 50 of 100 describe the earlier
  window. After the change: `npm run check` 0 errors, `npm run build` 63 pages, `npm run check:pages` passed, and
  `npm run check:pages:stress` passed with its 8 years and lists of up to 100 pages, 132 and 591 list pages walked.
  On a copy with one post to a page and five extra years (2019 to 2023), read in headless Edge in both themes at
  1280px and 390px: page 5 of 9 of 2024 shows `1 ... 5 ... 9` and the years `2026 2025 2024 2023 ... 2019`; the
  first page of 2021 shows the years `2026 ... 2022 2021 2020 2019`; page 9 of 19 of the largest tag shows
  `1 ... 9 ... 19`. Only the first and the last page, and the years shown, are links; no horizontal scrolling at
  390px, where the numbers take one line under Previous and Next. See `REVIEW-FIXES.md`, section 2.

## 10. The check script

The stress test above became `scripts/check-pagination.mjs` on 2026-09-19, when the owner agreed to keep it in the
repository. It needs no dependency. Its header comment lists everything it checks.

- `npm run check:pages`, right after `npm run build`, checks `dist/` of the project: every year of the Posts list,
  every tag and every category, walked from the first page to the last with Next and back with Previous, as in the
  stress test, plus `/posts/`, the pages of every published post, and the absence of any page for drafts, future posts
  and years without published posts. It reads the page size and the two thresholds of the page numbers and the year
  switcher from `src/config.ts`, and the site's time zone from `src/lib/date.ts`; on every list page it compares the
  page numbers and the year switcher found with the entries the rules of sections 4 and 6 give, exactly. Every list
  is walked year by year since the evening of 2026-09-19, and each list's own address is checked to show its newest
  year. Measured on the project that evening: 23 posts, 3 years, 16 tags, 2 categories, 46 list pages - all checks
  passed (34 pages while the tag and category lists were across years); the stress test then walked 148 and 591
  list pages.
- `npm run check:pages:stress` makes a temporary copy of the project in the system's temporary folder, links its
  `node_modules` instead of copying it, adds the generated posts of the stress test, builds the copy with 5 posts to a
  page and with 1, and checks both builds. When everything passes it removes the copy, the link first, so that
  removing the folder cannot reach the project's own `node_modules`; when something fails it keeps the copy and prints
  its path for inspection. Measured: 31 seconds; 132 and 591 list pages walked - all checks passed; the copy was
  removed, and the project's `node_modules` was untouched.
- It was also shown to catch faults: on a built copy, one page was deleted, one page number link pointed at the wrong
  page, one post on a tag page was replaced by another, and a draft was given a page. It reported all four, and one
  consequence of each where there was one - six messages in all - and exited with code 1.

The script mirrors rules that live in `src/lib/lists.ts`, `src/lib/urlize.ts`, `src/lib/date.ts` and the list
templates. When one of them changes on purpose, the script has to change with it.

## 11. Open questions

- A post dated in the future appears only with the first build after its date, and builds run only on a push. A daily
  scheduled build would publish such posts on their day without anyone pushing. Not added on 2026-09-19: the owner
  left it to judgement, and while nobody schedules posts it would only redeploy the same site every day. When the first
  post is scheduled, add this to the `on:` block of `.github/workflows/deploy.yml`; 04:00 UTC is 07:00 at +03:00, so a
  post dated later in the day appears the next morning. GitHub turns the schedule off in a public repository after 60
  days without activity.

  ```yaml
  # Rebuild every day at 07:00 +03:00, so that a post dated in the future appears on its day.
  schedule:
    - cron: "0 4 * * *"
  ```

- The `/page/1/` redirect pages, `MIGRATION-PLAN.md` §5.5.
- Whether the tag and category pages stay split by year (section 5). The owner asked for it on 2026-09-19 and said
  it may be rolled back after a look; the way back is `git revert` of the commit that added `ListByYear.astro`.
