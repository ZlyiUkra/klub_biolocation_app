// The site's tags and categories, over every collection that has them. Added 2026-09-22.
//
// Until this file existed, term pages were built by getTerms() in lib/posts.ts, which walked the
// posts and nothing else. The reviewer found the visible half of what that costs: every video
// declares `tags: ["video", ...]` and prints those tags as links, and /tags/video/ was built by
// nobody, so the link was a 404. The quieter half is worse, because it looks like it works -
// /tags/биолокация/ does exist, built from the posts that carry it, and a visitor arriving from a
// video finds a page without a single video on it. Same for the categories: all ten videos
// declare one, and the Categories page listed the two the posts use. REVIEW-VIDEO.md, remarks 2
// and 3, has the measurements and the options that were weighed.
//
// This is the one place that says the site's terms span both collections. It is deliberately the
// only file in lib/ that imports from both, and it does the one thing that requires knowing both:
// it concatenates what each of them hands out. It does not read an entry, it does not know what a
// post or a video is, and there is no branch on where a card came from - collectTerms() in
// lists.ts receives flat data and returns flat data. That keeps the owner's rule of 2026-09-22
// intact (VIDEO-PAGE.md, section 4): posts and videos share code only on plain data, and a third
// kind of entry would be one more line here.
//
// The four routes that render terms - the two indexes and the two paginated term pages - call
// this and nothing else, so what a term contains is decided once rather than four times.
// Changed 2026-10-10 (T139 of specs/001-self-hosted-club-site): the terms are built from what the backend sends, which
// is what the viewer may see, so a hidden entry's tag cannot appear. The collection-shaped postTerms() and
// videoTerms() stay in their files for the routes not yet converted (T034) and go with them.
import { listPosts, listVideos, type RequestContext } from "./api-client";
import { collectTerms, type Term, type TermKind } from "./lists";
import { apiPostCard } from "./posts";
import { apiVideoCard } from "./video";

/**
 * Every tag or category on the site with the entries that carry it, terms sorted by their
 * front-matter name and the entries inside each newest first.
 */
// Changed 2026-10-10 (T139): two calls to the backend, one per collection, run together; a term page needs the cards
// of both and the count endpoint carries no cards. The terms of the front matter are `tags` and `categories`; the
// API's cards carry them under those names.
export async function getTerms(
  kind: TermKind,
  context: RequestContext = {},
): Promise<Term[]> {
  const [posts, videos] = await Promise.all([
    listPosts({}, context),
    listVideos({}, context),
  ]);
  return collectTerms([
    ...posts.map((card) => ({ names: card[kind], card: apiPostCard(card) })),
    ...videos.map((card) => ({ names: card[kind], card: apiVideoCard(card) })),
  ]);
}

// Added 2026-10-10 (T162): the pages of a list come from the backend one at a time, cut by year and by page there.
// What stays here is what needs to know both collections: the address and the last line of a card depend on whether
// it is a post or a video, and a tag or category page merges the two.
import {
  getListPage,
  listTerms,
  type ApiCard,
  type ListPageQuery,
} from "./api-client";
import {
  pageNumbers,
  pageUrl,
  type ListPage,
  type YearLink,
} from "./pagination";
import { urlize } from "./urlize";
import { termLabel, type Card } from "./lists";

/** A card of whichever collection the API says it belongs to. */
export function apiCardOf(card: ApiCard): Card {
  return card.kind === "video" ? apiVideoCard(card) : apiPostCard(card);
}

// The `[...page]` parameter of a list route is "2025", "2025/page/2" or absent. Anything else, including a page 1
// spelled out ("2025/page/1", which is the year's own address) and a number with a leading zero, is not an address of
// this site: the list 404s, as the routes did when they looked the parameter up among the pages they had built.
function parseListParam(
  param: string | undefined,
): { year?: number; page: number } | null {
  if (param === undefined) return { page: 1 };
  // The slashes are written as a character class: the pattern is "digits, then optionally /page/<2 or more>".
  const match =
    /^([1-9][0-9]{0,4})(?:[/]page[/]([2-9]|[1-9][0-9]{1,4}))?$/.exec(param);
  if (match === null) return null;
  return { year: Number(match[1]), page: match[2] ? Number(match[2]) : 1 };
}

/** One page of a list as the list components take it; the shape of an entry of paginateByYear(). */
export type ListRoutePage = {
  page: ListPage<Card>;
  years: YearLink[];
  /** The year shown; undefined only on the own address of a list with no entries. */
  year: string | undefined;
};

/**
 * The page of a list that a list route shows, or undefined when the address is not one (the route answers 404).
 * `base` is the list's own address with the slug already encoded, "/posts/" or "/tags/hugo/"; `param` is the route's
 * rest parameter after the year-alias adjustment of src/middleware.ts.
 */
export async function getListRoute(
  query: Pick<ListPageQuery, "kind" | "tag" | "category">,
  base: string,
  param: string | undefined,
  context: RequestContext = {},
): Promise<ListRoutePage | undefined> {
  const asked = parseListParam(param);
  if (asked === null) return undefined;
  const answer = await getListPage({ ...query, ...asked }, context);
  if (answer === null) return undefined;
  const own = answer.year === null ? base : `${base}${answer.year}/`;
  return {
    page: {
      items: answer.items.map(apiCardOf),
      number: answer.page,
      last: answer.last,
      prevUrl: answer.page > 1 ? pageUrl(own, answer.page - 1) : undefined,
      nextUrl:
        answer.page < answer.last ? pageUrl(own, answer.page + 1) : undefined,
      numbers: pageNumbers(answer.page, answer.last, own),
    },
    years: answer.years.map((y) => ({
      year: y.year,
      url: `${base}${y.year}/`,
    })),
    year: answer.year ?? undefined,
  };
}

/**
 * Every tag or category the viewer may see with its number of entries, sorted by name, as getTerms() sorts them. For
 * the pages that show a term and its count and nothing else: the tag cloud, the Tags page and the search facets.
 */
export async function getTermCounts(
  kind: TermKind,
  context: RequestContext = {},
): Promise<TermPage[]> {
  const wanted = kind === "tags" ? "tag" : "category";
  return (await listTerms(context))
    .filter((term) => term.kind === wanted)
    .map((term) => ({
      name: term.name,
      title: termLabel(term.name),
      slug: urlize(term.name),
      count: term.count,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** A tag or a category found by its address segment, with how many entries the viewer may see under it. */
export type TermPage = {
  name: string;
  title: string;
  slug: string;
  count: number;
};

/**
 * The tag or category whose address segment is `slug`, or undefined. Counts come from the backend's one grouped answer,
 * not from the cards of every entry. When two names share an address the first by name wins, as it did when the terms
 * were collected here and sorted by name.
 */
export async function getTermBySlug(
  kind: TermKind,
  slug: string | undefined,
  context: RequestContext = {},
): Promise<TermPage | undefined> {
  if (slug === undefined) return undefined;
  const wanted = kind === "tags" ? "tag" : "category";
  const found = (await listTerms(context))
    .filter((term) => term.kind === wanted && urlize(term.name) === slug)
    .sort((a, b) => a.name.localeCompare(b.name))[0];
  if (found === undefined) return undefined;
  return {
    name: found.name,
    title: termLabel(found.name),
    slug,
    count: found.count,
  };
}
