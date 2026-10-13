// The status rules: who may give which status to whom, and who may issue a temporary password (T063 of
// specs/001-self-hosted-club-site; ADMIN.md sections 1 and 2; tests: server/test/status-rules.test.ts).
//
// A plain module with no imports, the same shape as src/lib/pagination.ts and src/lib/session-lifetimes.ts: it is the
// ONE place that decides, so the users routes, the superuser command (T066) and the tests all ask the same function and
// cannot disagree. A test also checks that the list below equals the check constraint of migration 012.
//
// Ported from the rules of the statuses Worker (workers/statuses/worker.mjs, `refusal()` and `assignable()`), which this
// module replaces in T071; the order of the checks is the Worker's, so the same request gets the same reason.
//
// Decisions that would otherwise look like mistakes:
// - Nobody is ever given `guest`: it is only what an account starts as. To take access away, block the member (owner,
//   2026-10-02). `guest` is therefore in neither list of what may be given.
// - The superuser is `protected`: no change of status, no block, no temporary password through this module, whoever
//   asks. Its status stays `admin` and moves only by the three ways of the security review (the server command, an
//   accepted handover, a recovery code), none of which goes through here.
// - A metr never makes a metr or an admin, never touches a metr or an admin, and cannot lift a block an admin set (the
//   owner's rule of 2026-10-02). A block set by nobody's hand (the members import, a restored row) may be lifted by a
//   metr: there is no rank to protect.
// - A refusal is a code and not a sentence, so the page writes the words and a test can name the case.

export const statuses = [
  "guest",
  "student",
  "expert",
  "master",
  "metr",
  "admin",
  "blocked",
] as const;

export type Status = (typeof statuses)[number];

/** Every status except `guest`: what an administrator may give. */
export const givenByAdmin: readonly Status[] = statuses.filter(
  (status) => status !== "guest",
);

/** What a metr may give: the three member statuses and `blocked`. */
export const givenByMetr: readonly Status[] = [
  "student",
  "expert",
  "master",
  "blocked",
];

/** The accounts a metr may change at all: the ones below the editors. */
const metrScope: readonly Status[] = [
  "guest",
  "student",
  "expert",
  "master",
  "blocked",
];

export type Actor = { id: number; status: Status; superuser: boolean };

export type Target = {
  id: number;
  status: Status;
  superuser: boolean;
  /** The status of the account that set the block, when the target is blocked and a blocker is recorded. */
  blockedBy: "admin" | "metr" | null;
};

export type Refusal =
  | "forbidden" // the actor is not a metr or an admin
  | "self" // nobody changes their own account here
  | "protected" // the superuser
  | "guest" // guest is never given
  | "rank"; // above the actor's reach, or a block an admin set

export function isStatus(value: unknown): value is Status {
  return statuses.includes(value as Status);
}

/** True for the two statuses that may use the users page. The superuser is an admin by status. */
export function mayAdminister(actor: Pick<Actor, "status">): boolean {
  return actor.status === "metr" || actor.status === "admin";
}

/** What `actor` may give, for the page's list of choices. The server decides again on every change. */
export function assignable(actor: Pick<Actor, "status">): readonly Status[] {
  if (actor.status === "admin") return givenByAdmin;
  if (actor.status === "metr") return givenByMetr;
  return [];
}

/** null when `actor` may give `wanted` to `target`; otherwise why not. */
export function refusalOfChange(
  actor: Actor,
  target: Target,
  wanted: Status,
): Refusal | null {
  if (!mayAdminister(actor)) return "forbidden";
  if (target.id === actor.id) return "self";
  if (target.superuser) return "protected";
  if (wanted === "guest") return "guest";
  if (actor.status === "admin") return null;
  if (!metrScope.includes(target.status) || !givenByMetr.includes(wanted)) {
    return "rank";
  }
  if (target.status === "blocked" && target.blockedBy === "admin")
    return "rank";
  return null;
}

/**
 * null when `actor` may set the lecture date of `target` (T152, the owner's choice 2-A of 2026-10-11: the same people
 * who may change the status). The reach is that of a temporary password and of a status change, so it is the same
 * function underneath and a change of that rule moves all three together.
 */
export function refusalOfAccessDate(
  actor: Actor,
  target: Target,
): Refusal | null {
  return refusalOfTemporaryPassword(actor, target);
}

/**
 * null when `actor` may issue a temporary password for `target` (research.md section 6): the same reach as a status
 * change. A metr may issue one for a guest, a student, an expert, a master or a blocked account and never for a metr or
 * an admin; an admin may issue one for anyone but the superuser, and nobody for their own account (the change form is
 * for that).
 */
export function refusalOfTemporaryPassword(
  actor: Actor,
  target: Target,
): Refusal | null {
  if (!mayAdminister(actor)) return "forbidden";
  if (target.id === actor.id) return "self";
  if (target.superuser) return "protected";
  if (actor.status === "admin") return null;
  return metrScope.includes(target.status) ? null : "rank";
}
