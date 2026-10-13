# The Video section

The Video menu item, its list and the video pages were added by the colleague on `main` between 2026-09-20 and
2026-09-22 (commits `3379541` to `a3c194c`). This file records what that work consists of, what was fixed on the
branch `video-page-v1` on 2026-09-22 and why, how the section was then reshaped so that posts and videos stay apart,
and what was noticed on the way and left alone. It is the place to look before touching the section again.

## 1. What exists

- A content collection `video` in `src/content/config.ts`, with the fields of a post plus `videoId`, `videoUrl`,
  `thumbnail`, `duration`, `heroImage` and `videoPlatform`. Ten sample entries live in `src/content/video/`:
  three in 2026, four in 2025 and three in 2024, the layout the owner asked for on 2026-09-22 evening so that every
  year page has a list of its own. The colleague's eight were four, two and two; `video-3.md` moved from 2026-06-11
  to 2025-06-11, and `video-8.md` (2025) and `video-9.md` (2024) are copies of her entries with the id
  `placeholder`, eleven characters like a real one and just as unplayable. `templates/video.md` is the author's
  template.
- `src/lib/lists.ts`: what every list shares and nothing about any one kind of entry - the filter and the order
  every collection is read with (`published()`), the pages, the split by year, the year switcher's rule, and the two
  plain shapes the shared components render, `Card` and `NavLink`.
- `src/lib/posts.ts`: only posts - `getPosts()`, the terms, the reading time, `postCard()`, `postLink()`.
  `src/lib/video.ts`: only videos - `getVideos()`, `videoCard()`, `videoLink()`.
- `src/components/CardList.astro` (was `PostList.astro`): the list of cards by year, for `/posts/`, the category
  pages and `/video/`. It renders `Card`s, which the routes build with `postCard()` or `videoCard()`. The tag route
  renders `Card`s too, with `tag.html`'s own markup.
- `src/layouts/ArticleLayout.astro`: the article frame on plain props, with the table-of-contents sidebar and a
  `media` slot. `src/layouts/Post.astro` maps a post onto it, `src/layouts/VideoLayout.astro` a video, with the
  player in the slot and the duration in place of the reading time.
- Two routes: `src/pages/video/[...video].astro` builds `/video/`, `/video/<year>/` and `/video/<year>/page/<n>/`,
  and `src/pages/video/[slug].astro` builds a page per video through `VideoLayout.astro`, with the Disqus block
  below the text.
- The menu entry `Video` between Posts and Tags in `src/config.ts`, and the string `list_watch_video` in
  `src/i18n/strings.ts`, the last line of a video's card.

## 2. Fixed on 2026-09-22, branch `video-page-v1`

Reported by the owner from the live site, where `/video/` showed only the two videos of 2024 and `/video/2024/`
answered 404; a video page showed a grey frame reading "server not found" in place of the player.

- **The year pages did not exist and the list showed the oldest year.** The route is `[...video].astro`, so its
  rest parameter is named `video`, but `getStaticPaths()` returned `params: { page: ... }`, copied from the Posts
  route. Astro ignores a param the route does not declare, so every entry mapped to `/video/`; the last one
  written was the oldest year, and that is what the page showed. The three keys read `video` now. Built: `/video/`
  shows the newest year, `/video/2026/` the same, and every year has its own page and list (three, four and three
  videos since the evening's sample layout, section 1).
- **The player asked for a non-existent host.** The `iframe` address read `youtube.com{post.data.videoId}`: no
  `/embed/` path, no `$` before the brace and a variable that does not exist in the file, so the browser tried to
  resolve that text as a host name. It is `https://www.youtube.com/embed/<videoId>` now, the address of YouTube's
  embeddable player. The video ids in the sample entries are placeholders (`dQww4w9WgXcQ`, `4w9WgXcQ`, ...; a real
  id has eleven characters), so the player loads and then shows YouTube's own error until real ids are filled in.
- **`astro check` reported four errors.** `ArticleLayout.astro` read `lastmod`, `summary`, `share_title` and
  `share_description` from `data`, and since `Post.astro` accepted a video the type of `data` was the union of the
  two schemas, which lacked them on the video side. The four fields were added to the video schema as optional for
  a few hours; section 4 removed the need for them, and they are gone again.
- `tsconfig.json` was reformatted by `npm run fix`; `main` had left it unformatted, which made `npm run check`
  fail on the Prettier half.

These went in as commit `be87958`. Then `sidebar-fix` was merged into this branch (`6fae975`, 2026-09-22): the only
conflict was the status table in `README.md`, and the merged tree passed `npm run check`, the build and
`npm run check:pages` before the work below started.

## 3. Noticed on the way, not done

- The sample videos carry placeholder ids, so no player plays until real ids are entered; see section 2.
- `videoUrl` and `videoPlatform` are stored and not read; the player is YouTube regardless of `videoPlatform`.
  `heroImage` and `thumbnail` are stored and not shown.
- A video's tags link to the tag pages, which list posts only: `getTerms()` in `src/lib/posts.ts` reads the posts.
  Whether a tag page should list videos as well, and how the two would sit together, is a design question, not a
  bug.
- `README.md` and `CLAUDE.md` describe the structure as of this branch; the colleague's `main` still has the older
  copies until she merges.

## 4. Done on 2026-09-22 evening: posts and videos apart, shared code on plain data

Asked for by the owner in two steps. First: a `VideoLayout` of its own instead of `ArticleLayout` as "the universal
plug for every hole". Then, seeing the result: the two kinds of entry are not to be mixed at all - what is truly
common is shared, everything else stays apart, the split by year included.

### 4.1 What was wrong

The colleague's section duplicated the Posts code: `VideoList.astro` was a copy of `PostList.astro` with the card's
link changed, and `src/lib/video.ts` a copy of `src/lib/posts.ts` with the names changed, so every fix the review of
`sidebar-fix` brought to the Posts list (the trailing slash on the tag chips, the `any`, the `ml-8` indent on a
phone, the one page-button style) was missing on the Video list. `Post.astro` had been widened to `Post | Video` so
that `ArticleLayout.astro` could render a video by reading a post's fields off it, which is what forced the four
schema fields of section 2. A video page also showed "0 min read", the word count of a one-sentence body, where the
entry has a `duration`.

### 4.2 The shape now

- **Shared, on plain data or type parameters, knowing no collection:** `src/lib/lists.ts` (`published()`,
  `paginateList()`, `pageNumbers()`, `pageUrl()`, `pageParam()`, `groupByYear()`, `yearLinks()`,
  `paginateByYear()`, `yearSwitcher()`, and the shapes `Card` and `NavLink`); `CardList.astro`, which renders
  `Card`s; `ListByYear.astro`, `Pagination.astro` and `YearSwitcher.astro`, unchanged apart from the import;
  `PostNav.astro`, which renders `NavLink`s; and `ArticleLayout.astro`, the article frame on plain props - title,
  description, date, an optional updated date, categories, tags, the text of the clock item, the share texts, the
  headings, the previous and next links - with the Base layout, the table-of-contents sidebar that lived in
  `Post.astro`, and a named slot `media` between the header and the text.
- **Per entity:** `src/lib/posts.ts` and `src/lib/video.ts` say what a post or a video is and how it becomes a
  `Card` or a `NavLink`; `Post.astro` and `VideoLayout.astro` map one entry onto the frame's props - a post
  supplies the reading time, `lastmod` and its share fields, a video its `duration` and the player in the `media`
  slot; the routes build the cards of their list with `postCard()` or `videoCard()`.
- **Two rules that follow:** no `Post | Video` anywhere, and no check of an entry's collection in shared code. The
  only two things that differ between a post and a video on a card - the address and the last line, "Read more" or
  the colleague's "Watch the video" - are inside the `Card`, put there by the mapper. A third kind of entry would
  be one collection, one `lib/` file with its two mappers and one layout wrapper; nothing shared would change.
- `scripts/check-pagination.mjs` walks `/video/` by year like the other lists and checks that every published video
  has its page; `reference/astro-routes.txt` lists the video routes, which Hugo never had.

### 4.3 What the colleague's VideoList had that the shared list has not

Nothing: the calendar icon in the date cell and the two-line clamp on the summary, the two visible differences of
her copy from the `PostList.astro` of its day, were already in the `sidebar-fix` version of the list. Her string
`list_watch_video`, which her copy did not use, is the last line of every video card now.

### 4.4 Checks

- `npm run fix`, `npm run check` 0 errors (4 hints, down from 6), `npm run build` 105 pages,
  `npm run check:pages` all passed (49 list pages walked, the three video years included),
  `npm run check:pages:stress` all passed (151 and 599 list pages), `npm run dev` started once and served every kind
  of page: `/video/`, `/video/2024/`, a video page, `/posts/2026/`, a post, a category page, a tag page.
- The built post page, `/posts/`, a tag page and `/video/` were compared with copies saved before the work: the
  lists are byte-identical apart from the build hashes in the head, and the post page differs only in the scoped
  style hash and the `data-astro-cid` attributes, because the sidebar's style block moved from `Post.astro` into
  `ArticleLayout.astro`. Screenshots at 1280px and 1600px: the sidebar in place on a post, the player and "12:34"
  on a video page, the cards of `/posts/2026/`, `/video/2024/` and a tag page as before.

## 5. How to check it

`npm run dev` on this branch, then `/video/`, `/video/2024/` and any video page. Or `npm run build` and list
`dist/video/`: the list pages are `/video/`, `/video/2024/`, `/video/2025/`, `/video/2026/`, and there is one folder
per entry. The live site shows the section as it is on `main` until this branch is merged there.

## 6. Planned: access to a video

Stated by the owner on 2026-09-22 evening, after section 4 was done. Nothing of it is built. This records the intent
and the constraints, so that the work, when it comes, lands in the right place and does not undo the separation.

- **The intent.** Some videos will be open to paying users only. The site has no sign-in and no payment today; both
  will come through third-party services, and a user who has not paid does not get the video. The colleague marked
  the spot for it in `VideoLayout.astro`, in the `media` slot where the player is rendered: her note is kept there.
- **The constraint: the site is static.** GitHub Pages serves the files of `dist/`, there is no server, and
  everything in the HTML is public - a YouTube id in the `iframe` is readable through "view source" whatever is
  painted over it. So a restricted video's id must never be in the build. The page is built with a stub in place of
  the player; a small client script asks the service, which returns the player address only to a paying user, and
  the script puts the player in. Everyone else sees the stub.
- **Where it lives.** `VideoLayout.astro` (the stub and the script, in the `media` slot) and `src/lib/video.ts`.
  Nothing shared changes - not `ArticleLayout.astro`, not `CardList.astro`, not `lists.ts` - and the posts are not
  affected. Access is a property of a video, not of an article, which is what section 4 was for.
- **The data.** One front-matter field per video, for instance `access` with the values `public` (the default) and
  `paid`, so that the author marks a lecture. A paid entry carries no `videoId` in the repository; the id is kept at
  the service. The card in the list stays for everyone (title, description, duration), only the player is closed.
  The field is not added yet: nothing reads it, and its values depend on what the service sells (a course, a single
  lecture, a subscription), so it is defined together with the service.
- **Deferred until the service is chosen.** The service itself, which decides sign-in, payment and what a "product"
  is; the client script; the look of the stub. A service is a dependency and follows the rule for those: named,
  sized and agreed with the owner before it is added.
- **YouTube does not protect the video itself.** An unlisted video plays for anyone who knows the id, on YouTube,
  past the site. The service closes the site's page, not the video. Real protection means a host with signed
  addresses (Vimeo with a domain restriction, or similar), which is a separate decision when it comes to it.

### 6.1 The mechanism, step by step

Written on 2026-09-22 at the owner's request. It holds for any sign-in and payment service that can answer "may this
visitor watch this item" to a request from the browser; the file names are proposals.

In the repository and the build:

1. The author marks the entry in its front matter: `access: paid`. A public entry has `access: public`, or no field
   at all, and keeps its `videoId` as today. A paid entry carries no `videoId` - the real id lives at the service
   (step 9). `src/lib/video.ts` refuses a paid entry that has a `videoId`, at build time, so that an id cannot reach
   the build by mistake.
2. The list does not change: `videoCard()` builds the same card for both kinds - title, date, description, duration,
   "Watch the video". Whether a paid card gets a mark is a design choice for later.
3. `VideoLayout.astro` renders the `media` slot in one of two ways. Public: the `iframe` as today. Paid: a stub in
   the player's place - a box of the player's size with a short text and one button - with a `data-video` attribute
   holding the entry's slug, plus the client script (one file under `src/scripts/`, loaded on paid pages only). The
   text below the player stays public, as does the card: search engines and shared links still see that the lecture
   exists.

In the browser:

4. The script asks the service whether this visitor may watch this slug. The visitor is known to the service by the
   session it set at sign-in: a cookie on the service's domain, or a token the service handed back in the address
   after the redirect, which the script keeps in the browser's storage.
5. Not signed in: the button of the stub sends the visitor to the service's sign-in or purchase page with the video
   page as the return address. After paying, the service sends the visitor back here and step 4 runs again.
6. Signed in and entitled: the service answers with the player address - the YouTube embed address with the real
   id, or a signed address on a host that has them (the last point of section 6). The script replaces the stub with
   the `iframe`. The id reaches only that visitor's browser, at that moment.
7. Signed in, not entitled: the stub stays, with the button leading to the purchase.
8. Service unreachable, or the request fails: the stub stays, with a line saying so. The page itself never breaks,
   because everything but the player was built ahead of time.

Where the ids live and who answers step 4:

9. The mapping from slug to real id, and the check "does this visitor's purchase cover this slug", need code that
   runs on a server - the one thing GitHub Pages cannot host. Two ways, to be decided with the service: the
   service's own gated-content feature, if it has one (many membership services return a piece of content to
   entitled members only); or a small function on a serverless host (a Cloudflare Worker, a Netlify function, or
   similar) that holds the mapping, validates the service's session and returns the address. Either way the
   repository holds no id of a paid video and no secret: the function's keys stay on its host.

   Amended 2026-09-28, on the branch `clerk-auth` (an amendment of 2026-09-25 about the previous sign-in provider's
   database stood here and left with that provider). The sign-in service is Clerk now, which keeps no table of the
   site's data, so the function this step described is built: a Cloudflare Worker, `workers/video-access/worker.mjs`, holds the slug-to-id map as a secret, checks the visitor's
   Clerk session token and the access record of CLERK-DASHBOARD.md 7.3, and answers the player address. Steps 1 to
   8 are built as written, with three differences: the guard of step 1 is in the schema (`src/content/config.ts`,
   which also refuses `videoUrl` and `thumbnail` on a paid entry) plus a check of the text in `src/lib/video.ts`;
   the script of step 3 is on every video page, because Astro 4.16 hoists a component's script for every page that
   imports it, and it returns at once on a public one; step 4 sends the session token in a header rather than a
   cookie. PAID-VIDEO.md is the how-to; the consilium verdict of the day is
   `.specify/consilium/2026-09-28-paid-video-access.md`.

What this does and does not protect:

10. It closes the page: a visitor who has not paid never receives the id. It does not stop a paying visitor from
    copying the id and passing it on, because YouTube plays it for anyone (the last point of section 6). If that
    matters, the host with signed, expiring addresses is the answer, and steps 1 to 9 stay the same - only what step
    6 returns changes.

What would change in the tree when it is built: the `access` field in the video schema (`src/content/config.ts`),
the guard in `src/lib/video.ts`, the two branches of the `media` slot in `VideoLayout.astro`, one script file, and
the service's address in `src/config.ts`. Nothing shared - not `ArticleLayout.astro`, not `CardList.astro`, not
`lists.ts` - and nothing about posts.

## 7. The lecture dates, corrected on 2026-09-22

The owner read the year pages and found the course out of order: "Лекция вторая" carried an earlier date than
"Лекция первая", and the same held all the way down - the higher the lecture number, the older the date. The sample
entries had been written that way from the start, so the six lectures ran backwards through the calendar.

The six lecture dates were reassigned in lecture order. The set of dates is unchanged; they were only swapped among
the six files, so every year page still lists the same number of videos and the 3 / 4 / 3 layout of section 1 is
intact.

- `video-1.md`, Лекция первая: 2026-08-17 becomes 2024-02-14
- `video-2.md`, Лекция вторая: 2026-07-15 becomes 2025-03-20
- `video-3.md`, Лекция третья: 2025-06-11 becomes 2025-06-10
- `video-4.md`, Лекция четвертая: 2025-06-10 becomes 2025-06-11
- `video-8.md`, Лекция пятая: 2025-03-20 becomes 2026-07-15
- `video-9.md`, Лекция шестая: 2024-02-14 becomes 2026-08-17

The first lecture is now the oldest video on the site and the sixth the newest, which is what a course recorded over
three years looks like. Each of the six files carries a note in its front matter saying so.

The four "Введение в биолокацию и работу с маятником" entries were left where they are, because the owner asked
about the lectures: `video-7.md` and `video-6.md` sit in 2024 between the first and second lectures, `video-5.md` in
2025, and `my-first-video.md` is the newest video on the site. Three of them are duplicates of the same placeholder
text, so where they belong is a content question rather than a chronology one.

One consequence is worth knowing before it is mistaken for a bug. Every list on the site is ordered newest first
(`published()` in `src/lib/lists.ts`), so a year page reads from the latest lecture down to the earliest: /video/2025/
shows Лекция четвертая, Лекция третья, Введение, Лекция вторая. The dates are right and the ordering rule is the
one the owner set for posts; a course that should read first-to-last on the page would need the video lists to sort
the other way, which is a change to `src/lib/video.ts` and nothing else, and has not been asked for.

## 8. The review of 2026-09-22 and what it found

The reviewer sent six remarks about finishing the section: pagination on the video list, the `video` tag leading to a
404, a category for the lectures on the Categories page, the header being too narrow for a sixth menu item, the logo
in the header, and the carousel cropping its photos on a phone. They are answered one by one, with the measurements
behind each answer and a recommendation, in [REVIEW-VIDEO.md](REVIEW-VIDEO.md). Two of the six turned out to be
already in the tree; the rest were built the same day, each under a "Done" heading in that file. The one that reaches
this section: a tag or a category now spans both collections, so a lecture appears on `/tags/биолокация/` beside the
articles, `/tags/video/` exists at last, and the lectures are a category of their own, renamed from
`education video` to `обучающие видео` at the owner's request. The separation rule of section 4 is untouched - the
merge happens in `src/lib/terms.ts`, on flat data, with no branch on where an entry came from.
