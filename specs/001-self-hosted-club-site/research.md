# Research: Self-hosted club site

Phase 0 of the plan. The council's verdict of 2026-10-09 already decided the architecture; this file records the
decisions that the plan had to settle on top of it, each with its rationale and the alternatives left out. Facts about
a library were taken from the documentation servers, and section 13 lists what was checked and what was not. No
`NEEDS CLARIFICATION` remains.

## 1. Migrations

- **Decision**: plain numbered SQL files in `server/migrations/` (`001.do.create-core.sql`, ...), applied by
  postgrator 8.0.0 through a `pg` client and a small runner in `server/src/db/`. Checksum validation stays on.
- **Rationale**: owner's decision of 2026-10-10. Postgrator 8.x declares Node 20 (checked in its registry history
  through the documentation server), so it does not break the frozen stack; its README for 8.0.0 shows a `pg.Client`
  passed in and `migrationPattern`, and it keeps the applied version and an md5 of every file in a schema table, so an
  edited, already-applied migration stops the run.
- **Alternatives**: a 30-line runner of our own (the council's fallback): equal in effect, but we would own the
  checksum and ordering code; a migration DSL or ORM: refused by the verdict.
- **Rules**: one migration per change; a migration is never edited after it ran anywhere; `undo` files only when a
  rollback is safe and never run unattended; the runner is a command, not something the server does at start.

## 2. Rendering and how Astro is mounted

- **Decision**: `output: "server"` with `@astrojs/node` 8.3.4 in `middleware` mode. Express serves `dist/client/`
  as static files, mounts the Astro handler last, and shares one Node process. `export const prerender = true` only on
  pages that show nothing from the database (404, about, search shell, sign-in, sign-up).
- **Rationale**: the adapter documentation for 4.16 says it "can be used either in standalone mode or as middleware
  for other http servers, such as Express", exports a `handler`, and shows `express.static('dist/client/')` followed by
  the handler. Static pre-rendering cannot carry per-viewer visibility (the council's confirmed remark). The 4.16
  on-demand guide documents `prerender` in server mode, and `Astro.locals` is the documented way to hand the
  middleware's result to pages.
- **Data access from pages**: one backend call per page through `src/lib/api-client.ts`. Phase 0 measures in-process
  versus loopback HTTP; if the measurement says so, Express passes the same functions through `locals`. The choice is
  isolated behind the client module.
- **Build**: `astro build` never reads the database; the sitemap becomes an endpoint because `@astrojs/sitemap` cannot
  see on-demand routes; the two feeds and the search index become endpoints.
- **Alternatives**: static pages rebuilt on save (cannot honour per-viewer audiences, and leaves a rebuild lag);
  Astro endpoints as the whole API with Express as a shell (marked as contradicting the owner).

## 3. Markdown at save, and sanitizing

- **Decision**: render when an entry is saved with `createMarkdownProcessor` from `@astrojs/markdown-remark` 5.3.0
  (declared exactly), using the options in one module shared with `astro.config.mjs`. The row keeps the HTML, the
  headings for the table of contents, plain text for search and card summary, and a pipeline version stamp; a stale
  stamp re-renders on read. A sanitizer on the parsed tree runs before KaTeX and Shiki, with the math classes allowed.
  Phase 1 begins with a byte-for-byte comparison against today's build of the same posts.
- **Rationale**: it is the processor Astro itself uses, so KaTeX and Shiki output stay identical (FR-004); the content
  validator was bypassed three ways on 2026-10-09 (`RISKS.md` section 2), so a regular expression cannot be the gate.
- **Alternatives**: render at request time (wasted work per view, no stored summary); a second Markdown library
  (output would drift from the site's); client-side math (the trap recorded in CLAUDE.md).
- **Open detail for phase 1**: `rehype-sanitize` 6.0.0 or an own 15-line plugin; decided by the comparison test and
  the owner's consent for a package.

## 4. Visibility

- **Decision**: every entry row carries an audience (`everyone`, `members`, `restricted`, `hidden`) and a teaser flag;
  restricted entries list their statuses and named accounts in two small tables. One SQL function returns `full`,
  `teaser` or `none` for (viewer, entry). One backend module is the only reader of the entries tables, and a test
  fails on any query elsewhere that selects from them. Invisible means 404 everywhere, never 403.
- **Rationale**: spec FR-008 to FR-011 and constitution III and IV; the council confirmed "one home". The viewer is
  built from the session once per request and passed in; nothing else decides.
- **Surfaces** that must call the module: entry page, lists, tag and category pages, year switcher counts, previous
  and next links, search index, both feeds, the sitemap, comments, card previews, and head metadata.
- **Counts and neighbours**: any number or link derived from entries (a tag's count, previous and next) is computed
  from the visible set for that viewer, so existence is not inferable (FR-010).
- **Alternatives**: row-level security as the home (the council marked it an option, not the design: it hides
  queries inside the database and makes the 404 contract harder to test); visibility in each query (the drift the
  constitution forbids).

## 5. Accounts, sessions and lifetimes

- **Decision**: a table of sessions holds the hash of a 256-bit random id; the browser gets it in a `__Host-` cookie
  (`Secure`, `HttpOnly`, `SameSite=Lax`, path `/`, no domain). A session is renewed on sign-in and on any change of
  the account's rights and is revoked by deleting the row.
- **Login identifier** (clarified): the address is required and unique case-insensitively; a login name is optional,
  3 to 32 characters of `a-z 0-9 . _ -`, stored lower-case, unique, and may not contain `@`. Because a login name can
  never contain `@`, it can never be read as an address, which settles the "looks like an address" edge case by
  construction. Sign-in decides which one it was given by the presence of `@`.
- **Lifetimes** (proposed defaults, one constant each in `src/config.ts` side by side with the status list; owner may
  change):
  - guest, student, expert, master: idle expiry 14 days, absolute 60 days;
  - metr, admin, blocked-then-reinstated sessions: idle 8 hours, absolute 7 days;
  - superuser: idle 1 hour, absolute 12 hours.
    Higher rights get shorter sessions because a stolen session there costs more (research section 7).
- **Session list**: a member sees their sessions (device description from the user agent, created, last seen) and
  ends any of them; ending all others is one action.
- **Redirect after sign-in**: the `nextPath()` rule of today's `auth.ts` moves to the server unchanged: resolve with
  `new URL` against the site origin and accept only same-origin paths.

## 6. Passwords, temporary passwords, re-admission of existing members

- **Decision**: `crypto.scrypt` from Node with N=2^17, r=8, p=1 and a 16-byte salt per password (OWASP parameters);
  `maxmem` raised to fit. The hash string records its parameters so they can be raised later. At most two hashes run
  at once (a counting semaphore), so sign-in bursts cannot exhaust a 2 GB server (about 128 MiB each).
- **Minimum**: 8 characters (owner, 2026-10-09), no composition rules, a maximum of 128 so the cost is bounded; the
  password is compared as given, never truncated, and a list of the most common passwords is refused if the owner
  consents to a small bundled list in phase 2.
- **Temporary password** (FR-042): generated by the server from 80 random bits (changed 2026-10-11 from 128, the owner's choice: 16 characters of Crockford's base32 in four groups, single-use, 30 days, every wrong guess counted), shown once to the administrator who
  issued it, stored as an ordinary password hash with `must_change` set and `expires_at` 30 days ahead. A sign-in
  with it succeeds only far enough to reach the change-password form; every other route answers "change your
  password". Issuing another voids the previous. It never appears in a log.
- **Re-admission of existing members**: a command on the server reads a file the owner exports from the old provider
  (kept outside the repository), creates one guest account per address with no password at all, and records the run
  in the audit log. An account without a password cannot sign in until an administrator issues it a temporary
  password. The command is idempotent: an address that exists is skipped.
- **Who may issue one**: the same actor matrix as a status change (ADMIN.md section 2). A metr may issue one for a
  guest, student, expert, master or blocked account and never for a metr or an admin; an admin may issue one for any
  account but the superuser's; nobody issues one for their own account (they change their password themselves); the
  superuser's password changes only by the server command or a recovery code. The matrix is ported from the statuses
  Worker's 68 cases and extended with the new action; the extension is a test, not a new rule home.

## 7. Statuses and the superuser

- **Decision**: the statuses and who-gives-what rules of ADMIN.md sections 1 and 2 become one plain module, with the
  68 cases of the statuses Worker as its test file. The superuser is one account flagged `is_superuser`, enforced by a
  partial unique index, created only by a command run on the server, untouchable through any API except the two
  paths the owner asked for (handover and recovery code). Its details, threats and mitigations are in
  [security-review-superuser.md](security-review-superuser.md).
- **Rationale**: spec FR-017 to FR-023; the constitution IV already names the three ways the superuser changes hands.
- **Alternatives**: keeping `ADMIN_IDS` in the environment (the old Worker's list): refused, because it would be a
  second home of the rule.

## 8. Cross-site requests and abuse limits

- **Decision**:
  - Every write is JSON only, with `Content-Type: application/json` required and `Origin` checked against the site's
    origin; `Sec-Fetch-Site` must be `same-origin` where the browser sends it. No cookie is sent on cross-site reads
    (`SameSite=Lax`, and reads that matter are GET on the same origin).
  - Limits: per address and per account, kept in memory per address and in the database per account (a failed-count
    and a `locked_until`), so a restart does not forgive a lockout and a lockout is short and backs off (1, 5, 15
    minutes), never permanent; a lockout of an account never blocks its owner's own temporary-password flow.
  - nginx adds a coarse rate and body limit in front of everything (phase 8).
  - Feedback: honeypot field, minimum fill time, size limits, message stored before any mail, and visitor text never
    placed in a header (the mail module takes it only as body text).
- **Rationale**: owasp-docs was unreachable in this session, so these follow the council's text; they are re-checked
  against the OWASP corpus when phase 2 starts (section 13).
- **Alternatives**: `express-rate-limit` (a dependency for what one table and a map do; revisit at phase 2 if the
  owner prefers it); CSRF tokens (not needed with JSON-only, Origin, `Sec-Fetch-Site` and `SameSite`).

## 9. Caching and freshness

- **Decision (2026-10-10, left to the planner by the owner)**: nginx caches guest pages (no session cookie) for **10
  seconds**; the council had fixed 60, which was chosen to bound load on a 2 GB machine and not to meet a rule of the
  spec. The cost is worked out below. Pages for any request that carries a session cookie are `private, no-store`.
  The text that follows was written for 60 seconds; read "60" as the constant, now 10. The search index for guests is built once and kept
  in memory until a content change bumps a version counter; indexes for other audiences are computed per request
  from the same visible set.
- **Consequence**: a post saved by an editor reaches an anonymous visitor within 60 seconds (the editor and any
  signed-in viewer see it at once). Spec scenario 6.1 says "at once"; listed in the plan under Items for the owner.
- **Cost of shortening**: with a 10 second TTL the application renders at most 6 guest pages a minute per distinct
  address; at 100 simultaneous viewers that is well inside one process. The council's 60 seconds was chosen to bound
  the load on a 2 GB machine, not to meet a rule of the spec.
- **Invalidation**: nginx open source has no purge. The plan does not add one; the TTL is the contract.

## 10. Video delivery

- **Decision**: files on a server volume; Express receives every player request, validates the session, the status
  and the entry's visibility, and answers with `X-Accel-Redirect` to an internal nginx location that serves bytes and
  ranges. No signed URLs. In development Express serves the ranges itself.
- **Rationale**: a signed address is a bearer token that outlives a block (FR-025); measured load is about 11
  requests an hour per viewer, up to 360 with heavy seeking, so a check per request is cheap.
- **Upload**: streamed to the volume with the body limit raised for that one route only; a faststart check of the MP4
  (the moov atom before the media data) refuses a file that cannot start playing before it is fully downloaded.
- **Members-only block**: its own column, sent only to viewers with full access under "locked"; one setting switches
  to "hidden" (today's behaviour). The setting is read from the settings table, never from `src/config.ts`.
- **Placeholders**: the 18 public sample videos keep their YouTube ids until an MP4 is registered (FR-027).

## 11. Mail

- **Decision**: outgoing only, through nodemailer 10.0.16 behind one module, sent from a queue table by a worker
  loop, never inside a request. The feedback notice is the first user (phase 7). The sending mailbox and its app
  password stay in the server's environment; the recipient is a setting, seeded from the environment on first start.
- **Rationale**: the council's design; nodemailer's 2025-2026 advisories came from options left at their defaults, so
  the module sets file access, raw messages and address parsing explicitly, read from `nodemailer-docs` when the phase
  starts (that server was unreachable in this session).
- **Open**: which mailbox sends. Recommended in the verdict: the recipient mailbox itself through its provider's SMTP.
  Whether that provider accepts the chosen server is checked in phase 7.
  Changed 2026-10-13: not named by the owner yet; the check (`npm run mail:check`) and the choice's options (MAIL.md)
  are built, and the real run moved to phase 8 with T111, where the real server exists.

## 12. Dependencies, with the owner's consent state

| Package                   | Version             | Purpose                                | Phase | Consent                |
| ------------------------- | ------------------- | -------------------------------------- | ----- | ---------------------- |
| express                   | 5.2.1               | HTTP application                       | 0     | given 2026-10-09       |
| pg                        | 8.23.1              | PostgreSQL driver and pool             | 0     | given                  |
| postgrator                | 8.0.0               | migrations (owner's choice 2026-10-10) | 0     | given                  |
| @astrojs/node             | 8.3.4               | on-demand rendering inside Express     | 1     | given                  |
| @astrojs/markdown-remark  | 5.3.0 exact         | the processor Astro itself uses        | 1     | given                  |
| rehype-sanitize           | 6.0.0 or own plugin | sanitize the parsed tree               | 1     | given                  |
| @types/express, @types/pg | 5.0, 8.23.1         | types, development only                | 0     | given                  |
| nodemailer                | 10.0.16             | outgoing mail                          | 7     | given 2026-10-13       |

Removed over time: `@clerk/*`, `react`, `react-dom` (phase 2), the three Workers (phases 3, 4 and 6), the Disqus
embed and the web3forms call (phase 7). Sizes are taken at install time and reported before each install, as the
repository's rule requires.

## 13. Documentation checked in this session, and what was not

- Checked: postgrator 8.x (Node 20 requirement, `pg` client example, checksum validation); `@astrojs/node` for
  Astro 4.16 (Express middleware mode, `express.static` plus handler); Astro 4.16 on-demand rendering (`prerender`),
  `Astro.locals` and middleware; node-postgres 8.23 (Pool, transactions pattern).
- Not reachable in this session (connection refused): OWASP, nginx, nodemailer, certbot, helmet, express-rate-limit,
  ffmpeg, argon2, Tailwind, Vite, MDN, Linux. The sections that rest on them (5, 8, 10, 11) are marked, and the
  phases that depend on them re-check them first, as the verdict's per-work-item list requires.
- Not applicable: the project's Astro server was not started; no code was changed.

## 14. Deferred on purpose

- Address confirmation and password reset by mail, database full-text search, an optional change of hash to argon2
  (phase 9).
- Server country, registrar and domain (someone else, before phase 8).
- Payments, HLS, translations of the content (the interface is in two languages, section 15), an inbound mail server,
  Disqus history (out of scope).

## 15. Interface languages (added 2026-10-12)

- **Decision**: carry over the current site's mechanism (`klub_biolocation_astro`, branch `refactor-app`, `I18N.md`):
  both languages in every page, the stored choice applied by an inline block before the first paint, one CSS rule
  hiding the other language, every string once in `src/i18n/` as an English and Russian pair. English is the default;
  `<html lang>` stays the content's language, and the spans of the other language carry their own `lang`.
- **Rationale**: the guest cache of section 9 needs one copy of a page per address, and a page with both languages is
  the same for every guest. The switch then needs no request and keeps unsaved form input, which the admin pages need.
  It is built and checked on the current site already, so the rewrite takes a known mechanism instead of a new one.
- **Alternatives considered**: the server renders one language from a cookie (the cache would have to tell the copies
  apart by the cookie, or a switched guest would get the other copy until it expires; every switch becomes a request);
  addresses per language, `/en/...` (the content is not translated, so the same text would sit under two addresses,
  which search engines treat as duplicates); a translation library in the browser (a dependency, and the first paint
  would show the default before the swap).
- **Refusals**: shown by their stable code from the dictionary; the API's `message` stays English.
- **Not decided here**: the language of letters to members and a choice that follows a member across devices (phase
  9). Settled later on 2026-10-12 (owner): no choice follows a member across devices, and the account holds no
  language; only the language of letters is left to phase 9.
