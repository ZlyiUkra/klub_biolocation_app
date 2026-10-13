// What a change of status does to the person's lecture date (T152 of specs/001-self-hosted-club-site; the owner's rules of
// 2026-10-11, design-member-until.md sections 9 to 11; tests: server/test/lecture-access.test.ts). A plain function with
// no database in it, so the rule is read and tested in one place; users/routes.ts calls it inside the transaction that
// changes the status.
//
// Decisions that would otherwise look like mistakes:
// - Entering a status that opens the lectures from one that does not (guest, blocked) starts the clock: the date becomes
//   today plus the default years, whatever it was. This is "at that moment the account gets the right for 100 years".
// - Moving between the opening statuses keeps the date: a promotion from student to expert must not extend a limit an
//   administrator set on purpose, and must not shorten one either.
// - Moving to blocked sets the date to yesterday (UTC), when there was one; `lecture_view` checks blocked first anyway,
//   so this is for what the panel and the account page say. Lifting the block into an opening status starts the clock
//   again, so a person who was blocked for a year does not come back to a date that ended while they were away, and
//   one who was blocked for a day gets a full term. (Before 2026-10-11 the date was kept on blocking.)
// - Nobody is ever given `guest` (status-rules.ts), so a move to guest does not happen through the routes; the function
//   still answers `null` for it so that no path can leave a guest with a date that lets them in as a "paying guest".

import {
  addYears,
  lectureRules,
  utcDay,
} from "../../../src/lib/lecture-rules.js";
import type { Status } from "./status-rules.js";

const opens = (status: Status): boolean =>
  (lectureRules.openingStatuses as readonly string[]).includes(status);

/** The account's date after its status moved from `from` to `to`; `current` is the date it had (`YYYY-MM-DD` or null). */
export function accessDateAfterStatusChange(
  from: Status,
  to: Status,
  current: string | null,
  now: Date = new Date(),
): string | null {
  if (to === "guest") return null;
  // Changed 2026-10-11 (owner's word, after seeing a blocked account with a date 100 years ahead on the users page):
  // blocking ends the date, which becomes yesterday (UTC), so the date the panel shows says what is true. An account
  // with no date has nothing to end and stays without one; blocking an already blocked account changes nothing.
  if (to === "blocked") {
    if (from === "blocked" || current === null) return current;
    return utcDay(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  }
  if (opens(to) && !opens(from)) {
    return addYears(utcDay(now), lectureRules.defaultYears);
  }
  return current;
}
