// The visit counter's routes (T190 of specs/001-self-hosted-club-site; FR-048; migration 024; tests:
// server/test/views.test.ts). The page calls one of them once on every load and prints the numbers it gets back; the
// rows are in server/src/access/views.ts.
//
//   POST /api/views                              -> { site }          for a page that is not a post or a video
//   POST /api/entries/:kind/:slug/views          -> { page, site }    for a post or a video
//
// Decisions that would otherwise look like mistakes:
// - Every load counts, as the outside counter this replaces counted (the owner's word, 2026-11-09): not one count per
//   visitor and not one per day. Nothing about the visitor is stored, so there is nothing to tell two loads of one person
//   from two loads of two people; the only thing remembered about an address is in memory (the window below) and is never
//   written to the database.
// - The numbers are answered to everybody, a load that is not counted included, so a page always has something to print.
//   A load is not counted in two cases: the program is not a person's browser (below), or the address has already added
//   as many as the window allows. Neither is an error for the page.
// - Not a person: a request with no User-Agent, or one whose User-Agent names a crawler, a monitor or a command-line
//   client (`botPattern`). It is a short list, and no standard defines one: a crawler that hides its name is counted, and
//   a browser whose name happens to contain one of the words is not. The list is the one place that decides, as the
//   third principle of the constitution asks.
// - The window is `AddressLimiter`, the same sliding window the sign-in and the feedback form use, so there is one
//   implementation of it; a counted load is what it records. It stops a script that posts in a loop, not a determined
//   person: a counter that must not be raised by hand would need an account, and the owner asked for the plain kind.
// - An entry the viewer may not see answers 404 here as it does everywhere (the constitution's fourth principle), and
//   then nothing is counted, neither for the entry nor for the site, so the route tells nothing about an entry that is
//   not the viewer's.
// - Every answer is no-store: the numbers move with every load.

import { Router, type Request } from "express";
import type { Pool } from "../db/pool.js";
import { viewerOfRequest } from "../auth/viewer.js";
import { visibleEntryId } from "../access/comments.js";
import {
  readEntryViews,
  readSiteViews,
  recordEntryView,
  recordSiteView,
} from "../access/views.js";
import { AddressLimiter } from "../auth/limits.js";
import { limiterKeyOf } from "../auth/routes.js";
import { sendError } from "../http/errors.js";
import { entryKinds } from "../comments/routes.js";

/** The numbers of this route in one block, like `feedbackLimits`: the window of counted loads of one address. */
export const viewLimits = {
  /** Loads one address may add inside the window; the next ones are answered with the numbers and not counted. */
  maxPerWindow: 120,
  /** Ten minutes. */
  windowMs: 10 * 60 * 1000,
} as const;

/**
 * What a User-Agent must not contain to be a person's browser. Crawlers and link-preview fetchers ("bot", "crawl",
 * "spider", "slurp", "preview", "facebookexternalhit"), checkers ("monitor", "probe", "uptime", "lighthouse",
 * "headless") and command-line or library clients ("curl", "wget", "python-requests", "go-http-client", "okhttp",
 * "httpclient", "libwww") are not counted.
 */
export const botPattern =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|monitor|probe|uptime|lighthouse|headless|curl|wget|python-requests|go-http-client|okhttp|httpclient|libwww/i;

/** Whether the User-Agent of a request is a person's browser as far as a counter can tell. */
export function isPersonsBrowser(userAgent: string | undefined): boolean {
  return (
    userAgent !== undefined && userAgent !== "" && !botPattern.test(userAgent)
  );
}

export function viewsRouter({ pool }: { pool: Pool }): Router {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  const loads = new AddressLimiter({
    maxFailures: viewLimits.maxPerWindow,
    windowMs: viewLimits.windowMs,
  });

  /** Whether this request is to be counted; when it is, its place in the window is taken at once. */
  function counts(req: Request): boolean {
    if (!isPersonsBrowser(req.get("user-agent"))) return false;
    const key = limiterKeyOf(req.ip);
    const now = new Date();
    if (!loads.check(key, now).allowed) return false;
    loads.recordFailure(key, now);
    return true;
  }

  router.post("/views", async (req, res) => {
    const site = counts(req)
      ? await recordSiteView(pool)
      : await readSiteViews(pool);
    res.json({ site });
  });

  router.post("/entries/:kind/:slug/views", async (req, res) => {
    const viewer = await viewerOfRequest(pool, req);
    const kind = entryKinds[String(req.params["kind"])];
    const entryId =
      kind === undefined
        ? null
        : await visibleEntryId(pool, viewer, kind, String(req.params["slug"]));
    if (entryId === null) {
      return sendError(res, 404, "not_found", "No such entry.");
    }
    if (counts(req)) {
      const page = await recordEntryView(pool, entryId);
      const site = await recordSiteView(pool);
      res.json({ page, site });
      return;
    }
    res.json({
      page: await readEntryViews(pool, entryId),
      site: await readSiteViews(pool),
    });
  });

  return router;
}
