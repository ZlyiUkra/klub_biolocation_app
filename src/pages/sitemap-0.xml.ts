// The sitemap, /sitemap-0.xml (task T035 of specs/001-self-hosted-club-site); the builder is src/lib/sitemap.ts, which
// has the reasons. Rendered on demand from the backend's answers for the viewer of the request, so it lists exactly the
// entries that viewer may see and a new post is in it at once.
import type { APIContext } from "astro";
import { listPosts, listVideos } from "../lib/api-client";
import { getTerms } from "../lib/terms";
import { apiPostCard } from "../lib/posts";
import { apiVideoCard } from "../lib/video";
import { sitemapAddresses, sitemapXml } from "../lib/sitemap";
// Added 2026-10-12 (T089): the cache headers of the viewer's audience; a guest's answer is shared for a few seconds,
// a signed-in account's is private.
import { audienceCached } from "../lib/audience-cache";

export async function GET(context: APIContext) {
  const request = {
    cookie: context.request.headers.get("cookie") ?? undefined,
  };
  const [posts, videos, tags, categories] = await Promise.all([
    listPosts({}, request),
    listVideos({}, request),
    getTerms("tags", request),
    getTerms("categories", request),
  ]);
  const body = sitemapXml(
    sitemapAddresses({
      origin: String(context.site),
      posts: posts.map(apiPostCard),
      videos: videos.map(apiVideoCard),
      terms: [
        ...tags.map((term) => ({ kind: "tags" as const, ...term })),
        ...categories.map((term) => ({ kind: "categories" as const, ...term })),
      ],
    }),
  );
  return audienceCached(
    context.request,
    context.locals.viewer,
    new Response(body, {
      headers: { "Content-Type": "application/xml; charset=utf-8" },
    }),
  );
}
