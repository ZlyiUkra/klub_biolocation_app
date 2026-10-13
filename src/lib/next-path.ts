// Where a visitor is sent after signing in (T051 of specs/001-self-hosted-club-site; tests: server/test/next-path.test.ts).
// The rule of `nextPath()` in src/scripts/auth.ts, moved here because the server now decides the redirect and the
// browser only follows it (FR-015). That function is removed with Clerk (T054); this is its one home.
//
// Why it is written this way (the paid-video consilium of 2026-09-28, .specify/consilium/2026-09-28-paid-video-
// access.md): a string test "starts with / and not //" let two addresses through that a browser reads as another
// host. `/\evil.example/` passes it and the URL parser treats the backslash as a slash; `/<TAB>/evil.example/` passes
// it too and the parser drops the tab. Both were followed by a headless browser to the other host. So the address is
// resolved the way the browser will resolve it, against the site's own origin, and only a result on that origin is
// kept, as its path, query and fragment - never the raw string.
//
// Moved again on 2026-10-11 (T056) from server/src/auth/ to here, with no change to the rule: the site's middleware uses it
// too (a signed-in visitor of the sign-in page is sent on to `next`), and a plain module here is what both programs
// compile (server/test/shared.test.ts). The server's old path re-exports it.
//
// What was added in the move, and why:
// - The origin and the fallback are arguments, not a read of `location` and `site`, because there is no `location`
//   here and the two values come from the configuration of the process.
// - A 2000-character cap on the raw value: a redirect target that long is not a page of this site, and an unbounded
//   value would be echoed into a response body and a Location header.
// - A string the URL parser rejects falls back instead of throwing, so a crafted `next` cannot turn into a 500.

const longest = 2000;

/**
 * `raw` is what the visitor's browser sent as `next`. `origin` is the site's own origin ("https://example.test"), and
 * `fallback` is where to go when `raw` is not a path of this site. Never returns the raw string.
 */
export function nextPath(
  raw: string | null | undefined,
  origin: string,
  fallback: string,
): string {
  if (raw === null || raw === undefined) return fallback;
  if (raw.length > longest || !raw.startsWith("/")) return fallback;
  try {
    const own = new URL(origin).origin;
    const url = new URL(raw, own);
    return url.origin === own ? url.pathname + url.search + url.hash : fallback;
  } catch {
    return fallback;
  }
}
