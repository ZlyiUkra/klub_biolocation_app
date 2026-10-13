// The sign-in routes (T050 of specs/001-self-hosted-club-site; contracts/http-api.md, "Accounts and sessions"; tests:
// server/test/auth-routes.test.ts). Thin on purpose: the decisions live in signin.ts, accounts.ts, limits.ts and
// session.ts, and this file turns their results into cookies and JSON.
//
// Decisions that would otherwise look like mistakes:
// - Every answer is `no-store`: what these routes say differs per visitor and per moment.
// - The writes are behind the cross-site guard of T012 (mounted by app.ts before this router), so none of them is
//   reachable from another origin or with another content type.
// - A session is always created through `renewSession`, with the id the browser brought (or none): a visitor who
//   arrives with a session id - their own old one, or one planted by someone else - leaves with a new id, and the old
//   one is dead (session fixation, OWASP Session Management Cheat Sheet).
// - The cookie's Max-Age is the time to the ABSOLUTE end of the session, set once at creation. The idle clock is the
//   server's business (session.ts pushes it with use); sending the cookie again on every request would only make
//   every response carry a Set-Cookie.
// - A session that must change its password (`limited`) is let through to exactly three routes: change-password,
//   signout and me. Everything else on this router refuses it, and so will every route that asks for a full session
//   later (T056).
// - Failures of sign-in and of the current password in change-password are held against the address by the same
//   in-memory window, so a thief with a stolen session cannot guess the password faster than a stranger could.
// - The address that keys the windows is the whole IPv4 address or the /64 of an IPv6 one: a /24 for IPv4 would put a
//   whole office or a mobile carrier's pool behind one person's mistakes, and an IPv6 user owns a /64 whole.
// - The honeypot is a form field a person never sees (`website`). Anything in it is refused with the ordinary
//   invalid-input answer, so the refusal teaches a bot nothing about which of its fields was wrong.

import { Router, type Request, type Response } from "express";
// Added 2026-10-13 (T188): the fill-time rule of the club's forms, shared with the feedback route and the sign-up page.
import { fillTimeAccepted } from "../../../src/lib/fill-time.js";
import type { Pool } from "../db/pool.js";
import { sendError } from "../http/errors.js";
import {
  changePassword,
  createAccount,
  findAccount,
  updateProfile,
  type Account,
} from "./accounts.js";
import { AddressLimiter, signinLimits } from "./limits.js";
import { nextPath } from "./next-path.js";
import { signIn } from "./signin.js";
import {
  addressPrefixOf,
  buildSessionCookie,
  clearSessionCookie,
  endOtherSessions,
  endSession,
  endSessionByHandle,
  handleOf,
  listSessions,
  readSessionCookie,
  renewSession,
  resolveSession,
  type SessionRecord,
} from "./session.js";

// The account page of the site (src/config.ts, site.auth.account): where a visitor goes when `next` is not a page of
// this site and where a forced password change happens. It is the same address as that constant, written out because
// the backend cannot compile src/config.ts (import.meta.env); a test of the pages (T053) pins the two together.
export const accountPath = "/auth/account/";

export type AuthRouterDeps = { pool: Pool; siteOrigin: string };

/** What the browser is told about an account: no hash, no counters. */
function viewerJson(account: Account) {
  return {
    userId: account.id,
    email: account.email,
    login: account.login,
    displayName: account.displayName,
    status: account.status,
    superuser: account.superuser,
    mustChange: account.mustChange,
    blockedBy: account.blockedBy,
    // Added 2026-10-11 (T152): the account page says until which day the lectures are open.
    accessUntil: account.accessUntil,
  };
}

/** The key of the address windows: the whole IPv4 address, the /64 of an IPv6 one. */
export function limiterKeyOf(address: string | undefined): string {
  if (!address) return "unknown";
  const plain = address.startsWith("::ffff:") ? address.slice(7) : address;
  return plain.includes(":") ? addressPrefixOf(plain) : plain;
}

/** A short human label of the browser and system out of a User-Agent summary; "Unknown device" when none fits. */
export function deviceOf(userAgent: string): string {
  const browser = /Edg(?:e|A|iOS)?\//.test(userAgent)
    ? "Edge"
    : /OPR\/|Opera/.test(userAgent)
      ? "Opera"
      : /Firefox\/|FxiOS\//.test(userAgent)
        ? "Firefox"
        : /Chrome\/|CriOS\//.test(userAgent)
          ? "Chrome"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : null;
  const system = /Windows/.test(userAgent)
    ? "Windows"
    : /Android/.test(userAgent)
      ? "Android"
      : /iPhone|iPad|iPod/.test(userAgent)
        ? "iOS"
        : /Mac OS X|Macintosh/.test(userAgent)
          ? "macOS"
          : /Linux|X11/.test(userAgent)
            ? "Linux"
            : null;
  if (browser && system) return `${browser}, ${system}`;
  return browser ?? system ?? "Unknown device";
}

type Context = {
  /** The id the browser sent, even when it no longer names a live session. */
  cookieId: string | null;
  session: SessionRecord | null;
  account: Account | null;
};

// Where the middleware leaves what it found, typed once instead of reaching into `res.locals` as `any`.
function contextOf(res: Response): Context {
  return res.locals["auth"] as Context;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function authRouter({ pool, siteOrigin }: AuthRouterDeps): Router {
  const router = Router();
  const signinWindow = new AddressLimiter();
  const signupWindow = new AddressLimiter({
    maxFailures: signinLimits.signupMaxPerAddress,
    windowMs: signinLimits.signupWindowMs,
  });

  router.use(async (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    const cookieId = readSessionCookie(req.headers.cookie);
    const session = cookieId ? await resolveSession(pool, cookieId) : null;
    const account = session ? await findAccount(pool, session.userId) : null;
    // A session whose account is gone is no session (it cannot happen while nothing deletes accounts, FR-018a).
    const context: Context = {
      cookieId,
      session: account ? session : null,
      account,
    };
    res.locals["auth"] = context;
    next();
  });

  // A new session for the account, replacing the one the browser brought, and the cookie that carries it.
  async function startSession(
    req: Request,
    res: Response,
    account: Account,
    limited: boolean,
  ): Promise<string> {
    const { cookieId } = contextOf(res);
    const now = new Date();
    const { id, session } = await renewSession(
      pool,
      cookieId ?? "",
      {
        userId: account.id,
        status: account.status,
        superuser: account.superuser,
        limited,
        userAgent: req.get("user-agent") ?? "",
        address: req.ip ?? "",
      },
      now,
    );
    const maxAge = Math.max(
      1,
      Math.floor((session.absoluteExpiresAt.getTime() - now.getTime()) / 1000),
    );
    res.append("Set-Cookie", buildSessionCookie(id, maxAge));
    return id;
  }

  function tooMany(res: Response, retryAfterSeconds: number): void {
    res.setHeader("Retry-After", String(retryAfterSeconds));
    sendError(res, 429, "rate_limited", "Too many attempts. Try again later.");
  }

  router.post("/signup", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const key = limiterKeyOf(req.ip);
    const gate = signupWindow.check(key, new Date());
    if (!gate.allowed) return tooMany(res, gate.retryAfterSeconds);
    // Every request that gets past this point counts, whatever its outcome: the cap is on attempts, not on successes.
    signupWindow.recordFailure(key, new Date());

    const honeypot = body["website"];
    if (typeof honeypot === "string" && honeypot !== "") {
      return sendError(res, 400, "invalid_input", "The form is not valid.");
    }
    // Added 2026-10-13 (T188): a form sent in under three seconds, with no opening time, from the future or a day old
    // was not filled by a person; the same plain 400 as the honeypot, so the answer names no check. The cap above
    // already counted the attempt.
    if (!fillTimeAccepted(body["startedAt"], Date.now())) {
      return sendError(res, 400, "invalid_input", "The form is not valid.");
    }
    const email = asString(body["email"]);
    const password = asString(body["password"]);
    const displayName = asString(body["displayName"]);
    const login = body["login"] === undefined ? null : asString(body["login"]);
    if (email === null || password === null || displayName === null) {
      return sendError(res, 400, "invalid_input", "The form is not valid.");
    }
    const result = await createAccount(pool, {
      email,
      password,
      displayName,
      login,
    });
    if (!result.ok) {
      if (result.problem === "taken") {
        return sendError(
          res,
          409,
          "conflict",
          result.field === "email"
            ? "This address is already registered."
            : "This login name is already taken.",
          result.field,
        );
      }
      // Changed 2026-10-11 (T053): the stable `problem` code beside the field, so the page writes the sentence itself.
      res.status(400).json({
        error: "invalid_input",
        message: `The ${result.field} is not valid (${result.problem}).`,
        field: result.field,
        problem: result.problem,
      });
      return;
    }
    await startSession(req, res, result.account, false);
    res.status(201).json({ viewer: viewerJson(result.account) });
  });

  router.post("/signin", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const identifier = asString(body["identifier"]);
    const password = asString(body["password"]);
    if (identifier === null || password === null) {
      return sendError(res, 400, "invalid_input", "The form is not valid.");
    }
    const result = await signIn(
      pool,
      { identifier, password, address: limiterKeyOf(req.ip) },
      { limiter: signinWindow },
    );
    if (!result.ok) {
      if (result.reason === "invalid") {
        // One text for an unknown name, a wrong password, an expired temporary one and an account with no password.
        // Changed 2026-10-11 (T053): the same answer also carries how many tries are left before a pause, from the
        // third failure of a step on, and the length of the pause the failure just earned.
        res.status(401).json({
          error: "unauthorized",
          message: "The address, login name or password is not right.",
          ...(result.attemptsLeft !== undefined && {
            attemptsLeft: result.attemptsLeft,
          }),
          ...(result.pauseSeconds !== undefined && {
            retryAfterSeconds: result.pauseSeconds,
          }),
        });
        return;
      }
      return tooMany(res, result.retryAfterSeconds);
    }
    const account = await findAccount(pool, result.userId);
    if (!account) {
      return sendError(res, 500, "internal", "Something went wrong.");
    }
    await startSession(req, res, account, result.mustChange);
    // A temporary password has one place to go; anything else is `next` if it is a page of this site.
    const redirect = result.mustChange
      ? accountPath
      : nextPath(asString(body["next"]), siteOrigin, accountPath);
    res.status(200).json({ viewer: viewerJson(account), redirect });
  });

  function requireSession(req: Request, res: Response): Context | null {
    const context = contextOf(res);
    if (!context.session || !context.account) {
      sendError(res, 401, "unauthorized", "Sign in first.");
      return null;
    }
    return context;
  }

  // Everything but change-password, signout and me needs a session that is not limited.
  function requireFullSession(req: Request, res: Response): Context | null {
    const context = requireSession(req, res);
    if (!context) return null;
    if (context.session?.limited) {
      sendError(
        res,
        403,
        "forbidden",
        "Change the temporary password first.",
        "password",
      );
      return null;
    }
    return context;
  }

  router.post("/signout", async (req, res) => {
    const context = requireSession(req, res);
    if (!context) return;
    if (context.cookieId) await endSession(pool, context.cookieId);
    res.append("Set-Cookie", clearSessionCookie());
    res.status(200).json({});
  });

  router.post("/change-password", async (req, res) => {
    const context = requireSession(req, res);
    if (!context?.account) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const current = asString(body["current"]);
    const next = asString(body["next"]);
    if (current === null || next === null) {
      return sendError(res, 400, "invalid_input", "The form is not valid.");
    }
    const key = limiterKeyOf(req.ip);
    const gate = signinWindow.check(key, new Date());
    if (!gate.allowed) return tooMany(res, gate.retryAfterSeconds);

    const result = await changePassword(
      pool,
      context.account.id,
      { current, next },
      { recordFailure: () => signinWindow.recordFailure(key, new Date()) },
    );
    if (!result.ok) {
      if (result.reason === "locked") {
        return tooMany(res, result.retryAfterSeconds);
      }
      if (result.reason === "wrong_current") {
        // Changed 2026-10-11 (T053): the tries left and the pause just earned, as for a sign-in.
        res.status(400).json({
          error: "invalid_input",
          message: "The current password is not right.",
          field: "current",
          ...(result.attemptsLeft !== undefined && {
            attemptsLeft: result.attemptsLeft,
          }),
          ...(result.pauseSeconds !== undefined && {
            retryAfterSeconds: result.pauseSeconds,
          }),
        });
        return;
      }
      res.status(400).json({
        error: "invalid_input",
        message: `The new password is not valid (${result.problem}).`,
        field: "next",
        problem: result.problem,
      });
      return;
    }
    // The rights and the password changed: a new id for this session, and every other session of the account ends.
    const account = await findAccount(pool, context.account.id);
    if (!account) {
      return sendError(res, 500, "internal", "Something went wrong.");
    }
    const newId = await startSession(req, res, account, false);
    await endOtherSessions(pool, account.id, newId);
    res.status(200).json({ viewer: viewerJson(account) });
  });

  // Added 2026-10-11 (T146): the member edits the display name and the login name. A full session only (a limited one
  // has no business here before it has its own password). The email address is not accepted at all, whatever the body
  // holds: it waits for phase 9 (FR-012a). A field left out is left as it is; `login: ""` or `null` removes the login.
  router.patch("/profile", async (req, res) => {
    const context = requireFullSession(req, res);
    if (!context?.account) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const rawName = body["displayName"];
    const rawLogin = body["login"];
    // Present means a string (the login may also be null, which removes it); any other type is a malformed form.
    const nameBad = rawName !== undefined && typeof rawName !== "string";
    const loginBad =
      rawLogin !== undefined &&
      rawLogin !== null &&
      typeof rawLogin !== "string";
    if (nameBad || loginBad) {
      return sendError(res, 400, "invalid_input", "The form is not valid.");
    }
    const result = await updateProfile(pool, context.account.id, {
      ...(typeof rawName === "string" && { displayName: rawName }),
      ...(rawLogin !== undefined && { login: rawLogin as string | null }),
    });
    if (!result.ok) {
      if (result.problem === "taken") {
        return sendError(
          res,
          409,
          "conflict",
          "This login name is already taken.",
          result.field,
        );
      }
      res.status(400).json({
        error: "invalid_input",
        message: `The ${result.field} is not valid (${result.problem}).`,
        field: result.field,
        problem: result.problem,
      });
      return;
    }
    res.status(200).json({ viewer: viewerJson(result.account) });
  });

  router.get("/me", (_req, res) => {
    const { account } = contextOf(res);
    res.status(200).json({ viewer: account ? viewerJson(account) : null });
  });

  router.get("/sessions", async (req, res) => {
    const context = requireFullSession(req, res);
    if (!context?.session || !context.account) return;
    const rows = await listSessions(pool, context.account.id);
    res.status(200).json(
      rows.map((row) => ({
        id: handleOf(row.idHash),
        device: deviceOf(row.userAgentSummary),
        created: row.createdAt.toISOString(),
        lastSeen: row.lastSeenAt.toISOString(),
        current: row.idHash.equals(context.session!.idHash),
      })),
    );
  });

  // `DELETE /api/auth/sessions?all=others` ends every session but this one; `/sessions/:id` ends one of the account's own.
  router.delete("/sessions", async (req, res) => {
    const context = requireFullSession(req, res);
    if (!context?.account) return;
    if (req.query["all"] !== "others") {
      return sendError(
        res,
        400,
        "invalid_input",
        "Name a session, or ask for all=others.",
      );
    }
    const ended = await endOtherSessions(
      pool,
      context.account.id,
      context.cookieId ?? undefined,
    );
    res.status(200).json({ ended });
  });

  router.delete("/sessions/:id", async (req, res) => {
    const context = requireFullSession(req, res);
    if (!context?.account || !context.session) return;
    const handle = String(req.params["id"]);
    const ended = await endSessionByHandle(pool, context.account.id, handle);
    if (!ended) {
      // Another account's session and a made-up one are the same answer.
      return sendError(res, 404, "not_found", "No such session.");
    }
    if (handleOf(context.session.idHash) === handle) {
      res.append("Set-Cookie", clearSessionCookie());
    }
    res.status(200).json({});
  });

  return router;
}
