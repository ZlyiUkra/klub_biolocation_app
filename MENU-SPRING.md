# The header menu: its scroll and its spring (640px to 793px)

Written on 2026-10-01 at the owner's request, for the colleague, who built the first version of the band. The client
likes the spring, and this file explains, step by step, what was done to get there and why. The code is in
`src/components/Menu.astro` (the markup and the script, with a comment at each step) and in `tailwind.config.cjs`
(the `scrollbar-none` utility). No package was added; Vite and Clerk play no part in it.

## 1. The starting point: the colleague's version

Commit f80f6f9 (2026-09-27). Between 640px and 708px:

- `overflow-x-auto` on the div around the list, `w-max` and `px-2` on the list;
- a 2px line under the menu (`bg-gray-400/20 backdrop-blur-[3px]`), inside that div;
- the scrollbar hidden by `.scrollbar-none` rules in the component's style block.

## 2. Why nothing moved

- **The row fits.** A native scroller only scrolls what does not fit. Measured in headless Edge: with today's items
  (six for a guest, seven with Account for a member) the row fits at every width from 640px. There was nothing to
  scroll, so in DevTools the menu stood still.
- **Flex items grow.** The scrolling div, the nav and the header's right-hand group are flex items, and a flex item's
  `min-width` is `auto`. Each grew to the full width of the list, so even a row that did not fit could not scroll: it
  pushed the logo and the icons out of the header instead.
- **The variant made no CSS.** `min-[640px]:max-[708px]:scrollbar-none` generated nothing: Tailwind did not know
  `scrollbar-none` as a utility, so it could not take a variant. The plain class worked only through the style block.

## 3. Step 1: let the row shrink (commit 0bd95d1, 2026-09-28)

- `min-w-0` on the nav, on the scrolling div (`Menu.astro`) and on the header's right-hand group (`Header.astro`).
  Now they can be narrower than the list, and the list overflows inside them instead of pushing the header apart.
- The site title gives way first, so the header looks the same from 390px to 1280px.

## 4. Step 2: a real scroll wherever the row overflows (commit d88cc3c, 2026-09-30)

- **Scroll at every width.** `overflow-x-auto` is on the div at every width where the bar shows (the bar is hidden
  below 640px). Measured with three extra items: with the scroll only between 640px and 708px, the row spilled over
  the icons at 760px, 900px and 1100px.
- **A real `scrollbar-none` utility.** It is a plugin with `addUtilities` in `tailwind.config.cjs` (Tailwind 3.4
  docs, "Plugins", "Static utilities"), so it takes variants like any other class; the style block emits nothing.
- **The line moved to the nav.** It is out of the scrolling div and on the nav, which is `relative` now. An absolutely
  placed child of a scroll container scrolls with the content, so the line used to slide away with the items.
- **The band written the documented way.** It reads `sm:max-[...]` (Tailwind 3.4 docs, "Responsive Design",
  "Targeting a breakpoint range"). The band's `flex` and `flex-nowrap` were dropped: the base classes already do that.
- **The line only while there is a scroll.** A short script showed it only while the row really overflows. Shown
  across the whole band, it had promised a scroll that was not there. Step 3 changes this for the band.

## 5. Step 3: the spring (commit bb2ea1a, 2026-09-30)

A native scroller cannot move a row that fits, so a short script moves it. The owner chose option B: as close as
possible to the colleague's idea, a finger only, in the band only, with the line visible.

### When it works

- the window is 640px to 793px wide, both ends included (the colleague's band ended at 708px; the owner widened it);
- the pointer is a finger (`pointerType === "touch"`); a mouse or a pen does not move the row;
- the row fits; when it overflows, the native scroll of step 2 is there instead;
- the visitor has not asked the system for reduced motion (`prefers-reduced-motion: reduce`).

### How it works

1. **One band in CSS and in the script.** The list's classes `sm:max-[793px]:w-max sm:max-[793px]:px-2` compile to
   `@media (min-width: 640px)` with `@media (max-width: 793px)` inside it (checked in the built CSS). The script asks
   the same question through `matchMedia("(min-width: 640px) and (max-width: 793px)")` and listens to its `change`
   event. To move the band, change the classes and the query together.
2. **Overflow tracking.** A `ResizeObserver` watches the scroller, the list and the nav (when the title beside the nav
   gives way, the row moves without resizing). The row overflows when `scrollWidth - clientWidth > 1`; the one pixel
   of slack keeps a rounded-up fraction from counting. The result drives three things:
   - **The line.** In the band it is always shown, as in the colleague's version, as the hint that the row moves.
     Outside the band it shows only while the row overflows.
   - **Where the line starts.** It starts where the row starts (`left = scroller.offsetLeft`): when the row fits,
     the nav is 5px to 11px wider than the row.
   - **`touch-action`.** See the next step.
3. **`touch-action: pan-y` while the spring is on.** The browser keeps the vertical page scroll and hands the
   sideways move to the script. Without it the browser may claim the gesture and cancel the pointer
   (`pointercancel`).
4. **The start of a drag.**
   - `pointerdown` records the start for a touch pointer only.
   - Until the finger has moved 6px (`grab`) nothing happens, so a tap stays a tap.
   - A move that is mostly vertical is the page scrolling, and the drag is dropped.
5. **Resistance.** The list follows with `translateX(reach * tanh(dx / (reach * 4)))`, `reach` being 15px. It stays
   close to the finger at first, then grows tighter, and it never goes past 15px. `transition: none` while dragging,
   so the row does not lag behind the finger.
6. **The spring back.** On `pointerup` or `pointercancel` the list gets
   `transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)` and its transform is cleared. The curve overshoots
   zero a little, and that is the spring.
7. **The click after a drag.** The finger is lifted over a link, and the browser then clicks it. A click listener on
   the scroller, in the capture phase, drops clicks for 400ms after a drag (`preventDefault` and `stopPropagation`),
   so a pull never opens a page. A plain tap is not affected.

The core of it, from the script in `Menu.astro`:

```ts
const band = window.matchMedia("(min-width: 640px) and (max-width: 793px)");
const stillPlease = window.matchMedia("(prefers-reduced-motion: reduce)");
const grab = 6; // px a finger travels before a touch counts as a drag
const reach = 15; // px the row can be pulled at most
const springs = () => band.matches && !overflowing && !stillPlease.matches;

// while dragging
list.style.transform = `translateX(${reach * Math.tanh(dx / (reach * 4))}px)`;

// on release
list.style.transition = "transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)";
list.style.transform = "";
```

`Menu.astro` renders twice, once as the bar and once as the phone panel. Astro bundles the component's script into
the page once, so the script runs once, and it binds to the bar alone (`[data-menu-scroller]`).

## 6. Measured

In headless Edge on the built site:

- at 700px and at 780px the row pulled 14.5px and sprang back;
- at 794px it did not move.

## 7. How to try it

1. Chrome DevTools, the device toolbar (it emulates touch), width 700px.
2. Drag the menu sideways with the pointer: the row gives about 15px and springs back.
3. Tap an item: the page opens as usual.
4. At 800px, or outside the device mode, where the pointer is a mouse, the row does not move. With reduced motion
   emulated (DevTools, Rendering, "Emulate CSS media feature prefers-reduced-motion") it does not move either.
5. To see the native scroll of step 2 without adding a real item, paste this into the console on a page at 640px or
   wider:

   ```js
   const ul = document.querySelector("[data-menu-scroller] ul");
   for (const n of ["Library", "Events", "Contacts"]) {
     const li = ul.lastElementChild.cloneNode(true);
     li.classList.remove("members-only");
     li.querySelector("a").textContent = n;
     ul.append(li);
   }
   ```

   The row now overflows: it scrolls under a finger, or with Shift and the wheel, and the line shows at every width.
