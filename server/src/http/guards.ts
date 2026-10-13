// Cross-site request guard (T012 of specs/001-self-hosted-club-site).
//
// Source: contracts/http-api.md, "Conventions": a write whose Content-Type is not application/json, whose Origin is
// not the site's origin, or whose Sec-Fetch-Site is present and not same-origin is refused with 403 cross_site
// before anything else runs; and research.md section 8.
//
// Status of the documentation behind it: owasp-docs and mdn-docs were not connected when this was written, so the
// header semantics follow the council's text and the contract; re-check them against those corpora when phase 2
// (own sign-in) starts, as the task list says.
//
// Decisions that would otherwise look like mistakes:
// - Only the writing methods are checked. A GET carries no state change, and `SameSite=Lax` plus same-origin reads
//   are what protect those.
// - A missing Origin header on a write is refused. Browsers send Origin on every cross-origin and every POST
//   request; a write without one did not come from a page of this site (curl, a script, a very old client).
// - Sec-Fetch-Site is checked only when present: absent means a client that does not send fetch metadata, and the
//   Origin check above still stands for it.
// - One status and one code for all three failures, so the response does not teach an attacker which check failed.

import type { RequestHandler } from "express";
import { sendError } from "./errors.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Changed 2026-10-11: the site's origin may be a list (SITE_ORIGIN, server/src/config.ts), because a browser on the same
// machine may be opened as localhost or as 127.0.0.1 and those are two origins to it. A single string still works.
export function crossSiteGuard(
  siteOrigin: string | readonly string[],
): RequestHandler {
  const allowed = new Set(
    typeof siteOrigin === "string" ? [siteOrigin] : siteOrigin,
  );
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }
    const contentType = (req.headers["content-type"] ?? "")
      .split(";")[0]
      ?.trim()
      .toLowerCase();
    const origin = req.headers["origin"];
    const fetchSite = req.headers["sec-fetch-site"];
    // Added 2026-10-12 (T098): the one write whose body is not JSON, the upload of a video file
    // (`PUT /api/admin/videos/:id/file`, `video/mp4`). It is still refused unless the Origin is the site's and the
    // fetch metadata says same-origin. PUT is never a "simple" cross-site request (a browser asks first, and no CORS
    // is configured), so another site cannot make a browser send it with the site's cookie. The type itself is checked
    // by the route, which answers a wrong one with a 400 that names the Content-Type; a 403 "not from this site" would
    // send an editor looking in the wrong place.
    const isUpload =
      req.method === "PUT" &&
      (/^\/admin\/videos\/[0-9]+\/file$/.test(req.path) ||
        // Added 2026-10-12 (T143): a picture is sent as its own image type, like the video file above.
        req.path === "/admin/images");
    const refused =
      (contentType !== "application/json" && !isUpload) ||
      typeof origin !== "string" ||
      !allowed.has(origin) ||
      (fetchSite !== undefined && fetchSite !== "same-origin");
    if (refused) {
      sendError(
        res,
        403,
        "cross_site",
        "The request did not come from this site.",
      );
      return;
    }
    next();
  };
}
