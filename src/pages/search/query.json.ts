// The search, /search/query.json (T163 of specs/001-self-hosted-club-site; owner's decision of 2026-10-10: the search
// runs on the server with the rules the browser used). The page script asks this endpoint instead of downloading
// /search/data.json: the whole index is 21 MB at 10 000 posts, an answer is a few kilobytes.
//
// What this file does is the part that belongs to the site and not to the backend: the backend knows entries by kind
// and slug, and only `postUrl()` and `videoUrl()` know an address; the labels of the sections ("Posts", "Video") are
// the site's configuration (src/config.ts). So the checkbox values the page keeps in its own address ("section=Posts")
// are turned into kinds on the way out, and the kinds of the answer into addresses and labels on the way back. The
// rest, the matching, the scores, the snippets and the counts, is the backend's and is not repeated here.
//
// The name is query.json.ts for the reason data.json.ts is not index.json.ts: an endpoint named index.<ext> collides
// with src/pages/search/index.astro.
import type { APIRoute } from "astro";
// Added 2026-10-12 (T089): the cache headers of the viewer's audience; a guest's answer is shared for a few seconds,
// a signed-in account's is private.
import { audienceCached } from "../../lib/audience-cache";
import { searchContent } from "../../lib/api-client";
import { postUrl } from "../../lib/post-url";
import { videoUrl } from "../../lib/video";
import { site } from "../../config";

type Kind = "post" | "video";

// Changed 2026-10-12 with the two interface languages: the index and the filters speak in the section's key
// (the keys of site.searchSections), not its label, because a label is a Phrase in two languages now. The page's
// checkboxes carry the key as their value and print the name through T.
const kindOfKey = new Map<string, Kind>([
  ["posts", "post"],
  ["video", "video"],
]);
const keyOfKind: Record<Kind, keyof typeof site.searchSections> = {
  post: "posts",
  video: "video",
};

export const GET: APIRoute = async ({ request, url, locals }) => {
  const cookie = request.headers.get("cookie") ?? undefined;
  const labels = (url.searchParams.get("section") ?? "")
    .split(",")
    .filter(Boolean);
  const kinds = labels
    .map((label) => kindOfKey.get(label))
    .filter((kind): kind is Kind => kind !== undefined);
  // A label no entry carries matches nothing, as it did when the browser compared the labels itself: when every box
  // named is unknown the filter is "nothing", not "no filter".
  const nothing = labels.length > 0 && kinds.length === 0;

  const answer = await searchContent(
    {
      q: url.searchParams.get("q") ?? "",
      sections: nothing ? [] : kinds,
      categories: (url.searchParams.get("category") ?? "")
        .split(",")
        .filter(Boolean),
      tags: (url.searchParams.get("tag") ?? "").split(",").filter(Boolean),
    },
    { cookie },
  );

  const body = {
    total: answer.total,
    shown: nothing ? 0 : answer.shown,
    counts: {
      section: Object.fromEntries(
        Object.entries(answer.counts.section).map(([kind, n]) => [
          keyOfKind[kind === "video" ? "video" : "post"],
          n,
        ]),
      ),
      category: answer.counts.category,
      tag: answer.counts.tag,
    },
    results: nothing
      ? []
      : answer.results.map((result) => ({
          url: result.kind === "post" ? postUrl(result) : videoUrl(result),
          title: result.title,
          date: result.date,
          section: keyOfKind[result.kind],
          snippet: result.snippet,
          tags: result.tags,
        })),
  };
  return audienceCached(
    request,
    locals.viewer,
    new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json; charset=utf-8" },
    }),
  );
};

// Rendered on demand like data.json.ts: the answer depends on who is asking and on what is stored now.
