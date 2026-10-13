// The numbers of the superuser's handover and recovery (T067 of specs/001-self-hosted-club-site;
// security-review-superuser.md sections 4 and 7). A module of its own with no imports, for the reason the pagination
// numbers and the session lifetimes have one: the backend reads these numbers and cannot compile src/config.ts, which
// reads `import.meta.env`. src/config.ts takes them from here as `site.admin.handoverCoolingHours`, so there is one
// constant for each value and one home for all of them.
//
// - `coolingHours`: how long a handover waits between the target accepting it and the role moving, with cancel by the
//   superuser or the target at any moment before. The owner accepted 24 on 2026-10-10 and added the instant cancel.
//   Zero means the role moves at once on acceptance (the owner may choose it); the server command is always instant.
// - `requestLifetimeDays`: a handover nobody accepts lapses after this many days (data-model.md, handover_requests).
// - `recoveryCodeCount`: the size of one set of one-time recovery codes.

export const handoverRules = {
  coolingHours: 24,
  requestLifetimeDays: 7,
  recoveryCodeCount: 10,
} as const;
