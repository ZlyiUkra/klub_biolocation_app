// Who is looking, for the two blocks under a post or a video: the comments (src/scripts/comments.ts) and the reactions
// (src/scripts/reactions.ts) (T187 of specs/001-self-hosted-club-site; moved here from comments.ts on 2026-10-13).
//
// Decisions that would otherwise look like mistakes:
// - The viewer is asked for once per page: `loadMe()` keeps its promise, so two blocks on one page make one request to
//   `/api/auth/me`, and both read the same answer. Nothing is kept between pages.
// - `canWrite()` is the DISPLAY half of the writer rule the server keeps in `person_lecture_access` (migration 021): not
//   blocked, and either a status the date never limits or a date that has not ended. It decides what the page offers;
//   the server decides what is allowed, and a refusal from it is still shown. Comments and reactions use this one
//   function, as the server uses one rule for both, so a person is never offered one and refused the other.

import { site } from "../config";
import { dateOpens, lectureRules, utcDay } from "../lib/lecture-rules";
import { sendJson, serverNow } from "./auth-forms";

/** The viewer as the page needs them; `null` for a signed-out visitor. */
export type Me = {
  displayName: string;
  status: string;
  accessUntil: string | null;
  mustChange: boolean;
};

let pending: Promise<Me | null> | null = null;

/** The signed-in viewer, or null; asked once and remembered for the life of the page. */
export function loadMe(): Promise<Me | null> {
  pending ??= (async () => {
    const answer = await sendJson("GET", "/api/auth/me");
    const viewer = answer.body["viewer"];
    if (
      answer.status !== 200 ||
      viewer === null ||
      typeof viewer !== "object"
    ) {
      return null;
    }
    const v = viewer as Record<string, unknown>;
    return {
      displayName: String(v["displayName"] ?? ""),
      status: String(v["status"] ?? "guest"),
      accessUntil:
        typeof v["accessUntil"] === "string" ? v["accessUntil"] : null,
      mustChange: v["mustChange"] === true,
    };
  })();
  return pending;
}

/** Whether the page offers this viewer the field and the reactions (see the note at the top). */
export function canWrite(me: Me | null): boolean {
  if (me === null || me.mustChange || me.status === "blocked") return false;
  if (
    (lectureRules.unlimitedStatuses as readonly string[]).includes(me.status)
  ) {
    return true;
  }
  return dateOpens(me.accessUntil, utcDay(new Date(serverNow())));
}

/** The sign-in page's address, bringing the visitor back to this page. */
export function signInHref(): string {
  return `${site.auth.signIn}?next=${encodeURIComponent(location.pathname + location.search)}`;
}
