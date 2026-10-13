# Owner check, plan phase 7 (T113): comments, reactions, feedback, settings

Passed on 2026-10-13 at the owner's word (T113). Run on your own copy of the site. Tick each line; write what you saw next to a line that fails. The real mailbox is not
part of this check: it moved with T111 to plan phase 8, so every "mail" below is a text file in the outbox folder.

Before you start:

1. `npm run db:migrate` has been run (migrations 021, 022 and 023).
2. `.env` has `MAIL_OUTBOX_DIR=` with an empty folder of your choice outside the repository and no `SMTP_*`
   variable. Optionally `FEEDBACK_RECIPIENT_SEED=` with an address, to start with a recipient already set.
3. The application was rebuilt (`npm run build`) and started in your usual way; the start line says "Mail: development
   outbox".
4. Four accounts, made at `/auth/signup/` and given statuses at `/admin/users/` (as an admin or a maitre): a guest (no
   status given), a student with a date that has not ended (a "writer"), a maitre, and the superuser. A tab with no
   session stands for a visitor.

## What is guaranteed, and by what

| Part                                                                                                                  | Held by                                               |
| --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Who reads and who writes a comment, text kept as typed, hide and restore, a hidden entry leaks nothing                | `server/test/comments.test.ts`, `check:comments`      |
| The six reactions: zeros for everyone, one per account, change and remove, only writers give one                      | `server/test/reactions.test.ts`, `check:comments`     |
| A message is stored before any mail; bots, bursts and cross-site posts are refused; visitor text never in a header    | `server/test/feedback.test.ts`, `check:feedback` (38) |
| The worker sends outside a request, never twice, and a failure loses nothing                                          | `server/test/mailer.test.ts`, `check:mail` (13)       |
| The settings page: superuser only, password again, code to the new address, the old address told, every change logged | `server/test/settings.test.ts`, `check:settings` (23) |
| Sign-up refuses a form sent at once, with no time, from the future, a day old                                         | `server/test/auth-routes.test.ts`, `check:auth` (99)  |

What no test can promise: how it looks and feels to you. That is what the lines below are for.

## 1. Comments

- [ ] As a visitor with no session, open a post: the comments are there, with a link to sign in where a writer would
      type, and no field to write in.
- [ ] As the guest account: the comments are there and a note says why the field is closed (a guest reads and cannot
      write).
- [ ] The button above the block hides the thread and brings it back.
- [ ] As the student: write a comment; it appears at the top, with your name, at once.
- [ ] Write `<b>bold</b> and <script>alert(1)</script>` as a comment: it is shown as those characters, not as markup.
- [ ] Change your comment, then delete it. Both are allowed (within a day); a deleted comment is gone from the list.
- [ ] As the maitre: hide a comment of the student; as the student it has gone, as the maitre it is there marked as
      hidden, and "restore" brings it back.
- [ ] Open a paid lecture as the guest (a teaser): its comments are readable, and there is no field to write.
- [ ] The block looks close enough to the previous service's block (the screenshot you gave).

## 2. Reactions

- [ ] Under a post: the question, the count of responses and six pictures with a count each, zeros at first.
- [ ] As the student: press one; its count becomes 1 and it is marked as yours. Press another: the first goes back to
      0 and the second is 1. Press yours again (or the remove control): it is gone.
- [ ] As a visitor: the counts are there with a link to sign in; as the guest: a note says why. Pressing a picture
      changes nothing in either case.
- [ ] Reload the page: the counts and your own choice are as you left them.

## 3. The feedback form

- [ ] Footer envelope button: the form opens. Write a message with a name and an address and send it: "Message sent!".
- [ ] `/admin/feedback/` (as the maitre) shows it at the top, within a second, with the name and the text.
- [ ] A file appeared in the outbox folder with the notice (a subject of the fixed form, your message in the body).
      If no recipient is set yet, the message is on the admin page and the line says there was no recipient.
- [ ] Search in `/admin/feedback/` for a word of the message: it is found; for a word that is not there: "nothing
      found".
- [ ] Send five more messages in a row from the same computer: the sixth is refused with the "too many" toast, and the
      admin page shows five, not six.
- [ ] Open `/auth/signin/` and press "Help": the form opens with the sign-in topic, and a signed-in member's name and
      address are already in it.

## 4. Settings (the superuser only)

- [ ] As the maitre and as an admin: `/admin/settings/` is the 404 page, and the panel's row and the account menu have no
      "Settings" link. As the superuser both are there.
- [ ] Enter a new recipient address and your password, press the button: the page says a code was sent; a file with an
      8-digit code is in the outbox folder (to the NEW address); a second file warns the old address, if there was one.
- [ ] Enter a wrong code: refused (five wrong ones cancel the request); enter the right one: the recipient is the new address, and the
      old address has a third file saying it changed.
- [ ] Send a feedback message again: its notice file is addressed to the new recipient.
- [ ] Switch the members-only block between "locked" and "hidden" with your password: the paid lecture's page follows.

## 5. Sign-up

- [ ] Open `/auth/signup/`, fill every field and press the button as fast as you can: nothing is refused; the button
      waits a moment and the account page opens.

## 6. Not part of this check

- A message reaching a real mailbox: plan phase 8 (T111, with `npm run mail:check` and [MAIL.md](../../MAIL.md)).
- A page for the log of settings changes: the log is kept by the database and has no page yet.
