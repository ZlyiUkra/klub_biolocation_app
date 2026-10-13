// The site's middleware (task T033 of specs/001-self-hosted-club-site).
//
// It puts the viewer of the request into `Astro.locals.viewer`, once, before any page or endpoint runs, so that a page
// never works out who is looking for itself (research.md section 2; the type is in src/env.d.ts).
//
// Decisions that would otherwise look like mistakes:
// - Today every viewer is a guest. The sign-in of plan phase 2 replaces the call to `guestViewer()` below with a read of
//   the session through src/lib/api-client.ts (T052); the pages do not change.
// - It reads nothing from the request except the address. A prerendered page runs this at build time, where there is no
//   request, and Astro warns when headers are read there; the session read of phase 2 will be guarded the same way (T142
//   decides how the pages that stay static get a header that is right at first paint).
//
// Added 2026-10-10 (T034): the address of a year's list, /posts/2025/ and /video/2025/, is also a single segment, which
// the router gives to the single-entry route (a named parameter beats a rest parameter), so that /posts/2025/ would be
// looked up as a post called "2025". The build never met this because it wrote the files itself. A year is not a slug
// here (no entry may be named after one: CONTENT.md, the templates), so the request is passed on to the list route
// under its first page's alias and the list route accepts that alias only when this rewrite set `yearList`; asked for
// directly, /posts/2025/page/1/ stays a 404, as before.
import { defineMiddleware } from "astro:middleware";
// Added 2026-10-10 (T035): the second thing this file does about addresses. `trailingSlash: "always"` makes an on-demand
// route answer only with a slash after it, an endpoint's file name included: /rss.xml was a 404 and /rss.xml/ was 200
// (measured on the built server, 2026-10-10; it was only the dev server's rule while every endpoint was a built file).
// The feeds, the search index and the sitemaps have to answer at the address without the slash - it is the one in the
// head of every page and in every reader's subscription - so a path whose last segment has a file extension is handed
// to the route with the slash added, inside the server; the visitor sees the address they asked for.
import { guestViewer, type Viewer } from "./lib/viewer";
// Added 2026-10-11 (T052): the session read.
import { getViewerAccount, type ApiViewerAccount } from "./lib/api-client";
// Added 2026-10-11 (T056): the rule for where a signed-in visitor of the sign-in page goes, and the page addresses.
import { nextPath } from "./lib/next-path";
import { site } from "./config";

const yearAddress = new RegExp("^/(posts|video)/([0-9]{4})/$");
const fileAddress = new RegExp("^/(?:[^/]+/)*[^/]+[.][A-Za-z0-9]+$");

// Changed 2026-10-11 (T052): the viewer is read from the session through the backend. The Cookie header goes on to
// `/api/auth/me`, which says who the session belongs to; a request without a Cookie header is a guest and costs no
// call. A session that must change its password is a guest here, as it is for the content API (server/src/auth/
// viewer.ts), and a backend that cannot answer leaves the visitor a guest: the pages that need the backend fail on
// their own reads, and a public page must not fail because the header could not be drawn for a member.
// Changed 2026-10-11 (T056): it also hands back the account itself, so the /auth/ rules below can tell a session that
// must change its password (which `viewer` shows as a guest) from a visitor with no session at all.
async function viewerOfRequest(
  request: Request,
): Promise<{ viewer: Viewer; account: ApiViewerAccount | null }> {
  const cookie = request.headers.get("cookie");
  if (cookie === null || cookie === "") {
    return { viewer: guestViewer(), account: null };
  }
  try {
    const account = await getViewerAccount({ cookie });
    if (account === null || account.mustChange) {
      return { viewer: guestViewer(), account };
    }
    return {
      viewer: { userId: account.userId, status: account.status },
      account,
    };
  } catch {
    return { viewer: guestViewer(), account: null };
  }
}

// Added 2026-10-11 (T056 of specs/001-self-hosted-club-site; FR-016): who may see which of the three /auth/ pages is
// decided here, before the page is rendered, and not by a script in the browser after the form has already been shown.
// Source: Astro 4.16, "Middleware" (`onRequest()` must return a Response, directly or by calling `next()`).
// - A visitor with no session sees sign-in and sign-up, and is sent from the account page to sign-in.
// - A signed-in visitor is sent from sign-in and sign-up to `next` when that is a page of this site (the rule is
//   src/lib/next-path.ts, the one the backend uses), otherwise to the account page. A `next` that is itself the
//   sign-in or sign-up page would loop, so it counts as "not a page worth going to".
// - A session that must change its password is sent from sign-in and sign-up to the account page, where only the change
//   form is shown. The rest of the site is open to it as to a guest (the owner's choice of 2026-10-11).
// - Every redirect is `no-store`, so the Back button asks again instead of showing a cached decision.
function authPageRedirect(
  pathname: string,
  url: URL,
  account: ApiViewerAccount | null,
): string | null {
  const { signIn, signUp, account: accountPage } = site.auth;
  if (pathname === accountPage) {
    return account === null ? signIn : null;
  }
  if (pathname !== signIn && pathname !== signUp) return null;
  if (account === null) return null;
  if (account.mustChange) return accountPage;
  const target = nextPath(
    url.searchParams.get("next"),
    url.origin,
    accountPage,
  );
  const loops = target.startsWith(signIn) || target.startsWith(signUp);
  return loops ? accountPage : target;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { viewer, account } = await viewerOfRequest(context.request);
  context.locals.viewer = viewer;
  context.locals.passwordChangePending = account?.mustChange === true;
  // Added 2026-10-13 (T110, T147): whether the request's account holds the superuser role (a session that must change
  // its password counts as none), so a page that is the superuser's alone, and the panel's row of links, decide it with
  // no second call to the backend. The backend still decides every write; this only draws or hides.
  context.locals.superuser =
    account !== null && !account.mustChange && account.superuser === true;
  const away = authPageRedirect(context.url.pathname, context.url, account);
  if (away !== null) {
    return new Response(null, {
      status: 302,
      headers: { Location: away, "Cache-Control": "no-store" },
    });
  }
  const year = yearAddress.exec(context.url.pathname);
  if (year !== null) {
    context.locals.yearList = true;
    return next(`/${year[1]}/${year[2]}/page/1/`);
  }
  if (fileAddress.test(context.url.pathname)) {
    return next(`${context.url.pathname}/`);
  }
  return next();
});
