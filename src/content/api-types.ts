// The shapes of the backend's content read API as they travel in JSON (T031 of specs/001-self-hosted-club-site;
// contracts/http-api.md, "Content read").
//
// One home for them: the backend (server/src/content/api.ts) builds its answers typed with these, and the site's
// client (src/lib/api-client.ts) reads them typed with the same ones, so a field renamed on one side fails to compile on
// the other. The module imports nothing, which is what lets both programs load it (server/test/shared.test.ts).
//
// Every date is an ISO 8601 string in UTC, because JSON has no date; the caller makes a Date of it. An entry is
// addressed by its slug and never by an address: only `postUrl()` and `videoUrl()` know a page address.

export type ApiCard = {
  /** Added 2026-10-10 (T162): a list that merges posts and videos has to tell the two apart to build an address. */
  kind: "post" | "video";
  slug: string;
  title: string;
  description: string;
  date: string;
  summary: string;
  tags: string[];
  categories: string[];
  /** `teaser` when the viewer sees the card but not the content. */
  view: "full" | "teaser";
};

export type ApiPostContent = {
  kind: "post";
  html: string;
  headings: { depth: number; slug: string; text: string }[];
  lastmod: string | null;
  shareTitle: string | null;
  shareDescription: string | null;
  /** The reading time in minutes. */
  readingMinutes: number;
};

export type ApiVideoContent = {
  kind: "video";
  descriptionHtml: string;
  /** Headings of the public text, for the table of contents. */
  headings: { depth: number; slug: string; text: string }[];
  /** The text for members, in its own column; null unless the viewer sees the entry in full. */
  membersOnlyHtml: string | null;
  /**
   * Added 2026-10-11 (T081): true when the block is sent to a viewer who may not play the video (the "hidden" setting),
   * so the page keeps it hidden until the player appears; false for a viewer who may play it, and when there is no block.
   */
  membersOnlyHidden: boolean;
  // Changed 2026-10-10 (T160): null for a paid lecture, whose provider is part of its secret source.
  platform: string | null;
  /** The embed id of a public video; always null for a paid lecture. */
  externalId: string | null;
  paid: boolean;
  duration: string | null;
  /**
   * Added 2026-10-11 (T152): what the backend's `lecture_view` says about this viewer and this video: `open`, `guest`,
   * `no_access`, `blocked` or `expired`. The page only shows what it is told.
   */
  lecture: "open" | "guest" | "no_access" | "blocked" | "expired";
  /** The last UTC day (`YYYY-MM-DD`) the video is available on the site. */
  availableUntil: string;
};

/** One entry; `content` is null for a teaser. */
export type ApiEntry = ApiCard & {
  content: ApiPostContent | ApiVideoContent | null;
};

export type ApiNeighbour = { slug: string; title: string } | null;

/** `next` is the newer neighbour in the viewer's own list, `prev` the older one (the site's names for them). */
/**
 * One page of a list, cut by the backend (T162; GET /api/list). `year` is the calendar year shown, or null when the
 * viewer sees no entries at all; `years` are every year with entries under the same narrowing, newest first, with the
 * number of entries each holds. `last` is the number of the last page of that year, 1 when the year fits on one page.
 */
export type ApiListPage = {
  items: ApiCard[];
  year: string | null;
  page: number;
  last: number;
  years: { year: string; count: number }[];
};

export type ApiEntryAnswer = {
  entry: ApiEntry;
  next: ApiNeighbour;
  prev: ApiNeighbour;
};

export type ApiTerm = {
  kind: "tag" | "category";
  name: string;
  count: number;
};

// ApiSearchItem (the whole index entry for the browser) was removed 2026-10-10 with the index (T163).

/** One result of the server search (T163). The site turns kind and slug into an address and a section label. */
export type ApiSearchResult = {
  kind: "post" | "video";
  slug: string;
  title: string;
  /** ISO date of publication. */
  date: string;
  /** A window of the body around the first match, or the card's summary when the match is elsewhere. */
  snippet: string;
  /** The entry's tags that the query matched; empty when the match was in the title or the text. */
  tags: string[];
};

/**
 * The answer of GET /api/search. `total` is how many entries the words of the query matched (before any facet),
 * `shown` how many remain after the facets, `results` the first of those (capped by the backend). `counts` are the
 * facet counts over the `total` hits; the keys of `section` are kinds.
 */
export type ApiSearchAnswer = {
  total: number;
  shown: number;
  counts: {
    section: Record<string, number>;
    category: Record<string, number>;
    tag: Record<string, number>;
  };
  results: ApiSearchResult[];
};
