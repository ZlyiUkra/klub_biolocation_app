# The feedback form: help from the sign-in form, prefill for members, the site's look

Written on 2026-10-01 at the owner's request, for the colleague, whose component the feedback form is
(`src/components/ContactModal.astro`, "Обратная связь"). It describes everything that changed in the form that day, in
one place: why, how, in which files, how to use it from other code, how to check it, and what is still open. The
changes are in commit edbedf8 on the branch `fix-bugs-v2`. The Clerk-side details are also in `AUTH.md` sections 12.6
and 12.7; this file is the whole story of the form.

Added on 2026-10-02 at the owner's request: "In plain words" below is the short version - what was there before, what
is there now, and why, in a few lines each. The numbered sections after it are the details, for when they are needed.

## Since 2026-10-13: the form posts to the club's own server (T107 to T110, T144, T188)

Everything below was written for the form of 2026-10-01, which posted to an outside service (web3forms). It does not
any more. The sections below stay as the history of the form's look and of its open event, and those two parts are
still true. What is true now:

- **Where a message goes.** `POST /api/feedback` with JSON `{body, name, contact, subject, website, startedAt}`. The
  message is stored first, in the table `feedback`, together with its notice in `mail_queue`, in one transaction;
  nothing is sent inside the request, so a mail failure loses nothing.
- **What is refused, with a plain 400 that names no check:** a filled honeypot (`website`), a form sent in under three
  seconds, with no opening time, from the future or a day old (`src/lib/fill-time.ts`; the form says when it was opened
  in the SERVER's clock, learned from the `Date` header, so a device whose clock is off still sends). A sixth message
  from one address in an hour is a 429 and the form shows its own toast. The lengths (5000, 100, 200 characters) are
  the fields' `maxlength`; the same numbers are checked by the route (`src/lib/feedback-rules.ts`).
- **Where it is read.** `/admin/feedback/`, for a maitre and an admin: newest first, twenty to a page, a search over
  the text, the name and the contact; the mail state of each message is shown, and a message that could not be mailed
  says why. Only the network part of the sender's address is kept.
- **Where it is mailed.** The recipient is a setting, changed by the superuser at `/admin/settings/`: a new address
  takes effect only after a code sent to it is entered, and the old address is told. The mailbox the site sends from
  is in the server's environment and is never editable from the site; how to choose it and check it is
  [MAIL.md](MAIL.md).
- **What did not change.** The look, the footer button, the open event `contact:open`, the sign-in help link opening
  the form with the subject (now the code `signin_problem`), a signed-in member's name and address filled in (from
  `GET /api/auth/me`), and `ym-disable-keys` on the fields.
- **How to check it.** `npm run check:feedback` drives the form in a browser (38 checks), `npm run check:mail` runs the
  worker in the real server process, `npm run check:settings` runs the settings page.

## In plain words

**1. "Помощь" in the sign-in form did nothing.**

- Before: Clerk's button opens a `mailto:` link to a made-up address. With no mail program on the computer, nothing
  happens at all.
- Why its class is not in our code: Clerk draws its form in the browser while the page runs, so it is in none of our
  files. The class shows only in DevTools (right click, Inspect): "Помощь" is `cl-footerActionLink`.
- Now: the sign-in page catches a click on that class before Clerk gets it, and opens our form instead.
- Why catch the click: Clerk has no setting for what this button does.

**2. The form opened only from the footer button.**

- Before: the form's script listened to `#open-modal-btn` and nothing else.
- Now: the form also listens for the event `contact:open`. Any script opens it with one line,
  `document.dispatchEvent(new CustomEvent("contact:open"))`, and can pass an email and a subject along.
- Why: the sign-in page, and anything later, can open the form without knowing about its buttons.

**3. A letter did not say where it came from.**

- Now: a letter sent after "Помощь" has the subject "Проблема со входом", and the email the visitor already typed into
  Clerk is filled in.
- How: a hidden field named `subject` - web3forms takes the subject from a field with exactly that name. From the
  footer the field is switched off, so the letter is the same as before.

**4. A member had to type their name and email.**

- The problem: the form is on every page, but Clerk is heavy (656 KB) and loads only on a few pages (sign-in,
  sign-up, the account page, a paid video), so the form cannot ask Clerk who the visitor is.
- The fix: whenever Clerk is loaded, it puts the member's name and email into `localStorage`. The form takes them from
  there, but only while the visitor is really signed in, and they are deleted on sign-out.
- It writes into empty fields only, so nothing the visitor has typed disappears.

**5. Metrika's Session Replay would record those fields.**

- Metrika records a video of the visit, form fields included. The fields now carry the class `ym-disable-keys`, and the
  recording shows asterisks instead.

**6. The colours did not match the site.**

- Before: `zinc` greys and a green `emerald` button, while the site uses `gray`/`slate` and blue buttons everywhere. In
  the dark theme the fields were grey on a dark-blue card.
- The trap worth remembering: `custom.css` paints every `.bg-white` with `!important`, which beats any Tailwind class.
  - That is why `dark:bg-zinc-900` on the card never worked.
  - It is also why the white fields are written `bg-[#ffffff]`: plain `bg-white` would turn them the colour of the
    card, and they would disappear into it.
- Now: the colours of Clerk's forms (`clerk.css`), and the same button as on the account page,
  `rounded bg-blue-600 px-4 py-2 text-white hover:opacity-90`.
- Next time: before picking colours, look at which classes the site already uses.

**What stayed as it was.** The colleague's code - opening from the footer, closing, sending, the notices - was not
touched; the new parts were added next to it. Only the colour of the success notice changed.

**How to check it.**

1. On `/auth/signin/`: type an email, press "Использовать другой метод", then "Помощь". Our form opens with the email
   filled in.
2. Sign in, then on any page press the envelope in the footer. The email is filled in.
3. Switch the theme with the form open. The colours match the sign-in form.

**One thing for later.** After a Clerk update the class `cl-footerActionLink` may change. "Помощь" then goes back to
Clerk's own behaviour, and the fix is to update the class in `signin.astro`.

## 1. What changed, in short

1. **"Помощь" opens the form.** "Помощь" in Clerk's sign-in form, and "Написать в поддержку" on Clerk's help card,
   open this form instead of Clerk's `mailto:` link to a made-up address. It was the colleague's proposal of
   2026-09-28 (`AUTH.md` section 12.3). The email field is filled with the address typed into Clerk's form, and the
   letter gets the subject "Проблема со входом".
2. **Any script can open the form.** The form opens on an event, `site.contact.openEvent`, which any script can send,
   with an email and a subject to fill in.
3. **Prefill for members.** A signed-in member finds the email filled in, and the name when Clerk's profile has one,
   however the form is opened. The message is left to the member.
4. **Hidden from Session Replay.** The three fields are hidden from Yandex Metrika's Session Replay (the Webvisor) with
   `ym-disable-keys`.
5. **The site's look.** The form now uses the site's colours in both themes, instead of zinc greys and an emerald
   button.

What did not change: the footer's envelope button, closing (the cross, a click on the dimmed background), sending
through web3forms, the notices "Сообщение отправлено!" and "Ошибка отправки...", the reset after a successful send and
after Back. The colleague's code for all of these is in place; the new parts are listeners of their own next to it.
The only line of hers that changed is the colour of the success notice.

## 2. The files

- **`src/components/ContactModal.astro`.** The form.
  - Two data attributes on the modal: `data-open-event` and `data-member-key`.
  - A hidden `subject` field.
  - `ym-disable-keys` on the three fields, and the new classes.
  - In the inline script: the listener for the open event, `fillMember()`, and a second listener on the footer button.
  - The comment at the top lists every class before and after, with the reason.
- **`src/config.ts`.** `site.contact.openEvent` (`"contact:open"`) and `site.auth.contactKey` (`"kb-auth-contact"`).
- **`src/pages/auth/signin.astro`.**
  - `helpTargets`, the two Clerk elements, and `helpSubject`.
  - A click listener in the capture phase, which sends the open event.
- **`src/scripts/auth-flag.ts`.** `writeAuthContact(name, email)`, and `clearAuthFlag()` now clears that value too.
- **`src/scripts/auth.ts`.** `syncAuthFlag()` writes the member's name and email next to the session flag.

## 3. How the form opens

There are three ways in, and all of them open the same form.

### 3.1 The footer's envelope button

As before. The new listener on the same button switches the subject off and fills a member's fields (sections 4 and
6).

### 3.2 "Помощь" and "Написать в поддержку" in Clerk's sign-in form

Clerk builds its form in the browser, which is why the button's class is nowhere in the site's code. Clerk does put
stable classes prefixed `cl-` on its elements, and its documentation points a site to them ("Bring your own CSS", Core
3). Measured on `@clerk/ui` 1.36.0:

- "Помощь", at the foot of the card "Использовать другой метод": an `a.cl-footerActionLink` inside
  `.cl-footerAction__havingTrouble`.
- "Написать в поддержку", on Clerk's help card: a `button.cl-button` inside `.cl-signIn-havingTrouble`.

The steps:

- `signin.astro` registers a click listener on the document, in the capture phase, once Clerk's form is mounted.
- For a click inside `#clerk-signin` on one of the two, it calls `preventDefault()` and `stopPropagation()`. The capture
  phase on the document runs before the listeners React keeps on the element Clerk is mounted into, so Clerk never sees
  the click: no help card, no `mailto:`.
- It reads the address the visitor typed, `clerk.client.signIn.identifier` (`SignInResource` in `@clerk/shared`), and
  keeps it only if it contains "@".
- It sends the open event with `{ email, subject: "Проблема со входом" }`.

Clerk offers no option to change what its help button does: the button only opens `mailto:` with `supportEmail`, which
the site leaves unset (`AUTH.md` 12.2 and 12.5). That is why the click is caught rather than configured.

### 3.3 The open event, from any script

```ts
import { site } from "../config";

document.dispatchEvent(
  new CustomEvent(site.contact.openEvent, {
    detail: { email: "visitor@example.com", subject: "Тема письма" },
  }),
);
```

- `detail` and both of its fields are optional. `new Event(site.contact.openEvent)` opens the empty form, as the
  footer does.
- The form takes the event's name from `data-open-event` on the modal, because its script is inline and cannot import
  the config. The name is spelled once, in `src/config.ts`.
- An inline script that wants to send the event would have to spell `"contact:open"` itself; a bundled script is the
  better place.
- To try it on any page, paste into the browser console:
  `document.dispatchEvent(new CustomEvent("contact:open", { detail: { email: "a@example.com", subject: "Test" } }))`.

## 4. What the fields get

Every rule writes into an **empty** field only, so nothing the visitor typed is ever overwritten.

- **Email.**
  - First from the event's `detail.email`, so an address the sender gave wins.
  - Then from the member's stored email (section 6).
- **Name.** From the member's stored name, when there is one.
- **Message.** Never filled.
- **Subject.** A hidden `subject` input, web3forms' field for the subject of the letter ("The Name attribute must be
  called subject", web3forms docs, "Email Subject line").
  - It is disabled, and therefore not sent, unless the open event gave a subject.
  - The footer button switches it off again, so a letter sent from the footer keeps web3forms' own subject, as before.

## 5. Where the letters go

Nothing changed here. The form posts to web3forms, which mails the message to the address its access key was created
with: while the site is being tested, the colleague's own address. How to check that address or move it to another one
is in `AUTH.md` section 12.5.

## 6. A member's name and email

### 6.1 Where they come from

The form is on every page, through `Base.astro`. Clerk (about 656 KB gzip) is loaded only by the sign-in, sign-up and
account pages and a paid video's page, and never by a file the header or the layout loads (`CLAUDE.md`). So the form
cannot ask Clerk; the pages that load Clerk keep a copy for it, next to the session flag the header already reads.

1. **`syncAuthFlag()`** in `src/scripts/auth.ts` runs on every change Clerk reports and on Clerk's navigations. With the
   flag it now passes the member's `fullName` and `primaryEmailAddress.emailAddress` to `writeAuthContact()`.
2. **`writeAuthContact()`** in `src/scripts/auth-flag.ts` stores them as JSON under `site.auth.contactKey`
   (`localStorage`, `"kb-auth-contact"`). An empty pair is not kept.
3. **`clearAuthFlag()`** removes the value together with the flag: on a sign-out, and whenever a page that loads Clerk
   finds no session.
4. **`fillMember()`** in the form's script runs each time the form opens, from the footer or by the event.
   - It reads the value only while the document carries the `kb-member` class. That is the mark the head block of
     `Base.astro` sets from a valid session flag, the same one the header's icon follows.
   - A leftover value after a session that expired without a sign-out is therefore not used.

### 6.2 When the fields fill

- A name changed on the account page follows on the next change Clerk reports there.
- A member who was signed in before this change gets the form filled after the next visit to a page that loads Clerk
  (the account page, the sign-in page or a paid video), where the value is written for the first time.
- The name is filled only when Clerk's profile has one. Whether a member can enter a name at all depends on the
  instance's settings in the Clerk Dashboard (first and last name among the user's attributes), which the repository
  does not record. The demo account has no name.

### 6.3 Privacy

- The name and email stay in the member's own browser while the session lasts. Whoever uses that browser is signed in
  anyway, so the value shows nothing the session does not already give.
- Yandex Metrika's Session Replay records what is on the page, filled fields included. The three fields therefore carry
  `ym-disable-keys`, Yandex's class for "prohibit the recording of a field's contents" (replaced with asterisks in the
  recording). That was part of `METRIKA.md` proposal 3.1, which is marked there as done for this form; the rest of
  3.1, `ym-hide-content` on Clerk's elements, is still a proposal.

## 7. The look

The form now uses the values Clerk's forms were given in `src/styles/clerk.css`, and the site's own button (the account
page, the paid video box). The colours are Tailwind classes from the site's pinned palette, and the built CSS was
checked against `clerk.css`: slate-800 `#1d293d`, slate-700 `#314158`, blue-600 `#155dfc`, blue-500 `#2b7fff`,
gray-300 `#d1d5dc`.

Element by element, the classes that changed:

- **The card.**
  - Before: `rounded-2xl border-zinc-200 dark:border-zinc-800 dark:bg-zinc-900`.
  - After: `rounded-lg border-gray-200 dark:border-slate-700`.
  - Why: `rounded-lg` like every card on the site. Its background was already `--panel-bg` in both themes, because
    `custom.css` paints `.bg-white` with `!important`; `dark:bg-zinc-900` never applied and was removed.
- **The close button.**
  - Before: `text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200`.
  - After: `text-gray-400 hover:text-gray-600 dark:text-slate-400 dark:hover:text-gray-200`.
- **The heading.**
  - Before: `text-zinc-900 dark:text-zinc-100`.
  - After: `text-gray-800 dark:text-gray-200`, Clerk's foreground colours.
- **The labels.**
  - Before: `text-xs text-zinc-500 dark:text-zinc-400`.
  - After: `text-sm text-gray-500 dark:text-slate-400`.
  - Why: `text-sm` is the size of the labels in Clerk's forms.
- **The three fields.**
  - Before: `rounded-xl border-zinc-200 bg-zinc-50 focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-800`.
  - After: `ym-disable-keys rounded border-gray-300 bg-[#ffffff] text-gray-800 focus:border-blue-600 focus:ring-1
focus:ring-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-200 dark:focus:border-blue-500
dark:focus:ring-blue-500`.
  - Why: the input colours in `clerk.css`, with a blue border and ring on focus. White is `bg-[#ffffff]` because plain
    `bg-white` would be repainted to `--panel-bg` by `custom.css`, and the fields would melt into the card.
- **The button.**
  - Before: `rounded-xl bg-emerald-600 py-2.5 text-sm font-medium shadow-md transition-colors hover:bg-emerald-700`.
  - After: `rounded bg-blue-600 px-4 py-2 transition-opacity hover:opacity-90`.
  - Why: the site's button exactly, at full width.
- **The success notice.**
  - Before: `bg-emerald-600`.
  - After: `bg-green-600`, the green of the pinned palette. The error notice stays `bg-red-600`.

Unchanged: the dimmed background (`bg-black/60 backdrop-blur-sm`), the card's padding, width and shadow, the heading's
font (`font-bilingual`), the notices' container. Screenshots of the form over the sign-in page were compared before and
after, in both themes: in the dark theme the fields were grey on the dark-blue card and are now in its tones, and the
button is the site's blue in both.

## 8. How to check it

1. **"Помощь".**
   - Open `/auth/signin/`, type an email address, press "Продолжить".
   - On "Введите пароль", press "Использовать другой метод", then "Помощь".
   - The form opens with that address filled in, and Clerk's card stays where it was.
2. **A member.**
   - Sign in, open any page, press the envelope in the footer.
   - The email is filled in, and the name if the profile has one.
3. **After a sign-out.** Open the form again: it is empty.
4. **The look.** Switch the theme with the form open and compare it with the sign-in card behind it.
5. **Sending.** "Отправить письмо" sends a real letter to the mailbox of the web3forms key (section 5).

## 9. What was checked

On 2026-10-01, in headless Edge on the built site. `fetch` was replaced in the page so that no letter was sent; the
probe only read what would have gone to web3forms.

- **"Помощь".** The form opened with the typed email and the subject on. Clerk's card stayed on "Использовать другой
  метод" (`/auth/signin/#/factor-one`) and no navigation was requested. The fields that would have been sent:
  `subject`, `name`, `email`, `message`.
- **"Написать в поддержку".** It cannot be reached through the form any more, because "Помощь" is caught first. So an
  element with the same two classes was put into `#clerk-signin`; it opened the form with the email and the subject.
  This checks the selector and the listener, not Clerk's card itself.
- **The footer button on the sign-in page.** It opened the form with the subject off; sent: `name`, `email`, `message`.
- **The form over Clerk's card.** It lies above Clerk's card in both themes.
- **The demo member.**
  - The value was written at sign-in: email only, since the demo profile has no name.
  - The footer form on `/about/`, a page without Clerk, opened with the email filled.
  - After the sign-out the value and the flag were gone, and the form opened empty.
  - A leftover value without a session was ignored.
- **A name.** A hand-made value with a name, under a valid flag, filled both fields. A name typed over it was kept when
  the form was closed and opened again.
- **All three fields** carry `ym-disable-keys`.
- **The tooling.**
  - `npm run check`: 0 errors.
  - `npm run build`: green.
  - `astro dev` served the pages without errors.

## 10. Open, and to keep in mind

- **After a Clerk update, recheck the two selectors.** On the sign-in page, open the card of other ways in and run
  `document.querySelectorAll(".cl-footerAction__havingTrouble .cl-footerActionLink").length` in the console; it should
  print 1. If Clerk renamed the classes, nothing breaks outright: the click reaches Clerk again, which shows its help
  card and its `mailto:`. The fix is to put the new classes into `helpTargets` in `src/pages/auth/signin.astro`.
- **Names in Clerk.** Whether the instance collects first and last names decides whether the name can ever be filled
  (section 6.2).
- **`supportEmail` stays unset**, the owner's choice: an address in the public code invites spam (`AUTH.md` 12.5).
- **The rest of `METRIKA.md` proposal 3.1** (`ym-hide-content` on Clerk's elements) waits for the colleague's review.

## 11. Where else it is written

- **`AUTH.md`.**
  - 12.1 to 12.5: how to reach Clerk's help card, why its button failed, the colleague's proposal, where the letters
    go.
  - 12.6: the help interception and the open event.
  - 12.7: the member's name and email.
- **`src/components/ContactModal.astro`.**
  - The comment at the top: every class before and after.
  - Comments next to each new part of the markup and the script.
- **`src/pages/auth/signin.astro`, `src/scripts/auth.ts`, `src/scripts/auth-flag.ts`, `src/config.ts`.** Comments next
  to each change.
- **`README.md`.** The paragraph "Помощь in the sign-in form opens the feedback form (2026-10-01)".
- **`METRIKA.md`.** The note under proposal 3.1.
- **`AUTH-IMPLEMENTATION.md`.** The two entries of 2026-10-01 in the session log.
- **`CLAUDE.md`.** The sign-in entry under "Decisions and pitfalls already settled", for later sessions.
