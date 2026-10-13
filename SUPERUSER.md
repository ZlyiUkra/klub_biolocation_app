# The superuser: how we work with it

Written 2026-10-11 (T170), after the consilium of that day (`.specify/consilium/2026-10-11-superuser-mechanism.md`). It is
the one document that says who may do what with the club site's most valuable account and which way to take in which
situation. The reasoning and the threats are in `specs/001-self-hosted-club-site/security-review-superuser.md`; the
residual risks are in `RISKS.md` sections 3 and 4. The table of ways below is also data
(`server/src/users/superuser-ways.ts`), and a test fails if this document and the code stop agreeing.

## 1. What the account is

There is exactly one superuser at any moment (a partial unique index of the database enforces it). It is an admin
besides, so everything an admin can do it can do, and it alone can: change the feedback recipient and the members-only
switch, read the audit log and the feedback, start a hand-over of the role, make recovery codes. No API changes,
blocks, demotes or deletes it, and no code deletes any account at all.

The superuser's sessions are short (one hour idle, twelve hours in all), and every sensitive step asks for the
password again in the same request.

## 2. The four ways the role is made or moves

All four end in the same function (`server/src/users/superuser.ts`), which is the only code that writes the flag, and
the passwords go through `server/src/users/credentials.ts`, the only code that sets a hash on an existing account. Two
source tests fail the day another file does it.

### Way A: the server command

`npm run superuser -- create <address>` (a hidden password prompt), `set-password`, `hand-over <address>`, `status`.
Authority: access to the server. It acts at once: `create` makes the account or promotes the one that exists (it
becomes an admin, a blocked one is lifted) and issues ten recovery codes; `set-password` ends the superuser's sessions
and keeps the codes; `hand-over` moves the role to any existing account, which becomes an admin as part of the move.
The new holder gets no codes and makes its own. Audit actions: `superuser_created`, `superuser_password_set`,
`superuser_handed_over` (no actor: the command acts as nobody signed in).

### Way B: the hand-over from the pages

The holder starts it with its password and names an account that is already an admin; that admin accepts with its own
password; the role waits 24 hours and moves; either side may cancel at any moment before; a request nobody accepts
lapses after seven days. A server timer completes it once a minute, and a server that was down completes it at its
next start. The new holder has no codes until it makes a set on its account page. Audit actions: `handover_started`,
`handover_accepted`, `handover_cancelled`, `handover_closed` (with a reason, see section 3), `superuser_handed_over`.

### Way C: a recovery code

Ten codes of 80 random bits, shown once, stored as SHA-256. A code is used without a session, with the holder's address,
and sets a new password only; it never moves the role. Using one voids the rest of its set and returns a fresh set of
ten in the same answer. The route is limited (five failures an address in fifteen minutes, thirty an hour in all; a
right code is not stopped by the hourly ceiling, section 8) and every failure gets one and the same answer. Audit actions: `recovery_code_used`, `recovery_codes_regenerated` (when the
holder makes a new set from the page, with the password typed again).

### Way D: the setup door

The page `/auth/setup/`, for a hosting with no command line. It is open only while no account holds the role, and it
makes the first superuser from a code, an address and a password, and returns ten recovery codes once. Then it is shut
for good (a plain 404). The code is `SETUP_CODE` from the hosting's settings (24 characters or more; the server will
not start with a shorter one); when it is not set, the server prints a code of 128 bits in its log at start and every
hour while no superuser exists. Audit actions: `superuser_created`, `superuser_setup_used` (with the network prefix).

**The emergency switch** is the same page for the case where a superuser exists and the owner has lost every other
way. It has three limits, set on 2026-10-11:

- it needs `SETUP_CODE`: with `ALLOW_SUPERUSER_SETUP=1` alone it is ignored, with a line in the log that says so,
  because a code printed in a log must never replace a holder;
- it works for **30 minutes after the server starts**, so a switch that is forgotten cannot stay open (another
  restart opens a new window);
- it is **one use**: after it the page is shut again until the next start.

A use makes the typed account the superuser (made if it did not exist), the old holder stays an admin, every session
of both ends, the old holder's codes are void, an open hand-over is closed, and ten fresh codes are returned. Typing
the holder's own address only sets a new password and moves nothing. Audit actions: `superuser_setup_replaced` for a
replacement and `superuser_password_set` (detail `via: setup_door`) for the holder's own address.

## 3. What is true whichever way was taken

1. **One holder.** A change of the role is one transaction that clears the old flag and sets the new one.
2. **A changed password closes an open hand-over, on both sides.** A request was started with the holder's password
   and accepted with the target's; if either password changes (by a recovery code, the command, the door, the account
   page or a temporary password from an admin), the request is closed with the audit row `handover_closed` and the
   reason `credentials_changed`. When the role moves, any open request is closed with the reason `role_moved`.
3. **Sessions end.** A changed password ends the account's sessions (the account page keeps the one that changed it);
   a moved role ends the sessions of both accounts.
4. **The old holder's unspent codes are void** when the role moves. A used code voids its set.
5. **Nothing is lost silently.** Every step writes an audit row in the same transaction as the change.
6. **The switch and the code never reach the database, an answer or an audit row.** A code is compared by its hash in
   constant time.

## 4. Which way, in which situation

| Situation                                                       | Take            | Notes                                                                              |
| --------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------- |
| First start of an empty site, a hosting with no command line    | Way D           | Set `SETUP_CODE`, open `/auth/setup/`, then remove `SETUP_CODE`.                   |
| First start, with a command line                                | Way A `create`  | Hidden password prompt; keep the ten codes offline.                                |
| The owner forgot the password, still holds a code               | Way C           | The code sets a new password; save the fresh set.                                  |
| The owner forgot the password and has no code, server reachable | Way A           | `set-password` (keeps the codes).                                                  |
| Everything lost, no command line                                | Way D, switch   | Set `SETUP_CODE` and `ALLOW_SUPERUSER_SETUP=1`, restart, use it within 30 minutes. |
| Giving the role to a trusted admin, no hurry                    | Way B           | 24 hours, either side can cancel; both sides' passwords.                           |
| Giving the role to somebody at once                             | Way A hand-over | Any existing account; it becomes an admin.                                         |
| A stolen session or password is suspected                       | Way C or A      | A new password also closes any hand-over the thief started.                        |
| A hand-over appeared that the owner did not start               | cancel; Way C   | Cancel on the account page, then change the password so it cannot be restarted.    |

## 5. The order of the switch day

The door is open on any database that has no superuser, and the public site is on that database. So, in this order:

1. Make the superuser **before** the site answers on its public address (way A, or way D on a private address).
2. Save the ten codes offline, on paper or in a place that is not the computer used for the site.
3. Remove `SETUP_CODE` (and `ALLOW_SUPERUSER_SETUP`) from the settings and restart. The server logs a note if
   `SETUP_CODE` is still there while a superuser exists; the door is shut either way.
4. Sign in as the superuser once and open the account page: it shows how many recovery codes are unspent. A holder
   that took the role by hand-over (way A or B) has none until it makes a set there, with the password typed again.

## 6. What the server logs

At start, one of: nothing (a superuser exists and nothing is set); a note that `SETUP_CODE` is still set; a warning that
the emergency switch is on and its 30 minutes; a warning that `ALLOW_SUPERUSER_SETUP=1` is ignored for the lack of
`SETUP_CODE`. While no superuser exists, and `SETUP_CODE` is not set, the generated code and the hour it is valid.

## 7. Checks

- `npm run test:server`: the rules above, including that nothing but `superuser.ts` writes the flag and nothing but
  `credentials.ts` sets a hash, and that this document names every way and audit action of the table.
- `npm run rehearse:superuser`: every way, ending in a sign-in as the new holder and then used a second time to see
  it refused; the switch's three limits; a hand-over closed by a recovery code.
- `npm run check:auth`: the pages (the account page, the users page, the recovery page, the setup page).
- By hand once, at a real terminal: `npm run superuser -- create <address>` (the hidden prompt cannot be driven from a
  script).

## 8. Known and accepted

- A recovery code that leaks and is used before the owner notices takes the account (`RISKS.md` section 3).
- Whoever can read the hosting's settings holds `SETUP_CODE`; the switch limits what it can do and for how long
  (`RISKS.md` section 4).
- An attacker can still keep the global ceiling of failures (30 an hour) exhausted, and with it every wrong code from
  everybody is answered "too many attempts"; since T171 a **right** code passes the ceiling (not the per-address
  pause), so the owner is not shut out. The counters are in memory: restarting the server resets them.
- The attempt is counted before the lookup (T172) and given back when it was right, so a burst of parallel wrong codes
  cannot all pass the check before any is counted.
