// Comments on posts and videos (T106 of specs/001-self-hosted-club-site; contracts/http-api.md "Comments",
// data-model.md "comments", FR-032, T151, T184; migration 021; tests: server/test/comments.test.ts, written first by
// T103 and amended by T184). The rows and the visibility are in server/src/access/comments.ts; this file reads the
// request and turns the answers into status codes.
//
// Decisions that would otherwise look like mistakes:
// - The numbers are one block, like `signinLimits`: "limit B" of the contract, the sensitive-action limit, and the
//   owner's own numbers of 2026-10-13 (5 in 10 minutes, 20 under one entry, one day to change one's own comment).
//   Nothing else in the tree repeats them; the migration's only limit is a safety net.
// - The order of the checks is: the entry (404 for one the viewer may not see, so a signed-out visitor and a guest are
//   told nothing about an entry that is not theirs), then who the viewer is (401 signed out, 403 for an account that
//   does not write, `blocked` for a blocked one), then the window of limit B (429), then the text (400) and the cap
//   of the entry (409). The window is taken before the text is looked at and given back when the text is refused, so a
//   burst of parallel posts cannot all pass the check before any is counted, and a refusal is not held against the
//   writer (the pattern of the sign-up route, T172).
// - The limit is per account (a writer is always signed in) and counts only comments that were stored. Changing,
//   deleting, hiding and restoring are not under it.
// - The text is stored as typed with its ends trimmed. NUL is refused here, because a PostgreSQL text value cannot
//   hold it and the answer must be a 400, not a 500; a line break inside is kept.
// - Hide and restore answer 404 to anyone who is not a metr or an admin, a deleted comment and a comment on an entry
//   the viewer may not see, so the route tells nothing about a comment to someone who may not use it.
// - Every answer is no-store: a thread differs per viewer (`mine`, hidden ones).

import { Router, type Request, type Response } from "express";
import type { Pool } from "../db/pool.js";
import { AddressLimiter } from "../auth/limits.js";
import { addressPrefixOf } from "../auth/session.js";
import { viewerOfRequest } from "../auth/viewer.js";
import {
  changeOwnComment,
  deleteOwnComment,
  listComments,
  moderateComment,
  personAccess,
  visibleEntryId,
  writeComment,
  type EntryKind,
} from "../access/comments.js";
import { sendError } from "../http/errors.js";
import type { Viewer } from "../../../src/lib/viewer.js";
// Added 2026-10-13 (T106): the two numbers the page shares live in a module both can read.
import { commentRules } from "../../../src/lib/comment-rules.js";
// Added 2026-10-13 (T187): the six reaction names, one home shared with the page.
import { reactionKinds } from "../../../src/lib/reaction-kinds.js";

/** The numbers of the comment routes, in one block. */
export const commentLimits = {
  /** The longest comment, in characters, after the ends are trimmed (src/lib/comment-rules.ts). */
  maxChars: commentRules.maxChars,
  /** Comments one account may store inside the window; the next one is answered 429 with `Retry-After`. */
  maxPerWindow: 5,
  windowMs: 10 * 60_000,
  /** Comments (not deleted) one account may have under one entry; the next one is a 409 `conflict`. */
  maxPerEntry: 20,
  /** How long after writing the author may change or delete the comment (src/lib/comment-rules.ts). */
  editWindowMs: commentRules.editWindowMs,
} as const;

/**
 * The reactions an entry can carry, in the order the page shows them (T186 builds the routes).
 * Added 2026-10-13 (T186): the routes are in server/src/comments/reactions.ts, which reads this list; the table's check
 * constraint (migration 022) is the same six.
 * Moved 2026-10-13 (T187): the list itself is src/lib/reaction-kinds.ts, because the page's component and script read
 * the same six names; it is re-exported here so the routes and the tests keep their import.
 */
export { reactionKinds };

// Exported 2026-10-13 (T186): the reactions routes of server/src/comments/reactions.ts name an entry the same way, and
// two copies of this map would be two places that decide which kinds of entry carry a thread.
export const entryKinds: Record<string, EntryKind> = {
  post: "post",
  video: "video",
};

type SignedIn = Viewer & { userId: number };
const signedIn = (viewer: Viewer): viewer is SignedIn => viewer.userId !== null;

/** The text of a comment, trimmed, or the reason it is refused. */
function commentText(value: unknown): { text: string } | { problem: string } {
  if (typeof value !== "string")
    return { problem: "The comment must be text." };
  const text = value.trim();
  if (text.length === 0) return { problem: "The comment is empty." };
  if (text.includes("\u0000"))
    return { problem: "The comment holds a character that cannot be stored." };
  // Characters, not UTF-16 units: the database counts the same way.
  if ([...text].length > commentLimits.maxChars) {
    return {
      problem: `The comment is longer than ${commentLimits.maxChars} characters.`,
    };
  }
  return { text };
}

function bodyOf(req: Request): unknown {
  const body: unknown = req.body;
  return typeof body === "object" && body !== null
    ? (body as Record<string, unknown>)["body"]
    : undefined;
}

function notFound(res: Response): void {
  sendError(res, 404, "not_found", "No such comment or entry.");
}

export function commentsRouter({ pool }: { pool: Pool }): Router {
  const router = Router();
  const postWindow = new AddressLimiter({
    maxFailures: commentLimits.maxPerWindow,
    windowMs: commentLimits.windowMs,
  });
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  async function entryOf(req: Request, viewer: Viewer): Promise<number | null> {
    const kind = entryKinds[String(req.params["kind"])];
    if (kind === undefined) return null;
    return visibleEntryId(pool, viewer, kind, String(req.params["slug"]));
  }

  router.get("/entries/:kind/:slug/comments", async (req, res) => {
    const viewer = await viewerOfRequest(pool, req);
    const entryId = await entryOf(req, viewer);
    if (entryId === null) return notFound(res);
    res.json(await listComments(pool, viewer, entryId));
  });

  router.post("/entries/:kind/:slug/comments", async (req, res) => {
    const viewer = await viewerOfRequest(pool, req);
    const entryId = await entryOf(req, viewer);
    if (entryId === null) return notFound(res);
    if (!signedIn(viewer)) {
      return sendError(res, 401, "unauthorized", "Sign in first.");
    }
    const access = await personAccess(pool, viewer.userId);
    if (access === "blocked") {
      return sendError(res, 403, "blocked", "This account is blocked.");
    }
    if (access !== "open") {
      return sendError(
        res,
        403,
        "forbidden",
        "This account may not write comments.",
      );
    }

    const key = String(viewer.userId);
    const now = new Date();
    const verdict = postWindow.check(key, now);
    if (!verdict.allowed) {
      res.setHeader("Retry-After", String(verdict.retryAfterSeconds));
      return sendError(
        res,
        429,
        "rate_limited",
        "Too many comments. Try again later.",
      );
    }
    // Reserved before the work, given back when nothing was stored.
    postWindow.recordFailure(key, now);

    const text = commentText(bodyOf(req));
    if ("problem" in text) {
      postWindow.forgive(key, now);
      return sendError(res, 400, "invalid_input", text.problem, "body");
    }
    const written = await writeComment(
      pool,
      viewer,
      entryId,
      text.text,
      commentLimits.maxPerEntry,
    );
    if (!written.ok) {
      postWindow.forgive(key, now);
      res.status(409).json({
        error: "conflict",
        message: `At most ${commentLimits.maxPerEntry} comments under one entry.`,
        field: "body",
        problem: "entry_cap",
      });
      return;
    }
    res.status(201).json(written.comment);
  });

  const commentId = (req: Request): number | null => {
    const raw = String(req.params["id"]);
    return /^[1-9][0-9]{0,15}$/.test(raw) ? Number(raw) : null;
  };

  router.patch("/comments/:id", async (req, res) => {
    const viewer = await viewerOfRequest(pool, req);
    const id = commentId(req);
    if (id === null || !signedIn(viewer)) return notFound(res);
    const text = commentText(bodyOf(req));
    // A refused text is a 400 whatever the id is, so the answer tells nothing about a comment that is not theirs.
    if ("problem" in text) {
      return sendError(res, 400, "invalid_input", text.problem, "body");
    }
    const done = await changeOwnComment(
      pool,
      viewer,
      id,
      text.text,
      commentLimits.editWindowMs,
    );
    if (!done.ok) {
      if (done.reason === "late") {
        return sendError(
          res,
          403,
          "forbidden",
          "A comment can be changed for one day only.",
        );
      }
      return notFound(res);
    }
    res.json(done.comment);
  });

  router.delete("/comments/:id", async (req, res) => {
    const viewer = await viewerOfRequest(pool, req);
    const id = commentId(req);
    if (id === null || !signedIn(viewer)) return notFound(res);
    const done = await deleteOwnComment(
      pool,
      viewer,
      id,
      commentLimits.editWindowMs,
    );
    if (!done.ok) {
      if (done.reason === "late") {
        return sendError(
          res,
          403,
          "forbidden",
          "A comment can be deleted for one day only.",
        );
      }
      return notFound(res);
    }
    res.json({ deleted: true });
  });

  for (const action of ["hide", "restore"] as const) {
    router.post(`/comments/:id/${action}`, async (req, res) => {
      const viewer = await viewerOfRequest(pool, req);
      const id = commentId(req);
      if (id === null || !signedIn(viewer)) return notFound(res);
      const done = await moderateComment(
        pool,
        viewer,
        id,
        action,
        addressPrefixOf(req.ip),
      );
      if (done === null) return notFound(res);
      res.json(done);
    });
  }

  return router;
}
