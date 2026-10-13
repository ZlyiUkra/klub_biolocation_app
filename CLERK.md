# Clerk on the static build - implementation plan

> **Superseded 2026-10-12 (T167).** Clerk is gone from this repository: its packages, React, its scripts, its key and
> its configuration are deleted, and the sign-in, the statuses and the paid lectures are the club's own backend. This
> file is kept as the history of the arrangement and is not a description of the site.

Branch `clerk-auth`. Written on 2026-09-25 after the consilium whose verdict is
`.specify/consilium/2026-09-25-clerk-static.md`; read that first for the reasons. This file is the plan a session
follows to build it, step by step, and the checks that prove it works. When a step is done, mark it `(done
YYYY-MM-DD)` here and append an entry to `AUTH-IMPLEMENTATION.md`.

## 0. What stays, what goes, what the owner decided

- The site stays a static Astro 4.16 build on GitHub Pages. `@clerk/astro` is not used (it needs a server).
- Clerk does sign-up, email confirmation, sign-in, password recovery and account management. Clerk's own components
  render the forms and Clerk sends the mail.
- The previous auth provider leaves this branch completely, and so does its name: no import, no dependency, no
  project URL, no key, no comment, no document, no commit message on this branch mentions it. The owner's words on
  2026-09-25: it is not to be used here under any circumstances, and its name has to disappear from the code, from
  the comments and from the files about it. **This overrides the rule in `CLAUDE.md` that existing comments are never
  deleted or rewritten, for these comments only.** A comment whose lesson does not depend on the provider (a secret
  never enters the repository, a bundled script stands at the top level, the flag is presentation) keeps the lesson in
  neutral words; a comment that only describes the old provider goes. The previous work stays in git history
  (commits `8865366` and `6b374b9`) and needs no other record here.
- Disqus stays exactly as it is. The whole site stays open to guests.
- Menu: `Account` before `About`, members-only (hidden until the `kb-member` class exists), as today.
- New dependencies approved by the owner: `@clerk/clerk-js` 6.34.1 and `@clerk/localizations` 4.20.0, exact-pinned.
  Both declare `node >=20.9.0`; this machine runs 20.19.
- Clerk must work locally as well as on GitHub Pages (owner, 2026-09-25). One development instance and one
  `pk_test_` key serve both: a development instance accepts `localhost` on any port (`npm run dev` on 4321,
  `astro preview`, the harness on 4388) and a host-provided domain such as `debi7.github.io`, which is what Clerk
  recommends development keys for. There is no `.env` and no second key: the key is in `src/config.ts` and the same
  build runs in both places. Nothing in the code may branch on the host.
- Paid videos: deferred. Only one demo line on the account page, shown when `publicMetadata.member === true`.
- Route: direct-verified. Section 4 is the verification list; the work is not done until every item in it passes.
- Git: never commit, push or switch branches without the owner asking. The merge of the previous auth branch into
  this one is already done (`92b1493`), so the work starts from the reopened site with its menu item and flag.

## 1. Step 0 - the owner, in the Clerk Dashboard (before any code)

What each Dashboard page is for, and where it stops being enough for paid content, is explained for the colleague in
`CLERK-DASHBOARD.md` (2026-09-26). The steps below are the values to set.

1. Sign in at https://dashboard.clerk.com with the owner's own account and create an application, for example "Klub
   Biolocation". The owner must be the creator, so that the dashboard is never out of his reach. Invite the colleague
   under Settings - Members (the free plan has three seats).
2. Sign-in options: Email address on, Password on, everything else (phone, username, social providers, passkeys) off.
3. Email verification: "Verify at sign-up" on, method "Email verification code" (not link: a link works only on the
   device that started the sign-up, and a code needs no callback page on a static site).
4. Password: minimum length 8, the owner's rule of 2026-09-25.
5. Attack protection: turn off "Bot sign-up protection" on the development instance, otherwise the CAPTCHA blocks
   the headless check. Keep it on in production later.
6. Users - Create user: the demo account `demo+clerk_test@example.com` with the password `Demo-2026-klub` (made up,
   development instance only; the `+clerk_test` suffix means Clerk sends no mail and accepts the code `424242`). Then
   open the user, Metadata - Public, and set `{ "member": true }`.
7. API keys: copy the publishable key (`pk_test_...`) and give it to the session. It is public by design. The secret
   key (`sk_test_...`) is never needed and never goes anywhere near the repository.

Development instance facts to tell the client: a "Development mode" badge on the forms, "Development" in mail
subjects, at most 100 users, data does not move to production. Production needs a domain the club owns (Clerk's DNS
records cannot be put on `debi7.github.io`).

## 2. Steps for the implementing session

Before starting: read `CLAUDE.md` (the rules apply - a comment on every change, English in files, Russian site
strings; the one exception is the purge described in section 0), then the verdict, then this file. Check the Astro
docs MCP (`version: "4"`) for anything about scripts or routes, and Clerk's docs through
`https://clerk.com/docs/<page>.md` (the `.md` form returns the text; the HTML pages return a landing page). Pages
used for this plan: `quickstarts/javascript.md?manual=1`, `js-frontend/reference/objects/clerk.md`,
`js-frontend/reference/components/authentication/sign-in.md`,
`guides/customizing-clerk/localization.md?sdk=js-frontend`.

To find every trace of the previous provider without writing its name into this file, search for the pattern
`s[u]pabase` (case-insensitive); the bracket keeps the pattern from matching itself. The list on 2026-09-25, after
the merge: `AUTH.md`, `AUTH-IMPLEMENTATION.md`, `package.json`, `package-lock.json`, the other verdict of 2026-09-25
in `.specify/consilium/` (the one ending in `-auth-static.md`), `src/scripts/auth.ts`, `src/scripts/auth-flag.ts`,
`src/config.ts`, `src/env.d.ts`, `src/layouts/Base.astro`, `src/components/AuthButton.astro`,
`src/styles/custom.css`, the six pages under `src/pages/auth/`, `scripts/check-auth-browser.mjs`, `astro.config.mjs`,
`README.md`, `CLAUDE.md`, `MIGRATION-PLAN.md`, `VIDEO-PAGE.md`.

### Step 1 - dependencies

Uninstall the previous provider's package - the one `src/scripts/auth.ts` imports today - with `npm uninstall`, then:

```sh
npm install --save-exact @clerk/clerk-js@6.34.1 @clerk/localizations@4.20.0
```

In the `"//"` array of `package.json`, remove the two notes about the previous provider and its server adapter, and
add a note for the two Clerk packages: what they are for, that they are exact-pinned, that they run in the browser
only from `src/scripts/auth.ts`, that the UI bundle `@clerk/ui@1` is fetched at runtime from the instance's Frontend
API host and is not a dependency, and the measured size (core about 82 KB gzip, UI about 45 KB gzip, 2026-09-25). The
lock file loses every trace by itself; confirm it. Check `node_modules/astro/package.json` still says 4.x.

### Step 2 - `src/config.ts`

- `dashboardPath` becomes `accountPath = "/auth/account/"`. The menu entry `{ name: "Account", url: accountPath }`
  keeps its place before About.
- `site.auth` becomes `{ signIn: "/auth/signin/", signUp: "/auth/signup/", account: accountPath, flagKey:
"kb-auth-expires" }`. `callback`, `dashboard`, `forgot`, `reset` and `demoTable` go.
- The previous provider's block (URL and key) goes. `site.clerk = { publishableKey: "pk_test_..." }` takes its place,
  with a comment that the key is public by design, that it is the development instance serving localhost and GitHub
  Pages alike, and that a secret key must never be added.
- Every reader of the removed names must be updated: `src/components/Menu.astro` (`site.auth.dashboard` in both
  variants -> `site.auth.account`), `src/components/AuthButton.astro` (`data-dashboard-href` ->
  `data-account-href`, and the script reading it). Run `npm run check` to find any other.

### Step 3 - `src/env.d.ts`

Add the global the UI bundle sets:

```ts
interface Window {
  // (comment: set by @clerk/ui's browser bundle, loaded at runtime by src/scripts/auth.ts; possibly
  // undefined because a script tag can fail to load - the same pattern the KaTeX note above describes)
  __internal_ClerkUICtor?: <type>;
}
```

Take `<type>` from the type `Clerk.load()` expects for `ui.ClerkUI` in the installed `@clerk/clerk-js` declarations
(look it up under `node_modules/@clerk/clerk-js/dist/types` or `@clerk/shared`, written as an inline
`import("...").Name` so this file stays a global script). Never `any`. If no exported type fits, use `unknown` and
narrow it in `auth.ts` with a type guard. The note in this file about the removed environment variables goes with
the purge.

### Step 4 - `src/scripts/auth.ts` (rewritten) and `src/scripts/auth-flag.ts`

`auth.ts` keeps `nextPath()` unchanged except its default, `site.auth.account`. The previous client factory is
replaced by `getClerk()`, the only place a Clerk instance is created:

```ts
import { Clerk } from "@clerk/clerk-js";
import { ruRU } from "@clerk/localizations";
import { site } from "../config";
import { writeAuthFlag, clearAuthFlag } from "./auth-flag";

let pending: Promise<Clerk> | undefined;

export function getClerk(): Promise<Clerk> {
  pending ??= load();
  return pending;
}

async function load(): Promise<Clerk> {
  const key = site.clerk.publishableKey;
  // Frontend API host, derived from the key exactly as Clerk's quickstart does.
  const host = atob(key.split("_")[2] ?? "").slice(0, -1);
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://${host}/npm/@clerk/ui@1/dist/ui.browser.js`;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Clerk UI bundle failed to load"));
    document.head.appendChild(script);
  });
  const clerk = new Clerk(key);
  await clerk.load({
    ui: { ClerkUI: window.__internal_ClerkUICtor },
    localization: ruRU,
    signInUrl: site.auth.signIn,
    signUpUrl: site.auth.signUp,
    afterSignOutUrl: "/",
  });
  clerk.addListener(({ session }) => {
    if (session) writeAuthFlag(session.expireAt);
    else clearAuthFlag();
  });
  return clerk;
}
```

This is a sketch: `ClerkUI` has to satisfy the type from step 3 (guard it and throw the same "failed to load" error
when it is undefined), and every option name must be checked against the installed declarations. `addListener`
emits once immediately, so any auth page refreshes the flag on load.

`auth-flag.ts`: `writeAuthFlag(expiresAt: Date)` stores `Math.floor(expiresAt.getTime() / 1000)`, so the stored value
stays unix seconds and the inline reader in `Base.astro` needs no change. Its comments are rewritten for Clerk: the
header must not import the auth library because the Clerk bundles weigh about 127 KB gzip; Clerk decides who is
signed in; the flag is presentation.

### Step 5 - the three pages

Every page: `<Base title="...">`, a container `div` for the component, a status line (`role="status"`) saying
"Загрузка..." that the script replaces with an error text if `getClerk()` rejects ("Не удалось загрузить форму.
Обновите страницу."), and a `noscript` line saying the form needs JavaScript. The script is a bundled `<script>` at
the top level of the template (CLAUDE.md: never inside an expression). Never `routing: "path"`: the static host has
no page for Clerk's sub-steps; `"hash"` keeps them in the fragment. Each page opens with a comment block written for
Clerk; nothing of the previous page's comments survives unless its lesson is provider-independent.

- `src/pages/auth/signin.astro`: if `clerk.isSignedIn`, `location.replace(next)`; otherwise
  `clerk.mountSignIn(el, { routing: "hash", signUpUrl: site.auth.signUp, forceRedirectUrl: next })` where
  `next = nextPath(new URLSearchParams(location.search).get("next"))`. The "forgot password" link is part of the
  component; nothing to build.
- `src/pages/auth/signup.astro`: if signed in, go to the account page; otherwise `clerk.mountSignUp(el, { routing:
"hash", signInUrl: site.auth.signIn, forceRedirectUrl: site.auth.account })`. The password rule lives in the
  Dashboard (step 0.4); say so in the comment.
- `src/pages/auth/account.astro` (new, replaces `dashboard.astro`): if not signed in,
  `location.replace(site.auth.signIn + "?next=" + encodeURIComponent(site.auth.account))`. Otherwise:
  `clerk.mountUserProfile(el, { routing: "hash" })` (email, password change, sessions), a "Выйти" button that calls
  `clerk.signOut()` (the listener clears the flag; `afterSignOutUrl` sends the visitor home), and one line, hidden by
  default, shown when `clerk.user?.publicMetadata.member === true`: "Демо: доступ участника клуба подтверждён."
  Explain in its comment that `publicMetadata` is written only from the Dashboard, which is why it can gate, and that
  `unsafeMetadata` must never be used for this.
- Delete `src/pages/auth/callback.astro`, `dashboard.astro`, `forgot.astro`, `reset.astro`. Clerk verifies by code
  inside the form, so no mail lands on the site.

### Step 6 - the rest of the tree

- `AuthButton.astro`: the attribute rename from step 2; the aria-label and title texts stay; its comments rewritten
  for Clerk. The colleague's Russian note that does not name the provider stays.
- `Base.astro`, `Header.astro`, `Menu.astro`, `custom.css`, `astro.config.mjs`: no behaviour change. Every comment
  that names the previous provider or its access rules is rewritten in neutral or Clerk terms. The sitemap filter for
  `/auth/` stays; its note says the pages under it are three. The commented-out adapter lines in `astro.config.mjs`
  and their explanation stay only if they do not name the provider.
- `scripts/check-auth-browser.mjs`: rewritten, see section 4.
- `reference/astro-routes.txt`: regenerate (CLAUDE.md, "Route parity"); the `/auth/` lines are `account`, `signin`,
  `signup`.

### Step 7 - documents

- Delete `AUTH.md` and the other verdict of 2026-09-25 (`.specify/consilium/`, the file ending in
  `-auth-static.md`). This file and the Clerk verdict replace them.
  Done on 2026-09-28, with one change: the verdict is deleted, but `AUTH.md` keeps its sections 10 and 11 under their
  old numbers, cut free of the previous provider, because about twenty comments in the code cite them and the rule on
  existing comments forbids rewriting those. Everything else of the file is gone.
- `AUTH-IMPLEMENTATION.md`: keep only the entries about this branch; the earlier entries go (they are in git history).
  Rewrite its header as the log of the Clerk work, and append the entry for the implementation with the file-by-file
  list and the verification results.
- `CLAUDE.md`: "Read first" item 4 points at this file and the Clerk verdict only. The long auth entry under
  "Decisions and pitfalls already settled" is rewritten for Clerk, keeping the lessons that do not depend on the
  provider: static output because GitHub Pages runs no server (the adapter took the live site down once), the auth
  library loads only on the auth pages and never in frontmatter, the header reads the `kb-auth-expires` flag and the
  flag is presentation, public key in `src/config.ts` and never a secret in the repository, addresses with trailing
  slashes, `nextPath()` as the one open-redirect rule, `Account` members-only. The "Route parity" sentence about the
  four `/auth/` pages becomes three. `VIDEO-PAGE.md` 6.1 gets a dated note that the entitlement model is re-decided on
  Clerk, in words that do not name the old service. `README.md` and `MIGRATION-PLAN.md` section 9 the same way.
- Pull request text for the colleague: add it here as section 5 when the code is done - title, what changed, what the
  owner did in the Dashboard, how to test with the demo account, locally and on the live site. It names only Clerk;
  the removal is described as "the previous auth provider was removed".

## 3. Pitfalls known in advance

- `@clerk/clerk-js` must never be imported from frontmatter or from a file the header loads: it would run at build
  time or put 127 KB on every page. Only the three page scripts import `auth.ts`.
- `trailingSlash: "always"`: every address in `site.auth` keeps its slash; the dev server answers 404 without it.
- Clerk sign-in may ask for an email code on a new device ("client trust"); with a `+clerk_test` address the code is
  `424242`. The harness must handle that step if it appears.
- The Account Portal (`*.accounts.dev`) exists but is not used: it stays English and leaves the site.
- If the UI bundle is blocked (ad blocker, offline), the page must say so in the status line, not stay blank.
- `.env.local` is untracked and belongs to the owner; it is not part of the purge and must not be read into any
  tracked file.

## 4. Verification

Run in this order; every item must pass, and the results go into `AUTH-IMPLEMENTATION.md`.

1. `npm run fix`, `npm run check`, `npm run build` green. `dist/index.html` exists and there is no `dist/server/`.
2. The name is gone: `git grep -il "s[u]pabase"` prints nothing, and neither does
   `grep -ril "s[u]pabase" . --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git --exclude-dir=.astro
--exclude=.env.local` (this one also covers new files not yet added to git). `package-lock.json` included.
3. Clerk is confined: search `dist/` for a string unique to ClerkJS (for example `ClerkUICtor`); it may appear only in
   the bundles referenced by `dist/auth/signin/`, `dist/auth/signup/` and `dist/auth/account/` `index.html`. Record
   the byte size of those bundles.
4. `npx astro dev --port 4387` once: `/`, `/auth/signin/`, `/auth/signup/`, `/auth/account/` answer 200; stop the
   server by process id.
5. Route parity: regenerate `reference/astro-routes.txt`, diff against `reference/hugo-routes.txt`; the only `>`
   lines under `/auth/` are the three pages.
6. `npm run check:auth` - the rewritten harness, against the built site on `astro preview` (localhost) and the
   development instance (needs the network). It uses the demo account from step 0.6 only; it never signs up, so the
   100-user cap is never touched. Checks:
   - a guest on `/` has no `kb-member` class, the `Account` item is hidden, the header icon links to the sign-in page;
   - a guest on `/auth/account/` is sent to `/auth/signin/?next=%2Fauth%2Faccount%2F`;
   - the sign-in form mounts (an element with a `cl-` class appears) and the status line is gone;
   - sign-in with the demo account (type with `Input.insertText`; enter `424242` if a code step appears) lands on
     `/auth/account/`; `localStorage["kb-auth-expires"]` is numeric and in the future;
   - the next page (`/about/`) has `kb-member`, the `Account` item visible, the header icon pointing to the account
     page;
   - the account page shows the profile component and the demo line (the account has `member: true`);
   - a wrong password shows Clerk's error and writes no flag;
   - sign-out: the flag is gone and the visitor is on `/`;
   - loaded resource names never include `zxcvbn-common`, `base-account-sdk`, `coinbase-wallet-sdk`;
   - every URL the browser visited is logged and none contains `__clerk_db_jwt`;
   - cookies (`Network.getCookies`) and localStorage keys are printed at the end, for the record.
7. Local look by the owner, on both local servers - `npm run dev` (port 4321) and `npm run build` + `npm run
preview` - because the site has to work locally, not only on GitHub Pages: open `/auth/signup/`,
   `/auth/signin/`, sign in with the demo account, open `Account`, sign out; both themes.
8. After the colleague merges to `main`: the same walk on https://debi7.github.io/, and the flag checks of item 6 by
   hand in the browser's developer tools.
