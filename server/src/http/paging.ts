// The page numbers of the panel's lists, in one place (added 2026-10-13 with the paged list of feedback messages).
//
// Until then the posts' list (content/admin-routes.ts) and the people's list (users/routes.ts) each carried their own
// copy of these three lines, and a third list was about to carry a third: twenty to a page by default, fifty at most,
// and a page or a limit that is not a whole number of at least one falls back to its default instead of being an error
// (a stale link or a hand-typed address must show a list, not a 400). The browser's pager asks for
// `site.admin.pageSize` (src/config.ts), which is the default here; change the two together.

/** How many items a list answers with when `limit` is not given or is not a number. */
export const defaultPageSize = 20;

/** The most a list answers with in one page, whatever `limit` asks. */
export const maxPageSize = 50;

/**
 * A positive whole number from a query value, capped at `max`; anything else (absent, an array, a fraction, zero, a
 * negative, text) is `fallback`.
 */
export function positiveInt(
  value: unknown,
  fallback: number,
  max: number,
): number {
  const n = typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(n) && n >= 1 ? Math.min(n, max) : fallback;
}
