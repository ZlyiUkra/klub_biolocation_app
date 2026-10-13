// Port of what the Hugo list templates do with a post's summary:
//
//   {{ .Summary | plainify | truncate 140 }}
//
// `.Summary` is Hugo's automatic summary: the first `summaryLength` words (70 by default;
// hugo.toml does not change it) of the RENDERED content, still as HTML. `plainify` then
// strips the tags, and `truncate` cuts to 140 characters on a word boundary and appends an
// ellipsis. None of the posts here define `summary` in front matter or use a `<!--more-->`
// divider, so the automatic path is the only one that has to be reproduced.
//
// This works from the raw Markdown body rather than from rendered HTML: Astro's
// `post.render()` hands back a component, not an HTML string, and rendering the whole
// collection twice just to slice off 140 characters would be the wrong trade. For prose the
// two are the same once the inline syntax is stripped, which is what plainifyMarkdown does.
//
// The subtle part is WHERE Hugo cuts. `truncate` counts the string as it stands in the
// HTML, and by that point Goldmark has replaced the typographic characters with entities
// and escaped the angle brackets - so `“` costs the seven characters of `&ldquo;`, and `<`
// costs four. Counting the decoded characters would cut several words too late. The cut is
// therefore measured on an encoded copy and decoded again afterwards; verified against both
// posts in the Hugo build, including the one whose summary contains an escaped shortcode.
const SUMMARY_LENGTH = 70;
const TRUNCATE_AT = 140;

// Goldmark's typographer, restricted to the substitutions this content actually triggers.
function typographer(text: string): string {
  return text.replace(/\.\.\./g, "…").replace(/"([^"]*)"/g, "“$1”");
}

// Roughly Hugo's `plainify` applied to rendered Markdown: block elements become lines,
// inline syntax disappears, and the text survives.
//
// Exported since 2026-09-22: src/pages/search/data.json.ts needs the body of an entry as plain
// text, and a second implementation of "strip the Markdown" would drift from this one the first
// time a rule here changed. summary() is still what a card shows; the search index wants the
// whole text, so it calls this directly.
export function plainifyMarkdown(body: string): string {
  const blocks = body
    .trim()
    // Hugo's escaped shortcode form: `{{</* x */>}}` renders the literal `{{< x >}}`.
    .replace(/\{\{<\/\*\s?/g, "{{< ")
    .replace(/\s?\*\/>\}\}/g, " >}}")
    .split(/\n\s*\n/);

  return blocks
    .map((block) =>
      block
        .split("\n")
        .map((line) =>
          line
            .replace(/^#{1,6}\s+/, "") // headings
            .replace(/^>\s?/, "") // block quotes
            .replace(/^\s*[-*+]\s+/, "") // bullets
            .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // links and images
            .replace(/`([^`]*)`/g, "$1") // inline code
            .replace(/\*\*([^*]*)\*\*|__([^_]*)__/g, "$1$2") // bold
            .replace(/\*([^*]*)\*|_([^_]*)_/g, "$1$2") // italics
            .trim(),
        )
        .filter(Boolean)
        .join("\n"),
    )
    .filter(Boolean)
    .join("\n");
}

// The HTML form Hugo measures. Ampersands first, so the entities produced below are not
// escaped a second time.
function encodeForCounting(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/“/g, "&ldquo;")
    .replace(/”/g, "&rdquo;")
    .replace(/…/g, "&hellip;");
}

function decode(text: string): string {
  return text
    .replace(/&hellip;/g, "…")
    .replace(/&rdquo;/g, "”")
    .replace(/&ldquo;/g, "“")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

// Hugo's `truncate`: cut at `max` characters of the HTML, back off to the last word
// boundary, then append the ellipsis. The whitespace at the cut is kept, because Hugo
// appends `&hellip;` straight after the shortened string rather than trimming first.
function truncate(text: string, max: number): string {
  const encoded = encodeForCounting(text);
  if (encoded.length <= max) return text;
  const cut = encoded.slice(0, max);
  const lastSpace = cut.search(/\s\S*$/);
  return decode(lastSpace > 0 ? cut.slice(0, lastSpace + 1) : cut) + "…";
}

export function summary(body: string): string {
  const plain = typographer(plainifyMarkdown(body));
  // `.Summary`: the first SUMMARY_LENGTH words. Splitting on whitespace loses the newlines
  // between blocks, so the words are rejoined against the original text instead.
  const words = plain.split(/\s+/).filter(Boolean);
  const limited =
    words.length <= SUMMARY_LENGTH
      ? plain
      : plain.split(/(\s+)/).reduce<{ out: string; seen: number }>(
          (acc, part) => {
            if (acc.seen >= SUMMARY_LENGTH) return acc;
            const isWord = part.trim().length > 0;
            return {
              out: acc.out + part,
              seen: acc.seen + (isWord ? 1 : 0),
            };
          },
          { out: "", seen: 0 },
        ).out;

  return truncate(limited.trim(), TRUNCATE_AT);
}
