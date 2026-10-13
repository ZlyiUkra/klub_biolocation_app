// Who is asking: the viewer of a request, from its session cookie (T052 of specs/001-self-hosted-club-site; FR-016;
// tests: server/test/viewer.test.ts). The one place the backend turns a cookie into the `Viewer` that the access module
// (server/src/access/entries.ts) takes on every read, so a list, a page and a search cannot disagree about who is
// looking.
//
// Decisions that would otherwise look like mistakes:
// - No cookie, an unknown or an expired id, a session whose account is gone: a guest. Never an error: a stale cookie
//   must not turn a public page into a failure.
// - A session that must change its password (`limited`) reads as a guest for everything that is content. It is a
//   person with a temporary password the club gave out, who has proved nothing yet; until the password is changed they
//   see what any visitor sees, and `/api/auth/me` is the one route that says who they are.
// - A blocked account is a viewer with status `blocked`, and the access module decides what that sees; this file does
//   not special-case it.
// - Reading a session pushes its idle clock (at most once a minute, session.ts), so a person who only reads pages
//   stays signed in.

import type { Request } from "express";
import { guestViewer, type Viewer } from "../../../src/lib/viewer.js";
import type { Pool } from "../db/pool.js";
import { findAccount } from "./accounts.js";
import { readSessionCookie, resolveSession } from "./session.js";

export async function viewerOfRequest(
  pool: Pool,
  req: Pick<Request, "headers">,
): Promise<Viewer> {
  const id = readSessionCookie(req.headers.cookie);
  if (id === null) return guestViewer();
  const session = await resolveSession(pool, id);
  if (session === null || session.limited) return guestViewer();
  const account = await findAccount(pool, session.userId);
  if (account === null) return guestViewer();
  return { userId: account.id, status: account.status };
}
