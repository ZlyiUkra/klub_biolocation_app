// The posts: everything the site knows about the `posts` collection, and nothing about the
// videos (src/lib/video.ts). Until 2026-09-22 this file also held the list helpers - the
// pages, the years, the switcher's rule - typed to posts; they are in src/lib/lists.ts now,
// generic, because the Video list uses them too and the owner asked for the two kinds of entry
// to stay apart with only what is truly common shared (VIDEO-PAGE.md, section 4). What stays
// here is what only a post has: the terms, the reading time, and how a post becomes a Card of
// a list or a NavLink of an article page.
import type { CollectionEntry } from "astro:content";
// urlize and titleize used to be imported here for getTerms(); they moved to lib/lists.ts with
// collectTerms() on 2026-09-22 and nothing in this file needs them any more.
import { summary } from "./summary";
import {
  published,
  type Card,
  type NavLink,
  type TermKind,
  type TermSource,
  type SearchSource,
} from "./lists";
// Changed 2026-10-12 with the two interface languages (src/i18n/lang.ts): ui (was t).
// import { t } from "../i18n/strings";
import { ui } from "../i18n/strings";

export type Post = CollectionEntry<"posts">;

// The published posts, newest first. The rule - drafts and future dates left out in
// production, the order by date with its tie-breaks - is published() in lists.ts, with its
// history; it was the body of this function until 2026-09-22.
export async function getPosts(): Promise<Post[]> {
  return published("posts");
}

/** A post's own page, /posts/<slug>/. */
// Moved 2026-10-02 to src/lib/post-url.ts and re-exported here, so every caller keeps importing it
// from this file; the admin panel's browser script imports it from there instead, because this file
// brings astro:content with it (post-url.ts says what that cost). It now takes anything with a slug.
import { postUrl } from "./post-url";
// Added 2026-10-10 (T139): the card mapper for what the backend sends.
import type {
  ApiCard,
  ApiNeighbour,
  ApiPostContent,
} from "../content/api-types";
export { postUrl };

// What a list shows of a post. Hugo's list.html and tag.html read these off the page object:
// .RelPermalink, .Title, .Date, `.Summary | plainify | truncate 140` (summary() in
// lib/summary.ts, see its header for the one known divergence), .Params.tags, and the i18n
// string list_read_more for the last line.
export function postCard(post: Post): Card {
  return {
    url: postUrl(post),
    title: post.data.title,
    date: post.data.date,
    summary: summary(post.body),
    tags: post.data.tags,
    // Changed 2026-10-12: the Phrase, both languages (was t.list_read_more).
    action: ui.list_read_more,
  };
}

/** A card of the Posts list from what the API sends (T139); the same shape as postCard(). */
export function apiPostCard(card: ApiCard): Card {
  return {
    url: postUrl(card),
    title: card.title,
    date: new Date(card.date),
    summary: card.summary,
    tags: card.tags,
    action: ui.list_read_more,
    // Added 2026-10-12 (T090): a card the viewer sees without its content carries the lock.
    locked: card.view === "teaser",
  };
}

/**
 * What the post page needs of one post, as plain data (T034): Post.astro takes this and not a collection entry, so the
 * page is the same whether the post came from a file or from the backend.
 */
export type PostPageData = {
  slug: string;
  title: string;
  description: string;
  date: Date;
  lastmod: Date | undefined;
  categories: string[];
  tags: string[];
  readingMinutes: number;
  shareTitle: string | undefined;
  shareDescription: string | undefined;
  summary: string;
};

/** Maps the API's card and post content onto PostPageData (T034). */
export function postPageData(
  card: ApiCard,
  content: ApiPostContent,
): PostPageData {
  return {
    slug: card.slug,
    title: card.title,
    description: card.description,
    date: new Date(card.date),
    lastmod: content.lastmod === null ? undefined : new Date(content.lastmod),
    categories: card.categories,
    tags: card.tags,
    readingMinutes: content.readingMinutes,
    shareTitle: content.shareTitle ?? undefined,
    shareDescription: content.shareDescription ?? undefined,
    summary: card.summary,
  };
}

/** The previous or next link of a post page from what the API sends (T034). */
export function apiPostLink(neighbour: NonNullable<ApiNeighbour>): NavLink {
  return { url: postUrl(neighbour), title: neighbour.title };
}

/** A post as the previous or next link of a post page. */
export function postLink(post: Post): NavLink {
  return { url: postUrl(post), title: post.data.title };
}

// Replaced on 2026-09-22. What stood here was `export type Term` and `getTerms(kind)`, which
// grouped posts by their tags or categories and returned the posts themselves. Both moved: the
// shape and the grouping are collectTerms() in lib/lists.ts, and what asks for the terms of the
// whole site is lib/terms.ts. The comment that explained Hugo's `.Data.Terms.Alphabetical`
// moved with the code and is quoted there in full.
//
// The reason for the move is a defect the reviewer found: term pages were built from this file
// alone, so /tags/video/ was built by nobody although ten videos carry that tag, and
// /tags/биолокация/ listed articles only although videos carry it too (REVIEW-VIDEO.md, remarks
// 2 and 3). A term is a subject, and a subject does not stop at a collection boundary.
//
// What is left here is this file's half of the work, and it stays inside the owner's rule that
// the two kinds of entry share code only on plain data (VIDEO-PAGE.md, section 4): posts.ts
// knows the posts collection and hands out flat data, video.ts does the same for videos, and
// neither learns about the other.

/** A post as the search index takes it; the shape is SearchSource in lib/lists.ts. */
export function postSearch(post: Post): SearchSource {
  return {
    card: postCard(post),
    categories: post.data.categories,
    text: post.body,
  };
}

/** Every published post as the term builder takes it: the names it declares, and its card. */
export async function postTerms(kind: TermKind): Promise<TermSource[]> {
  return (await getPosts()).map((post) => ({
    names: post.data[kind],
    card: postCard(post),
  }));
}

// Hugo: math.Round (div (countwords .Content) 200.0)
// Changed 2026-10-10 (T034): the function is in src/lib/reading-time.ts, which imports nothing, so that the backend
// computes the same number; it is re-exported here and every caller keeps importing it from this file.
export { readingTime } from "./reading-time";
