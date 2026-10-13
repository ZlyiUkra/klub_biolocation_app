# Content guide

> **Superseded for writing posts and videos on 2026-10-13 (T131, T158; see REWRITE.md).** Since 2026-10-12 an
> editor (status maitre or admin) writes a post at `/admin/posts/` and a video at `/admin/videos/`; the club's own
> backend saves it into the database (T100), and it is on the site at once for a signed-in viewer and within seconds
> for a visitor. The steps below - a file in `src/content/`, a commit to `main`, GitHub's "Create new file" - are
> the old arrangement; those files are now only the input of the one-off content import, `npm run import:content`.
> The guide for the video page is [VIDEOS.md](VIDEOS.md). The sections on fields, dates, headings and images were
> written for the git path; where the panel's rules differ, `server/src/content/` decides (its cases are in
> `server/test/content-rules.test.ts`).

How to add and change posts on the site. Written on 2026-09-19. It keeps the headings of the Hugo site's
`CONTENT.md`, so that things are found in the same places. Images are covered as far as a post needs them; the
sections of that guide on the About page, the home page and the menu are not written for this site yet, and belong to
the documentation step of [MIGRATION-PLAN.md](MIGRATION-PLAN.md).

Every step below was tried on a copy of the site on 2026-09-19: a post made from `templates/post.md`, kept as a draft,
published, dated later in the day, given an image, and left without a title.

Updated on 2026-10-02 at the owner's request, to match the site as it is now: paid lectures (YouTube and Yandex Disk)
and their materials for members, the build refusing a public lecture without `videoId`, formulas typeset since
2026-09-22, the lectures' real category name, and the branches the work goes through before `main`.

Run the commands from the repository root. Preview with `npm run dev` at <http://localhost:4321/>; the page reloads
on save. Before committing run `npm run fix` and `npm run check` (see [README.md](README.md)).

## Where things live

- Posts: `src/content/posts/<name>.md`, one file per post. The file name is the address: `/posts/<name>/`.
- Templates for new posts: `templates/`; see "Create a post" below.
- Images for posts: `public/images/`, shown at `/images/...`; see "Images in a post" below.
- Videos: `src/content/video/<name>.md`, one file per lecture. The file name is the address: `/video/<name>/`.
- Paid lectures: the same folder, with `access: paid`. The id of the YouTube video, or the link of the Yandex Disk
  file, is never written in the repository: it goes into the access service's list `VIDEOS` (a Cloudflare secret;
  locally `workers/video-access/videos.local.json`, which git ignores). See "A paid lecture" below.
- Pictures for the members' part of a paid lecture: `public/images/video/<name>/`.
- The Posts list, the Video list, the tag pages and the category pages: generated from the entries. Nothing to
  create by hand.
- The search: nothing to create or update by hand. Since 2026-10-10 (T163) it runs on the server over what is stored (`/api/search`, through the site's `/search/query.json`); the old `/search/data.json` file is gone. See "Search".
- The number of posts on one page of a list: `pagination.pageSize` in `src/config.ts`, 5 today.
- The fields a post may have, and which are required: the schema in `src/content/config.ts`.
  Since 2026-10-02 the fields of a post are in `src/content/post-fields.ts`, which `config.ts` uses (ADMIN.md says why).
- Added 2026-10-02: a metr or an admin can also add, edit and delete posts without git, in the admin panel at
  `/admin/posts/`; a save there writes the same kind of file in `src/content/posts/` and commits it. Everything below
  still holds for a post written by hand. [ADMIN.md](ADMIN.md) is the guide to the panel and to the members' statuses.
  Added later the same day: while the site is on GitHub Pages the panel runs only on the owner's computer, and a post
  saved there reaches the site through git; [ADMIN-GITHUB-PAGES.md](ADMIN-GITHUB-PAGES.md) has the steps.

## Posts

### Create a post

Pick the template closest to the post:

- `templates/post.md` - the general one. Its comments hold the full rules for every field and for headings.
- `templates/article.md` - a note in the `blog` category, showing the formatting a post can use.
- `templates/radiesthesia-and-energy-fields.md` - a long article in the `education` category, with sections,
  subsections and a glossary.
- `templates/draft.md` - a draft with only the fields a post needs.

On the GitHub website:

1. Open the template in `templates/` and copy its contents with the "Copy raw file" button above the file.
2. Open the folder `src/content/posts/` and choose "Add file" -> "Create new file".
3. Type the file name, for example `pendulum-exercises.md`: lower-case Latin letters, digits and hyphens. It becomes
   the address of the post, `/posts/pendulum-exercises/`. Do not name a post after a year, like `2025.md`:
   `/posts/2025/` is where the posts of 2025 are listed.
4. Paste the template, and fill in `title`, `date` and the text. Keep `draft: true` while the post is being written.
5. Choose "Commit changes" and commit to the `main` branch. Every commit to `main` rebuilds and publishes the site; a
   draft stays off it. (Added 2026-10-02: work committed to another branch, as the code changes are, reaches the site
   only when that branch is merged into `main`.)
6. To publish: edit the file, set `draft` to `false` and `date` to the moment of publication, and commit again. See
   "The date and time" below: a time later than the build keeps the post hidden.

The build runs in the repository's "Actions" tab. If it fails, the site stays as it was, and the log names the file
and the field. A post without a title, for example, stops the build with
`posts → <name>.md frontmatter does not match collection schema. title: Required`.

On your own computer:

1. Copy the template into `src/content/posts/` under the new name, and fill it in.
2. Run `npm run dev` and open `http://localhost:4321/posts/<name>/`. Drafts and posts dated in the future are shown
   here, so the post can be read before it is published.
3. When it is ready, set `draft` to `false` and `date` to the moment of publication.
4. Run `npm run fix`, `npm run check`, `npm run build` and `npm run check:pages`. The last one checks every list the
   post appears in; see [PAGINATION.md](PAGINATION.md), section 10.
5. Commit, and push to `main`.

### The date and time

- Write the date the way the templates do: `"2026-09-19T10:00:00+03:00"`, the time included. Keep `+03:00` at the
  end: the site shows every date in that time zone.
- The post is published by the first build after that moment, not before. A date later in the day counts as the
  future: with `10:00` in the date, a post committed at 09:00 stays hidden until the next build after 10:00. To publish
  at once, use a time that has already passed, the current time or an earlier hour of the same day.
- The date also puts the post in its year on the Posts list, and in its place in every list; see "The posts list
  page".

### Front matter reference

The block between the two `---` lines at the top of a post. Lines starting with `#` in it are comments and are never
published.

- `title` - required. The heading of the post, its text in every list, and the browser tab.
- `date` - required. Publication date and time with the time zone, e.g. `"2026-09-19T10:00:00+03:00"`. Every list is
  ordered by it; see "The posts list page". A post dated in the future stays off the published site until that date.
- `draft` - `true` shows the post only in `npm run dev`. Defaults to `false`.
- `description` - one sentence about the post. The page description for search engines and link previews, and the
  text the Share button on the post uses. Not shown in the lists.
- `tags` - a list, e.g. `["pendulum", "practice"]`. Written in lower case on the site. Each tag gets a page at
  `/tags/<tag>/`, and the tags are shown on the post's card in the lists.
- `categories` - a list, usually one entry, e.g. `["education"]`. The first category is shown above the post's title,
  and each gets a page at `/categories/<category>/`. The site has two today, `blog` for notes and `education` for
  articles; any other name starts a new category.
- `lastmod` - when the post was last changed, shown as "Last updated on". It does not change the order of the lists.
- `share_title`, `share_description` - the title and the text the Share button on the post uses, if they should
  differ from `title` and `description`.
- `summary` - the text the Share button uses when `share_description` and `description` are both empty; without all
  three, it uses the site title. The lists never use it.

The Hugo guide also lists `slug`, `aliases` and `cover`. This site does not support them yet, and they are ignored.

### Edit, rename, delete

- Edit: change the file. `npm run dev` reloads the page.
- Rename: the file name is the address, so the old address stops working; there are no redirects yet. Update the
  links other posts have to it.
- Delete: delete the file. A tag or a category no longer used by any post loses its page with the next build.

### The posts list page

Every list is split by year: the Posts list, each tag page and each category page. The buttons under the title choose
a year: `/posts/2025/` lists only the posts of 2025, five to a page, and Previous, Next and the page numbers at the
foot move between the pages of that year only; `/tags/<tag>/2025/` does the same for one tag. `/posts/` and
`/tags/<tag>/` themselves show the newest year. A post appears in the year of its `date`. Details are in
[PAGINATION.md](PAGINATION.md).

The order:

1. Newest first, by `date`, including the time.
2. The same date and time: by title, alphabetically.
3. The same title too: by file name.

`lastmod` does not move a post. A draft is counted in `npm run dev` but not on the published site, so the pages can
differ between the two.

A post with a `date` in the future is not published until that date, as on the Hugo site. It then appears with the
first build after its date - and a build runs when something is committed to `main`, so on a quiet day the post waits
for the next commit. `npm run dev` shows it at once, like a draft, so it can be read before its day.

A post's card in a list shows the title, the date, the first 140 or so characters of the text, the tags and a "Read
more" link. The opening paragraph is therefore what readers see in the list.

The page title "Posts" is written in `src/pages/posts/[...page].astro`.

### Writing

- Plain Markdown: paragraphs, `**bold**`, `_italic_`, lists, links `[text](https://...)`, quotes with `>`.
- Headings `##` and `###` build the table of contents. From a 1472px wide window up it stands to the right of the
  article and stays in view while scrolling; below that it is a collapsible list at the top of the article.
  Subsections are listed under their section, and a click on an entry scrolls to the heading and highlights it.
- Do not use a single `#` in the text: the title is already the top heading of the page. Do not add ids to headings;
  they are made from the text, Cyrillic included. A `####` is listed at the same level as a `###`.
- Code blocks with a language name, such as three backticks followed by `md`, are highlighted.
- Tables in GitHub style are supported.
- Link to another post by its address with the trailing slash: `[text](/posts/<name>/)`.
- Images: see "Images in a post" below.
- Formulas: `$E = mc^2$` inside a line, and `$$ ... $$` on lines of their own for a formula set apart. They are
  typeset while the site is built (KaTeX, since 2026-09-22), so they arrive ready and need no script in the browser.
  (Corrected 2026-10-02: this line said formulas came out as code; that was true until 2026-09-22.)
- Not rendered in a post yet: the callout boxes of the Hugo theme, which come out as raw text. They are waiting on
  `MIGRATION-PLAN.md` §6.

## Videos

A video lecture is a file in `src/content/video/`, and everything about it works like a post: same front matter, same
dates, same drafts, same tags and categories. What it adds is a player at the top of the page.
(Corrected 2026-10-02: the front matter is not quite the same. A lecture has no `lastmod`, `summary`, `share_title` or
`share_description`, and it has `videoId`, `duration` and `access` of its own; the reference below lists them.)

A lecture is public or paid:

- **Public** (the default): anyone can watch it. Its YouTube id is in the file. "Create a video" below.
- **Paid** (`access: paid`, since 2026-09-28): anyone sees the page, its description and its card, but the player
  appears only for a member the administrator has granted access. The file holds no address of the video. "A paid
  lecture" below.

### Create a video

1. Copy `templates/video.md` to `src/content/video/<name>.md`. The file name becomes the address, so
   `my-lecture.md` is `/video/my-lecture/`: lower-case Latin letters, digits and hyphens, never a bare year.
2. Fill in `title`, `date` and `videoId`.
3. Set `draft: false` when it is ready.

`videoId` is the YouTube id and not the whole address - the part after `watch?v=`. In
`https://www.youtube.com/watch?v=dQw4w9WgXcQ` the id is `dQw4w9WgXcQ`. The schema does not require it, so a file
without one still builds, and the page then carries an empty player: it is the field to check first when a lecture
looks broken.

Corrected 2026-10-02: since 2026-09-28 the paragraph above is no longer true. A public lecture without `videoId` stops
the build with "a public video needs its videoId", naming the file, so a lecture can no longer go out with an empty
player.

### Front matter reference

- `title` - required.
- `date` - required, with `+03:00` at the end. A date in the future keeps the lecture off the published site until
  then; `npm run dev` shows it anyway.
- `videoId` - the YouTube id. Treat it as required. (Since 2026-09-28 the build requires it of a public lecture, and
  refuses it, with `videoUrl` and `thumbnail`, on a paid one.)
- `access` - `public` (the default, so it can be left out) or `paid`. Added 2026-09-28; see "A paid lecture".
- `description` - one sentence. It is what the card, the feed and the search result show; without it the first words
  of the text are used.
- `duration` - free text printed on the card, usually `"12:34"`.
- `tags`, `categories` - lists, lower-cased for tags by the build. See "Categories and tags".
- `draft` - `true` keeps it out of the published site.
- `videoUrl`, `thumbnail`, `heroImage`, `videoPlatform` - accepted by the schema and unused by the page today. Only
  YouTube is rendered.

The text under the `---` is optional. It appears below the player, and it is what the search matches on, so a few
sentences are worth writing even for a lecture that speaks for itself.

### Where a new video appears by itself

Nothing has to be registered anywhere. Once the file is in `src/content/video/` and the site is rebuilt, it is on:

- `/video/`, and the year page for its date, `/video/2026/`;
- a numbered page of that year if the year holds more than five lectures (`/video/2026/page/2/`);
- `/tags/<tag>/` and `/categories/<category>/` for every term it declares, beside the articles that share them;
- `/video/rss.xml`, if it is among the newest twenty;
- `/sitemap-0.xml` and the site's search.

The lists are newest first. Renaming the file changes the address, and the old one becomes a 404, so rename only
what nobody has linked to yet.

A paid lecture appears in all the same places. What its card, the feed and the search carry is only the public part:
the title, the description and the text above the members' block. The members' block is written on the lecture's
own page alone.

### A paid lecture

Added 2026-10-02. The full procedure, with the reasons and what to do when something does not work, is in
[PAID-VIDEO.md](PAID-VIDEO.md): section 4 for a lecture on YouTube, section 10.2 for one on Yandex Disk. In short:

1. **Put the video where it will be played from.**
   - YouTube: upload it as "Unlisted", never "Public", with embedding allowed, and copy its id.
   - Yandex Disk: upload the MP4, share it as "Доступ по ссылке", and copy the file's link,
     `https://disk.yandex.ru/i/<key>`. The link of one file (`/i/`), never of a folder (`/d/`).
2. **Give the id or the link to the access service**, under the lecture's name (the file name without `.md`), in the
   list `VIDEOS`:
   - YouTube: `"lecture-dowsing-2": "<id>"`;
   - Yandex Disk: `"lecture-part-3": {"yandexDisk": "https://disk.yandex.ru/i/<key>"}`.

   On the live site `VIDEOS` is a secret of the Cloudflare Worker, and the whole list is pasted again each time
   (PAID-VIDEO.md step 4; its master copy is kept outside the repository). On your own computer it is
   `workers/video-access/videos.local.json`, which git ignores.

3. **Create the entry** `src/content/video/<name>.md` like a public one, with two differences:
   - add `access: paid`;
   - write no `videoId`, `videoUrl` or `thumbnail`, and no link to the video anywhere in the text: everything in the
     file is public - the page, the feed, the search index and the repository. The build stops on any of those
     fields and on a YouTube or Yandex Disk address in the text, the members' block included (`src/lib/video.ts`;
     Yandex Disk since 2026-10-02). Any other link to the video is not recognised, so check by eye.

   `src/content/video/lecture-part-3.md` is a complete example.

4. **Materials for members (optional).** In the text, after what everybody may read, wrap the members' part in
   `<div data-members-only>` and `</div>`, each on a line of its own with a blank line after the opening one and
   before the closing one. It stays hidden until the member's player appears. Only a paid lecture may have it, and the
   build says so otherwise. Pictures for it go into `public/images/video/<name>/`.
5. **Check it** with `npm run dev:site` (changed 2026-10-13, T155: `npm run dev:all`, the site and the access service together, is gone): as a guest the page shows the
   sign-in box, as the demo member the player (PAID-VIDEO.md section 3).
6. **Publish** as any change: commit, and the lecture is on the site once the change reaches `main`.

Who may watch is not set in the lecture: one membership opens every paid lecture. The administrator grants it to a
person in the Clerk Dashboard (`CLERK-DASHBOARD.md`, the runbook for granting access).

## Images in a post

1. Name the image after the post, before uploading it: `pendulum-exercises-1.jpg`, `pendulum-exercises-2.jpg`, in
   lower-case Latin letters, digits and hyphens. The name is part of its address.
2. Put it into `public/images/`. On the GitHub website: open that folder, choose "Add file" -> "Upload files", drop
   the file in, and commit to `main`.
3. In the text of the post, on a line of its own:

   ```md
   ![What the image shows](/images/pendulum-exercises-1.jpg)
   ```

   The text in square brackets is read out to readers who cannot see the image and shown when it fails to load, so
   describe the picture there.

Everything in `public/` is published exactly as it is, without resizing or conversion. Use JPEG for photographs and
PNG for drawings, and keep a file under about 500 KB; a photo straight from a phone is usually several times that, so
scale it down first. On the page the image is centred, never wider than the text, with rounded corners and a shadow.
The address is case-sensitive on the server: `Photo.jpg` and `photo.jpg` are two different files.

The folder `public/images/carousel/` is the home page carousel, and every photo in it appears there; do not put post
images into it.

## Categories and tags

Both are set in the front matter of the posts, and nothing else is needed: the build generates `/categories/`,
`/categories/<name>/`, `/tags/` and `/tags/<name>/`. A tag with a space gets a hyphen in its address, so the tag
`water search` lives at `/tags/water-search/`. A tag used only by drafts gets no page on the published site.

Since 2026-09-22 the videos count too, and a term page lists both kinds of entry together, newest first: a lecture
tagged `биолокация` appears on `/tags/биолокация/` beside the articles, and a click on it from the Categories page
opens the lecture rather than a post. So a category or a tag exists from the moment **any** entry names it, and stops
existing when the last entry drops it - there is no list of them to maintain.

Two things decide how a new term looks:

- **The address** comes from the name, lower-cased, with spaces turned into hyphens. A Russian name keeps its
  letters: `обучающее видео` is `/categories/обучающее-видео/`, written out in full in the address bar and
  percent-encoded when copied.
- **The label** on the page is the name with each word capitalised, which is what the Hugo theme did: `обучающее
видео` prints as "Обучающее Видео". Write the name in the front matter the way it should read, in lower case.

Noted 2026-10-02: `обучающее видео` above is only an example of the rule. The category the lectures really use is
`обучающие видео`, at `/categories/обучающие-видео/` (renamed on 2026-09-22); a new lecture should name that one, or
it starts a category of its own.

A term is a subject, not a place: prefer an existing one to a near-synonym, because two tags that mean the same thing
split the entries between two pages.

### The tag cloud on the home page

Under the carousel on the home page stands a cloud of tags. There is no list of words to keep: the cloud is built
from the tags of the published entries, every time the site is built.

**A new tag needs nothing done to it.** Write it in the front matter of a post or a lecture, publish, and the next
build puts it in the cloud, on `/tags/`, in the filters on `/search/` and on a page of its own. There is no register
to add it to and no file to edit; a tag that no entry carries any more disappears from all four by the same rule.

- **A new tag appears by itself**, as soon as one published entry carries it, and the word links to the tag's own page.
- **The size says how much there is.** The more entries a tag carries, the larger the word; resting the pointer on it
  shows the count itself. All the words are one colour on purpose, so that the size is the only thing saying which tag
  the site is really about.
- **Three tags are not shown**: `hugo`, `void` and `draft`, which are leftovers from the test posts of the port. The
  list lives in `src/config.ts` under `tagCloud.hidden`. A tag named there keeps its page, its place on `/tags/` and its
  filter in the search, and drops out of the cloud alone. `video` is not in that list deliberately, so the lectures are
  reachable from the home page by their tag.
- **It turns.** The cloud is a globe: it drifts by itself and follows the pointer, faster the
  further the pointer is from the middle. A visitor whose system asks for less motion sees the
  same words standing still in a row, and so does one with JavaScript turned off.
- **The cloud is the narrow-screen half.** Below 640px the cloud is what the home page shows under the title; from
  640px up it gives way to the row of round menu links, and the two are never on screen together.

### Renaming a tag or a category

There are two different things people mean by renaming, and they have different costs, so pick deliberately.

**1. Change only the word people read** - the address stays as it is, and nothing can break. Add a line to
`termLabels` in `src/config.ts`:

```js
termLabels: { "маятник": "Маятник и рамки", "video": "Лекции" },
```

The key is the tag as the front matter writes it, in lower case. The value is printed exactly as you type it, so it
decides its own capitals. It changes the word in the cloud, on `/tags/` and `/categories/`, in the heading of the
tag's own page and in the filter list on `/search/`. It changes nothing else: the address stays
`/tags/маятник/`, every link and bookmark keeps working, the filters keep finding the same entries, and the front
matter of the entries is not touched. Remove the line and the old word is back.

**2. Change the tag itself** - the address changes with it, which is why this one has a cost. Edit the front matter
of every entry that carries the tag, everywhere it appears. After the next build the old address `/tags/<old name>/`
no longer exists, so any link to it from outside the site, and any bookmark, is a 404; inside the site nothing
breaks, because every link to a tag is generated. Do this when the old name was wrong, not when it merely reads
badly - for reading, the first way is free.

A few things to know either way:

- **One entry, one spelling.** `Маятник` and `маятник` are the same tag (the build lower-cases tags), but `маятники`
  is a second tag with a page and a filter of its own. Two spellings split the entries between two tags, and the
  cloud shows both.
- **Categories keep their capitals** as the front matter writes them, tags do not. Write a `termLabels` key in lower
  case in both cases; the lookup does the same to whatever it is given.
- **The same word everywhere.** Since 2026-09-22 the small tag chips under a card in a list follow the map too, so
  there is no longer a corner of the site that calls a tag something else. That also means every chip is now
  capitalised - "Биолокация" where it used to read "биолокация" - which is the one visible consequence of the
  change and was the owner's decision.

## Search

The site has its own search at `/search/`, reached by the magnifier in the header. There is nothing to do by hand for
a new post or lecture: the search reads what is stored, so the entry is found at once (until 2026-10-10 every build wrote `/search/data.json` and the page searched that
file in the visitor's browser.

What it searches, in order of weight: the title, the tags, the description or summary, and the whole text of the
entry. A word found in the title counts for more than the same word in the text, and the text counts once however
often the word appears, so a long article cannot outrank a page that is really about the subject.

**The search starts at the third character.** One or two letters match almost everything on the site, so until there
are three the page says so and leaves the list alone. The filters on the left work at any time, with or without
anything typed.

**A result may be found by its tag.** The search looks in the tags as well as in the title and the text, so a lecture
whose text says nothing about pendulums still answers a search for one when it is tagged `маятник`. When that is why
an entry is in the list, the card says "Found in tags:" and names them, so a result is never there for a reason you
cannot see.

**The whole card is a link.** Clicking anywhere on a result opens the entry; the tags printed on it are text, not
links.

### What to add so it appears in the filters

Nothing is registered anywhere, and there is no list of filters to edit. The three lists are built from the entries
themselves every time the site is built. In practice:

| What you add                      | What you write                                        | What appears in the search                                      |
| --------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------- |
| A post                            | a file in `src/content/posts/`                        | a result, and +1 on every filter it carries; Section "Posts" +1 |
| A lecture                         | a file in `src/content/video/`                        | a result, and +1 on every filter it carries; Section "Video" +1 |
| A new tag                         | `tags: ["new tag"]` in any published entry            | a new checkbox under Tag, with its count                        |
| A new category                    | `categories: ["new category"]` in any published entry | a new checkbox under Category, with its count                   |
| The last use of a tag or category | remove it from the front matter                       | the checkbox disappears, with the term's page                   |

Three rules behind that table, and they are the same three that decide whether a page exists at all:

1. **Published only.** `draft: true`, or a date still in the future, keeps an entry out of the site, out of the index
   and out of the counts. A tag carried only by drafts has no checkbox, because it has no page either.
2. **Rebuilt.** The index is written when the site is built. On your own machine that is `npm run build` (or
   `npm run dev`, which rebuilds as you save); on the site it is the GitHub Actions run that follows a push to
   `main`. Until it finishes, the search shows what the previous build knew.
3. **Spelled the same.** `маятник` and `Маятник` are one term - the build lower-cases tags - but `маятники` is a
   second one and gets its own checkbox with its own count. Two spellings split the entries between two filters.

The Section list is the one that does not grow: the site has articles and lectures, so it has two boxes. A third kind
of entry is a change to the code, not to the content - README, "Search", says what it takes.

### The filters on the left

Down the left of the search page stand three lists of checkboxes - Section, Category and Tag - with a number beside
every name. Section is the coarsest: it separates the articles (Posts) from the lectures (Video), and it is the one
list that never changes, because the site has those two kinds of entry and no more.
They are built when the site is built, from the same categories and tags the `/categories/` and `/tags/` pages show,
so a new term needs nothing done to it here either:

- **A new category or tag appears as a checkbox** as soon as one published entry names it and the site is rebuilt -
  a post or a lecture, since both feed the same lists. Drop the term from the last entry that carries it, and the
  checkbox disappears with the term's page.
- **A term used only by drafts, or only by entries dated in the future, has no checkbox.** It has no page either;
  the search knows exactly what the published site knows.
- **The number beside a name** is how many of the current results carry that term, so it answers "what would this
  filter leave me". With an empty search box the numbers are how many entries carry the term on the whole site.
- **Ticking two boxes in one list** means either of them; ticking boxes in two lists means both conditions at once -
  Section "Video" with tag `маятник` is "lectures about the pendulum".
- **The broom button** in the search field empties the box and unticks every filter in one go. It appears only when
  there is something to clear.
- **The address carries all of it**: `/search/?q=маятник&section=Video` opens the page with that search already run,
  so a search can be sent to somebody.
- **The lists can be long**, so both fold, and on a phone they open folded: seventeen tags above the results would
  push the first answer off the screen.

Nothing about a term is configured on the search page: it is named in the front matter of an entry, and the page
follows. The one thing worth keeping in mind is spelling - `маятник` and `Маятник` are the same term, but `маятники`
is a second one, and it gets its own checkbox with its own count.

What it will not find:

- a draft, or an entry dated in the future - neither is in the published site, so neither is in the index;
- an entry added since the last build. The index is built with the site, so a new lecture appears in the search when
  the GitHub Actions build has finished, not when the file is committed;
- words in an image, and words in front matter fields other than the ones above;
- the members' block of a paid lecture (added 2026-10-02): it is kept out of the index on purpose, so only the public
  part of a paid lecture can be found;
- a different form of a word. `маятник` does not find `маятника`: the search matches the letters as typed, with only
  the case folded and `ё` read as `е`. Two words in one query are an AND - both have to appear.

A search can be linked to: `/search/?q=маятник` opens the page with that query already run.

If something you expect is missing, check it in this order: `draft: false`, then the date, then that the build has
run, then the spelling.

## Checklist before publishing

1. Read the post once with `npm run dev`, or in the preview of the GitHub editor.
2. `draft: false`, and `date` set to a moment that has already passed, with `+03:00` at the end.
3. The file name is lower-case Latin letters, digits and hyphens, and is not a year.
   3a. For a lecture: `videoId` is the id and not the whole YouTube address, and the player shows the right video in
   `npm run dev`.
   3b. For a paid lecture (added 2026-10-02): `access: paid`; no `videoId`, `videoUrl`, `thumbnail`, and no link to the
   video in the text; its name is in `VIDEOS` with the id or the Yandex Disk link; the demo member sees the player in
   `npm run dev:site` (changed 2026-10-13, T155: `npm run dev:all` is gone). See "A paid lecture".
4. Every image is in `public/images/`, and its address in the text matches the file name exactly, letter case
   included.
5. If you work on your own computer: `npm run fix`, `npm run check`, `npm run build`, `npm run check:pages`.
6. Commit to `main`, and check in the "Actions" tab that the build succeeded. A change made on another branch is
   published when that branch is merged into `main` (added 2026-10-02).
