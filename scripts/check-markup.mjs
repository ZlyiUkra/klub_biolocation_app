// Markup parity of every page of the running site against the old application's build (task T133 of
// specs/001-self-hosted-club-site; `npm run check:markup`).
//
// What it compares: for every address in reference/astro-routes.txt (the 149 routes the site has, task T039), the page
// the running server answers and the file the old build wrote. Two levels, reported separately:
//   - the whole document, byte for byte, after one normalisation: the content hash in the name of a built asset
//     (/_astro/<name>.<hash>.<ext> becomes /_astro/<name>.<ext>), because the two builds bundle differently;
//   - the <main> region alone, which is the region CLAUDE.md names as the markup contract.
// A page that differs only outside <main> is reported as a document difference and is still a failure here: the head
// carries the share metadata and the canonical address, which are part of what a visitor's tools see.
//
// Where the old build comes from: `--old-dist <dir>` is a build that already exists; `--old-repo <path>` is a clone
// of the old application, of which the commit `--ref` (default 495e959, see T180 below) is exported with `git archive` into a
// temporary folder and built there with that repository's own node_modules, so neither the repository nor its dist/
// is touched. The temporary folder is kept and its dist path printed, to be reused with `--old-dist`.
//
// Changed 2026-10-12 (T180): the reference is the old application WITH its interface languages, its commit 495e959 (the
// tip of its branch refactor-app; the last change of code is 77db5f4), no longer 2b4aac9. Four things follow from that:
//   - One HTML answers both languages: every text is printed once per language (the spans of T.astro) and the browser
//     shows one of them, so the comparison below covers English and Russian in one pass. What a visitor sees in each
//     language is what check:screenshots compares.
//   - A third level of equality, reported on its own line: the documents are equal after every run of white space is
//     one space and the space around a block element's tag is dropped. Whitespace between block elements is not
//     rendered (and a run of spaces shows as one), it is the class of difference CLAUDE.md already accepts from Hugo's
//     minifier, and it cannot be told apart from the compiler's own: the page of a post, rendered inside a conditional
//     since T090, loses the whitespace the same markup had as a plain slot. A space between two INLINE elements is
//     kept, so a lost gap ("Page Views18") is still a difference.
//   - Three differences the rewrite made on purpose are named, counted and printed, like the earlier ones: the gap
//     class of the views counter (the owner's fix of 2026-10-11, commit 09687fa), the hidden <template> of the player
//     that a public video now carries (T082), and the paid lectures' pages, whose player and notices were rewritten
//     (T082, T139: the members-only block is not in the page a guest receives any more).
//   - The server under test must hold the old repository's content: an entry that exists only here (lecture-4,
//     T175) changes the lists. Start a throwaway server on a database imported from the old repository's src/content.
//
// Usage:  node scripts/check-markup.mjs --old-repo ../klub_biolocation_astro [--ref 495e959] [--origin http://127.0.0.1:3000]
//         node scripts/check-markup.mjs --old-dist <dir> [--origin ...]
// Exit code 0 when every page matches, 1 otherwise (the differing pages are listed, the first few with their first
// differing line).

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : args[at + 1];
};

const origin = option(
  "--origin",
  process.env.CHECK_ORIGIN ?? "http://127.0.0.1:3000",
).replace(/\/$/, "");
// Changed 2026-10-12 (T180): was 2b4aac9, the commit the history of this repository starts from.
const ref = option("--ref", "495e959");

function buildOld(repo) {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), "klub-old-build-"));
  const archive = spawnSync("git", ["-C", repo, "archive", ref], {
    maxBuffer: 1024 * 1024 * 512,
  });
  if (archive.status !== 0)
    throw new Error(`git archive ${ref} failed: ${archive.stderr}`);
  const extract = spawnSync("tar", ["-x"], {
    cwd: copy,
    input: archive.stdout,
  });
  if (extract.status !== 0) throw new Error(`tar failed: ${extract.stderr}`);
  // The old repository's own dependencies, linked, not copied; a junction on Windows.
  fs.symlinkSync(
    path.resolve(repo, "node_modules"),
    path.join(copy, "node_modules"),
    "junction",
  );
  const build = spawnSync(
    process.execPath,
    [path.join(copy, "node_modules/astro/astro.js"), "build"],
    { cwd: copy, encoding: "utf8" },
  );
  if (build.status !== 0)
    throw new Error(`the old build failed:\n${build.stdout}\n${build.stderr}`);
  console.log(`old build kept at ${path.join(copy, "dist")}`);
  return path.join(copy, "dist");
}

let oldDist = option("--old-dist");
if (!oldDist) {
  const repo = option("--old-repo");
  if (!repo) {
    console.error(
      "Give --old-dist <dir> or --old-repo <path>; see the header.",
    );
    process.exit(2);
  }
  oldDist = buildOld(path.resolve(repo));
}
oldDist = path.resolve(oldDist);

// /_astro/Base.CUSTOMHASH.css -> /_astro/Base.css : the hash is the only part that differs between two builds of the
// same source with different bundler inputs.
const normalise = (html) =>
  html.replace(
    /(\/_astro\/[^"'\s?]*?)\.[A-Za-z0-9_-]{8}(\.[a-z0-9]+)/g,
    "$1$2",
  );

// Added 2026-10-11 (T054, first part of the owner's variant A): the one block the old application's head carries and
// this one does not any more - the inline script that read the previous provider's localStorage flag and marked the
// document kb-member. It is removed from the OLD document before comparing, so every other byte still has to match, and
// the number of pages it was found on is printed, so the exception cannot quietly widen.
const oldFlagBlock =
  /<script>\(function\(\)\{const flagKey = "kb-auth-expires";[\s\S]*?\}\)\(\);<\/script>/;
let flagBlocksRemoved = 0;
const withoutOldFlagBlock = (html) => {
  const stripped = html.replace(oldFlagBlock, "");
  if (stripped !== html) flagBlocksRemoved++;
  return stripped;
};

// Added 2026-10-11 (the owner's word): the status is written "мэтр" with the Russian э, never "метр", which is a unit of
// length. The one sentence of the old application that carried the old spelling is rewritten in the OLD document before
// comparing, and counted, so the exception is this sentence and nothing wider.
let spellingFixed = 0;
const withNewSpelling = (html) => {
  const fixed = html.replace(
    "Статусы назначают метр и администратор.",
    "Статусы назначают мэтр и администратор.",
  );
  if (fixed !== html) spellingFixed++;
  return fixed;
};

// Added 2026-10-12 (T180): the three differences the rewrite made on purpose, applied to the document they are found in
// and counted, so that none of them can widen without the report saying so.
// 1. The owner saw "Page Views18" on 2026-10-11 and the gap became a class of the counter (commit 09687fa of this
//    repository; the old application still prints the counter without it). The old document is rewritten to match.
const oldViewsCounter = '<span id="busuanzi_value_page_pv"></span>';
const newViewsCounter =
  '<span id="busuanzi_value_page_pv" class="ml-1"></span>';
let viewsGapApplied = 0;
const withViewsGap = (html) => {
  if (!html.includes(oldViewsCounter)) return html;
  viewsGapApplied++;
  return html.split(oldViewsCounter).join(newViewsCounter);
};
// 2. A public video's page carries the player's hidden <template> since T082 (one player component for every video);
//    the old page has none. It is taken out of the NEW document, the rest of the page is compared as it is.
// Both of its templates (data-paid-player, data-paid-file) are named by the prefix.
const playerTemplate = /<template data-paid-[a-z]+>[\s\S]*?<\/template>/g;
let playerTemplatesRemoved = 0;
const withoutPlayerTemplate = (html) =>
  html.replace(playerTemplate, () => {
    playerTemplatesRemoved++;
    return "";
  });
// 3. A paid lecture's page: the player's notices and the page body were rewritten (T082, T139); the old page carried the
//    members-only block hidden in the markup, the new one never sends it to a guest. The page is recognised by the
//    marker the locked player carries, answered 200 and listed, not compared.
const paidLockedSeen = [];

// 4. Added 2026-10-12 (T167, the removal of the previous sign-in provider): the feedback form (ContactModal.astro) no
//    longer carries the attribute `data-member-key` (the localStorage key of the provider's pages) and its inline
//    script fills a member's name and email from `/api/auth/me`. The attribute is taken out of the OLD document, and the
//    form's inline script is replaced by a marker in BOTH documents, so that the rest of the page is still compared
//    byte for byte; each is counted and printed.
let memberKeyRemoved = 0;
const withoutMemberKey = (html) => {
  const stripped = html.replace(' data-member-key="kb-auth-contact"', "");
  if (stripped !== html) memberKeyRemoved++;
  return stripped;
};
const contactScript =
  /<script>(?:(?!<\/script>)[\s\S])*getElementById\("contact-modal"\)(?:(?!<\/script>)[\s\S])*<\/script>/;
let contactScriptsMarked = 0;
const withContactScriptMarked = (html) =>
  html.replace(contactScript, () => {
    contactScriptsMarked++;
    return "<script>/* contact form script */</script>";
  });

// 6. Added 2026-10-13 (T109): the feedback form posts to the club's own route. Its markup is no longer the old
//    application's: no web3forms address and access key, an id, a honeypot field, `maxlength` on the three texts, and a
//    third toast template for the route's 429. The whole <form> element is replaced by one marker in BOTH documents and
//    the new toast template is taken out of the NEW one, so the rest of the page is still compared byte for byte; each
//    is counted and printed. Its behaviour is checked by `npm run check:feedback`, which fills the form in a browser.
const oldContactForm = /<form\b[^>]*web3forms\.com[^>]*>[\s\S]*?<\/form>/;
const newContactForm = /<form\b[^>]*id="contact-form"[^>]*>[\s\S]*?<\/form>/;
const limitToastTemplate =
  /\s?<template id="contact-toast-limit">[\s\S]*?<\/template>/;
let contactFormsMarked = 0;
let limitToastsRemoved = 0;
const withContactFormMarked = (html) =>
  html.replace(oldContactForm, () => {
    contactFormsMarked++;
    return "<form>/* contact form */</form>";
  });
const withNewContactFormMarked = (html) =>
  html
    .replace(newContactForm, () => {
      contactFormsMarked++;
      return "<form>/* contact form */</form>";
    })
    .replace(limitToastTemplate, () => {
      limitToastsRemoved++;
      return "";
    });

// 5. Added 2026-10-13 (T106, T151): the comments block. The old pages carry the previous comment service's loader
//    button, its thread container and its noscript line, and its count script; the new ones carry the club's own block
//    (a section whose content the browser fills). Both blocks are replaced by one marker, so that the rest of the page is
//    still compared byte for byte; each side is counted and printed.
const oldCommentsBlock =
  /<div id="disqus_loader_container"[\s\S]*?<\/noscript>/;
const oldCountScript = /<script[^>]*id="dsq-count-scr"[^>]*><\/script>/;
const newCommentsBlock = /<section id="comments"[\s\S]*?<\/section>/;
let oldCommentsMarked = 0;
let newCommentsMarked = 0;
const withOldCommentsMarked = (html) =>
  html.replace(oldCountScript, "").replace(oldCommentsBlock, () => {
    oldCommentsMarked++;
    return "<!-- comments block -->";
  });
const withNewCommentsMarked = (html) =>
  html.replace(newCommentsBlock, () => {
    newCommentsMarked++;
    return "<!-- comments block -->";
  });

// Added 2026-10-12 (T180): the third level of equality described in the header. Block elements only, on purpose: a
// space between two inline elements is shown, so it stays.
const blockTags =
  "div|p|hr|ul|ol|li|section|main|header|footer|nav|article|aside|form|h[1-6]|noscript|template|script|style|link|meta|head|body|html|table|thead|tbody|tr|td|th|figure|figcaption|blockquote|pre|details|summary";
const aroundBlockTag = new RegExp(
  " ?(</?(?:" + blockTags + ")\\b[^>]*>) ?",
  "gi",
);
const squash = (html) =>
  html.replace(/\s+/g, " ").replace(aroundBlockTag, "$1");

const mainOf = (html) => html.match(/<main\b[\s\S]*?<\/main>/)?.[0] ?? null;

// Changed 2026-10-12 (T180): a window around the first differing character. A page is one long line, so the line
// number said nothing and the 160 characters shown were the start of the line, which is the same in both.
function firstDifference(a, b) {
  const limit = Math.min(a.length, b.length);
  let at = 0;
  while (at < limit && a[at] === b[at]) at++;
  const from = Math.max(0, at - 60);
  return (
    "offset " +
    at +
    "\n      old: ..." +
    a.slice(from, at + 100) +
    "\n      new: ..." +
    b.slice(from, at + 100)
  );
}

const routes = fs
  .readFileSync(path.join(projectRoot, "reference/astro-routes.txt"), "utf8")
  .split(/\r?\n/)
  .filter(Boolean);

const failures = [];
// Added 2026-10-11 (T053): the three account pages were rewritten on purpose, from the previous provider's component
// to the club's own forms, so their markup is no longer the old application's and is not compared. They are still
// fetched (the server must answer 200) and listed in the report, so the exception cannot grow unnoticed. Anything
// else that differs is a failure, as before. The list is the whole exception: a fourth page is a decision of its own.
const rewrittenOnPurpose = new Set([
  "/auth/signin/",
  "/auth/signup/",
  "/auth/account/",
]);
const rewrittenSeen = [];
// Added 2026-10-11 (T070, step 3a): the panel pages that answer 404 to a visitor with no session (the owner's rule:
// not a redirect, so that the page is not a fact a stranger can read off an answer). This check is such a visitor, so
// a 404 there is the designed answer, not a failure; the page itself is checked by `npm run check:auth`, which signs
// in as a metr and an admin. They are listed in the report like the rewritten pages, so the exception cannot grow.
// Changed 2026-10-12 (T167, found while running this check for the first time since T099): /admin/posts/ answers 404 to
// a visitor with no session since T099, as /admin/users/ does; it is the same designed answer, checked by check:auth
// and check:admin-posts.
const gatedForGuests = new Set(["/admin/users/", "/admin/posts/"]);
const gatedSeen = [];
// Added 2026-10-13 (T128): the routes the old build cannot have. reference/astro-routes.txt was brought up to date that
// day (it had been stale since the recovery page and lecture-4 were added) and now names two routes that exist only in
// the rewrite: the recovery page, a page of its own since T168, and lecture-4 (T175; a server seeded from the old
// repository's content, as this check requires, does not hold it). With nothing to compare against they are not
// fetched and not counted as differences; they are listed in the report, so the exception cannot grow unnoticed. A
// third route that exists only here is a decision of its own, like a fourth rewritten account page above.
const onlyHere = new Set(["/auth/recover/", "/video/lecture-4/"]);
const onlyHereSeen = [];
// Added 2026-10-10 (T148): the routes whose page asks robots to stay away, collected while the pages are read.
const noindexRoutes = [];
let identical = 0;
let whitespaceOnly = 0;
let mainIdentical = 0;
for (const route of routes) {
  const oldFile = path.join(oldDist, route, "index.html");
  if (!fs.existsSync(oldFile)) {
    // Changed 2026-10-13 (T128): a route named in onlyHere has no old page by design (see above).
    if (onlyHere.has(route)) {
      onlyHereSeen.push(route);
      continue;
    }
    failures.push({ route, kind: "missing in the old build" });
    continue;
  }
  const response = await fetch(origin + encodeURI(route));
  if (response.status === 404 && gatedForGuests.has(route)) {
    gatedSeen.push(route);
    continue;
  }
  if (response.status !== 200) {
    failures.push({ route, kind: `new server answers ${response.status}` });
    continue;
  }
  const rawAfter = await response.text();
  if (/<meta name="robots" content="[^"]*noindex/.test(rawAfter))
    noindexRoutes.push(route);
  if (rewrittenOnPurpose.has(route)) {
    rewrittenSeen.push(route);
    continue;
  }
  if (rawAfter.includes('data-paid-video="')) {
    paidLockedSeen.push(route);
    continue;
  }
  // Changed 2026-10-13 (T109): the contact form's element is marked on both sides (note 6 above).
  const before = withOldCommentsMarked(
    withContactFormMarked(
      withContactScriptMarked(
        withoutMemberKey(
          withViewsGap(
            withNewSpelling(
              withoutOldFlagBlock(normalise(fs.readFileSync(oldFile, "utf8"))),
            ),
          ),
        ),
      ),
    ),
  );
  const after = withNewCommentsMarked(
    withNewContactFormMarked(
      withContactScriptMarked(withoutPlayerTemplate(normalise(rawAfter))),
    ),
  );
  if (before === after) {
    identical++;
    mainIdentical++;
    continue;
  }
  if (squash(before) === squash(after)) {
    whitespaceOnly++;
    mainIdentical++;
    continue;
  }
  const mainBefore = mainOf(squash(before));
  const mainAfter = mainOf(squash(after));
  if (mainBefore !== null && mainBefore === mainAfter) {
    mainIdentical++;
    failures.push({
      route,
      kind: "document differs outside <main>",
      detail: firstDifference(squash(before), squash(after)),
    });
  } else {
    failures.push({
      route,
      kind: "<main> differs",
      detail: firstDifference(
        mainBefore ?? squash(before),
        mainAfter ?? squash(after),
      ),
    });
  }
}

// Added 2026-10-10 (T148 of specs/001-self-hosted-club-site): what crawlers are told. Three rules, all taken from
// the old application:
//   - the sitemap lists no /page/<n>/ list page, nothing under /auth/ and nothing under /admin/, and it lists every
//     other route (the set of routes found by crawling, task T039, is the cross-check: two mechanisms, one answer);
//   - when the old build is at hand, its sitemap and the new one list the same addresses (the order is different on
//     purpose: the old package's order meant nothing);
//   - only the admin pages carry noindex; no public page is closed (AUTH.md section 11).
{
  const locs = (xml) =>
    [...xml.matchAll(/<loc>([^<]+)<[/]loc>/g)].map((m) => m[1]);
  const isListPage = (route) => /[/]page[/][0-9]+[/]/.test(route);
  const pathOf = (address) => decodeURI(new URL(address).pathname);
  const index = await (await fetch(origin + "/sitemap-index.xml")).text();
  const sitemapFiles = locs(index).map(pathOf);
  const listed = [];
  for (const file of sitemapFiles) {
    const xml = await (await fetch(origin + file)).text();
    listed.push(...locs(xml).map(pathOf));
  }
  for (const route of listed) {
    if (
      isListPage(route) ||
      route.startsWith("/auth/") ||
      route.startsWith("/admin/")
    )
      failures.push({ route, kind: "is in the sitemap and must not be" });
  }
  const wanted = routes.filter(
    // Changed 2026-10-13 (T128): the routes of onlyHere are not in the old sitemap and are not expected in the new
    // one either, because the server under test holds the old repository's content.
    (r) =>
      !isListPage(r) &&
      !r.startsWith("/auth/") &&
      !r.startsWith("/admin/") &&
      !onlyHere.has(r),
  );
  const listedSet = new Set(listed);
  for (const route of wanted)
    if (!listedSet.has(route))
      failures.push({ route, kind: "is a route but not in the sitemap" });
  for (const route of listed)
    if (!wanted.includes(route))
      failures.push({
        route,
        kind: "is in the sitemap but is not a route of the site",
      });
  const oldSitemap = path.join(oldDist, "sitemap-0.xml");
  if (fs.existsSync(oldSitemap)) {
    const oldSet = new Set(
      locs(fs.readFileSync(oldSitemap, "utf8")).map(pathOf),
    );
    for (const route of oldSet)
      if (!listedSet.has(route))
        failures.push({
          route,
          kind: "is in the old sitemap, not in the new one",
        });
    for (const route of listedSet)
      if (!oldSet.has(route))
        failures.push({
          route,
          kind: "is in the new sitemap, not in the old one",
        });
  }
  for (const route of routes) {
    const closed = noindexRoutes.includes(route);
    const shouldBeClosed =
      route.startsWith("/admin/") && !gatedSeen.includes(route);
    if (closed && !shouldBeClosed)
      failures.push({ route, kind: "carries noindex and is a public page" });
    if (!closed && shouldBeClosed)
      failures.push({ route, kind: "is an admin page without noindex" });
  }
  console.log(
    `sitemap: ${listed.length} addresses in ${sitemapFiles.length} file(s); noindex on ${noindexRoutes.length} page(s)`,
  );
}

// Added 2026-10-10 (T141 of specs/001-self-hosted-club-site): the home page's carousel. T032 once lost it silently (the
// folder of photos was looked up from a path that moved), and only a byte comparison noticed. A page that is byte for
// byte the old one cannot lose it, but this check does not depend on the old build: the home page must carry the
// section, one slide for every photo in public/images/carousel, each photo must be served, and the script that moves
// the slides must be among the home page's module scripts.
{
  const home = await (await fetch(origin + "/")).text();
  const photos = fs
    .readdirSync(path.join(projectRoot, "public/images/carousel"))
    .filter((f) => /.(jpe?g|png|webp|avif)$/i.test(f));
  if (!home.includes('id="home-carousel"'))
    failures.push({ route: "/", kind: "no #home-carousel section" });
  const slides = (home.match(/class="void-carousel__slide/g) ?? []).length;
  if (slides !== photos.length)
    failures.push({
      route: "/",
      kind: `${slides} carousel slides, ${photos.length} photos in public/images/carousel`,
    });
  for (const photo of photos) {
    const response = await fetch(`${origin}/images/carousel/${photo}`);
    if (response.status !== 200)
      failures.push({
        route: `/images/carousel/${photo}`,
        kind: `answers ${response.status}`,
      });
  }
  const scripts = [
    ...home.matchAll(/<script type="module" src="([^"]+)"/g),
  ].map((m) => m[1]);
  let hasBehaviour = false;
  for (const src of scripts) {
    const body = await (await fetch(origin + src)).text();
    if (body.includes("home-carousel")) hasBehaviour = true;
  }
  if (!hasBehaviour)
    failures.push({
      route: "/",
      kind: "no module script of the home page moves the carousel",
    });
  console.log(
    `carousel: ${slides} slides, ${photos.length} photos, ${scripts.length} module scripts on the home page`,
  );
}

if (spellingFixed > 0) {
  console.log(
    `status spelling (мэтр) applied to ${spellingFixed} old document(s) before comparing`,
  );
}
if (flagBlocksRemoved > 0) {
  console.log(
    `old flag block (T054) removed from ${flagBlocksRemoved} old documents before comparing`,
  );
}
if (rewrittenSeen.length > 0) {
  console.log(
    `rewritten on purpose (T053), answered 200 and not compared: ${rewrittenSeen.join(", ")}`,
  );
}
if (gatedSeen.length > 0) {
  console.log(
    `gated for guests (T070), answered 404 as designed and not compared: ${gatedSeen.join(", ")}`,
  );
}
if (onlyHereSeen.length > 0) {
  console.log(
    `only in the rewrite (T128), no old page to compare with and not fetched: ${onlyHereSeen.join(", ")}`,
  );
}
if (viewsGapApplied > 0) {
  console.log(
    "views counter gap (09687fa) applied to " +
      viewsGapApplied +
      " old document(s) before comparing",
  );
}
if (playerTemplatesRemoved > 0) {
  console.log(
    "player template (T082) taken out of " +
      playerTemplatesRemoved +
      " new document(s) before comparing",
  );
}
if (memberKeyRemoved > 0) {
  console.log(
    "contact form (T167): its data-member-key attribute taken out of " +
      memberKeyRemoved +
      " old document(s), and its inline script marked in " +
      contactScriptsMarked +
      " document(s) of both sides before comparing",
  );
}
if (contactFormsMarked > 0) {
  console.log(
    "contact form (T109): its <form> element marked in " +
      contactFormsMarked +
      " document(s) of both sides, and the 429 toast template taken out of " +
      limitToastsRemoved +
      " new document(s) before comparing",
  );
}
if (oldCommentsMarked > 0 || newCommentsMarked > 0) {
  console.log(
    "comments block (T106): the previous service's block and count script marked in " +
      oldCommentsMarked +
      " old document(s), the club's own block marked in " +
      newCommentsMarked +
      " new document(s) before comparing",
  );
}
if (paidLockedSeen.length > 0) {
  console.log(
    "paid lectures rewritten on purpose (T082, T139), answered 200 and not compared: " +
      paidLockedSeen.join(", "),
  );
}
console.log(
  routes.length +
    " routes: " +
    identical +
    " identical documents, " +
    whitespaceOnly +
    " equal apart from whitespace between block elements, " +
    mainIdentical +
    " identical <main> regions in all, " +
    failures.length +
    " with a difference",
);
for (const failure of failures.slice(0, 20)) {
  console.log(`  ${failure.route}  ${failure.kind}`);
  if (failure.detail) console.log(`    ${failure.detail}`);
}
if (failures.length > 20) console.log(`  ... and ${failures.length - 20} more`);
process.exit(failures.length === 0 ? 0 : 1);
