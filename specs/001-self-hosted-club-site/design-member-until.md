# Design note: the paid-access date of the old site (T152, gap G14)

Written 2026-10-11 for the owner to choose from. Nothing in this note is built. The owner's decision of 2026-10-10 is
that the old record `member` and `memberUntil` is kept and must be used; this note only says how, and asks for four
choices.

## 1. What the old site did

Source: `CLERK-DASHBOARD.md` section 7.3 and the video Worker's rule (`workers/video-access/worker.mjs`, VERSION
2026-10-02.2, in git history).

- Two fields in a member's public metadata: `member: true` and `memberUntil: "YYYY-MM-DD"`.
- Paid lectures opened for a member when `member` was exactly `true` and `memberUntil` was a real date that is today or
  later in UTC. The last day counted in full and access stopped by itself the day after; a typo or a missing field
  meant no access.
- Since 2026-10-02 a status also opened them: student, expert, master, metr and admin, with no end date. The record
  still opened them on its own. The status `blocked` closed both.
- The administrators entered the record by hand in the Clerk Dashboard, after a payment noted in a shared table.
  Renewal was a new date; ending early was `member: false`.

## 2. What the new site has now

- A status opens the lectures, with no end date (`site.admin.lectureViewers`, the rule of FR-032); `blocked` closes
  them. No date exists anywhere: the `users` table has no such column, and the members file of T055 carries addresses
  only.
- So today a guest who paid cannot be given access with an end date at all, and the old record's one real feature,
  expiry without anybody acting, is lost.

## 3. The parts of the design that are not in doubt

- One new column, `users.access_until` (a date, null when there is none), written only by the administrators' routes
  and by the members import; one function in the access module that answers "may this viewer open paid lectures", and
  every decision goes through it (constitution III: one home for a rule).
- The date is a UTC day, the last day included, exactly as the old site read it (access stops at the end of that day).
- `blocked` is checked first and closes everything, whatever the date.
- Every change of the date is an audit row (who, whom, from, to).
- The account page shows the member their own end date; the users page shows it in the row.

## 4. Choice 1: how the date and the status combine (the important one)

- **A. Either one opens (recommended).** A status in the list opens the lectures with no end, as now; a date in the
  future opens them for anybody, a guest included. This is exactly the old site's behaviour, so nothing is lost and
  nobody who could watch before is shut out. A paying guest gets a date and stays a guest.
  Cost: a student with an old past date is not shut out, because the status opens them; the date only adds access,
  it never removes it.
- **B. The date limits the statuses too.** If an account has a date, access ends after it even for a student, expert
  or master; with no date, the status opens with no end. Metr and admin are never limited. Cost: one more rule to
  explain; an administrator who sets a date on a student by mistake closes the lectures for them.
- **C. The date is the only paid mechanism.** The statuses become labels and stop opening lectures. Cost: reverses
  the owner's rule of 2026-10-02 and shuts out every student and expert the day it is built. Not recommended.

## 5. Choice 2: who may set the date

- **A. The same people who may change the status (recommended).** A metr for a guest, student, expert, master or
  blocked account; an admin for anyone but the superuser and themselves. One rule, the one the users page already
  follows (`status-rules.ts`).
- **B. Admins only.** Simpler to audit, but a metr who takes the payment cannot record it.

## 6. Choice 3: what the member sees when the date passes

- **A. Nothing changes except the lectures (recommended).** The status and the account stay as they were; the paid
  lecture shows the same teaser a guest sees, and the account page says "Доступ к лекциям закончился ДД.ММ.ГГГГ".
- **B. A reminder before the end** (seven days, on the account page and the users page for administrators). Costs a
  small extra query; mail waits for phase 9.

## 7. Choice 4: where the old dates come from

- **A. The members file of T055 gets an optional column `memberUntil` (recommended),** read when Clerk's export has
  the metadata; where it does not, the administrators enter the dates on the users page. The import refuses a value
  that is not a real `YYYY-MM-DD`, as the old rule did, and reports it.
- **B. Administrators enter every date by hand.** Nothing to build in the import, but a re-entry of every paying
  member.

## 8. What it would take (for the estimate, not for now)

Migration 014 (one column and its index), the access function and its tests (the boundary: the last day included,
midnight UTC, a typo is no access, blocked first), the two routes' change (`PATCH /api/admin/users/:id/access`), the
row field on the users page, the line on the account page, the import column and the audit action. About one working
session. It belongs to plan phase 4 (lectures), where the access function for lectures is written, so T152 should be
done together with T076 to T085 and not before.

## 9. The owner's choices (2026-10-11)

- Choice 1: **A**, either one opens (a status opens with no end; a date in the future opens for anybody; the date
  never removes access that a status gives).
- Choice 2: **A**, the same people who may change the status may set the date.
- Choice 3: **A**, nothing changes except the lectures; the account page says the access ended and when.
- Choice 4: **A**, the members file of T055 gets an optional `memberUntil`; the rest is entered by the administrators.
- Added by the owner: by default nobody has the paid lectures through a date (a guest has none until an
  administrator writes one for them, user by user); when an administrator grants access without naming an end, the
  end is **100 years** from the day of the grant (a constant in one place, pre-filled in the form and editable).
  Reading to be confirmed with the owner: the 100 years is the default of the date, not a per-video permission; a
  permission per video and per person is the named-person audience of plan phase 5 (T087).

## 10. The owner's clarification of the same day (to be confirmed point by point before anything is built)

The owner described a two-sided model, in his words:

- The person: when a metr or an admin changes an account from a guest to a student, expert, master (or the like),
  the account receives at that moment the right to the paid lectures for 100 years. A guest is nobody; "a user is
  the one who is not a guest".
- The video and the lecture: each entry carries, from the moment it is put on the site, two fields: how long it is
  available (valid until / enabled until) and whether it is private (paid) or public (free). By default a video is
  paid and has a period of its own. A person sees it only by the status and only inside both periods.

What this changes against section 9: the date on the person becomes the one clock of the access (it limits the
statuses too, which is choice 1-B, and not only adds as 1-A), it is filled in by the status change and not typed,
and a second date lives on the video. The points to confirm are in the owner's conversation of 2026-10-11 after this
note was written: (1) the person's date as the one clock, with metr and admin never limited; (2) what happens to the
old paying guests (`member` with `memberUntil`); (3) what a visitor sees when a video's period has passed; (4) the
defaults (100 years for the person, 100 years for a video, paid by default).

## 11. Confirmed by the owner (2026-10-11), the model of section 10 as recommended

1. The person's date is the one clock: not blocked, and (a metr or an admin, or the date has not passed). It limits
   the statuses too. Metr and admin are never limited.
2. The old paying guests (`member` with `memberUntil`) stay guests and keep the date from the file; the date lets
   them in, as it did. No status is given by the import.
3. After a video's period the page stays (description, teaser) and the video does not play for anybody but the
   editors; the page says the period has ended.
4. Defaults: 100 years, for the person when the status makes them a user and for a video when it is put on the
   site; both are editable. A video is paid by default.

Consequences written down so they are not decided twice: moving to a status that opens the lectures from a guest or a
blocked account sets the person's date to today plus 100 years; moving between the opening statuses keeps it; moving
to guest clears it (a demoted student must not be let in by an old date as a "paying guest"); moving to blocked
sets it to yesterday (UTC) when there was a date (owner, 2026-10-11, so that the panel shows what is true), and blocked is
checked first anyway.
