// The home-page carousel's behaviour, ported from
// ../klub_biolocation/themes/void/layouts/partials/home/carousel.html (MIGRATION-PLAN.md section 4).
// Imported by src/components/Carousel.astro, which src/pages/index.astro is the only user of.
//
// Changed 2026-10-12 with the two interface languages (src/i18n/lang.ts): the pause button's label
// is written with setLangAttr(), in both languages, so it follows a language switch.
import { setLangAttr } from "./lang";
import { ui } from "../i18n/strings";
//
// Moved here on 2026-09-22. It used to be a JavaScript template literal inside Carousel.astro,
// rendered with <script is:inline set:html={js} />, which meant three things: a backtick anywhere
// in the code or its comments ended the literal and made the compiler read the script as CSS or
// prose, nothing type-checked it, and it ran inline during parsing rather than as a module. What
// it gains here is the same thing site.ts gained: astro check reads it, and the annotations below
// write down contracts the original only implied.
//
// The logic is unchanged, deliberately - same sequence, same class names, same timings. What the
// rename forced is stated at each point: the null checks the querySelector calls always needed and
// never made, and the element types the DOM API asks for.
//
// Timing note. As an is:inline block this ran while the page was being parsed; as a module it is
// deferred and runs after the document is parsed. That is safe here, and checked: the markup in
// Carousel.astro declares the first slide's is-active class and the pause button's initial icon
// state itself, so the carousel is shown correctly before this file runs at all. It only starts
// the timer and binds the controls.

(function () {
  const root = document.getElementById("home-carousel");
  if (!root) return;

  const slides = root.querySelectorAll(".void-carousel__slide");
  const dots = root.querySelectorAll(".void-carousel__dot");
  const toggle = root.querySelector(".void-carousel__toggle");
  const iconPause = root.querySelector(".void-carousel__icon-pause");
  const iconPlay = root.querySelector(".void-carousel__icon-play");
  const n = slides.length;
  if (n < 2) {
    root.classList.add("is-single");
    return;
  }

  // The controls are rendered next to the slides in Carousel.astro, so they exist whenever there
  // are two or more slides. The check is here because querySelector says `Element | null` and this
  // file is type-checked now: a missing control would otherwise be a runtime error on the home
  // page, which is exactly the class of fault the .ts move is meant to catch. Leaving the
  // carousel static is the right answer if the markup ever changes - the photos still show.
  const nextBtn = root.querySelector(".void-carousel__btn--next");
  const prevBtn = root.querySelector(".void-carousel__btn--prev");
  if (!toggle || !iconPause || !iconPlay || !nextBtn || !prevBtn) return;

  // parseInt takes a string; getAttribute returns `string | null`. The `?? ""` makes the argument
  // a string and leaves the behaviour as it was: parseInt("") is NaN, and the `||` below then
  // falls back to 3000, the same value a missing attribute produced before.
  const interval =
    parseInt(root.getAttribute("data-interval") ?? "", 10) || 3000;
  let current = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let paused = false;
  let hovered = false;
  // Added 2026-09-28: true while a finger is on the carousel. The owner's rule for touch screens:
  // holding the photo pauses it, letting go sets it moving again (the touch handlers below).
  let held = false;

  function show(k: number) {
    k = (k + n) % n;
    if (k === current) return;
    slides[current].classList.remove("is-active");
    slides[current].setAttribute("aria-hidden", "true");
    dots[current].classList.remove("is-active");
    dots[current].setAttribute("aria-selected", "false");
    current = k;
    slides[current].classList.add("is-active");
    slides[current].removeAttribute("aria-hidden");
    dots[current].classList.add("is-active");
    dots[current].setAttribute("aria-selected", "true");
  }

  /* Hugo writes iconPause.hidden = paused here, which never worked: hidden is defined on
     HTMLElement and these icons are SVGElement, so the assignment set a plain JavaScript
     property and the pause button kept its icon forever. Measured in a headless browser -
     the attribute stayed absent and the computed display stayed block. The attribute itself
     is fine, which is why the markup can still declare the initial state with it; only the
     script had to change. Fixed on 2026-09-09 at the owner's request; see MIGRATION-PLAN.md
     section 9. The warning that used to end this comment - do not write a backtick here - went
     with the move to a .ts file on 2026-09-22; a backtick is an ordinary character now. */
  function setHidden(el: Element, hidden: boolean) {
    if (hidden) el.setAttribute("hidden", "");
    else el.removeAttribute("hidden");
  }

  function next() {
    show(current + 1);
  }

  function prev() {
    show(current - 1);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function start() {
    stop();
    // Changed 2026-09-28: `held` joins the conditions (see its declaration).
    if (paused || hovered || held || document.hidden) return;
    timer = setInterval(next, interval);
  }

  nextBtn.addEventListener("click", function () {
    next();
    start();
  });
  prevBtn.addEventListener("click", function () {
    prev();
    start();
  });
  // `dot: Element` for the same reason as in site.ts: Array.prototype.forEach.call is how the
  // theme walks a NodeList, and `call` gives the callback no element type of its own.
  Array.prototype.forEach.call(dots, function (dot: Element) {
    dot.addEventListener("click", function () {
      show(parseInt(dot.getAttribute("data-index") ?? "", 10));
      start();
    });
  });
  toggle.addEventListener("click", function () {
    paused = !paused;
    toggle.setAttribute("aria-pressed", String(paused));
    // Changed 2026-10-12: both languages (it set "Resume autoplay" / "Pause autoplay").
    setLangAttr(
      toggle,
      "aria-label",
      paused ? ui.carousel_resume : ui.carousel_pause,
    );
    setHidden(iconPause, paused);
    setHidden(iconPlay, !paused);
    start();
  });
  // Changed 2026-09-28: pointerenter and pointerleave for a mouse only, where these were
  // mouseenter and mouseleave. After a tap a phone also sends the compatibility mouse events, so
  // a tap on the photo set `hovered` and nothing cleared it until the next tap elsewhere - the
  // carousel froze, which breaks the owner's rule that letting go of the photo sets it moving
  // again. A finger is handled by the touch listeners at the end of this file.
  root.addEventListener("pointerenter", function (e) {
    if (e.pointerType !== "mouse") return;
    hovered = true;
    stop();
  });
  root.addEventListener("pointerleave", function (e) {
    if (e.pointerType !== "mouse") return;
    hovered = false;
    start();
  });
  root.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight") {
      next();
      start();
    } else if (e.key === "ArrowLeft") {
      prev();
      start();
    }
  });
  document.addEventListener("visibilitychange", start);

  // Changed 2026-09-28, the owner's rule for touch screens, where the arrows are hidden
  // (carousel.css): a swipe turns the photo, as before, and a finger held on the carousel pauses it
  // until it is lifted. touchstart now stops the timer and sets `held`; touchend clears it and
  // always restarts the timer, where it used to restart it only after a swipe; touchcancel, sent
  // when the browser takes the touch over (a page scroll, a system gesture), does the same so the
  // carousel cannot stay paused with no finger on it. A tap on the pause button or a dot still
  // works: its click arrives after touchend and decides from there.
  let touchX: number | null = null;
  root.addEventListener(
    "touchstart",
    function (e) {
      touchX = e.touches[0].clientX;
      held = true;
      stop();
    },
    {
      passive: true,
    },
  );
  root.addEventListener(
    "touchend",
    function (e) {
      held = false;
      if (touchX !== null) {
        const dx = e.changedTouches[0].clientX - touchX;
        if (Math.abs(dx) > 40) {
          if (dx < 0) {
            next();
          } else {
            prev();
          }
        }
      }
      touchX = null;
      start();
    },
    {
      passive: true,
    },
  );
  root.addEventListener(
    "touchcancel",
    function () {
      touchX = null;
      held = false;
      start();
    },
    {
      passive: true,
    },
  );
  // Added 2026-09-28: on Android a long press opens the image menu through contextmenu, which
  // would end the hold the owner asked for; the owner agreed to give that menu up here. Only while a
  // finger is down, so a right-click with a mouse still gets the browser's menu.
  root.addEventListener("contextmenu", function (e) {
    if (held) e.preventDefault();
  });

  start();
})();
