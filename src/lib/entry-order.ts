// The order of every list of entries on the site, in a module of its own with no imports (T030 of
// specs/001-self-hosted-club-site). It was the sort inside `published()` of src/lib/lists.ts; the backend's read API
// has to order the same entries the same way, because a page cuts its lists into pages on that order and two entries
// with the same date must never swap places between the site and the API.
//
// Newest first by date. Then the title, then the address: before 2026-09-19 two entries with the same date kept
// whatever order the collection returned them in, and with pagination such a pair on the boundary between two pages
// could swap pages from one build to the next (PAGINATION.md). The title comes first because Hugo's default order
// also falls back to it; the address settles two entries with the same title, since no two share one.
// `localeCompare` is the same call the site used, so the two orders cannot differ on Cyrillic and Latin titles.

export type Orderable = { date: Date; title: string; slug: string };

export function compareNewestFirst(a: Orderable, b: Orderable): number {
  return (
    b.date.getTime() - a.date.getTime() ||
    a.title.localeCompare(b.title) ||
    a.slug.localeCompare(b.slug)
  );
}

// Added 2026-10-10 (T162): the order of a list that merges posts and videos (a tag or a category page). It is what the
// site produced before the backend cut the lists: the posts and the videos were concatenated, posts first, and sorted
// on the date alone with a stable sort, so entries with the very same instant kept "posts before videos" and, inside a
// kind, compareNewestFirst() order. Written out as one comparator so the backend gives the same answer byte for byte.
export type OrderableOfKind = Orderable & { kind: "post" | "video" };

export function compareMergedNewestFirst(
  a: OrderableOfKind,
  b: OrderableOfKind,
): number {
  return (
    b.date.getTime() - a.date.getTime() ||
    (a.kind === b.kind ? 0 : a.kind === "post" ? -1 : 1) ||
    compareNewestFirst(a, b)
  );
}
