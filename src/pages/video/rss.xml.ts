// The video feed, /video/rss.xml. The companion of /rss.xml; see the notes there for why there
// are two feeds rather than one, and why both could only be built once the deploy address was
// settled.
//
// This file knows the `video` collection and nothing else, the way lib/video.ts does: a reader
// who subscribes here gets the lectures and not the articles.
import rss from "@astrojs/rss";
import type { APIContext } from "astro";
// publicBody added 2026-09-28 (members-only blocks, lib/video.ts).
// Changed 2026-10-10 (T035 of specs/001-self-hosted-club-site): the entries come from the backend, rendered on demand.
// The card summary it sends is made from the public part of the text, so a members-only block never reaches the feed.
import { listVideos } from "../../lib/api-client";
import { videoUrl } from "../../lib/video";
import { site } from "../../config";
// Added 2026-10-12 (T089): the cache headers of the viewer's audience; a guest's answer is shared for a few seconds,
// a signed-in account's is private.
import { audienceCached } from "../../lib/audience-cache";
// Changed 2026-10-12 with the two interface languages (src/i18n/lang.ts): ui (was t).
// import { t } from "../../i18n/strings";
import { ui } from "../../i18n/strings";

// The same rolling window as the posts feed, and for the same reasons - see the note next to
// feedLength in src/pages/rss.xml.ts. The number is repeated rather than shared: the two feeds are
// separate subscriptions, and either one may want a different depth later without disturbing the
// other. There are ten lectures today, so this limit does nothing yet; it is here so that the two
// files behave alike when the collection grows.
const feedLength = 20;

export async function GET(context: APIContext) {
  const videos = await listVideos(
    {},
    { cookie: context.request.headers.get("cookie") ?? undefined },
  );

  const feed = await rss({
    // The feed's own title says which half of the site it carries, so the two feeds are told apart
    // in a reader. "Video" is the menu item's label (src/config.ts), kept as it is written there.
    title: `${site.title} - Video`,
    // Changed 2026-10-12: the default language's text (site.i18n.defaultLanguage) - a feed has one
    // language and no switch. It was t.list_watch_video, the same English string.
    description: ui.list_watch_video[site.i18n.defaultLanguage],
    site: context.site ?? site.title,
    items: videos.slice(0, feedLength).map((video) => ({
      title: video.title,
      pubDate: new Date(video.date),
      // Changed 2026-09-28: publicBody(), so a members-only block never reaches the feed.
      // Changed 2026-10-10 (T035): the card's summary is made from the public part by the backend.
      description: video.description || video.summary,
      link: videoUrl(video),
      categories: video.tags,
    })),
    customData: `<language>${site.language}</language>`,
  });
  return audienceCached(context.request, context.locals.viewer, feed);
}

// Changed 2026-10-10 (T035): the `prerender = true` line that T032 put here is gone; the feed is rendered on demand.
