// The rules of cutting a list into pages and years, and nothing else: how many entries a page holds, which page
// numbers and which years are shown, the addresses of the pages, the split by year. Added 2026-10-10 (T162 of
// specs/001-self-hosted-club-site). These functions were in src/lib/lists.ts, next to the Astro-only helpers; they
// moved here unchanged because the backend cuts the lists now (GET /api/list, server/src/content/api.ts) and has to
// use the very same rules the site renders with. The module imports nothing from Astro (server/test/shared.test.ts
// checks it), and src/lib/lists.ts re-exports every name, so no caller changed.
//
// The three numbers of the owner's pagination rules live here (they were `pagination` in src/config.ts, which now
// takes them from this file): src/config.ts cannot be compiled by the backend, it reads `import.meta.env`.
// scripts/check-pagination.mjs reads the values from this file.
import { formatYear } from "./date.js";

/**
 * The owner's pagination rules (2026-09-19). pageSize: how many entries one page of a list shows (Hugo's default is
 * 10, the owner chose 5). everyNumberUpTo: a list of at most this many pages shows every page number, a longer one
 * only the first, the current and the last. everyYearUpTo: the same for the year switcher.
 */
export const paginationRules = {
  pageSize: 5,
  everyNumberUpTo: 5,
  everyYearUpTo: 5,
} as const;

/** What a list needs of an item to split it by year: its date. A Card has one. */
export type Dated = { date: Date };

// Added 2026-09-19, for the pagination the owner asked for. The lists are split into pages of
// `paginationRules.pageSize` entries, with Previous and Next links that move a whole page at a
// time, and every list is split by year first: /posts/<year>/ holds only that year's posts,
// and its Previous and Next never leave the year. See PAGINATION.md.

/** One page of a paginated list. */
export type ListPage<T> = {
  /** The entries shown on this page. */
  items: T[];
  /** 1-based. */
  number: number;
  /** The number of the last page; 1 when the list fits on one page. */
  last: number;
  /** Addresses of the neighbouring pages; undefined on the first and on the last page. */
  prevUrl: string | undefined;
  nextUrl: string | undefined;
  /** The numbered page links shown between Previous and Next; see pageNumbers(). */
  numbers: PageNumber[];
  // `numbersCompact`, a second set with a narrower window for screens below 640px, was removed
  // later on 2026-09-19 with the owner's new rule for the numbers: five entries at most, which
  // fit at every width, so one set is enough. See pageNumbers().
};

/** One entry of the numbered page links: a page, or a gap drawn as an ellipsis. */
export type PageNumber =
  | { kind: "page"; number: number; url: string; current: boolean }
  | { kind: "gap" };

// Added 2026-09-19, asked for by the owner: numbered page links between Previous and Next, so
// that a list with many pages does not take one click per page. The theme has no such block;
// see PAGINATION.md, section 6.
//
// The rule is the owner's, set later the same day, and replaced a sliding window (the first and
// the last page plus two pages either side of the current one, at most nine entries, with a
// second set of one page either side for screens below 640px, where nine did not fit in a row):
//   - a list of at most `pagination.everyNumberUpTo` pages shows every number: "1 2 3 4 5";
//   - a longer one shows only the first, the current and the last page, and every run of
//     skipped pages is one gap drawn as an ellipsis: "1 ... 7 ... 20", "1 2 ... 20" on the
//     second page, "1 ... 20" on the first and on the last. A gap is a gap even when it hides a
//     single page, because only the first and the last page are meant to be links there; the
//     current page is never a link.
// Five entries at most either way, which fit at every width, so the second set went with the
// window. The rendering is Pagination.astro; scripts/check-pagination.mjs mirrors this rule.
export function pageNumbers(
  current: number,
  last: number,
  base: string,
): PageNumber[] {
  const shown =
    last <= paginationRules.everyNumberUpTo
      ? Array.from({ length: last }, (_, i) => i + 1)
      : [...new Set([1, current, last])];
  const page = (n: number): PageNumber => ({
    kind: "page",
    number: n,
    url: pageUrl(base, n),
    current: n === current,
  });
  const entries: PageNumber[] = [];
  let previous = 0;
  for (const n of shown) {
    if (n - previous > 1) entries.push({ kind: "gap" });
    entries.push(page(n));
    previous = n;
  }
  return entries;
}

// The address of page `n` of the list whose own address is `base` ("/posts/2025/", or a tag or
// category page with its slug already encoded): `base` itself for page 1, `<base>page/<n>/`
// after it. That is the shape Hugo uses for its paginated lists.
export function pageUrl(base: string, n: number): string {
  return n === 1 ? base : `${base}page/${n}/`;
}

// The value of the `[...page]` route parameter that produces page `n` under `prefix` (the year,
// for the Posts list; nothing for a tag or a category, whose route already has the slug). A
// rest parameter may be undefined, which renders the route at its own address, and may contain
// slashes, which is how one route file serves /posts/, /posts/2025/ and /posts/2025/page/2/.
export function pageParam(n: number, prefix?: string): string | undefined {
  const parts = [prefix, n === 1 ? undefined : `page/${n}`].filter(Boolean);
  return parts.length > 0 ? parts.join("/") : undefined;
}

// Added 2026-10-10 (T162): the number of pages of `total` entries, 1 when there are none. The backend cuts one page
// out of a year's entries with this and the site's list pages are cut with paginateList() below, so the two cannot
// disagree on how many pages a year has.
export function pageCount(
  total: number,
  pageSize: number = paginationRules.pageSize,
): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

// Splits `items`, already in display order, into pages. An empty list still gets one page, so
// a list route always renders at its own address.
export function paginateList<T>(
  items: T[],
  base: string,
  pageSize: number = paginationRules.pageSize,
): ListPage<T>[] {
  // Changed 2026-10-10 (T162): the count is pageCount(), the one home of it.
  const last = pageCount(items.length, pageSize);
  return Array.from({ length: last }, (_, index) => {
    const number = index + 1;
    return {
      items: items.slice(index * pageSize, number * pageSize),
      number,
      last,
      prevUrl: number > 1 ? pageUrl(base, number - 1) : undefined,
      nextUrl: number < last ? pageUrl(base, number + 1) : undefined,
      // One set since later on 2026-09-19; see the note in ListPage.
      numbers: pageNumbers(number, last, base),
    };
  });
}

/** A link of the year switcher above a list. */
export type YearLink = { year: string; url: string };

// Added 2026-09-19, asked for by the owner: the year switcher above the Posts list. Every year
// that has entries links to the first page of that year under `base`, "/posts/2025/" or
// "/tags/hugo/2025/". The groups come from groupByYear(), so the years are newest first.
// `base` was added the same evening, when every list got years; it used to be "/posts/".
export function yearLinks(
  groups: YearGroup<unknown>[],
  base: string,
): YearLink[] {
  return groups.map((group) => ({
    year: group.year,
    url: `${base}${group.year}/`,
  }));
}

/** One page of a list split by year, in the shape getStaticPaths needs; see paginateByYear(). */
export type YearListPage<T> = {
  /** The `[...page]` parameter: "2025", "2025/page/2", or undefined for the list's own address. */
  param: string | undefined;
  page: ListPage<T>;
  years: YearLink[];
  /** The year shown, e.g. "2025"; undefined only on the own address of a list with no entries. */
  year: string | undefined;
};

// Added 2026-09-19 evening, asked for by the owner: one way of splitting a list by year for
// every list route - /posts/, /tags/<tag>/, /categories/<category>/ and, since 2026-09-22,
// /video/. Until then only /posts/ was split, and its route held this code. `base` is the
// list's own address with the slug already encoded, "/tags/hugo/". The result: every year with
// entries, newest first, cut into pages under `<base><year>/` (page 1 there, page n at
// `<base><year>/page/<n>/`), and `base` itself, which shows the newest year's first page so
// that a link to the list always leads somewhere - with no entries at all, one empty page.
// Every year keeps its own addresses, so they do not change when a new year begins.
// ListByYear.astro renders one of these pages with the navigation of both levels. To undo the
// split of the tag and category lists, revert the commit that added this function; the Posts
// route worked the same way before it.
//
// Generic: the items are whatever the route renders - the cards of a list, built from posts
// or from videos - and nothing in here reads more of them than the date.
export function paginateByYear<T extends Dated>(
  items: T[],
  base: string,
): YearListPage<T>[] {
  const groups = groupByYear(items);
  const years = yearLinks(groups, base);
  const pages = groups.flatMap((group) =>
    paginateList(group.items, `${base}${group.year}/`).map((page) => ({
      param: pageParam(page.number, group.year),
      page,
      years,
      year: group.year,
    })),
  );
  const newest = pages.at(0);
  const own: YearListPage<T> = newest
    ? { ...newest, param: undefined }
    : {
        param: undefined,
        // paginateList() always returns one page, even for no items; the assertion is for the backend's stricter
        // compiler (T162), which cannot see that.
        page: paginateList<T>([], base)[0] as ListPage<T>,
        years,
        year: undefined,
      };
  return [own, ...pages];
}

/** One entry of the year switcher: a year, or a gap drawn as an ellipsis. */
export type YearEntry =
  | { kind: "year"; year: string; url: string; current: boolean }
  | { kind: "gap" };

// Added later on 2026-09-19, when the owner asked for the year switcher to be a component of
// its own (YearSwitcher.astro) with its own rule, separate from the page numbers. Which years
// are shown: every year while there are at most `pagination.everyYearUpTo` of them; beyond
// that the newest, the oldest, and the year being shown with the year either side of it, and a
// run of hidden years is one gap drawn as an ellipsis: "2026 ... 2023 2022 2021 ... 2015". The
// neighbours stay, unlike on the page numbers, because a reader browsing by year moves to the
// year next door far more often than to the first page of a long list; the owner left that
// detail to this side, and it is one line to change. Every year shown is a link, the current
// one included - it leads back to the first page of its year. `years` are newest first, as
// yearLinks() builds them, and adjacency is in that list: 2026 sits next to 2024 when 2025 has
// no entries. scripts/check-pagination.mjs mirrors this rule.
export function yearSwitcher(
  years: YearLink[],
  currentYear: string,
): YearEntry[] {
  const current = years.findIndex((link) => link.year === currentYear);
  const shown =
    years.length <= paginationRules.everyYearUpTo
      ? years.map((_, index) => index)
      : [...new Set([0, current - 1, current, current + 1, years.length - 1])]
          .filter((index) => index >= 0 && index < years.length)
          .sort((a, b) => a - b);
  const entries: YearEntry[] = [];
  let previous = -1;
  for (const index of shown) {
    const link = years[index];
    // Added 2026-10-10 (T162): every index in `shown` is within the list; the guard satisfies the backend's compiler.
    if (!link) continue;
    if (index - previous > 1) entries.push({ kind: "gap" });
    entries.push({
      kind: "year",
      year: link.year,
      url: link.url,
      current: link.year === currentYear,
    });
    previous = index;
  }
  return entries;
}

/** The entries of one year, in display order. */
export type YearGroup<T> = { year: string; items: T[] };

// Hugo's `.Pages.GroupByDate "2006"` followed by `.Pages.ByDate.Reverse` inside each group:
// years newest first, and entries newest first within a year. The input is expected to come
// from published() (or a filtered subset of it, or the cards built from one), which is already
// sorted newest first, so the groups come out in the right order without a second sort.
export function groupByYear<T extends Dated>(items: T[]): YearGroup<T>[] {
  const groups: YearGroup<T>[] = [];
  for (const item of items) {
    const year = formatYear(item.date);
    const last = groups[groups.length - 1];
    if (last && last.year === year) last.items.push(item);
    else groups.push({ year, items: [item] });
  }
  return groups;
}
