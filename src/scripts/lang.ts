// The browser half of the two interface languages, added 2026-10-12 (site.i18n in src/config.ts;
// how strings are written is in src/i18n/lang.ts). site.ts calls initLang() on every page; any
// browser script may import the helpers below to write text in the language the page shows.
//
// The language a page shows is the class on <html>: `lang-<language>` for any language but the
// default, set by the inline block in Head.astro before the first paint, from localStorage. This
// module never decides the language on load; it reads the class, so the two cannot disagree.
import { site } from "../config";
import { inLang, type Lang, type Phrase, type Words } from "../i18n/lang";

const root = document.documentElement;
const def: Lang = site.i18n.defaultLanguage;
const langs: readonly Lang[] = site.i18n.languages;
// The content's language, which <html lang> declares (Base.astro); see setPhrase().
const pageLang: string = site.language;

function isLang(value: string | null): value is Lang {
  return langs.some((lang) => lang === value);
}

/** The language the document shows. */
export function currentLang(): Lang {
  for (const lang of langs) {
    if (lang !== def && root.classList.contains(`lang-${lang}`)) return lang;
  }
  return def;
}

/** The text in the language the document shows, for places that cannot hold a span. */
export function phrase(words: Words): string {
  return inLang(words, currentLang());
}

/**
 * Puts the text into an element as T.astro would: one span per language, so a later switch needs
 * no script. Replaces whatever the element held. A plain string (content) goes in as it is.
 */
export function setPhrase(element: Element, words: Words): void {
  if (typeof words === "string") {
    element.textContent = words;
    return;
  }
  element.replaceChildren(
    ...langs.map((lang) => {
      const span = document.createElement("span");
      span.dataset.lang = lang;
      // The language of <html lang> needs no attribute of its own (T.astro says the same).
      if (lang !== pageLang) span.lang = lang;
      span.textContent = words[lang];
      return span;
    }),
  );
}

/** A new element of the given tag holding the text, as setPhrase() writes it. */
export function phraseElement(tag: string, words: Words): HTMLElement {
  const element = document.createElement(tag);
  setPhrase(element, words);
  return element;
}

/**
 * Gives an element an attribute in every language, as langAttrs() does in the markup, and sets
 * the value of the language the document shows.
 */
export function setLangAttr(
  element: Element,
  name: string,
  words: Phrase,
): void {
  for (const lang of langs)
    element.setAttribute(`data-${lang}-${name}`, words[lang]);
  const names = new Set(
    (element.getAttribute("data-lang-attrs") ?? "").split(" ").filter(Boolean),
  );
  names.add(name);
  element.setAttribute("data-lang-attrs", [...names].join(" "));
  element.setAttribute(name, words[currentLang()]);
}

// Copies every attribute listed in data-lang-attrs from its data-<language>-<name> twin, in
// `root` and below it.
function applyAttrsIn(root: ParentNode, lang: Lang): void {
  const elements = [...root.querySelectorAll("[data-lang-attrs]")];
  if (root instanceof Element && root.hasAttribute("data-lang-attrs"))
    elements.push(root);
  for (const element of elements) {
    for (const name of (element.getAttribute("data-lang-attrs") ?? "").split(
      " ",
    )) {
      if (name === "") continue;
      const value = element.getAttribute(`data-${lang}-${name}`);
      if (value !== null) element.setAttribute(name, value);
    }
  }
}

// The whole document, and the page title from the title element's data-<language>-text
// (Head.astro).
function applyAttrs(lang: Lang): void {
  applyAttrsIn(document, lang);
  const title = document
    .querySelector("title")
    ?.getAttribute(`data-${lang}-text`);
  if (title) document.title = title;
}

/**
 * Gives markup a script has just put in - a clone of a template, whose content the document-wide
 * pass never sees - the attributes of the language the page shows. Spans need nothing: the CSS
 * rule shows the right one wherever they are.
 */
export function localize(root: ParentNode): void {
  applyAttrsIn(root, currentLang());
}

// Shows `lang`: the class, the attributes, then the event for the scripts that write text
// themselves (an option list, a status line that holds a plain string).
function show(lang: Lang): void {
  for (const other of langs) {
    if (other !== def) root.classList.toggle(`lang-${other}`, other === lang);
  }
  applyAttrs(lang);
  document.dispatchEvent(
    new CustomEvent<Lang>(site.i18n.changeEvent, { detail: lang }),
  );
}

// The language the visitor chose last, or the default. The same read as the block in Head.astro.
function storedLang(): Lang {
  try {
    const stored = localStorage.getItem(site.i18n.storageKey);
    return isLang(stored) ? stored : def;
  } catch {
    return def;
  }
}

/** Switches the interface to `lang` and remembers it for every page of the site. */
export function setLang(lang: Lang): void {
  try {
    // Changed 2026-10-12 at the owner's word that the visitor's choice is remembered: the default
    // language is stored too when it is chosen, instead of the key being removed. A removed key
    // meant "never chose", so a later change of site.i18n.defaultLanguage would have moved a
    // visitor who had picked English on purpose. The block in Head.astro needs no change: it adds
    // a class only for a stored language other than the default.
    localStorage.setItem(site.i18n.storageKey, lang);
  } catch {
    // Storage refused (a private window may do so): the switch still holds for this page.
  }
  show(lang);
}

/** Runs once per page, from site.ts. */
export function initLang(): void {
  const lang = currentLang();
  // The markup carries the default language's attributes, so only another language needs a pass.
  if (lang !== def) applyAttrs(lang);

  // The button beside the menu (LangToggle.astro) moves to the next language; with two, the other.
  document.querySelectorAll("[data-lang-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = langs[(langs.indexOf(currentLang()) + 1) % langs.length];
      if (next !== undefined) setLang(next);
    });
  });

  // Another tab switched the language, or the page came back from the back-forward cache with the
  // language it had when it was left: follow the stored choice, as AuthButton.astro does for the
  // sign-in flag.
  const follow = () => {
    const stored = storedLang();
    if (stored !== currentLang()) show(stored);
  };
  window.addEventListener("storage", (event) => {
    if (event.key === site.i18n.storageKey || event.key === null) follow();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) follow();
  });
}
