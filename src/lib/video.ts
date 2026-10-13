// The videos: everything the site knows about the `video` collection (src/content/video/), and
// nothing about the posts. The colleague's file of this name (2026-09-20 to 2026-09-22) was a
// copy of src/lib/posts.ts with the names changed; since 2026-09-22 the shared rules - the
// filter and the order, the pages, the years - live in src/lib/lists.ts, and this file only
// says how a video becomes what those helpers and the shared components work with: a Card of
// a list and a NavLink of an article page. VIDEO-PAGE.md, section 4.
//
// Changed 2026-10-12 (T183 of specs/001-self-hosted-club-site): the build-time half of this file is gone. It read the
// `video` collection (`getVideos()`, `videoCard()`, `videoLink()`, `videoTerms()`, `videoSearch()`) and kept the
// members-only block out of cards, the feed and the search with `publicBody()` and `membersOnlyHeadings()`; since the
// pages are rendered from the backend (T139, T081) nothing called any of them, and the rule they stood for lives in one
// place, the backend (`server/src/access/entries.ts` for what a viewer may read, `server/src/cli/import-content.ts`
// with `src/content/video-guards.ts` and `src/lib/members-only.ts` for what an import accepts). Left here: the mapping of
// the API's answers onto the shapes the components take.
import { type Card, type NavLink } from "./lists";
// Changed 2026-10-12 with the two interface languages (src/i18n/lang.ts): ui (was t).
import { ui } from "../i18n/strings";

// Added 2026-10-10 (T139 of specs/001-self-hosted-club-site): the backend's answers are the data of these pages now.
// A video as the API sends it is mapped here, in the file that knows what a video is, onto the same plain shapes
// (Card, NavLink) the shared list code and the shared components take.
import type {
  ApiCard,
  ApiNeighbour,
  ApiVideoContent,
} from "../content/api-types";

// Added 2026-10-12 (T175): the address helper lives in video-url.ts (see videoUrl below).
import { videoUrl } from "./video-url";

/** A video's own page, /video/<slug>/. */
// Changed 2026-10-10 (T139): takes anything with a slug, so the API's cards and the collection's entries both fit.
// Changed 2026-10-12 (T175): defined in video-url.ts, which imports nothing, so the panel's browser script can use it;
// re-exported here so that every other caller is unchanged.
export { videoUrl };

/** A card of the Video list from what the API sends (T139); the shape is Card in lists.ts. */
export function apiVideoCard(card: ApiCard): Card {
  return {
    url: videoUrl(card),
    title: card.title,
    date: new Date(card.date),
    summary: card.summary,
    tags: card.tags,
    // Changed 2026-10-12: the Phrase, both languages (was t.list_watch_video).
    action: ui.list_watch_video,
    // Added 2026-10-12 (T090): a card the viewer sees without its content carries the lock.
    locked: card.view === "teaser",
  };
}

/** The previous or next link of a video page from what the API sends (T139). */
export function apiVideoLink(neighbour: NonNullable<ApiNeighbour>): NavLink {
  return { url: videoUrl(neighbour), title: neighbour.title };
}

/**
 * What the video page needs of one video, as plain data (T139): VideoLayout.astro takes this and not a collection
 * entry, so the page is the same whether the entry came from a file or from the backend.
 */
export type VideoPageData = {
  slug: string;
  title: string;
  description: string;
  date: Date;
  tags: string[];
  categories: string[];
  duration: string | undefined;
  paid: boolean;
  /** The embed id of a public video; undefined for a paid lecture, which carries none. */
  videoId: string | undefined;
  /** Added 2026-10-11 (T082): the provider of a public video's embed id (youtube, vk, rutube, yandex-disk); undefined for a paid lecture. */
  platform: string | undefined;
  /** Added 2026-10-11 (T152): the backend's answer to "may this viewer play it"; `expired` closes the player. */
  lecture: "open" | "guest" | "no_access" | "blocked" | "expired";
  /** Added 2026-10-11 (T152): the last UTC day the video is available, `YYYY-MM-DD`. */
  availableUntil: string;
};

/** Maps the API's card and video content onto VideoPageData (T139). */
export function videoPageData(
  card: ApiCard,
  content: ApiVideoContent,
): VideoPageData {
  return {
    slug: card.slug,
    title: card.title,
    description: card.description,
    date: new Date(card.date),
    tags: card.tags,
    categories: card.categories,
    duration: content.duration ?? undefined,
    paid: content.paid,
    videoId: content.externalId ?? undefined,
    platform: content.platform ?? undefined,
    lecture: content.lecture,
    availableUntil: content.availableUntil,
  };
}
