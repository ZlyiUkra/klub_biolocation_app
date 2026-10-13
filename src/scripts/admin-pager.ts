// The pager under a list of the admin panel, in the browser; the markup is
// src/components/AdminPager.astro, whose header says where it comes from. Added 2026-10-02 at the
// owner's request (20 to a page, site.admin.pageSize). Used by admin-posts.ts, which pages a list it
// already holds, and admin-users.ts, which asks the status service for one page at a time.
//
// Which numbers show is the site's rule, site.pagination.everyNumberUpTo: every number up to that
// many pages, beyond it the first, the current and the last page with an ellipsis for each run of
// skipped pages ("1 ... 7 ... 20"). It is pageNumbers() in src/lib/lists.ts without the addresses,
// and the same as numbers() in account-devices.ts; lists.ts cannot be imported here, because it
// imports astro:content (CLAUDE.md, the browser-script pitfall). Change the three together, and
// scripts/check-pagination.mjs, which mirrors the rule for the built lists.
import { site } from "../config";
// Added 2026-10-12 with the two interface languages (src/i18n/lang.ts): the page labels in both.
import { ui } from "../i18n/strings";
import { setLangAttr } from "./lang";

/** The numbers to show for page `current` of `last`, with "gap" for each run of skipped pages. */
export function pageEntries(current: number, last: number): (number | "gap")[] {
  const shown =
    last <= site.pagination.everyNumberUpTo
      ? Array.from({ length: last }, (_, i) => i + 1)
      : [...new Set([1, current, last])];
  const out: (number | "gap")[] = [];
  let previous = 0;
  for (const n of shown) {
    if (n - previous > 1) out.push("gap");
    out.push(n);
    previous = n;
  }
  return out;
}

/** The number of pages a list of `total` items fills, at least one. */
export function pageCount(
  total: number,
  // Changed 2026-10-11 (T146): the account page's devices are five to a page (the site's rule, site.pagination.pageSize)
  // and pass it here; the admin lists keep the default of 20.
  size: number = site.admin.pageSize,
): number {
  return Math.max(1, Math.ceil(total / size));
}

/**
 * Binds the pager nav with id `id` (AdminPager.astro). `go` is called with the page a click asks
 * for; the returned function draws the pager for page `page` of `last`. Undefined when the nav or
 * a part of it is missing, which leaves the list unpaged rather than broken.
 */
export function bindPager(
  id: string,
  go: (page: number) => void,
): ((page: number, last: number) => void) | undefined {
  const nav = document.getElementById(id);
  const prev = nav?.querySelector<HTMLButtonElement>("[data-pager-prev]");
  const next = nav?.querySelector<HTMLButtonElement>("[data-pager-next]");
  const numbers = nav?.querySelector<HTMLElement>("[data-pager-numbers]");
  if (
    nav === null ||
    nav === undefined ||
    prev === null ||
    prev === undefined ||
    next === null ||
    next === undefined ||
    numbers === null ||
    numbers === undefined
  ) {
    return undefined;
  }
  const clone = (name: string): Element | undefined => {
    const template = nav.querySelector(`template[data-pager-${name}]`);
    const node =
      template instanceof HTMLTemplateElement
        ? template.content.firstElementChild?.cloneNode(true)
        : undefined;
    return node instanceof Element ? node : undefined;
  };
  let shown = 1;
  prev.addEventListener("click", () => go(shown - 1));
  next.addEventListener("click", () => go(shown + 1));

  return (page, last) => {
    shown = page;
    nav.classList.toggle("hidden", last <= 1);
    prev.disabled = page <= 1;
    next.disabled = page >= last;
    numbers.replaceChildren(
      ...pageEntries(page, last).flatMap((entry) => {
        const node = clone(
          entry === "gap" ? "gap" : entry === page ? "current" : "number",
        );
        if (node === undefined) return [];
        if (entry !== "gap") {
          node.textContent = String(entry);
          if (entry !== page) {
            // Changed 2026-10-12: both languages (it was "Страница n").
            setLangAttr(node, "aria-label", ui.pagination_page(entry));
            node.addEventListener("click", () => go(entry));
          }
        }
        return [node];
      }),
    );
  };
}
