// The visit counter in the browser (T190 of specs/001-self-hosted-club-site; FR-048; the markup is
// src/components/ViewCount.astro, the routes server/src/views/routes.ts). It replaces the outside counter's script: once on
// every load it tells the site's own server that the page was opened and prints the numbers that come back, the whole
// site's total in the footer and, on a post or a video, that page's own count in its header.
//
// Decisions that would otherwise look like mistakes:
// - It does not import ./auth-forms, whose `sendJson` is the site's one JSON request helper elsewhere. That module
//   brings the text of every API error (src/i18n/errors) and the helpers of the forms with it, and this script is on
//   every page, the lists and the home page included, which print none of that. (The interface dictionary is on every
//   page already, through ./site; measured in the build of 2026-11-09, this script adds about 1.5 KB to that shared
//   file.) The request here is the same one: a POST with `Content-Type: application/json`, which the cross-site guard
//   of the backend demands of every write (server/src/http/guards.ts, and the note of T153 in ./auth-forms), and a
//   body of `{}`.
// - The address of an entry's route is built here from the kind and the slug the markup carries, as the comments block
//   and the reactions do, so the page needs no second place that says what the route is.
// - A box is written hidden and shown only when its number has arrived, so a failure of any kind (no backend under
//   `astro dev`, a refusal, a network error) leaves no label with an empty number on the page. The label is already in
//   the markup, in both languages; this file writes digits with `textContent` and nothing else.
// - The admin and sign-in pages are not counted: they are the club's own work and the visitor's account, not the pages
//   a reader opens. The two prefixes are the only rule here; every other address counts, the 404 page included, as the
//   outside counter counted every page it was put on.

const notCounted = ["/admin/", "/auth/"];

/** A number from the answer's body, or null when it is not one. */
function numberOf(body: unknown, key: string): number | null {
  if (body === null || typeof body !== "object") return null;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Prints `value` into the box's number and shows the box; nothing happens when either is missing. */
function show(box: HTMLElement | null, value: number | null): void {
  if (box === null || value === null) return;
  const slot = box.querySelector<HTMLElement>("[data-view-value]");
  if (slot === null) return;
  slot.textContent = String(value);
  // The inline `display: none` of the markup is taken away; the box goes back to the display its classes give it.
  box.style.display = "";
}

async function run(): Promise<void> {
  if (notCounted.some((prefix) => location.pathname.startsWith(prefix))) return;
  const siteBox = document.querySelector<HTMLElement>(
    '[data-view-count="site"]',
  );
  const pageBox = document.querySelector<HTMLElement>(
    '[data-view-count="page"]',
  );
  if (siteBox === null && pageBox === null) return;

  const kind = pageBox?.dataset["entryKind"];
  const slug = pageBox?.dataset["entrySlug"];
  const address =
    kind && slug
      ? `/api/entries/${encodeURIComponent(kind)}/${encodeURIComponent(slug)}/views`
      : "/api/views";

  try {
    const response = await fetch(address, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      credentials: "same-origin",
    });
    if (!response.ok) return;
    const body: unknown = await response.json();
    show(siteBox, numberOf(body, "site"));
    show(pageBox, numberOf(body, "page"));
  } catch {
    // The boxes stay hidden: a counter that cannot be reached is no reason to show anything.
  }
}

void run();
