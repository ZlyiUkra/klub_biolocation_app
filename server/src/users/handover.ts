// The handover of the superuser role from the pages (T068 of specs/001-self-hosted-club-site;
// security-review-superuser.md, way B of section 2; tests: server/test/handover.test.ts).
//
// The steps: the superuser starts it with the password typed again and names an account that is ALREADY an admin;
// that account accepts with its own password; the role waits `coolingHours` (24; src/lib/handover-rules.ts) and
// moves; either party may cancel at any moment before it moves. A request nobody accepts lapses after 7 days.
//
// Decisions that would otherwise look like mistakes:
// - The target must be an admin when the request STARTS and when it COMPLETES: the status can change in between
//   (a metr cannot, but an admin or the command can), and a check constraint cannot see another row, so the module
//   asks twice. A request whose target stopped being an admin, or whose source stopped being the superuser, is closed
//   instead of moving the role.
// - A request that lapsed is cancelled by the next one that starts, so a lapsed row never blocks a new request (the
//   index allows one open request).
// - Completion is by a timer in the server process (`completeDueHandovers`, called by main.ts once a minute and at
//   start), not by a check on each request: the owner chose it on 2026-10-11, and it means no extra query on every
//   request. A server that was down when the cooling period ended completes the request at its next start.
// - With zero cooling hours the role moves in the same request that accepts it.
// - The role itself is written only by `moveRole` of superuser.ts.

import type { Pool } from "../db/pool.js";
import { withTransaction } from "../db/pool.js";
import { handoverRules } from "../../../src/lib/handover-rules.js";
import { writeAudit, type Queryable } from "./audit.js";
import { checkPasswordAgain, type ReauthResult } from "./reauth.js";
import { lockAccounts, moveRole } from "./superuser.js";

const hour = 60 * 60 * 1000;
const day = 24 * hour;

export type HandoverState = {
  id: number;
  /** Which side the asking account is. */
  role: "from" | "to";
  other: { id: number; displayName: string; email: string };
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  effectiveAt: string | null;
};

type RequestRow = {
  id: string;
  from_user: string;
  to_user: string;
  created_at: Date;
  expires_at: Date;
  accepted_at: Date | null;
  effective_at: Date | null;
};

const notOpen = "completed_at is null and cancelled_at is null";

/** Closes the requests that nobody accepted in time. Inside the caller's transaction or on a pool. */
async function cancelLapsed(db: Queryable, now: Date): Promise<void> {
  await db.query(
    `update handover_requests set cancelled_at = $1
      where ${notOpen} and accepted_at is null and expires_at <= $1`,
    [now],
  );
}

export type StartResult =
  | { ok: true; state: HandoverState }
  | Exclude<ReauthResult, { ok: true }>
  | { ok: false; reason: "not_superuser" | "bad_target" | "open_exists" };

export async function startHandover(
  pool: Pool,
  fromId: number,
  password: string,
  toId: number,
  now: Date = new Date(),
): Promise<StartResult> {
  const again = await checkPasswordAgain(pool, fromId, password, now);
  if (!again.ok) return again;
  return withTransaction(pool, async (client): Promise<StartResult> => {
    const me = await client.query(
      "select 1 from users where id = $1 and is_superuser for update",
      [fromId],
    );
    if ((me.rowCount ?? 0) === 0) return { ok: false, reason: "not_superuser" };
    const target = await client.query<{
      id: string;
      display_name: string;
      email: string;
    }>(
      `select id, display_name, email from users
        where id = $1 and status = 'admin' and not is_superuser and id <> $2 for update`,
      [toId, fromId],
    );
    const to = target.rows[0];
    if (!to) return { ok: false, reason: "bad_target" };
    await cancelLapsed(client, now);
    const open = await client.query(
      `select 1 from handover_requests where ${notOpen}`,
    );
    if ((open.rowCount ?? 0) > 0) return { ok: false, reason: "open_exists" };
    const expiresAt = new Date(
      now.getTime() + handoverRules.requestLifetimeDays * day,
    );
    const inserted = await client.query<{ id: string; created_at: Date }>(
      `insert into handover_requests (from_user, to_user, created_at, expires_at)
       values ($1, $2, $3, $4) returning id, created_at`,
      [fromId, toId, now, expiresAt],
    );
    const row = inserted.rows[0]!;
    await writeAudit(client, {
      actorId: fromId,
      action: "handover_started",
      targetKind: "account",
      targetId: toId,
    });
    return {
      ok: true,
      state: {
        id: Number(row.id),
        role: "from",
        other: {
          id: Number(to.id),
          displayName: to.display_name,
          email: to.email,
        },
        createdAt: row.created_at.toISOString(),
        expiresAt: expiresAt.toISOString(),
        acceptedAt: null,
        effectiveAt: null,
      },
    };
  });
}

export type AcceptResult =
  | { ok: true; effectiveAt: string; completed: boolean }
  | Exclude<ReauthResult, { ok: true }>
  | { ok: false; reason: "none" };

export async function acceptHandover(
  pool: Pool,
  userId: number,
  password: string,
  now: Date = new Date(),
): Promise<AcceptResult> {
  // The request is looked for first, so a person with nothing to accept is not asked for a password.
  await cancelLapsed(pool, now);
  const pending = await pool.query(
    `select 1 from handover_requests
      where ${notOpen} and accepted_at is null and to_user = $1`,
    [userId],
  );
  if ((pending.rowCount ?? 0) === 0) return { ok: false, reason: "none" };
  const again = await checkPasswordAgain(pool, userId, password, now);
  if (!again.ok) return again;
  return withTransaction(pool, async (client): Promise<AcceptResult> => {
    const found = await client.query<{ id: string; from_user: string }>(
      `select id, from_user from handover_requests
        where ${notOpen} and accepted_at is null and to_user = $1 and expires_at > $2
        for update`,
      [userId, now],
    );
    const request = found.rows[0];
    if (!request) return { ok: false, reason: "none" };
    const effectiveAt = new Date(
      now.getTime() + handoverRules.coolingHours * hour,
    );
    await client.query(
      `update handover_requests set accepted_at = $2, effective_at = $3 where id = $1`,
      [request.id, now, effectiveAt],
    );
    await writeAudit(client, {
      actorId: userId,
      action: "handover_accepted",
      targetKind: "account",
      targetId: userId,
      detail: {
        coolingHours: handoverRules.coolingHours,
        effectiveAt: effectiveAt.toISOString(),
      },
    });
    let completed = false;
    if ((handoverRules.coolingHours as number) === 0) {
      // The constant is typed as its literal; widened here so that setting it to zero compiles (instant handover).
      completed = await completeOne(client, Number(request.id), now);
    }
    return { ok: true, effectiveAt: effectiveAt.toISOString(), completed };
  });
}

/** Cancels the open request the account is a side of. True when there was one. */
export async function cancelHandover(
  pool: Pool,
  userId: number,
  now: Date = new Date(),
): Promise<boolean> {
  return withTransaction(pool, async (client) => {
    const found = await client.query<{ id: string; from_user: string }>(
      `select id, from_user from handover_requests
        where ${notOpen} and (from_user = $1 or to_user = $1) for update`,
      [userId],
    );
    const request = found.rows[0];
    if (!request) return false;
    await client.query(
      "update handover_requests set cancelled_at = $2 where id = $1",
      [request.id, now],
    );
    await writeAudit(client, {
      actorId: userId,
      action: "handover_cancelled",
      targetKind: "account",
      targetId: userId,
      detail: {
        by: Number(request.from_user) === userId ? "superuser" : "target",
      },
    });
    return true;
  });
}

/**
 * Moves the role for one accepted request whose time has come, inside the caller's transaction. False (and the request
 * closed) when the situation changed: the source is no longer the superuser, or the target no longer an admin.
 */
async function completeOne(
  client: Queryable,
  requestId: number,
  now: Date,
): Promise<boolean> {
  // Changed 2026-10-11 (T170, F7 of the consilium): the accounts are locked first, in id order, and the request row
  // after them. Every other path (moveRole, credentials.ts) takes accounts and then the request, so taking the
  // request first here could wait for one of them while it waited for us.
  const peek = await client.query<{ from_user: string; to_user: string }>(
    `select from_user, to_user from handover_requests where id = $1 and ${notOpen}`,
    [requestId],
  );
  const named = peek.rows[0];
  if (!named) return false;
  const fromId = Number(named.from_user);
  const toId = Number(named.to_user);
  const locked = await lockAccounts(client, [fromId, toId]);
  const found = await client.query(
    `select 1 from handover_requests where id = $1 and ${notOpen} for update`,
    [requestId],
  );
  if ((found.rowCount ?? 0) === 0) return false;
  const from = locked.get(fromId);
  const to = locked.get(toId);
  if (!from?.isSuperuser || !to || to.status !== "admin" || to.isSuperuser) {
    await client.query(
      "update handover_requests set cancelled_at = $2 where id = $1",
      [requestId, now],
    );
    await writeAudit(client, {
      actorId: null,
      action: "handover_closed",
      targetKind: "account",
      targetId: toId,
      detail: { reason: "situation_changed" },
    });
    return false;
  }
  // Completed first: moveRole closes every OTHER open request, and a request cannot be both completed and cancelled.
  await client.query(
    "update handover_requests set completed_at = $2 where id = $1",
    [requestId, now],
  );
  await moveRole(client, fromId, toId);
  await writeAudit(client, {
    actorId: null,
    action: "superuser_handed_over",
    targetKind: "account",
    targetId: toId,
    detail: { from: fromId, via: "handover" },
  });
  return true;
}

/** Completes every accepted request whose time has come and closes the lapsed ones; the number completed. */
export async function completeDueHandovers(
  pool: Pool,
  now: Date = new Date(),
): Promise<number> {
  await cancelLapsed(pool, now);
  const due = await pool.query<{ id: string }>(
    `select id from handover_requests
      where ${notOpen} and accepted_at is not null and effective_at <= $1`,
    [now],
  );
  let completed = 0;
  for (const row of due.rows) {
    const done = await withTransaction(pool, (client) =>
      completeOne(client, Number(row.id), now),
    );
    if (done) completed++;
  }
  return completed;
}

/** The open request the account is a side of, for its page; null when there is none. */
export async function handoverStateOf(
  pool: Pool,
  userId: number,
  now: Date = new Date(),
): Promise<HandoverState | null> {
  await cancelLapsed(pool, now);
  const result = await pool.query<
    RequestRow & { display_name: string; email: string; other_id: string }
  >(
    `select h.id, h.from_user, h.to_user, h.created_at, h.expires_at, h.accepted_at, h.effective_at,
            o.display_name, o.email, o.id as other_id
       from handover_requests h
       join users o on o.id = case when h.from_user = $1 then h.to_user else h.from_user end
      where ${notOpen.replace(/(\w+_at)/g, "h.$1")} and (h.from_user = $1 or h.to_user = $1)`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    role: Number(row.from_user) === userId ? "from" : "to",
    other: {
      id: Number(row.other_id),
      displayName: row.display_name,
      email: row.email,
    },
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    acceptedAt: row.accepted_at?.toISOString() ?? null,
    effectiveAt: row.effective_at?.toISOString() ?? null,
  };
}
