// The site's one door to the backend (task T031 of specs/001-self-hosted-club-site; research.md section 2).
//
// A page asks the backend for what it shows through this module and nowhere else, one call per page, so that where the
// data comes from is decided here and the pages do not know. T015 measured the two ways a page could read: in process
// (a direct call over the pool, median 0.84 ms) and over the loopback address (1.82 ms); the second wins on the
// separation it gives (the page cannot reach the database, only what the API chooses to show), and the cost is about a
// millisecond a page. If that ever changes, only the `request` function below changes.
//
// Decisions that would otherwise look like mistakes:
// - The module imports nothing from Astro and nothing from the backend's code: the backend's answers are typed by
//   src/content/api-types.ts, which both sides import. It is plain TypeScript so that server/test/api-client.test.ts
//   can run it against the real application.
// - The origin comes from BACKEND_ORIGIN and falls back to the loopback address of PORT, the port the backend itself
//   listens on: once Astro runs inside the Express process (T036) the two share one environment and nothing has to be
//   set. It is read on every call, not at import, so a test can point it elsewhere.
// - A missing entry is `null`, never an exception: a page answers 404 for it. A hidden entry and a missing one are
//   the same answer from the API, so they are the same here. Any other failure throws `ApiError` and the page is a 500;
//   a page must never render a half answer.
// - A call gives up after five seconds. A backend that does not answer must not hold a worker for as long as the
//   visitor's browser would wait.
// - `context.cookie` is how the visitor's identity reaches the backend once sessions exist (plan phase 2): the page
//   passes the request's Cookie header on, and the backend decides who is asking. Until then every viewer is a guest
//   and nothing passes one. The answers are never cached here: they differ per viewer.
// - The answers are trusted to have the shape of api-types.ts (the backend is this repository's own, on the loopback
//   interface); the module checks the envelope and the status, not every field.

import type {
  ApiCard,
  ApiEntryAnswer,
  ApiListPage,
  ApiSearchAnswer,
  ApiTerm,
} from "../content/api-types.js";

export type {
  ApiCard,
  ApiEntry,
  ApiEntryAnswer,
  ApiListPage,
  ApiNeighbour,
  ApiPostContent,
  ApiSearchAnswer,
  ApiTerm,
  ApiVideoContent,
} from "../content/api-types.js";

/** What a call may pass on about the visitor. Empty for a guest. */
export type RequestContext = { cookie?: string };

/** Narrows a list to one tag or one category. The page, not the backend, cuts a list into years and pages. */
export type ListFilter = { tag?: string; category?: string };

/** The backend answered with something other than the answer or a plain "not found". */
export class ApiError extends Error {
  readonly status: number;
  constructor(path: string, status: number) {
    super(`The backend answered ${status} for ${path}.`);
    this.name = "ApiError";
    this.status = status;
  }
}

const timeoutMs = 5000;

function origin(): string {
  const set = process.env["BACKEND_ORIGIN"];
  if (set !== undefined && set !== "") return set.replace(/\/+$/, "");
  return `http://127.0.0.1:${process.env["PORT"] ?? "3000"}`;
}

// One GET. Returns the parsed JSON, or null for a 404; anything else that is not a 2xx throws.
async function request<T>(
  path: string,
  context: RequestContext,
): Promise<T | null> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (context.cookie !== undefined && context.cookie !== "") {
    headers["Cookie"] = context.cookie;
  }
  const response = await fetch(origin() + path, {
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new ApiError(path, response.status);
  // `JSON.parse` returns `any`, which is what the trusted-envelope rule in the header asks for; Node's own `fetch`
  // types make `response.json()` an `unknown`, and the backend's shape is checked by api-types.ts, not here.
  const body: T = JSON.parse(await response.text());
  return body;
}

async function required<T>(path: string, context: RequestContext): Promise<T> {
  const body = await request<T>(path, context);
  if (body === null) throw new ApiError(path, 404);
  return body;
}

function listPath(kind: "posts" | "videos", filter: ListFilter): string {
  const query = new URLSearchParams();
  if (filter.tag !== undefined) query.set("tag", filter.tag);
  if (filter.category !== undefined) query.set("category", filter.category);
  const text = query.toString();
  return `/api/${kind}${text === "" ? "" : "?" + text}`;
}

/** Every post the viewer may see, newest first. */
export async function listPosts(
  filter: ListFilter = {},
  context: RequestContext = {},
): Promise<ApiCard[]> {
  const body = await required<{ items: ApiCard[] }>(
    listPath("posts", filter),
    context,
  );
  return body.items;
}

/** Every video the viewer may see, newest first. */
export async function listVideos(
  filter: ListFilter = {},
  context: RequestContext = {},
): Promise<ApiCard[]> {
  const body = await required<{ items: ApiCard[] }>(
    listPath("videos", filter),
    context,
  );
  return body.items;
}

/** What one page of a list is asked for (T162). A year and a page that do not exist are a null answer. */
export type ListPageQuery = {
  /** Both kinds when absent. */
  kind?: "post" | "video";
  tag?: string;
  category?: string;
  /** The newest year with entries when absent. */
  year?: number;
  /** 1 when absent. */
  page?: number;
};

/**
 * One page of a list, cut by the backend by year and by page (T162), or null when the year or the page does not exist.
 * This is what the list routes ask for: the library is never sent to be cut here.
 */
export function getListPage(
  query: ListPageQuery = {},
  context: RequestContext = {},
): Promise<ApiListPage | null> {
  const params = new URLSearchParams();
  if (query.kind !== undefined) params.set("kind", query.kind);
  if (query.tag !== undefined) params.set("tag", query.tag);
  if (query.category !== undefined) params.set("category", query.category);
  if (query.year !== undefined) params.set("year", String(query.year));
  if (query.page !== undefined) params.set("page", String(query.page));
  const text = params.toString();
  return request<ApiListPage>(
    `/api/list${text === "" ? "" : "?" + text}`,
    context,
  );
}

/** One post with its neighbours, or null when it does not exist or the viewer may not see it. */
export function getPost(
  slug: string,
  context: RequestContext = {},
): Promise<ApiEntryAnswer | null> {
  return request<ApiEntryAnswer>(
    `/api/posts/${encodeURIComponent(slug)}`,
    context,
  );
}

/** One video with its neighbours, or null when it does not exist or the viewer may not see it. */
export function getVideo(
  slug: string,
  context: RequestContext = {},
): Promise<ApiEntryAnswer | null> {
  return request<ApiEntryAnswer>(
    `/api/videos/${encodeURIComponent(slug)}`,
    context,
  );
}

/** Tags and categories with the number of entries the viewer may see under each. */
export async function listTerms(
  context: RequestContext = {},
): Promise<ApiTerm[]> {
  const body = await required<{ terms: ApiTerm[] }>("/api/terms", context);
  return body.terms;
}

// Removed 2026-10-10 (T163, at the owner's word): getSearchIndex(), the whole index for the browser; searchContent()
// below is what the page uses.

/** What the server search is asked (T163): the words as typed and the ticked boxes; sections are kinds. */
export type SearchQuery = {
  q: string;
  sections: ("post" | "video")[];
  categories: string[];
  tags: string[];
};

/** The server search (T163): hits, facet counts and the first results for the viewer of the request. */
export function searchContent(
  query: SearchQuery,
  context: RequestContext = {},
): Promise<ApiSearchAnswer> {
  const params = new URLSearchParams();
  if (query.q !== "") params.set("q", query.q);
  if (query.sections.length > 0)
    params.set("section", query.sections.join(","));
  if (query.categories.length > 0) {
    params.set("category", query.categories.join(","));
  }
  if (query.tags.length > 0) params.set("tag", query.tags.join(","));
  const text = params.toString();
  return required<ApiSearchAnswer>(
    `/api/search${text === "" ? "" : "?" + text}`,
    context,
  );
}

/** The signed-in account behind the request's session, as `/api/auth/me` describes it. */
export type ApiViewerAccount = {
  userId: number;
  email: string;
  login: string | null;
  displayName: string;
  status:
    "guest" | "student" | "expert" | "master" | "metr" | "admin" | "blocked";
  superuser: boolean;
  /** True while the account is on a temporary password: the pages treat it as a guest until it is changed. */
  mustChange: boolean;
  /** For a blocked account: the status of whoever blocked it (T053, the account page says who closed the access). */
  blockedBy: "admin" | "metr" | null;
  /** Added 2026-10-11 (T152): the last UTC day (`YYYY-MM-DD`) the paid lectures are open to the account, or null. */
  accessUntil: string | null;
};

// Added 2026-10-11 (T052): who the request's session belongs to, or null for a visitor with none. The site's
// middleware asks once per request that carries a Cookie header; the answer is never cached.
export async function getViewerAccount(
  context: RequestContext = {},
): Promise<ApiViewerAccount | null> {
  const body = await request<{ viewer: ApiViewerAccount | null }>(
    "/api/auth/me",
    context,
  );
  return body?.viewer ?? null;
}

// Added 2026-10-11 (T169): whether the superuser setup page exists now (no superuser yet, or the emergency switch is
// on). The answer is `{ open }` and nothing about the code; a failure of the backend counts as shut, so that a page is
// never shown by mistake.
export async function getSetupOpen(): Promise<boolean> {
  try {
    const body = await request<{ open: boolean }>("/api/setup/state", {});
    return body?.open === true;
  } catch {
    return false;
  }
}
