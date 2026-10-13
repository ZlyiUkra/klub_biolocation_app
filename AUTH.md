# Who sees what: the guest gate of 2026-09-25 and its reopening

> **Superseded 2026-10-13 (T131; see REWRITE.md).** Who sees what is decided by the club's own backend now, on
> the server, not by a script in the page. Each section carries its own note (T057) saying what of it still stands;
> the model of 11.1 does, the rest is history.

Rewritten on 2026-09-28 at the owner's order that everything about the previous sign-in provider leaves the branch
`clerk-auth`. Sections 1 to 9 of this file described that provider - its setup, its settings, its tests and its pull
request - and are gone; they remain in the git history. Sign-in is Clerk now: the plan is `CLERK.md`, the Clerk
Dashboard and the administrator's runbook are `CLERK-DASHBOARD.md`, paid videos are `PAID-VIDEO.md`, and the session
log is `AUTH-IMPLEMENTATION.md`.

Marked on 2026-10-11 (T057): the sign-in of the site is its own now (`README.md`, "Sign-up and sign-in"; `REWRITE.md`). Each section below carries a note saying what of it still stands; nothing was deleted.

The two sections below stay, under their old numbers, because comments in the code point at them ("AUTH.md section
10", "section 11") and because they do not depend on the provider: they record how the site was closed to guests on
the evening of 2026-09-25 and opened again the same night, and why the few pieces that remain are the way they are.

## 10. The guest gate, added the evening of 2026-09-25

> Superseded on 2026-10-11 (T057): the inline block described here was removed in T054, and the header follows the viewer the server renders (T052, T142). What a static host allows is history; the site is a server now.

The owner's decision that evening: the site is for signed-in members. A guest was to see the home page with the
carousel and nothing else, under a header of the site name, Home, the theme switch and the sign-in icon; every other
page was closed and sent the guest to the sign-in page. Section 11 says what is left of it.

### 10.1 What a static host allows

GitHub Pages serves files. Nothing on it can refuse a request, so "closed" can only mean "not shown": the browser
decides, before it paints, whether the visitor is signed in, and shows the page or leaves it. The HTML of every page
is still a `curl` away, a visitor with JavaScript off sees every page, a search engine that runs no scripts indexes
every page, and a flag written by hand into the browser's storage opens everything, which is nothing more than what
`curl` shows. None of that is a fault of the implementation; it is the host. What a guest must never get has to be
answered by something that runs on a server; for paid videos that is the access service of `PAID-VIDEO.md`. The gate
is a door, not a lock, and the client should hear it in those words.

### 10.2 How it worked

- `Base.astro` took `openToGuests`, false by default, so a page that said nothing was closed.
- The first thing in every page's head is an inline block that reads the flag `kb-auth-expires`: the same lines as
  `readAuthFlag()` in `src/scripts/auth-flag.ts`, repeated because an inline block cannot import, so the two are
  changed together. A valid flag adds the class `kb-member` to the document. While the gate existed, no flag on a
  closed page meant `location.replace()` to `/auth/signin/?next=<path and query>`.
- `custom.css`: `html:not(.kb-member) .members-only { display: none !important }`.
- The sign-in page reads `next` and follows it after a sign-in and, for a visitor who already has a session, at
  once. The rule "a path on this site, never another origin" is `nextPath()` in `src/scripts/auth.ts` and nowhere
  else (tightened on 2026-09-28, when the paid-video consilium found two addresses a browser reads as another host).
- The menu got the item `Account`, the member's page, before About, at the owner's word the same evening
  (`src/config.ts`). English and short, as the owner asked; the page it opens keeps its Russian title. It carries
  `members-only`, so a guest never sees it. The header icon leads to the same page for a member and to the sign-in
  page for a guest.
- Why inline and first in the head, not a bundled module: a bundled script runs after the document is parsed, and a
  guest would see a closed page for a frame before it went away. The same reasoning put the theme bootstrap in
  `Head.astro` where it is.
- Why the flag and not the sign-in library: the block is on every page, and the library is by far the heaviest code
  on the site (the measurement is in `package.json`). The flag is fail-closed, and the pages that load the library
  correct it.

### 10.3 What it changed for a visitor, while it stood

A guest saw the home page's carousel and a header without the other menu items, the search, the hamburger and the
footer; every other address opened the sign-in page. A member saw the site as before, plus `Account`. Closed pages
carried `noindex` and the sitemap listed the home page alone. All of this was removed the same night (section 11).

### 10.4 Verified

On the build of that evening: the inline block was in every page of `dist/` and in `404.html`, and `openToGuests`
was true on exactly the pages meant to be open. The browser checks of that day belonged to a harness that has since
been rewritten for Clerk (`scripts/check-auth-browser.mjs`).

### 10.5 Not done, on purpose

- No word next to the sign-in icon: the owner confirmed on 2026-09-25 that the label and the tooltip are enough. The
  icon carries its label for assistive technology; a caption beside it is a design change for the owner to call.

## 11. Reopened after the colleague's review, 2026-09-25

> Superseded on 2026-10-11 (T057): the model of 11.1 stands (a guest sees everything except the paid course); 11.2 names files that are gone or rewritten; 11.4, password recovery by a code, is plan phase 9 (the site's own sign-in sends no mail yet); 11.5, Disqus, stays until plan phase 7.

The colleague reviewed the closed site the same night and asked for it back as it was: closing everything leaves a
visitor nothing to look at, and they leave. Only the material that belongs to the paid course is to be closed. The
owner agreed. Section 10 is kept as the record of what was built and removed.

### 11.1 The model the colleague set out

- **A guest** sees everything: the home page, the posts, the videos, the tags, the categories, the search, and the
  comments under posts and videos, which they can read. A guest cannot see a paid video.
- **A signed-in member** can also write comments and ask questions (through Disqus, see 11.5). Paid content stays
  closed.
- **A member who has paid** sees the paid content as well. Built on 2026-09-28: `PAID-VIDEO.md`.

### 11.2 What changed in the tree

- The redirect in the inline block at the top of `Base.astro` is gone, and the `openToGuests` prop with it; the
  block only marks the document `kb-member` while the flag is valid.
- `members-only` stays on one element: the `Account` item of the menu, in both variants of `Menu.astro`.
- `noindex` is gone, and the sitemap filter is back to what it was (every page except the `/page/<n>/` aliases and
  `/auth/`).
- Kept from the gate work, because they are useful on their own: the `Account` item, the sign-in icon on the home
  page, the `next` parameter of the sign-in page and `nextPath()`.
- Every existing comment about the gate stays in its file, with a line under it saying it was reopened.

### 11.3 Comments and paid content

Comments are Disqus, a third-party frame: anyone who opens it can read, and who may write is decided by Disqus, not by
this site. The ways to get "read for all, write after sign-in" that were weighed: turning off guest commenting in the
Disqus admin (writing then needs a Disqus login inside the frame, not the club's account); Disqus single sign-on (a
paid Disqus feature that needs a signature computed on a server); or comments of the site's own, which is real work -
a form, the list, moderation, a server-side store - and would leave the existing threads behind in Disqus.

Paid content is built: `PAID-VIDEO.md` and the consilium verdict of 2026-09-28.

### 11.4 Password recovery

Clerk's sign-in form has its own recovery ("Забыли пароль?", a code by email, a new password), so the site has no
recovery pages of its own; the three `/auth/` pages are sign-in, sign-up and the account page (`CLERK.md`).

### 11.5 Comments: Disqus stays, decided the same day

The owner first chose comments of the site's own, then decided against it the same day: Disqus stays exactly as it is
and is not to be touched for now. Reading stays open to everyone. To write, a visitor signs in to Disqus inside the
comment frame (or registers there), which is Disqus's own account, not the club's. If guests can still post without
any account, that is a switch in the Disqus admin (guest commenting) on the colleague's Disqus account, not code; the
exact name of the setting was not checked.

Changed 2026-09-28, the owner's choice: on a paid video the comments block stays hidden until the access service has
let the visitor watch (`Disqus.astro`, the `locked` prop; `PAID-VIDEO.md` section 1). Posts and public videos keep
their comments for everyone. Disqus itself is not changed.

Changed later the same night, the owner's decision: on a paid video the comments are closed to a guest only. They
show once the page has confirmed that the visitor is signed in, access or not, so that someone who has not paid yet
can be instructed there (`site.videoAccess.signedInEvent`; `PAID-VIDEO.md` section 1).

## 12. The help card of the sign-in form, 2026-09-28

> Superseded on 2026-10-11 (T057): Clerk's sign-in form and its help card no longer exist, so 12.1 to 12.6 describe a form that is gone. The feedback form, its open event and its fields stay; its fixed subject list and the prefill for a signed-in member are T144 and T145, now in plan phase 7.

The colleague found that "Написать в поддержку" on Clerk's help card does nothing and proposed that it open the site's
own feedback form. This section says how to reach the card, why the button fails, and how the proposal would work.
Nothing in the code has changed yet; the colleague offered to wire it.
(Built on 2026-10-01 at the owner's request; 12.6 says how it works and how to call it.)

### 12.1 How to reach it

Walked in headless Edge with the demo account (`CLERK.md`); every label below is what the form shows:

1. Open `/auth/signin/`.
2. Type the email address and press "Продолжить".
3. On "Введите пароль", press the link at the foot of the card, "Использовать другой метод".
4. On "Использовать другой метод", press the link at the foot, "Помощь".
5. The card "Помощь" shows the text "Если вы испытываете сложности со входом...", the button "Написать в поддержку" and
   the link "Назад". The address stays `/auth/signin/#/factor-one`.

The links appear once Clerk has fetched the account's ways in; for the demo account those are the password, a code
by email and a password reset by email code. In Clerk's source (`@clerk/ui`) the same card closes the other lists of
alternative methods too - the second factor, the passkey step - with the same button.

### 12.2 Why the button does nothing

The card is Clerk's `ErrorCard`, and its button does one thing: `window.location.href = "mailto:" + supportEmail`.
Clerk takes that address from the `supportEmail` option of `clerk.load()`, otherwise from the Dashboard's settings,
otherwise it makes one up from the Frontend API host. The site sets neither, so the click asks the browser to open
`mailto:support@supreme-ladybug-7080.accounts.dev` (measured: the navigation request is exactly that). No such mailbox
exists. On a machine with no mail program the click has no visible effect, which is what the colleague saw; with one,
the visitor writes to an address nobody reads.

### 12.3 The proposal: the site's own feedback form

`src/components/ContactModal.astro` is the "Обратная связь" form, on every page through `Base.astro` and opened today
by the envelope button in the footer. It posts to web3forms, which mails the message on to the address its access key
was registered with (the key came with the colleague's commit `786ee8e`).

What the visitor would do:

1. Reach the help card (12.1) and press "Написать в поддержку".
2. The feedback form opens over the sign-in card: name, email for the reply, message.
3. Press "Отправить письмо". The form closes and a notice says "Сообщение отправлено!"; on a failure it says so and the
   text stays in the form.
4. The reply comes by email from whoever reads the web3forms mailbox, who can look the member up in the Clerk Dashboard
   (`CLERK-DASHBOARD.md` section 7).

It works without a mail program, and the message lands in a mailbox somebody reads. How to wire it, for whoever does:

- `ContactModal.astro` opens only from the footer button now. Give it a second way in, a document event such as
  `contact:open`, and spell the event's name once in `src/config.ts`, as `site.videoAccess.grantedEvent` is; the
  scripts on both ends read it from there.
- On the sign-in page, listen for clicks on the document in the capture phase and match the button with
  `.cl-signIn-havingTrouble .cl-button` (the classes on the card and the button, measured). Call `preventDefault()` and
  `stopPropagation()` there: Clerk's handler runs in React, which listens below the document, so it never sees the
  click and the `mailto:` is not followed. Then send the event.
- Optional: fill the email field from the address the card already shows (`.cl-identityPreviewText`) and add a subject
  such as "Проблема со входом" through web3forms' `subject` field, so the letter says where it came from.
- Also set `supportEmail` in the `clerk.load()` options in `src/scripts/auth.ts` to a real mailbox. If a Clerk update
  renames those classes the interception stops matching, and the button then at least opens a letter to an address
  that exists. `site.social.email` in `src/config.ts` is still a placeholder, so the address has to come from the
  owner.
- The `cl-` classes are the ones Clerk's documentation tells a site to target from its own CSS ("Bring your own
  CSS", Core 3); recheck the selector after a Clerk update all the same.

  Он работает без почтовой программы, и сообщение попадает в почтовый ящик, который кто-то читает. Как подключить, для тех, кто делает: - `ContactModal.astro` теперь открывается только с кнопки в футере. Дайте ему второй путь, событие документа, такое как `contact:open`, и один раз введите имя события в `src/config.ts`, как это `site.videoAccess.grantedEvent`; сценарии на обоих концах читают его оттуда. - На странице входа прослушайте клики по документу на этапе захвата и сопоставьте кнопку с `.cl-signIn-havingTrouble.cl-button` (классы на карте и кнопке, измеренные). Вызовите там `preventDefault()` и `stopPropagation()`: обработчик Clerk работает в React, который прослушивает документ ниже, поэтому он никогда не видит щелчок и `mailto:` не выполняется. Затем отправьте событие. - Необязательно: заполните поле электронной почты с адреса, который уже указан на карте (`.cl-identityPreviewText`) и добавьте тему, например «Проблема со входом», через поле «Тема» web3forms, чтобы в письме было указано, откуда оно пришло. - Также установите для параметра supportEmail в параметрах clark.load() файла src/scripts/auth.ts реальный почтовый ящик. Если обновление Clerk переименовывает эти классы, перехват перестает соответствовать, и кнопка по крайней мере открывает письмо на существующий адрес. `site.social.email` в `src/config.ts` по-прежнему является заполнителем, поэтому адрес должен исходить от владельца. - Классы `cl-` — это те классы, которые в документации Clerk указывают сайту на использование собственного CSS («Принесите свой собственный CSS», Core 3); перепроверьте селектор после обновления Клерка, все равно.

### 12.4 Open

- Which mailbox the web3forms key sends to, and who answers it: the owner and the colleague to confirm.
- The real support address for `supportEmail`.
- The form over the sign-in card has not been tried yet; check that it sits above Clerk's card in both themes.

The first point was answered the same evening: while the site is being tested, the messages go to the colleague's
own address. How that is set is 12.5.

The third point was measured on 2026-10-01, when the proposal was built (12.6): opened on the sign-in page, the form
lies above Clerk's card in both themes.

### 12.5 Where the messages go, and how to change the address

Two different things send mail here, and only one of them involves Clerk.

**The feedback form** (`ContactModal.astro`, and the help card once it opens that form). Clerk plays no part: the
address is the one the web3forms access key was created with. Web3forms' documentation: "Once you submit the form,
you will get the Access key in your Email", and "An access key is used to send emails to a particular email". The
key is public by design ("You do not need to hide the access key. Access key is public"), so it sits in the markup.

1. Find out which address the current key was made with. It came with the colleague's commit `786ee8e`; if it was
   made with the colleague's address, the messages already go there and nothing needs changing.
2. Check it: open any page, press the envelope in the footer, fill the form in and send it. The letter arrives at
   that address (look in the spam folder too).
3. To send the messages somewhere else: on web3forms.com, create a new access key with the new address; the key
   arrives by email. Put it into `value` of the `access_key` input in `src/components/ContactModal.astro` and commit.
   The documentation says nothing about changing the address of an existing key, so a new key is the sure way.
4. Web3forms also documents a `ccemail` field for a copy to a second address.

**Clerk's own "Написать в поддержку" button**, as long as it is not wired to the feedback form (12.3). It opens the
visitor's mail program with Clerk's support address, so an address has to be given to Clerk: `supportEmail` in the
options of `clerk.load()` in `src/scripts/auth.ts` ("The support email address for display in authentication
screens", Clerk's types). Two cautions. The address then stands in the site's public code, where anyone can read it,
which for a personal address means spam; the feedback form keeps the address out of the page. And Clerk reads a
support address from the instance's settings too, but where the Dashboard sets it was not found. Once the button
opens the feedback form, the letter goes through web3forms to the key's address and Clerk needs no address at all.

### 12.6 Built on 2026-10-01: how it works and how to call it

At the owner's request the proposal of 12.3 is in the code, with the owner's choices: both "Помощь" and "Написать в
поддержку" open the form, the email field is filled in, the letter carries the subject "Проблема со входом", and
`supportEmail` stays unset (12.5: an address in the public code invites spam).

`FEEDBACK-FORM.md` tells the whole story of the form in one place, for the colleague: this section, 12.7 and the
restyle, with every class before and after.

#### What a visitor sees

1. Open `/auth/signin/`, type the email address, press "Продолжить".
2. On "Введите пароль", press "Использовать другой метод", then "Помощь" at the foot of that card.
3. The form "Обратная связь" opens over the sign-in card. The field "Email для связи" already holds the address typed
   into Clerk's form. Clerk's card stays where it was: no help card, no `mailto:`.
4. Fill in the name and the message and press "Отправить письмо". The letter goes through web3forms, with the
   subject "Проблема со входом", to the address of the access key (12.5); the notice "Сообщение отправлено!" shows,
   as for the form opened from the footer.

A visitor who reaches Clerk's help card some other way - the second-factor or passkey step (12.1) - gets the same form
from its "Написать в поддержку".

#### The pieces

- **`src/config.ts`, `site.contact.openEvent`** (`"contact:open"`): the event that opens the form, spelled once, as
  `site.videoAccess.grantedEvent` is.
- **`src/components/ContactModal.astro`.** The modal carries the event's name in `data-open-event`, because its script
  is inline and cannot import the config.
  - The script listens for the event on the document. The event's `detail` may give an `email`, written only into an
    empty field so that nothing the visitor typed is lost, and a `subject`.
  - A hidden `subject` input, web3forms' field for the subject of the letter ("The Name attribute must be called
    subject", web3forms docs, "Email Subject line"), is disabled and so not sent, unless the event gave a subject.
  - The envelope button in the footer switches it off again, so a letter from the footer keeps web3forms' own subject.
  - The colleague's handlers (opening from the footer, closing, sending, the notices) work as before; the new parts
    are listeners of their own next to them. The only line of hers that changed is the colour of the success notice
    (the restyle below).
- **`src/pages/auth/signin.astro`.**
  - `helpTargets`, the two Clerk elements, by the classes Clerk puts on them (measured on `@clerk/ui` 1.36.0):
    `.cl-footerAction__havingTrouble .cl-footerActionLink` is "Помощь", `.cl-signIn-havingTrouble .cl-button` is
    "Написать в поддержку".
  - `helpSubject`, the subject.
  - A click listener on the document, registered once Clerk's form is mounted.

#### How the click is caught

The listener runs in the capture phase on the document, so it runs before the listeners React keeps on the element
Clerk is mounted into (`#clerk-signin`). For a click inside that element on one of the two targets, it calls
`preventDefault()` and `stopPropagation()`: Clerk never sees the click, so it neither opens the help card nor follows
the `mailto:`. It then reads the address the visitor typed, `clerk.client.signIn.identifier` (`SignInResource` in
`@clerk/shared`), keeps it only if it contains "@", and sends the event with that `email` and the subject. Every
other click passes untouched.

#### Opening the form from any other script

The form is on every page, through `Base.astro`, so any script can open it:

```ts
import { site } from "../config";

document.dispatchEvent(
  new CustomEvent(site.contact.openEvent, {
    detail: { email: "visitor@example.com", subject: "Тема письма" },
  }),
);
```

- Both fields of `detail` are optional; `new Event(site.contact.openEvent)` opens the empty form, as the footer does.
- `email` fills the email field only when it is empty.
- `subject` becomes the subject of the letter; without it the letter keeps web3forms' default subject.
- An inline script, which cannot import the config, would have to spell `"contact:open"` itself; a bundled script is
  the better place.
- To try it on any page, paste into the browser console:
  `document.dispatchEvent(new CustomEvent("contact:open", { detail: { email: "a@example.com", subject: "Test" } }))`.

#### Checked on 2026-10-01

In headless Edge on the built site, without signing in. `fetch` was replaced in the page so that no letter was sent;
the probe read what would have gone to web3forms.

- **"Помощь".** The form opened with `demo+clerk_test@example.com` in the email field and the subject on. Clerk's card
  stayed on "Использовать другой метод", at `/auth/signin/#/factor-one`, and no navigation was requested. Sent:
  `subject`, `name`, `email`, `message`. The form closed after the answer.
- **"Написать в поддержку".** It cannot be reached through the form any more, because "Помощь" is caught first. So
  an element with the same two classes was put into `#clerk-signin`; it opened the form with the email and the
  subject. This checks the selector and the listener, not Clerk's card itself.
- **The footer button on the same page.** It opened the form with the subject off; sent: `name`, `email`, `message`.
- **Both themes.** The form lies above Clerk's card in both (12.4).
- **The build.** `npm run check` 0 errors, `npm run build` green.

#### After a Clerk update

Recheck the two selectors. On the sign-in page, open the card of other ways in and run in the console:

```js
document.querySelectorAll(
  ".cl-footerAction__havingTrouble .cl-footerActionLink",
).length;
```

It should print 1. Then press "Помощь": the feedback form should open. If Clerk renamed its classes, nothing breaks
outright: the click reaches Clerk again, which opens its help card and its `mailto:` link to the made-up address
(12.2). Inspect the two elements in the browser's developer tools (Clerk's documentation, "Bring your own CSS", shows
how) and put the new classes into `helpTargets` in `src/pages/auth/signin.astro`.

#### The look of the form

Restyled the same day at the owner's request, so that the form looks like the rest of the site in both themes:

- the card: rounded-lg, with the site's panel colour;
- the fields: white with a gray-300 border in the light theme, slate-800 with a slate-700 border in the dark theme,
  the colours of Clerk's inputs in `src/styles/clerk.css`;
- focus: a blue border and ring;
- the button: the site's own blue button;
- the notice: the site's green.

The old and new classes, and the reason for each, are listed at the top of `ContactModal.astro`. Screenshots of the
form over the sign-in page were compared before and after, in both themes.

### 12.7 A member's name and email in the feedback form, 2026-10-01

At the owner's request, a signed-in member finds the feedback form already filled in, however it is opened - the
envelope in the footer, the open event of 12.6, or any other script. The name is filled when Clerk's profile has one,
and the email always; the message is left to the member.

#### Where the two come from

The form is on every page, and Clerk is loaded only by the sign-in, sign-up and account pages and a paid video's page
(CLAUDE.md: never from a file the header or the layout loads, because Clerk is about 656 KB gzip). So the form cannot
ask Clerk. Instead, the pages that load Clerk keep a copy, next to the session flag the header already reads:

- `src/scripts/auth.ts`, `syncAuthFlag()`, runs on every change Clerk reports and on Clerk's navigations. With the
  flag it now writes the member's `fullName` and `primaryEmailAddress.emailAddress`.
- `src/scripts/auth-flag.ts`, `writeAuthContact(name, email)`, stores them as JSON under `site.auth.contactKey`
  (`"kb-auth-contact"`, `src/config.ts`). An empty pair is not kept. `clearAuthFlag()` removes the value with the
  flag: on a sign-out, and whenever a page that loads Clerk finds no session.
- `src/components/ContactModal.astro`, `fillMember()`, runs each time the form opens. It reads the value only while
  the document is marked `kb-member` - the mark the head block of `Base.astro` sets from a valid session flag, the
  same mark the header's icon follows - and writes into empty fields only. A leftover value without a valid session
  (a session that expired without a sign-out) is therefore not used.

A name changed on the account page follows on the next change Clerk reports there. A member who was already signed in
before this change gets the form filled after the next visit to a page that loads Clerk (the account page, the
sign-in page or a paid video), where the value is written for the first time.

#### Privacy

- The name and email stay in the member's own browser while the session lasts. Whoever uses that browser is signed in
  anyway, so the value shows nothing the session does not already give.
- Yandex Metrika's Session Replay would record the filled fields. The three visible fields therefore carry
  `ym-disable-keys`, Yandex's class for "prohibit the recording of a field's contents"; METRIKA.md proposal 3.1 notes
  this part as done.

#### Checked on 2026-10-01

In headless Edge on the built site, with the demo account (`CLERK.md`):

- **After the sign-in.** The value held the demo's email and an empty name: the demo profile has no name.
- **On `/about/`, which loads no Clerk.** The footer's form opened with the email filled, the name and the message
  empty. All three fields carried `ym-disable-keys`.
- **After the sign-out.** The value and the flag were both gone, and the form opened empty.
- **A leftover value without a session.** It was not used: the form stayed empty.
- **A member with a name.** A valid flag and a value with a name were put in the browser by hand, since the demo
  profile was not changed. The form filled both. A name typed over it was kept when the form was closed and opened
  again.
- **The build.** `npm run check` 0 errors, `npm run build` green.

#### How to try it

Sign in, open any page, press the envelope in the footer: the email is there, and the name if the profile has one.
Whether a member can enter a name at all depends on the instance's settings in the Clerk Dashboard (first and last
name among the user's attributes), which this repository does not record; the demo profile has none. Sign out and
open the form again: it is empty.
