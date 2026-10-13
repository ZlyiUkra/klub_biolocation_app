// What every list on the site shares, and nothing about any one kind of entry. Added
// 2026-09-22, when the owner asked for the posts and the videos to stay apart and only what is
// truly common to be shared (VIDEO-PAGE.md, section 4): the filter and the order every
// collection is read with, the cutting into pages, the split by year, the year switcher's rule,
// and the two plain shapes the shared components render - a card of a list and a previous/next
// link. Everything here takes plain data or a type parameter; src/lib/posts.ts and
// src/lib/video.ts know their own collection and build these shapes from it. Until that day the
// list helpers lived in src/lib/posts.ts, typed to posts, and the colleague's src/lib/video.ts
// held a copy of them typed to videos.
import { getCollection, type CollectionEntry } from "astro:content";
// formatYear was imported here for groupByYear(), which moved to src/lib/pagination.ts (T162).
// Added 2026-10-10 (T030): the sort of published() below is compareNewestFirst(), unchanged, so that the backend
// orders its lists with the same function.
import { compareNewestFirst } from "./entry-order";
// Added 2026-09-22 with collectTerms() at the foot of this file: a term needs its display name
// and its address segment, and both are plain string rules rather than knowledge of a collection.
import { titleize } from "./titleize";
import { urlize } from "./urlize";
import { site } from "../config";
// Added 2026-10-12 for Card.action (two interface languages).
import type { Phrase } from "../i18n/lang";

/**
 * What a list shows of an entry, whichever collection it comes from: rendered by
 * CardList.astro and by the tag route's own cards, built by postCard() in posts.ts and
 * videoCard() in video.ts.
 */
export type Card = {
  /** The entry's own page. */
  url: string;
  title: string;
  date: Date;
  /** Hugo's `.Summary | plainify | truncate 140`; empty when the body is. */
  summary: string;
  /** In front matter order, lower-cased by the collection schema. */
  tags: string[];
  /** The last line of the card: "Read more" on a post, "Watch the video" on a video. */
  // Changed 2026-10-12: a Phrase, both languages of the interface (src/i18n/lang.ts); it was a
  // string. lang.ts imports only the config, so this file stays safe for the browser.
  action: Phrase;
  /**
   * Added 2026-10-12 (T090): the viewer sees the card and not the content (the backend's `view` is `teaser`). The card
   * says so; false is the default.
   */
  locked?: boolean;
};

/** A previous or next link on an article page (PostNav.astro), built by postLink() and videoLink(). */
export type NavLink = { url: string; title: string };

// Hugo runs `hugo server -D`: drafts are visible in development and hidden in production.
// Every page must go through this helper so that no route forgets the filter.
//
// The order of every list on the site is decided here: newest first by `date`.
//
// Changed 2026-09-19: two tie-breaks after the date - the title, then the file name (`id`).
// Before, two posts with the same date and time kept whatever order the collection happened to
// return them in. With pagination that matters: such a pair on the boundary between two pages
// could swap pages from one build to the next. The title comes first because Hugo's default
// order also falls back to the title; the file name settles two posts with the same title as
// well, since no two posts can share one. `lastmod` plays no part. See PAGINATION.md.
//
// Changed 2026-09-19, the owner's decision: a post whose date is still in the future is left
// out as well, until that date, as Hugo does by default (`buildFuture = false`). Before, it was
// published at once and went to the top of its year. `npm run dev` still shows it, like a
// draft, so that it can be read before its day. The site is static, so "until that date"
// means until the first build after it. See PAGINATION.md, section 2.
//
// Was the body of getPosts() until 2026-09-22; getPosts() and getVideos() call it with their
// collection, so the rule is written once. scripts/check-pagination.mjs mirrors it.
export async function published<C extends "posts" | "video">(
  collection: C,
): Promise<CollectionEntry<C>[]> {
  const now = Date.now();
  const entries = await getCollection(
    collection,
    (e) =>
      import.meta.env.DEV || (!e.data.draft && e.data.date.getTime() <= now),
  );
  // Changed 2026-10-10 (T030): the comparator moved to src/lib/entry-order.ts; an entry's id is its file name,
  // which is its address.
  return entries.sort((a, b) =>
    compareNewestFirst(
      { date: a.data.date, title: a.data.title, slug: a.id },
      { date: b.data.date, title: b.data.title, slug: b.id },
    ),
  );
}

// Moved 2026-10-10 (T162) to src/lib/pagination.ts, a module with no Astro imports, so that the backend cuts the
// lists with the same code: the page numbers and addresses, the year switcher's rule, the cutting by page and by year,
// and the split of a list into years. Re-exported unchanged; the comments of those functions went with them.
export {
  groupByYear,
  pageNumbers,
  pageParam,
  pageUrl,
  paginateByYear,
  paginateList,
  yearLinks,
  yearSwitcher,
} from "./pagination";
export type {
  Dated,
  ListPage,
  PageNumber,
  YearEntry,
  YearGroup,
  YearLink,
  YearListPage,
} from "./pagination";

/** Which taxonomy a term belongs to. Both collections declare both in their front matter. */
export type TermKind = "tags" | "categories";

/**
 * A tag or a category with the entries that carry it, as cards.
 *
 * Cards and not entries, and that is the point of the shape: a term page renders posts and
 * videos through the same component and cannot tell which collection a line came from.
 */
export type Term = {
  /** The name as the front matter writes it, lower-cased by the schema. Hugo sorts on this. */
  name: string;
  /** The display name, title-cased the way Hugo cases a taxonomy term (lib/titleize.ts). */
  title: string;
  /** The address segment, from urlize(). */
  slug: string;
  /** The entries under the term, newest first. */
  cards: Card[];
};

/**
 * What the search index holds of an entry, built by postSearch() and videoSearch() in the two
 * collection files. Added 2026-09-22 with the facets on /search/: the index needs an entry's
 * categories, which a Card does not carry because no card prints them, and its whole text, which
 * a Card carries only as a truncated summary. Rather than widen Card - a list would gain two
 * fields nothing renders - the search has a shape of its own, on the same terms as every other
 * shape here: plain data, built by each collection for itself.
 */
export type SearchSource = {
  card: Card;
  categories: string[];
  /** The body as plain text; the endpoint is what strips the Markdown. */
  text: string;
};

/** One entry as the term builder sees it: the names it declares, and the card that renders it. */
export type TermSource = { names: string[]; card: Card };

// Moved here from getTerms() in src/lib/posts.ts on 2026-09-22, and widened while it moved. The
// original text of that function's comment, because it is still what this does:
//
//   Tags or categories with their posts, sorted by the front-matter name. That is Hugo's
//   `.Data.Terms.Alphabetical`, which orders by the term key, not by the title-cased label - so
//   "blog" before "education" is decided on the lower-case names, and `title` is only for
//   display. Posts inside a term keep getPosts' order (newest first), as Hugo's term pages do.
//
// What changed: it took posts and returned posts, so /tags/video/ was built by nobody (no post
// carries that tag, ten videos do) and /tags/биолокация/ listed articles only, although videos
// carry it too. The reviewer found the 404; the half-empty page is the quieter side of the same
// fault. This version takes the flat shape above, so src/lib/terms.ts can hand it both
// collections and neither collection has to know about the other (REVIEW-VIDEO.md, remarks 2
// and 3).
//
// The sort inside a term is explicit now. The old one relied on the input already being in
// site order, which two merged lists are not. Sorting on the date alone keeps JavaScript's
// stable sort deciding the ties, so entries dated the same day keep the order they arrived in -
// posts before videos, both newest first.
//
// push, not `[...(byName.get(name) ?? []), card]`: the old line rebuilt the array of a term
// once per entry that carried it, which was on the list of things to tidy up.
/**
 * The word a tag or a category is printed by: the override in `site.termLabels` if there is one,
 * otherwise the front-matter name title-cased the way Hugo cases a taxonomy term.
 *
 * Added 2026-09-22, at the owner's request for a way to change what a tag is called without
 * touching the entries that carry it. It is one function and not a rule spelled out at each call
 * site, because the label is printed in four places - the cloud on the home page, the Tags and
 * Categories pages, the heading of a term page and the filter list on /search/ - and a term that
 * reads one way on one of them and another way on the next is worse than no override at all.
 *
 * What it deliberately does not touch: the address, which comes from urlize() over the same name,
 * and the value the search filters match on, which is the name itself. So an override is safe to
 * add, change or remove at any time - no link and no bookmark depends on it.
 *
 * The lookup lower-cases, because the schema lower-cases every tag but leaves a category as
 * written, and one rule for both is easier to explain than two.
 */
export function termLabel(name: string): string {
  const labels: Readonly<Record<string, string>> = site.termLabels;
  return labels[name.toLowerCase()] ?? titleize(name);
}

export function collectTerms(sources: TermSource[]): Term[] {
  const byName = new Map<string, Card[]>();
  for (const { names, card } of sources) {
    for (const name of names) {
      const cards = byName.get(name);
      if (cards) cards.push(card);
      else byName.set(name, [card]);
    }
  }
  return [...byName]
    .map(([name, cards]) => ({
      name,
      // Changed 2026-09-22: titleize(name) until then, and it is still what termLabel() falls
      // back to. The indirection is what lets a term be renamed for the reader in one place.
      title: termLabel(name),
      slug: urlize(name),
      cards: cards.sort((a, b) => b.date.getTime() - a.date.getTime()),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
