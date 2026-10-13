// Site-wide client script. Imported once from src/layouts/Base.astro; Astro bundles it.
//
// Was site.js until 2026-09-22. Renamed to .ts so that `npm run check` looks at it: as a .js file
// it was compiled by Vite and shipped to every visitor without a single type ever being checked,
// which is the one part of the tree where a typo survived all three commands in the workflow. The
// project's tsconfig does set allowJs, so it was not invisible to the editor - but astro check
// reports no diagnostics for a plain .js file, and this is the file where a wrong property name on
// a DOM node fails silently in the browser instead of loudly at build time.
//
// What the rename cost, and it is the point of doing it: the annotations below. Each one records a
// contract the JavaScript only implied - which two strings a theme can be, that a click target is
// not always a Node, that the KaTeX global may be missing. The bodies are unchanged.
//
// This is the "typing the ported scripts" item that CLAUDE.md parked behind the parity question;
// that question was answered on 2026-09-16 (Hugo is a checkpoint, the project adopts Astro
// practice), which is what makes the rename allowed now. Nothing about the emitted bundle changes:
// TypeScript annotations are erased, and the browser gets the same code as before.
//
// TODO(migration §7): copy, verbatim, the remaining inline script blocks in
//   ../klub_biolocation/themes/void/layouts/partials/head/js.html
//     (code copy buttons, footnote back-links, hash highlight, TOC active state,
//      heading anchor copy)
// and the whole of
//   ../klub_biolocation/themes/void/assets/js/main.js
// Not the theme bootstrap (localStorage -> `dark` class): that one stays inline in
// src/components/Head.astro so it runs before the stylesheets load.

// Added 2026-10-12: the interface language helpers (the "Interface language" block below says why).
import { initLang, setLangAttr } from "./lang";
import { ui } from "../i18n/strings";

// --- Pressed state on touch screens ---
// Added 2026-09-29 with postcss.config.cjs, which gives every hover effect an `:active` twin so that
// a finger on a link or a button shows what the mouse pointer shows. iOS Safari ignores `:active`
// on touch unless a touchstart handler exists: MDN's compatibility data for `:active` says "By
// default, Safari on iOS does not use the :active state unless there is a touchstart event handler
// on the relevant element or on the <body> element." This handler does nothing but exist. It is
// passive, so it never delays scrolling, and it sits on the body, which is the element the note
// names. This file is a deferred module, so the body is there when it runs.
document.body.addEventListener("touchstart", () => {}, { passive: true });

// --- Interface language ---
// Added 2026-10-12 at the owner's request: the switch beside the menu, the attributes of the
// language the page shows, and following a switch made in another tab (src/scripts/lang.ts). The
// two labels this file sets itself, below, are written with setLangAttr() so they follow too.
initLang();

// --- Theme (dark / light) ---
// Ported ahead of §7 because the header's toggle button is useless without it.
// Verbatim from the themeInit block in head/js.html, including the DOMContentLoaded
// wrapper: Astro emits this bundle as a deferred module, which still runs before
// DOMContentLoaded fires, so the timing matches Hugo's.
document.addEventListener("DOMContentLoaded", function () {
  // --- Math ---
  // Also ported ahead of §7. The CDN tag in Head.astro calls `renderMathInElement` with no
  // options, and KaTeX's DEFAULT delimiters are `$$...$$`, `\(...\)` and `\[...\]` - single
  // `$...$` is not among them. The theme enables it with this second call, so without it a
  // formula written as `$E = mc^2$` stays visible as source text. That shows up on the Posts
  // page, whose summary for article.md contains exactly that.
  //
  // Changed 2026-09-22: the first sentence above no longer holds. The CDN tag in Head.astro does
  // not call renderMathInElement at all now - its onload attribute was removed, because it ran a
  // whole typesetting pass with the default delimiters that this call then repeated properly. The
  // rest of the note still applies: this is where the single `$...$` delimiter is enabled, and it
  // is now the only pass over the document.
  //
  // Guarded for the same reason. Until today two independent things called into KaTeX, so a CDN
  // that failed to answer cost only the formulas. With one call left, an undefined
  // renderMathInElement would throw here and take the whole DOMContentLoaded listener with it -
  // the theme switch, and every block ported into this file after it, would stop working because
  // a third-party host was down. `typeof` on an undeclared name is the one test that does not
  // throw by itself.
  //
  // Superseded later the same day, by the owner's decision: there is no call here any more. The
  // math is typeset by rehype-katex while the page is built (astro.config.mjs has the reasoning),
  // so by the time this file runs the formulas are already KaTeX markup and there is nothing for a
  // client-side pass to find. The KaTeX CDN tags in Head.astro went with it. The notes above are
  // kept because they explain a real trap: client-side typesetting had never actually worked on
  // this site, since remark-math consumes the dollars that auto-render looks for. Anyone tempted
  // to put the call back should read them first.

  (function themeInit() {
    // Added with the .ts rename on 2026-09-22: the two values a theme can have, written down
    // once. apply() used to take an unannotated parameter and compare it to the string "dark" in
    // three places, so "Dark" or "drak" was a silent no-op that left the toggle out of step with
    // the class on <html>. localStorage still hands back a plain string, which is why currentPref()
    // below tests both values explicitly rather than casting what it read.
    type Theme = "dark" | "light";

    const storageKey = "theme";
    const root = document.documentElement;
    // Two buttons, not one: the header row carries a switch at 640px and up, the responsive
    // drop-down panel carries the other one below that. Only ever one of them is displayed,
    // but both are in the document, so both are bound and both are kept in the same aria
    // state. Hugo has a single #theme-toggle; see ThemeToggle.astro for why the id is gone.
    // Changed 2026-09-22: there is one button again. The owner asked for the switch to stay in
    // the header bar when the drop-down panel is open instead of moving into it, so the panel no
    // longer renders a second instance. The query and the loop stay as they are - they cost
    // nothing over one element, and they are what makes a second switch anywhere on the page
    // work without touching this file.
    const btns = document.querySelectorAll("[data-theme-toggle]");

    function systemPrefersDark() {
      return (
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
      );
    }

    function currentPref(): Theme {
      const v = localStorage.getItem(storageKey);
      if (v === "dark") return "dark";
      if (v === "light") return "light";
      return systemPrefersDark() ? "dark" : "light";
    }

    function apply(theme: Theme) {
      root.classList.toggle("dark", theme === "dark");
      // `btn: Element` is the annotation the .ts rename needs here. Array.prototype.forEach.call
      // is the theme's own way of walking a NodeList - kept as ported - and `call` gives the
      // callback no element type of its own, so without this the parameter would be an implicit
      // any and the two setAttribute calls below would go unchecked.
      Array.prototype.forEach.call(btns, function (btn: Element) {
        btn.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
        // Changed 2026-10-12: both languages through setLangAttr (src/scripts/lang.ts), so a later
        // language switch updates the label too. It set "Switch to light mode" / "Switch to dark
        // mode" with setAttribute.
        setLangAttr(
          btn,
          "aria-label",
          theme === "dark" ? ui.theme_to_light : ui.theme_to_dark,
        );
      });
    }

    let theme = currentPref();
    apply(theme);

    // Same annotation as in apply(), and for the same reason; HTMLElement rather than Element
    // because this loop calls blur(), which only an HTMLElement has. The markup behind
    // [data-theme-toggle] is a <button> in both places (ThemeToggle.astro), so the narrower type
    // is the truth here - and if it ever stops being one, this line is where it will be reported.
    Array.prototype.forEach.call(btns, function (btn: HTMLElement) {
      btn.addEventListener("mousedown", function (e) {
        e.preventDefault();
      });

      btn.addEventListener("click", function () {
        theme = theme === "dark" ? "light" : "dark";
        localStorage.setItem(storageKey, theme);
        apply(theme);
        btn.blur();
      });
    });

    // Watch system preference changes when user has no explicit choice
    try {
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = function () {
        const explicit = localStorage.getItem(storageKey);
        if (!explicit) {
          theme = currentPref();
          apply(theme);
        }
      };
      media.addEventListener("change", handler);
    } catch (_) {}
  })();

  // --- Responsive menu ---
  // No counterpart in Hugo: the theme's answer below 640px is to let the header scroll
  // sideways, which hides menu items behind a scrollbar. Added 2026-09-09 at the owner's
  // request. Markup is in Header.astro; this only drives it.
  //
  // The panel's visibility is the `hidden` attribute, not a class, so that the `sm:hidden`
  // utility on the same element stays authoritative above 640px: whatever state the panel was
  // left in, widening the window hides it. The media query below keeps aria-expanded honest
  // when that happens, since CSS cannot update an attribute.
  (function menuInit() {
    const btn = document.getElementById("menu-toggle");
    const panel = document.getElementById("site-menu");
    if (!btn || !panel) return;

    const iconOpen = btn.querySelector('[data-menu-icon="open"]');
    const iconClose = btn.querySelector('[data-menu-icon="close"]');

    // Changed with the .ts rename on 2026-09-22: setOpen and isOpen were function declarations
    // and are arrow functions held in a const now. The bodies are untouched; what changes is that
    // TypeScript can see the `if (!btn || !panel) return;` guard above them. A function
    // declaration is hoisted, so it could in principle run before that line, and the compiler
    // therefore refuses to carry the narrowing into it - btn and panel stayed
    // `HTMLElement | null` inside, and every use of them was an error. An arrow function assigned
    // after the guard cannot exist before it, so the narrowing holds. The alternatives were a
    // non-null assertion on six uses, which the house rules bar, or re-testing for null inside
    // functions that only ever run once both elements are known to exist.
    const setOpen = (open: boolean) => {
      panel.hidden = !open;
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      // Changed 2026-10-12: both languages through setLangAttr, as the theme switch above. It set
      // "Close menu" / "Open menu" with setAttribute.
      setLangAttr(btn, "aria-label", open ? ui.menu_close : ui.menu_open);
      // A class, not the `hidden` property: these are SVG elements, and `hidden` is defined
      // on HTMLElement only, so assigning to it would silently do nothing. Verified in a
      // headless browser before this was written.
      if (iconOpen) iconOpen.classList.toggle("hidden", open);
      if (iconClose) iconClose.classList.toggle("hidden", !open);
    };

    const isOpen = () => btn.getAttribute("aria-expanded") === "true";

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      setOpen(!isOpen());
    });

    // A tap anywhere else closes the panel. The listener sits on the document, so clicks
    // inside the header have to be excluded explicitly - otherwise opening it would
    // immediately close it again.
    document.addEventListener("click", function (e) {
      if (!isOpen()) return;
      // Added with the .ts rename on 2026-09-22: Node.contains() takes a Node, and e.target is
      // EventTarget | null, which a click on the document need not fill with an element at all.
      // The instanceof test is what narrows it; a cast would have hidden the same question. When
      // the target is not a node there is nothing the panel could contain, so closing is right.
      if (!(e.target instanceof Node)) {
        setOpen(false);
        return;
      }
      if (panel.contains(e.target)) return;
      if (btn.contains(e.target)) return;
      setOpen(false);
    });

    // Added 2026-09-30: a link in the panel that keeps the visitor on the page - the Account item
    // while the account page is open (Menu.astro, src/scripts/same-page.ts) - loads nothing, so no
    // new page closes the panel; it closes here. The link's own listener has run by the time the
    // click bubbles up to the panel, so its preventDefault is already visible.
    panel.addEventListener("click", function (e) {
      if (e.defaultPrevented) setOpen(false);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isOpen()) {
        setOpen(false);
        btn.focus();
      }
    });

    try {
      const wide = window.matchMedia("(min-width: 640px)");
      const sync = function () {
        if (wide.matches && isOpen()) setOpen(false);
      };
      wide.addEventListener("change", sync);
    } catch (_) {}
  })();
});
