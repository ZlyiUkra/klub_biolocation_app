// The superuser's routes (T068, T069 of specs/001-self-hosted-club-site; contracts/http-api.md "Administration"; tests:
// server/test/superuser-routes.test.ts): starting, accepting and cancelling a handover, regenerating the recovery
// codes, and using a code to set a new password. The decisions are in handover.ts, recovery.ts and superuser.ts; this
// file reads the request and turns their answers into status codes.
//
// Decisions that would otherwise look like mistakes:
// - The routes of the superuser's own pages answer 404 to anyone else, a plain administrator included, like the users
//   routes do; the routes of a handover's TARGET answer to any signed-in account, because a target can be anyone who is
//   an admin and has to be able to accept.
// - A wrong password typed again is a 400 with the field `password` and the tries left, a pause in force is a 429 with
//   Retry-After: the answers of the change-password route, so the pages need one way of showing them.
// - `/superuser/recover` needs no session and answers a bad code, a spent one, a voided one, an unknown identifier and
//   an identifier that is not the superuser's with one and the same 400. Its limits are per address and global
//   (recovery.ts), never per account.
// - Every answer is no-store: a recovery code or a handover state differs per moment.

import { Router, type Request, type Response } from "express";
import type { Pool } from "../db/pool.js";
import { findAccount, type Account } from "../auth/accounts.js";
import { limiterKeyOf } from "../auth/routes.js";
import {
  addressPrefixOf,
  readSessionCookie,
  resolveSession,
} from "../auth/session.js";
import { sendError } from "../http/errors.js";
import { writeAudit } from "./audit.js";
import {
  acceptHandover,
  cancelHandover,
  handoverStateOf,
  startHandover,
} from "./handover.js";
import {
  RecoveryLimits,
  issueRecoverySet,
  redeemRecoveryCode,
  unspentCodeCount,
} from "./recovery.js";
import { checkPasswordAgain, type ReauthResult } from "./reauth.js";

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function tooMany(res: Response, seconds: number): void {
  res.setHeader("Retry-After", String(seconds));
  sendError(res, 429, "rate_limited", "Too many attempts. Try again later.");
}

// The answer for a password typed again that did not pass.
// Changed 2026-10-13 (T110): exported, so that the settings routes answer a password typed again exactly as these do
// (400 on `password` with the tries left, 429 with Retry-After in a pause); it was private to this file.
export function reauthRefusal(
  res: Response,
  again: Exclude<ReauthResult, { ok: true }>,
): void {
  if (again.reason === "locked") return tooMany(res, again.retryAfterSeconds);
  res.status(400).json({
    error: "invalid_input",
    message: "The password is not right.",
    field: "password",
    ...(again.attemptsLeft !== undefined && {
      attemptsLeft: again.attemptsLeft,
    }),
    ...(again.pauseSeconds !== undefined && {
      retryAfterSeconds: again.pauseSeconds,
    }),
  });
}

export function superuserRouter({ pool }: { pool: Pool }): Router {
  const router = Router();
  const recoveryLimits = new RecoveryLimits();

  // The signed-in account of the request with a full session, or null.
  async function callerOf(req: Request): Promise<Account | null> {
    const id = readSessionCookie(req.headers.cookie);
    if (id === null) return null;
    const session = await resolveSession(pool, id);
    if (session === null || session.limited) return null;
    return findAccount(pool, session.userId);
  }

  for (const prefix of [
    "/account/handover",
    "/admin/superuser",
    "/superuser",
  ]) {
    router.use(prefix, (_req, res, next) => {
      res.setHeader("Cache-Control", "no-store");
      next();
    });
  }

  router.get("/account/handover", async (req, res) => {
    const account = await callerOf(req);
    if (!account) return sendError(res, 401, "unauthorized", "Sign in first.");
    // Changed 2026-10-11 (T070, step 3b): the superuser's page also needs how many recovery codes are unspent, and
    // nobody else gets a number (null), so the route does not tell a member anything about the role's safeguards.
    res.status(200).json({
      handover: await handoverStateOf(pool, account.id),
      recoveryCodesLeft: account.superuser
        ? await unspentCodeCount(pool, account.id)
        : null,
    });
  });

  router.post("/admin/superuser/handover", async (req, res) => {
    const account = await callerOf(req);
    if (!account?.superuser) {
      return sendError(res, 404, "not_found", "No such API route.");
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const password = asString(body["password"]);
    const toUserId = Number(body["toUserId"]);
    if (password === null || !Number.isSafeInteger(toUserId) || toUserId <= 0) {
      return sendError(res, 400, "invalid_input", "The form is not valid.");
    }
    const result = await startHandover(pool, account.id, password, toUserId);
    if (result.ok) return void res.status(200).json({ handover: result.state });
    if (result.reason === "wrong" || result.reason === "locked") {
      return reauthRefusal(res, result);
    }
    if (result.reason === "bad_target") {
      return sendError(
        res,
        400,
        "invalid_input",
        "The account must already be an administrator.",
        "toUserId",
      );
    }
    if (result.reason === "open_exists") {
      return sendError(res, 409, "conflict", "A handover is already open.");
    }
    return sendError(res, 404, "not_found", "No such API route.");
  });

  router.post("/account/handover/accept", async (req, res) => {
    const account = await callerOf(req);
    if (!account) return sendError(res, 401, "unauthorized", "Sign in first.");
    const body = (req.body ?? {}) as Record<string, unknown>;
    const password = asString(body["password"]);
    if (password === null) {
      return sendError(res, 400, "invalid_input", "The form is not valid.");
    }
    const result = await acceptHandover(pool, account.id, password);
    if (result.ok) {
      return void res
        .status(200)
        .json({ effectiveAt: result.effectiveAt, completed: result.completed });
    }
    if (result.reason === "wrong" || result.reason === "locked") {
      return reauthRefusal(res, result);
    }
    return sendError(res, 404, "not_found", "There is no handover to accept.");
  });

  router.post("/account/handover/cancel", async (req, res) => {
    const account = await callerOf(req);
    if (!account) return sendError(res, 401, "unauthorized", "Sign in first.");
    const cancelled = await cancelHandover(pool, account.id);
    if (!cancelled) {
      return sendError(
        res,
        404,
        "not_found",
        "There is no handover to cancel.",
      );
    }
    res.status(200).json({});
  });

  router.post("/admin/superuser/recovery-codes", async (req, res) => {
    const account = await callerOf(req);
    if (!account?.superuser) {
      return sendError(res, 404, "not_found", "No such API route.");
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const password = asString(body["password"]);
    if (password === null) {
      return sendError(res, 400, "invalid_input", "The form is not valid.");
    }
    const again = await checkPasswordAgain(pool, account.id, password);
    if (!again.ok) return reauthRefusal(res, again);
    const codes = await issueRecoverySet(pool, account.id);
    await writeAudit(pool, {
      actorId: account.id,
      action: "recovery_codes_regenerated",
      targetKind: "account",
      targetId: account.id,
      addressPrefix: addressPrefixOf(req.ip),
    });
    res.status(200).json({ codes });
  });

  router.post("/superuser/recover", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const identifier = asString(body["identifier"]);
    const code = asString(body["code"]);
    const newPassword = asString(body["newPassword"]);
    if (identifier === null || code === null || newPassword === null) {
      return sendError(res, 400, "invalid_input", "The form is not valid.");
    }
    const result = await redeemRecoveryCode(
      pool,
      {
        identifier,
        code,
        newPassword,
        address: limiterKeyOf(req.ip),
        addressPrefix: addressPrefixOf(req.ip),
      },
      recoveryLimits,
    );
    if (result.ok) return void res.status(200).json({ codes: result.codes });
    if (result.reason === "limited")
      return tooMany(res, result.retryAfterSeconds);
    if (result.reason === "password") {
      res.status(400).json({
        error: "invalid_input",
        message: `The new password is not valid (${result.problem}).`,
        field: "newPassword",
        problem: result.problem,
      });
      return;
    }
    // One answer for every kind of failure.
    sendError(
      res,
      400,
      "invalid_input",
      "The identifier or the code is not right.",
    );
  });

  return router;
}
