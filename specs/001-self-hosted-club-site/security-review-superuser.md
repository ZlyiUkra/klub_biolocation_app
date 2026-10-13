# Security review: the superuser rule

Written 2026-10-10 as part of the plan. The council's verdict says, of the superuser, "untouchable through any API",
and then, on the owner's instruction of 2026-10-09, loosens it: the role must be recoverable and transferable in two
independent ways beyond the server command. The verdict itself notes that this "loosens the council's 'no API can
touch it', so the spec gives it its own security review". This is that review. The owner, as clarified on 2026-10-10,
is the superuser.

## 1. What is being protected

The superuser can change every other account, read the feedback and the audit log, change the feedback recipient
address and the members-only block switch, and move the role. Whoever holds it can lock out the club, read member
data and redirect the club's mail. It is the single most valuable account on the site.

## 2. The rule as loosened

1. There is exactly one superuser, enforced by a partial unique index, and it is an admin otherwise.
2. No API changes it, blocks it, demotes it or deletes it (accounts are never deleted at all). _Corrected
   2026-10-11:_ no API of the signed-in site does; the one public route that can make or move the role is the setup
   door of way D below, and it works on the authority of way A (the server's settings or log), not on any account's.
3. The role can change only in these ways (_four since 2026-10-11, the setup door being added by T169 and limited by
   T170; `SUPERUSER.md` is the working document and `server/src/users/superuser-ways.ts` the table the tests hold
   against the code_):
   - A. the server command (create, set a new password, hand over): authority is access to the server;
   - B. a handover started by the superuser from the settings page and accepted on the target's own account;
   - C. a one-time recovery code, used by the superuser without a session, to set a new password;
   - D. the setup door `/auth/setup/` for a hosting with no command line: open while no account holds the role, or, with
     the emergency switch, for 30 minutes after a start and for one use, and then only with `SETUP_CODE`.
4. _Added 2026-10-11 (T170, finding F1 of the consilium):_ whichever way is taken, a changed password closes an open
   handover request on both sides and the role moving closes every open request, each with an audit row. Before this
   the request lived on, after a recovery or a new password, with credentials nobody held any more.

A is unchanged from the council. B and C are the loosening; D is the owner's addition for the hosting question.

## 3. Threats and findings

| #   | Threat                                                                         | Where          | Finding                                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Stolen superuser session starts a handover to an account the attacker controls | B              | The password is re-entered to start it, so a stolen cookie alone is not enough. But a leaked or phished password plus a stolen session is. The attacker can also create a guest account freely (sign-up is open) and accept as it. Mitigated only if the target must already be trusted. |
| T2  | Handover target accepted by a person the owner did not intend                  | B              | The target accepts with its own password, so the owner cannot hand the role to an account whose holder never agreed. Does not stop an attacker-controlled target (T1).                                                                                                                   |
| T3  | A leaked or guessed recovery code takes the account over                       | C              | A used code sets a new password and ends every other session, which is a complete takeover with no second factor. Codes of at least 80 random bits make guessing infeasible; leakage (a photographed printout, a pasted chat) is the realistic path.                                     |
| T4  | Brute force against the recovery route                                         | C              | Rate limits per address and a global ceiling bound it; the 80-bit space makes it moot, but the route is unauthenticated and so is a denial-of-service lever against the owner (see T5).                                                                                                  |
| T5  | Denial of service against the owner through lockout                            | B, C           | Per-account lockout on sign-in uses short back-offs and never locks the recovery route out for good; the recovery route is limited per address and globally, not per account, so the owner can always use a code.                                                                        |
| T6  | Handover or recovery performed while the owner is unaware                      | B, C           | Without outgoing mail to members (phase 9), nothing tells the owner. The audit log records it, but only someone looking sees it.                                                                                                                                                         |
| T7  | The role is lost: owner loses the password, the codes and server access        | all            | The design's reason for being. The server command (A) is the last resort, and it needs the server; the owner holds that.                                                                                                                                                                 |
| T8  | A second superuser appears through a race or a bug                             | all            | The unique index makes it impossible; a handover completes in one transaction that clears the old flag and sets the new.                                                                                                                                                                 |
| T9  | Recovery codes stored in a reversible form, or visible in logs                 | C              | Stored as SHA-256 of a random code (a high-entropy secret needs no slow hash); never logged; shown once; regenerated only after the password is re-entered.                                                                                                                              |
| T10 | A forced-change temporary password issued to the superuser by an admin         | temp passwords | The matrix refuses it: nobody issues a temporary password for the superuser's account.                                                                                                                                                                                                   |
| T11 | Session fixation or reuse at the moment the role moves                         | B, C           | Every session of the old superuser and of the target ends, a new id is issued on the next sign-in, and the cookie is `__Host-` and `HttpOnly`.                                                                                                                                           |

## 4. Required mitigations (these become tasks)

1. **The handover target must already be an admin.** Tightens "an existing account" in the verdict. It closes the
   self-created-guest path of T1/T2 at no cost to the owner's use: the person who is to hold the role is made an admin
   first by the ordinary rules. _This changes the wording of the council's text; it is flagged to the owner._
2. **A cooling period of 24 hours between acceptance and the role moving, with cancel by the superuser or the target.**
   It turns a silent takeover (T1, T6) into one the owner has a day to notice, as the settings page and the account
   page show a pending handover prominently. Recommended; the owner may set it to zero. _Flagged to the owner._
3. **Recovery codes: ten, at least 80 random bits each, shown once, stored as a hash, each usable once.** Using one
   voids the rest and shows a fresh set (_corrected 2026-10-11: in the answer of the request that used the code, not
   at the next sign-in, which would need the plaintext kept_) of the superuser; a regenerated set voids the old; both
   events are in the audit log and shown on the superuser's pages until acknowledged.
4. **Using a code is limited per address and globally, and never reveals whether a code exists** (the same answer for
   a wrong code, a spent code, a voided one and an unknown identifier).
5. **Re-authentication for every sensitive step.** Starting a handover, regenerating codes and changing a setting
   re-enter the password in the same request; accepting a handover re-enters the target's own password.
6. **One session per sign-in with a short lifetime for the superuser** (idle 1 hour, absolute 12 hours, research
   section 5), so a stolen session is short-lived.
7. **Audit and visibility.** Every step above writes an audit row (actor, action, address prefix, from and to). The
   superuser's pages show the last events at the top.
8. **Nothing about the rule lives in two places.** The status module has the only decision; the handover and recovery
   code call it; a test enumerates every route that can change `is_superuser` and fails if a new one appears.
   _Corrected 2026-10-11:_ what exists is a source scan (`superuser-writes.test.ts`): no statement outside
   `superuser.ts` writes the flag, in `server/src`, `src` and `scripts`. The scan finds a new writer, not a new route,
   and that is what the rule needs; the password hash has the same guard (`credentials-writes.test.ts`).
9. **When phase 9 brings mail**, both events are also announced by mail to the account's address (the verdict already
   plans this); until then the only channel is the pages and the audit log.

## 5. Residual risk after the mitigations

- A recovery code that leaks and is used before the owner notices still takes the account. The owner's discipline in
  keeping the codes offline is the control; the cooling period does not apply to C because recovery must work without
  the server and without a channel to wait on. The audit trail and the voided remaining codes limit the damage and make
  it visible at the owner's next sign-in. Accepted; to be recorded in `RISKS.md` with a review date when phase 3 ends.
- With no mail until phase 9, T6 depends on the owner looking. Accepted until phase 9.
- A compromised server defeats all of this. Out of scope: it is the server's own security (phase 8).

## 6. Checks (phase 3)

- Tests, each expecting a refusal: handover to a non-admin; accept with the wrong password; accept after expiry or
  cancel; start a second handover while one is open; use a spent, voided or invented code; use a code while rate
  limited; any API call that tries to change, block or delete the superuser; a status change of one's own account.
- Tests, each expecting success: command create, set-password and hand-over; handover with cooling; recovery with a
  code and a following full sign-in; regeneration voiding the old set.
- A source check that no statement outside the status module writes `is_superuser`.
- A rehearsal on a copy of the data of all three paths, ending with a sign-in as the new holder (SC-010).

### Rehearsal of 2026-10-11 (T072)

`npm run rehearse:superuser` (`scripts/rehearse-superuser.mjs`): a throwaway database with the site's content
imported and members of every status, the real backend on a spare port, 26 checks, 26 passed. Each path ends in a
sign-in as the new holder over HTTP and is then used a second time.

- **A, the server command.** `create` made the superuser and ten codes; sign-in as the superuser worked; a second
  `create` was refused (`exists`). `status` named the holder and printed no code and no hash. `set-password` ended
  the old session, the old password stopped working, the new one signed in, and the ten codes stayed. `hand-over`
  moved the role at once to another account; sign-in as the new holder showed a superuser, the former holder an
  admin with no session left. A second `hand-over` to the holder (`same`) and to an unknown address (`missing`) was
  refused.
- **B, the hand-over from the pages.** Started with the holder's own password; accepted with the asked admin's own
  password: waiting period 24 hours, role not moved; the timer's function did nothing at 23 hours and moved the role
  at 25; sign-in as the new holder showed a superuser; both sides' sessions were ended; the former holder signed in
  as an admin only. Second use: accept and cancel answered 404 (nothing open), and the former holder's attempt to
  start another answered 404.
- **C, a recovery code.** The new holder made a set of ten with the password; one code set a new password and
  returned a fresh set of ten, none of them from the old set; the old session was gone and the new password signed
  in as the superuser. The spent code, a voided code of the old set and an invented code got the same 400 answer
  byte for byte. A code of the fresh set worked once and failed the second time; the earlier password stopped
  working.
- **End state.** Exactly one superuser; the audit log held `superuser_created`, `superuser_password_set`,
  `superuser_handed_over` twice (command and page), `handover_started`, `handover_accepted`,
  `recovery_codes_regenerated` and `recovery_code_used` twice.

Extended on 2026-10-11 with **path D, the setup door** (T169): 43 checks, 43 passed. The rehearsal makes a second
throwaway database and two more real backends on it.

- **D1, the code from the log.** On the first server (a superuser exists) the state says closed and the route is a
  plain 404. On an empty database with no `SETUP_CODE` the door is open, the server printed a code in its log at start,
  a wrong code got a 400 that did not carry the right one, the code from the log made the superuser with ten recovery
  codes, sign-in as that account showed a superuser and an admin, the same code a second time got a 404 and the state
  said closed, and one of the ten codes worked on path C (new password, fresh set of ten).
- **D2, the emergency switch.** A hand-over from the page was left open; then, with `ALLOW_SUPERUSER_SETUP=1` and a
  `SETUP_CODE`, the door was open although a superuser existed, a wrong code got 400, the right one made a new holder
  with ten codes; the old holder stayed an admin and lost its session, the open hand-over was closed, the old
  holder's codes got the same refusal as an invented one, a code of the new set worked once and failed the second
  time, and the database held exactly one superuser with the audit rows `superuser_created`,
  `superuser_setup_replaced` and `superuser_setup_used`.

Extended again on 2026-10-11 (T170): 46 checks, 46 passed. The switch is one use (a second use got a 404); the switch
with no `SETUP_CODE` is ignored (the door stayed shut, the log said so); a recovery code used while a hand-over was
open closed it.

What this rehearsal did not cover, and what covers it: (1) the password prompt of `npm run superuser` at a real
terminal with the echo off - the owner tries it once by hand (`npm run superuser -- create <address>`); (2) the real
clock for the waiting period - the timer's function was called with a moment 25 hours ahead, which is what
`main.ts` calls with the real clock; (3) the club's real accounts - the members file of T055 does not exist yet, so
the rehearsal on production data is part of the switch-day rehearsal (T135).

### The setup door (T169, 2026-10-11)

A fourth way to the role, added for a hosting with no command line: the page `/auth/setup/`, open while no account
holds the role (or with `ALLOW_SUPERUSER_SETUP=1`), taking a code that is `SETUP_CODE` from the hosting's settings or
a code the server prints in its log. Its authority is the same as the server command's: access to the server's
settings or log. The only code that writes the flag is still `superuser.ts` (`setupSuperuser`), the code is kept in
memory and compared by its SHA-256 in constant time, failures are counted (5 an address in 15 minutes, 30 an hour in
all), and a shut door is a plain 404. The residual risk is in `RISKS.md` section 4.

## 7. Decisions for the owner

- Mitigation 1 (target must be an admin): accepted by the owner on 2026-10-10.
- Mitigation 2 (24 hour cooling): accepted on 2026-10-10 as a constant, with instant cancel at any moment before the
  role moves (owner, later the same day). Zero hours means instant; the server command is always instant.
- Session lifetimes of research section 5, the superuser's idle hour included: accepted on 2026-10-10.
