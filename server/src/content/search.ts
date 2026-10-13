// The search, run on the server (T163 of specs/001-self-hosted-club-site; owner's decision of 2026-10-10). The rules are
// src/lib/search-rules.ts, the same code that ran in the browser until then: substring match after folding case and
// the letter yo, every word of the query must be found, the weights of title, tag, summary and body, the phrase bonus,
// the snippet around the first match, and the facets (OR inside a facet, AND between facets). This file only applies
// them to the entries the viewer may see and counts the facets; it decides nothing about what a match is.
//
// Decisions that would otherwise look like mistakes:
// - No SQL and no PostgreSQL full-text search: the scan is a substring test over the viewer's search index, which the
//   backend already keeps in memory for a guest (the index is rebuilt only when `contentVersion` changes). A SQL
//   `lower()` also depends on the database's locale, and a letter it did not fold would silently drop a match the
//   browser used to find. Measured numbers are in REWRITE.md.
// - The folded copy of every entry is made once when the index is built, not once per query.
// - Results are capped (`resultLimit`): the page used to draw every hit, which stops being sensible when "и" matches
//   ten thousand entries. `total` and `shown` are the full counts, so the status line still says how many were found.
// - The section facet is the entry's kind here (post or video); the site's own endpoint turns it into the label the
//   page prints, because the labels are the site's configuration (src/config.ts) and not the backend's.

import type { SearchItem } from "../access/entries.js";
import type {
  ApiSearchAnswer,
  ApiSearchResult,
} from "../../../src/content/api-types.js";
import {
  foldEntry,
  matchEntry,
  passesFacets,
  snippetAround,
  words,
  type Facets,
  type Folded,
} from "../../../src/lib/search-rules.js";

export type Searcher = { entries: { item: SearchItem; folded: Folded }[] };

export function buildSearcher(items: SearchItem[]): Searcher {
  return {
    entries: items.map((item) => ({ item, folded: foldEntry(item) })),
  };
}

export const resultLimit = 200;

export type SearchRequest = {
  /** The query as typed; empty when only facets are asked for. */
  query: string;
  /** Ticked boxes; `sections` hold kinds ("post", "video"). */
  facets: Facets;
};

function bump(map: Map<string, number>, name: string): void {
  map.set(name, (map.get(name) ?? 0) + 1);
}

export function runSearch(
  searcher: Searcher,
  request: SearchRequest,
): ApiSearchAnswer {
  const terms = words(request.query);
  const { facets } = request;
  const filtering =
    facets.sections.length > 0 ||
    facets.categories.length > 0 ||
    facets.tags.length > 0;

  // The facet counts are how many of the query's own hits carry a term, before any box is applied, so ticking a box
  // never collapses the other numbers (the rule of the page since 2026-09-22).
  const sections = new Map<string, number>();
  const categories = new Map<string, number>();
  const tags = new Map<string, number>();

  type Hit = { index: number; score: number; at: number; matched: string[] };
  const hits: Hit[] = [];
  searcher.entries.forEach(({ item, folded }, index) => {
    const match =
      terms.length > 0
        ? matchEntry(item, folded, terms)
        : { score: 0, at: -1, tags: [] as string[] };
    if (match === null) return;
    hits.push({ index, score: match.score, at: match.at, matched: match.tags });
    bump(sections, item.kind);
    for (const name of item.categories) bump(categories, name);
    for (const name of item.tags) bump(tags, name);
  });

  const counts = {
    section: Object.fromEntries(sections),
    category: Object.fromEntries(categories),
    tag: Object.fromEntries(tags),
  };

  // Nothing asked for: no results, only the counts of the whole site.
  if (terms.length === 0 && !filtering) {
    return { total: hits.length, shown: 0, counts, results: [] };
  }

  const shown = hits
    .filter((hit) => {
      const item = searcher.entries[hit.index]?.item;
      return (
        item !== undefined &&
        passesFacets(
          {
            section: item.kind,
            categories: item.categories,
            tags: item.tags,
          },
          facets,
        )
      );
    })
    // Score first; Array.prototype.sort is stable, so equal scores keep the index order, which is newest first.
    .sort((a, b) => b.score - a.score);

  const results: ApiSearchResult[] = [];
  for (const hit of shown.slice(0, resultLimit)) {
    const item = searcher.entries[hit.index]?.item;
    if (item === undefined) continue;
    results.push({
      kind: item.kind,
      slug: item.slug,
      title: item.title,
      date: item.date.toISOString(),
      // A match inside the body gets a window around it; any other match shows the card's summary.
      snippet: hit.at >= 0 ? snippetAround(item.text, hit.at) : item.summary,
      tags: hit.matched,
    });
  }
  return { total: hits.length, shown: shown.length, counts, results };
}
