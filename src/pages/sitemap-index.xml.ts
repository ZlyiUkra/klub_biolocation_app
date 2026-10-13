// The sitemap index, /sitemap-index.xml (task T035 of specs/001-self-hosted-club-site): one entry, /sitemap-0.xml, as
// @astrojs/sitemap wrote it. The builder is src/lib/sitemap.ts.
import type { APIContext } from "astro";
import { sitemapIndexXml } from "../lib/sitemap";

export function GET(context: APIContext) {
  return new Response(sitemapIndexXml(String(context.site)), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
