# Post sidebar: the table of contents beside the article, and two fixes that made the build green

Written on 2026-09-18. It covers only the changes made in this change set:

- `src/layouts/Post.astro` - the table-of-contents sidebar: placement, nesting, the entry of the section being read,
  and the highlight of a heading reached from the table of contents;
- `src/components/TableOfContents.astro` - the collapsible table of contents hides when the sidebar is shown;
- `src/components/Disqus.astro` - one line that broke `npm run build`;
- `tsconfig.json` - a formatting problem that broke `npm run check`;
- `src/content/posts/radiesthesia-and-energy-fields.md`, `article.md` and `draft.md` - the placeholder texts replaced
  by texts with headings, so that the sidebar has something to show on a real post;
- `templates/` - a general template for new posts, with the rules for the front matter and for headings, and one
  template modelled on each of the three posts.

The same change set also added twenty-one posts, pagination of the post lists by year, and moved three route
files. Those are described in [PAGINATION.md](PAGINATION.md). How an author adds a post is in
[CONTENT.md](CONTENT.md).

The model for the sidebar is the one in the newer hugo-theme-void, as it runs on
`https://www.daucloud.com/posts/fat-loss-diet-review/`. Its stylesheet and script were read for the numbers, colours
and behaviour below; nothing was copied from that site into the repository except those values.

Everything quoted below was measured on this project: the build in `dist/`, and posts loaded in headless Edge at exact
viewport widths - a test post with five `##` and five `###` headings on a copy of the site, and the filled post
`radiesthesia-and-energy-fields` in the real build.

## 1. Summary

- The sidebar sits to the right of the article, 1.5rem from it and 14rem wide, from a 92rem (1472px) wide window up,
  and stays in view while the page scrolls. The article card keeps its width and position.
- Subsections are nested under their section, with a thin line on their left.
- The entry of the section being read is highlighted while the page scrolls.
- A click on an entry scrolls smoothly to the heading and highlights the heading, in the reference's amber style.
- Where the sidebar is shown, the collapsible table of contents at the top of the article hides, so the headings are
  never listed twice. Below 92rem it is the only table of contents, as before.
- The entries are the post's headings. They were already passed in: `src/pages/posts/[slug].astro` takes them from
  `post.render()` and hands them to `Post.astro` as the `headings` prop. The sidebar therefore appears on every post
  that has `##` or `###` headings in its text.
- `npm run build` works again, and `npm run check` passes again.

## 2. The sidebar

### 2.1 What was wrong

The sidebar was added in `d0dbbd1`. It came after `ArticleLayout` in the normal flow of the page and had no styles
of its own, so on a wide screen it rendered below both article cards, at the bottom left of the page, instead of
beside the article. Its classes had come from the newer theme, and one of them, `text-fg-faint`, does not exist in
this project's Tailwind configuration, so it did nothing.

### 2.2 Where it sits

`main` in `Base.astro` is `max-w-4xl` (896px), and the article card fills it. A column next to the card inside `main`
would have squeezed the text. So the sidebar goes into the page margin:

- `Post.astro` wraps the article in a `relative` element. The wrapper has no box of its own, so the article renders
  exactly as before.
- The sidebar is positioned absolutely at `left-full`, the card's right edge, with `ml-6` (1.5rem) of space, and is
  `w-56` (14rem) wide. Both numbers are the reference's.

It is shown from 92rem (1472px) up, the reference's breakpoint. That breakpoint is a media query in the component's
style block, not a Tailwind class: this project's Tailwind 3 does not generate the arbitrary `min-[92rem]:` variant.
Measured: a build with `min-[92rem]:block` produced no rule for it at all, so the sidebar stayed hidden at every
width. The media query is emitted, into the post pages only.

The reason is in the build output: Tailwind 3 accepts arbitrary `min-*` and `max-*` variants only in the unit of the
configured screens, which are in px here, and warns about any other unit. The comments that explain this in
`Post.astro` and `TableOfContents.astro` first spelled the class out, and since Tailwind reads comments as well, every
build printed that warning. They describe the class in words now, and the build has no warnings.

### 2.3 How it stays in view

The sidebar is as tall as the wrapper, and its content is `position: sticky` with `top-24`, 96px, the reference's
offset. The site header is `position: fixed` and ends 68px down the page, measured, so the list has to start below
it; 96px is also where the article card starts, so before scrolling the list lines up with the card.

The pinned part is capped at `calc(100vh - 7rem)` and scrolls on its own when it is taller, so a long list stays
reachable. 7rem is the 96px offset plus 16px of space at the bottom.

`sticky` works only while no ancestor clips its overflow. `main` is `overflow-visible` from the `sm` breakpoint up.

### 2.4 Nesting and style

`Post.astro` builds a two-level tree from the headings: one entry per section, with the deeper headings after it as
its children. The top level is the shallowest heading the post uses, normally `##`.

Colours, spacing, hover and the nested line come from the reference's stylesheet, light and dark, and live in the
component's style block under their own variable names (`--toc-fg`, `--toc-fg-muted` and so on), because this
project does not define the reference's variables. The title's colour comes from there too, replacing the class that
did nothing.

The colleague's markup is kept in a comment in `Post.astro`, next to the explanation. Two smaller changes in the same
lines:

- The depth classes and the `pl-4` indent are gone, because the nesting now carries the depth. The class template
  literal they were built with was a risk as well: `prettier-plugin-tailwindcss` can eat the space inside one and glue
  two classes together, as `CLAUDE.md` records.
- The note above the sidebar was an HTML comment, which is sent to every visitor. It is an Astro comment now.

### 2.5 The entry of the section being read

A script in `Post.astro` does what the reference's script does. On every scroll, throttled to one run per frame, the
current section is the last heading that has already reached its anchor position, and its entry gets the
`toc-active` class. Before any heading is reached, the first entry is the current one. If the list scrolls inside its
capped box, the active entry is kept visible in it.

"Reached" is measured against the heading's own `scroll-margin-top`, 6.5rem (104px) from `main.css`, plus 8px. That is
exactly where an anchor jump puts a heading, so the entry of a clicked heading is always the one highlighted.

### 2.6 A click on an entry

A click on an entry of either table of contents, the sidebar or the collapsible one:

- scrolls smoothly to the heading, or jumps if the reader has asked the system for reduced motion;
- highlights the heading with the `anchor-highlight` class. That class is not new: `main.css`, ported from the theme,
  already has it, with a dark variant, and describes it as the "anchor highlight for in-page navigation (TOC, hash
  links)". Its values are the reference's: an amber background and a 2px amber outline;
- keeps the clicked entry active in the sidebar while the smooth scroll passes other sections, so the list does not
  flicker;
- puts the heading's hash into the address bar, as a plain anchor link would.

The highlight and the hold on the entry end on the next key press, pointer press or touch, or on scrolling once 1.5s
have passed. The delay keeps the smooth scroll itself from ending them at once. The reference does the same.

### 2.7 The collapsible table of contents

`TableOfContents.astro` got the class `toc-inline` and a media query that hides it from 92rem up, where the sidebar
shows the same headings. Below 92rem nothing changes. The reference hides its inline table of contents at the same
width, under the same class name.

### 2.8 Measured

On the test post, at exact viewport widths:

- 1472px: the sidebar is shown and the collapsible table of contents is hidden. No horizontal scrolling. The first
  entry is active.
- Scrolled to 1400px: the active entry is "Section 3", which is the last heading at or above its anchor position.
- Click on the entry "Section 4": the page scrolls, the heading stops 104px from the top, below the header, and carries
  `anchor-highlight` with a background of `rgba(245, 158, 11, 0.18)` and an outline of `rgba(245, 158, 11, 0.5)`, 2px,
  the dark-theme values. The entry "Section 4" is active, and the address ends in `#section-4`.
- A pointer press after that: the highlight is gone, and the entry stays active.
- 1471px: the sidebar is hidden and the collapsible table of contents is shown.
- 1280px, a click in the collapsible table of contents after opening it: the same result as from the sidebar, the
  heading at 104px and highlighted.
- No console errors at any width.

On the filled post `radiesthesia-and-energy-fields`, in the real build, the same checks give the same results. Its
headings are in Cyrillic, and so are their ids, so this also covers anchors in Cyrillic:

- the sidebar lists 16 entries, 6 sections and 10 subsections, in 4 nested groups, and every entry's id exists in the
  article;
- scrolled to 1400px at 1472px, the active entry is the heading at that position;
- a click on the entry of the section about instruments, whose id is a Cyrillic word, highlights that `h2` at 104px
  from the top, and the address ends in the same Cyrillic id;
- no console errors.

### 2.9 Content for the sidebar

No post had a single heading, so the sidebar could not appear anywhere on the site. The post
`radiesthesia-and-energy-fields` held only a placeholder line, and it now holds an introductory article in Russian,
like the rest of the site's content: what biolocation is, where its names come from, a short history, the three usual
instruments, how a session goes, the practice's notion of energy fields, and a glossary. That makes 6 `##` sections and
10 `###` subsections. The front matter fields are unchanged. The reading time on the page went from 0 to 3 minutes.

The article describes the practice in its own terms without presenting it as established science: the section on
energy fields says plainly that these are working notions of the practice, not fields studied by physics. It is a
starting text, meant to be replaced or extended by the club's own writing.

Added 2026-09-19, at the owner's request, the same for the other two posts:

- `article.md` ("Hello!") introduces the blog: what it is for, how posts are organised by category and tag, how to
  read a long post with the table of contents, what formatted text looks like (lists, a quote, a code block, two
  tables), and the comments. 6 sections and 10 subsections. Its placeholder showed a formula and a Hugo callout, and
  neither renders in an Astro Markdown post: the formula came out as code, the callout as raw text. The new text uses
  neither. Its opening no longer calls it the first post, because most of the new posts are dated earlier.
- `draft.md` explains what a draft is, where it is visible, and how to publish it. 4 sections and 7 subsections. It is
  still a draft, so it is shown by `npm run dev` only. Its placeholder named a Hugo command-line flag.

In each of the three posts, the text that was replaced is kept as a YAML comment at the top of the front matter,
with the reason for the change; YAML comments are never published. The front matter fields themselves are unchanged.

The twenty-one posts added for pagination have headings too, 8 to 12 entries each; see [PAGINATION.md](PAGINATION.md),
section 6. The ones on research, the ideomotor effect and the grids of Hartmann and Curry say plainly what controlled
tests have and have not found; the practical ones describe the practice in its own terms, and one is about where it
has no place: health, digging, searching for missing people and large decisions.

### 2.10 Template for new posts

`templates/post.md` is a post to copy when writing a new one. It lies outside `src/content` on purpose: a file inside
the posts collection would be published as a post, and a draft is still shown by `npm run dev`.

The rules are written as comments inside its front matter, the block between the two `---` lines. YAML comments are
never published, so they can stay in a copied post. Comments in the text itself would have been HTML comments, and
those are sent to every visitor if nobody deletes them.

The rules cover where the copy goes, `src/content/posts/`, with the steps for adding it on the GitHub website ("Add
file" -> "Create new file" in that folder); the file name, which becomes the address of the post; every front matter
field the schema in `src/content/config.ts` accepts; and the headings the table of contents is built from:

- `##` for a section and `###` for a subsection, with no single `#` in the text, because the title already is the top
  heading of the page;
- no ids added by hand, since they are made from the heading text, Cyrillic included;
- what happens to two headings with the same text, and to a `####`;
- that a post without any `##` simply has no table of contents.

Checked by building a post made from the template, on a copy of the site, with one `####` and a second heading of the
same text added: the front matter passes the schema, none of the comments reaches the page, the subsection is listed
under its section, the `####` is listed at the same level as a `###`, the repeated heading gets the id
`second-section-1`, and the tags come out in lower case.

Added 2026-09-19, at the owner's request, one template modelled on each existing post, next to `post.md`:

- `templates/article.md` - a note in the `blog` category, with the formatting a post can use;
- `templates/radiesthesia-and-energy-fields.md` - a long article in the `education` category, with the section
  structure of that post and a glossary;
- `templates/draft.md` - a draft, with what `draft: true` does and how to publish it.

Each has the front matter fields and the heading structure of its post, with placeholder text, and points to
`post.md` for the full rules and to [CONTENT.md](CONTENT.md) for the steps.

Two corrections to `post.md` on the same day, found while writing `CONTENT.md`:

- `summary` was described as the text the lists show instead of the beginning of the post. The lists never read it:
  they always cut the beginning of the text. At the time nothing else read it either, because of the Share button's
  fallback, which is fixed now; see section 5. Since then the template says that `summary` is the Share button's text
  when `share_description` and `description` are both empty.
- `date` now says that it decides the order of the lists. It first said that a date in the future does not hold a
  post back; since the owner's decision later that day, it says that such a post stays hidden until its date.

## 3. The build: `return` in `Disqus.astro`

`d0dbbd1` replaced the empty branch at the start of the comments script with `return;`, which stopped `npm run build`
with:

```
Return statement is not allowed here
```

The script block is compiled as an ES module, and the top level of a module is not inside any function, so a bare
`return` there is a syntax error. `npm run check` did not report it; only the build did. While it was there, the site
could not be built, and so could not be deployed.

The branch is empty again, as it was before `d0dbbd1`, with its original note. The `return;` line stays in the file
as a comment, next to the explanation. Nothing changes at run time: the `else` branch already runs only when both
elements exist.

Measured after the fix: `npm run build` produces 16 pages. On the built post page, clicking the comments button
loads the widget, the widget frame carries `t_i=article` and `t_u=https://debi7.github.io/posts/article/`, and the
console has no errors.

## 4. `tsconfig.json`

The merge `e5bafa9` brought `tsconfig.json` back with a comma after the last entry and without the note that
explained its `include` and `exclude`. TypeScript accepts the comma, but Prettier rewrites it, so the formatting step
of `npm run check` failed on this file. The comma is gone, and the note is back. The settings are the same.

## 5. The Share button's text

Fixed on 2026-09-19 at the owner's request, in `src/layouts/ArticleLayout.astro`.

The Share button on a post got an empty text whenever the post had no `description`. The text was chosen with a
chain of `??`: `share_description`, then `description`, then `summary`, then the site title. `??` only skips a value
that is `null` or `undefined`, and the collection schema defaults `description` to an empty string, so the chain always
stopped at `description`, empty or not, and never reached `summary` or the site title.

Now each candidate is cleaned first - tags stripped, spaces collapsed - and the first one with any text left wins, the
site title being the last resort. A description made only of spaces or tags counts as empty as well. The text is still
cut to 120 characters. The old lines stay in the file as a comment, next to the explanation.

Checked on a copy of the site: a generated post without a description gets "Radiesthesia Club" as its Share text.
Every published post has a description today, so none of them changes.

## 6. State of the checks

- `npm run fix` - nothing to reformat.
- `npm run check` - 0 errors, 0 warnings, and Prettier passes.
- `npm run build` - 16 pages before the posts were added on 2026-09-19, 62 after, with no warnings.
- `npm run dev` - starts and serves the post pages.
- On the built site, the tables of contents of the posts `article` and `what-research-says` list 16 and 11 entries,
  and the draft answers 404.

## 7. How to see it

Run `npm run dev` and open `http://localhost:4321/posts/radiesthesia-and-energy-fields/` in a window at least 1472px
wide:

- the table of contents appears to the right of the article, below the header;
- scroll down: the list stays where it is, and the entry of the section you are reading is highlighted;
- click an entry: the page scrolls to that heading, which is outlined in amber until you click, press a key or scroll;
- make the window narrower than 1472px: the sidebar disappears, and the collapsible table of contents at the top of
  the article returns.

Any other post gets the sidebar the same way, as soon as its text has headings:

```md
## First section

Text.

### A subsection

Text.
```
