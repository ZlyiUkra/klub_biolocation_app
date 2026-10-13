// `GET /api/videos/:slug/source` (T137, with T082 and T149 of specs/001-self-hosted-club-site): the address the page
// plays a video from, for a source that is not a file on this server (those are `/media/video/:slug`, T080).
//
// The rule is not written here. `lecture_view` (migration 014) says what this viewer may do with this video, the one
// decision; this route maps its answer onto the five states of the player (T149) and only then asks the provider:
//   none       -> 404 not_found    (no such entry, or the viewer may not see it at all)
//   guest      -> 401 signed_out   (a visitor with no session, for a paid lecture that exists)
//   no_access  -> 403 forbidden    (signed in, no right: the person's date is not there or has passed)
//   blocked    -> 403 blocked
//   expired    -> 403 expired      (the video's own period has ended; metr and admin are not told this)
//   open       -> the entry's source: 404 no_source when it has none, 503 unavailable when the provider cannot answer
// The answer is `private, no-store`, and neither it nor any error carries the stored reference.
import { Router } from "express";
import { viewerOfRequest } from "../auth/viewer.js";
// The read goes through the access module (access-boundary.test.ts): nothing else selects the content tables.
import { getVideoSource } from "../access/entries.js";
import type { Pool } from "../db/pool.js";
import { HttpError } from "../http/errors.js";
import { ProviderUnavailable, resolveSource } from "./providers/index.js";

export function videoSourceRouter(pool: Pool): Router {
  const router = Router();
  router.get("/videos/:slug/source", async (req, res) => {
    const viewer = await viewerOfRequest(pool, req);
    const slug = String(req.params["slug"]);
    const row = await getVideoSource(pool, viewer, slug);
    res.setHeader("Cache-Control", "private, no-store");
    if (row === null || row.lecture === "none") {
      throw new HttpError(404, "not_found", "No such entry.");
    }
    switch (row.lecture) {
      case "guest":
        throw new HttpError(401, "signed_out", "Sign in to play this lecture.");
      case "no_access":
        throw new HttpError(403, "forbidden", "This account has no access.");
      case "blocked":
        throw new HttpError(403, "blocked", "This account is blocked.");
      case "expired":
        throw new HttpError(403, "expired", "The period of this video ended.");
      case "open":
        break;
      default:
        throw new HttpError(404, "not_found", "No such entry.");
    }
    // Added 2026-10-11 (T080): a file on the volume is played from the stream route, which checks the rule again on
    // every request; the answer is the site's own address, never the path on the volume.
    if (row.hasFile) {
      res.json({ videoUrl: `/media/video/${encodeURIComponent(slug)}` });
      return;
    }
    if (row.provider === null || row.reference === null) {
      throw new HttpError(404, "no_source", "This lecture has no source yet.");
    }
    try {
      res.json(await resolveSource(row.provider, row.reference));
    } catch (error) {
      if (error instanceof ProviderUnavailable) {
        // The message names the provider and the reason, never the reference; it goes to the log, not to the visitor.
        console.error("video source:", error.message);
        throw new HttpError(
          503,
          "unavailable",
          "The video is not available now.",
        );
      }
      throw error;
    }
  });
  return router;
}
