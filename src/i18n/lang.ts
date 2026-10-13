// The two languages of the interface, added 2026-10-12 at the owner's request (site.i18n in
// src/config.ts says what is translated and what is not). This file holds the types and the one
// build-time helper; it imports nothing but the config, so a browser script may import it too (the
// rule about browser scripts and src/lib/ in CLAUDE.md).
//
// HOW A STRING IS WRITTEN
//
// - Text in the markup: <T s={...} /> (src/components/T.astro) prints one span per language,
//   `data-lang="<language>"`, and custom.css hides every span whose language is not the document's.
//   Both languages are in the HTML, so a switch is instant and nothing flashes on a page load - the
//   inline block in Head.astro sets the class before the first paint. A script that builds text
//   does the same through setPhrase() in src/scripts/lang.ts.
// - An attribute (aria-label, title, placeholder): langAttrs() below. The attribute carries the
//   default language, `data-<language>-<attribute>` carries each value, and src/scripts/lang.ts
//   copies the right one in on load and after every switch.
// - Text that cannot hold a span (an option of a select, a confirm() dialog, document.title): a
//   script reads phrase() from src/scripts/lang.ts at the moment it writes, and listens for
//   site.i18n.changeEvent to write again.
//
// A plain string is allowed wherever a Phrase is (the Words type): it is content - an article title,
// a tag, a category - which is not translated and reads the same in both languages.
import { site } from "../config";

export type Lang = (typeof site.i18n.languages)[number];

/** One interface string in every language of the site. */
export type Phrase = Record<Lang, string>;

// Named Words rather than Text: Text is the DOM's own type of a text node, and a browser script
// that imported a Text from here would lose it.
/** Interface text (a Phrase) or content, which is not translated (a string). */
export type Words = string | Phrase;

/** The text in one language; content comes back as it is. */
export function inLang(words: Words, lang: Lang): string {
  return typeof words === "string" ? words : words[lang];
}

/**
 * A phrase with its {name} placeholders filled in, in every language: format(ui.x, { n: 3 }).
 * For the messages a script composes (the admin panel's), so that the result is still a Phrase and
 * follows a language switch like any other. A value may itself be a Phrase (a status's name), and
 * each language then gets its own.
 */
export function format(
  words: Phrase,
  values: Record<string, string | number | Phrase>,
): Phrase {
  const fill = (lang: Lang) =>
    Object.entries(values).reduce(
      (out, [name, value]) =>
        out
          .split(`{${name}}`)
          .join(typeof value === "object" ? value[lang] : String(value)),
      words[lang],
    );
  return { ru: fill("ru"), en: fill("en") };
}

/**
 * Attributes whose value depends on the language, to spread onto an element:
 * `<button {...langAttrs({ "aria-label": ui.menu_open })}>`. The attribute itself carries the
 * default language, so the markup is right before any script runs; src/scripts/lang.ts swaps it.
 */
export function langAttrs(
  attrs: Record<string, Phrase>,
): Record<string, string> {
  const out: Record<string, string> = {};
  const names: string[] = [];
  for (const [name, phrase] of Object.entries(attrs)) {
    names.push(name);
    out[name] = phrase[site.i18n.defaultLanguage];
    for (const lang of site.i18n.languages) {
      out[`data-${lang}-${name}`] = phrase[lang];
    }
  }
  // The list of the attributes to swap, so that the script needs no list of its own.
  out["data-lang-attrs"] = names.join(" ");
  return out;
}
