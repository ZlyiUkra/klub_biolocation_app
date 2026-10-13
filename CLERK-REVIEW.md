# Review guide: the sign-in on Clerk (branch `clerk-auth`)

> **Superseded 2026-10-13 (T131; see REWRITE.md).** The branch `clerk-auth` and its Clerk sign-in were replaced by
> the club's own backend, and Clerk was removed on 2026-10-12 (T167). This review guide is kept as the record of that
> review and does not describe the site.

Written on 2026-09-26 for the colleague's review of the branch `clerk-auth`. It says what changed, how to check it
locally, and what is still open. The plan behind it is `CLERK.md`; the reasons are in
`.specify/consilium/2026-09-25-clerk-static.md`.

## 1. What changed

The previous auth provider was removed. Sign-up, sign-in, email verification, password recovery and the account page
now run on Clerk, in the visitor's browser, on the static build. Nothing needs a server, and GitHub Pages deploys the
site exactly as before.

- **Packages.** `@clerk/clerk-js` 6.34.1, `@clerk/ui` 1.36.0 (with `react` and `react-dom` 19.3.0 as its peers) and
  `@clerk/localizations` 4.20.0, all exact-pinned. Node stays on 20: an `overrides` entry pins `commander` to 14.0.3 for
  `@solana/errors` only, because version 15 demands Node 22. The reasons are in the `"//"` notes of `package.json`.
- **Three pages.**
  - `/auth/signin/`: sign-in, with "Забыли пароль?" built into the form.
  - `/auth/signup/`: registration, with the email confirmed by a code.
  - `/auth/account/`: Clerk's profile, a sign-out button, and one demo line for members.

  The pages `callback`, `dashboard`, `forgot` and `reset` are gone: Clerk confirms addresses and resets passwords by a
  code typed into its own forms, so no mail lands on the site.

- **Look.** The forms use the site's font, colours and card shape in both themes (`src/styles/clerk.css`, and
  `appearance.elements` in `src/scripts/auth.ts`). Clerk's Russian strings come from `@clerk/localizations`;
  `src/scripts/clerk-ru.ts` fills the gaps it leaves on these pages.
- **Confinement.** Clerk loads on the three auth pages only. Every other page is unchanged: the header icon and the
  `Account` menu item read the small `kb-auth-expires` flag, as before. `Account` appears only when signed in and is
  highlighted on the account page.
- **Key.** The publishable key of the development instance is in `src/config.ts`. It is public by design (Clerk's docs:
  it needs no rotation even when committed). There is no secret key anywhere in the repository, and there must never
  be one.
- **Tooling.** `npm run dev:clean` empties Vite's dependency cache and starts the dev server; use it if a sign-in page
  shows a blank form after a package change. `npm run check:auth` is rewritten for Clerk.

Two faults found on the way and fixed, worth knowing when reading the code:

- Clerk's navigation drops the trailing slash (`/auth/account/` became `/auth/account`), which the dev and preview
  servers answer with 404 under `trailingSlash: "always"`. `routerPush` and `routerReplace` in `auth.ts` put it back.
- The header flag was written too late after a sign-in and cleared too late after a sign-out. It is now synced before
  every Clerk navigation, and the sign-out button clears it first.

## 2. Checking it locally

Every address needs its trailing slash; without it the dev server answers 404.

1. `npm ci`, then `npm run dev:clean`.
2. `http://localhost:4321/auth/signup/`: register a new address that contains `+clerk_test`, for example
   `review+clerk_test@example.com`, with a password of at least 8 characters. Clerk sends no mail to such addresses and
   accepts the code `424242`. You should land on the account page.
3. Sign out. Then `http://localhost:4321/auth/signin/`: sign in with the demo account `demo+clerk_test@example.com` /
   `Demo-2026-klub`. On a new device Clerk asks for a code: `424242`. A wrong password shows an error.
4. Password recovery: on the password step, "Забыли пароль?", then "Восстановить пароль", code `424242`, a new
   password. If you do this with the demo account, set its password back to `Demo-2026-klub` afterwards; the automated
   check relies on it.
5. The account page shows Clerk's profile and, if the demo user has `{ "member": true }` in its public metadata, the
   line "Демо: доступ участника клуба подтверждён.". "Выйти" leads to the home page.
6. The menu: a guest does not see `Account`; a signed-in visitor does, and it is highlighted on the account page.
7. Both themes (the moon/sun button) and a narrow window.
8. The same walk on a production build: `npm run build`, then `npm run preview`.
9. The automated checks: `npm run check`, `npm run check:pages`, `npm run check:auth`. `check:auth` needs Microsoft Edge
   and ports 4388 and 9333 free; it gives 19 of 19 once the demo user has its public metadata, 18 of 19 before.

## 3. Clerk Dashboard settings to confirm

These live in the Dashboard, not in the code, and they apply per instance. The site now uses the development instance
`supreme-ladybug-7080`; settings made on any earlier instance do not carry over. `CLERK-KEY.md` section 3 has the
details.

- **SSO connections:** Apple, Google and X deleted, not only switched off for sign-up and sign-in. Switched off, they
  still appear under "Подключенные учетные записи" in the profile.
- **Email:** verification at sign-up by code; sign-in by email code or email link off, so that "Использовать другой
  метод" disappears and password is the only way in.
- **Password:** minimum length 8.
- **Organizations:** off. The site has one audience and no organizations.
- **Profile fields:** first and last name, username, phone, Web3 and passkeys off.
- **Application name:** "Klub Biolocation" instead of "My Application"; it is printed in the form's title.
- **Protect:** bot sign-up protection, Device Trust, lockout and user enumeration protection stay on.
- **Demo user:** `{ "member": true }` under Metadata, Public.
- **Team:** both administrators have the Admin role.

## 4. Still open

- **Plan step 7, the documents.** `AUTH.md`, `AUTH-IMPLEMENTATION.md`, `CLAUDE.md`, `README.md` and the earlier verdict
  in `.specify/consilium/` still describe the previous provider. They are to be rewritten or removed in a separate
  commit, preferably before the branch is merged into `main`.
  Done on 2026-09-28 at the owner's order: the earlier verdict is deleted, `AUTH.md` keeps only sections 10 and 11
  (the guest gate and its reopening, which code comments cite), the session log keeps only this branch's entries, and
  `CLAUDE.md`, `README.md`, `MIGRATION-PLAN.md` and `VIDEO-PAGE.md` no longer name the previous provider.
- **Paid content.** Videos visible only to paying members, comments and likes for signed-in visitors only, and access
  granted by an administrator after a payment. This needs the first piece of the site that runs outside GitHub Pages
  and a decision about Disqus, so it goes to its own consilium first. `CLERK-DASHBOARD.md` sections 4 to 7 describe the
  options and the manual way of granting access.
  Paid videos done on 2026-09-28: `PAID-VIDEO.md`. Comments and likes for signed-in visitors are still open.
- **Production.** A production Clerk instance needs a domain the club owns; until then the development instance serves
  both local work and the live site.

## 5. After the merge into `main`

GitHub Pages publishes `main` only. Once the branch is merged, repeat section 2, steps 2 to 7, on
https://debi7.github.io/ and check in the browser's developer tools that `localStorage["kb-auth-expires"]` appears
after a sign-in and disappears after a sign-out.
