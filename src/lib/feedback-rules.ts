// The rules of the feedback form that the page and the server must agree on (T109 of specs/001-self-hosted-club-site;
// FR-033 to FR-036, T104, T144). A module of its own with no imports, for the reason src/lib/reaction-kinds.ts is one:
// the backend (server/src/feedback/routes.ts, which re-exports these and builds its checks on them) cannot compile
// src/config.ts, and the form (src/components/ContactModal.astro, src/pages/auth/signin.astro through
// `site.contact.signInSubject`) takes the same names and lengths from here, so each has one home on the code side.
//
// Decisions that would otherwise look like mistakes:
// - The subject of a message is a CODE of this fixed list, never text. The mail module turns a code into the subject
//   line of the notice from fixed texts (server/src/mail/messages.ts), so nothing a visitor typed, and nothing a page
//   script could be made to send, reaches a mail header. A code is added here, with its line in that module and its
//   label in the panel (src/i18n/admin.ts `feedback_topic_*`), and needs no migration.
// - The three lengths are the form's `maxlength` and the route's limits, which count characters the same way, so the
//   browser stops the typing before the server has to refuse it. Everything else about the form (the fill time, the
//   number an hour) is the server's `feedbackLimits` and is not repeated here because the page never shows it.
// Changed 2026-10-13 (T188): the fill time is src/lib/fill-time.ts now, one module for the feedback route, the sign-up
// route and the sign-up page's wait; `feedbackLimits.minFillMs` and `maxFillAgeMs` read it.

/** The topics a message may name; anything else is a 400 on `subject`. */
export const feedbackSubjects = ["signin_problem"] as const;

export type FeedbackSubject = (typeof feedbackSubjects)[number];

/** The longest each text of the form may be, in characters, after the ends are trimmed. */
export const feedbackTextLimits = {
  maxBodyChars: 5000,
  maxNameChars: 100,
  maxContactChars: 200,
} as const;
