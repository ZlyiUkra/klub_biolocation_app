// The search itself, for /search/ only. Added 2026-09-22 with src/pages/search/index.astro and
// src/pages/search/data.json.ts; the owner chose a search with no dependency, so the matching is
// here rather than in a library. The facets down the left - Section, Category and Tag, with a count
// every name - were asked for the same day, against the reference site he sent.
//
// It is a module of its own and not part of src/scripts/site.ts, which every page of the site
// loads: this code is useless anywhere but on the search page, and the index it fetches is 93KB.
// The page imports it, so only the page pays for it.
//
// TypeScript, like the other client scripts here since 2026-09-22 - a wrong property name on a DOM
// node fails the build instead of reaching a visitor. Astro erases the annotations, so the bundle
// is the same JavaScript either way.

// The shortest query the page will look up, from the one place the page itself reads it, so the
// number in the hint on screen and the number the code obeys cannot drift apart. Added 2026-09-22
// with the rule itself.
import { site } from "../config";
// Added 2026-10-12 with the two interface languages (src/i18n/lang.ts): the page's words are in its
// attributes in both languages (langText below), the section of a result is printed in both, and a
// language switch draws the status line and the results again.
import { currentLang, setPhrase } from "./lang";
import type { Phrase } from "../i18n/lang";

// The value of a language-dependent attribute of the page in the language shown: langAttrs() in
// src/i18n/lang.ts writes data-<language>-<name> beside it. Read directly rather than through the
// attribute itself, so the answer does not depend on whether src/scripts/lang.ts has already
// copied the language in. `name` is the attribute's own name, e.g. "data-too-short".
function langText(element: HTMLElement, name: string): string {
  return (
    element.getAttribute(`data-${currentLang()}-${name}`) ??
    element.getAttribute(name) ??
    ""
  );
}

// Changed 2026-10-10 (T163 of specs/001-self-hosted-club-site): the matching is no longer done here. The scoring, the
// weights, the snippet and the facet rules were in this file and ran over an index the page downloaded whole (21 MB
// at 10 000 posts); they are src/lib/search-rules.ts now and run on the server, which this script asks through the
// site's endpoint /search/query.json. What stays here is what only a browser can do: reading the box and the ticks,
// keeping them in the address, marking the matched words in what the server sent, and drawing the results. The rules
// (fold, words) are taken from the same module, so the words marked are the words the server matched.
import { fold, words } from "../lib/search-rules";

/** One result as the site's endpoint sends it; the shape is written out in src/pages/search/query.json.ts. */
type Result = {
  url: string;
  title: string;
  date: string;
  section: string;
  /** A window of the body around the first match, or the entry's summary when the match is elsewhere. */
  snippet: string;
  /** The entry's tags that the query matched. Empty when the match was in the title or the body. */
  tags: string[];
};

type Answer = {
  /** Entries the words of the query matched, before any box is applied. */
  total: number;
  /** Entries left after the boxes. */
  shown: number;
  /** How many of the hits carry each section, category and tag, keyed by the checkbox values. */
  counts: {
    section: Record<string, number>;
    category: Record<string, number>;
    tag: Record<string, number>;
  };
  results: Result[];
};

// The matched words are wrapped in <mark>, and the text goes in as text nodes rather than as
// innerHTML: the index holds whatever an author wrote, and a title with a < in it must not be able
// to become markup on this page.
function withMarks(text: string, terms: string[]): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const folded = fold(text);

  // Every occurrence of every term, then the overlaps are dropped so the ranges can be walked once.
  const ranges: Array<[number, number]> = [];
  for (const term of terms) {
    let from = folded.indexOf(term);
    while (from !== -1) {
      ranges.push([from, from + term.length]);
      from = folded.indexOf(term, from + term.length);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);

  let cursor = 0;
  for (const [from, to] of ranges) {
    if (from < cursor) continue;
    if (from > cursor) fragment.append(text.slice(cursor, from));
    const mark = document.createElement("mark");
    mark.textContent = text.slice(from, to);
    fragment.append(mark);
    cursor = to;
  }
  if (cursor < text.length) fragment.append(text.slice(cursor));
  return fragment;
}

/** The date as the index carries it: the first ten characters of an ISO string. */
function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

(function searchInit() {
  const form = document.getElementById("search-form");
  const input = document.getElementById("search-input");
  const results = document.getElementById("search-results");
  const status = document.getElementById("search-status");
  const clear = document.getElementById("search-clear");
  if (
    !(form instanceof HTMLFormElement) ||
    !(input instanceof HTMLInputElement) ||
    !(clear instanceof HTMLButtonElement) ||
    !results ||
    !status
  ) {
    return;
  }

  const checks = Array.from(
    document.querySelectorAll<HTMLInputElement>(".search-facet__check"),
  );
  const counts = Array.from(
    document.querySelectorAll<HTMLElement>("[data-count-for]"),
  );

  // Changed 2026-10-10 (T163): the index is not downloaded; every query goes to the server. The address differs
  // between `npm run dev` and the built site only for the static files of the old index (the dev server's trailing
  // slash rule, recorded in CLAUDE.md); this endpoint is on demand in both, so the same address serves them, and the
  // slash question is answered by the same import.meta.env.DEV switch as before.
  const queryUrl = import.meta.env.DEV
    ? "/search/query.json/"
    : "/search/query.json";

  /** The ticked boxes of one facet, by their front-matter names. */
  const picked = (facet: string): string[] =>
    checks
      .filter((box) => box.dataset.facet === facet && box.checked)
      .map((box) => box.value);

  // The number beside a facet name is how many of the CURRENT query's results carry that term,
  // before any tick is applied. So the counts answer "what would this filter give me", which is
  // what a reader is asking when they look at them, and ticking a box never makes the other
  // numbers in the same list collapse to zero. The server counts them now (T163).
  const showCounts = (answer: Answer) => {
    for (const element of counts) {
      const facet = element.dataset.facet as keyof Answer["counts"] | undefined;
      const name = element.dataset.countFor ?? "";
      const n = facet ? (answer.counts[facet]?.[name] ?? 0) : 0;
      element.textContent = "(" + n + ")";
    }
  };

  const render = (results_: Result[], terms: string[]) => {
    results.textContent = "";
    for (const result of results_) {
      const item = document.createElement("li");
      item.className = "search-result";

      // The whole card answers a click since 2026-09-22, at the reviewer's remark that only the
      // title did. It is the pattern the site already uses for a card in a list - an anchor
      // stretched over the card by CSS, under the title rather than over it, so the title keeps
      // its own hover - and this one is hidden from assistive technology and skipped by the Tab
      // key, because the title beside it is the same link and announcing it twice would be
      // worse than not announcing it at all. The tags on the card were left alone: the owner
      // decided a tag should not be a second destination inside a result.
      const cover = document.createElement("a");
      cover.className = "search-result__cover";
      cover.href = result.url;
      cover.tabIndex = -1;
      cover.setAttribute("aria-hidden", "true");
      item.append(cover);

      const link = document.createElement("a");
      link.href = result.url;
      link.className = "search-result__title";
      link.append(withMarks(result.title, terms));
      item.append(link);

      const meta = document.createElement("p");
      meta.className = "search-result__meta";
      const section = document.createElement("span");
      section.className = "search-result__section";
      // Changed 2026-10-12: the section's name in both languages, found by the key the index
      // carries (it was textContent = result.section, the label itself).
      const names: Record<string, Phrase> = site.searchSections;
      setPhrase(section, names[result.section] ?? result.section);
      meta.append(section, " ", formatDate(result.date));
      item.append(meta);

      const body = document.createElement("p");
      body.className = "search-result__snippet";
      body.append(withMarks(result.snippet, terms));
      item.append(body);

      // Why this entry is in the list, when the answer is nowhere else on the card. A tag is
      // searched but was never printed here, so an entry whose only match was a tag looked like
      // something the filter had let through by accident. The tags are text and not links: the
      // owner decided a result should lead to one place, the entry itself. The wording lives on
      // the page, like the status line's, so the page stays the one file that speaks to a reader.
      if (result.tags.length > 0) {
        const why = document.createElement("p");
        why.className = "search-result__why";
        // Changed 2026-10-12: in the language shown (langText); it read results.dataset.tagPrefix.
        const prefix = langText(results, "data-tag-prefix");
        if (prefix) why.append(prefix + " ");
        result.tags.forEach((tag, index) => {
          if (index > 0) why.append(", ");
          why.append(withMarks(tag, terms));
        });
        item.append(why);
      }

      results.append(item);
    }
  };

  const message = (name: string, values: Record<string, string>): string => {
    // Changed 2026-10-12: the template in the language shown (langText), the camelCase name turned
    // back into the attribute's; it read status.dataset[name].
    const template = langText(
      status,
      "data-" + name.replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase()),
    );
    return Object.entries(values).reduce(
      (text, [key, value]) => text.split("{" + key + "}").join(value),
      template,
    );
  };

  // Added 2026-10-10 (T163): the number of the latest request. A slow answer to an earlier keystroke must not be
  // drawn over the answer to a later one; the browser searched synchronously before, so this could not happen.
  let latest = 0;

  const run = (push: boolean) => {
    const query = input.value.trim();
    // Added 2026-09-22, the reviewer's remark: the page used to look up the first letter typed,
    // and a single Russian letter matches nearly every entry on the site, so the whole list
    // redrew itself and the count said "42 result(s) for м", which is not an answer to anything.
    // Below site.search.minQuery the text is simply not searched - the facets still are, so
    // ticking a box while two letters stand in the box behaves exactly as if the box were empty -
    // and the status line says what is missing.
    const searching = query.length >= site.search.minQuery;
    const terms = searching ? words(query) : [];
    const inSections = picked("section");
    const inCategories = picked("category");
    const inTags = picked("tag");
    const filtering =
      inSections.length > 0 || inCategories.length > 0 || inTags.length > 0;

    clear.hidden = !query && !filtering;

    // The address carries the query and the ticks, so a search can be linked to and survives a
    // reload. replace, not push, while typing: otherwise every keystroke is a step in the
    // browser's history.
    const url = new URL(window.location.href);
    const set = (key: string, value: string) => {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    };
    set("q", query);
    set("section", inSections.join(","));
    set("category", inCategories.join(","));
    set("tag", inTags.join(","));
    window.history[push ? "pushState" : "replaceState"]({}, "", url);

    const nothingAsked = !terms.length && !filtering;
    // Nothing asked for: the page goes back to how it opened, with the counts showing the whole
    // site again. Two letters and no filter is not "nothing asked for" - somebody is typing - so
    // the line says why nothing happened rather than going blank on them.
    if (nothingAsked) {
      results.textContent = "";
      status.textContent = query ? message("tooShort", {}) : "";
    } else {
      status.textContent = message("searching", {});
    }

    // What the server is asked: the words only when they are long enough, and the ticks as they stand. Without
    // either it answers the counts of the whole site and no results.
    const asked = new URLSearchParams();
    if (terms.length) asked.set("q", query);
    if (inSections.length) asked.set("section", inSections.join(","));
    if (inCategories.length) asked.set("category", inCategories.join(","));
    if (inTags.length) asked.set("tag", inTags.join(","));
    const text = asked.toString();
    const ticket = ++latest;

    fetch(queryUrl + (text ? "?" + text : ""), {
      headers: { Accept: "application/json" },
    })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<Answer>;
      })
      .then((answer) => {
        if (ticket !== latest) return;
        showCounts(answer);
        if (nothingAsked) return;

        render(answer.results, terms);

        const n = String(answer.shown);
        if (!answer.shown) {
          status.textContent = terms.length
            ? message("empty", { q: query })
            : message("emptyFilter", {});
        } else if (!terms.length) {
          status.textContent = message("listing", { n });
        } else if (answer.shown !== answer.total) {
          status.textContent = message("filtered", {
            n,
            total: String(answer.total),
            q: query,
          });
        } else {
          status.textContent = message("found", { n, q: query });
        }

        // The last word, when the box holds something too short to search: what is listed below
        // came from the filters alone, and saying so is better than a count that looks like an
        // answer to what was typed.
        if (query && !searching) status.textContent = message("tooShort", {});
      })
      .catch(() => {
        if (ticket !== latest) return;
        if (nothingAsked) return;
        results.textContent = "";
        status.textContent = message("failed", {});
      });
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    run(true);
  });

  // Typing searches as it goes, but not on every keystroke: the index is in memory after the first
  // query, and 150ms is short enough to feel immediate and long enough not to re-rank 41 entries
  // between two letters.
  let timer = 0;
  input.addEventListener("input", () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => run(false), 150);
  });

  for (const box of checks) box.addEventListener("change", () => run(true));

  clear.addEventListener("click", () => {
    input.value = "";
    for (const box of checks) box.checked = false;
    run(true);
    input.focus();
  });

  // The facet sections are written open, which is right on a wide screen and wrong on a phone,
  // where seventeen tags would stand between the field and the first result. The markup cannot say
  // "open above 768px", so this is the one thing about them decided here.
  if (!window.matchMedia("(min-width: 768px)").matches) {
    for (const section of document.querySelectorAll<HTMLDetailsElement>(
      "[data-facet-section]",
    )) {
      section.open = false;
    }
  }

  // ?q=, ?category= and ?tag= on arrival: the header's magnifier links here without them, but a
  // shared link carries whatever the sender was looking at.
  const params = new URL(window.location.href).searchParams;
  const initialQuery = params.get("q") ?? "";
  const fromUrl: Record<string, string[]> = {
    section: (params.get("section") ?? "").split(","),
    category: (params.get("category") ?? "").split(","),
    tag: (params.get("tag") ?? "").split(","),
  };
  input.value = initialQuery;
  for (const box of checks) {
    const wanted = fromUrl[box.dataset.facet ?? ""] ?? [];
    box.checked = wanted.includes(box.value);
  }
  run(false);
  input.focus();

  // Added 2026-10-12: after a language switch the status line and the results are written again,
  // in the new language; the query and the ticks stay as they are.
  document.addEventListener(site.i18n.changeEvent, () => run(false));
})();
