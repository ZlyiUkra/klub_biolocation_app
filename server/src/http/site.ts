// The site inside the backend (task T036 of specs/001-self-hosted-club-site; plan phase 1).
//
// Astro is built with the Node adapter in `middleware` mode (astro.config.mjs), which leaves two things in dist/: the
// files that need no rendering, in dist/client (the built assets and the pages that stay static), and
// dist/server/entry.mjs, whose `handler` renders everything else on demand, for the same request. This module puts
// them behind the API, in this order: the files first, so a built asset never costs a render, then the handler, which
// is also what answers an address no route matches (with the site's own 404 page).
//
// Source: astro-docs 4.16, @astrojs/node, "Middleware" (the `handler` export, `express.static` first, then the
// handler), and express-docs 5.x for `express.static`.
//
// Decisions that would otherwise look like mistakes:
// - The handler is loaded with a dynamic import of a path, not imported: dist/ does not exist until `npm run build`,
//   and the backend must still start (API only) on a machine that has not built the site, so the tests and the
//   migration commands do not need a build. `loadSite` returns null then and the caller says so.
// - The handler is wrapped in an arrow function that does not pass `next`. Given `next`, the adapter hands an address
//   that matches no route on to it, and Express would answer with its own plain "Cannot GET"; without it Astro renders
//   its 404 route, which is the site's page.
// - Hashed build files under /_astro/ are immutable (their name is a hash of their content), so they are cached for a
//   year; everything else is revalidated on every use through its ETag. The rules for the public edge (nginx, task
//   T116) are separate and may differ.
// - `express.static` answers only GET and HEAD and ignores dotfiles; it serves nothing outside dist/client.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import express, { type Express } from "express";

export type SiteHandler = (
  req: express.Request,
  res: express.Response,
) => unknown;

export type Site = {
  /** The directory of the built files that need no rendering. */
  clientDir: string;
  /** Astro's request handler from dist/server/entry.mjs. */
  handler: SiteHandler;
};

/**
 * Loads the built site from `root` (the repository root, which holds dist/). Returns null when the site has not been
 * built; throws when it has been built and cannot be loaded, because that is a fault to see, not to hide.
 */
export async function loadSite(root: string): Promise<Site | null> {
  const entry = join(root, "dist", "server", "entry.mjs");
  const clientDir = join(root, "dist", "client");
  if (!existsSync(entry) || !existsSync(clientDir)) return null;
  const loaded: unknown = await import(pathToFileURL(entry).href);
  if (
    typeof loaded !== "object" ||
    loaded === null ||
    !("handler" in loaded) ||
    typeof loaded.handler !== "function"
  ) {
    throw new Error(`${entry} does not export a handler`);
  }
  const handler = loaded.handler as SiteHandler;
  return { clientDir, handler };
}

/** Adds the files and the handler to `app`, after everything registered before it. */
export function mountSite(app: Express, site: Site): void {
  app.use(
    express.static(site.clientDir, {
      dotfiles: "ignore",
      setHeaders(res, filePath) {
        if (filePath.includes(`${join(site.clientDir, "_astro")}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    }),
  );
  app.use((req, res) => {
    // Without `next`, on purpose: see the header.
    return site.handler(req, res);
  });
}
