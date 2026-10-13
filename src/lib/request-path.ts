// The address the visitor asked for, as the page should see it (T034 of specs/001-self-hosted-club-site).
//
// src/middleware.ts passes /posts/<year>/ and /video/<year>/ to the list route under the alias of the year's first
// page, /posts/<year>/page/1/. Astro.url then holds the alias, and anything that builds an address from it - the
// canonical link, og:url, the menu's current item - would print the alias. Those two readers ask this function instead,
// with the `yearList` flag the middleware set, and get the address that was asked for. For every other request it
// returns the path unchanged.

export function requestedPath(pathname: string, yearList: boolean): string {
  return yearList ? pathname.replace(new RegExp("page/1/$"), "") : pathname;
}
