# Changes made after the review of the sidebar-fix branch

Written on 2026-09-19. The branch `sidebar-fix` (commit `e210a07`: the post sidebar, pagination by year, the new posts
and the author guide) went to the reviewer on 2026-09-19. This file records what the review found and what was changed
in answer, one section per remark, so that the reviewer can see what was done and why. Each remark is resolved in a
commit of its own on the same branch. Only those changes are described here; the work under review is described in
[POST-SIDEBAR.md](POST-SIDEBAR.md), [PAGINATION.md](PAGINATION.md) and [CONTENT.md](CONTENT.md).

## 1. The page buttons were round on the tag pages and square on the Posts list

### 1.1 What the reviewer saw

On a tag page (`/tags/<tag>/`) the Previous, Next and page-number buttons at the foot of the list were pills, fully
round at the ends. On the Posts list (`/posts/`, `/posts/<year>/`) the same buttons were rectangles with slightly
rounded corners. The reviewer asked whether that was intended.

### 1.2 Where it came from

It was inherited from the theme, not decided here. The theme has two separate pagination blocks, and both were ported
with their class attributes copied verbatim, as the parity rule asks:

- `themes/void/layouts/_default/list.html`, used by the Posts list and the category pages, gives Previous and Next
  `rounded-md` plus colours for dark mode (`dark:bg-slate-900 dark:text-gray-300 dark:hover:bg-slate-800`).
- `themes/void/layouts/taxonomy/tag.html`, used by the tag pages, gives them `rounded-full` and no `dark:` classes at
  all. In dark mode those buttons therefore stayed bright white, which the reviewer's own screenshot shows.

The page numbers, which the theme does not have, copied the shape of the Previous and Next buttons next to them, so the
difference carried over to them.

Nobody had seen either block before: the Hugo site never had enough posts for pagination to render, so the two styles
existed only in the templates. The round buttons may well be the theme author's intent, since the tag chips on the
same page are `rounded-full` too; the missing dark-mode classes look like an oversight.

### 1.3 The decision

The owner chose one style for every list: rectangles with rounded corners (`rounded-md`), with the dark-mode colours,
keeping the Previous and Next buttons as they are. This is a deviation from the Hugo output, so it is recorded in
[MIGRATION-PLAN.md](MIGRATION-PLAN.md) section 9, like the other departures the owner has asked for.

The reviewer did not ask for it, but the owner also considered whether Previous and Next buttons had to be added
anywhere. They did not: every list page has them, and the article page has its own Previous and Next cards to the
neighbouring posts under the text (`PostNav.astro`, a port of the block in `single.html`). Nothing was added.

### 1.4 What changed

- `src/pages/tags/[slug]/[...page].astro` - four class attributes in the pagination block: Previous, Next, a page
  number and the current page number now carry the classes of the corresponding elements in `PostList.astro`, which
  are `list.html`'s. The SVG arrows inside Previous and Next are still `tag.html`'s (`list.html` uses text arrows).
  The theme's original class strings are listed in the comment above the block, and the notes at the top of the file
  say that the buttons are the one exception to "classes copied verbatim".
- `PAGINATION.md` section 6 - the two shapes are no longer described; a bullet records the unification.
- `MIGRATION-PLAN.md` section 9 - a new accepted deviation.
- `README.md` - the pagination row of the status table mentions the one button style.
- `CLAUDE.md` - one sentence in the pagination bullet, so that a later session does not "restore" the round buttons.
- This file.

### 1.5 Checks

- `npm run fix`, `npm run check` (0 errors, 0 warnings), `npm run build` (63 pages, no warnings) and
  `npm run check:pages` (16 tag lists, 2 category lists, 34 list pages walked, all checks passed).
- `npm run dev` started once and served a tag page.
- Measured in headless Edge on the second page of the tag with the most posts (19 posts, four pages, the first tag on
  `/tags/`) and on `/posts/2026/page/2/`, in both themes at 1280px and 390px. The computed styles are identical on the
  two pages in every combination:
  - Previous, Next and the page-number links: 6px corner radius; dark mode `rgb(18, 41, 79)` on `rgb(229, 231, 235)`
    (the panel colour `custom.css` gives `dark:bg-slate-900`); light mode white on `rgb(54, 65, 83)`.
  - The current page: 6px radius; dark mode `rgba(59, 130, 246, 0.18)` on `rgb(147, 197, 253)`; light mode
    `rgb(239, 246, 255)` on `rgb(20, 71, 230)`.
  - Below 640px the page numbers take the compact row of their own, on both pages, as before.

### 1.6 How to see it

Run `npm run dev`, open `/tags/` and choose the first tag, then go to its page 2 with Next: the buttons at the foot
now look like those on `/posts/2026/page/2/`. Switch the theme with the button in the header: the tag page's buttons
follow it instead of staying white. Narrow the window below 640px: the numbers move to a line of their own on both
pages.

## 2. One component for the page buttons, the owner's rule for many pages, and the year switcher on its own

Not a remark from the review. The owner asked for this on 2026-09-19 while the review was open, after section 1 had
shown that the block existed twice, once per theme template.

### 2.1 What the owner asked for

- The page numbers between Previous and Next: a list of up to five pages shows every number; a longer one shows only
  the first, the current and the last page, with an ellipsis between them that is not a link. Only the first and the
  last page are links there; the current page is not a link. Previous is absent on the first page and Next on the last,
  as before.
- The texts of the Previous and Next buttons stay translatable.
- One component for the block, so that any list added later gets the same buttons.
- The year switcher separate from it, as a component of its own with its own behaviour.

### 2.2 What changed

- `src/components/Pagination.astro` - new. Previous, the numbers and Next, rendered for the Posts list and the
  category pages by `PostList.astro` and for the tag pages by `pages/tags/[slug]/[...page].astro`, which both lost
  their own copy of the block; each passes the addresses of the neighbouring pages, the numbers and its own top margin
  (`mt-12` from `list.html`, `mt-10` from `tag.html`). The container and the buttons are `list.html`'s; the arrows are
  the SVG chevrons of `tag.html`, the owner's choice over `list.html`'s text arrows, because they match the Previous
  and Next cards under an article and a text arrow depends on the font. The button texts come from
  `src/i18n/strings.ts`, as before. The theme's original `tag.html` classes are listed in the component's comment.
- `src/lib/posts.ts` - `pageNumbers()` implements the rule; the threshold is `pagination.everyNumberUpTo` in
  `src/config.ts`, 5. The second set of numbers for screens below 640px (`numbersCompact`) is gone: five entries fit at
  390px, so one set does.
- `src/components/YearSwitcher.astro` - new. The year buttons moved out of `PostList.astro`, with a rule of their own,
  `yearSwitcher()` in `posts.ts` with `pagination.everyYearUpTo` (5): up to five years every year is shown; with more,
  the newest, the oldest and the year being shown with the year either side of it, and an ellipsis for the years
  hidden: `2026 ... 2023 2022 2021 ... 2015`. Keeping the neighbours is a decision made here, not asked for: a reader
  browsing by year moves to the year next door far more often than to the first page of a list. It is one line to
  change.
- `scripts/check-pagination.mjs` - checks both rules exactly: the entries found on every list page against the entries
  expected, for the numbers and for the year switcher.
- `PAGINATION.md` sections 4, 6, 7, 9 and 10, `MIGRATION-PLAN.md` section 9 (chevrons on the Posts list, where
  `list.html` has text arrows), `README.md` and `CLAUDE.md`.

### 2.3 Checks

- `npm run fix`, `npm run check` (0 errors, 0 warnings), `npm run build` (63 pages, no warnings) and
  `npm run check:pages` (all checks passed).
- `npm run check:pages:stress`: the copy with 159 generated posts spans 8 years, so both rules are exercised there -
  the year switcher with an ellipsis, and lists of up to 100 pages. 132 list pages with 5 posts to a page and 591 with
  1, all checks passed.
- The site itself has 3 years and at most 4 pages a list, so the ellipsis does not appear on it yet. To see it, the
  copy described under "How to see it" was built.

### 2.4 How to see it

On the site: `npm run dev`, then `/posts/2024/`, `/posts/2024/page/2/` and the tag pages - the buttons and numbers as
before, the arrows now chevrons on every list. For the ellipsis, on a copy of the project: set `pageSize` to 1 in
`src/config.ts` and add five posts dated 2019 to 2023, then `npm run build` and `npm run check:pages`; `/posts/2024/`
then has nine pages and the year switcher eight years.

## 3. The light-theme colours of commit 125643b: brought in unchanged, with one fix

Commit `125643b change light-theme colors` was pushed to `sidebar-fix`, and merged into `main`, on 2026-09-19 while
the two changes above were being made locally. The local branch was brought up to date with `git pull --rebase`, so
that commit is in the history exactly as pushed - same hash, same author, same content - and the commits above come
after it. Before the fix below, `git diff 125643b HEAD -- src/styles/custom.css tailwind.config.cjs` was empty.

### 3.1 What the commit does

- `src/styles/custom.css`: the light palette. The page background goes from `#f9fafb` (the theme's `gray-50`) to
  `#f5f5f4` (Tailwind `stone-100`), and the panels - the header bar, the post cards, the About card - from white to
  `#fafaf9` (`stone-50`). The rules in that file apply the two variables with `!important`, so the whole light theme
  follows. Dark mode is untouched.
- `tailwind.config.cjs`: three new colours, `bio-mint` `#f2f7f5`, `bio-lavender` `#f4f3f7` and `bio-warm` `#f7f6f3`,
  written as a second `colors` key inside `theme.extend`.

### 3.2 What was adapted

- The second `colors` key. A JavaScript object literal keeps only the last of two equal keys, and the pinned palette
  further down in the same `extend` object is the last one, so Tailwind never saw the three colours: loading the file
  in node listed five colour keys and no `bio-*`. They were moved, unchanged, to the top of the pinned block; the
  original lines stay where they were, commented out, with a note saying why. Loading the file again lists them, so
  `bg-bio-mint` and the like now exist. No page uses them yet, so the built CSS is the same as before the move.
- The comment above the light palette in `custom.css` still said the values were the theme's own defaults. A dated
  note after the block says they are not any more, and what the theme's were.
- Documentation: `MIGRATION-PLAN.md` section 9 records the palette as a departure from the Hugo colours, `README.md`
  (the palette section) and `CLAUDE.md` describe it, so that a later session does not "restore" the theme's grey.

### 3.3 Checks

- `npm run fix`, `npm run check` (0 errors, 0 warnings), `npm run build` (63 pages, no warnings) and
  `npm run check:pages` (all checks passed) after the change; `npm run dev` started once.
- Loading `tailwind.config.cjs` in node: before the move 5 colour keys and no `bio-*`; after it 8, the three present.
- Light mode, measured in headless Edge on `/posts/2024/page/2/` at 1280px: the page background `rgb(245, 245, 244)`,
  the header bar and a post card `rgb(250, 250, 249)`, and the Previous, Next, page-number and year buttons
  `rgb(250, 250, 249)` as well - `custom.css` applies `--panel-bg` to the theme's white surfaces, so the buttons
  follow the palette; the highlighted page number keeps its `blue-50`, `rgb(239, 246, 255)`. The white buttons
  measured in section 1.5 were measured before commit `125643b`.

## 4. Every list split by year, through one component

Not a remark from the review: the owner asked for it on 2026-09-19, after section 2, and said it may be rolled back
after a look. The tag and category pages now have what `/posts/` has - a year switcher under the title and pages of
five within a year: `/tags/<tag>/` (the newest year), `/tags/<tag>/2025/`, `/tags/<tag>/2025/page/2/`, and the same
for categories. One `paginateByYear()` in `src/lib/posts.ts` gives all three routes their pages, and one
`ListByYear.astro` puts the switcher above a list and the page buttons below it; the two kinds of cards (`list.html`'s
in `PostList.astro`, `tag.html`'s in the tag route) are unchanged. `/tags/<tag>/page/2/`, which existed for a few
hours, is gone; nothing linked to it. Details and the reasoning in [PAGINATION.md](PAGINATION.md), sections 3, 5 and 7. To roll back: `git revert` of the commit that added `ListByYear.astro`.

Checks: `npm run check` 0 errors, `npm run build` 93 pages (the year addresses of the tags and categories are new),
`npm run check:pages` 46 list pages walked, all passed; `npm run check:pages:stress` 148 and 591 list pages over 8
years, all passed; `npm run dev` started once. Against the Hugo route list only the nine `/page/1/` aliases are
missing, as before. On the built site `/tags/<first tag>/` shows the switcher `2026 2025 2024` and
`/tags/<first tag>/2024/page/2/` exists.

## 5. "All Tags", the tag chips and the category label led to a 404 on the dev server

Reported by the owner on 2026-09-19 evening, with a screenshot: on `npm run dev`, "All Tags" at the foot of a tag
page opened the 404 page. The reviewer then reported the same for the tag chips on the cards of `/posts/2026/`; it is
the same cause and the same fix.

### 5.1 The cause

Four kinds of link were built without a trailing slash, exactly as Hugo builds them: "All Tags" (`/tags`, from
`{{ "tags" | relURL }}`), the tag chips on the cards of the Posts, category and tag pages (`/tags/hugo`, a string
concatenation in the theme), and the category label above an article (`/categories/blog`). They were kept that way
on purpose, for parity with the Hugo output; `ARTICLE-PAGE-FIX.md` had even removed a slash from the category link.
But `astro.config.mjs` sets `trailingSlash: "always"`, and Astro's dev and preview servers answer a slash-less
address with 404 - measured on both: `/tags` 404 and `/tags/` 200, the same for `/tags/hugo` and `/categories/blog`.
GitHub Pages redirects `/tags` to `/tags/`, so the live site never showed it; every such click there cost a redirect.

### 5.2 What changed

The four hrefs end with `/` now - `PostList.astro`, the tag route (chips and "All Tags") and `ArticleLayout.astro` -
which is the address the pages are built at. The comments that explained the missing slash as deliberate were
rewritten to say why it is there now; `CLAUDE.md`'s list of reproduced quirks and `MIGRATION-PLAN.md` section 9 record
it, and `ARTICLE-PAGE-FIX.md` carries a note at the place that removed the slash. The addresses of the pages did not
change.

### 5.3 Checks

- `npm run check` 0 errors, `npm run build` 93 pages, `npm run check:pages` all passed.
- In the built site no `href` to `/tags`, `/tags/<tag>` or `/categories/<category>` is left without the slash
  (searched `dist/`), and on the dev server the path tag page -> "All Tags" -> `/tags/` answers 200, as does a tag
  chip and the category label.

## 6. The menu highlights the item of the page being read

Asked for by the owner on 2026-09-19 evening, not a remark from the review. The theme's menu partial meant to mark
the current page's entry with `active font-bold` and its section's entry with `ancestor font-semibold`, but it emits
them as a second `class` attribute on the link, which browsers drop - so no item was ever bold on the Hugo site, and
`Menu.astro` had left the classes out to render the same (`README.md`, "The active menu item is highlighted", has the
markup). The classes are merged into the one attribute now, in the header row and in the hamburger panel.

The section match is wider than Hugo's: every entry but Home is the ancestor of the pages under its address, so Posts
is semibold on the year pages and on an article, Tags on a tag page and Categories on a category page, where Hugo
marked nothing; Home matches only the home page. The theme's weights alone turned out too subtle - the owner did not
notice them - so the highlighted entry also takes the colours of the year switcher's highlighted button, the site's
existing "you are here" look: `bg-blue-50 text-blue-700`, and `bg-slate-700 text-blue-300` in dark mode.

Checks: `npm run check` 0 errors, `npm run build` 93 pages, `npm run check:pages` all passed, `npm run dev` started
once. On the built site every kind of page carries exactly one highlighted entry, the right one: `/`, `/posts/`,
`/tags/`, `/categories/` and `/about/` their own entry in bold; `/posts/2026/` and an article Posts in semibold;
`/tags/hugo/` Tags and `/categories/blog/` Categories in semibold. Screenshot of the header on `/posts/2026/` taken.

## 7. Noticed on the way, not done

Two things seen while the sections above were being worked on. Neither was asked for, so neither was changed; they
are recorded here so that they are not lost, and this is the place to look before touching them.

- **The 404 page is a placeholder.** `src/pages/404.astro` renders a bare "404" heading and a "Home" link inside the
  base layout, nothing more: no text, no styling of its own. It has no Hugo source to port - the theme has no
  `404.html`, so the Hugo site relied on GitHub Pages' own error page - which is why it is not among the
  `TODO(migration ...)` stubs. Astro builds it as `dist/404.html`, which GitHub Pages serves for any missing address,
  so it is what a reader sees after a mistyped link or a renamed post. What it needs is a design decision: a short
  text in the site's language and, probably, the card look of the other pages.
- **`any` in `Disqus.astro`.** Line 47 reads `(window as any).disqus_config = function (this: any) {...}`; the house
  rules forbid `any`. The component is the Disqus work described in `DISQUS-FIX.md`, so the change should be agreed
  with its author. The typed form is a `declare global` block that adds `disqus_config` to `Window` with the shape
  Disqus documents (`page.url`, `page.identifier`), and `this: { page: { url: string; identifier: string } }` on the
  function. No behaviour would change.

## 8. The chip text flickered while a footer icon was hovered

Reported by the reviewer on 2026-09-19 evening, with a screenshot of a tag page: moving the mouse over any of the
three social icons in the footer made the text of every tag chip on the page "blink". She could not see how the two
were connected; they are, through the browser's compositor.

### 8.1 The cause

The footer wraps each icon in `transform transition duration-200 hover:scale-110`, so a hover animates the icon's
transform for 200 ms, and Chromium runs such an animation on its compositor thread. While it runs the browser does
not know where the animated element will end up, so it treats it as overlapping everything that is painted after it
and gives that content composited layers of its own for the duration; text in such a layer is rasterised again, and
differently - without the subpixel antialiasing the desktop uses - which is the blink. Only two kinds of element were
painted after the footer: the tag chips (`relative z-20`, above the card's stretched link on `z-10`) and the year
number in the year badge (`relative z-10`). A positive `z-index` stacks an element in the nearest stacking context,
and there was none between them and the document root - `main` was not one - so they were painted after the
footer, which comes later in the document. Measured in headless Edge at 1280x900, dark mode, on the tag page: 80 ms
into the hover the two visible chip rows differed from the resting page in 1023 pixels each, by up to 94/255 per
channel, and the "2025" in the year badge differed too, while nothing else outside the icon changed; with GPU
compositing on it was 1093 pixels. The diff image shows exactly the chip text and the year. Hugo has the same markup
and the same flicker.

### 8.2 What changed

`main` in `src/layouts/Base.astro` has `isolate` (`isolation: isolate`) now: the page content is one stacking
context, every `z-index` inside it is resolved within `main`, and the chips and the badges are painted where they
stand, before the footer. Nothing inside `main` has to stack against the header or the footer - the header is
`fixed z-30` and comes later in the document, so it stays on top - and the class changes no picture. One class in
one file; the comment above `main` explains it. The alternative, `isolate` on each post wrapper and each year
badge, would have been four edits in two files and would have left the `z-10` span on the home page out.

### 8.3 Checks

- `npm run fix` unchanged, `npm run check` 0 errors, `npm run build` 93 pages, `npm run check:pages` all
  passed, `npm run dev` started once and served the tag page with the class on `main`.
- The probe: headless Edge driven over the DevTools protocol, a screenshot at rest and one 80 ms after a synthetic
  mouse move onto the GitHub icon, compared pixel by pixel over the whole viewport. After the change: 0 differing
  pixels in the chip rows on the tag page (two rows visible) and on `/posts/2026/` (three), and the only band of
  the viewport that changes during the hover is the icon itself. The same measurement with `isolation: isolate`
  set from the console on the post wrappers alone had already given 0 for the chips and left the year badge
  flickering, which is what settled the choice of `main`.

## 9. The post cards sat right of centre on a phone

Reported by the reviewer on 2026-09-19 evening, with a phone screenshot of a tag page: on a laptop the lists look
right, on a phone the cards are visibly pushed to the right. The owner then asked for every menu item and its
sub-pages to be checked for the same thing at phone widths.

### 9.1 The cause

Both theme list templates indent the cards under the year badge by 2rem (`ml-8` in `list.html` and `tag.html`),
so that the cards hang under the badge like a timeline. At phone widths the page already has 48px of side gap
(`main`'s `px-8` plus the list container's `px-4`), so the first card stood 80px from the left edge and 48px from
the right; measured in headless Edge at 390px and 360px on `/posts/2026/` and a tag page. Against the 896px column
of a laptop the 2rem reads as the intended timeline; on a 360px screen it takes 32px out of a 296px column, and the
eye reads the whole card as off-centre. Hugo renders the same indent at every width.

### 9.2 What changed

`ml-8` became `sm:ml-8` on the card list in `PostList.astro` (the Posts list and the category pages) and in the
tag route: below 640px the cards span the column, 48px on both sides; from 640px up the indent is what it was, so
the laptop layout and the parity screenshots at 1280px are unaffected. The year badge does not move. 640px is the
threshold the responsive menu already uses (`MIGRATION-PLAN.md` section 9).

### 9.3 Checks

- `npm run fix`, `npm run check` 0 errors, `npm run build` 93 pages, `npm run check:pages` all passed,
  `npm run dev` started once and served `/posts/2026/` with the new class. No `ml-8` without the prefix is left in
  `dist/`.
- Built site, first card of `/posts/2026/`, a tag page and `/categories/blog/`: 48px on both sides at 390px and
  360px, 32px of indent from the badge at 640px and 1280px as before; no horizontal overflow on any page.
- Every menu item and its sub-pages at 390px and 360px (`/`, `/categories/`, two category pages, `/posts/`, two
  more year and page addresses, `/tags/`, three tag pages, `/about/`, an article, the 404 page): every visible
  block wider than half the viewport was compared by its left and right gaps. Nothing else is off-centre. What the
  check does list is by design: the gradient rule beside the year badge, which starts after the badge; the
  left-aligned rows of tag chips and the bulleted list items inside an article; the theme link inside the centred
  footer text. One reading of the 404 page, the first navigation of the run, was taken before its stylesheet had
  loaded and came back clean on the second pass.
- To see it without a phone: in Chrome or Edge, F12, then Ctrl+Shift+M for the device toolbar, pick a phone or type
  390 as the width, and reload. On a real phone: `npm run dev -- --host`, then open `http://<laptop IP>:4321/`
  on the phone over the same Wi-Fi.
