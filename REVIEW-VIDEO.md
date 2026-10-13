# Review of the video section: six remarks, what each one costs

Written on 2026-09-22. The reviewer sent six remarks about finishing the Video section, four days after the section
itself was built ([VIDEO-PAGE.md](VIDEO-PAGE.md)). This file answers each of them with what the code does today,
measured rather than recalled, then a recommendation and the size of the change. It was written before anything was
built, so that the owner could decide what to order and so that whoever implements it does not have to re-derive the
diagnosis. **What has since been built is recorded under the remark it answers, in a "Done" section with the date;** a
remark without one has not been touched. The previous round of this kind is [REVIEW-FIXES.md](REVIEW-FIXES.md), which records answers to remarks that
were already acted on.

The remarks were written in Russian; they are restated here in English, as every file in this repository is. The
restatement is a translation, not an interpretation: where a remark can be read two ways, both readings are named under
it.

Summary of the six:

- Remark 1 is already done. Nothing to build; the answer is an explanation.
- Remarks 2 and 3 are one defect with one fix. They are the only real work in the list.
- Remarks 4 and 5 touch the same two lines of one component and are an afternoon between them.
- Remark 6 is a real defect on a phone, measured below, and is fixed in one stylesheet.

## 1. "Will the video list be paginated too?"

### What the code does

It already is, and by year, exactly as the post lists are. The route is `src/pages/video/[...video].astro`; it calls
`paginateByYear()` from `src/lib/lists.ts` over Cards built by `videoCard()`, which is the same function every post list
goes through. The build proves it: `dist/` holds `/video/`, `/video/2024/`, `/video/2025/` and `/video/2026/`, and
`npm run check:pages` walks the video lists as well as the post lists since 2026-09-22.

What the reviewer did not see is a numbered page, and there is a reason for that rather than a bug. The page size is
five (`pagination.pageSize` in `src/config.ts`) and no year holds more than four videos:

- 2024: three entries (2024-02-14, 2024-04-01, 2024-04-11)
- 2025: four entries (2025-03-20, 2025-05-13, 2025-06-10, 2025-06-11)
- 2026: three entries (2026-07-15, 2026-08-17, 2026-09-19)

The sixth video in any one year creates `/video/<year>/page/2/` on the next build, with Previous, Next and the numbered
links, and with no change to any file.

### Recommendation

Nothing to do. If the reviewer wants to see it working before that sixth video exists, `npm run check:pages:stress`
builds a temporary copy with many generated entries and checks every page of it.

### Done on 2026-09-22

Nothing was changed in the code, and nothing needed to be. The owner asked instead for more than five videos in every
year, so that the pagination is there to be looked at rather than argued about: eight sample lectures were added,
`video-10.md` to `video-17.md`, three in 2024, two in 2025 and three in 2026. Every year now holds six, and
`/video/2024/page/2/`, `/video/2025/page/2/` and `/video/2026/page/2/` are in the build with their Previous, Next and
numbered links. They are sample content in the shape of the lectures beside them, each saying so in its front matter,
and they share the placeholder `videoId` the other samples use.

## 2. "Add the `video` tag - clicking it gives a 404 today"

### What the code does

This is a real defect, and it is wider than the one tag. Term pages are built from the `posts` collection and from
nothing else: `getTerms()` in `src/lib/posts.ts` walks `getPosts()`, and both term routes
(`src/pages/tags/[slug]/[...page].astro`, `src/pages/categories/[slug]/[...page].astro`) take their paths from it.

Every video declares `tags: ["video", "биолокация", "маятник", "новичкам"]`, and a video card and a video page print
those tags as links to `/tags/<slug>/`. So there are two failures, not one:

- `/tags/video/` is built by nobody, because no post carries that tag. The link is a 404, which is what the reviewer
  hit.
- `/tags/биолокация/` does exist, because posts use it, but it lists posts only. A visitor who clicks a tag on a video
  lands on a page where not one video appears. That is the quieter half of the same defect and it is worse, because it
  looks like it worked.

### Options

- **A. Term pages span both collections.** `/tags/биолокация/` lists posts and videos together, newest first, and
  `/tags/video/` comes into existence on its own. This is what a tag means to a visitor: a topic, not a storage
  location.
- **B. Stop printing tags on videos.** The 404 disappears because the link disappears. Cheapest, and it throws away a
  navigation path the reviewer is explicitly asking for.
- **C. A separate namespace for video terms**, `/video/tags/<slug>/`. No collision with the post tags, but two tag
  indexes to keep, two sets of chips that look identical and lead to different places, and a visitor who has to know
  which kind of entry they are looking for before they click.

### Recommendation

**A.** B answers the letter of the remark and not its point, and C doubles the navigation surface for a site with 23
posts and 10 videos.

The owner's rule of 2026-09-22 stands and A does not break it: posts and videos share code only on plain data
([VIDEO-PAGE.md](VIDEO-PAGE.md) section 4). So the term collection moves into `src/lib/lists.ts` and works on flat
entries, not on `Post | Video`:

- `lists.ts` gains a term builder over a flat shape (a term name plus the `Card` it belongs to plus its date).
- `posts.ts` and `video.ts` each map their own collection into that shape, the way `postCard()` and `videoCard()`
  already do. Neither file learns about the other.
- The two term routes ask for both and merge, so `getTerms()` keeps its sort (alphabetical by the front-matter name)
  and the entries inside a term keep the site order (newest first, which `published()` in `lists.ts` already
  guarantees).
- No shared component changes: `CardList.astro` renders `Card[]` and cannot tell what produced them.

Also worth deciding while this is open, because it is a content question rather than a code one: the tag `video`
duplicates the section every one of those entries already lives in. It is on all ten videos, so `/tags/video/` will be
the largest tag on the site and will say nothing `/video/` does not. Keeping it is defensible (the reviewer asked for
it); dropping it from the front matter is one edit per file and one less tag that means nothing.

### Done on 2026-09-22

Option A. `collectTerms()` in `src/lib/lists.ts` groups flat `{ names, card }` data, `postTerms()` and `videoTerms()`
map their own collection into it, and `src/lib/terms.ts` - the one file in `lib/` that imports both - concatenates
them. The four term routes call it and nothing else. `/tags/video/` holds the lectures over four pages,
`/tags/биолокация/` mixes articles and lectures, and `npm run check:pages` walks 74 list pages without a complaint
after `scripts/check-pagination.mjs` was taught the same merge. The tag `video` was left in the front matter, as the
reviewer asked; the count beside a tag still reads "articles", which is the theme's own string and a wording question
for the owner.

### Size

Medium, and the only item in this list that touches shared code. `getTerms()` keeps its signature for its current
callers, so `src/pages/categories/index.astro` and `src/pages/tags/index.astro` change only in the counts they print.
The tag index, the category index, every term page and their pagination need re-checking afterwards
(`npm run check:pages`).

## 3. "Maybe give the Categories page a separate category for teaching videos"

### What the code does

Half of it is already written and unreachable, which is the same root cause as remark 2. Every video declares
`categories: ["education video"]` in its front matter, and `/categories/` lists `blog` and `education` only, both of
them from posts. `/categories/education-video/` is not built, so the category the reviewer is asking for exists in the
content and nowhere else.

### Recommendation

Fix remark 2 and this one resolves with it, at no extra cost: the same term builder produces the category pages. Two
decisions are left over, and both are content, not code:

- **The name.** `education video` becomes the address `/categories/education-video/` and the label "Education Video"
  (`titleize()` in `src/lib/urlize.ts`). If the label should read differently, the front matter is where it is
  changed, in all ten files.
- **Whether it should be its own category at all** or a sub-case of `education`, which the posts already use. One
  category that mixes articles and lectures on the same subject is the smaller navigation; two separate ones make the
  lectures findable on their own. The reviewer asked for the second, and with `/video/` in the menu it is arguably
  redundant, which is worth saying out loud before it is built.

### Done on 2026-09-22

The category is built by the same term code, and the owner chose its name: the front matter of every lecture says
`обучающие видео`, so the Categories page prints "обучающие Видео" beside Blog and Education and the address is
`/categories/обучающие-видео/`. A row in that accordion used to build its address as `/posts/` plus the slug, which
would have sent every lecture to a post address that does not exist; it uses the card's own `url` now, so a lecture
opens `/video/<slug>/` - the jump from a category to the video the owner asked for.

### Size

Nothing on top of remark 2 beyond the content decision.

## 4. "The header navigation needs its own width now that Video was added"

### What the reviewer sees

Six menu items instead of five (`src/config.ts`: Home, Categories, Posts, Video, Tags, About), all inside the same
`max-w-4xl` (896px) the site has always used, so the title and the menu crowd towards the middle.

The second half of the remark is the important one: widening the site's container would widen every page with it. The
reviewer asks for a class that applies to the header alone.

### What the code does

That separation already exists, and it was not built for this: `Header.astro` owns its own wrapper since 2026-09-09,
because the drop-down panel had to be a sibling of an element carrying `overflow-x-auto` (the comment at the top of the
file explains it). So the header, the main column and the footer are three independent elements today:

- `src/components/Header.astro:37` - the header bar, `mx-auto w-full max-w-4xl overflow-x-auto px-6`
- `src/components/Header.astro:127` - the mobile panel under it, the same width
- `src/layouts/Base.astro:99` - `main`
- `src/layouts/Base.astro:106` - the footer wrapper

### Recommendation

Change the width on the two lines in `Header.astro` and nothing else. `max-w-5xl` (1024px) is the next step up and buys
128px, which is roughly the room one more menu item took. No new class has to be invented: Tailwind's scale is the
class, and a bespoke one would hide the value from anyone reading the markup.

Two things to have in mind before ordering it:

- It is a deliberate departure from the Hugo layout, so it is the owner's decision, not a side effect. Hugo has one
  width for everything.
- Above 1024px the header will no longer line up with the article card below it. Check at 1024, 1280 and 1440, and at
  640 and below, where the menu is a hamburger and the width does not matter.

### Size

Two class changes and a comment saying why the header is wider than the page. An hour with the screenshots.

### Done on 2026-09-22

The owner allowed the departure. `Header.astro` wraps the bar and the drop-down panel in `max-w-5xl`; `main` and the
footer are untouched. Checked in a headless browser at 1280 and at 545, and the six menu items no longer crowd. README,
"The header is wider than the page, and the logo shows at every width".

## 5. "Put a small logo, about favicon size, to the left of the site name in the header"

### What the code does

It is already there and is deliberately hidden on desktop. `Header.astro` renders `site.avatar`
(`/images/avatar.png`, the About page's portrait) as a 32px round image before the wordmark, with `sm:hidden` on it: it
appears below 640px, where the menu collapses into a hamburger and the wordmark alone has to carry the bar, and it
disappears from 640px up so that the desktop header stays byte-identical to Hugo's.

So the remark is not asking for new markup. It is asking to drop that parity constraint and show the logo at every
width.

### Recommendation

Remove `sm:hidden` and size it for the bar the reviewer describes: `h-8 w-8` below 640px as now, `h-6 w-6` (24px, about
a favicon) from 640px up, so the header bar does not grow taller. Keep `alt=""` - the link's own text already says the
site name, and announcing it twice is worse than not announcing the image.

It belongs in the same change as remark 4: both are in the same component, both are departures from the Hugo header,
and both want the same screenshots.

The one thing to look at is the file itself: `/images/avatar.png` is a portrait, and a portrait at 24px reads as a grey
dot. If a mark was drawn for the club, this is the place for it, and it should be an SVG or a PNG at twice the display
size.

### Size

One class and one comment, plus whatever the picture needs.

### Done on 2026-09-22

`sm:hidden` is gone and the image is sized per breakpoint, `h-8 w-8` below 640px and `h-6 w-6` above it. The picture is
still the About page's portrait, and at 24px it reads as a dot - the owner has the file to replace when a mark exists.

## 6. "On a phone the carousel shows only part of each photo - the waterfall is off the screen"

### What the code does

This one is arithmetic, and the reviewer is right. The photos in `public/images/carousel/` are all 1600x700, an aspect
ratio of 2.29:1 - a panorama. `src/styles/carousel.css` gives the carousel
`height: calc(clamp(220px, 40vh, 560px) + 6rem)` and the slides `object-fit: cover`.

On a 390x844 phone that is a 390x434 frame for a 2.29:1 picture. `cover` scales the photo until it fills the frame in
both directions, which means scaling it to 434px tall and therefore 994px wide, of which 390px are visible: **39% of
the photo, taken from the middle**. Whatever the photo was composed around - the waterfall - is outside the frame
unless it happens to sit dead centre. On a desktop at 1280x900 the same formula gives a 1280x456 frame for a
1043x456 image, so nothing is lost and the fault never shows.

### Options

- **A. Let the frame follow the photo below 640px.** Set the height from the viewport width (`100vw / 2.29`, which is
  `aspect-ratio: 1600 / 700` in practice) and drop the `-6rem` overlap at that width, so the carousel starts under the
  header instead of running beneath it. The whole photo is visible, nothing is cropped, and it is a change to one
  stylesheet with no new assets.
- **B. Keep the overlap, shrink the crop.** `height: calc(100vw / 2.29 + 6rem)`. About 64% of the photo is visible
  instead of 39%. Less disruptive, still cropped.
- **C. Aim the crop.** `object-position` per slide, so each photo keeps its subject in frame. Cheap, and it is
  per-photo tuning that has to be redone every time a photo is replaced.
- **D. Separate phone crops.** A second set of images cut to a taller ratio, chosen with `<picture>` or a media query.
  Best result, most work, and `public/` is copied verbatim so the crops are made by hand.

### Recommendation

**A**, with **C** kept in reserve for one photo that still reads badly. A is the only option that shows the picture as
it was composed, and the overlap it gives up is a desktop effect that a phone header does not need.

Watch the specificity while doing it: `main.overflow-x-auto` in this stylesheet is spelled that way because a bare
`main` selector (0,0,1) loses to Tailwind's `.overflow-x-auto` (0,1,0) and quietly made `main` a scroll container. The
note is at the top of the file.

One thing the remark could also mean, and does not need fixing: the weight of the photos. They are 81 to 294KB, and
every slide but the first already carries `loading="lazy"` (`Carousel.astro`), so a phone downloads one photo on load,
not six.

### Size

One stylesheet, one media query, and the phone screenshots at 390px and 360px that the project already takes.

### Done on 2026-09-22

Option A, as recommended, plus one thing the recommendation had not foreseen. `aspect-ratio: 1600 / 700` below 640px
shows the whole photo. Dropping the overlap with `margin-top: 0` then left a 40px band of page background between the
header and the carousel, because the wrapper's `pt-24` is 96px and the header at that width is 56px; the owner saw it
immediately. The rule is `margin-top: calc(3.5rem - 6rem)` now, the difference between the two measured numbers, so the
carousel meets the header exactly and still shows the picture whole. Checked in a headless browser at 545px and 390px.

## Suggested order

1. **Remarks 4 and 5 together** - one component, immediate to see, no shared code. Good first commit.
2. **Remark 6** - one stylesheet, and the defect a visitor on a phone meets first.
3. **Remarks 2 and 3 together** - the term builder across both collections. Last, because it is the one that touches
   shared code and needs the whole list of term pages re-checked afterwards.

Remark 1 needs no commit; it is answered above.

## What needs the owner's decision before any of it starts

- Whether the header may be wider than the page, which is a visible departure from the Hugo layout (remark 4).
- Whether the logo shows at every width, same question (remark 5).
- Whether the tag `video` stays in the front matter once the tag pages work, given that it duplicates the section
  (remark 2).
- Whether `education video` is its own category or folds into the `education` the posts use, and what its label should
  read (remark 3).
