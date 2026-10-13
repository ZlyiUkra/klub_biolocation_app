// The fill-time rule of the club's forms (T188 of specs/001-self-hosted-club-site; T104 wrote it for the feedback form,
// T159 and T050 left it for sign-up; FR-034). A plain module with no imports, for the reason src/lib/feedback-rules.ts
// is one: the backend routes (server/src/feedback/routes.ts, server/src/auth/routes.ts) cannot compile src/config.ts, and
// the sign-up page's script takes the same number, so the rule has one home on the code side.
//
// Decisions that would otherwise look like mistakes:
// - A form carries the moment it was opened, `startedAt`, in milliseconds on the SERVER's clock (the page learns the
//   offset from the Date header of an answer, src/scripts/auth-forms.ts `serverNow`), so a device whose clock is
//   minutes off still passes. The server compares it with its own clock when the form arrives.
// - Refused: sent in under `minMs` (a script posts at once), missing or not a number, from the future, and older than
//   `maxAgeMs` (a made-up old opening time does not pass for a long fill). Both boundaries count as accepted.
// - The refusal is the same plain 400 as a filled honeypot's, so the answer names no check (the routes' business).
// - The page uses `minMs` to WAIT, not to refuse: a person whose password manager fills every field at once presses
//   the button within three seconds of the page, and the page holds the send back for the rest of them instead of
//   letting the server turn a person away.

/** The rule's two numbers, in milliseconds. */
export const fillTime = {
  /** The form must have been open this long before it is sent; a bot posts at once. */
  minMs: 3_000,
  /** ... and no longer than this. */
  maxAgeMs: 24 * 60 * 60_000,
} as const;

/** Whether a form opened at `startedAt` (server clock, milliseconds) may be sent at `nowMs`. */
export function fillTimeAccepted(startedAt: unknown, nowMs: number): boolean {
  if (typeof startedAt !== "number" || !Number.isFinite(startedAt)) {
    return false;
  }
  const age = nowMs - startedAt;
  return age >= fillTime.minMs && age <= fillTime.maxAgeMs;
}
