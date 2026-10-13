---
consilium: 2026-10-09
topic: The site becomes a self-hosted application - the Astro 4 frontend stays, an Express backend and PostgreSQL in Docker replace Clerk, Disqus, the Cloudflare Workers and the hosted players
slug: self-hosted-rewrite
verdict: approved-with-conditions
route: speckit
archetypes:
  nitpicker: ok
  security: ok
  performance: ok
  best-practices: ok
  pragmatist: ok
---

# The site as a self-hosted application

## Agreed proposal

The club's site stops depending on outside services for anything a visitor, a member or an administrator does on
it: signing up and signing in, reading posts, watching lectures, writing comments, sending feedback, and running the
site. Everything lives on one server the club controls, around one database that is the single source of truth. The
site looks the same and keeps every address it has today; what changes is where its content comes from.

Posts and the list of videos come from the database. Every post and every video can be visible to everyone, to any
member, to chosen statuses or named people, or to nobody, and that rule holds wherever the entry could surface: its
page, the lists, tags and categories, search, the feeds, the sitemap, the comments, and the card previews. Comments
belong to posts and to videos. One superuser exists who can change every other account; everyone else sees or changes
resources according to their status, under the rules the owner settled on 2026-10-02 (ADMIN.md sections 1 and 2). A
blocked member sees what a guest sees and loses every paid resource. Visitors send feedback and complaints through the
site's own form, which reaches the administrators and resists abuse. Readers in countries where Cloudflare and YouTube
are throttled or blocked must reach the site without a VPN.

Why: sign-in today runs through a provider that sits behind Cloudflare, Cloudflare and YouTube are throttled or
blocked for part of the audience, and the paid-lecture and admin services already run outside the site. The owner
decided on 2026-10-09 to own the whole stack. The site on GitHub Pages keeps running unchanged until the day of the
switch, and the switch costs visitors no downtime.

## Bounds and constraints

- Kept as is: the Astro 4.16 frontend (components, layouts, styles, scripts), every URL with its trailing slash
  (`reference/hugo-routes.txt` is the contract), and the 99.9% visual parity rule. Node 20, Astro 4.x, Tailwind 3.4,
  no upgrades. The Node 20 end-of-life risk is accepted in writing in `RISKS.md` (owner, 2026-10-09).
- The status model and the who-gives-what rules of ADMIN.md 1-2 do not change.
- New dependencies need the owner's consent; given on 2026-10-09 for the list of phases 0 and 1 below.
- Password minimum stays at 8 characters (owner, 2026-10-09; the earlier decision is CLERK.md line 46). OWASP's 15
  without MFA was put to the owner and declined: members would not remember such passwords.
- Stay external by the owner's decision: Yandex Metrika, Google Fonts, the visit counter. The feedback form's
  outside service (web3forms) is expected to be replaced by the site's own form.
- The 18 public sample videos keep their placeholder YouTube ids until the owner has MP4 files; an entry with no file
  keeps today's embed. That is a known, temporary outside dependency.
- Disqus history is dropped (owner, 2026-10-09).
- Out of scope: payments on the site, HLS or transcoding, translations, an inbound mail server.
- Documentation duty as in CLAUDE.md: README, MIGRATION-PLAN, topical files, a session log; every edit carries an
  English comment; existing comments are never removed.
- Work happens on `refactor-app` (main was merged into it on 2026-10-09, commit 8277778). It is not merged into
  `main` before the switch; the commit that turns on the server output also stops that branch deploying to Pages.
  Amended 2026-10-10 by the owner: the rewrite moved to a repository of its own, `klub_biolocation_app`, started with
  a clean history from commit 2b4aac9 of that branch. The original repository stays the live site and is not touched
  by the rewrite; the new one has no Pages deployment, so the deploy workflow is simply removed in phase 0.

## Design decided by the council

- Rendering: `output: "server"` with `@astrojs/node` 8.3.4 in `middleware` mode, mounted inside the Express app (one
  Node process). `export const prerender = true` only on pages that show nothing from the database (404, about, the
  search shell, sign-in and sign-up). `astro build` never reads the database. The point the proposal left to the
  council ("only the data source changes") was inaccurate: the six routes with `getStaticPaths`, both feeds, the
  search index and the header change shape; the sitemap becomes an endpoint of its own, because `@astrojs/sitemap`
  cannot see on-demand routes.
- Backend: Express 5 in `server/`, compiled by `tsc` with its own `tsconfig.json` (NodeNext, emits to
  `server/dist`); the root `tsconfig.json` excludes `server/`. Plain modules with no Astro imports are shared with the
  frontend: `src/config.ts`, `src/content/post-fields.ts`, `src/lib/summary.ts`, `src/lib/post-url.ts`,
  `src/lib/date.ts`, and a new module of Markdown options.
- Data access from pages: one API call per page through a small client module. Phase 0 measures in-process versus
  loopback HTTP; if the measurement says so, Express hands the same functions to Astro through `locals`.
- Markdown: rendered when an entry is saved, by `createMarkdownProcessor` from `@astrojs/markdown-remark` 5.3.0 (the
  processor Astro itself uses, declared at that exact version) with the options of `astro.config.mjs`. The database
  keeps the HTML, the headings for the table of contents, the plain text for search and the card summary, stamped with
  a pipeline version; a stale stamp re-renders on read. Phase 1 starts with a byte-for-byte comparison against
  today's build of the same post.
- XSS: the pipeline no longer passes raw HTML, and `rehype-sanitize` (or a 15-line plugin of our own) runs before
  KaTeX and Shiki, with the math classes allowed. The content validator moves to the API as the first gate, not the
  only one: three bypasses of it were measured on 2026-10-09 (see `RISKS.md`).
- Visibility: one home in the backend. Every entry has an audience (everyone, members, restricted, hidden) and a
  teaser flag; restricted entries list their statuses and named people in one table. One SQL function decides full,
  teaser or none for a viewer; one module is the only reader of the entries tables, and a test fails on any query
  that bypasses it. Invisible means 404 everywhere, never 403. Row-level security is an option, not the design. A new
  post defaults to everyone, as today; the draft checkbox maps to hidden; only imported paid lectures get a teaser.
- Superuser: a flag on one users row, held to at most one by a partial unique index, created only by a command run on
  the server, and untouchable through any API (cannot be demoted, blocked or deleted). It is an admin otherwise. It
  replaces the `ADMIN_IDS` list of the statuses Worker. The owner decided on 2026-10-09 that, as insurance, the role
  must be recoverable and transferable in two independent ways:
  - On the server: a command creates the superuser, sets a new password for it, or hands the role to another
    account.
  - Without the server: (a) handover from the settings page - the superuser re-enters the password and names an
    existing account; that person accepts on their own account page with their own password; the role moves only
    then, every superuser session ends, and the change is logged; (b) one-time recovery codes - ten random codes
    shown once when the superuser is created, stored only as hashes, each usable once, rate-limited; using one sets a
    new password, ends every other session and is logged; the superuser can issue a fresh set (old ones void) after
    re-entering the password. Once phase 9 brings mail to members, a reset mail is added and both events are also
    announced by mail.
  A password is never retrievable - it is stored as a scrypt hash - so every way above sets a new one. This loosens
  the council's "no API can touch it", so the spec gives it its own security review.
- Accounts: passwords hashed with `crypto.scrypt` from Node itself at OWASP's parameters (no native packages);
  sessions in a table, a 256-bit random id in a `__Host-` cookie, only its hash stored, renewed on sign-in and on any
  change of rights; JSON-only writes with an Origin and `Sec-Fetch-Site` check; rate limits per account and per
  address; the post-sign-in redirect repeats the same-site rule of `nextPath()` on the server. A new account is a guest
  until a person gives a status, so sign-up needs no mail at first; an admin can set a temporary password that must be
  changed at the next sign-in.
- Statuses: the status and post rules of the three Workers move as plain modules, with all their test cases (129
  content, 68 statuses, 56 video access) under `node:test`; the Worker copies and their drift tests go.
- Video: files on a server volume. Every request the player makes, every seek included, goes to Express, which checks
  the session, the status and the entry's visibility and answers with `X-Accel-Redirect` to an internal nginx
  location that serves the bytes and the ranges. No signed URLs: a signed address would be a bearer token that
  outlives a block. Measured: about 11 requests an hour per viewer, up to 360 with heavy seeking. In development
  Express serves the ranges itself.
- Comments: one table attached to an entry (post or video); written by the statuses that open the lectures, read by
  whoever may see the entry; shown as text only; hidden or restored by metr and admin.
- Feedback: the form posts to the API; each message is stored and listed on an admin page, and also sent to the
  administrators by email (owner, 2026-10-09: "both"). Abuse controls: rate limits at nginx and in the app, a hidden
  honeypot field and a minimum fill time, size limits, the same Origin check, text only on display, and nothing a
  visitor typed ever placed in a mail header; the message is stored first, so a failed mail loses nothing. The
  recipient is one address the owner gave on 2026-10-09, kept out of this public repository so that it is not
  harvested for spam. The owner then asked for it to be changeable: the product will nominally belong to one person
  who administers all of it alone, so the address is a setting that person changes from the admin panel; the
  server's environment only seeds it on the first start. How such a change is protected is an open question below.
- Mail: outgoing only, through `nodemailer` 10.0.9 or newer behind a small mail module, sent from a queue table rather
  than inside the request. The feedback notice comes with the feedback form (phase 7); address confirmation and
  password reset come later (phase 9), and that first channel to members must confirm the address before it is used.
  No inbound mail server.
- Members-only block of a paid lecture: stored in its own column and sent only to viewers with full access, so it is
  no longer in the HTML of anyone else (owner, 2026-10-09; this replaces option A of 2026-09-28, "hidden, not
  locked"). The owner wants the way back kept open: one setting chooses "locked" (the default) or "hidden" (option A:
  the block is sent to everyone and hidden until the player appears, as today), and switching it changes no other
  code. The tests cover both values. The setting lives on the superuser's settings page, not in `src/config.ts`
  (owner, 2026-10-09), so the owner of the product flips it without a developer.
- Settings page: settings the single administrator changes alone live in a database table edited only by the
  superuser on one admin page - the feedback recipient address and the members-only block switch. A new recipient
  address takes effect only after a code sent to it is entered; the old address is told of the change; the superuser
  re-enters the password before any change; every change is logged (who, when, from what, to what). The sending
  mailbox and its app password stay in the server's environment and are not editable from the site (owner,
  2026-10-09). `src/config.ts` keeps the settings that change with the code; no setting lives in both places.
- Infrastructure: Docker Compose with PostgreSQL 16 (image pinned by digest), the app, and nginx; the app image is
  `node:20.20.2-bookworm-slim` pinned by digest with `apt-get upgrade`, `USER node`, a read-only root, dropped
  capabilities and no published port; guest pages cached by nginx for 60 seconds when no session cookie is present,
  member pages `private, no-store`; backups with `pg_dump -Fc` plus the video volume, with a rehearsed restore. The
  build runs outside the server, so 2 GB of RAM is enough (a build peaks at 1 110 MB, measured 2026-10-09).
- Switch: there is no DNS to switch, because the site lives at `debi7.github.io`. The new site gets its own domain,
  is tested there, and on the day the content is imported one last time and Pages receives a final build whose every
  page redirects to the new address (Astro `redirects` in a static build give a meta refresh). Until that day the
  content master stays in git, and the import is repeatable and rehearsed.

## Migration plan by phase

Days are working days of one developer with an assistant, documentation included. At the owner's 20-25 hours a week
the whole plan is about five to six months. Every phase ends with what the owner runs and looks at.

Each work item names the documentation servers (MCP) to consult while doing it, by their configured names. The corpora
this plan needed were built on 2026-10-10; the next section lists them. Astro is always
searched with version "4", and an excerpt counts only if its versions include 4.16.

0. Skeleton, 3 days.
   - `REWRITE.md` with the decisions above (ports and adapters, the strangler switch): `frontend-architecture-docs`,
     `patterns-docs`.
   - `server/` with its own tsconfig (NodeNext, emitting to `server/dist`), the root tsconfig excluding it:
     `typescript-docs`, `nodejs-docs`.
   - Express app with a health route, the error handler and `trust proxy`: `express-docs`.
   - Database module and pool: `node-postgres-docs`, `postgresql-docs`.
   - Development Compose file with PostgreSQL 16, a health check and a named volume: `docker-docs`,
     `postgres-image-docs` (only if the image's variables are not enough).
   - Migrations and their runner: `postgresql-docs`, `postgrator-docs` (only if postgrator is chosen).
   - Tests with `node:test`, settings with `--env-file`: `nodejs-docs`.
   - The branch's deploy workflow off: `github-actions-docs`.
   - Libraries: express 5.2.1, pg 8.23.1, @types/express 5.0, @types/pg 8.23.1, postgrator 8.0.0 or a 30-line runner of
     our own, @astrojs/node 8.3.4.
   - Owner checks: the database starts, migrations create the tables, the health route answers 200, the tests pass,
     `npm run dev` behaves as before.
1. Posts from the database, 12 days.
   - Entries, posts and named-access tables, the visibility function, indexes: `postgresql-docs`,
     `node-postgres-docs`.
   - Repeatable import of the Markdown files into rows: `nodejs-docs`, `zod-docs`.
   - Markdown rendered at save, with the byte comparison against today's build first: `astro-markdown-pipeline-docs`,
     `astro-docs`.
   - The sanitizer in the pipeline: `astro-markdown-pipeline-docs`, `owasp-docs`.
   - Server output, `@astrojs/node` in middleware mode, `prerender`, Astro middleware and `locals`, endpoints, routes
     without `getStaticPaths`, 404 through `Response`: `astro-docs`.
   - Astro mounted in Express, `dist/client` served as static files: `express-docs`, `astro-docs`.
   - `pg` kept out of the browser bundle (SSR externals): `vite-docs`.
   - Sitemap endpoint, both feeds and the search index on demand: `astro-docs`, `mdn-docs`.
   - Pagination check over HTTP, the in-process versus HTTP measurement: `nodejs-docs`.
   - Libraries: @astrojs/markdown-remark 5.3.0 declared exactly, rehype-sanitize 6.0.0 or our own plugin.
   - Owner checks: the main region of a post, `/posts/`, a tag, the categories, the feed and the search index match
     today's build apart from asset hashes; a formula and a code block render as before; the pagination check passes;
     the build works with the database stopped.
2. Own sign-in, 10 days.
   - Users and sessions tables: `postgresql-docs`, `node-postgres-docs`.
   - Passwords with `crypto.scrypt`: `nodejs-docs`, `owasp-docs`.
   - Session cookie (`__Host-`, renewal on sign-in and on a change of rights, expiry): `owasp-docs`, `mdn-docs`,
     `express-docs`.
   - Cross-site request checks (JSON only, Origin, `Sec-Fetch-Site`): `owasp-docs`, `mdn-docs`.
   - Rate limits and lockout: `owasp-docs`, `express-docs`, `express-rate-limit-docs` (only if that
     package is used).
   - The redirect after sign-in (the `nextPath()` rule on the server): `owasp-docs`, `mdn-docs`.
   - The viewer handed to Astro, the header drawn by the server: `astro-docs`, `express-docs`.
   - Sign-in, sign-up and account pages: `astro-docs`, `tailwind-docs`, `mdn-docs`.
   - Security headers, in nginx or with helmet: `owasp-docs`, `express-docs`, `helmet-docs` (only if helmet is used).
   - Clerk and React removed: `astro-docs`. Reference for comparison only: `auth-docs`.
   - Libraries: none; helmet 8.3.0 only if chosen over nginx headers.
   - Owner checks: a new account is a guest, the header shows the account icon without a flicker, sessions on two
     devices are listed and can be ended, no Clerk chunk remains in the build.
3. Statuses and the superuser, 7 days.
   - Audit table, the status values as a check, the one-superuser partial unique index: `postgresql-docs`.
   - Status rules as a plain module with their 68 cases: `nodejs-docs`.
   - Users API with the authorization matrix of ADMIN.md 2: `express-docs`, `owasp-docs`.
   - Superuser command on the server (create, new password, hand over): `nodejs-docs`.
   - Handover from the settings page, accepted by the other account: `owasp-docs`, `express-docs`.
   - One-time recovery codes (random, stored hashed, used once): `nodejs-docs`, `owasp-docs`.
   - Admin and account pages: `astro-docs`, `tailwind-docs`.
   - Libraries: none.
   - Owner checks: a metr cannot make a metr or an admin, nobody changes their own status, the superuser is protected,
     a blocked member sees only public entries and no paid resource; the role moves only after the other account
     accepts; a recovery code works once and sets a new password.
4. Video from the server, 8 days.
   - Videos and files tables, the members-only block in its own column, its locked or hidden setting:
     `postgresql-docs`.
   - Command that registers files copied to the volume: `nodejs-docs`.
   - Stream route checking session, status and visibility on every request, answering with `X-Accel-Redirect`:
     `express-docs`, `nginx-docs`, `mdn-docs`.
   - Range requests served by Express in development: `express-docs`, `nodejs-docs`, `mdn-docs`.
   - One player component for every video: `mdn-docs`, `astro-docs`, `tailwind-docs`.
   - The faststart check of an uploaded MP4: `nodejs-docs`, or `ffmpeg-docs` only if ffprobe does it.
   - Video feed and search: `astro-docs`.
   - Libraries: none.
   - Owner checks: a lecture plays and seeks; a student plays a paid lecture, a guest sees the placeholder, a blocked
     member is refused on the next seek; the internal location cannot be reached directly.
5. Visibility everywhere, 8 days.
   - Audience, teaser and named access in every list, tag, category, search, feed and sitemap, with query plans
     checked: `postgresql-docs`, `owasp-docs`.
   - Previous and next links, head meta, the locked card: `astro-docs`, `tailwind-docs`.
   - Test matrix of status by audience by teaser: `nodejs-docs`.
   - Libraries: none.
   - Owner checks: a post for one named member appears for that member in the list, search and feed, and for anyone
     else nowhere (404, absent from the search index).
6. Content admin, 10 days.
   - Content rules as a plain module with their 129 cases: `nodejs-docs`, `zod-docs`.
   - Posts and videos API with a conflict answer on concurrent edits: `express-docs`, `postgresql-docs`, `mdn-docs`.
   - Preview through the same Markdown module: `astro-markdown-pipeline-docs`, `astro-docs`.
   - Visibility form (audience, statuses, named people, teaser): `astro-docs`, `tailwind-docs`, `mdn-docs`.
   - File upload streamed to the volume, the body limit raised for that route only: `express-docs`, `nodejs-docs`,
     `nginx-docs`, `owasp-docs`.
   - Libraries: none.
   - Owner checks: a saved post is on the site at once, raw HTML is refused, a 500 MB file uploads and plays, the copy
     button works as today.
7. Comments, feedback and settings, 13-14 days.
   - Comments table, API and moderation: `postgresql-docs`, `express-docs`, `owasp-docs`.
   - Comments component, text only, Disqus removed: `astro-docs`, `tailwind-docs`, `owasp-docs`.
   - Feedback form, its admin page and its abuse controls, web3forms removed: `owasp-docs`, `express-docs`,
     `nginx-docs`, `mdn-docs`, `astro-docs`.
   - Mail module with its queue table and the feedback notice: `nodemailer-docs`, `postgresql-docs`, `owasp-docs`.
   - Settings page: the protected change of the recipient address, the members-only block switch, the change log:
     `owasp-docs`, `express-docs`, `postgresql-docs`, `astro-docs`.
   - Libraries: nodemailer 10.0.16.
   - Owner checks: a guest reads and cannot write, a member writes, a metr hides; a feedback message appears in the
     admin page and in the recipient mailbox; a burst of feedback posts is refused with 429 and nothing is stored; a
     new recipient address works only after its code.
8. Server and switch, 8 days.
   - Production Compose, the app image pinned by digest, non-root, read-only, dropped capabilities, memory limits, log
     rotation: `docker-docs`, `linux-docs`.
   - nginx: TLS, the internal video location, the guest cache, the trailing-slash redirect, rate and body limits:
     `nginx-docs`.
   - Certificates issued and renewed: `certbot-docs`.
   - Firewall and the host system: `linux-docs`.
   - Backups of the database and the video volume, and a restore rehearsal: `postgresql-docs`, `docker-docs`,
     `linux-docs`.
   - The domain, the final import, the redirect build on Pages: `astro-docs`, `github-actions-docs`,
     `postgresql-docs`.
   - Libraries: none (certbot on the host).
   - Owner checks: the site answers over HTTPS on the new domain, a restore from backup works, every old address
     redirects.
9. Deferred, 3-6 days, each item independent.
   - Address confirmation and password reset by mail: `nodemailer-docs`, `owasp-docs`.
   - Full-text search in PostgreSQL, if wanted: `postgresql-docs`.
   - argon2, if ever preferred: `argon2-docs`.

Total: about 80 days for phases 0 to 8, plus the deferred items. The council's own estimates, in one unit, were 57 to
70 before the owner's later additions; the sizing of 2026-10-06 was 95 likely and 58 for a minimal version.

## Documentation corpora for the plan

The docs servers on this machine cover Astro, Express, PostgreSQL, Node.js, OWASP, nginx, Docker, Linux, MDN, Zod,
TypeScript, Vite, Tailwind, patterns and frontend architecture. Built by the owner on 2026-10-10 for this plan, each
needed by the phase named:

- Required: `node-postgres-docs` - node-postgres (`pg` 8.x; node-postgres.com and its repository) before phase 0. The
  PostgreSQL corpus states that drivers are not in it, and pooling, parameters, type parsing and error codes are used
  in every phase.
- Required: `astro-markdown-pipeline-docs` before phase 1 - `@astrojs/markdown-remark` 5.3.0 (README and type
  definitions), unified 11, remark-rehype 11, rehype-sanitize 6 with hast-util-sanitize 5, rehype-katex 7, Shiki 1.x.
  Astro's documentation does not describe the processor, and the order of the plugins decides whether XSS gets
  through.
- Required: `nodemailer-docs` - nodemailer 10.x before phase 7 (the feedback notice). Its 2025-2026 advisories came
  from options left at their defaults (file access, raw messages, address parsing), so the options have to be read,
  not guessed.
- Required: `certbot-docs` - certbot (or acme.sh) before phase 8. The nginx corpus covers TLS settings, not issuing or
  renewing.
- Required if postgrator is chosen over our own runner: `postgrator-docs` before phase 0.
- Conditional: `postgres-image-docs` (the official Docker `postgres` image README, phase 0); `helmet-docs` (helmet 8,
  phase 2, if used); `express-rate-limit-docs` (phase 2, if used; `express-docs` holds only 5.5.1);
  `ffmpeg-docs` (phase 4, only if the faststart check uses ffprobe); `argon2-docs` (only if scrypt is replaced); the
  Alpine.js CSP build (only if the content security policy drops `unsafe-eval`; not built yet).
- Not needed: Caddy (nginx was chosen because it has a corpus), multer, express-session, cookie-parser, Clerk and
  Yandex Disk (both leave).

## Remarks that survived

- [confirmed] Static pre-rendering cannot carry per-viewer visibility; server output from the first content phase
  (all five; the pragmatist withdrew static-first once the branch strategy kept Pages safe).
- [confirmed] Markdown from the database must go through Astro's own processor to keep KaTeX and Shiki output
  identical (performance, best-practices, pragmatist).
- [confirmed] The content validator can be bypassed in three ways; a sanitizer on the parsed tree is required
  (security; reproduced by the coordinator against the real pipeline).
- [confirmed] Visibility has one home and invisible is 404 everywhere (all five).
- [confirmed] Video bytes never pass through Node; nginx serves them after a per-request session check (all five).
- [confirmed] scrypt from Node, own session table, no express-session, no `cookie@2` (it requires Node 22).
- [confirmed] The tests of the three Workers are the specification of the backend; port the cases, drop the copies.
- [confirmed] Node 20 is past end of life (the July 2026 security release skipped it); the owner's rule stands with
  the mitigations above and a signed acceptance.
- [confirmed] There is no DNS switch; a new domain plus a redirecting last build on Pages.
- [confirmed] Counts drift between documents: the statuses check has 68 cases, not 63; 21 video files with 20
  published; 24 posts with 23 published.

## Marked by the examiner

- [contradicts the owner] Putting the API in Astro endpoints with Express as a thin shell (performance). The owner
  decided on an Express backend; the tsconfig problem it answered is solved by `server/tsconfig.json`.
- [contradicts the owner] Running the backend container on a newer Node line (nitpicker). Not proposed.
- [contradicts performance] Pages read the database in process versus through the API: settled by the phase 0
  measurement, one call per page either way.
- [weak, withdrawn] Signed URLs or `secure_link` for video (pragmatist, performance, best-practices).
- [weak, withdrawn] An entry "shell" in public lists for restricted entries (pragmatist).
- [weak, withdrawn] A self-built Node image (security); row-level security as the visibility home (nitpicker,
  security); a "12-character" password decision (security; the decision on record is 8).

## Deliberately not done

- Rebuild-on-save and static pre-rendering of entry pages: cannot honour per-viewer visibility.
- An ORM, a migration DSL, Vitest, argon2 or bcrypt, multer, express-session: each replaced by plain SQL, `node:test`,
  `crypto.scrypt`, a streamed upload and our own session table.
- An inbound mail server; importing Disqus history; HLS.

## Execution route

- Council's recommendation: speckit - a new backend, a database schema, new contracts and a rule that spans every
  page; each requirement above becomes an acceptance criterion.
- Owner's decision, 2026-10-09: speckit, with the Agile Tasks extension.

## Owner's answers, 2026-10-09

- Route speckit and Agile Tasks: yes. Dependencies of phases 0 and 1: agreed.
- Node 20 end of life: accepted in writing with a review date (`RISKS.md`).
- Blocked: sees what a guest sees; a paying member who is blocked loses every paid resource.
- External services kept: Metrika, Google Fonts, the visit counter; the feedback form will most likely be rewritten.
- Domain and server: not chosen yet; readers in the countries where Cloudflare and YouTube are restricted must reach
  the content without a VPN.
- Mail: a feedback and complaints form is needed and must not become an attack vector; see Design, Feedback and Mail.
- MP4 files for the public sample videos: none yet; the placeholder ids stay for now.
- Disqus history: dropped. Password minimum: 8. Time: 20-25 hours a week.
- The XSS in today's admin panel: not fixed now; it must be fixed before the club uses the site if the rewrite does
  not go ahead (`RISKS.md`).
- Later the same day: the members-only block of a paid lecture becomes a real lock (Design); feedback goes both to
  the admin page and by email (Design, Feedback and Mail; phase 7).
- Order of work: the owner first gathers the documentation corpora listed above, then runs `/speckit-constitution`.
- Later still: the real lock stays switchable back to option A by one setting (Design); the feedback recipient
  address is given (kept out of the repository, Design, Feedback).
- Then: the protected change of the recipient address is approved; the sending mailbox stays in the server's
  environment; the members-only block switch moves to the settings page; the superuser is handed over and recovered
  by the server command and also without the server, by handover from the settings page and by recovery codes, as
  insurance (Design, Superuser).

## Open questions

- Which mailbox the site sends from, before phase 7. Recommended: the recipient mailbox itself, through its
  provider's SMTP with an app password kept in the server's environment; an outbound server of our own needs SPF,
  DKIM and a clean address, and is not worth it for a few messages a day. Whether that provider accepts connections
  from the chosen server is checked in phase 7.
- The country of the server and the registrar, chosen with the reachability requirement above, before phase 8. The
  owner said on 2026-10-09 that this is decided later and not by the owner. Phases 0 to 7 run locally in Docker and
  do not depend on it; the mail provider check of phase 7 is the first step that needs the real server.
