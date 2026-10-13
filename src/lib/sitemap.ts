// The sitemap, built from what the backend says the viewer may see (task T035 of specs/001-self-hosted-club-site).
//
// It replaces @astrojs/sitemap, which could only list the pages that existed as files at build time and therefore saw
// none of the posts once they are rendered on demand. The rule it keeps is the old filter's (astro.config.mjs, in the
// comments there): no `/page/<n>/` list pages, nothing under `/auth/` and nothing under `/admin/`, which here means
// those pages are never put in the list at all. What is listed is: the static pages, every post and video, the first
// page of every year of every list, and every tag and category with its years.
//
// The addresses stay `/sitemap-index.xml` and `/sitemap-0.xml` and the XML is the package's, byte for byte, so
// crawlers that already know the site and the `link rel="sitemap"` in the head keep working. The list is sorted by
// address, as the package sorted it.
//
// Plain data in, XML out: no Astro import, so a test can run it.

import type { Card } from "./lists";
import { paginateByYear } from "./lists";
import { encodeSlug } from "./urlize";

export type SitemapInput = {
  /** The address the site is served at, with a trailing slash ("https://example.org/"). */
  origin: string;
  /** Every post and video card the viewer may see, as the list routes take them. */
  posts: Card[];
  videos: Card[];
  /** Tags and categories with their cards, from getTerms(). */
  terms: { kind: "tags" | "categories"; slug: string; cards: Card[] }[];
};

// The static pages that are part of the site for a crawler. /auth/ and /admin/ are not.
const staticPaths = [
  "/",
  "/about/",
  "/categories/",
  "/posts/",
  "/search/",
  "/tags/",
  "/video/",
];

// The addresses of the first page of every year of one list, and the list's own address.
function listPaths(cards: Card[], base: string): string[] {
  return paginateByYear(cards, base)
    .filter(
      (entry) => entry.param === undefined || !entry.param.includes("/page/"),
    )
    .map((entry) =>
      entry.param === undefined ? base : `${base}${entry.param}/`,
    );
}

/** The sorted, de-duplicated list of absolute addresses. */
export function sitemapAddresses(input: SitemapInput): string[] {
  const paths = new Set<string>(staticPaths);
  for (const path of listPaths(input.posts, "/posts/")) paths.add(path);
  for (const path of listPaths(input.videos, "/video/")) paths.add(path);
  for (const card of [...input.posts, ...input.videos]) paths.add(card.url);
  for (const term of input.terms) {
    for (const path of listPaths(
      term.cards,
      `/${term.kind}/${encodeSlug(term.slug)}/`,
    )) {
      paths.add(path);
    }
  }
  const origin = input.origin.replace(new RegExp("/$"), "");
  return [...paths].map((path) => origin + path).sort();
}

const urlsetOpen =
  '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">';

/** The body of /sitemap-0.xml. */
export function sitemapXml(addresses: string[]): string {
  return (
    urlsetOpen +
    addresses.map((address) => `<url><loc>${address}</loc></url>`).join("") +
    "</urlset>"
  );
}

/** The body of /sitemap-index.xml, which points at /sitemap-0.xml. */
export function sitemapIndexXml(origin: string): string {
  const base = origin.replace(new RegExp("/$"), "");
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${base}/sitemap-0.xml</loc></sitemap></sitemapindex>`;
}
