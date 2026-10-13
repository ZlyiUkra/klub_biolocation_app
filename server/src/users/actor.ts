// The person behind an administration request (extracted 2026-10-12 by T097 from the users router, so the content
// routes of the panel decide "may this caller use the panel" with the very same function).
//
// Decisions that would otherwise look like mistakes:
// - Anyone who may not is `null`, and the caller answers 404: the contract says every administration route is a 404
//   to a visitor with no session, a limited session, a plain member and a blocked account alike.
// - The rights are read from the database on every request, never from the session record: a status changed a second
//   ago takes effect on the next request (OWASP Authorization Patterns Cheat Sheet: validate permissions on every
//   request, deny by default).

import type { Request } from "express";
import { findAccount } from "../auth/accounts.js";
import { readSessionCookie, resolveSession } from "../auth/session.js";
import type { Pool } from "../db/pool.js";
import { mayAdminister, type Actor } from "./status-rules.js";

export async function adminActorOf(
  pool: Pool,
  req: Request,
): Promise<Actor | null> {
  const id = readSessionCookie(req.headers.cookie);
  if (id === null) return null;
  const session = await resolveSession(pool, id);
  if (session === null || session.limited) return null;
  const account = await findAccount(pool, session.userId);
  if (account === null || !mayAdminister(account)) return null;
  return {
    id: account.id,
    status: account.status,
    superuser: account.superuser,
  };
}
