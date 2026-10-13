// The read API of the content (task T030 of specs/001-self-hosted-club-site; contracts/http-api.md, "Content read").
//
// Every route here is a thin shape over the access module (server/src/access/entries.ts): it asks for what the
// viewer may see and sends it as JSON. It decides nothing about visibility itself, so a page, a feed and the search
// index cannot disagree about who sees what, and an entry the viewer may not see is a 404 indistinguishable from a
// missing one.
//
// Decisions that would otherwise look like mistakes:
// - Lists are not cut into pages here. The cutting by year and by page is the site's own rule (src/lib/lists.ts,
//   `paginateByYear` and friends), already used by every list route, and a second implementation on this side would be
//   a second home for it. A list answers with all the cards the viewer may see, newest first, optionally narrowed by
//   `tag` or `category`; the page cuts it. At 24 posts and 21 videos this is a few kilobytes. contracts/http-api.md
//   was changed to say so.
// - Changed 2026-10-10 (T162): `/list` cuts a list by year and by page, in the database and with the rules of the
//   shared module src/lib/pagination.ts, so a page of the site never receives the library to throw most of it away.
//   The paragraph above describes `/posts` and `/videos`, which stay whole: the feeds and the sitemap need every
//   address.
// - An entry is addressed by its slug, never by an address: only `postUrl()` and `videoUrl()` know the shape of a page
//   address, so the API sends slugs and the site builds the links.
// - Dates are ISO strings in UTC. A card's date is `date` to keep the site's own name for it.
// - Responses are `no-store`: the caller is the site's own page renderer on the loopback interface, and the viewer
//   will differ per request once sessions exist.
// - The guest search index is kept in memory and rebuilt only when `contentVersion` changes. The version is derived
//   from the data, so nothing that writes content has to remember to bump a counter.
// - Until sessions existed (plan phase 2) every request was a guest. Since 2026-10-11 (T052) `viewerOf` reads the session
//   cookie the site forwards (src/lib/api-client.ts passes the request's Cookie header on); a request without one is
//   still a guest, and the guest caches below are used only for that viewer.

import { Router, type Request } from "express";
import {
  contentVersion,
  getEntry,
  listEntries,
  listEntriesFor,
  listTerms,
  listYears,
  neighboursOf,
  searchIndex,
  type EntryDetail,
  type EntryKind,
  type EntryListItem,
  type SearchItem,
  type Viewer,
} from "../access/entries.js";
import type { Pool } from "../db/pool.js";
// Added 2026-10-11 (T052): who is asking, from the session cookie.
import { viewerOfRequest } from "../auth/viewer.js";
// Added 2026-10-10 (T031): the wire shapes live in the site's src/content/api-types.ts so that the site's client and
// this file are typed by the same definitions.
import type {
  ApiCard,
  ApiEntry,
  ApiListPage,
  ApiNeighbour,
} from "../../../src/content/api-types.js";
import { HttpError } from "../http/errors.js";
// Added 2026-10-10 (T162): the size of a page and the number of pages are the shared rule.
import { pageCount, paginationRules } from "../../../src/lib/pagination.js";
// Added 2026-10-10 (T163): the search runs here, with the rules of src/lib/search-rules.ts.
import { buildSearcher, runSearch, type Searcher } from "./search.js";

// Changed 2026-10-10 (T033): the guest is made by the shared module, the one definition of a viewer.
// Removed 2026-10-11 (T052): the `guest` constant that stood here is unused now; the viewer comes from the session cookie.

// Changed 2026-10-11 (T052): the viewer is read from the session cookie by server/src/auth/viewer.ts, the one place
// that turns a cookie into a viewer. It needs the pool, so `viewerOf` moved inside `contentRouter`; the comment that
// stood here said "always a guest until sessions exist", and they exist now.

// Changed 2026-10-10 (T031): the local `Card` type moved to src/content/api-types.ts as `ApiCard`.
type Card = ApiCard;

const card = (item: EntryListItem): Card => ({
  kind: item.kind,
  slug: item.slug,
  title: item.title,
  description: item.description,
  date: item.publishedAt.toISOString(),
  summary: item.summary,
  tags: item.tags,
  categories: item.categories,
  view: item.view,
});

type Neighbour = ApiNeighbour;

// The list is newest first: the entry before it in the list is newer, the one after is older. The site's pages call
// them `next` and `prev` in that order (src/pages/posts/[slug].astro).
function neighbours(list: EntryListItem[], slug: string) {
  const at = list.findIndex((item) => item.slug === slug);
  const pick = (item: EntryListItem | undefined): Neighbour =>
    item ? { slug: item.slug, title: item.title } : null;
  return {
    next: pick(at > 0 ? list[at - 1] : undefined),
    prev: pick(at >= 0 ? list[at + 1] : undefined),
  };
}

function detail(entry: EntryDetail): ApiEntry {
  const base = card(entry);
  const content = entry.content;
  if (content === null) return { ...base, content: null };
  if (content.kind === "post") {
    return {
      ...base,
      content: {
        kind: "post",
        html: content.html,
        headings: content.headings,
        lastmod: content.lastmod?.toISOString() ?? null,
        shareTitle: content.shareTitle,
        shareDescription: content.shareDescription,
        readingMinutes: content.readingMinutes,
      },
    };
  }
  return { ...base, content };
}

function term(req: Request, name: "tag" | "category"): string | undefined {
  const value = req.query[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value === "" || value.length > 60) {
    throw new HttpError(
      400,
      "invalid_input",
      `${name} must be one short text.`,
    );
  }
  return value;
}

// A positive whole number from the query string, or undefined when it is absent (T162).
function whole(req: Request, name: "year" | "page"): number | undefined {
  const value = req.query[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^[0-9]{1,5}$/.test(value)) {
    throw new HttpError(400, "invalid_input", `${name} must be a number.`);
  }
  const number = Number(value);
  if (number < 1) {
    throw new HttpError(400, "invalid_input", `${name} must be a number.`);
  }
  return number;
}

// Added 2026-10-10 (T162): answers that only the guest shares are kept until the content changes, as the guest search
// index is. The years of a list and the counts of the terms are what every list page asks for first, and each costs a
// pass of the visibility function over the whole library (42 ms at 10 000 entries, measured in T161); a guest's answer
// is the same for every guest, so one pass serves all of them until `contentVersion` moves. A signed-in viewer's answer
// is never kept: it depends on who is asking. The key is made of at most three short texts, and the table is emptied
// when it passes a few hundred, so a stream of made-up tag names cannot grow it without bound.
function guestAnswers<T>(pool: Pool) {
  let version = "";
  const kept = new Map<string, T>();
  return async (
    viewer: Viewer,
    key: string,
    make: () => Promise<T>,
  ): Promise<T> => {
    if (viewer.userId !== null || viewer.status !== "guest") return make();
    const now = await contentVersion(pool);
    if (now !== version || kept.size > 500) {
      kept.clear();
      version = now;
    }
    const found = kept.get(key);
    if (found !== undefined) return found;
    const made = await make();
    kept.set(key, made);
    return made;
  };
}

export function contentRouter(pool: Pool): Router {
  const router = Router();
  const viewerOf = (req: Request): Promise<Viewer> =>
    viewerOfRequest(pool, req);
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  const yearsOf = guestAnswers<{ year: number; count: number }[]>(pool);
  const termsOf = guestAnswers<Awaited<ReturnType<typeof listTerms>>>(pool);

  const kinds: [string, EntryKind][] = [
    ["posts", "post"],
    ["videos", "video"],
  ];
  for (const [path, kind] of kinds) {
    router.get(`/${path}`, async (req, res) => {
      const tag = term(req, "tag");
      const category = term(req, "category");
      const items = (await listEntries(pool, await viewerOf(req), kind)).filter(
        (item) =>
          (tag === undefined || item.tags.includes(tag)) &&
          (category === undefined || item.categories.includes(category)),
      );
      res.json({ items: items.map(card) });
    });

    router.get(`/${path}/:slug`, async (req, res) => {
      const viewer = await viewerOf(req);
      const slug = String(req.params["slug"]);
      const entry = await getEntry(pool, viewer, kind, slug);
      if (entry === null) {
        throw new HttpError(404, "not_found", "No such entry.");
      }
      // Neighbours come from the viewer's own visible list, so they never point at an entry that viewer cannot see.
      // Changed 2026-10-10 (T162): found with a few small reads around the entry's date, not by reading the whole list.
      const around = await neighboursOf(pool, viewer, kind, slug);
      const pick = (item: EntryListItem | null): Neighbour =>
        item ? { slug: item.slug, title: item.title } : null;
      res.json({
        entry: detail(entry),
        next: pick(around.next),
        prev: pick(around.prev),
      });
    });
  }

  // One page of a list (T162). `kind` is post, video or both (the default), `tag` and `category` narrow it, `year`
  // picks a calendar year (the newest year with entries when absent) and `page` a page of that year. A year with no
  // entries or a page past the last one is a 404, as the site's own list routes were; no entries at all answers one
  // empty page, because a list address must always lead somewhere.
  router.get("/list", async (req, res) => {
    const viewer = await viewerOf(req);
    const kind = req.query["kind"];
    if (
      kind !== undefined &&
      kind !== "post" &&
      kind !== "video" &&
      kind !== "both"
    ) {
      throw new HttpError(
        400,
        "invalid_input",
        "kind must be post, video or both.",
      );
    }
    const only: EntryKind | undefined =
      kind === "post" || kind === "video" ? kind : undefined;
    const tag = term(req, "tag");
    const category = term(req, "category");
    // Absent keys are left out, not set to undefined, so the narrowing reads as what the caller asked for.
    const narrow: { kind?: EntryKind; tag?: string; category?: string } = {
      ...(only !== undefined ? { kind: only } : {}),
      ...(tag !== undefined ? { tag } : {}),
      ...(category !== undefined ? { category } : {}),
    };
    const askedYear = whole(req, "year");
    const page = whole(req, "page") ?? 1;

    const years = await yearsOf(
      viewer,
      JSON.stringify([narrow.kind, narrow.tag, narrow.category]),
      () => listYears(pool, viewer, narrow),
    );
    if (years.length === 0) {
      if (askedYear !== undefined || page > 1) {
        throw new HttpError(404, "not_found", "No such page.");
      }
      const empty: ApiListPage = {
        items: [],
        year: null,
        page: 1,
        last: 1,
        years: [],
      };
      res.json(empty);
      return;
    }
    const chosen = askedYear ?? years[0]?.year;
    if (chosen === undefined || !years.some((y) => y.year === chosen)) {
      throw new HttpError(404, "not_found", "No such year.");
    }
    const entries = await listEntriesFor(pool, viewer, {
      ...narrow,
      year: chosen,
    });
    const last = pageCount(entries.length);
    if (page > last) throw new HttpError(404, "not_found", "No such page.");
    const size = paginationRules.pageSize;
    const answer: ApiListPage = {
      items: entries.slice((page - 1) * size, page * size).map(card),
      year: String(chosen),
      page,
      last,
      years: years.map((y) => ({ year: String(y.year), count: y.count })),
    };
    res.json(answer);
  });

  router.get("/terms", async (req, res) => {
    const viewer = await viewerOf(req);
    res.json({
      terms: await termsOf(viewer, "terms", () => listTerms(pool, viewer)),
    });
  });

  // The guest index, kept until the content changes.
  let cached: { version: string; items: SearchItem[] } | undefined;
  // Added 2026-10-10 (T163): the folded copy the search scans, built from the cached index and kept with it.
  let cachedSearcher: { items: SearchItem[]; searcher: Searcher } | undefined;
  // Removed 2026-10-10 (T163, at the owner's word): GET /api/search-index, the whole index for the browser to download.
  // Nothing reads it since the search runs here; the cached index above is what /search uses.

  // The ticked boxes of a facet, a comma separated list of short names (T163).
  const picks = (req: Request, name: string): string[] => {
    const value = req.query[name];
    if (value === undefined || value === "") return [];
    if (typeof value !== "string" || value.length > 2000) {
      throw new HttpError(400, "invalid_input", `${name} must be one text.`);
    }
    const list = value.split(",").filter((part) => part !== "");
    if (list.length > 100 || list.some((part) => part.length > 100)) {
      throw new HttpError(
        400,
        "invalid_input",
        `${name} has too many or too long names.`,
      );
    }
    return list;
  };

  // The search itself (T163): q, and the ticked boxes of the three facets; section takes kinds (post, video). The
  // answer carries the facet counts over the query's hits, how many remain after the boxes, and the first results.
  router.get("/search", async (req, res) => {
    const viewer = await viewerOf(req);
    const q = req.query["q"];
    if (q !== undefined && (typeof q !== "string" || q.length > 200)) {
      throw new HttpError(400, "invalid_input", "q must be one short text.");
    }
    const sections = picks(req, "section");
    if (sections.some((kind) => kind !== "post" && kind !== "video")) {
      throw new HttpError(
        400,
        "invalid_input",
        "section must be post or video.",
      );
    }
    const facets = {
      sections,
      categories: picks(req, "category"),
      tags: picks(req, "tag"),
    };
    let searcher: Searcher;
    if (viewer.userId === null && viewer.status === "guest") {
      const version = await contentVersion(pool);
      if (cached?.version !== version) {
        cached = { version, items: await searchIndex(pool, viewer) };
      }
      if (cachedSearcher?.items !== cached.items) {
        cachedSearcher = {
          items: cached.items,
          searcher: buildSearcher(cached.items),
        };
      }
      searcher = cachedSearcher.searcher;
    } else {
      searcher = buildSearcher(await searchIndex(pool, viewer));
    }
    res.json(runSearch(searcher, { query: q ?? "", facets }));
  });

  return router;
}
