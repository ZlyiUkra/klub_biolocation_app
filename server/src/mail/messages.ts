// The texts of the mail the site writes (T107 of specs/001-self-hosted-club-site; research.md section 11, FR-034; tests:
// server/test/feedback.test.ts). This module builds the SUBJECT and the BODY of a queue row from fixed texts and the
// values a request validated; the worker that sends the rows is T108 (queue.ts, mailer.ts).
//
// Decisions that would otherwise look like mistakes:
// - A subject line is built from a fixed text and, at most, a code of a fixed list. Nothing a visitor typed is in it:
//   a name or an address in a subject is where header injection and mail filtering tricks live, and the club's
//   mailbox does not need it there. The visitor's text is in the BODY only, which is plain text.
// - The body is a plain-text template: labelled lines for what the visitor gave, a blank line, then the message
//   exactly as stored. The labels are English and fixed; the message keeps its own language.
// - The recipient is not here: it is the setting `feedback_recipient`, read by the route when the row is written.
// - A topic code with no entry in `subjectLines` falls back to the general line. The route has already refused a code
//   outside `feedbackSubjects`, so the fallback is for a code added to that list before its line is written here.

/** The subject line of each topic code the form may send (`feedbackSubjects` in server/src/feedback/routes.ts). */
const subjectLines: Record<string, string> = {
  signin_problem: "Club site: a visitor cannot sign in",
};

const generalLine = "Club site: a message from the feedback form";

/** The subject line for a topic code, or the general line; never visitor text. */
export function feedbackSubjectLine(code: string | null): string {
  return (code !== null ? subjectLines[code] : undefined) ?? generalLine;
}

/** What a stored message gives the notice: only values the route validated. */
export type FeedbackNoticeInput = {
  body: string;
  name: string | null;
  contact: string | null;
  subject: string | null;
  receivedAt: Date;
  addressPrefix: string;
};

/** The plain-text body of a `feedback_notice` mail. */
export function feedbackNoticeBody(input: FeedbackNoticeInput): string {
  const lines = [
    "A message was sent from the feedback form of the club's site.",
    "",
    `Name: ${input.name ?? "(not given)"}`,
    `Contact: ${input.contact ?? "(not given)"}`,
    `Topic: ${input.subject ?? "(none)"}`,
    `Received: ${input.receivedAt.toISOString()}`,
    `Network: ${input.addressPrefix === "" ? "(unknown)" : input.addressPrefix}`,
    "",
    "Message:",
    "",
    input.body,
    "",
  ];
  return lines.join("\n");
}

/** The subject and the body of the notice for a stored message. */
export function feedbackNotice(input: FeedbackNoticeInput): {
  subject: string;
  body: string;
} {
  return {
    subject: feedbackSubjectLine(input.subject),
    body: feedbackNoticeBody(input),
  };
}

// Added 2026-10-13 (T110 of specs/001-self-hosted-club-site; FR-035, tests: server/test/settings.test.ts): the three
// mails of a change of the feedback recipient. The same rules as the notice above: the subject is a fixed text and
// nothing else (never the code, never an address), and the code and the addresses are in the BODY of a plain-text mail.
// - `recipient_code` goes to the NEW address only and carries the code; it is the proof that the address is read by the
//   person who asked.
// - `recipient_change_requested` goes to the OLD address as soon as the change is asked for, and never carries the code:
//   its owner can act before the code is entered (the Authentication Cheat Sheet's "Changing A User's Registered Email
//   Address": a notification to the current address, a confirmation to the new one).
// - `recipient_changed` goes to the OLD address when the change has happened, and says where the messages go now.

/** What the code mail needs: the code and how long it is good for, in minutes. */
export function recipientCodeNotice(input: {
  code: string;
  lifetimeMinutes: number;
}): { subject: string; body: string } {
  return {
    subject: "Club site: confirm the new address for feedback messages",
    body: [
      "The superuser of the club's site asked to send the messages of its feedback form to this address.",
      "",
      "To confirm it, enter this code on the settings page of the site:",
      "",
      input.code,
      "",
      `The code is valid for ${input.lifetimeMinutes} minutes and works once.`,
      "If nobody here asked for this, ignore this mail: nothing changes without the code.",
      "",
    ].join("\n"),
  };
}

/** The warning to the address that is still the recipient: what was asked, and that nothing has changed yet. */
export function recipientChangeRequestedNotice(input: {
  newAddress: string;
  requestedAt: Date;
  lifetimeMinutes: number;
}): { subject: string; body: string } {
  return {
    subject: "Club site: a new address for feedback messages was asked for",
    body: [
      "The superuser of the club's site asked to send the messages of its feedback form to another address.",
      "",
      `New address: ${input.newAddress}`,
      `Asked at: ${input.requestedAt.toISOString()}`,
      "",
      `Nothing has changed yet: the messages keep coming to this address until the new one is confirmed with a code, which is valid for ${input.lifetimeMinutes} minutes.`,
      "If this was not the superuser, change the superuser's password and look at the account's devices.",
      "",
    ].join("\n"),
  };
}

/** The notice to the address that is no longer the recipient. */
export function recipientChangedNotice(input: {
  newAddress: string;
  changedAt: Date;
}): { subject: string; body: string } {
  return {
    subject: "Club site: the address for feedback messages was changed",
    body: [
      "The messages of the club site's feedback form are no longer sent to this address.",
      "",
      `They go to: ${input.newAddress}`,
      `Changed at: ${input.changedAt.toISOString()}`,
      "",
    ].join("\n"),
  };
}
