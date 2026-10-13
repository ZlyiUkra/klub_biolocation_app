// How long a response that depends on the viewer may be kept by someone else (T089 of specs/001-self-hosted-club-site;
// FR-007, plan phase 5). The feeds, the sitemap and the search answer hold exactly the entries the requesting audience
// may see, so the one rule is: an answer built for a visitor with no session is the same for every such visitor and
// may be shared; an answer built for a signed-in account is not.
//
// Decisions that would otherwise look like mistakes:
// - `Vary: Cookie` on both kinds, so a shared cache (nginx of plan phase 8, a browser) never gives a guest's copy to a
//   signed-in visitor or the other way round, whatever the cache key otherwise is.
// - The guest copy lives 10 seconds (`max-age`) and no longer: the owner's check of plan phase 6 says a saved post is
//   on the site within 10 seconds for a visitor. A signed-in account's answer is `private, no-store`, because a page
//   built for one person must never be kept for another, and a named person's feed holds entries nobody else sees.
// - The ETag is a hash of the body, so a conditional request after the 10 seconds costs the page's generation (the
//   backend's guest answers are cached by the content version, so that is cheap) and not the transfer.
// - "Guest" is `viewer.userId === null`: the middleware (src/middleware.ts) makes a visitor a guest also when the
//   session is unknown or must change its password, and such a visitor sees what a guest sees, so sharing is safe.
// - It lives in `src/lib/` and imports `node:crypto`: only endpoints call it, never a script the browser loads.
import { createHash } from "node:crypto";
import type { Viewer } from "./viewer";

/** Seconds a guest's answer may be reused without asking again. */
export const guestMaxAgeSeconds = 10;

/**
 * The response with the cache headers of the viewer's audience. A guest's response carries an ETag and answers 304
 * when the request's `If-None-Match` names it; a signed-in viewer's is private and never stored.
 */
export function audienceCached(
  request: Request,
  viewer: Viewer,
  response: Response,
): Promise<Response> {
  return response.text().then((body) => {
    const headers = new Headers(response.headers);
    headers.set("Vary", "Cookie");
    if (viewer.userId !== null) {
      headers.set("Cache-Control", "private, no-store");
      return new Response(body, { status: response.status, headers });
    }
    const etag = `"${createHash("sha1").update(body).digest("hex").slice(0, 20)}"`;
    headers.set("Cache-Control", `public, max-age=${guestMaxAgeSeconds}`);
    headers.set("ETag", etag);
    const asked = request.headers.get("if-none-match");
    if (asked !== null && asked.split(",").some((v) => v.trim() === etag)) {
      return new Response(null, { status: 304, headers });
    }
    return new Response(body, { status: response.status, headers });
  });
}
