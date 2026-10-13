// The ways the superuser role is made or moves, as data (T170 of specs/001-self-hosted-club-site; the consilium of
// 2026-10-11; SUPERUSER.md is the prose of the same table). A test (`superuser-ways.test.ts`) reads this table and
// fails when a name in it is not written anywhere in the server's source, or when SUPERUSER.md does not mention a
// way or an audit action of it: a fifth way, or a renamed audit row, cannot be added to the code and forgotten in the
// document the owner reads.
//
// Nothing in the server imports this file; it is the single list the tests and the document are held against.

export type SuperuserWay = {
  id: "A" | "B" | "C" | "D";
  name: string;
  /** What the person has to hold to use the way. */
  authority: string;
  /** What the way does to the role. */
  effect: string;
  /** What it does to recovery codes. */
  codes: string;
  /** Audit actions it writes; every one is a string in the server's source. */
  audit: string[];
};

export const superuserWays: SuperuserWay[] = [
  {
    id: "A",
    name: "the server command",
    authority: "access to the server (a command line with the settings)",
    effect:
      "create the superuser, set a new password, hand the role over at once to any account",
    codes:
      "create issues ten; set-password keeps them; hand-over issues none and voids the old holder's",
    audit: [
      "superuser_created",
      "superuser_password_set",
      "superuser_handed_over",
    ],
  },
  {
    id: "B",
    name: "the hand-over from the pages",
    authority:
      "the holder's password to start; the target admin's own password to accept",
    effect:
      "the role moves after 24 hours; either side may cancel at any moment before",
    codes: "the new holder has none until it makes a set",
    audit: [
      "handover_started",
      "handover_accepted",
      "handover_cancelled",
      "handover_closed",
      "superuser_handed_over",
    ],
  },
  {
    id: "C",
    name: "a recovery code",
    authority: "one of the holder's ten one-time codes, used without a session",
    effect: "sets a new password only; the role never moves",
    codes: "the used code voids its set and a fresh set of ten is returned",
    audit: ["recovery_code_used", "recovery_codes_regenerated"],
  },
  {
    id: "D",
    name: "the setup door",
    authority:
      "SETUP_CODE from the hosting's settings, or the code the server prints in its log while no superuser exists; the emergency switch also needs SETUP_CODE",
    effect:
      "makes the first superuser; with the switch (30 minutes after a start, one use) the typed account takes the role",
    codes: "ten are returned in the answer",
    audit: [
      "superuser_created",
      "superuser_setup_replaced",
      "superuser_password_set",
      "superuser_setup_used",
    ],
  },
];
