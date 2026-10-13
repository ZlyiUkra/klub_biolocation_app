// The routes of the setup door (T169 of specs/001-self-hosted-club-site; contracts/http-api.md). The decisions are in
// setup.ts and superuser.ts; this file reads the request and says the answer.
//
// Decisions that would otherwise look like mistakes:
// - `GET /api/setup/state` answers `{ open }` and nothing else: the page asks it to decide between its form and a
//   404, so it must say nothing about the code, the mode or the switch.
// - Every refusal of the code is one 400 with one sentence; a shut door is a plain 404, the answer of an unknown
//   route, so that a shut door and a route that never existed look the same from outside.
// - The answer to a success carries the ten recovery codes, once, with `no-store`: they are shown on the page and
//   are not kept anywhere that a later request could read.

import { Router } from "express";
import type { Pool } from "../db/pool.js";
import { sendError } from "../http/errors.js";
import { limiterKeyOf } from "../auth/routes.js";
import { addressPrefixOf } from "../auth/session.js";
import { writeAudit } from "./audit.js";
import { redeemSetup, type SetupGate } from "./setup.js";

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function setupRouter({
  pool,
  gate,
}: {
  pool: Pool;
  gate: SetupGate;
}): Router {
  const router = Router();
  router.use("/setup", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  router.get("/setup/state", async (_req, res) => {
    res.status(200).json({ open: await gate.isOpen(pool) });
  });

  router.post("/setup", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const code = asString(body["code"]);
    const email = asString(body["email"]);
    const password = asString(body["password"]);
    if (code === null || email === null || password === null) {
      return sendError(res, 400, "invalid_input", "The form is not valid.");
    }
    const result = await redeemSetup(pool, gate, {
      code,
      email,
      password,
      address: limiterKeyOf(req.ip),
    });
    if (result.ok) {
      // Changed 2026-10-11 (T170): the account, the codes and the audit rows of the change itself are already
      // committed; this row only adds the network prefix of the caller. If it cannot be written the answer must still
      // carry the codes, which exist nowhere else, so a failure here is logged and not turned into a 500.
      try {
        await writeAudit(pool, {
          actorId: null,
          action: "superuser_setup_used",
          targetKind: "account",
          targetId: result.userId,
          detail: { replaced: result.replaced },
          addressPrefix: addressPrefixOf(req.ip),
        });
      } catch (error) {
        console.error(
          "SETUP: the audit row of a setup use could not be written:",
          error,
        );
      }
      console.log(
        `SETUP: a superuser was set up through the setup page${result.replaced ? " (the emergency switch replaced the holder)" : ""}.`,
      );
      return void res.status(200).json({ codes: result.codes });
    }
    if (result.reason === "closed") {
      return sendError(res, 404, "not_found", "No such API route.");
    }
    if (result.reason === "limited") {
      res.setHeader("Retry-After", String(result.retryAfterSeconds));
      return sendError(
        res,
        429,
        "rate_limited",
        "Too many attempts. Try again later.",
      );
    }
    if (result.reason === "email") {
      return sendError(
        res,
        400,
        "invalid_input",
        "The address is not valid.",
        "email",
      );
    }
    if (result.reason === "password") {
      return void res.status(400).json({
        error: "invalid_input",
        message: `The password is not valid (${result.problem}).`,
        field: "password",
        problem: result.problem,
      });
    }
    sendError(res, 400, "invalid_input", "The code is not right.");
  });

  return router;
}
