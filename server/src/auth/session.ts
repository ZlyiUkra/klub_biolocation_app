// Sessions (T048 of specs/001-self-hosted-club-site; research.md section 5, data-model "sessions"; tests:
// server/test/session.test.ts). Sources: OWASP Session Management Cheat Sheet (id length and entropy, renewal after a
// change of privilege, the two timeouts, the cookie attributes) and MDN, Set-Cookie (the `__Host-` prefix).
//
// Decisions that would otherwise look like mistakes:
// - The id is 32 bytes from the system's random source, 43 characters of URL-safe base64. Only its SHA-256 is stored,
//   so a copy of the table (a backup, a stray SELECT) holds nothing a browser could be made to send. A fast hash is
//   right here and a slow one would be wrong: the input has 256 bits of entropy, so there is nothing to guess, and the
//   hash runs on every request.
// - The cookie is `__Host-session` with Secure, HttpOnly, SameSite=Lax, Path=/ and no Domain. The prefix makes a
//   browser refuse the cookie unless all of that is true and so keeps a sibling subdomain from planting one. Secure
//   means it is only sent over https: Chromium, Edge and Firefox treat http://localhost as secure, Safari does not, so
//   a developer on Safari signs in against the https address only. Lax, not Strict, so that a link from a mail or
//   another site still arrives signed in.
// - Two clocks per session, from the account's tier (src/lib/session-lifetimes.ts, the one home of the numbers). The
//   absolute one is fixed at creation; the idle one is pushed forward by use and is cut at the absolute one, which the
//   table's check constraint also insists on. The tier is read from the account at every use, so an account that was
//   blocked or promoted gets the clock of its new tier on its next request.
// - The idle clock is pushed at most once a minute (`touchEveryMs`): a page view would otherwise be a write, and a
//   minute of slack is nothing against idle clocks of an hour or more.
// - `renewSession` makes a new id and deletes the old one in one transaction, with fresh clocks, because it runs when
//   the account signs in again or when its rights or password change (session fixation: an id that was known before the
//   change must not keep the new rights). It does not carry the old absolute clock over: a person who signs in again
//   has started a new session, and a rights change ends all the other sessions anyway (`endOtherSessions`).
// - The network address is reduced to a prefix before it is stored (the first three parts of an IPv4 address, the first
//   four groups of an IPv6 one) and the browser's description is cut to 200 characters with control characters removed:
//   the account page shows them so a person can recognise their own sessions, and nobody needs more.
// - An id that is not of the shape we issue never reaches the database.

import { createHash, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import type { Pool } from "../db/pool.js";
import { withTransaction } from "../db/pool.js";
import { lifetimeOf } from "../../../src/lib/session-lifetimes.js";

/** The cookie: the `__Host-` prefix makes a browser accept it only with Secure, Path=/ and no Domain. */
export const sessionCookieName = "__Host-session";

/** One row of `sessions` as the module hands it out. The id itself is never in it: only its hash is stored. */
export type SessionRecord = {
  idHash: Buffer;
  userId: number;
  createdAt: Date;
  lastSeenAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  /** True while the account must change its password: only the change-password route works. */
  limited: boolean;
  userAgentSummary: string;
  addressPrefix: string;
};

export type NewSession = {
  userId: number;
  status:
    "guest" | "student" | "expert" | "master" | "metr" | "admin" | "blocked";
  superuser?: boolean;
  limited?: boolean;
  userAgent?: string;
  /** The visitor's network address; only a prefix of it is kept, for the account's list of sessions. */
  address?: string;
};

// What the queries need of a pool: a pool and a transaction's client both have it.
type Queryable = Pick<Pool, "query">;

const touchEveryMs = 60_000;
// The shape of an id we issue is 43 characters; the bound is wider so a later change of length needs no edit here.
const idShape = /^[A-Za-z0-9_-]{1,128}$/;

/** A fresh random id (256 bits, URL safe) and the hash that is stored for it. */
export function generateSessionId(): { id: string; hash: Buffer } {
  const id = randomBytes(32).toString("base64url");
  return { id, hash: hashSessionId(id) };
}

export function hashSessionId(id: string): Buffer {
  return createHash("sha256").update(id).digest();
}

// The attributes are written out in one place for the setting and the clearing, so the two can never disagree:
// a browser removes a cookie only when the clearing one has the same name, path and (absent) domain.
function cookieAttributes(maxAgeSeconds: number): string {
  return `Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

/** The Set-Cookie value that gives the browser a session id. */
export function buildSessionCookie(id: string, maxAgeSeconds: number): string {
  return `${sessionCookieName}=${id}; ${cookieAttributes(Math.max(0, Math.floor(maxAgeSeconds)))}`;
}

/** The Set-Cookie value that removes the cookie. */
export function clearSessionCookie(): string {
  return `${sessionCookieName}=; ${cookieAttributes(0)}`;
}

/** The session id out of a Cookie request header, or null when it is absent or the cookie is not ours. */
export function readSessionCookie(header: string | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    // The name is compared whole and case-sensitively: `session` or `x__Host-session` is somebody else's cookie.
    if (part.slice(0, separator).trim() !== sessionCookieName) continue;
    const value = part.slice(separator + 1).trim();
    return value === "" ? null : value;
  }
  return null;
}

/** A prefix of the address that is enough to recognise a place and not enough to identify a person. */
export function addressPrefixOf(address: string | undefined): string {
  if (!address) return "";
  // A dual-stack listener reports an IPv4 visitor as ::ffff:a.b.c.d.
  const plain = address.startsWith("::ffff:") ? address.slice(7) : address;
  const family = isIP(plain);
  if (family === 4) return plain.split(".").slice(0, 3).join(".");
  if (family === 6) {
    // Expand "::" so the first four groups are the first four groups of the 128 bits, whatever the spelling.
    const [head = "", tail = ""] = plain.split("::");
    const first = head === "" ? [] : head.split(":");
    const last = tail === "" ? [] : tail.split(":");
    const missing = plain.includes("::")
      ? Math.max(0, 8 - first.length - last.length)
      : 0;
    const groups = [...first, ...Array<string>(missing).fill("0"), ...last];
    return groups
      .slice(0, 4)
      .map((group) => group.toLowerCase())
      .join(":");
  }
  return "";
}

function summaryOf(userAgent: string | undefined): string {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is being removed
  return (userAgent ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 200);
}

type Row = {
  id_hash: Buffer;
  user_id: string | number;
  created_at: Date;
  last_seen_at: Date;
  idle_expires_at: Date;
  absolute_expires_at: Date;
  limited: boolean;
  user_agent_summary: string;
  address_prefix: string;
};

const columns = `id_hash, user_id, created_at, last_seen_at, idle_expires_at, absolute_expires_at, limited,
  user_agent_summary, address_prefix`;

function recordOf(row: Row): SessionRecord {
  return {
    idHash: row.id_hash,
    // bigint comes back as a string from node-postgres; the ids here are far below 2^53.
    userId: Number(row.user_id),
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    idleExpiresAt: row.idle_expires_at,
    absoluteExpiresAt: row.absolute_expires_at,
    limited: row.limited,
    userAgentSummary: row.user_agent_summary,
    addressPrefix: row.address_prefix,
  };
}

async function insertSession(
  db: Queryable,
  input: NewSession,
  now: Date,
): Promise<{ id: string; session: SessionRecord }> {
  const lifetime = lifetimeOf(input.status, input.superuser ?? false);
  const absolute = new Date(now.getTime() + lifetime.absoluteMs);
  // idleMs is shorter than absoluteMs in every tier (a test pins it), but the cut costs nothing and the table checks it.
  const idle = new Date(
    Math.min(now.getTime() + lifetime.idleMs, absolute.getTime()),
  );
  const { id, hash } = generateSessionId();
  const result = await db.query<Row>(
    `insert into sessions (id_hash, user_id, created_at, last_seen_at, idle_expires_at, absolute_expires_at,
                           limited, user_agent_summary, address_prefix)
     values ($1, $2, $3, $3, $4, $5, $6, $7, $8)
     returning ${columns}`,
    [
      hash,
      input.userId,
      now,
      idle,
      absolute,
      input.limited ?? false,
      summaryOf(input.userAgent),
      addressPrefixOf(input.address),
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error("a session was inserted and not returned");
  return { id, session: recordOf(row) };
}

/** A new session for an account; the result carries the id the cookie must hold, shown once and never stored. */
export function createSession(
  pool: Pool,
  input: NewSession,
  now: Date = new Date(),
): Promise<{ id: string; session: SessionRecord }> {
  return insertSession(pool, input, now);
}

/** The live session behind an id, or null; a use pushes the idle clock forward and never past the absolute one. */
export async function resolveSession(
  pool: Pool,
  id: string,
  now: Date = new Date(),
): Promise<SessionRecord | null> {
  if (!idShape.test(id)) return null;
  const hash = hashSessionId(id);
  // The account's current status and superuser flag decide the idle length, so a change of rights takes effect at the
  // next use without a second source for the tier rule.
  const found = await pool.query<
    Row & { status: NewSession["status"]; is_superuser: boolean }
  >(
    `select s.id_hash, s.user_id, s.created_at, s.last_seen_at, s.idle_expires_at, s.absolute_expires_at, s.limited,
            s.user_agent_summary, s.address_prefix, u.status, u.is_superuser
       from sessions s join users u on u.id = s.user_id
      where s.id_hash = $1 and s.idle_expires_at > $2 and s.absolute_expires_at > $2`,
    [hash, now],
  );
  const row = found.rows[0];
  if (!row) return null;
  if (now.getTime() - row.last_seen_at.getTime() < touchEveryMs) {
    return recordOf(row);
  }
  const lifetime = lifetimeOf(row.status, row.is_superuser);
  const idle = new Date(
    Math.min(
      now.getTime() + lifetime.idleMs,
      row.absolute_expires_at.getTime(),
    ),
  );
  // The same expiry conditions again: a session that ended between the two statements is not brought back.
  const updated = await pool.query<Row>(
    `update sessions set last_seen_at = $2, idle_expires_at = $3
      where id_hash = $1 and idle_expires_at > $2 and absolute_expires_at > $2
      returning ${columns}`,
    [hash, now, idle],
  );
  const after = updated.rows[0];
  return after ? recordOf(after) : null;
}

/** The rights of the account changed or it signed in again: a new id replaces the old, which stops working. */
export function renewSession(
  pool: Pool,
  id: string,
  input: NewSession,
  now: Date = new Date(),
): Promise<{ id: string; session: SessionRecord }> {
  return withTransaction(pool, async (client) => {
    if (idShape.test(id)) {
      await client.query("delete from sessions where id_hash = $1", [
        hashSessionId(id),
      ]);
    }
    return insertSession(client, input, now);
  });
}

/** Ends one session; false when there was none. */
export async function endSession(pool: Pool, id: string): Promise<boolean> {
  if (!idShape.test(id)) return false;
  const result = await pool.query("delete from sessions where id_hash = $1", [
    hashSessionId(id),
  ]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * The opaque handle the account page shows for a session: the stored hash, URL-safe. It is not the cookie value and
 * cannot be turned into it (SHA-256), so showing it to its own account gives away nothing a browser could send.
 */
export function handleOf(idHash: Buffer): string {
  return idHash.toString("base64url");
}

/** Ends one session of an account by its handle; false when the account has no such session (or another's). */
export async function endSessionByHandle(
  pool: Pool,
  userId: number,
  handle: string,
): Promise<boolean> {
  // A handle is 43 characters of base64url; anything else is simply no session, and never reaches the database.
  if (!/^[A-Za-z0-9_-]{43}$/.test(handle)) return false;
  const result = await pool.query(
    "delete from sessions where user_id = $1 and id_hash = $2",
    [userId, Buffer.from(handle, "base64url")],
  );
  return (result.rowCount ?? 0) > 0;
}

/** Ends every session of an account except the one named (or all, when none is named); returns how many. */
export async function endOtherSessions(
  pool: Pool,
  userId: number,
  keepId?: string,
): Promise<number> {
  const keep = keepId !== undefined && idShape.test(keepId);
  const result = keep
    ? await pool.query(
        "delete from sessions where user_id = $1 and id_hash <> $2",
        [userId, hashSessionId(keepId)],
      )
    : await pool.query("delete from sessions where user_id = $1", [userId]);
  return result.rowCount ?? 0;
}

/** The live sessions of an account, newest first, for the account page. */
export async function listSessions(
  pool: Pool,
  userId: number,
  now: Date = new Date(),
): Promise<SessionRecord[]> {
  const result = await pool.query<Row>(
    `select ${columns} from sessions
      where user_id = $1 and idle_expires_at > $2 and absolute_expires_at > $2
      order by created_at desc, id_hash`,
    [userId, now],
  );
  return result.rows.map(recordOf);
}

/** Deletes the sessions whose clocks have ended; for the periodic job. Returns how many. */
export async function deleteExpiredSessions(
  pool: Pool,
  now: Date = new Date(),
): Promise<number> {
  const result = await pool.query(
    "delete from sessions where idle_expires_at <= $1 or absolute_expires_at <= $1",
    [now],
  );
  return result.rowCount ?? 0;
}
