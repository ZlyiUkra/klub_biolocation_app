# Disqus comments on a post: how it works, and why it is built this way

> **Superseded 2026-10-13 (T131; see REWRITE.md).** Disqus is no longer on the site: the comments are the club's
> own (`src/components/Comments.astro`, T106), and `Disqus.astro` and the shortname in `src/config.ts` are gone.
> This file describes the arrangement that was and is kept as history.

Written on 2026-09-18. It describes the comments block as it stands now, the reason every part of it is shaped the
way it is, and how to run it and see it working. Everything quoted below is a measurement taken on this project:
`npm run check`, `npm run build`, the built pages in `dist/`, and the post page loaded in a browser.

## 1. What is in place

Three files:

- `src/components/Disqus.astro` - the component: the container, and the script that configures and loads the widget.
- `src/env.d.ts` - the declaration of the global that Disqus reads, and of the object it passes to the callback.
- `src/pages/posts/[slug].astro` - the post route, which supplies the two values that identify the comment thread.

The component in full:

```astro
---
import { site } from "../config";

export interface Props {
  url: string;
  identifier: string;
}

const { url, identifier } = Astro.props;
const { shortname } = site.disqus;
---

<div
  id="disqus_thread"
  class="mt-10 w-full"
  data-disqus-url={url}
  data-disqus-identifier={identifier}
  data-disqus-shortname={shortname}
>
</div>
```

Its script block, shown without the tag lines:

```js
const thread = document.getElementById("disqus_thread");
const url = thread?.dataset.disqusUrl;
const identifier = thread?.dataset.disqusIdentifier;
const shortname = thread?.dataset.disqusShortname;

if (url && identifier && shortname) {
  window.disqus_config = function (this: DisqusPageConfig) {
    this.page.url = url;
    this.page.identifier = identifier;
  };

  const embed = document.createElement("script");
  embed.src = `https://${shortname}.disqus.com/embed.js`;
  embed.setAttribute("data-timestamp", new Date().toString());
  (document.head || document.body).appendChild(embed);
}
```

And the declarations, written once for the whole project:

```ts
interface DisqusPageConfig {
  page: { url: string; identifier: string };
}

interface Window {
  disqus_config?: (this: DisqusPageConfig) => void;
}
```

## 2. How it works, step by step

### 2.1 The route supplies the two values

```js
// Until 2026-09-22; see section 10 for what replaced it and why.
const postUrl = new URL(`/posts/${post.slug}/`, Astro.site).toString();
const postIdentifier = post.slug;
```

```js
// Since 2026-09-22: the path comes from postUrl() in src/lib/posts.ts, the identifier is passed
// straight through as post.slug. The video route does the same with videoUrl().
const commentsUrl = new URL(postUrl(post), Astro.site).toString();
```

Disqus files every comment under a thread, and the thread is keyed by an identifier and a URL. Both have to be the
post's own, stable values: the identifier is the slug, the URL is the page's canonical address, built from
`Astro.site` in `astro.config.mjs` so that it is the same address whatever machine or port the page is opened from.

### 2.2 The values travel to the browser on the container

Three values are written onto the container, as `data-disqus-url`, `data-disqus-identifier` and
`data-disqus-shortname`, and the script reads them back as `dataset.disqusUrl`, `dataset.disqusIdentifier` and
`dataset.disqusShortname`. The dash-to-camelCase conversion is the DOM's own.

The first two are the props. The third is the Disqus site the threads belong to, and it is site-wide rather than
per-page, so it comes from `site.disqus.shortname` in `src/config.ts`. Before 2026-09-18 it was written into the
component, which put the one site-wide setting inside a component and would have made a second component repeat the
string.

All three reads are `string | undefined`: `getElementById` can return `null`, and an absent attribute reads as
`undefined`. That is what the `if` below is for.

### 2.3 The callback is published on `window`

`embed.js` looks for a global named `disqus_config` and calls it with its own configuration object as `this`. The
script block is compiled as a module, and a module has a scope of its own, so assigning to `window` is the only way
to hand the callback over.

The `if` does two jobs: it stops the block from doing anything on a page that has no container, and it narrows both
values from `string | undefined` to `string`, so the assignments inside need no further checks. TypeScript keeps that
narrowing inside the callback because both values are `const`.

### 2.4 `embed.js` is appended last

The widget script is created and appended only after the global exists, because `embed.js` reads it while it starts.
That order must not be rearranged.

### 2.5 What the build emits

Measured on the current build:

- The post page carries `data-disqus-url="https://debi7.github.io/posts/article/"` and
  `data-disqus-identifier="article"`.
- No Disqus JavaScript sits in the page itself: `grep -c disqus_config dist/posts/article/index.html` returns 0.
- The code lives in `dist/_astro/hoisted.nKnRmYZG.js`, 409 bytes, whose first statement imports
  `hoisted.BYbS_BGG.js` - the 2104-byte bundle every other page loads as well. The post page therefore shares the
  common script with the rest of the site and adds one small cached file, and pages without comments carry no Disqus
  code at all.
- In the bundle the types are gone and the callback is still a plain function:
  `window.disqus_config=function(){this.page.url=e,this.page.identifier=i}`.

## 3. Why it is built this way

### 3.1 Why the script block is not `is:inline`

The first version of this component put the script in a block marked `is:inline`, and wrote the callback as:

```js
var disqus_config = function (this: DisqusConfig) {
```

`this: DisqusConfig` is TypeScript. An `is:inline` block is copied into the page exactly as written and never
compiled, so the browser read that line itself and stopped:

```
Uncaught SyntaxError: Unexpected token 'this'
```

A syntax error kills the whole block, including the lines below it that load `embed.js`, so `#disqus_thread` stayed
empty on every post.

Where it was caught matters as much as what it was:

- `npm run build` was green: 16 pages, no error. The build never parses an `is:inline` block as JavaScript, it only
  copies it.
- `npm run check` was not green. It reported the real error all along:

  ```
  src/components/Disqus.astro:21:39 - error ts(8010): Type annotations can only be used in TypeScript files.
  ```

  Re-measured on 2026-09-18 by taking the file out of git with `git show 1116d24^:src/components/Disqus.astro` and
  running `astro check` against it.

A block the browser parses verbatim cannot carry types at all. A compiled block can, so the block is an ordinary
Astro script block now: Astro compiles it, Vite bundles it, and `npm run check` type-checks it. That is why
`this: DisqusPageConfig` can be written in the code itself.

### 3.2 Why data attributes instead of `define:vars`

`define:vars` is the directive that passes frontmatter values into a script, and it only works on an `is:inline`
block. Giving it up is the price of a compiled block, and the replacement is the way Astro documents for this exact
case: put the values on an element as `data-` attributes and read them back from `dataset`. The same shape is already
used by `DisqusLazy.astro` in this project.

It is also the smaller footprint. `define:vars` inlines the values, and the whole block with them, into every page
that renders the component; data attributes leave the code in one cached bundle and put two short strings in the
HTML.

### 3.3 Why the props have no defaults

They used to have them:

```js
const { url = site.social.github, identifier = "my-post" } = Astro.props;
```

Since the identifier keys the thread, any page that rendered `<Disqus />` without props would have filed its comments
into a thread called `my-post`, shared with every other such page. Nothing would have reported it: it is not a broken
build, it is wrong data in a third party's database, and moving a thread afterwards is manual work in the Disqus
admin.

With the defaults gone the props are required, and the same mistake is caught by `npm run check`:

```
ts(2322): Type '{}' is missing the following properties from type 'Props': url, identifier
```

Measured on 2026-09-18. Note that `npm run build` still does not catch it, because the build does not type-check at
all - which is why the check belongs in the workflow before a commit and not only in the editor.

### 3.4 Why the URL comes from `Astro.site`

It used to be built from the link shown in the footer:

```js
const postUrl = `${site.social.github}/posts/${post.slug}`;
```

That produced `https://debi7.github.io//posts/article` on the built page: a double slash, and no trailing slash.
Since the URL is half of the thread key and is also what Disqus shows as the thread's address, it has to be the
page's own canonical address. `new URL("/posts/<slug>/", Astro.site)` gives exactly that, with the trailing slash the
rest of the site uses.

### 3.5 Why `this`, and why not an arrow function

`this` is not something the component sets. `embed.js` calls the callback with its own configuration object as
`this`, which is why writing into `this.page` configures the widget. `this: DisqusPageConfig` in the signature is a
TypeScript "this parameter": it only tells the checker what `this` will be, and the compiler removes it, as the
bundle in section 2.5 shows.

That also rules out an arrow function:

```js
// This breaks the widget:
window.disqus_config = () => {
  this.page.url = url;
};
```

An arrow function has no `this` of its own; it takes the one from the place where it is written, which here is the
module. `this.page` would then be undefined and Disqus would get no configuration.

## 4. The two kinds of script block, side by side

Astro has exactly two, and picking one is a trade rather than a matter of taste. Sections 3.1 and 3.2 say why this
component ended up on one of them; this section is the general picture, for the next time the question comes up.

### 4.1 A compiled block: no directive at all

This is what the component uses. Astro hands the block to the compiler and Vite bundles the result.

What it gives:

- TypeScript is allowed, and `npm run check` reads it. A type error, a misspelt property, a wrong argument all show
  up in the terminal before anything reaches a browser.
- Imports work, both npm packages and project modules, so the code can be shared instead of copied.
- The output is bundled once for the whole site and minified. A component used on fifty pages adds its code once,
  and the file is cached after the first page.
- Nothing from the block reaches the page source. Comments in it are for the project, not for the visitor.
- Astro emits one script even when the component renders several times on the same page. Measured on 2026-09-18:
  two instances on one page produced one script tag.

What it costs:

- `define:vars` is unavailable, so values from the frontmatter have to cross on `data-` attributes. Everything
  arrives as a string, and anything structured has to be written as JSON and parsed back.
- The block is a module and therefore deferred: it runs after the HTML is parsed. It cannot do anything that must
  happen before the first paint.
- A module has its own scope, so anything a third-party script must see has to be assigned to `window` by hand.
- One more request for the bundle, cached from then on.
- A vendor snippet that has to stay exactly as given does not belong here, because the compiler will rewrite it.

### 4.2 An `is:inline` block

Astro copies the block into the page exactly as written and does nothing else to it.

What it gives:

- It runs synchronously, in document order, where it sits. That is the only way to do work before the first paint.
  The anti-flash theme script in `Head.astro` is exactly that case: it adds the `dark` class before anything is
  drawn, and it has to stay inline.
- `define:vars` works, so frontmatter values land in the block directly, with their types intact and no detour
  through the DOM.
- A vendor snippet can be pasted verbatim, which is how vendors document them. `Carousel.astro` keeps the Hugo
  theme's own script that way.
- Nothing to bundle and no extra request. For two or three lines it is genuinely the lighter option.

What it costs:

- No TypeScript. Any type syntax is a syntax error in the browser, and one such error kills the entire block - that
  is the defect described in section 3.1.
- No imports, neither npm packages nor project modules.
- Nothing is bundled or minified. The whole text, comments included, is copied into every page that renders the
  component.
- With `define:vars` the block is wrapped in a function, so a top-level `var` or `function` is not global. The
  wrapper is invisible in the source, which makes this easy to miss.
- `astro check` still reads the block as JavaScript and reports what that allows. Measured on this project: it
  flagged TypeScript syntax as `ts(8010)` and an unused variable as `ts(6133)`. What it cannot give is anything at
  the type level, because there are no types in a block the browser reads verbatim.

### 4.3 How to choose

Inline when at least one of these is true:

- the code must run before the first paint;
- it is a vendor snippet that has to stay exactly as given;
- it is two or three lines with no logic worth checking.

Compiled otherwise, and in particular whenever the block carries types, imports, or values from the frontmatter.

Both kinds are in this project, and each is where it belongs:

- `src/components/Head.astro` - inline, and it has to be: it runs before the first paint.
- `src/components/Carousel.astro` - inline, because it is the theme's own script kept verbatim.
- `src/pages/categories/index.astro` - inline by choice rather than necessity; the accordion script would work as a
  compiled block too. Noted for the picture; this document does not ask for it to be changed.
- `src/components/Disqus.astro` and `src/components/DisqusLazy.astro` - compiled.

## 5. What the tools catch, and what they do not

Measured on 2026-09-18, each case put into a throwaway `.astro` file and run through `astro check`:

- TypeScript syntax in an `is:inline` block: **caught**, `ts(8010) Type annotations can only be used in TypeScript
files`.
- A type error in a compiled script block, such as `const n: number = "not a number"`: **caught**, `ts(2322)`.
- `window.disqus_config = function (this: DisqusPageConfig) {...}` in a compiled block: **accepted**, no diagnostic.
  This is the measurement the current implementation rests on.
- `<Disqus />` with no props: **caught**, `ts(2322)`, as quoted in 3.3. With the old defaults it was not caught at
  all.

Two conclusions follow:

1. `npm run build` never type-checks and caught none of these. `npm run check` is the tool that does.
2. Not even the checker sees a wrong thread key, because a wrong key is valid code. That one is found only by loading
   the page and looking at what the widget asked for - see section 8.

## 6. Where it stays dangerous

Typing removes a class of mistakes. It does not remove these.

**The thread key is data in somebody else's database.** Disqus files comments under `t_i` (the identifier) and `t_u`
(the url). If either changes, the comments do not vanish, but they stop appearing under the post, and putting them
back is manual work in the Disqus admin. The key changes if a post slug is renamed, if the component is called with
different values, or if `site` in `astro.config.mjs` changes. Treat the identifier as permanent once a post is
published.

**The type declaration is an assertion, not a verification.** Disqus ships no type definitions with `embed.js`. The
shape in `src/env.d.ts` is our description of their contract, taken from their documentation. If Disqus changes it,
the project stays green and the widget breaks in the browser. TypeScript guarantees that our code agrees with itself,
nothing more.

**`window.disqus_config` is a global name.** A second widget on the same page, or any other script writing that name,
would silently overwrite the configuration. The component is currently the only writer, and that is worth keeping.

**`embed.js` is a third-party script with full access to the page.** That is what a comments widget is; it is listed
here so the choice stays visible.

## 7. Rules for this kind of code

- Treat an `is:inline` block as source code for the browser, not for the project. Nothing that needs checking belongs
  in it, and everything in it, comments included, reaches the visitor.
- Never accept "the build is green" as evidence about such a block. Run `npm run check` and read what it says.
- Prefer a `data-` attribute plus a compiled script block as soon as the code is more than a couple of lines.
- For this component the acceptance test is the thread key, because that is the part that cannot be undone: the
  widget frame must carry `t_i=<slug>` and `t_u=<canonical url>`.

## 8. Running it locally, and what you should see

```
npm run dev
```

Open `http://localhost:4321/posts/article/` and scroll to the bottom of the article. Below the horizontal rule the
Disqus block appears; the first load takes a few seconds, because the widget is fetched from Disqus.

What a working page looks like:

- The widget renders where the container is: the reaction bar, the comment count, an empty comment box, the sign-in
  options and the Disqus footer. Its interface language comes from the Disqus site settings, not from this project.
- The browser console has no red errors.
- In the console, `typeof window.disqus_config` is `"function"` and `typeof window.DISQUS` is `"object"`.
- In the Elements panel the container `#disqus_thread` holds the Disqus frames, and the widget frame's `src` contains
  `t_i=article` and `t_u=https://debi7.github.io/posts/article/`. Those two are the thread key: the identifier is the
  slug, and the URL is the canonical address, not the localhost address the page was opened from.

Measured on 2026-09-18 against the dev server and against the built site, both in headless Edge: no console errors or
warnings, `window.disqus_config` a function, `window.DISQUS` an object, one `embed.js` script tag, the widget frame
`dsq-app` sized 672x649 inside the container, the thread key as quoted above, and the widget itself drawn in a
screenshot of the page.

One measurement artefact worth knowing, so that nobody reads it as a defect: a headless screenshot taken with
`--virtual-time-budget` shows the Disqus notice "Disqus seems to be taking longer than usual". The virtual clock is
what causes it. The same page captured in real time renders the widget completely.

The full set of checks, all green on the same day:

- `npm run fix` - nothing to reformat.
- `npm run check` - 0 errors, 0 warnings.
- `npm run build` - 16 pages.
- `npm run dev` - starts clean and serves the post page.

## 9. Adding comments to another page

The whole recipe:

```astro
---
import Disqus from "../components/Disqus.astro";

const url = new URL(Astro.url.pathname, Astro.site).toString();
---

<Disqus url={url} identifier="about" />
```

`Astro.url.pathname` is the current route, so that line is the same on every page and there is no path literal to
keep in step with the route. The post route builds its URL from the slug instead, because one route there renders
many pages.

Two things have to be right.

**One widget per page.** `id="disqus_thread"` is required by Disqus: `embed.js` looks for exactly that id, and the
service does not support two embeds on one page. Two instances of the component would produce a duplicated id, and
only the first would be configured. Measured on 2026-09-18: a page rendering it twice emitted one script tag and two
containers with the same id, so the second container stayed empty.

**The identifier is permanent.** It keys the thread, so it has to be a short, stable word that is never changed
afterwards: renaming it leaves the existing comments filed under the old key, and moving them is manual work in the
Disqus admin. It also has to be unique across the site, and the post route already uses post slugs, so a page
identifier must not collide with one.

The shortname needs no attention: the component reads it from `src/config.ts`.

There is no second component to choose from. `src/components/DisqusLazy.astro`, a sketch of a loader that waited
until the block scrolled into view, was deleted on 2026-09-22: it was wired nowhere, it never published
`disqus_config`, so a thread loaded through it would have had no configuration at all, it used the same
`id="disqus_thread"` and so could not share a page with `Disqus.astro`, and it still pointed at
`https://YOUR_SHORTNAME.disqus.com/embed.js`. Anyone who had reached for it would have loaded a stranger's widget.
Lazy loading is worth having; it belongs in `Disqus.astro`, where the configuration already lives.

## 10. Changes of 2026-09-22

A pass of Astro best practice over what existed, at the owner's request. The built pages are unchanged: the same
markup, the same ids, the same label. Sections 2.1 and 2.3 describe the old shape and are annotated above; this is
what replaced it.

**The component renders its own button.** The reveal button used to be written out by `src/pages/posts/[slug].astro`
and `src/pages/video/[slug].astro`, one copy each, while the script inside `Disqus.astro` bound to it by id. A
component whose script depends on markup its caller has to remember means a contract nothing checks - the two
copies were kept in step by grep alone, and adding comments to a third page meant copying the block again. The
button, its classes and its two labels are in `Disqus.astro` now, and a page that wants comments renders one tag:

```astro
<Disqus url={commentsUrl} identifier={post.slug} />
```

**The thread URL comes from `lib/`.** `postUrl()` and `videoUrl()` are where an entry's address is decided, and the
routes now call them instead of assembling `/posts/<slug>/` again. The Disqus thread is keyed by this URL: two
definitions of it are two chances for the site to move and leave every comment filed under an address that no
longer resolves.

**The count script reads the shortname from the config.** `Base.astro` had `//biolocation-club.disqus.com/count.js`
spelled out, which made the layout a second place that decided which Disqus account the site belongs to, while
`Disqus.astro` had been reading `src/config.ts` since 2026-09-18. It is `https://${site.disqus.shortname}...` now.
The tag keeps the inline behaviour it always had - Astro implies `is:inline` for any script carrying an attribute
other than `src`, and this one has `id` and `async` - and the directive is written out so that it does not depend on
that attribute list.

**`(window as any)` is gone.** `src/env.d.ts` has declared `Window.disqus_config` and `DisqusPageConfig` since
2026-09-17, so the cast was asserting away a type the project already had, and the house rules bar `any` outright.
The callback is `function (this: DisqusPageConfig)` and `astro check` reports no errors, which means a typo in
`this.page.identifier` is now a build failure rather than a thread that quietly loads empty. Section 2.3's
explanation of the narrowing still holds.
