// The reactions of posts and videos (T186 of specs/001-self-hosted-club-site; contracts/http-api.md "Comments"; data-model.md
// "reactions"; FR-047; migration 022; tests: server/test/reactions.test.ts, written first by T185). The rows are in
// server/src/access/reactions.ts; this file reads the request and turns the answers into status codes.
//
// Decisions that would otherwise look like mistakes:
// - The order of the checks is the comment route's: the entry (404 for one the viewer may not see, an editor included,
//   so the route tells nothing about an entry that is not theirs), then who the viewer is (401 signed out, 403 for an
//   account that is not a writer, `blocked` for a blocked one), then the kind (400). Taking a reaction back needs the
//   same writer rule, as the contract says, so an account whose date ended can no longer change what it gave.
// - "A writer" is `person_lecture_access`, asked through access/comments.ts `personAccess`: there is no second copy of
//   the rule here, so reacting, commenting and opening a paid lecture stay one rule (the constitution's third
//   principle).
// - Reading is open to whoever may see the entry, signed out included, because the counts are public; `mine` is null
//   for a visitor with no account.
// - There is no limit of its own: one row per account per entry bounds the table, and a change or a removal is one
//   statement. Every answer is no-store, because `mine` differs per viewer.
// - The answer to PUT and DELETE is the whole reactions object, so the page paints what is stored and not what it
//   assumed.

import { Router, type Request, type Response } from "express";
import type { Pool } from "../db/pool.js";
import { viewerOfRequest } from "../auth/viewer.js";
import { personAccess, visibleEntryId } from "../access/comments.js";
import {
  readReactions,
  removeReaction,
  setReaction,
} from "../access/reactions.js";
import { sendError } from "../http/errors.js";
import type { Viewer } from "../../../src/lib/viewer.js";
import { isReactionKind } from "../../../src/lib/reaction-kinds.js";
import { entryKinds, reactionKinds } from "./routes.js";

/** The reactions of an entry as the routes answer them: six counts (zeros included), their total, the viewer's own. */
type ReactionsJson = {
  counts: Record<string, number>;
  total: number;
  mine: string | null;
};

// Changed 2026-10-13 (T187): the test of a kind is the one in src/lib/reaction-kinds.ts, which the page uses too.
const isKind = isReactionKind;

export function reactionsRouter({ pool }: { pool: Pool }): Router {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  async function answer(
    entryId: number,
    userId: number | null,
  ): Promise<ReactionsJson> {
    const stored = await readReactions(pool, entryId, userId);
    // Every kind the page knows is present, zero when nobody gave it; a kind stored under another name (there is none:
    // the check constraint) would not be counted.
    const counts: Record<string, number> = {};
    let total = 0;
    for (const kind of reactionKinds) {
      counts[kind] = stored.byKind[kind] ?? 0;
      total += counts[kind];
    }
    return { counts, total, mine: stored.mine };
  }

  /** The entry the viewer may see, or a 404 already sent. */
  async function entryOf(
    req: Request,
    res: Response,
    viewer: Viewer,
  ): Promise<number | null> {
    const kind = entryKinds[String(req.params["kind"])];
    const id =
      kind === undefined
        ? null
        : await visibleEntryId(pool, viewer, kind, String(req.params["slug"]));
    if (id === null) {
      sendError(res, 404, "not_found", "No such entry.");
    }
    return id;
  }

  router.get("/entries/:kind/:slug/reactions", async (req, res) => {
    const viewer = await viewerOfRequest(pool, req);
    const entryId = await entryOf(req, res, viewer);
    if (entryId === null) return;
    res.json(await answer(entryId, viewer.userId));
  });

  /**
   * The shared start of PUT and DELETE: the entry, a signed-in writer. Returns the ids, or null when the answer was sent.
   */
  async function writer(
    req: Request,
    res: Response,
  ): Promise<{ entryId: number; userId: number } | null> {
    const viewer = await viewerOfRequest(pool, req);
    const entryId = await entryOf(req, res, viewer);
    if (entryId === null) return null;
    const userId = viewer.userId;
    if (userId === null) {
      sendError(res, 401, "unauthorized", "Sign in first.");
      return null;
    }
    const access = await personAccess(pool, userId);
    if (access === "blocked") {
      sendError(res, 403, "blocked", "This account is blocked.");
      return null;
    }
    if (access !== "open") {
      sendError(res, 403, "forbidden", "This account may not react.");
      return null;
    }
    return { entryId, userId };
  }

  router.put("/entries/:kind/:slug/reactions", async (req, res) => {
    const who = await writer(req, res);
    if (who === null) return;
    const body: unknown = req.body;
    const kind =
      typeof body === "object" && body !== null
        ? (body as Record<string, unknown>)["kind"]
        : undefined;
    if (!isKind(kind)) {
      return sendError(
        res,
        400,
        "invalid_input",
        `The kind must be one of: ${reactionKinds.join(", ")}.`,
        "kind",
      );
    }
    await setReaction(pool, who.entryId, who.userId, kind);
    res.json(await answer(who.entryId, who.userId));
  });

  router.delete("/entries/:kind/:slug/reactions", async (req, res) => {
    const who = await writer(req, res);
    if (who === null) return;
    await removeReaction(pool, who.entryId, who.userId);
    res.json(await answer(who.entryId, who.userId));
  });

  return router;
}
