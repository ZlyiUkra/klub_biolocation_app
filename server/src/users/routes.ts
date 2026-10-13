// The users routes (T065 of specs/001-self-hosted-club-site; contracts/http-api.md "Administration"; tests:
// server/test/users-routes.test.ts). The list of accounts for a metr and an admin, the change of a status, and the
// temporary password. Every decision of who may do what is `status-rules.ts`; this file only reads the request, takes
// the lock, applies what the rules allow and writes the audit row.
//
// Decisions that would otherwise look like mistakes:
// - Everything here answers 404 to anyone who may not use it, a visitor with no session, a limited session and a plain
//   member alike (the contract: "all 404 to anyone who may not use them"), so the route's existence is not a fact a
//   stranger can read off an answer. A refusal of a particular change is a 403 with a `reason`: the caller is an
//   administrator and may be told why.
// - The target row is locked (SELECT ... FOR UPDATE, PostgreSQL docs "Concurrency Control") for the whole decision, so
//   two administrators changing the same account at once cannot both pass a check made on a row the other one just
//   changed. The audit row is written in the same transaction as the change it records.
// - The rights are read from the database on every request, never from the session record: a status changed a second
//   ago takes effect on the next request (OWASP Authorization Patterns Cheat Sheet: validate permissions on every
//   request, deny by default).
// - A temporary password ends every session of the account and clears its failure counters. The first because the
//   person asked for a new password (a thief with the old one must not keep a session), the second because a paused
//   account would otherwise make the temporary password useless for the minutes of the pause.
// - The search is a plain substring test (`strpos` on a lower-cased text), not LIKE, so a `%` or `_` in what an
//   administrator types is an ordinary character and needs no escaping.

import { Router, type Request, type Response } from "express";
import type { Pool } from "../db/pool.js";
import { withTransaction } from "../db/pool.js";
import { sendError } from "../http/errors.js";
import { findAccount } from "../auth/accounts.js";
import { hashPassword } from "../auth/password.js";
import { clearFailedAttempts } from "../auth/limits.js";
import {
  addressPrefixOf,
  endOtherSessions,
  readSessionCookie,
  resolveSession,
} from "../auth/session.js";
import { writeAudit, type Queryable } from "./audit.js";
import { adminActorOf } from "./actor.js";
import { closeOpenHandovers } from "./credentials.js";
import { isRealDay } from "../../../src/lib/lecture-rules.js";
import { accessDateAfterStatusChange } from "./lecture-access.js";
import {
  assignable,
  isStatus,
  mayAdminister,
  refusalOfAccessDate,
  refusalOfChange,
  refusalOfTemporaryPassword,
  type Actor,
  type Refusal,
  type Status,
  type Target,
} from "./status-rules.js";
import {
  generateTemporaryPassword,
  temporaryPasswordLifetimeMs,
} from "./temp-password.js";

// The page size when the caller names none, and the most it may ask for (site.admin.pageSize is 20).
// Changed 2026-10-13: the two numbers and `positiveInt` below are http/paging.ts now, the one home the posts' list and
// the feedback list share; this file kept its own copy until the third list needed it.
import { defaultPageSize, maxPageSize, positiveInt } from "../http/paging.js";

type UserRow = {
  id: string | number;
  display_name: string;
  email: string;
  login: string | null;
  status: Status;
  is_superuser: boolean;
  must_change: boolean;
  has_password: boolean;
  created_at: Date;
  blocked_by_status: string | null;
  /** `YYYY-MM-DD` (UTC) or null; added 2026-10-11 (T152). Read as text so no time zone can move the day. */
  access_until: string | null;
};

const userColumns = `u.id, u.display_name, u.email, u.login, u.status, u.is_superuser, u.must_change,
  (u.password_hash is not null) as has_password, u.created_at, b.status as blocked_by_status,
  to_char(u.access_until, 'YYYY-MM-DD') as access_until`;
const userFrom = "users u left join users b on b.id = u.blocked_by";

function shownUser(row: UserRow, actorId: number) {
  return {
    id: Number(row.id),
    displayName: row.display_name,
    email: row.email,
    login: row.login,
    status: row.status,
    // Who set a block, as a status, so the page can say a metr may not lift an admin's.
    statusBy:
      row.status === "blocked" &&
      (row.blocked_by_status === "admin" || row.blocked_by_status === "metr")
        ? row.blocked_by_status
        : null,
    createdAt: row.created_at.toISOString(),
    protected: row.is_superuser,
    self: Number(row.id) === actorId,
    mustChange: row.must_change,
    hasPassword: row.has_password,
    // Added 2026-10-11 (T152): the last UTC day the account may open the paid lectures, or null.
    accessUntil: row.access_until,
  };
}

function targetOf(row: UserRow): Target {
  return {
    id: Number(row.id),
    status: row.status,
    superuser: row.is_superuser,
    blockedBy:
      row.blocked_by_status === "admin" || row.blocked_by_status === "metr"
        ? row.blocked_by_status
        : null,
  };
}

const refusalMessages: Record<Refusal, string> = {
  forbidden: "You may not do this.",
  self: "Nobody changes their own account here.",
  protected: "This account is protected.",
  guest: "Guest is what an account starts as; it is never given.",
  rank: "This is above what your status may change.",
};

function refuse(res: Response, reason: Refusal): void {
  res.status(403).json({
    error: "forbidden",
    message: refusalMessages[reason],
    reason,
  });
}

function notFound(res: Response): void {
  sendError(res, 404, "not_found", "No such API route.");
}

// Removed 2026-10-13: `positiveInt` lived here; it is imported from ../http/paging.js (see the imports).

export function usersRouter({ pool }: { pool: Pool }): Router {
  const router = Router();

  // The actor of every route below, read from the session and the database; anyone else is a 404.
  // Changed 2026-10-12 (T097): the function is users/actor.ts, shared with the content routes of the panel.
  const actorOf = (req: Request): Promise<Actor | null> =>
    adminActorOf(pool, req);

  router.use("/users", async (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    const actor = await actorOf(req);
    if (actor === null) return notFound(res);
    res.locals["actor"] = actor;
    next();
  });
  const actorOfResponse = (res: Response): Actor =>
    res.locals["actor"] as Actor;

  router.get("/users", async (req, res) => {
    const actor = actorOfResponse(res);
    const size = positiveInt(req.query["limit"], defaultPageSize, maxPageSize);
    const page = positiveInt(req.query["page"], 1, 1_000_000);
    const q = typeof req.query["q"] === "string" ? req.query["q"].trim() : "";
    const needle = q.toLowerCase().slice(0, 100);
    // Added 2026-10-11 (T070, step 3b): `?status=admin` lists one status only, which is how the superuser's page fills
    // the list of administrators the role may be handed to without paging through every member. An unknown value is
    // ignored, as an unknown page number is.
    const rawStatus = req.query["status"];
    const onlyStatus = isStatus(rawStatus) ? rawStatus : null;
    const conditions: string[] = [];
    const params: string[] = [];
    if (needle !== "") {
      params.push(needle);
      conditions.push(
        `strpos(lower(u.display_name || ' ' || u.email || ' ' || coalesce(u.login, '')), $${params.length}) > 0`,
      );
    }
    if (onlyStatus !== null) {
      params.push(onlyStatus);
      conditions.push(`u.status = $${params.length}`);
    }
    const where =
      conditions.length === 0 ? "" : `where ${conditions.join(" and ")}`;
    const total = Number(
      (
        await pool.query<{ n: string }>(
          `select count(*) as n from users u ${where}`,
          params,
        )
      ).rows[0]?.n ?? 0,
    );
    const rows = await pool.query<UserRow>(
      `select ${userColumns} from ${userFrom} ${where}
        order by lower(coalesce(nullif(u.display_name, ''), u.email)), u.id
        limit ${size} offset ${(page - 1) * size}`,
      params,
    );
    res.status(200).json({
      users: rows.rows.map((row) => shownUser(row, actor.id)),
      total,
      page,
      pageSize: size,
      you: {
        id: actor.id,
        status: actor.status,
        assignable: assignable(actor),
      },
    });
  });

  // One account's row, locked for the rest of the transaction; null when there is none.
  async function lockedTarget(
    db: Queryable,
    id: number,
  ): Promise<UserRow | null> {
    const result = await db.query<UserRow>(
      `select ${userColumns} from ${userFrom} where u.id = $1 for update of u`,
      [id],
    );
    return result.rows[0] ?? null;
  }
  const idOf = (value: unknown): number | null => {
    const n = Number(typeof value === "string" ? value : NaN);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  };

  router.patch("/users/:id/status", async (req, res) => {
    const actor = actorOfResponse(res);
    const id = idOf(req.params["id"]);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const wanted = body["status"];
    if (id === null || !isStatus(wanted)) {
      return sendError(res, 400, "invalid_input", "The status is not valid.");
    }
    type Outcome =
      | { kind: "missing" }
      | { kind: "refused"; reason: Refusal }
      | { kind: "done"; row: UserRow; unchanged: boolean };
    const outcome = await withTransaction(
      pool,
      async (client): Promise<Outcome> => {
        const row = await lockedTarget(client, id);
        if (row === null) return { kind: "missing" };
        const reason = refusalOfChange(actor, targetOf(row), wanted);
        if (reason !== null) return { kind: "refused", reason };
        if (row.status === wanted)
          return { kind: "done", row, unchanged: true };
        // Added 2026-10-11 (T152): the status and the lecture date change together, in this one statement, so there is
        // no moment where a user exists without the date that lets them in (the rule is lecture-access.ts).
        const newDate = accessDateAfterStatusChange(
          row.status,
          wanted,
          row.access_until,
        );
        await client.query(
          `update users
            set status = $2::text,
                blocked_by = case when $2::text = 'blocked' then $3::bigint else null end,
                blocked_at = case when $2::text = 'blocked' then now() else null end,
                access_until = $4::date,
                updated_at = clock_timestamp()
          where id = $1`,
          [id, wanted, actor.id, newDate],
        );
        await writeAudit(client, {
          actorId: actor.id,
          action:
            wanted === "blocked"
              ? "account_blocked"
              : row.status === "blocked"
                ? "account_unblocked"
                : "status_changed",
          targetKind: "account",
          targetId: id,
          detail: {
            from: row.status,
            to: wanted,
            ...(newDate !== row.access_until && {
              accessUntil: { from: row.access_until, to: newDate },
            }),
          },
          addressPrefix: addressPrefixOf(req.ip),
        });
        const fresh = await lockedTarget(client, id);
        return { kind: "done", row: fresh ?? row, unchanged: false };
      },
    );
    if (outcome.kind === "missing") {
      return sendError(res, 404, "not_found", "No such account.");
    }
    if (outcome.kind === "refused") return refuse(res, outcome.reason);
    res.status(200).json({
      user: shownUser(outcome.row, actor.id),
      ...(outcome.unchanged && { unchanged: true }),
    });
  });

  // Added 2026-10-11 (T152, the owner's choice 2-A: the same people who may change the status): the date up to which
  // an account may open the paid lectures, set by hand. `null` takes the right away (a guest has none by default).
  router.patch("/users/:id/access", async (req, res) => {
    const actor = actorOfResponse(res);
    const id = idOf(req.params["id"]);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const wanted = body["accessUntil"];
    if (id === null || !(wanted === null || isRealDay(wanted))) {
      return sendError(res, 400, "invalid_input", "The date is not valid.");
    }
    type Outcome =
      | { kind: "missing" }
      | { kind: "refused"; reason: Refusal }
      | { kind: "done"; row: UserRow; unchanged: boolean };
    const outcome = await withTransaction(
      pool,
      async (client): Promise<Outcome> => {
        const row = await lockedTarget(client, id);
        if (row === null) return { kind: "missing" };
        const reason = refusalOfAccessDate(actor, targetOf(row));
        if (reason !== null) return { kind: "refused", reason };
        if (row.access_until === wanted) {
          return { kind: "done", row, unchanged: true };
        }
        await client.query(
          `update users set access_until = $2::date, updated_at = clock_timestamp() where id = $1`,
          [id, wanted],
        );
        await writeAudit(client, {
          actorId: actor.id,
          action: "access_until_changed",
          targetKind: "account",
          targetId: id,
          detail: { from: row.access_until, to: wanted },
          addressPrefix: addressPrefixOf(req.ip),
        });
        const fresh = await lockedTarget(client, id);
        return { kind: "done", row: fresh ?? row, unchanged: false };
      },
    );
    if (outcome.kind === "missing") {
      return sendError(res, 404, "not_found", "No such account.");
    }
    if (outcome.kind === "refused") return refuse(res, outcome.reason);
    res.status(200).json({
      user: shownUser(outcome.row, actor.id),
      ...(outcome.unchanged && { unchanged: true }),
    });
  });

  router.post("/users/:id/temp-password", async (req, res) => {
    const actor = actorOfResponse(res);
    const id = idOf(req.params["id"]);
    if (id === null) {
      return sendError(res, 404, "not_found", "No such account.");
    }
    // Hashing is slow on purpose and is done before the lock, so the row is not held for the whole of it.
    const password = generateTemporaryPassword();
    const hash = await hashPassword(password);
    const expiresAt = new Date(Date.now() + temporaryPasswordLifetimeMs);
    type Outcome =
      | { kind: "missing" }
      | { kind: "refused"; reason: Refusal }
      | { kind: "done" };
    const outcome = await withTransaction(
      pool,
      async (client): Promise<Outcome> => {
        const row = await lockedTarget(client, id);
        if (row === null) return { kind: "missing" };
        const reason = refusalOfTemporaryPassword(actor, targetOf(row));
        if (reason !== null) return { kind: "refused", reason };
        await client.query(
          `update users
            set password_hash = $2, must_change = true, password_expires_at = $3,
                updated_at = clock_timestamp()
          where id = $1`,
          [id, hash, expiresAt],
        );
        // Added 2026-10-11 (T170): a password nobody chose is a changed credential too; an open hand-over that
        // involves this account (an admin may be its target) is closed, the same as for any other change. Not
        // `credentialsChanged`: this one sets `must_change` and an expiry.
        await closeOpenHandovers(client, {
          reason: "credentials_changed",
          userIds: [id],
        });
        await writeAudit(client, {
          actorId: actor.id,
          action: "temp_password_issued",
          targetKind: "account",
          targetId: id,
          // The password itself is never written anywhere but the response.
          detail: { expiresAt: expiresAt.toISOString() },
          addressPrefix: addressPrefixOf(req.ip),
        });
        return { kind: "done" };
      },
    );
    if (outcome.kind === "missing") {
      return sendError(res, 404, "not_found", "No such account.");
    }
    if (outcome.kind === "refused") return refuse(res, outcome.reason);
    await endOtherSessions(pool, id);
    await clearFailedAttempts(pool, id);
    res.status(200).json({ password, expiresAt: expiresAt.toISOString() });
  });

  return router;
}
