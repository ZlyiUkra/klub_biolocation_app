// Checks the paginated post lists of the built site. Added 2026-09-19, when the owner asked for
// a guarantee that pagination keeps working as the number of pages grows. See PAGINATION.md.
//
//   npm run check:pages          checks the running site over HTTP; start it first (npm run dev:site)
//   npm run check:pages:stress   runs scripts/stress-site.mjs --check since 2026-10-10 (T154): a throwaway
//                                database seeded with the generated posts, the same expectations as here
//
// Changed 2026-10-10 (T038 of specs/001-self-hosted-club-site): the pages are read from the running
// server, CHECK_ORIGIN (default http://127.0.0.1:3000), with fetch, not from dist/client, where the
// post, list, tag and category pages no longer exist as files. The expectation is still worked out
// from the front matter of the sources, so the check compares the database's answer (imported from
// those files) with the rules written here; a database that was not re-imported after an edit fails
// it, and the failure says what to run. The checks themselves are unchanged.
//
// What it checks. The expected result is worked out here from the posts' front matter, on its
// own, without the site's code: which posts are published (no drafts, no future dates), their
// year, their order, and the pages of every list. Then the built pages are read the way a reader
// uses them - from the first page of a list to the last by following Next, and back by
// following Previous - and on every page it compares:
//
//   - the posts and their order;
//   - the addresses of Previous and Next, no Next on the last page, and no page after the last;
//   - the page numbers (rule changed later on 2026-09-19 with the owner's: every page of a list
//     of at most pagination.everyNumberUpTo pages, otherwise only the first, the current and the
//     last page with an ellipsis for each run of skipped pages): exactly the expected entries in
//     order, the current page not a link, every other number a link pointing at its page;
//   - on the Posts list, the year switcher (its rule from later on 2026-09-19: every year up to
//     pagination.everyYearUpTo of them, otherwise the newest, the oldest and the year being
//     shown with its neighbours, an ellipsis for hidden years): exactly the expected entries,
//     newest first, each year pointing at its list, the year being shown highlighted.
//
// It does that for every year of every list - the Posts list, every tag and every category are
// all split by year since the evening of 2026-09-19, and the Video list (/video/, the `video`
// collection in src/content/video/) since 2026-09-22 - and also checks that each list's own
// address shows its newest year and highlights it, that no year without published posts has a
// list under /posts/ (or under /video/ without videos), that every published post and video has
// its page, and that drafts and future entries have none.
//
// The rules it mirrors live in src/lib/lists.ts, src/lib/urlize.ts, src/lib/date.ts and the
// list templates. When one of them changes on purpose, change this script with it; a failure
// here after such a change means the two disagree, not necessarily that the site is wrong.
//
// Limits, on purpose: the front matter is read with a few regular expressions, not a YAML
// parser, so that the script needs no dependency. It understands what the templates in
// templates/ write - one `key: value` per line, quoted or not, and lists either as
// ["a", "b"] or as "- a" lines. Anything else is reported as a failure, not guessed at.
//
// Exit code: 0 when every check passes, 1 otherwise, so it can gate a build step.
//
// Filesystem paths use node:path rather than node:path/posix: they are real paths on the
// machine, C:\... on Windows. The site's own addresses are built as plain strings.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

// ---------------------------------------------------------------------------------------------
// The site's settings and rules, read from its sources.

function readSettings(root) {
  // Changed 2026-10-10 (T162): the three numbers are paginationRules in src/lib/pagination.ts now (src/config.ts
  // takes them from there), so they are read from that file.
  const config = fs.readFileSync(
    path.join(root, "src/lib/pagination.ts"),
    "utf8",
  );
  const date = fs.readFileSync(path.join(root, "src/lib/date.ts"), "utf8");
  const pageSize = Number(
    config.match(/paginationRules\s*=\s*\{\s*pageSize:\s*(\d+)/)?.[1],
  );
  // Added with the numbers rule of 2026-09-19; it sits next to pageSize in the same object.
  const everyNumberUpTo = Number(
    config.match(/paginationRules\s*=\s*\{[^}]*everyNumberUpTo:\s*(\d+)/)?.[1],
  );
  const offsetMinutes = Number(
    date.match(/FRONT_MATTER_OFFSET_MINUTES\s*=\s*(-?\d+)/)?.[1],
  );
  if (!pageSize)
    throw new Error("pagination.pageSize not found in src/lib/pagination.ts");
  if (!everyNumberUpTo)
    throw new Error("pagination.everyNumberUpTo not found in src/lib/pagination.ts");
  // The year switcher's own threshold, added with YearSwitcher.astro on 2026-09-19.
  const everyYearUpTo = Number(
    config.match(/paginationRules\s*=\s*\{[^}]*everyYearUpTo:\s*(\d+)/)?.[1],
  );
  if (!everyYearUpTo)
    throw new Error("pagination.everyYearUpTo not found in src/lib/pagination.ts");
  if (Number.isNaN(offsetMinutes))
    throw new Error("FRONT_MATTER_OFFSET_MINUTES not found in src/lib/date.ts");
  return { pageSize, everyNumberUpTo, everyYearUpTo, offsetMinutes };
}

// Mirrors urlize() in src/lib/urlize.ts.
const urlize = (s) =>
  s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}\-_.~]/gu, "")
    .replace(/-+/g, "-");

// Mirrors pageUrl() in src/lib/lists.ts: base itself for page 1, <base>page/<n>/ after it.
const pageUrl = (base, n) => (n === 1 ? base : `${base}page/${n}/`);

// ---------------------------------------------------------------------------------------------
// The posts, and what the lists should hold.

function parseFrontMatter(text, file, problems) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    problems.push(`${file}: no front matter`);
    return null;
  }
  const lines = match[1].split(/\r?\n/).filter((line) => !/^\s*#/.test(line));
  const scalar = (key) => {
    const line = lines.find((l) => l.startsWith(`${key}:`));
    if (!line) return undefined;
    return line
      .slice(key.length + 1)
      .trim()
      .replace(/^"(.*)"$/, "$1")
      .replace(/^'(.*)'$/, "$1");
  };
  const list = (key) => {
    const index = lines.findIndex((l) => l.startsWith(`${key}:`));
    if (index === -1) return [];
    const rest = lines[index].slice(key.length + 1).trim();
    if (rest.startsWith("[")) {
      if (!rest.endsWith("]"))
        problems.push(`${file}: ${key} is not a one-line list`);
      return rest
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    }
    if (rest !== "") {
      problems.push(`${file}: ${key} is not a list`);
      return [];
    }
    const items = [];
    for (const line of lines.slice(index + 1)) {
      const item = line.match(/^\s+-\s+(.*)$/);
      if (!item) break;
      items.push(item[1].trim().replace(/^["']|["']$/g, ""));
    }
    return items;
  };
  const title = scalar("title");
  const dateText = scalar("date");
  const date = new Date(dateText);
  if (!title) problems.push(`${file}: no title`);
  if (!dateText || Number.isNaN(date.getTime()))
    problems.push(`${file}: no readable date`);
  return {
    file,
    slug: file.replace(/\.mdx?$/, ""),
    title: title ?? "",
    date,
    draft: scalar("draft") === "true",
    tags: list("tags").map((t) => t.toLowerCase()),
    categories: list("categories"),
  };
}

// One collection folder: the posts or, since 2026-09-22, the videos. Both front matters carry
// the fields this script reads (title, date, draft, tags, categories); a video's own fields are
// ignored here.
function readEntries(root, folder, problems) {
  const dir = path.join(root, folder);
  return fs
    .readdirSync(dir)
    .filter((file) => /\.mdx?$/.test(file))
    .map((file) =>
      parseFrontMatter(
        fs.readFileSync(path.join(dir, file), "utf8"),
        file,
        problems,
      ),
    )
    .filter(Boolean);
}

// Mirrors getPosts(): published posts only, newest first, then by title, then by file name
// (the collection's id is the file name with its extension).
function publishedPosts(posts, now) {
  return posts
    .filter((p) => !p.draft && p.date.getTime() <= now)
    .sort(
      (a, b) =>
        b.date - a.date ||
        a.title.localeCompare(b.title) ||
        a.file.localeCompare(b.file),
    );
}

// Mirrors formatYear() in src/lib/date.ts: the year in the site's fixed time zone.
const yearOf = (post, offsetMinutes) =>
  String(
    new Date(post.date.getTime() + offsetMinutes * 60_000).getUTCFullYear(),
  );

function groupBy(posts, keysOf) {
  const groups = new Map();
  for (const post of posts) {
    for (const key of keysOf(post))
      groups.set(key, [...(groups.get(key) ?? []), post]);
  }
  return groups;
}

// ---------------------------------------------------------------------------------------------
// Reading the built pages.

// Changed 2026-10-10 (T038): `dist` is the origin of the running site now, and a page is read over HTTP. The checks
// below are synchronous and ask for addresses they work out as they walk, so the pages are fetched in rounds: a round
// runs every check, collecting the addresses that were not in `pageCache` yet (they answer null meanwhile), then they
// are fetched, and rounds repeat until one asks for nothing new; the report is the last round's, in which every answer
// was real. A 404 is cached as null, which is what the "no page after the last" checks need.
const pageCache = new Map();
const pageMisses = new Set();

function readPage(origin, url) {
  const key = origin + url;
  if (pageCache.has(key)) return pageCache.get(key);
  pageMisses.add(key);
  return null;
}

async function fetchMisses() {
  const keys = [...pageMisses];
  pageMisses.clear();
  for (const key of keys) {
    const response = await fetch(key);
    if (response.status === 404) pageCache.set(key, null);
    else if (response.ok) pageCache.set(key, await response.text());
    else throw new Error(`${key} answered ${response.status}`);
  }
}

async function checkOverHttp(root, origin, options) {
  try {
    const health = await fetch(`${origin}/healthz`);
    if (!health.ok) throw new Error(`/healthz answered ${health.status}`);
  } catch (error) {
    return {
      failures: [
        `the site is not answering at ${origin} (${error.message}); start it with npm run dev:site, or set CHECK_ORIGIN`,
      ],
      pages: 0,
    };
  }
  for (let round = 0; round < 200; round++) {
    pageMisses.clear();
    const result = checkBuild(root, { ...options, origin, quiet: true });
    if (pageMisses.size === 0) return result;
    await fetchMisses();
  }
  throw new Error(
    "the pages kept asking for new addresses; the check is not converging",
  );
}

// A card's covering link, /posts/<slug>/ or, on the Video list, /video/<slug>/.
const cardsOf = (html) =>
  [
    ...html.matchAll(
      /<a href="\/(?:posts|video)\/([^"/]+)\/" class="absolute inset-0 z-10"/g,
    ),
  ].map((m) => decodeURIComponent(m[1]));

// The Previous or Next link: an anchor whose content contains the word, with or without an icon.
function linkOf(html, word) {
  const m = html.match(
    new RegExp(`<a href="([^"]+)"[^>]*>(?:(?!</a>)[\\s\\S])*?\\b${word}\\b`),
  );
  return m ? m[1] : null;
}

function yearSwitcherOf(html) {
  // Changed 2026-10-12: found by data-year-switcher, since the nav's aria-label changes with the
  // interface language (YearSwitcher.astro). It was matched as <nav aria-label="Years".
  const nav = html.match(/<nav data-year-switcher[\s\S]*?<\/nav>/);
  if (!nav) return null;
  // Years and, since the rule of 2026-09-19, the ellipsis between hidden years, in order.
  return [
    ...nav[0].matchAll(
      /<a href="([^"]+)"([^>]*)>\s*(\d{4})\s*<\/a>|<span aria-hidden="true"[^>]*>\s*(?:&hellip;|…)\s*<\/span>/g,
    ),
  ].map((m) =>
    m[3]
      ? { url: m[1], year: m[3], current: /aria-current/.test(m[2]) }
      : { gap: true },
  );
}

// Mirrors yearSwitcher() in src/lib/lists.ts: every year up to everyYearUpTo of them, otherwise
// the newest, the oldest and the current year with one neighbour either side, "..." for a run
// of hidden years. `years` are newest first.
function expectedYearSwitcher(years, currentYear, everyYearUpTo) {
  const current = years.indexOf(currentYear);
  const shown =
    years.length <= everyYearUpTo
      ? years.map((_, index) => index)
      : [...new Set([0, current - 1, current, current + 1, years.length - 1])]
          .filter((index) => index >= 0 && index < years.length)
          .sort((a, b) => a - b);
  const entries = [];
  let previous = -1;
  for (const index of shown) {
    if (index - previous > 1) entries.push("...");
    entries.push(years[index]);
    previous = index;
  }
  return entries;
}

// The entries pageNumbers() in src/lib/lists.ts is expected to produce for page `n` of `last`:
// "1 2 3 4 5" up to everyNumberUpTo pages, otherwise the first, the current and the last page
// with a gap for every run of skipped pages - "1 ... 7 ... 20", "1 2 ... 20", "1 ... 20".
// Changed 2026-09-19 with that rule; before it, the script checked a sliding window of two
// pages either side of the current one, plus a second, narrower set for small screens.
function expectedNumbers(n, last, everyNumberUpTo) {
  const shown =
    last <= everyNumberUpTo
      ? Array.from({ length: last }, (_, i) => i + 1)
      : [...new Set([1, n, last])];
  const entries = [];
  let previous = 0;
  for (const k of shown) {
    if (k - previous > 1) entries.push("...");
    entries.push(k);
    previous = k;
  }
  return entries;
}

function checkNumbers(html, n, last, base, where, everyNumberUpTo, fail) {
  const blocks = [
    ...html.matchAll(
      /<div class="[^"]*\border-last\b[^"]*">([\s\S]*?)<\/div>/g,
    ),
  ];
  if (last === 1) {
    if (blocks.length) fail(`${where}: page numbers on a list of one page`);
    return;
  }
  // One block since the rule of 2026-09-19 (five entries at most); it used to be two, one
  // shown from 640px up and one below.
  if (blocks.length !== 1)
    return fail(
      `${where}: ${blocks.length} blocks of page numbers, expected 1`,
    );
  // Changed 2026-10-12: the label is matched in its English copy, data-en-aria-label, because the
  // aria-label itself carries the interface's default language (Pagination.astro). It was matched
  // as <a href="..." aria-label="Page n">.
  const re =
    /<a href="([^"]+)"[^>]*? data-en-aria-label="Page (\d+)"[^>]*>\s*(\d+)\s*<\/a>|<span aria-current="page"[^>]*>\s*(\d+)\s*<\/span>|<span aria-hidden="true"[^>]*>\s*(?:&hellip;|\u2026)\s*<\/span>/g;
  const entries = [...blocks[0][1].matchAll(re)].map((m) =>
    m[4]
      ? { n: Number(m[4]), current: true }
      : m[2]
        ? { n: Number(m[3]), url: m[1], label: Number(m[2]) }
        : { gap: true },
  );
  const found = entries.map((e) => (e.gap ? "..." : e.n));
  const expected = expectedNumbers(n, last, everyNumberUpTo);
  if (found.join(" ") !== expected.join(" "))
    fail(
      `${where}: numbers "${found.join(" ")}", expected "${expected.join(" ")}"`,
    );
  for (const e of entries) {
    if (e.gap) continue;
    // Links have no `current` field, so compare as booleans.
    if (Boolean(e.current) !== (e.n === n))
      fail(
        `${where}: page ${e.n} ${e.current ? "is" : "is not"} the current one`,
      );
    if (e.url && (e.url !== pageUrl(base, e.n) || e.label !== e.n))
      fail(`${where}: link ${e.n} points at ${e.url}`);
  }
}

// Walks one list from its first page with Next, then back from its last page with Previous.
function checkList({
  dist,
  base,
  expected,
  pageSize,
  everyNumberUpTo,
  everyYearUpTo,
  label,
  fail,
  years,
  currentYear,
  // The list's own address, under which the year buttons must point ("/tags/hugo/"); added
  // when every list got years, it used to be "/posts/" for all.
  yearBase,
}) {
  const last = Math.max(1, Math.ceil(expected.length / pageSize));
  const seen = [];
  let url = base;
  let n = 0;
  while (url) {
    n++;
    if (n > last) {
      fail(`${label}: Next leads past the last page, to ${url}`);
      break;
    }
    if (url !== pageUrl(base, n))
      fail(`${label}: page ${n} is at ${url}, expected ${pageUrl(base, n)}`);
    const html = readPage(dist, url);
    if (!html) {
      fail(`${label}: ${url} is missing`);
      break;
    }
    const where = `${label} page ${n}`;
    const onPage = cardsOf(html);
    const want = expected
      .slice((n - 1) * pageSize, n * pageSize)
      .map((p) => p.slug);
    if (onPage.join() !== want.join())
      fail(`${where}: shows ${onPage.join(" ")}, expected ${want.join(" ")}`);
    seen.push(...onPage);
    const prev = linkOf(html, "Previous");
    if (prev !== (n === 1 ? null : pageUrl(base, n - 1)))
      fail(`${where}: Previous points at ${prev}`);
    checkNumbers(html, n, last, base, where, everyNumberUpTo, fail);
    if (years) {
      const switcher = yearSwitcherOf(html);
      const found = switcher
        ? switcher.map((s) => (s.gap ? "..." : s.year)).join(" ")
        : null;
      const wanted =
        years.length > 1
          ? expectedYearSwitcher(years, currentYear, everyYearUpTo).join(" ")
          : null;
      if (found !== wanted)
        fail(
          `${where}: the year switcher shows "${found}", expected "${wanted}"`,
        );
      if (
        switcher &&
        switcher.some((s) => !s.gap && s.url !== `${yearBase}${s.year}/`)
      )
        fail(`${where}: a year button points elsewhere`);
      if (
        switcher &&
        switcher
          .filter((s) => s.current)
          .map((s) => s.year)
          .join() !== currentYear
      )
        fail(`${where}: the highlighted year is not ${currentYear}`);
    }
    url = linkOf(html, "Next");
  }
  if (n === last && seen.length !== expected.length)
    fail(
      `${label}: ${seen.length} posts over all pages, expected ${expected.length}`,
    );
  if (new Set(seen).size !== seen.length)
    fail(`${label}: a post appears twice`);
  if (readPage(dist, pageUrl(base, last + 1)))
    fail(`${label}: a page ${last + 1} exists`);
  let back = pageUrl(base, last);
  let steps = 0;
  while (back && steps <= last) {
    steps++;
    back = linkOf(readPage(dist, back) ?? "", "Previous");
  }
  if (steps !== last)
    fail(`${label}: Previous goes back over ${steps} pages, expected ${last}`);
  return last;
}

// Checks one built site against the posts of the project it was built from.
function checkBuild(root, { now = Date.now(), quiet = false, origin } = {}) {
  // Changed 2026-10-10 (T032): with the Node adapter the build writes the pages to dist/client.
  // Changed 2026-10-10 (T038): `dist` is the origin of the running site, see readPage().
  const dist = origin;
  const failures = [];
  const fail = (message) => failures.push(message);
  const log = (message) => quiet || console.log(message);

  const { pageSize, everyNumberUpTo, everyYearUpTo, offsetMinutes } =
    readSettings(root);
  const all = readEntries(root, "src/content/posts", failures);
  const published = publishedPosts(all, now);
  // The videos, since 2026-09-22: the same filter and order (published() in src/lib/lists.ts,
  // which getPosts() and getVideos() share), walked as one more list by year below.
  const allVideos = readEntries(root, "src/content/video", failures);
  const videos = publishedPosts(allVideos, now);
  const videoYears = groupBy(videos, (p) => [yearOf(p, offsetMinutes)]);
  const byYear = groupBy(published, (p) => [yearOf(p, offsetMinutes)]);
  const years = [...byYear.keys()];
  let pages = 0;

  // Every list is split by year since the evening of 2026-09-19 (paginateByYear() in
  // src/lib/lists.ts): the Posts list, every tag and every category. Until then only the
  // Posts list was, and the tag and category lists were walked across all years. A list is
  // walked year by year, newest first, and its own address must show the newest year's first
  // page and highlight that year in the switcher.
  const checkListByYear = (base, posts, label) => {
    const byYearHere = groupBy(posts, (p) => [yearOf(p, offsetMinutes)]);
    const yearsHere = [...byYearHere.keys()];
    let walked = 0;
    for (const year of yearsHere) {
      walked += checkList({
        dist,
        base: `${base}${year}/`,
        expected: byYearHere.get(year),
        pageSize,
        everyNumberUpTo,
        everyYearUpTo,
        label: `${label} ${year}`,
        fail,
        years: yearsHere,
        currentYear: year,
        yearBase: base,
      });
    }
    const own = readPage(dist, base);
    if (!own) fail(`${base} is missing`);
    else if (
      yearsHere.length &&
      cardsOf(own).join() !==
        cardsOf(readPage(dist, `${base}${yearsHere[0]}/`) ?? "").join()
    )
      fail(`${base} does not show the first page of ${yearsHere[0]}`);
    else if (
      yearsHere.length > 1 &&
      yearSwitcherOf(own)?.find((s) => s.current)?.year !== yearsHere[0]
    )
      fail(`${base} does not highlight ${yearsHere[0]}`);
    return walked;
  };

  pages += checkListByYear("/posts/", published, "year");
  log(`posts: ${years.length} years - checked`);
  // Changed 2026-09-22 with the code it mirrors. A term spans both collections now
  // (src/lib/terms.ts): a tag or a category page lists the posts and the videos that carry it,
  // so grouping the posts alone made this script expect pages that no longer exist and miss the
  // ones that do - /tags/video/ above all, which is built by videos only. The merge mirrors
  // collectTerms() in src/lib/lists.ts: concatenate posts then videos and sort on the date
  // alone, so JavaScript's stable sort leaves a post ahead of a video dated the same day, which
  // is the order the pages are built in.
  const termEntries = [...published, ...videos].sort((a, b) => b.date - a.date);
  for (const [kind, keysOf] of [
    ["tags", (p) => p.tags],
    ["categories", (p) => p.categories],
  ]) {
    const groups = groupBy(termEntries, keysOf);
    for (const [name, posts] of groups) {
      pages += checkListByYear(
        `/${kind}/${encodeURIComponent(urlize(name))}/`,
        posts,
        `${kind} "${name}"`,
      );
    }
    log(`${kind}: ${groups.size} lists - checked`);
  }
  pages += checkListByYear("/video/", videos, "video year");
  log(`video: ${videoYears.size} years - checked`);

  // Nothing unpublished shows up, and every published post has its page.
  const publishedSlugs = new Set(published.map((p) => p.slug));
  for (const post of all) {
    const hasPage = Boolean(readPage(dist, `/posts/${post.slug}/`));
    if (publishedSlugs.has(post.slug) && !hasPage)
      fail(`${post.file}: published, but has no page`);
    if (!publishedSlugs.has(post.slug) && hasPage)
      fail(
        `${post.file}: ${post.draft ? "a draft" : "dated in the future"}, but has a page`,
      );
    const year = yearOf(post, offsetMinutes);
    if (!byYear.has(year) && readPage(dist, `/posts/${year}/`))
      fail(`/posts/${year}/ exists, but ${year} has no published post`);
  }
  // The same for the videos and their pages under /video/.
  const publishedVideoSlugs = new Set(videos.map((p) => p.slug));
  for (const video of allVideos) {
    const hasPage = Boolean(readPage(dist, `/video/${video.slug}/`));
    if (publishedVideoSlugs.has(video.slug) && !hasPage)
      fail(`${video.file}: published, but has no page`);
    if (!publishedVideoSlugs.has(video.slug) && hasPage)
      fail(
        `${video.file}: ${video.draft ? "a draft" : "dated in the future"}, but has a page`,
      );
    const year = yearOf(video, offsetMinutes);
    if (!videoYears.has(year) && readPage(dist, `/video/${year}/`))
      fail(`/video/${year}/ exists, but ${year} has no published video`);
  }

  return {
    failures,
    pages,
    pageSize,
    years: years.length,
    published: published.length,
    videos: videos.length,
  };
}

function report(
  { failures, pages, pageSize, years, published, videos },
  title,
) {
  console.log(
    `${title}: ${published} published posts in ${years} years and ${videos} published videos, ${pages} list pages walked, ${pageSize} to a page`,
  );
  if (failures.length === 0) {
    console.log("all checks passed");
    return true;
  }
  console.log(`${failures.length} failures:`);
  for (const message of failures.slice(0, 50)) console.log(`  - ${message}`);
  if (failures.length > 50)
    console.log(`  ... and ${failures.length - 50} more`);
  return false;
}

// The stress test moved on 2026-10-10 (T154) to scripts/stress-site.mjs: a throwaway database seeded with generated
// posts, this script run against it. The temporary project copy and the build it needed are gone.

// ---------------------------------------------------------------------------------------------

// Changed 2026-10-10 (T038, T154): the default run reads the running site; `--stress` is not an option of this script any
// more, the stress run is scripts/stress-site.mjs.
if (process.argv.includes("--stress")) {
  console.error(
    "Use npm run check:pages:stress: it seeds a throwaway database and runs this check against it (scripts/stress-site.mjs).",
  );
  process.exit(2);
}
const origin = (process.env.CHECK_ORIGIN ?? "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);
// Added 2026-10-10 (T154): CHECK_ROOT points at another folder holding src/content/{posts,video}, src/config.ts and
// src/lib/date.ts, which is how scripts/stress-site.mjs checks a database seeded with generated posts.
const root = process.env.CHECK_ROOT ?? projectRoot;
const passed = report(await checkOverHttp(root, origin, {}), origin);
process.exit(passed ? 0 : 1);
