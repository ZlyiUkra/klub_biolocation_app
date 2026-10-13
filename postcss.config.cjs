// PostCSS configuration. Added 2026-09-29 at the colleague's request, relayed by the owner: every
// hover effect on the site - the colour of a link, a menu item, a card, a button, a search result -
// should also show while a finger is on the element, because a phone has no hover and those effects
// were never seen there.
//
// WHY ONE PLUGIN AND NOT `active:` BESIDE EVERY `hover:`
//
// The hover effects live in four places: Tailwind classes in the markup (about ninety `hover:` and
// `group-hover:`), `@apply hover:...` in the theme's main.css, plain `:hover` rules in main.css,
// search.css and carousel.css, and the scoped style blocks of the components. Writing an `active:`
// twin next to each is some 150 edits, and every hover added later would need its twin remembered.
// This plugin does it once, on the CSS the build produces: every rule whose selector has `:hover`
// gets the same selector with `:active` added to its list, so the effect shows while an element is
// pressed - a finger on a phone, a held mouse button on a desktop - and nothing else changes.
//
// It runs as a Rule visitor, and PostCSS calls the visitors after every plugin's one-off pass, so
// it also sees the utilities Tailwind generates; @astrojs/tailwind loads this file and puts its own
// tailwindcss and autoprefixer after the plugins listed here (node_modules/@astrojs/tailwind,
// getViteConfiguration). Astro 4 reads PostCSS from this file ("Styles and CSS", PostCSS: "create a
// postcss.config.cjs file in the project root"). No dependency: PostCSS is part of Vite.
//
// Only an unescaped `:hover` is a pseudo-class. Tailwind escapes the colons inside a class name, so
// `dark:hover:text-white` is written `.dark\:hover\:text-white:hover`, and only the last `:hover`
// may change; the look-behind for a backslash keeps the class name intact.
//
// iOS Safari needs one more thing, in src/scripts/site.ts: it does not apply `:active` on touch at
// all unless a touchstart handler is attached (MDN browser compatibility data for `:active`).
//
// A PRESS ON A TOUCH SCREEN IS INSTANT (added 2026-09-30)
//
// The colleague saw no lift on a search result on a phone although the twin was there. A tap keeps
// `:active` for a fraction of a second, and many of these effects are animated for longer - the
// shadow of a search result for 0.3s, the pill behind a home page menu item for 0.3s, the footer icons
// for 0.2s, every Tailwind `transition` for 0.15s - so a tap ended the effect before it had shown, and
// a card that navigates took the page away as well. Each twin therefore also gets, under
// `@media (hover: none)`, a rule setting `transition-duration: 0s` on the pressed element: the effect
// appears at once under the finger and fades out at its usual speed when the finger lifts, because a
// transition takes its timing from the state it is going to. A device with a mouse matches
// `(hover: hover)` and keeps every animation as it was. An audit of the built CSS the same day found
// all 85 hover selectors already twinned; this timing was what the phones were missing.
/** @type {import("postcss").PluginCreator<void>} */
const hoverAlsoActive = () => ({
  postcssPlugin: "hover-also-active",
  // Changed 2026-09-30: takes the node constructors PostCSS hands every visitor, for the touch rule
  // described in the header.
  Rule(rule, { AtRule, Rule }) {
    if (!rule.selector.includes(":hover")) return;
    const selectors = rule.selectors;
    const added = selectors
      .filter((selector) => /(?<!\\):hover\b/.test(selector))
      .map((selector) => selector.replace(/(?<!\\):hover\b/g, ":active"))
      .filter((selector) => !selectors.includes(selector));
    // A rule already carrying its twins adds nothing, which is also what stops PostCSS visiting it
    // again and again after the change.
    if (added.length > 0) rule.selectors = [...selectors, ...added];
    // Added 2026-09-30: the instant press on a touch screen, placed right after the rule it belongs
    // to. Its selectors carry `:active` and no `:hover`, so the visitor leaves it alone.
    if (added.length === 0) return;
    const pressed = new Rule({ selectors: added });
    pressed.append({ prop: "transition-duration", value: "0s" });
    const touchOnly = new AtRule({ name: "media", params: "(hover: none)" });
    touchOnly.append(pressed);
    rule.after(touchOnly);
  },
});
hoverAlsoActive.postcss = true;

module.exports = {
  plugins: [hoverAlsoActive()],
};
