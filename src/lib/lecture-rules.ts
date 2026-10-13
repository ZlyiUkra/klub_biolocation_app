// The numbers and the lists of the paid lectures' access (T152 of specs/001-self-hosted-club-site; the owner's rules of
// 2026-10-11, design-member-until.md sections 9 to 11). A module of its own with no imports, for the reason the
// handover numbers have one (src/lib/handover-rules.ts): the backend reads these values and cannot compile
// src/config.ts, which reads `import.meta.env`; the site's config takes them from here, so each value has one home.
//
// - `defaultYears`: the length of an access that nobody gave an end to. When a status makes an account a user (it
//   leaves guest or blocked for one of `openingStatuses`) the account's date becomes today plus this many years, and a
//   video put on the site is available for the same time unless its front matter says otherwise. The owner's number,
//   changeable here and in nowhere else; the SQL default of migration 014 repeats it as an interval, and a test pins
//   the two together.
// - `openingStatuses`: the statuses that make an account a user, the ones a metr or an admin gives (everything but
//   guest and blocked). Entering one of them from guest or blocked starts the clock above.
// - `unlimitedStatuses`: the editors. They are never limited by a date, theirs or a video's.

export const lectureRules = {
  defaultYears: 100,
  openingStatuses: ["student", "expert", "master", "metr", "admin"],
  unlimitedStatuses: ["metr", "admin"],
} as const;

/** `YYYY-MM-DD`, UTC: the form a date has in the database, the API and the members file. */
export const dayShape = /^\d{4}-\d{2}-\d{2}$/;

/** The UTC day of `now` as `YYYY-MM-DD`. The last day of an access counts in full, so a day is the unit. */
export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** True for a real calendar day written `YYYY-MM-DD` (so `2026-02-30` and `2026-13-01` are not). */
export function isRealDay(text: unknown): text is string {
  if (typeof text !== "string" || !dayShape.test(text)) return false;
  const [y, m, d] = text.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/** `day` plus whole years; 29 February in a year with no 29 February becomes 28 February. */
export function addYears(day: string, years: number): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const target = y + years;
  const last = new Date(Date.UTC(target, m, 0)).getUTCDate();
  const out = new Date(Date.UTC(target, m - 1, Math.min(d, last)));
  return out.toISOString().slice(0, 10);
}

/** The end of an access that starts `now` and was given no end. */
export function defaultAccessEnd(now: Date = new Date()): string {
  return addYears(utcDay(now), lectureRules.defaultYears);
}

/** Whether the account's date lets it in on `today` (the last day included); a missing date lets nobody in. */
export function dateOpens(accessUntil: string | null, today: string): boolean {
  return accessUntil !== null && accessUntil >= today;
}
