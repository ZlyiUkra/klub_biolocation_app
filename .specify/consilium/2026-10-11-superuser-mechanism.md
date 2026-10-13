---
consilium: 2026-10-11
topic: one mechanism for the superuser, four ways (server command, hand-over from the pages, recovery code, setup door)
slug: superuser-mechanism
verdict: approved-with-conditions
route: direct-verified
archetypes:
  nitpicker: ok
  security: blocks
  performance: ok
  best-practices: ok
  pragmatist: ok
---

# One mechanism for the superuser

## Agreed proposal

The club site's superuser is its most valuable account. It can be made or moved in four ways: a server command (A), a
hand-over started from the pages and accepted by an admin after 24 hours (B), a one-time recovery code (C), and a setup
page for a hosting with no command line (D), which has an emergency switch for the case where a superuser exists and
every other way is lost. The owner asked that the four not contradict one another and that there always be a way back.
The council agreed on a small set of rules that make the four one mechanism: a changed password, by any way, closes an
open hand-over on both sides; the emergency switch works only together with a code from the hosting's settings, for 30
minutes after a start and for one use; accounts are locked in one order; the server says at start what the switch and
a leftover code mean; and one document, with its table of ways held against the code by tests, says which way to take
in which situation.

## Limits

- In scope: the rules above, the tests, the rehearsal, the document `SUPERUSER.md`, the stale statements in the review
  and the risk register.
- Out of scope, recorded as tasks: a correct code passing the global ceiling (T171), reserving the attempt before the
  lookup in the recovery route (T172), the account page's block for a holder with no codes (T173), the shared constants
  of the limits (T174).

## Remarks that survived

- [confirmed] The emergency switch with no `SETUP_CODE` made a code that anyone who can read the log could use to
  replace the holder (security, blocks; fixed: the switch is ignored without `SETUP_CODE`).
- [confirmed] A changed password, by recovery code, command, door or account page, left an open hand-over alive on
  credentials nobody held any more (security, nitpicker, architect, pragmatist; fixed in `credentials.ts`).
- [confirmed] `spend()` in generated mode cannot make the switch one use by itself, because the tick prints a new
  code within a minute (nitpicker; fixed with a `used` flag in the gate).
- [confirmed] The role moving closed an open request without an audit row; the door recorded a replacement when
  nothing moved; the use row could turn a success into a 500 with the codes made and not shown (nitpicker; fixed).
- [confirmed] Lock order differed between the paths and one statement had no ORDER BY (nitpicker, architect, security
  as optional; fixed with `lockAccounts` and the request row taken after the accounts).
- [confirmed] The password write was copied in five places (architect; fixed with one function and a source test).
- [confirmed] Stale statements: "exactly three ways", "no API changes the role", "shut for good", "26 checks" (nitpicker;
  corrected, see the review and the risks).

## Marked by the interrogator

- [weak] A correct code passes the global ceiling (security, N3): needs an attacker who keeps the ceiling exhausted;
  recorded as T171, not done now.
- [weak] The recovery route's burst overshoot (performance): real, low; recorded as T172.
- [closed] Does anything delete the holder's account (security, N4)? No statement in `server/src` deletes a user;
  checked by search.

## Consciously not doing

- Shared counters for C and D: separate counters are better (an attacker must exhaust both); recorded as accepted.
- Caching the door's open/shut state: the "shut the moment a superuser exists" property is worth more than 0.3 ms.
- Returning codes from way A's hand-over: the person at the console is the old holder's, not the new one's; the new
  holder makes its own set (T173 adds the prompt).

## Route

- Council's recommendation: direct-verified (small code changes with tests and the rehearsal re-run; documents).
- Owner's decision (2026-10-11): the full variant, 30 minutes kept for the switch, the deferred items as numbered
  tasks of plan phase 3, to be done until the phase is closed.
- Verification: 267 server tests; rehearsal 46 checks; the source tests for the flag and the hash; the table of ways
  against the code and `SUPERUSER.md`.
