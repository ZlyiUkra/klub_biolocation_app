// `GET /media/video/:slug` (T080 of specs/001-self-hosted-club-site; research.md section 10; contracts/http-api.md
// "Video"): the bytes of a video that is a file on the server's volume.
//
// Every request, a seek included, asks the database again: the session, the account's status and date, the video's own
// period and the entry's visibility are the one rule `lecture_view`, so a block or an ended date is felt on the next
// range the player asks for (FR-025). No signed address is ever handed out: an address that outlives a block would be a
// bearer token.
//
// The answer, by the rule's word (the same states as the source route and the five states of the player, T149):
//   none -> 404 not_found, guest -> 401 signed_out, no_access -> 403 forbidden, blocked -> 403 blocked,
//   expired -> 403 expired, open and no file row -> 404 no_source, open -> the bytes.
//
// Decisions that would otherwise look like mistakes:
// - Two ways to send the bytes, one rule. Behind nginx (`accelPrefix` set) the route answers 200 with an
//   `X-Accel-Redirect` header and no body, and nginx serves the file and the ranges from an `internal` location, so the
//   bytes never pass through Node (constitution IV); a request for that location from outside is a 404 in nginx
//   (nginx-docs, ngx_http_core_module, `internal`). With no prefix (development, tests) Express itself sends the file
//   with `res.sendFile`, which answers `Range` with 206 and a bad range with 416.
// - `res.sendFile` is given the volume as `root`: Express then refuses a path that resolves outside it. The path comes
//   from the database, not from the visitor, and a second wall costs nothing (express-docs, Response, sendFile).
// - `Cache-Control: private, no-store` on every answer, the refusals included: a shared cache must never hold a lecture
//   for a viewer who then loses the right. `cacheControl: false` stops Express adding its own `public` header.
// - A file missing on the disk although a row says it is registered answers 404 no_source and logs the slug, not the
//   path.

import { Router, type Response } from "express";
import { getVideoFile } from "../access/video-files.js";
import { viewerOfRequest } from "../auth/viewer.js";
import type { Pool } from "../db/pool.js";
import { HttpError } from "../http/errors.js";

export type StreamOptions = {
  pool: Pool;
  /** The folder of the video volume. */
  videoRoot: string;
  /** The internal nginx location, such as `/_video/`; set in production, left out in development. */
  accelPrefix?: string;
};

function sendMissing(res: Response): void {
  res.status(404).json({
    error: "no_source",
    message: "This lecture has no file yet.",
  });
}

export function videoStreamRouter({
  pool,
  videoRoot,
  accelPrefix,
}: StreamOptions): Router {
  const router = Router();
  router.get("/video/:slug", async (req, res) => {
    const viewer = await viewerOfRequest(pool, req);
    const slug = String(req.params["slug"]);
    const found = await getVideoFile(pool, viewer, slug);
    res.setHeader("Cache-Control", "private, no-store");
    if (found === null || found.lecture === "none") {
      throw new HttpError(404, "not_found", "No such entry.");
    }
    switch (found.lecture) {
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
    if (found.volumePath === null) {
      throw new HttpError(404, "no_source", "This lecture has no file yet.");
    }
    const path = found.volumePath;
    if (accelPrefix !== undefined) {
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader(
        "X-Accel-Redirect",
        accelPrefix + path.split("/").map(encodeURIComponent).join("/"),
      );
      res.status(200).end();
      return;
    }
    await new Promise<void>((resolve) => {
      res.sendFile(
        path,
        { root: videoRoot, acceptRanges: true, cacheControl: false },
        (error) => {
          if (error !== null && error !== undefined && !res.headersSent) {
            // A range that cannot be satisfied comes back from `send` as an error with a status and the headers
            // (Content-Range: bytes */size) the answer must carry: pass them on. Anything else is a file that is
            // not there.
            const failure = error as {
              status?: number;
              headers?: Record<string, string>;
            };
            if (failure.status === 416) {
              for (const [name, value] of Object.entries(
                failure.headers ?? {},
              )) {
                res.setHeader(name, value);
              }
              res.status(416).json({
                error: "invalid_input",
                message: "The range cannot be satisfied.",
              });
            } else {
              console.error(
                "video stream: a registered file is not readable:",
                slug,
              );
              sendMissing(res);
            }
          }
          resolve();
        },
      );
    });
  });
  return router;
}
