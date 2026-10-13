// The rules of the site's search, in one module with no imports (T163 of specs/001-self-hosted-club-site, owner's
// decision of 2026-10-10: the search runs on the server with the very same rules the browser used). These functions
// were inside src/scripts/search.ts and ran in the browser against the whole index; the backend runs them now, so the
// browser no longer downloads every text of every entry (21 MB at 10 000 posts). The module imports nothing from
// Astro and nothing of the site, so the backend compiles it and the browser script still takes `fold` and `words`
// from it to mark the matched words in what it shows; server/test/shared.test.ts checks the first of those.
//
// The notes below are the ones that stood in src/scripts/search.ts, with the same dates, because they are still what
// each rule is for.

/** What the search looks at of an entry. */
export type Searchable = {
  title: string;
  tags: string[];
  summary: string;
  text: string;
};

/** The same fields, folded once, so a search does not fold thousands of texts again for every query. */
export type Folded = Searchable;

// Case is folded and ё is read as е. Russian writes both for the same sound and a reader typing
// "елка" expects "ёлка"; the site's content is Russian, so this is the one normalisation that
// earns its place. Everything else - stemming, declension, transliteration - would need a
// dictionary, which is exactly the dependency the owner did not want (and still does not want:
// the owner confirmed on 2026-10-10 that the server search has no morphology).
export function fold(text: string): string {
  return text.toLowerCase().replace(/ё/g, "е");
}

export function foldEntry(entry: Searchable): Folded {
  return {
    title: fold(entry.title),
    tags: entry.tags.map(fold),
    summary: fold(entry.summary),
    text: fold(entry.text),
  };
}

// The query is split on whitespace and every word has to be found somewhere in the entry. AND, not
// OR: with 41 entries an OR search returns most of the site and ranks the answer somewhere in the
// middle of it.
export function words(query: string): string[] {
  return fold(query).split(/\s+/).filter(Boolean);
}

// Where a word is found decides what it is worth. A title match is what the reader is almost
// always after; a tag says the entry is about the subject rather than merely mentioning it; the
// summary is the opening of the text and is weighted between the two. Counting the occurrences in
// the body would let one long article outrank a page that is actually about the word, so the body
// scores once.
const weights = { title: 8, tag: 4, summary: 2, text: 1 } as const;

/** How an entry answered a query. */
export type Match = {
  score: number;
  /** Where the first match sits in the body text, for the snippet; -1 when it is not in the body. */
  at: number;
  /** The entry's tags that the query matched, so the card can say why it is here. */
  tags: string[];
};

/**
 * The score of an entry for the folded words of a query, or null when one of the words is nowhere in it.
 * `entry` supplies the original tag names (a card prints them as written), `folded` is its folded copy.
 */
export function matchEntry(
  entry: Searchable,
  folded: Folded,
  terms: string[],
): Match | null {
  let score = 0;
  let at = -1;
  // Which of the entry's tags answered the query. Added 2026-09-22: a tag is matched but never
  // shown, so a result whose only match was a tag looked like a random entry in a sorted list -
  // the reviewer searched "мая", got "Лекция шестая", and could not find the word anywhere on
  // the card. It matched on the tag "маятник". The filter was right and the card was silent.
  const matchedTags = new Set<string>();

  for (const term of terms) {
    let found = false;

    if (folded.title.includes(term)) {
      score += weights.title;
      found = true;
    }
    const taggedWith = entry.tags.filter((_, index) =>
      (folded.tags[index] ?? "").includes(term),
    );
    if (taggedWith.length > 0) {
      score += weights.tag;
      found = true;
      for (const tag of taggedWith) matchedTags.add(tag);
    }
    if (folded.summary.includes(term)) {
      score += weights.summary;
      found = true;
    }
    const inText = folded.text.indexOf(term);
    if (inText !== -1) {
      score += weights.text;
      found = true;
      if (at === -1) at = inText;
    }

    // One word missing is enough to drop the entry: that is what AND means.
    if (!found) return null;
  }

  // The whole query as one phrase, found as written, beats the same words scattered about.
  const phrase = terms.join(" ");
  if (folded.title.includes(phrase)) score += weights.title;
  else if (folded.text.includes(phrase)) score += weights.text * 2;

  return { score, at, tags: [...matchedTags] };
}

// A window of the body around the first match, cut on spaces so no word is halved.
const snippetRadius = 90;

export function snippetAround(text: string, at: number): string {
  if (at < 0) return "";
  const start = Math.max(0, at - snippetRadius);
  const end = Math.min(text.length, at + snippetRadius);
  const cutStart = start === 0 ? 0 : text.indexOf(" ", start) + 1;
  const cutEnd = end === text.length ? text.length : text.lastIndexOf(" ", end);
  const from = cutStart > 0 && cutStart < at ? cutStart : start;
  const to = cutEnd > at ? cutEnd : end;
  return (
    (from > 0 ? "…" : "") + text.slice(from, to) + (to < text.length ? "…" : "")
  );
}

/** What the facets ask for: the ticked boxes of each, by name. An empty list is "no filter". */
export type Facets = {
  sections: string[];
  categories: string[];
  tags: string[];
};

// Within one facet the ticks are an OR - two categories mean "either of them" - and the three
// facets are an AND. That is what every faceted list does, and the alternative (AND inside a
// facet) would answer nothing on a site where an entry rarely carries two categories.
//
// Section joined the other two on 2026-09-22, at the owner request of that afternoon. An entry
// has exactly one section, so this one is a comparison where the others are a search.
export function passesFacets(
  entry: { section: string; categories: string[]; tags: string[] },
  facets: Facets,
): boolean {
  return (
    (facets.sections.length === 0 || facets.sections.includes(entry.section)) &&
    (facets.categories.length === 0 ||
      entry.categories.some((name) => facets.categories.includes(name))) &&
    (facets.tags.length === 0 ||
      entry.tags.some((name) => facets.tags.includes(name)))
  );
}
