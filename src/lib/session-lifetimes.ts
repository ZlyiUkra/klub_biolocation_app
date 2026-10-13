// How long a session lives, by the rights of the account behind it (T043 and T048 of
// specs/001-self-hosted-club-site; research.md section 5). A module of its own with no imports, for the reason the
// pagination numbers have one (src/lib/pagination.ts): the backend has to read the numbers and cannot compile
// src/config.ts, which reads `import.meta.env`. src/config.ts takes them from here as `site.auth.sessionLifetimes`, so
// there is one constant for each value and one home for all of them.
//
// Two clocks run on a session. The idle one is pushed forward by every use, so a session that is used stays; the
// absolute one never moves, so no session lives longer than it, however busy. The shorter the lifetime the less time a
// stolen session is worth (OWASP Session Management Cheat Sheet, "Session Expiration"), and the more an account can do
// the shorter its sessions are.
//
// The owner chose these on 2026-10-10 (variant A of the proposal, the plan's own numbers): an account that was blocked
// keeps the short tier of the editors, because its sessions are made by an account that may be reinstated and that has
// no rights worth a long session. Changing one number here changes it everywhere, and the tests read them from here.

const hour = 60 * 60 * 1000;
const day = 24 * hour;

/** The two clocks of a session tier, in milliseconds. */
export type SessionLifetime = { idleMs: number; absoluteMs: number };

export const sessionLifetimes = {
  /** Guest, student, expert and master: members who read and write comments. */
  member: { idleMs: 14 * day, absoluteMs: 60 * day },
  /** Metr, admin and a blocked account. */
  editor: { idleMs: 8 * hour, absoluteMs: 7 * day },
  /** The one superuser. */
  superuser: { idleMs: 1 * hour, absoluteMs: 12 * hour },
} as const satisfies Record<string, SessionLifetime>;

export type SessionTier = keyof typeof sessionLifetimes;

/** The statuses an account can have; the same list as the viewer's (src/lib/viewer.ts). */
type Status =
  "guest" | "student" | "expert" | "master" | "metr" | "admin" | "blocked";

/** The tier of an account: the superuser flag outranks the status. */
export function tierOf(status: Status, superuser: boolean): SessionTier {
  if (superuser) return "superuser";
  if (status === "metr" || status === "admin" || status === "blocked") {
    return "editor";
  }
  return "member";
}

export function lifetimeOf(status: Status, superuser = false): SessionLifetime {
  return sessionLifetimes[tierOf(status, superuser)];
}
