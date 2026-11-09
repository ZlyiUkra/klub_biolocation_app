// The Express application (T011 of specs/001-self-hosted-club-site).
//
// Source: express-docs 5.x ("Error handling", "Behind proxies"); contracts/http-api.md for the health route and the
// error shape. Astro is mounted after these routes in phase 1 (task T036); until then an unmatched path under /api
// answers a JSON 404 and anything else Express's own 404.
//
// Decisions that would otherwise look like mistakes:
// - `trust proxy` is 1: exactly one proxy, nginx, sits in front in production, so the client address is the last
//   X-Forwarded-For entry nginx added. A larger number would let a client spoof its address by sending its own
//   header; `true` would trust every hop.
// - The app is built from its dependencies (a pool and the site origin), not from module-level globals, so a test
//   can build one against a throwaway database without touching the process environment.
// - `x-powered-by` is turned off: it advertises the framework to nobody's benefit.
// - The JSON body limit is small (100 kb). Routes that legitimately take larger bodies (the video upload, phase 6)
//   raise it for themselves only.
// - /healthz is registered before the guards and answers no-store: a cached "ok" would hide an outage from Compose.

import express, { type Express } from "express";
import { contentRouter } from "../content/api.js";
// Added 2026-10-13 (T106): comments of posts and videos, under /api/entries and /api/comments.
import { commentsRouter } from "../comments/routes.js";
// Added 2026-10-13 (T186): the six reactions of the same entries.
import { reactionsRouter } from "../comments/reactions.js";
// Added 2026-11-09 (T190): the site's own visit counter, which replaced the outside one.
import { viewsRouter } from "../views/routes.js";
// Added 2026-10-13 (T107): the feedback form and its list for the panel.
import { feedbackRouter } from "../feedback/routes.js";
// Added 2026-10-13 (T110): the superuser's settings (the recipient with its code, the members-block switch).
import { settingsRouter } from "../settings/routes.js";
// Added 2026-10-12 (T143): the pictures of the panel and the route that serves them.
import { imagesPublicRouter, imagesRouter } from "../content/images.js";
import { videoSourceRouter } from "../video/source-routes.js";
import { videoStreamRouter } from "../video/stream.js";
// Added 2026-10-11 (T050): the sign-in routes.
import { authRouter } from "../auth/routes.js";
import { usersRouter } from "../users/routes.js";
// Added 2026-10-12 (T097): the panel's posts, videos and preview.
import { contentAdminRouter } from "../content/admin-routes.js";
import { superuserRouter } from "../users/superuser-routes.js";
// Added 2026-10-11 (T169): the setup door for the first superuser.
import { setupRouter } from "../users/setup-routes.js";
import { SetupGate } from "../users/setup.js";
import { checkDatabase } from "../db/health.js";
import type { Pool } from "../db/pool.js";
import { errorHandler, sendError } from "./errors.js";
import { crossSiteGuard } from "./guards.js";
// Added 2026-10-10 (T036): the built site goes behind the API.
import { mountSite, type Site } from "./site.js";

export type AppDeps = {
  pool: Pool;
  siteOrigin: string;
  /** Every origin the cross-site guard accepts (changed 2026-10-11); defaults to the one `siteOrigin`. */
  siteOrigins?: readonly string[];
  /** The built site, when there is one (T036); without it only the API and the health check answer. */
  site?: Site | null;
  /** The setup door (T169); without one the door is a generated-code gate that nobody has ticked, so it never opens. */
  setup?: SetupGate;
  /** Added 2026-10-11 (T080): the video volume; without it `/media/video/:slug` is not mounted. */
  videoRoot?: string;
  /** The internal nginx location the stream route hands the file to (production); left out, Express sends it. */
  videoAccel?: string;
  /**
   * Added 2026-10-12 (T095, read by the upload route since T098): the size cap of one video upload in bytes; left out,
   * 500 MiB. `main.ts` fills it from `VIDEO_UPLOAD_CAP_MB`; the tests of the upload route set a small cap without a
   * file of that size.
   */
  uploadCapBytes?: number;
  /** Added 2026-10-12 (T138): the room that must stay free on the video volume after an upload; left out, 2 GiB. */
  freeReserveBytes?: number;
  /** Added 2026-10-12 (T143): the size cap of one picture in bytes; left out, 5 MiB. `main.ts` fills it from IMAGE_UPLOAD_CAP_MB. */
  imageCapBytes?: number;
  /** Added 2026-10-12 (T138): how the free space of the volume is read; the tests replace it to simulate a full disk. */
  volumeSpace?: (
    root: string,
  ) => Promise<{ freeBytes: number; totalBytes: number }>;
};

export function createApp({
  pool,
  siteOrigin,
  siteOrigins,
  site,
  setup,
  videoRoot,
  videoAccel,
  uploadCapBytes,
  freeReserveBytes,
  imageCapBytes,
  volumeSpace,
}: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.get("/healthz", async (_req, res) => {
    const ok = await checkDatabase(pool);
    res.setHeader("Cache-Control", "no-store");
    res.status(ok ? 200 : 503).json({ ok });
  });

  const api = express.Router();
  // Changed 2026-10-12 (T097): the admin content routes (posts, videos, preview) take a body of up to 512 KiB and parse
  // it themselves, so this 100 kB parser steps aside for those paths and keeps its limit for everything else.
  const smallJson = express.json({ limit: "100kb" });
  const adminContent = /^\/admin\/(?:posts|videos|preview)(?:\/|$)/;
  api.use((req, res, next) =>
    adminContent.test(req.path) ? next() : smallJson(req, res, next),
  );
  api.use(crossSiteGuard(siteOrigins ?? [siteOrigin]));
  // Added 2026-10-10 (T030): the content read routes, before the JSON 404 below that answers everything else.
  api.use(contentRouter(pool));
  // Added 2026-10-13 (T106): reads follow the entry's visibility; writes need a writer (person_lecture_access).
  api.use(commentsRouter({ pool }));
  // Added 2026-10-13 (T186): same entry visibility, same writer rule (person_lecture_access).
  api.use(reactionsRouter({ pool }));
  // Added 2026-11-09 (T190): POST /views and POST /entries/:kind/:slug/views; the entry route follows the entry's
  // visibility like the two above, and nobody needs an account to be counted.
  api.use(viewsRouter({ pool }));
  // Added 2026-10-13 (T107): the feedback form (POST /feedback) and its admin list (GET /admin/feedback); the paths are
  // absolute in the router and it is mounted before the /admin routers below, which would otherwise answer first.
  api.use(feedbackRouter({ pool }));
  // Added 2026-10-11 (T137): the address a lecture plays from, behind the one lecture rule (lecture_view).
  api.use(videoSourceRouter(pool));
  // Added 2026-10-11 (T050): accounts and sessions, behind the same cross-site guard as every other write.
  api.use("/auth", authRouter({ pool, siteOrigin }));
  // Added 2026-10-11 (T065): the list of accounts, the change of a status and the temporary password, for a metr and an
  // admin; anyone else gets the same 404 as an unknown route.
  api.use(
    "/admin",
    contentAdminRouter({
      pool,
      ...(videoRoot !== undefined && { videoRoot }),
      ...(uploadCapBytes !== undefined && { uploadCapBytes }),
      ...(freeReserveBytes !== undefined && { freeReserveBytes }),
      ...(volumeSpace !== undefined && { volumeSpace }),
    }),
  );
  // Added 2026-10-12 (T143): the upload and the list of pictures; 404 to anyone who is not a metr or an admin.
  api.use(
    "/admin",
    imagesRouter({
      pool,
      ...(videoRoot !== undefined && { videoRoot }),
      imageCapBytes: imageCapBytes ?? 5 * 1024 * 1024,
      freeReserveBytes: freeReserveBytes ?? 2048 * 1024 * 1024,
      ...(volumeSpace !== undefined && { volumeSpace }),
    }),
  );
  api.use("/admin", usersRouter({ pool }));
  // Added 2026-10-13 (T110): GET and PUT /admin/settings and POST /admin/settings/recipient/confirm; 404 to everyone
  // but the superuser. Paths are absolute in the router.
  api.use(settingsRouter({ pool }));
  // Added 2026-10-11 (T068, T069): the handover, the recovery codes and the use of a code; paths are absolute in the router.
  api.use(superuserRouter({ pool }));
  // Added 2026-10-11 (T169): `GET /api/setup/state` and `POST /api/setup`, 404 whenever the door is shut.
  api.use(setupRouter({ pool, gate: setup ?? new SetupGate() }));
  api.use((_req, res) => {
    sendError(res, 404, "not_found", "No such API route.");
  });
  app.use("/api", api);
  // Added 2026-10-11 (T080): the bytes of a file lecture, outside /api (a media address, not JSON) and before the site
  // so that the site's handler never answers it.
  if (videoRoot !== undefined) {
    app.use(
      "/media",
      videoStreamRouter({
        pool,
        videoRoot,
        ...(videoAccel !== undefined && { accelPrefix: videoAccel }),
      }),
    );
  }

  // Added 2026-10-12 (T143): the uploaded pictures, public, under /images/u/ (the built site has its own /images/).
  if (videoRoot !== undefined) app.use(imagesPublicRouter(videoRoot));

  // Added 2026-10-10 (T036): after every route above, so that a path under /api is never the site's, the built files
  // and then Astro's handler, which renders the rest on demand and answers an unknown address with the site's 404.
  if (site) mountSite(app, site);

  app.use(errorHandler);
  return app;
}
