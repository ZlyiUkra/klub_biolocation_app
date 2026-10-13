// The server search (T163 of specs/001-self-hosted-club-site). It runs the rules of src/lib/search-rules.ts, which
// ran in the browser until 2026-10-10, so these cases are the behaviours the page had and must keep: case and the
// letter yo are folded, every word must be found (AND), a title outranks a tag, a tag outranks a summary and a
// summary outranks the body, the whole phrase adds a bonus, the facets are OR inside one and AND between them, and
// the facet counts are taken over the query's hits before any box is applied. No database is needed: the search is
// a function over the entries it is given.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { SearchItem } from "../src/access/entries.js";
import {
  buildSearcher,
  resultLimit,
  runSearch,
} from "../src/content/search.js";

const none = { sections: [], categories: [], tags: [] };

function item(over: Partial<SearchItem> & { slug: string }): SearchItem {
  return {
    kind: "post",
    title: "",
    date: new Date("2025-01-01T00:00:00Z"),
    tags: [],
    categories: [],
    summary: "",
    text: "",
    ...over,
  };
}

test("case and the letter yo are folded, and every word has to be found", () => {
  const searcher = buildSearcher([
    item({ slug: "a", title: "Ёлка в лесу", text: "рамка и маятник" }),
    item({ slug: "b", title: "Другое", text: "только рамка" }),
  ]);
  assert.deepEqual(
    runSearch(searcher, { query: "ЕЛКА", facets: none }).results.map(
      (r) => r.slug,
    ),
    ["a"],
  );
  const both = runSearch(searcher, { query: "рамка маятник", facets: none });
  assert.deepEqual(
    both.results.map((r) => r.slug),
    ["a"],
    "the second entry lacks one of the words",
  );
});

test("weights: title 8 (and the phrase bonus), tag 4, summary 2, body 1 (and the phrase bonus 2); equal scores keep the newest-first order", () => {
  const searcher = buildSearcher([
    item({ slug: "body", text: "лозоходец" }),
    item({ slug: "summary", summary: "лозоходец" }),
    item({ slug: "tag", tags: ["лозоходец"] }),
    item({ slug: "title", title: "лозоходец" }),
    item({ slug: "body2", text: "лозоходец" }),
  ]);
  const slugs = runSearch(searcher, {
    query: "лозоходец",
    facets: none,
  }).results.map((r) => r.slug);
  // title 8 + 8, tag 4, body 1 + 2 (the one word is also the phrase), summary 2 (no bonus: only title and body are
  // looked at for the phrase), so a body that holds the word outranks a summary that holds it.
  assert.deepEqual(slugs, ["title", "tag", "body", "body2", "summary"]);
});

test("the whole phrase beats the same words scattered, and a tag match names the tag", () => {
  const searcher = buildSearcher([
    item({ slug: "apart", text: "карта и потом метод" }),
    item({ slug: "phrase", text: "метод карта здесь" }),
  ]);
  // The words are the same and both are in the body: "карта метод" is not a phrase of either text, so the bonus
  // needs the phrase as written.
  const together = buildSearcher([
    item({ slug: "apart", text: "карта и потом метод" }),
    item({ slug: "phrase", text: "тут карта метод и всё" }),
  ]);
  assert.equal(
    runSearch(together, { query: "карта метод", facets: none }).results[0]
      ?.slug,
    "phrase",
  );
  assert.ok(runSearch(searcher, { query: "карта метод", facets: none }));
  const tagged = buildSearcher([item({ slug: "t", tags: ["Маятник"] })]);
  assert.deepEqual(
    runSearch(tagged, { query: "маятн", facets: none }).results[0]?.tags,
    ["Маятник"],
  );
});

test("a snippet surrounds the first match in the body, and the summary stands in for any other match", () => {
  const long = "слово ".repeat(60) + "искомое " + "слово ".repeat(60);
  const searcher = buildSearcher([
    item({ slug: "in-body", text: long, summary: "краткое" }),
    item({ slug: "in-title", title: "искомое", summary: "краткое описание" }),
  ]);
  const results = runSearch(searcher, {
    query: "искомое",
    facets: none,
  }).results;
  const body = results.find((r) => r.slug === "in-body");
  assert.ok(body, "the entry with the word in its body is a result");
  assert.ok(body.snippet.includes("искомое"));
  assert.ok(body.snippet.startsWith("…") && body.snippet.endsWith("…"));
  assert.equal(
    results.find((r) => r.slug === "in-title")?.snippet,
    "краткое описание",
  );
});

test("facets: OR inside one, AND between them; counts are over the hits before the boxes", () => {
  const searcher = buildSearcher([
    item({
      slug: "p1",
      kind: "post",
      categories: ["a"],
      tags: ["x"],
      title: "тема",
    }),
    item({
      slug: "p2",
      kind: "post",
      categories: ["b"],
      tags: ["y"],
      title: "тема",
    }),
    item({
      slug: "v1",
      kind: "video",
      categories: ["a"],
      tags: ["x", "y"],
      title: "тема",
    }),
    item({ slug: "p3", kind: "post", categories: ["a"], title: "другое" }),
  ]);
  const answer = runSearch(searcher, {
    query: "тема",
    facets: { sections: ["post"], categories: ["a", "b"], tags: [] },
  });
  assert.deepEqual(answer.results.map((r) => r.slug).sort(), ["p1", "p2"]);
  assert.equal(answer.total, 3, "three entries carry the word");
  assert.equal(answer.shown, 2);
  assert.deepEqual(answer.counts.section, { post: 2, video: 1 });
  assert.deepEqual(answer.counts.category, { a: 2, b: 1 });
  assert.deepEqual(answer.counts.tag, { x: 2, y: 2 });

  const both = runSearch(searcher, {
    query: "",
    facets: { sections: [], categories: ["a"], tags: ["y"] },
  });
  assert.deepEqual(
    both.results.map((r) => r.slug),
    ["v1"],
    "facets alone list their entries, with the tag AND the category",
  );
});

test("nothing asked for: counts of the whole site and no results; a teaser is searched by its title and tags only", () => {
  const searcher = buildSearcher([
    item({ slug: "full", text: "секрет" }),
    item({ slug: "teaser", title: "Закрыто", text: "" }),
  ]);
  const all = runSearch(searcher, { query: "", facets: none });
  assert.equal(all.results.length, 0);
  assert.equal(all.total, 2);
  assert.deepEqual(all.counts.section, { post: 2 });
  assert.equal(
    runSearch(searcher, { query: "секрет", facets: none }).results.length,
    1,
  );
});

test("results are capped but the counts are the full ones", () => {
  const items = Array.from({ length: resultLimit + 25 }, (_, i) =>
    item({ slug: `p${i}`, title: "общее слово" }),
  );
  const answer = runSearch(buildSearcher(items), {
    query: "слово",
    facets: none,
  });
  assert.equal(answer.results.length, resultLimit);
  assert.equal(answer.shown, resultLimit + 25);
  assert.equal(answer.total, resultLimit + 25);
});
