---
consilium: 2026-09-25
topic: Replace the previous auth provider with Clerk on the static GitHub Pages build
slug: clerk-static
verdict: approved-with-conditions
route: direct-verified
archetypes:
  nitpicker: ok
  security: ok
  performance: ok
  best-practices: ok
  pragmatist: ok
---

# Replace the previous auth provider with Clerk on the static build

## Agreed proposal

Visitors of the club site can register with an email address and a password, confirm the address, sign in, recover a
forgotten password and manage their account, without the club writing or maintaining any of those screens: Clerk's
ready-made components do it, and Clerk sends the mail. A signed-in member sees an `Account` item in the menu that
leads to their account page; a guest does not. Everything else on the site stays open to everyone, including the
Disqus comments, which remain exactly as they are (a visitor who wants to write a comment signs in through Disqus).

The reason for the change is the colleague's review of 2026-09-25: she did not want the auth screens, the password
recovery and the email confirmation to be hand-written. Clerk supplies all three. The site stays a static build on
GitHub Pages, so it keeps its free hosting and its current deploy.

## Limits and constraints

- Static output stays. `@clerk/astro` is not used: every major version of it requires `output: "server"`, the node
  adapter and `clerkMiddleware()`, which GitHub Pages cannot run (3.4.20 is the line that accepts Astro 4, and it is
  SSR-only as well).
- ClerkJS runs in the browser on three pages only: `/auth/signin/` (`mountSignIn`, password recovery built in, by
  code), `/auth/signup/` (`mountSignUp`, email verification by code) and `/auth/account/` (`mountUserProfile`, a
  sign-out button and one demo line). No other page loads a byte of Clerk.
- The header and the menu keep reading the `kb-auth-expires` flag; only the writer of the flag changes (Clerk's
  `session.expireAt` instead of the previous provider's expiry).
- Dependencies, approved by the owner on 2026-09-25: `@clerk/clerk-js` and `@clerk/localizations`, exact-pinned. The UI
  bundle `@clerk/ui@1` is loaded at runtime from the instance's Frontend API host, as Clerk documents for the npm
  setup; it cannot be bundled.
- The previous auth provider leaves the `clerk-auth` branch entirely, and so does its name: code, dependency,
  config, comments and documents. The owner said on 2026-09-25 that it must not be used in the Clerk branch under any
  circumstances and that its name has to disappear from the code, the comments and the files about it; this
  overrides, for those comments only, the project rule that existing comments are never deleted. The earlier work
  stays in git history (`8865366`, `6b374b9`).
- A Clerk development instance (`pk_test_`) serves both localhost and the live demo. Production needs a domain the
  club owns; `debi7.github.io` cannot carry Clerk's CNAME records.
- Paid videos are out of scope (see "Deliberately not done").

## Remarks that survived

- [confirmed] The Clerk application must be created by the owner from his own account, and the colleague invited
  (Hobby allows three dashboard seats). The previous provider's project was created by the colleague and the owner
  never got dashboard access; that must not repeat. (pragmatist)
- [confirmed] The branch started from `main` at `09fca46`, which still had the closed site and no password recovery;
  the previous auth branch (`6b374b9`) is merged into `clerk-auth` first - done on 2026-09-25 as `92b1493` - so
  the Clerk work starts from the reopened site. (nitpicker, pragmatist)
- [confirmed] `routing: "hash"` on every mounted component, never `path`: `path` routing needs every sub-path to
  exist as a page, and a static host answers 404 for a step such as `/auth/signin/factor-one/`. (best-practices,
  nitpicker)
- [confirmed] `window.__internal_ClerkUICtor` is a third-party global set by a runtime script and is declared in
  `src/env.d.ts` as possibly undefined, the way the KaTeX global once was; no `any`. (nitpicker)
- [confirmed] One module, `src/scripts/auth.ts`, owns the Clerk instance: `getClerk()` loads the UI bundle,
  constructs, calls `load()` once with the Russian localization and registers the flag listener. Pages never construct
  Clerk. (best-practices)
- [confirmed] `writeAuthFlag` takes the `Date` Clerk reports and converts it to unix seconds inside `auth-flag.ts`, so
  the stored shape and the inline reader in `Base.astro` do not change. (best-practices)
- [confirmed] The publishable key is public by design and lives in `src/config.ts`; a static build needs no secret key
  (`sk_`) and none may ever enter the repository. (security)
- [confirmed] Entitlements, if ever built, go in `publicMetadata` (writable only from the Dashboard or a backend),
  never in `unsafeMetadata` (writable by the user). (security)
- [confirmed] Development instances pass `__clerk_db_jwt` in the query string on cross-origin redirects; with email and
  password on the same origin there should be none, and the harness proves it by logging every URL. (security)
- [confirmed] Clerk weighs about 127 KB gzip (core 82 KB + UI 45 KB, measured 2026-09-25) against about 70 KB of
  JavaScript on the whole site; acceptable only because it is confined to the three auth pages, and the build output
  is checked for it. (performance)
- [confirmed] The harness lists loaded resources and fails on chunks the site does not need: `zxcvbn-common`,
  `base-account-sdk`, `coinbase-wallet-sdk`. (performance)

## Flagged by the interrogator

- [weak] "The Clerk CDN is a supply-chain risk on every page" (security) - downgraded after interrogation: it loads on
  three pages only, the same trust model Disqus and Busuanzi already have site-wide. Owner's decision: accepted.
- [weak] "Development instance limits make the demo useless" (pragmatist) - downgraded: 100 users and the
  "Development" banner are enough for a demo to the client. Owner's decision: accepted; production later, with a club
  domain.
- [contradicts pragmatist] npm packages (typed, bundled) versus CDN script tags (no dependencies) (best-practices) -
  owner's decision: npm, dependencies approved.
- Every "blocks" verdict of the first round was downgraded to "ok" after interrogation.

## Deliberately not done

- `@clerk/astro` and any server output: GitHub Pages runs no server.
- Clerk's hosted Account Portal as the main flow: localization does not reach it (it stays English) and it lives on
  `accounts.dev`; the components are mounted on the site's own pages instead.
- Own comments in a database: the owner decided Disqus stays untouched.
- Paid videos: deferred. VIDEO-PAGE.md 6.1 has to be re-decided (per-user `publicMetadata` versus a per-item service).
  The rule already fixed for either option: a paid entry's `videoId` never appears in front matter or in the built
  HTML; if built on Clerk, the video page loads Clerk only through a runtime-gated dynamic `import()` when the visitor
  is a member and the entry is paid. For now there is only one demo line on `/auth/account/`, shown when
  `publicMetadata.member === true`.
- OAuth providers, organizations, MFA: not asked for.

## Execution route

- Board recommendation: direct-verified (four of five; security said direct) - a compact change with no new server
  contract, but the behaviour has to be proven by a browser run, not by types.
- Owner's decision (2026-09-25): direct-verified confirmed; npm packages approved; paid videos deferred with one
  `publicMetadata` demo line; the merge of the previous auth branch into `clerk-auth` allowed and done;
  the name of the previous provider removed from the branch.
- Verification list: `CLERK.md`, section "Verification".
