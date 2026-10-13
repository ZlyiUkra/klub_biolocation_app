# The self-hosted rewrite

This file is the one place that says what the rewrite decided and why, so that a later session does not have to
re-derive it from the verdict, the plan and the chat. It is a summary: the sources stay authoritative.

- Verdict of the council: `.specify/consilium/2026-10-09-self-hosted-rewrite.md`.
- Principles: `.specify/memory/constitution.md` (1.0.1).
- Feature: `specs/001-self-hosted-club-site/` - `spec.md`, `plan.md`, `research.md`, `data-model.md`,
  `contracts/http-api.md`, `security-review-superuser.md`, `quickstart.md`, `tasks.md`, `agile-tasks.md`.
- Accepted risks: `RISKS.md`.
- The repository's own working rules: `CLAUDE.md`.

## What the rewrite is

The club's site stops depending on outside services for anything a visitor, a member or an administrator does on it.
Everything lives on one server the club controls, around one PostgreSQL database that is the single source of truth.
The Astro 4.16 frontend stays; an Express 5 backend and PostgreSQL in Docker, behind nginx, replace Clerk, Disqus,
the three Cloudflare Workers and the hosted players. The site looks the same and keeps every address it has today.

## Decisions that bind every later task

### Stack and process

- Node 20, Astro 4.x and Tailwind 3.4 do not change, and an upgrade is not proposed. The Node 20 end of life is an
  accepted, dated risk (`RISKS.md` section 1, review 2027-04-09).
- One Node process: Express serves `dist/client`, handles `/api/` and `/media/`, and hands everything else to the
  Astro handler (`@astrojs/node` in `middleware` mode). Node's port is never published; nginx is in front.
- `server/` is a second TypeScript project with its own `tsconfig.json` (NodeNext, emits to `server/dist`); the root
  `tsconfig.json` excludes it. Only plain modules with no Astro imports are shared between `server/` and `src/`.
- `astro build` never reads the database. Pages that show nothing from it are pre-rendered; the rest render on demand.
- Migrations are numbered SQL files applied by postgrator 8.0.0 (owner's choice, 2026-10-10). A migration is never
  edited after it has run anywhere, and the runner is a command, never something the server does at start.
- A new dependency is installed only after the owner has been told its purpose and size and has agreed.

### Ports and adapters

The backend follows the ports-and-adapters shape of Cockburn's hexagonal architecture: the application's rules are the
core, and everything that talks to the outside world is an adapter on a port. In his terms the adapters that tell the
application to do something are the primary (driving) ones, and the ones the application tells to do something are the
secondary (driven) ones.

- Primary adapters: the HTTP routes, the Astro page handler, and the commands run on the server (`server/src/cli/`).
- Secondary adapters: the PostgreSQL access in `server/src/db/`, the mail module, and the video volume reader.
- The core is plain modules with no framework imports, so the same rule runs under the API, under the pages and under
  `node:test`: the status rules, the content rules, the visibility function's caller, and the Markdown options.

### One home for every rule (constitution III)

- Who may see an entry: the SQL function `entry_view` and the one module that reads the entries tables
  (`server/src/access/`). Invisible means 404 on every surface, never 403.
- Who may do what to an account: the one status-rules module, ported with all 68 cases of the statuses Worker.
- What a post or video may contain: the one content-rules module, ported with all 129 cases of the content Worker.
- How Markdown is rendered: `src/markdown/options.ts`, used by `astro.config.mjs` and by the save-time renderer.
- An entry's address: `postUrl()` and `videoUrl()` only.
- Site settings that change with the code: `src/config.ts`. Settings the owner changes alone: the settings table, edited
  only by the superuser's page. No setting lives in both.
- A browser script never imports a module that reaches the database; the check is a look at `dist/client`.

### Accounts, statuses, the superuser

- Statuses: guest, student, expert, master, metr, admin, blocked (ADMIN.md sections 1 and 2). A new account is a
  guest; nobody gives guest; every status except guest and blocked opens the paid lectures.
- Sign-in by address or login name; the address is required and unique without regard to letter case; a login name
  never contains `@`. Passwords are `crypto.scrypt` hashes; the minimum is 8 characters. Sessions are server-side,
  behind a `__Host-` cookie, with only the hash of the id stored.
- Accounts are never deleted; they are blocked. Existing members of the old provider become guests with a temporary
  password from an administrator, valid 30 days and changed at the next sign-in.
- Exactly one superuser, held by the repository's owner. It changes hands only by the server command, by a handover
  that the receiving admin accepts (with a 24-hour wait and an instant cancel), or by a one-time recovery code
  (`specs/001-self-hosted-club-site/security-review-superuser.md`).

### Dependencies added by the rewrite (owner, 2026-10-10)

The owner's rule: every package is a cornerstone the day Astro or Node moves, so each one is declared with a reason and
a condition under which it leaves. Direct dependencies the rewrite added, all pinned exactly:

- `express` 5.2.1, `pg` 8.23.1, `postgrator` 8.0.0 (and the types): the backend, its database access and its
  migrations. They stay for the life of the backend.
- `@astrojs/node` 8.3.4: the adapter that mounts Astro inside Express. Stays while Astro 4 renders pages.
- `@astrojs/markdown-remark` 5.3.0: the Markdown processor Astro itself uses, now a direct dependency because the
  backend renders with it. Moves with Astro.
- `gray-matter` 4.0.3: parses the front matter of source files for the content import only. Last release 2021, and
  it runs JavaScript front matter by default (the importer refuses that). **Leaves after the switch day** with the
  importer: task T135.

### Visual identity (owner, 2026-10-10)

- The rewritten site must look and read exactly like the current one (spec FR-003, FR-004, SC-002). This is a
  condition of accepting every phase that changes what a page shows, not a goal that is checked once at the end.
- A temporary workaround is allowed only with a task that removes it. The one in force: the byte reference of a post's
  body is a snapshot of today's static build (`server/test/fixtures/render/`, captured by
  `scripts/capture-render-reference.mjs`), because from T032 the posts are no longer built statically. It covers the
  body of a post, and nothing else. The owner accepted it on 2026-10-10 with the two tasks that cover the rest:
  T133 (markup of every page type against a build of the old repository at `2b4aac9`) and T134 (screenshots, light
  and dark, residuals recorded). T041, the owner's check of phase 1, is not done without both.
- If a post changes after the snapshot, the test says so (the source's SHA-256 no longer matches); the new reference is
  captured from a build of the old repository, never made up.

### Delivery

- Lecture files live on a server volume. Every player request, every seek included, goes to Express, which checks the
  session, the status and the entry's visibility and answers with `X-Accel-Redirect`; nginx serves the bytes.
- Guest pages are cached by nginx for 10 seconds when no session cookie is present (the council had 60; the owner left
  it to the planner). Pages for a request with a session cookie are `private, no-store`.
- The old site on GitHub Pages is not changed by the rewrite. On the switch day the last build of it redirects every
  page to the new domain. It is a single cutover, not a strangler migration route by route.

- Video bytes stay out of the database (owner, 2026-10-12, T165): files live on the video volume and the big lectures with
  their host; the measurement and the reasons are in `specs/001-self-hosted-club-site/video-in-database-report.md`.

### Interface languages (owner, 2026-10-12)

- The interface is in English, the default, and in Russian, switched beside the menu and remembered; the content is
  not translated (spec User Story 11, FR-043 to FR-046; constitution II 1.1.0). The current site got it that day
  (`klub_biolocation_astro`, `refactor-app`, `I18N.md`); the rewrite carries it over at the start of plan phase 6
  (T176 to T182), and from then on no interface string is a literal in a page or a script.

## Phases

0 skeleton, 1 posts from the database, 2 own sign-in, 3 statuses and the superuser, 4 video from the server,
5 visibility everywhere, 6 content admin (starting with the interface languages), 7 comments, feedback and settings,
8 server and switch; 9 is deferred. The
task list is `specs/001-self-hosted-club-site/tasks.md`; each phase ends with a task the owner passes. The tracker page
is the artifact `https://claude.ai/artifact/SuGhgPp6cfPA1dbUBVTPqg`.

## Open points

- The country of the server and the registrar, and the new domain: decided later by someone else, before phase 8.
- Which mailbox the site sends from: before phase 7.
  Changed 2026-10-13: nobody could name the club's mailbox, so it is not chosen; the check and the options are built
  (`MAIL.md`, `npm run mail:check`) and the choice moved with T111 to plan phase 8, where the real server exists.
- Whether a package replaces the own rate limiter, and whether `rehype-sanitize` or an own plugin: decided with the
  owner in phases 2 and 1.

## Session log

### 2026-10-10

- The specification, clarifications, plan, tasks and the agile breakdown of feature 001 were written and committed
  (4ee2ec2 to 9ab884b). The owner's decisions of the day: guest cache of 10 seconds, handover target must be an admin,
  24-hour handover wait with instant cancel, the proposed session lifetimes, the superuser is the repository's owner,
  sign-in by address or login, 1 000 members and 100 simultaneous viewers, accounts are blocked and never deleted,
  temporary passwords valid 30 days, postgrator 8.0.0.
- Phase 0 started: this file (T001), `server/tsconfig.json` and the root `tsconfig.json` exclusion (T002),
  `.env.example` and the ignore entries (T003). T004, the install of the first packages, waited for the owner's word
  and was given the same day.
- Phase 0 built: the five packages (T004: express 5.2.1, pg 8.23.1, postgrator 8.0.0, @types/express 5.0.0,
  @types/pg 8.23.1, all pinned exactly), `compose.dev.yml` (T005), the deploy workflow of the old repository removed
  from this repository (T006), the npm scripts (T007), the configuration, pool, health check, migration runner and
  baseline migration (T008-T010), the error shape and handler, the cross-site guard, the Express app with
  `GET /healthz`, and the entry point with a clean shutdown (T011-T013), and 18 tests under `node:test` (T014).
- The deploy workflow (`.github/workflows/deploy.yml`) was deleted from this repository with `git rm` (T006): the new
  repository has no Pages deployment and no remote. The old repository keeps its own copy and keeps publishing the
  live site; this repository's history holds the file in the first commit.
- The development database image is `postgres:16-bookworm` pinned by the digest the Docker Hub registry returned on
  2026-10-10 for that tag (the multi-platform index), so a rebuilt machine gets the same bytes.
- Measured with `npm run measure:ssr` on 2026-10-10 (Node 20.19.0, one 24-row list, 300 iterations each, same pool):
  in process median 0.84 ms and p95 1.26 ms; through loopback HTTP median 1.82 ms and p95 3.06 ms; the difference is
  about 1 ms median and 1.8 ms at p95. Decision: pages call the backend through `src/lib/api-client.ts` over HTTP
  (task T031), which keeps the boundary clean and costs about a millisecond a page against a 2 second target; passing
  the same functions through `locals` stays possible behind that one module. This measures data access only: Astro's
  own rendering is the same in both options and the site is not rendered on demand until phase 1.
- Observed while working: Windows refused to bind `localhost:4387` to Astro's dev server ("EACCES ... ::1:4387"), a
  port reserved by the system on this machine since the Docker update; the dev server was run on 4731 and stopped by
  process id. `npm run dev` itself is unchanged and starts on its usual port.
- `npm run fix` (`prettier --write .`) is not used: it rewrites the spec-kit skills and templates. The spec-kit files
  are now listed in `.prettierignore` at the owner's request, so `prettier --check .` no longer flags them.
- Owner check T017 passed on 2026-10-10 (from the owner's screenshots): the database container running, `npm run db:migrate` reporting the database up to date, `npm run test:server` with 18 tests and 0 failures, `/healthz` answering `{"ok":false}` with the database stopped (status 503) and `{"ok":true}` with it running. Phase 0 is done; phase 1, posts from the database, starts next.
- Documentation read for these steps: frontend-architecture-docs (Cockburn's ports and adapters), typescript-docs
  (`module` and `moduleResolution` `nodenext` must agree, TypeScript 5.2 and later), nodejs-docs (`--env-file`, added
  in Node v20.6.0, the environment takes precedence over the file), postgrator-docs (8.0.0: a `pg` client through
  `execQuery`, checksums on by default, Node 20), postgres-image-docs (data volume at `/var/lib/postgresql/data`,
  `shm_size`), docker-docs (`depends_on` with `service_healthy`, `healthcheck`), express-docs 5.x (async handlers
  reach the four-argument error handler, `trust proxy`), node-postgres-docs (Pool and the transaction pattern).
- Not connected in this session and therefore not consulted: owasp-docs and mdn-docs for the header semantics of
  `server/src/http/guards.ts`. They are named as a re-check for phase 2.

- Phase 1 started (T018): `server/test/render.test.ts` is written and red on purpose, until T026. The reference is the
  body of each post as today's static build publishes it (23 posts, the draft is not built), captured by
  `scripts/capture-render-reference.mjs` into `server/test/fixtures/render/` with the SHA-256 of each source file;
  it has to be captured while `output` is still "static", because from T032 the posts are not in `dist/`.
  `server/src/content/render.ts` is a placeholder that fixes the contract of T026. Finding for T021: in
  `@astrojs/markdown-remark` 5.3.0 Shiki runs before the user's rehype plugins and `rehype-raw` runs after them, so a
  sanitizer given as a rehype plugin would see Shiki's output and could not run "before KaTeX and Shiki"; an own
  remark plugin that drops raw HTML nodes and unsafe link schemes runs earlier and needs no package. Decided at T021
  with the owner.
- T019: `server/test/import.test.ts` is written and red until T022 (tables) and T028 (importer): rows from a small
  temporary set of sources, a second run that changes nothing, a changed source that updates in place, and the real
  folders counted. `server/src/cli/import-content.ts` is a placeholder that fixes `importContent(pool, sources)`.
  The boundary test of T024 must look at `server/src` only: these tests select from the content tables to assert.
- T020: `server/test/future-date.test.ts` is written and red until T022 and T024: a future-dated post and video are
  absent for a guest and for an admin from the lists (which feeds and the sitemap are built from), term counts, the
  search index and the entry itself, and appear when the date passes. `server/src/access/entries.ts` is a
  placeholder that fixes `listEntries`, `listTerms`, `searchIndex` and `getEntry`, each taking a viewer. The test
  inserts rows with the columns of data-model.md; T022 must make every other column nullable or defaulted, or the
  test's inserts are the place to follow it.
  The tests-first block of phase 1 (T018-T020) is complete; T021 asks the owner's consent for the packages.
- T021: the owner agreed on 2026-10-10 to `@astrojs/node` 8.3.4 and `@astrojs/markdown-remark` 5.3.0 (both exact, now
  direct dependencies) and chose the sanitizer: an own remark plugin, `src/markdown/remark-no-raw-html.ts`, not
  `rehype-sanitize`. It is not a package and is not published; it is read by `astro.config.mjs` and by the renderer
  through `src/markdown/options.ts` (T025). Its reasons and limits are in the header of the file, its tests in
  `server/test/remark-no-raw-html.test.ts` (5 cases, green), loaded under plain Node by transpiling the file with
  the project's TypeScript, as `scripts/check-content-admin.mjs` does.
- T022: migration `002.do.entries-posts-videos.sql` applied to the development database: `entries`, `posts`, `videos`,
  `entry_audience_statuses`, `entry_audience_users` with their indexes. Beyond data-model.md: composite foreign keys
  tie a posts row to an entry of kind post and a videos row to kind video; the save token `updated_at` is moved by
  triggers on the entry row and on its posts/videos row; a paid lecture may carry no `external_id` and a public one
  needs it unless a file has taken its place (the rules of `src/content/config.ts`); a post is never named after a
  year. `created_by` and `entry_audience_users.user_id` have no foreign key until the accounts table exists (plan
  phase 2 adds both). The statuses are a literal in the check until the status rules module exists; the test that
  proves the two agree comes with it. `server/test/schema-content.test.ts` holds these rules.
- T023: migration `003.do.entry-view.sql` applied: the SQL function `entry_view(viewer_id, viewer_status, entry_id)`,
  STABLE, returning `full`, `teaser` or `none`. In this phase it decides deletion, a future date, `hidden` and
  `everyone`; any audience it does not know yet (`members`, `restricted`) answers `none`, so it fails closed until
  the migration that adds those branches replaces it (`create or replace function`) and changes the interim cases
  of `server/test/entry-view.test.ts`. The viewer arguments are accepted now and not read yet.
- T024: `server/src/access/entries.ts` is the one reader of `entries`, `posts` and `videos`: one query builds the visible
  set for a viewer through `entry_view`, and `listEntries`, `listTerms`, `searchIndex` and `getEntry` are derived from
  it, so no surface can disagree with another. `server/test/access-boundary.test.ts` fails when any other file under
  `server/src` or `scripts` selects from a content table (writes are not flagged; a writer uses `insert ... on
conflict` and does not read). The future-date test of T020 is green with it.
- T025: the shared plain modules (`src/lib/date.ts`, `summary.ts`, `post-url.ts`, `src/content/post-fields.ts`,
  `src/markdown/*.ts`) are read by the backend from where they are. The owner chose to move `rootDir` of
  `server/tsconfig.json` to the repository root (variant A) rather than move or copy files; the compiled output is one
  level deeper: `server/dist/server/src`, `server/dist/server/test`, shared files at `server/dist/src`. The npm
  scripts, `scripts/measure-ssr.mjs`, `MIGRATIONS_DIR` and the tests' relative paths were updated; `server/test/
shared.test.ts` fails if a shared module imports from Astro. `src/markdown/options.ts` holds the math and
  highlighter options and `astro.config.mjs` spreads it; the sanitizer is not in it, because the video entries'
  members-only block is raw HTML until phase 4 (the backend puts the sanitizer in front itself). Proof of no change:
  after the move `npm run build` was run and the 23 post bodies were captured again; they are byte-identical to the
  reference of T018.
- T026: `server/src/content/render.ts` renders a body with the same `createMarkdownProcessor` and the options of
  `src/markdown/options.ts`, with `remarkNoRawHtml` in front, and returns the HTML, the headings, the plain text and
  the summary (both by the rules of `src/lib/summary.ts`) and `renderVersion`. All 23 posts equal the reference
  byte for byte and the sanitizer cases pass (30 tests). Correction to T018's reference: it first included the
  route's separator and the comments widget that follow the Markdown inside the same div; the capture script now cuts
  them, so the reference is the post's own text only. The stamp is an integer, `renderVersion` in options.ts, and
  `server/test/render-version.test.ts` fails until it is raised when a package of the pipeline, the options or the
  sanitizer changes.
- T027: `server/src/content/validate.ts` is the first gate: the address and front matter rules of the content Worker
  (`saveProblems`) as `frontMatterProblems`, with the Worker's codes and limits, returning a list of `{field, code}`.
  The body's rules and the 129 cases come with T094. The Worker stays the rule's home until the panel is retired in
  phase 6; `scripts/check-content-admin.mjs` compares them while both exist. The sanitizer is the second gate and
  does not depend on this one.
- T028: `npm run import:content` (`server/src/cli/import-content*.ts`) imports the posts and videos in one
  transaction, idempotently, through the database functions `store_post` and `store_video` (migration 004), so that
  the importer never reads the content tables. A re-import updates content and moves an entry between `hidden` and
  `everyone` only when the source's `draft` flag moved; any other audience chosen later is kept; nothing is deleted.
  A paid lecture is `everyone` + `paid` + `teaser`, as today's site shows it, and its members-only block is cut out
  before rendering into its own columns (otherwise the sanitizer would have left its text in the public
  description). To share the rules with the site the video schema moved to `src/content/video-fields.ts` and the
  block pattern to `src/lib/members-only.ts`, both unchanged. `gray-matter` 4.0.3 is used for the front matter; it is
  already installed through Astro and the repository's scripts, and is not yet declared in `package.json`: the
  owner's word is needed for that line.
- gray-matter 4.0.3 (the importer's front matter parser) runs JavaScript front matter with `eval` by default; its
  README says JSON, YAML and JavaScript are all handled by default, and `lib/engines.js` shows the `eval`. The importer
  replaces the two names that select that engine so such a file is refused, and a test proves it. The package's
  README and source in `node_modules` were read for this; no documentation server exists for it.
- T029: `npm run check:render` (`scripts/check-render.mjs`) is the byte comparison of T018 as a command: one line
  per post, the position and surroundings of the first difference, and a stale-reference notice when a source
  changed after the capture. First run: 23 posts, 23 identical. Platforms: the site uses YouTube only today, and
  the schema already accepts `youtube`, `vk`, `rutube` and `file` (owner, 2026-10-10: other sources may come).
- Found while preparing T030 and fixed in migration `005.do.entry-fields.sql`: the first tables and the importer left
  out fields the pages read - `entries.description`, `posts.lastmod`, `share_title`, `share_description` and
  `videos.duration`. They are stored now (`data-model.md` has them), the storing functions carry them, and a
  re-import reported the existing rows as updated once. The planned migration names after it moved by two: users
  and sessions are now 006, the superuser 007, video files 008, the audience branches 009, comments 010, feedback 011.
  (Later the same day video sources took 006 and the rest moved by one: users and sessions 007, the superuser 008,
  video files 009, the audience branches 010, comments 011, feedback 012.)
- Yandex Disk lectures: their links are not in the repository by design (they live in the video-access Worker's secret
  map), so the importer cannot see them. SUPERSEDED the same day by the owner's decisions below.
- Lectures stay with their host (owner, 2026-10-10: the planned server is small and has no room for video files).
  `lecture-part-3` stays on Yandex Disk; the server only asks Yandex for a short-lived address after the membership
  check and the browser takes the file from there. Hosts are providers behind one interface, one file each (T137):
  youtube, vk, rutube, yandex-disk and file (the server's volume, small files only, with a free-space rule, T138).
  T083 no longer removes the Yandex handling; it moves into the adapter. The sources are in the database already
  (T136, migration 006): `video_sources` holds the three entries of the old `videos.local.json` (two YouTube demo
  ids, one Yandex Disk link), imported by `npm run import:video-sources -- <file>`; no API answer carries them
  (tested). Closed the same day: the owner has no Cloudflare account for this product and never deployed the
  access service, so the local file was the only copy of the map and the three entries are all there is. The mention
  of a Cloudflare secret above describes the old plan (CLOUDFLARE.md), not something that was ever set up.
- T030: `server/src/content/api.ts` serves `GET /api/posts`, `/api/posts/:slug`, `/api/videos`, `/api/videos/:slug`,
  `/api/terms` and `/api/search-index` over the access module, mounted in `createApp`. Two deliberate departures from the
  task text, recorded in `contracts/http-api.md`: lists are not cut into pages on the server (the cutting by year and page is
  the site's `src/lib/lists.ts` rule and stays its only home; a list is all the visible cards, newest first), and entries are
  addressed by slug (only `postUrl()` and `videoUrl()` know a page address). The order of every list moved to
  `src/lib/entry-order.ts`, used by `published()` and by the access module, so the site and the API cannot order
  ties differently (`check:pages` still passes on the rebuilt site). The guest search index is cached by a version
  derived from the data (`contentVersion`: newest save token, entry count, visible count), so no write path has to bump
  a counter and a date that passes invalidates it; T089's "version counter bump on every content write" is satisfied
  by construction. Until sessions exist every request is a guest (`viewerOf`). 87 server tests pass.
- T031: `src/lib/api-client.ts` is the site's one door to the backend: `listPosts`, `listVideos`, `getPost`, `getVideo`,
  `listTerms`, `getSearchIndex`, one call per page, over the loopback address (the T015 choice stays behind the
  module's `request` function). A missing or hidden entry is `null`, any other failure throws `ApiError`, a call gives
  up after five seconds, and the visitor's Cookie header can be passed on for phase 2. The backend's answers are typed
  by `src/content/api-types.ts`, imported by both the site's client and `server/src/content/api.ts`. The origin is
  `BACKEND_ORIGIN` or the loopback address of `PORT` (named in `.env.example`, optional). 96 server tests pass,
  `astro check` 0 errors.
- T032: `astro.config.mjs` has `output: "server"` and `@astrojs/node` in `middleware` mode. Every page and endpoint of
  `src/pages` carries `export const prerender = true`, so the build is unchanged until T034 and T035 convert them one by
  one: the 457 files of the build before and `dist/client` after are byte-identical (compared by SHA-256), 150 pages.
  The comparison found one silent loss on its first run: the home page had no carousel, because
  `Carousel.astro` located its folder relative to its own file and, bundled into `dist/server/chunks`, the file had
  moved; it finds the folder from the working directory now (public/, then dist/client/). `npm run build` writes
  `dist/client` (pages and assets) and `dist/server` (the entry and the handler), so `check:pages` and
  `capture-render-reference` read `dist/client`. `astro preview` serves nothing in middleware mode, which is why
  `check:auth` cannot run until T036 gives it a server. `check:pages` passes, `check:content-admin` 129/129, `astro
check` 0 errors, 96 server tests pass.
- Parity inventory (2026-10-10, the owner asked that nothing of the old application be lost):
  `specs/001-self-hosted-club-site/parity-inventory.md` lists 123 features of the old site against the tasks and found 21
  gaps, now tasks T139 to T159 with a priority each. Two are owner decisions of the same day: a guest who sees a paid
  lecture as a teaser also reads its comments, to see what is going on and be encouraged to buy (T151); and the
  paid-access record `member`/`memberUntil` is kept and must be applied, its rule to be designed with the owner before it
  is built (T152). The first gap, T141 (the carousel), was already fixed in T032.
- T033: `src/middleware.ts` puts `viewer` into `Astro.locals` before any page runs, typed in `src/env.d.ts`
  (`App.Locals`); it is a guest today and reads nothing from the request, so prerendered pages are not affected.
  The viewer type and `guestViewer()` are in `src/lib/viewer.ts`, imported by the backend's access module and API,
  so there is one definition of who a visitor is. The built site is byte-identical to the build before (457 files);
  97 server tests, `astro check` 0 errors.
- Owner's rule (2026-10-10): migrating existing data is part of every migration that changes a table, and a
  postponed one is never forgotten. Recorded in the "Data migrations" paragraph of tasks.md's strategy, as T160 (the
  source of a video moves to one home, `video_sources`; before T137, T080, T082) and as a `todo` test that states
  the end state and shows on every `npm run test:server`. Why it came up: the owner opened `videos` in Beekeeper and
  saw `youtube` and an empty id for a lecture that is on Yandex Disk, because its source is in `video_sources`.
- T139 (gap G1): `video/[slug]`, `tags/` and `categories/` take their data from the backend through `api-client.ts`.
  The video page needed the headings of a video's public text, which were not stored: migration `007.do.video-headings.sql`
  adds `videos.headings` and `store_video` carries it (the importer fills it; the existing 21 rows had none to fill, no
  video has a heading in its public text). The numbers of the later migrations moved by one again: users and sessions
  008, the superuser 009, video files 010, the audience branches 011, comments 012, feedback 013 (the comment of the
  applied migration 006 still says "migration 009" for video files; an applied file is not edited). `VideoLayout.astro`
  takes plain data (`VideoPageData`, `NavLink`) and not a collection entry; `src/lib/terms.ts` builds the terms from the
  API's cards (so a hidden entry's tag cannot appear), through `apiPostCard()` and `apiVideoCard()` in the files that
  know a post and a video. Proof: with the backend running, the built site is byte-identical to the build before for
  every page except the 27 video pages, which differ in one thing only, the order of two import statements inside the
  hoisted script (same bytes, same behaviour). IMPORTANT until T034: `npm run build` now needs the backend and the
  database running (`npm run server:dev`), because these pages are still prerendered from the backend's answers; T034
  makes them on-demand and the build works with the database stopped again (T041).
- T140 (gap G2): the search page is rendered on demand, so its Section, Category and Tag lists come from the backend
  for the viewer of the request (the Cookie header is passed on for phase 2) and no longer from the build. Proved with a
  scratch server that serves `dist/client` and the Astro handler: the page it renders is byte-identical to the
  prerendered one of the build before (36056 bytes). The measurement of the `/search/data.json` address on the new
  server moved to T035 and T036, where the endpoint becomes on demand and a server exists. Until T036 the built
  `dist/client` has no `/search/` file, by design.
- T034: the post, the video, the lists of posts, videos, tags and categories, the tags and categories indexes and the
  home page are rendered on demand from the backend; `getStaticPaths()` and the `prerender` lines are gone from them.
  `Post.astro` takes plain data (`PostPageData`) like `VideoLayout.astro`; the reading time is computed by the backend
  from the stored text by the same rule (`src/lib/reading-time.ts`). Found while doing it: (1) the address
  /posts/2025/ also matches the single post route, which the router prefers to the rest route, so `src/middleware.ts`
  passes a year address to the list route under the alias of its first page, and `src/lib/request-path.ts` keeps the
  alias out of the canonical link, og:url and the menu; (2) `Astro.rewrite("/404")` fails with a 500 when the 404 page is
  prerendered, so the 404 page is on demand. Proof: with the backend running and the built server answering, all 149
  pages of the build before come back byte for byte the same (the name of one hashed script is normalised), every
  missing, hidden or year-less address answers 404 with the 404 page, and `npm run build` works with the backend and the
  database stopped. Known and expected until their tasks: the built `dist/client` has no post, list or video pages and
  its sitemap lists the static pages only (T035 builds it on demand); `npm run check:pages` has nothing to read (T038
  reads the running server); the feeds and `search/data.json` are still built from the files (T035).
- T035: `/rss.xml`, `/video/rss.xml`, `/search/data.json` and the sitemap are rendered on demand from the backend, for the
  viewer of the request. The search index endpoint is one call to `/api/search-index`, which now carries date, tags,
  categories and summary besides the plain text (a video's text is plainified on the way out, as the build did).
  `@astrojs/sitemap` is removed from the dependencies with the owner's word; the sitemap is `src/lib/sitemap.ts` plus two
  endpoints at the old addresses, keeping the old filter (no `/page/<n>/`, `/auth/`, `/admin/`). Measured on the built
  server: an on-demand endpoint answers 404 at `/rss.xml` and 200 at `/rss.xml/` under `trailingSlash: "always"`, the
  dev server's rule that is the production one now, so `src/middleware.ts` passes a path with a file extension on with
  a slash added. Compared with the build before: the three feeds and the index are identical; the sitemap has the same 119
  addresses in a different order (the old order is the package's, not alphabetical by address, and means nothing). All 149
  pages still come back byte for byte the same. The CLAUDE.md pitfall about dev-only slash behaviour is no longer only
  dev: it applies to the built server.
- T036: the backend serves the site. `server/src/http/site.ts` loads `dist/server/entry.mjs` (the Astro handler) and
  `dist/client` when they exist and mounts them after the API: `express.static` first (hashed `/_astro/` files are
  immutable for a year, the rest revalidate), then the handler, called without `next` so an unknown address gets the
  site's own 404 page. Without a build the server starts and says it serves the API only. `npm run dev:site` builds
  and starts it. Proof on the one process at port 3000: all 149 pages of the build before, `/rss.xml`,
  `/video/rss.xml`, `/search/data.json` and `/sitemap-index.xml` come back byte for byte; `/api/*` is JSON; an unknown
  address is the HTML 404. A POST to a page is rendered like a GET (Astro's default; no page has a form handler).
  `check:auth` and the other scripts that spawned `astro preview` now need this server (T153). 102 server tests.
- T037: `npm run check:bundles` (`scripts/check-bundles.mjs`, no dependency) scans every text file of `dist/client` for
  12 markers of the database client and the content runtime and for a 40-character canary from the body of each of the 45
  source entries (posts, videos, drafts, hidden ones, members-only blocks); `--self-test` proves it fires on a planted
  leak and a planted marker. Clean on the current build: 308 files, 6.3 MB. The about page is not scanned for its own text
  (built as a file, on purpose). Run it after `npm run build`; T126 and the final checks should keep it.
- T038: `scripts/check-pagination.mjs` reads the pages from the running site over HTTP (`CHECK_ORIGIN`, default
  http://127.0.0.1:3000) instead of from `dist/client`, fetching in rounds until a round asks for nothing new (the
  checks are synchronous and discover addresses as they walk), and a 404 counts as "no such page". The expectation is
  still worked out from the sources' front matter, so the check compares the database with the rules, and a database
  that was not re-imported fails it. Same result as before: 23 posts in 3 years, 20 videos, 74 list pages walked,
  all checks passed. Proved alive: moving one post two years back in the database made it report the shifted lists,
  and a re-import made it pass again. `check:pages:stress` now says it is unavailable and points to T154.
- T154: `scripts/stress-site.mjs` (`npm run check:pages:stress`, `npm run stress:site`) creates a throwaway database
  (`kb_stress_<random>`), migrates it, writes generated posts as Markdown into a temporary folder, imports them with the
  real importer, starts the backend with the built site on a free port in its own process, prints size and time of the
  API lists and of the pages, and with `--check` runs `scripts/check-pagination.mjs` against it (`CHECK_ROOT` points
  the check at the generated sources). A passing run drops its database and folder; a failing one keeps both and says
  where. Result of the old shape (159 posts in 5 years, two future-dated, one draft): 102 list pages walked, all checks
  passed; the old "5 to a page, then 1 to a page" pair is not repeated because the page size is compiled into the built
  site. Measured at the owner's request, because the API sends every card on each list request and the site cuts
  years and pages itself: 1 000 posts over 41 years (2000 to 2040, so years in the past and in the future): a page
  takes about 35 ms. 10 000 posts: about 300 ms a page, because each page reads all 6 538 published posts (2.1 MB of
  JSON, 270 ms), and the search file is 21 MB. Hand queries on the same database: today's list query 235 ms; the same
  without the plain text 114 ms; one year and one page cut in the database 4 ms; the list of years with counts 49 ms
  (the floor is the visibility function over every entry, 42 ms). No code of the site was changed by the measurement.
- T039: `scripts/list-routes.mjs` finds the routes of the running server the way a visitor does: from `/`, from the
  sitemap and from seven pages nothing links to (search, the three sign-in pages, the two admin shells), following every
  internal link that ends in a slash; a route is an address that answers 200 with HTML. 149 routes, the same as the
  149 pages compared byte for byte at T036, and the previous `reference/astro-routes.txt` plus `/admin/posts/` and
  `/admin/users/`, which that file lacked. Against `reference/hugo-routes.txt` the only `<` lines are the nine
  Hugo-only `/page/1/` aliases (accepted); 134 `>` lines (years, video, search, auth, admin) are the expected additions.
- T133: `npm run check:markup` (`scripts/check-markup.mjs`, no dependency) exports commit 2b4aac9 of the old repository
  with `git archive` into a temporary folder, links that repository's node_modules and builds it there (the repository
  and its dist/ are not touched), then fetches each of the 149 routes of `reference/astro-routes.txt` from the running
  server and compares the whole document and the `<main>` region against the old file, after one normalisation: the
  hash in the name of a built asset. Result: 149 of 149 documents byte for byte identical, so also 149 of 149 `<main>`
  regions. Proved alive: a planted attribute in `<main>` of one page and a changed title of another were both
  reported, as "<main> differs" and "document differs outside <main>". No current post contains a formula or a code
  block (no built post page carries a KaTeX or code-block marker); those two renderings are covered by the fixtures of
  T018 and T019, not by this comparison, and `check:render` still gives 23 posts identical.
- T134: `npm run check:screenshots -- --old-dist <dir>` (`scripts/check-screenshots.mjs`, no dependency) serves the
  old build and a pass-through to the new server on four spare ports (old/new x light/dark; each injects the stored theme
  at the top of the page, the CLAUDE.md way to force light), photographs 16 page types with headless Edge at 1280 x 1800
  after warming each profile, decodes both PNGs itself and counts differing pixels, with the box they sit in. Result: 15
  page types captured in both themes: home, about, posts, a year, a year's page 2, a post, tags, a tag, categories, a
  category, the video list, a public video, a paid video, search, the sign-in page. 26 pairs of 30 are pixel for pixel
  identical. The 4 others are the post and the two video pages, each in light and dark: 56 to 69 pixels in a box of 8 x 11
  pixels (one glyph of a text line), largest channel difference 131 to 144. The same box differs between two captures
  of the old build alone (measured: old build against itself, 117 and 55 pixels), so it is capture noise, not a change;
  the HTML is byte for byte the same (T133). The account page of a guest navigates to the sign-in page by itself and
  does not settle for a screenshot reliably (captured in light once, not in dark), so it is listed as not captured; its
  HTML is covered by T133. Mobile width was not part of this task. The old build used here is kept in the temporary
  folder named by `check-markup.mjs` for T141, T148 and T150.
- T180 (2026-10-12): the references moved to the old application with its interface languages, commit `495e959`.
  `check:markup` (149 routes, 0 differences): 102 documents byte for byte identical, 41 equal after whitespace runs are
  one space and the space around block elements' tags is dropped (not rendered; the post page, inside a conditional
  since T090, loses it; an inline gap stays a difference). Exceptions, each counted in the report: the views counter's
  `ml-1` (the owner's fix of 2026-10-11, `09687fa`), the player's hidden templates on 36 pages (T082), the two paid
  lectures' pages (T082, T139), the three account pages (T053), `/admin/users/` answering a guest 404 (T070). One HTML
  holds both languages, so the comparison covers English and Russian at once. `check:screenshots` now takes four
  variants of every page type (light, dark, EN, RU). Result: 12 of 15 types identical in all four; `post` and
  `video-public` 135 to 149 pixels of 2 304 000 (0.006 %), in a box of 18 x 10 pixels at the views counter, where the
  owner's gap fix moves the number by 4 pixels, the same in both languages; `sign-in` 7.8 % because the page was
  rewritten (T053); `account` not captured as before. Accepted by the owner on 2026-10-12. Precondition: the server
  under test holds the old repository's content (`lecture-4`, T175, exists only here and changes the lists); the run
  used a throwaway database imported from the old repository's `src/content`.
- T141: the carousel of the home page is covered three ways. The home page is one of the 149 pages that `check:markup`
  finds byte for byte identical to the old build (T133) and one of the 15 page types that `check:screenshots` finds
  pixel for pixel identical in both themes (T134). On top of that `check:markup` now asserts on the running server,
  without the old build: the section `#home-carousel` is present, there is one slide for every photo of
  `public/images/carousel` (6 and 6), every photo answers 200, and one of the home page's module scripts carries the
  carousel's code. Proved alive: on a copy of the old home page with the section's id and the slide class renamed it
  printed "no #home-carousel section" and "0 carousel slides, 6 photos".
- T148: `check:markup` now also checks what crawlers are told, on the running server. The sitemap (one file, 119
  addresses) has no `/page/<n>/`, `/auth/` or `/admin/` address; it equals the 149 routes found by the crawl of T039
  minus those 30 (25 list pages, 3 sign-in pages, 2 admin pages), so two mechanisms agree; and it lists the same
  addresses as the old build's sitemap (order differs on purpose). `noindex, nofollow` is on the 2 admin pages and on
  no public page. Proved alive on a copy where an `/auth/` address was added to the sitemap, `/about/` removed and the
  robots meta of an admin page dropped: all three were reported. There is no `robots.txt` in the old build either (the
  server answers 404 for it, as before).
- T150: the build guards of `getVideos()` have a successor. `src/content/video-guards.ts` (`videoTextProblems`, a
  plain module like `members-only.ts`) holds four rules: no YouTube address and no Yandex Disk address in a paid
  lecture's text (members-only block and front matter description included), no members-only block in a public
  lecture, no block that cannot be recognised. The importer applies them before it renders anything and a refused file
  writes nothing (one transaction); the embed-id rules (a public lecture needs one, a paid one carries none) were
  already in the schema and are now covered by import cases too. The old build guard in `src/lib/video.ts` imports
  the same two address patterns, so there is one definition. One rule is stricter than the old guard on purpose: a div
  inside a block ends it early (the pattern stops at the first closing tag), which left the text after that tag among
  the public text while the old message claimed it was refused; it is refused now. Tests: 9 in
  `video-guards.test.ts`, 6 refusals in `import.test.ts`; all 116 pass with the one `todo` of T160. The real folders
  still import unchanged (24 posts, 21 videos), `astro check` 0 errors. The editors' save path (T094, T097) calls the
  same function.
- T160: one home for the source of a video, done before T161 at the owner's word (who saw "youtube" on the record of
  a lecture that lies on Yandex Disk, and the same data in two tables). Migration `008.do.video-source-one-home.sql`:
  every public video's platform and embed id are moved into its `video_sources` row (18 rows; the 3 paid rows were
  already there), the migration stops with the slug if a public video has nothing to move, then `videos.platform` and
  `videos.external_id` are dropped together with their two constraints. The rule "a public video has a source", which
  was a CHECK, is a deferred constraint trigger on both tables now, and "a paid lecture carries no embed id" is the
  structure (the id lives in a table only the access module selects). `store_video` keeps its signature; the importer
  is unchanged except that `file` is no longer a platform (a file on this server is `video_files`). The API answers
  `platform` and `externalId` null for a paid lecture (it used to say "youtube"). Applied to the development database
  after a dump (kept in the session's scratch folder): 18 public and 3 paid sources, the Yandex Disk lecture now says
  `yandex-disk`; `import:content` reports 21 videos unchanged; all 149 pages still byte for byte the old build's;
  `check:pages`, `check:bundles` and the 117 server tests pass, none `todo`. T137, T080 and T082 may be started.
- Consilium of 2026-10-10 on the tables that describe a video (the owner did not see why one video's data is in two
  tables). Verdict: the structure of migration 008 stays (`videos` = what it is about, `video_sources` = where it plays
  from); columns back in `videos` and a view or column privileges over one table were rejected (two homes again; one
  connecting role makes privileges pointless). Verdict file: `.specify/consilium/2026-10-10-video-source-structure.md`.
  Done the same day as migration `009.do.video-source-flip-rules.sql`: a public video flipped to paid loses its old
  public source row (until `store_video_source` writes the secret), and a deferred constraint trigger on both tables
  refuses a public video whose provider is not youtube, vk or rutube, whoever writes it. Three tests in
  `video-source-flip.test.ts` prove both flips and both refusals; 120 server tests pass, `import:content` reports 21
  videos unchanged, 149 pages as before. New task T164 (a separate database role for the application); the note on
  the four copies of the provider list is in T137; planned migration numbers moved up by one again (users are 010).
- Correction the same day, at the owner's word: a public video may be hosted on Yandex Disk, and other sources may
  come (Vimeo). The rule of migration 009 "a public video's provider is youtube, vk or rutube" was wrong and is gone.
  Migration `010.do.video-providers.sql`: the providers are rows of `video_providers` (youtube, vk, rutube,
  yandex-disk), `video_sources.provider` references it instead of a CHECK list, `store_video` asks the table, the two
  constraint triggers of 009 are dropped, and the importer's own list of platforms is removed (the database answers
  for an unknown one). A new provider is one `insert` and one adapter file (T137). The flip rule of 009 (a video that
  becomes paid loses its old public source row) stays. 120 server tests pass; `import:content` 21 videos unchanged.
  Planned migration numbers moved up once more (users are 011). The global consilium skill now reads and writes its
  briefings in the project (`.specify/consilium/briefings/`), and leaves the old briefings beside the skill, which
  belong to another project, untouched.
- Vimeo added at the owner's word: migration `011.do.video-provider-vimeo.sql` inserts one row into
  `video_providers` (the reference is the numeric id, with the hash of a private address as "<id>/<hash>" when T137
  writes its adapter; no column change). The owner also asked to be ready for video bytes stored in the database if
  resources allow: nothing is built, the structure already allows it (one more provider row and one adapter), and the
  decision is task T165 with its report (same disk so no saving, large objects up to 4 TB, bytes through Node against
  constitution IV, backups as big as the library, a measurement). Planned migration numbers moved up again (users 012).
- T161: lists, terms, feeds and the sitemap no longer read the plain text of every entry. `visibleEntries` in
  `server/src/access/entries.ts` takes a `TextNeed`: `none` for the post list and the terms (a post's card text is
  its stored summary), `videos` for the video list (a video's card text is the summary rule over its description,
  read for videos only), `all` for the search index, the one reader of the whole text. Answers are unchanged: 149
  pages, `/rss.xml`, `/video/rss.xml` and `/search/data.json` are byte for byte the old build's, 120 tests pass.
  Measured with `npm run stress:site -- --posts 10000 --years 2000..2040` against the numbers of T154 (median, ms):
  API list of posts 293 -> 177, terms 227 -> 112, list pages ~300 -> ~180, sitemap 621 -> 356, feed 300 -> 164, search
  index 240 -> 262 (unchanged: it needs the text). The target of "twice as fast" holds for terms only; the list is 1.7
  times faster. The rest is the visibility function (42 ms over 10 000 entries), the card payload and the site's own
  cutting, which T162 moves into the database.
- T162: year and page are cut by the backend. Step 1 moved the pagination rules (page numbers, addresses, year
  switcher, cutting, split by year, the three owner numbers) from `src/lib/lists.ts` to `src/lib/pagination.ts`, a
  plain module the backend compiles too; `lists.ts` re-exports every name. Step 2 added `GET /api/list`
  (`server/src/content/api.ts`; `listEntriesFor` and `listYears` in `server/src/access/entries.ts`): the database
  narrows by kind, tag, category and a range of dates, a year is a calendar year in the fixed +03:00 offset
  (`yearRange` in `src/lib/date.ts`, so the database and `formatYear` agree), and the order is
  `compareMergedNewestFirst` (the old merged order: date, then posts before videos, then the usual tie-breaks).
  Step 3 switched the four list routes to `getListRoute` (`src/lib/terms.ts`), and the tag cloud, the Tags page
  and the search facets to `getTermCounts`; a guest's years and term counts are kept until `contentVersion`
  changes (a stream of made-up tag names cannot grow the table past 500 entries). Step 4: `neighboursOf` reads the
  group at the entry's instant and the nearest group on each side. `ApiCard` gained `kind`. Measured with
  `npm run stress:site -- --posts 10000 --years 2000..2040` (median, ms): list pages 300 -> 16 to 22, tag and
  category pages 300 -> 17, Tags page 176 -> 8, home 179 -> 10. Still the whole list, on purpose: sitemap 379, feed
  171, search index 267 (T163), and the Categories page. 149 pages byte for byte, 127 tests.
- T040: documents brought up to date for phase 1. `README.md` has the section on lists cut by the backend and the
  checks; `MIGRATION-PLAN.md` carries a pointer saying where the list code went; the comments of every file edited in
  phase 1 were written with the edits (CLAUDE.md rule), and `server/test/shared.test.ts` lists every shared module.
  **Constants for phase 8 (the production proxy):**
  - Guest pages are cached by nginx for **10 seconds** when no session cookie is present (the council had 60; the owner
    left it to the planner); a request with a session cookie is `private, no-store`. Today the backend sends
    `Cache-Control: no-store` on every API answer and nothing sets a page header, so the proxy rule is the only
    place this number will live.
  - The backend keeps a guest's years of a list and the term counts, and the guest search index, in memory until
    `contentVersion` changes (an entry written, added, or a date passed). It is a few kilobytes at today's size; the
    table of years and counts is emptied at 500 keys. Nothing here is time based, so a second backend process behind
    the proxy would keep its own copy and agree as soon as it reads the version.
  - The site's calls to the backend time out after 5 seconds (`src/lib/api-client.ts`).
- T041: the owner accepted phase 1 on 2026-10-10. Next is phase 2 (own sign-in); open work that stays on the list:
  T163 (search at scale, owner decision first), T164, T165, T137, T080, T082, T152 and T135 on switch day.
- T163: the search runs on the server. Decision of the owner (2026-10-10): server search with the same rules, no
  morphology, and no PostgreSQL full-text search (it would find other words than the page does today, a feature to ask
  for separately). `src/lib/search-rules.ts` holds fold, words, the weights, `matchEntry`, `snippetAround` and the facet
  rule; `server/src/content/search.ts` applies them; `GET /api/search` uses the guest index the backend already keeps
  per `contentVersion` plus a folded copy built once from it (a signed-in viewer's is built per request until phase 5
  makes the audience matter). `src/pages/search/query.json.ts` maps kinds and slugs to addresses and section labels.
  `src/scripts/search.ts` keeps the box, the ticks, the address, the marks and the drawing, and ignores a slow answer
  to an earlier keystroke. Why not SQL: `lower()` depends on the database locale and a letter it did not fold would
  drop a match the page used to find. Cap: 200 results, counts are full. Numbers at 10 000 posts (median): index
  download 21.4 MB and 540 ms -> query 14 ms and 45 kB; counts only 9 ms; at 1 000 posts 6 ms. Parity: 204
  combinations of 17 queries and 12 sets of boxes against the old browser pipeline: identical. Tests:
  `server/test/search.test.ts` (7 cases, no database). Open: remove `/search/data.json` and the index endpoint once the
  owner accepts the new search; a non-guest's index is rebuilt per search until the audience work of phase 5.
- T163 follow-up, at the owner's word the same day: `/search/data.json` (`src/pages/search/data.json.ts`) and
  `GET /api/search-index` (with `getSearchIndex` and `ApiSearchItem`) are removed. They existed only so that the
  browser could download the whole index and search it itself; nothing reads them since the search runs on the
  server. The guest index the backend keeps in memory stays, because `/api/search` scans it. Tests that read the index
  now use the search. 134 tests pass.
- Phase 2 began 2026-10-10 (owner started the documentation servers for it: owasp, nodejs, express, postgresql,
  node-postgres, mdn, astro, auth, helmet, express-rate-limit). T042: `server/test/password.test.ts`, 8 cases marked
  `todo` until T047, against stubs of `server/src/auth/password.ts` and `semaphore.ts` that only fix the signatures
  (hashPassword, verifyPassword, needsRehash, checkPasswordRules, Semaphore). The stored string is
  `scrypt$N=131072,r=8,p=1$<salt>$<hash>`; verification reads the parameters from the string; the length rule counts
  characters, not bytes. The owner's note on the same day: the documentation servers are stopped or started only on his
  direct word.
- T043: sessions' tests. Owner's decision 2026-10-11: variant A, the plan's lifetimes (guest, student, expert, master
  14 days idle / 60 absolute; metr, admin and a blocked account 8 hours / 7 days; the superuser 1 hour / 12 hours).
  They are one constant each in `src/lib/session-lifetimes.ts`, a plain module like `pagination.ts` (the backend cannot
  compile `src/config.ts`), and `site.auth.sessionLifetimes` takes them from it. Cookie name `__Host-session`; the id
  is 256 bits, URL safe, 43 characters, SHA-256 of that string is what is stored; the full address is never stored,
  a prefix is. `server/test/session.test.ts`: the lifetimes case passes, 8 database and module cases are `todo`
  until T046 (tables) and T048 (module); the helper `insertAccount` in it names the columns `email` and `status`, to be
  adjusted when T046 fixes the table. Note for T048: `__Host-` needs `Secure`, and browsers accept a Secure cookie on
  http://localhost (Chromium, Firefox, Edge); Safari does not, so a development session there needs https.
- T044: sign-in tests. Owner's decisions 2026-10-11: variant A for the limits, and the project's own code, not
  `express-rate-limit`, for the address limit (a map and a sliding window; revisit only if the owner asks). Numbers are
  `signinLimits` in `server/src/auth/limits.ts`: 5 failures per step, pauses 1, 5, 15 minutes (15 stays), 20 failures
  per address in 15 minutes. Rules fixed by `server/test/signin.test.ts` (9 cases, all `todo` until T047, T049, T050):
  the first field is an address when it holds `@`; unknown, wrong, expired and no-password all answer `invalid`; a
  pause refuses even the right password and tells how long; attempts in a pause do not count; an unknown identifier
  is paused too (otherwise the pause tells accounts apart); a temporary password signs in with `mustChange`; a blocked
  account still signs in. Open for T050: an unknown identifier must still cost one scrypt computation (a dummy hash)
  so the time does not tell either; there is no test for timing, review it by reading.
- T045: `server/test/next-path.test.ts`, 6 cases, `todo` until T051. The rule is today's `nextPath()` moved to the
  server: `new URL(raw, origin)`, kept only when the origin is the site's, as path + query + fragment. The server version
  takes the origin and the fallback as arguments (it has no `location`). Pinned: the backslash and tab cases of
  2026-09-28, the CR and LF variants, a triple slash, a userinfo trick, normalisation (`/a/../b/`), and one addition,
  a cap of 2000 characters.
- T046: migration `012.do.users-sessions.sql` applied (users, sessions, login_attempts, audit_log; the foreign keys
  `entries.created_by` and `entry_audience_users.user_id` that 002 left for it). Owner's decisions 2026-10-11: the audit
  log is append-only by a database trigger (variant A: UPDATE, DELETE and TRUNCATE refused for every role; only someone
  who can drop the trigger can bypass it), and failed attempts are kept 30 days. Uniqueness is an index on `lower()`, not
  `citext` (PostgreSQL 16 documentation, "citext" rationale and CREATE INDEX examples: the functional index is the
  standard approach and needs no extension). `login_attempts` also keeps the failures of an unknown identifier under a
  SHA-256 of its normalised text, so the pause can treat it like a real account without storing what people type into
  the wrong field. No existing rows to move. `server/test/schema-accounts.test.ts` pins the promises (5 cases).
- T047: `server/src/auth/password.ts` and `semaphore.ts`. scrypt at N=2^17, r=8, p=1 with 16-byte salt and 64-byte
  hash, stored as `scrypt$N=131072,r=8,p=1$<salt>$<hash>` (base64), verified by the parameters in the string; a counting
  semaphore of two (the owner understood and kept it, 2026-10-11: a computation holds 128 MiB, so a burst is bounded at
  256 MiB); NFKC normalisation before hashing and before the length rule (characters, not bytes). A string that is not
  ours is `false` without hashing; its parameters are capped (N at 2^20, r at 32, p at 16). Measured here: one hash
  257 ms, four started at once 320 ms (Node's thread pool has four threads), so on a larger machine the limit can be
  raised in one constant. For T050: an unknown identifier calls `spendHashingTime`; a successful sign-in with
  `needsRehash` true replaces the hash. The 11 cases of `server/test/password.test.ts` run and pass.
- T048: `server/src/auth/session.ts`. Id: 32 random bytes, 43 characters of base64url, only SHA-256 stored (a fast hash
  is right: 256 bits of entropy leave nothing to guess, and it runs on every request). Cookie `__Host-session` with
  Secure, HttpOnly, SameSite=Lax, Path=/ and no Domain; the setting and the clearing share one attribute string so
  they cannot disagree. The idle clock comes from the account's current status and superuser flag at every use
  (`lifetimeOf` of `src/lib/session-lifetimes.ts`, still the one home of the numbers), is cut at the absolute clock and
  is written at most once a minute. Renewal deletes the old hash and inserts the new one in one transaction, with fresh
  clocks. The address is stored as a prefix (three parts of IPv4, four groups of IPv6, mapped form unwrapped), the
  browser description is cut to 200 characters without control characters. `deleteExpiredSessions` is for the periodic
  job. Note for the developer: `__Host-` needs Secure, so Safari will not keep it over plain http://localhost
  (Chromium, Edge and Firefox treat localhost as secure). The 10 cases of `server/test/session.test.ts` run and pass.
- T049: `server/src/auth/limits.ts`. Own code, as the owner chose. `pauseAfterFailures` (1, 5, then 15 minutes at every
  fifth failure, never permanent); `AddressLimiter` keeps failure times per address in memory (sliding window of 15
  minutes, 20 failures, at most 10 000 addresses tracked, the oldest-touched evicted); an account's pause is stored in
  `users.failed_count` and `locked_until`, set in one transaction with the increment; an unknown identifier's pause is
  derived from its rows in `login_attempts` (a SHA-256 of the normalised text), through the same function, so the two
  answer alike. Attempts in a pause are neither asked to count nor to extend it: the caller asks first. A success calls
  `clearFailedAttempts`; `deleteOldAttempts` keeps 30 days for the periodic job. The pause cases of `signin.test.ts` and
  the 3 of `limits.test.ts` run and pass.
- T051: `server/src/auth/next-path.ts`. The rule of `nextPath()` in `src/scripts/auth.ts` moved to the server: the
  address is resolved with the URL parser against the site's origin and kept only when the result is on that origin,
  as path, query and fragment. Added in the move: origin and fallback are arguments, raw values over 2000 characters
  fall back, and a string the parser rejects falls back instead of throwing. `/\host/`, tab and newline after the
  slash and `//host` all fall back (the 6 cases of `server/test/next-path.test.ts`). The browser copy goes with
  Clerk in T054.
- T050: the sign-in routes. `signin.ts` is the core (address limit, then pause, then password with `spendHashingTime`
  when there is nothing to compare, then the failure or the success with a rehash when the parameters moved);
  `accounts.ts` reads an account, creates one (always a guest; the table's unique indexes decide a clash and the error
  names the field) and changes a password (clears `must_change`, the expiry and the counter in one statement, writes
  an audit row); `routes.ts` mounts seven routes under `/api/auth`. Every session is made through `renewSession`
  with the id the browser brought, so an old or planted id dies at sign-in. The cookie's Max-Age is the time to the
  absolute end, set once. A limited session reaches `change-password`, `signout` and `me` only. The windows are keyed
  by the whole IPv4 address or the /64 of an IPv6 one. Owner's choices (2026-10-11): an address already registered
  says so, sign-up has a honeypot and a cap of 10 an hour per address, and a wrong current password in
  change-password counts like a failed sign-in. Not done here, by design: the viewer on the site's pages (T052), the
  pages (T053) and the page access rules (T056); the content API still treats everyone as a guest until T052.
- T052 (with T142): the viewer from the session. `server/src/auth/viewer.ts` is the one place a Cookie header becomes a
  `Viewer` (no cookie, a dead or expired id, a missing account and a session that must change its password are a guest;
  a blocked account is a viewer with its own status); the content API's `viewerOf` uses it. The site's middleware asks
  `/api/auth/me` only when the request has a Cookie header and falls back to a guest if the backend does not answer.
  `Base.astro` puts `kb-member` on the html element from `Astro.locals.viewer`, `AuthButton.astro` writes the account
  address and label from it, and its module script asks `/api/auth/me` on `pageshow` from the back-forward cache. The
  six prerendered pages are on demand now, which is what makes the header right from the first byte on every page
  (T142; the alternative, a presence cookie read by the inline block, was offered and not chosen). Verified: 149 of
  149 pages identical for a guest (`check:markup`), `check:pages`, `check:bundles`, and on a throwaway database a
  member's /about/, /, /posts/, /search/ and /auth/signin/ carry `kb-member` and the account link. Known and left:
  until T053 the sign-in page is still the old provider's, so signing in there does not make a session of ours; and
  the content API shows a member what a guest sees until the members and restricted branches of the visibility
  function exist (migration 003 fails closed). For phase 8: a cache in front of the site must vary by cookie.
- T053: the three account pages on the club's own API. `src/scripts/auth-forms.ts` (JSON requests that never throw,
  the countdown, the show/hide eye wiring, the sentences for the server's codes), `src/components/AuthField.astro` (the
  feedback form's input classes, `ym-disable-keys`, an optional eye button with two icons toggled by class because the
  `hidden` attribute does nothing on an inline SVG), and `signin.astro`, `signup.astro`, `account.astro` rewritten.
  The server learned to say how many tries are left (from the third failure of a step; the unknown identifier counts
  the same, so it reveals nothing) and the length of a pause the moment it starts; limits.ts `standingAfterFailure` is
  the one home. The account page is server-rendered from `/api/auth/me` (name, address, status, who blocked it), the
  devices come from `/api/auth/sessions`. Visual check on a throwaway database in headless Edge, both themes: sign-in,
  three failures with the tries left and the eye open, the pause with its countdown, sign-up with a mismatch, the
  account page of a member, of a temporary password and of a blocked account. The previous provider's scripts are no
  longer imported by any page; T054 removes them. Comments about that provider went with the code they described
  (the old files are in git history). `check:markup` now lists the three pages as rewritten on purpose.
- SITE_ORIGIN (2026-10-11, found by the owner on the sign-up form): the value in `.env` named the dev server's port
  (4321) while the app listens on 3000, so every form post from the browser was refused as cross-site. `SITE_ORIGIN`
  may now list several origins (`localhost` and `127.0.0.1` are two origins to a browser); the first is canonical;
  the cross-site guard accepts any listed one and nothing else; `originWarnings` prints a line at start when a
  loopback origin names another port than `PORT` (a warning, since behind a proxy they legitimately differ). Tests in
  `config.test.ts` and `guards.test.ts`. Deployment: one public https origin in `SITE_ORIGIN`, nginx in front.
- T054, first part (owner's variant A, 2026-10-11): the owner saw that the old card had a left menu and the admin
  screens, and that this copy no longer has them. Fact stated to the owner: since T053 the admin pages and the paid-video
  player cannot be used in this copy (they need the previous provider's session, which nothing creates now); they
  return in phases 3 (users page, T070), 4 (lectures) and 6 (editor), and the old site stays live until the switch.
  So the removal is split: now the inline flag block, `account-devices.ts`, `account-status.ts` and `clerk.css`; the
  packages and the three reference scripts stay until T167. New T166 records the owner's wish for the left-menu layout.
  Also: the status is spelled "мэтр" (Russian э) in `site.admin.statusNames`, the users page, the admin script and
  the account page; the key stays `metr`.
- T055: `npm run import:members -- <path> [--dry-run]` (`server/src/cli/import-members.ts`, `import-members-cli.ts`). The
  owner learned that the previous provider's export carries no statuses, and chose on 2026-10-11 that everyone is a
  guest (rejecting the first idea of reading a status column: a file must not be able to grant a right). A file is
  accepted whole or refused whole; the refusal names line numbers and reason codes. CSV quoting is parsed properly
  (a name with a comma); columns that hold password digests or two-factor secrets are never read, only named. An
  existing address is never changed. Logins are the one soft rule (left out and counted). The `member_until` date of
  T152 is not stored; the export does not carry it either, so administrators enter it. The account page no longer
  credits a "мэтр" with a block that has no recorded blocker.
- T056: who sees which /auth/ page, decided in the site's middleware before the page renders (astro-docs 4.16: a
  middleware returns a Response directly). No session: sign-in and sign-up are shown, the account page goes to
  sign-in. Signed in: sign-in and sign-up go to `next` (a page of this site) or to the account page; a `next` that
  is the sign-in or sign-up page itself counts as none, so there is no loop. A session that must change its password
  goes to the account page from sign-in and sign-up and sees the rest of the site as a guest (owner's choice A, B was
  to redirect every page). Redirects are 302 no-store. `nextPath` moved to `src/lib/next-path.ts` (shared, listed in
  shared.test.ts); the server's old path re-exports it. `Astro.locals.passwordChangePending` is the new flag. The
  middleware now keeps the account beside the viewer so it can tell a limited session from no session.
- T144 and T145 moved (owner, 2026-10-11, "moved, not closed"): their open parts (the fixed subject list of the
  feedback form and the prefill; the attributes on the admin and settings pages) can only be done in plan phase 7, so
  the two tasks now sit in that phase's section of `tasks.md` with their done parts recorded, and plan phase 2 no
  longer waits for them.
- T146 and T166 (owner's variants A, 2026-10-11): the account page has the previous provider's card layout again: a
  menu on the left (profile, security, devices, and "Управление" with the two panel links for a metr and an admin),
  the chosen section on the right and in the hash, tabs in a row on a narrow screen. New `PATCH /api/auth/profile`
  edits the display name and the login name by the sign-up's rules (one home for the constants, in `accounts.ts`);
  the current password is not asked, since the login is only a second way to sign in. The devices list is five to a
  page by the site's rule. The address cannot be changed yet (phase 9, FR-012a); the page says so.
- T153: `npm run check:auth` is rewritten for the site's own sign-in (55 checks, its own server and throwaway database,
  headless Edge). It found that ending a device from the account page never worked: the body-less DELETE had no
  content type and the cross-site guard refused it; `sendJson` now sends the type on every write. The "no provider"
  check looks for the provider's CODE in everything a page loads; the config still carries its publishable key and
  some comments name it, which is listed as a note until T167.
- T057: `README.md` has the own sign-in paragraph and the two new commands, and the Clerk paragraphs carry a superseded note; `AUTH.md` sections 10, 11 and 12 carry a note saying what of them still stands; `MIGRATION-PLAN.md` has a bullet. Nothing was deleted; the other provider documents (`CLERK*.md`, `CLOUDFLARE.md` and the rest) are T131's.
- T058 (owner check, 2026-10-11): plan phase 2 accepted. 22 of 22 tasks closed; T144 and T145 moved to phase 7, T167 waits in the polish phase.
- T059, T063, T064, T065 (step 1 of plan phase 3, owner's three-step plan and variants A, 2026-10-11): the status rules
  are one plain module (`server/src/users/status-rules.ts`) ported from the statuses Worker in its order of checks;
  `/api/admin/users` lists (substring search, 20 to a page), changes a status and issues a temporary password; the
  superuser is `protected`, a metr cannot lift an admin's block, guest is never given. The temporary password is 80
  bits in four groups of four (the owner chose it over 128 for dictation; research.md updated). A temporary
  password ends the account's sessions and clears its pause. T153's script had read a content table through a
  query and the boundary test caught it; it tells a paid video by the page's own marker now.
- T060, T061, T062, T066, T067, T068, T069 (step 2 of plan phase 3, owner's variants A, 2026-10-11): migration 013 (one
  superuser by a partial unique index, `recovery_codes`, `handover_requests`); `server/src/users/superuser.ts` is the
  only code that writes `is_superuser` (a source test enforces it); the command `npm run superuser` (create or
  promote, set-password, hand-over to any account, status), the password typed with the echo off; the handover from
  the pages with the target already an admin, the target's own password, 24 hours of cooling and a minute timer; ten
  recovery codes of 80 bits stored as SHA-256, a spent code returns a fresh set in its own answer. Deviation from the
  data model: the fresh set is shown in that answer, not at the next sign-in, so no plaintext is kept. New T168: the
  page `/auth/recover/`, in step 3.
- T070, T168 (step 3a to 3c of plan phase 3, owner's variant A, 2026-10-11): `/admin/users/` is 404 to everyone but a
  metr and an admin and runs on the site's own API (list, search, status, a temporary password shown once); the account
  page has the banner of an open hand-over (accept, decline, cancel) and the superuser's section (start a hand-over,
  ten recovery codes with a count); `/auth/recover/` takes address, code and new password and shows the fresh set once;
  the users list takes `?status=`; `GET /api/account/handover` carries `recoveryCodesLeft` for the superuser only.
  Found on the way: an empty `select` in an Astro template is written self-closing by Prettier and the compiler then
  swallows the rest of the page; an apostrophe in a comment inside `{/* */}` confuses the template parser; and a
  redirect-on-404 in the users script could loop with the sign-in page (removed). Left: T071 (remove `workers/statuses/`),
  T072 (rehearsal), T073 (documents), T147, T152, T074 (owner check), then T169.
- T071 (2026-10-11): `workers/statuses/` and its scripts removed; the statuses Worker's 68 cases had been ported in T059
  and the rules are one plain module; `dev:all` starts two services; the two config addresses are gone. History
  documents (ADMIN.md sections 3 to 9, AUTH-IMPLEMENTATION.md) keep their text under a dated note.
- T072 (2026-10-11): `npm run rehearse:superuser` - the server command, the hand-over with its waiting period and a
  recovery code, each ending in a sign-in as the new holder and then used a second time; 26 of 26; the record and its
  gaps (the prompt at a real terminal, the real clock, real accounts at T135) are in security-review-superuser.md
  section 6.
- T073 (2026-10-11): `RISKS.md` section 3, the residual risk of a leaked recovery code, with its review dates; README.md
  and MIGRATION-PLAN.md carry the phase 3 status. Phase 3 is built; what is left of it is the owner's decisions and
  checks (T152 options, T074), the links of T147, and then T169.
- T147 (2026-10-11, owner's order): moved to plan phase 7, where the pages it links to are built; its first half is done.
  T152: the design note `specs/001-self-hosted-club-site/design-member-until.md` is written and waits for the owner's
  four choices.
- T152 (2026-10-11, owner's order): moved to plan phase 4 (section "Owner decision first" of the lectures phase), to be
  talked over again there with the lecture access function; the four choices of `design-member-until.md` stay open and
  may change. Plan phase 3 now waits only for the owner's check T074; T169 follows it.
- T169 (2026-10-11, owner's variant A2): the setup door for a hosting with no command line - `server/src/users/setup.ts`
  and `setup-routes.ts`, `setupSuperuser` in `superuser.ts`, the page `/auth/setup/`, `SETUP_CODE` and
  `ALLOW_SUPERUSER_SETUP` in `.env.example`. The owner's question "which server log, with no console?" showed that
  the first design (a code printed in the log) depended on a log reader the hosting may not give; the code now comes
  from the settings first and the log only as a fallback. A test of two callers at once found a database error where
  `exists` was meant; fixed in `createSuperuser`. 254 server tests, 91 browser checks.
- T170 (2026-10-11, consilium of the day, the owner approved the full variant): the four ways of making or moving the
  superuser were made one mechanism. `users/credentials.ts` is the one place a password is set and an open hand-over
  is closed (a recovery code, the command, the door, the account page, a temporary password); `lockAccounts` fixes the
  lock order; the emergency switch works only with `SETUP_CODE`, for 30 minutes after a start and for one use; the
  server logs what the switch and a leftover code mean at start. The review found, among other things, that the
  switch with no `SETUP_CODE` would have made a log-printed code a key that replaces the holder (blocking), and that
  a recovery by code left a hand-over started by a thief alive for 24 hours. `SUPERUSER.md` is the working document;
  `superuser-ways.ts` is the table its test holds against the code. 267 server tests, rehearsal 46 checks. Open in
  plan phase 3: T171 to T174 (small), then the owner's check T074.
- T074 and plan phase 3 closed (2026-10-11): T170 to T174 done, the owner's check closed on the owner's word without a
  hands-on walkthrough (see the note on T074 in tasks.md for what no person or script has exercised). Next in the
  plan: phase 4 (T152 is discussed there with the lecture access function), then the final Clerk removal (T167) and
  the switch-day rehearsal (T135).

### 2026-10-11 and 2026-10-12: plan phase 4, lectures

- T152 (2026-10-11): the paid-access date. A person's `users.access_until` is the one clock; entering a status that
  opens lectures sets it to today plus 100 years; blocking sets it to yesterday (the owner's word, after seeing a
  blocked account with a date 100 years ahead); a video has `available_until` and after it the page stays and only an
  editor plays it. `lecture_view` (migration 014) is the one home of the rule. The members file may carry the old
  `member` and `memberUntil`.
- T075 and T076: the tests were written first and marked `todo` until their implementation existed; they all run now.
  The port of the Worker's 56 cases is mapped in the header of `video-access.test.ts`.
- The owner reported (2026-10-11) that a student could not play a paid lecture: the page still asked the old access
  service through Clerk, which does not exist in this copy, so every visitor was a guest. Fixed with T137: the provider
  adapters and `GET /api/videos/:slug/source`, and the page script asking it with the session cookie.
- T077 (migration 015): `video_files`, `settings` (checked keys, `members_block_mode` seeded `locked`), `settings_log`
  (by trigger, append-only); a source row or a file row, never both.
- T078: the faststart check reads only the box headers; no ffprobe (the owner left the choice to the assistant).
- T079: `npm run video:register`; `--replace-source` is needed to delete an old source row, because that is not
  recoverable. `VIDEO_ROOT` is the volume folder; the development one is `video-volume/`, ignored by git.
- T080: `GET /media/video/:slug`, `res.sendFile` with ranges in development, `X-Accel-Redirect` behind nginx.
- T081: the backend sends the members-only block by the rule and the setting; `membersOnlyHidden` was the owner's
  approved name. The two helper copies in `src/lib/video.ts` stay until T089 because the RSS feed still reads them.
- T082 and T149: `VideoPlayer.astro`, the states known at render. A public video on VK or Rutube no longer gets a
  YouTube frame with the wrong id.
- T165 (2026-10-12): a measurement on a throwaway database (500 MB large object: 678 MB on disk, 52 MB/s a stream, 2 ms
  seek) and the owner's decision not to build it.
- T083: the access Worker, its dev and check scripts, the `VIDEOS` map and the two service addresses are gone; the
  player script was renamed, not deleted.
- T175 was added at the owner's word: the admin page for adding, editing and deleting a video, as for posts, in plan
  phase 6.
- 327 server tests, 91 browser checks. Left: the owner's check T085, then plan phase 5.
- T085 and plan phase 4 closed (2026-10-12) on the owner's word (see the note on T085 in tasks.md for what was not
  walked through by hand). Next in the plan: phase 5 (visibility everywhere, T086 to T093 and the tasks of that phase),
  later the admin pages of phase 6 (T175 for videos), the final Clerk removal (T167) and the switch-day rehearsal
  (T135).

### 2026-10-12: plan phase 5, visibility everywhere

- T086: the matrix test first (nine viewers by sixteen entries, every surface, a leak scan), with `todo` on what the
  later tasks would build. Rule decisions it pinned, the owner's word before the code: a blocked account is a guest for
  entry rules and a name does not help it; a named person is let in by name; metr and admin are not let into
  `restricted` by status alone; a teaser is on every surface as a card and its text on none.
- T087 (migration 016): `entry_view` gains `members`, `restricted`, the named-person branch and the teaser; the 404
  contract is kept; `lecture_view` passes the status and answers `none` unless the entry is seen in full.
- T088 needed no production code: every list, count and neighbour already came from `visibleEntries`, so the proof is
  nine matrix cases on the real pages.
- T089 (migration 017): `content_version`, a counter bumped by statement triggers (a sequence was refused: `nextval` is
  visible before commit and is not rolled back). The old version, derived from `updated_at`, did not move when an
  entry's audience lists changed, so a guest's cached terms went stale. Cache headers by audience in
  `src/lib/audience-cache.ts`; the owner kept the 10 seconds for a guest after asking what they cost (a change shows to
  guests within 10 seconds, and a guest's page is never cached beyond that).
- T090: the locked page (`LockedEntry.astro`), the locked card, and a head with nothing about the entry. Found while
  doing it: the tag pages copy the card markup instead of using `CardList.astro`, so the lock label went in both.
- T091 (migration 018): measured on 6 600 entries, the cost was the rule asked per row by id (80 ms against 1.8 ms from
  the row's own columns), not the scans. A SQL function with a sub-select inside is not inlined (53 ms), so the rule is
  one pure function and the lookups are separate functions called for restricted entries only. The owner chose all
  three steps. Migration numbers in `tasks.md` are provisional: 016 to 018 were fixed in the tasks that made them.
- 390 server tests (389 pass, 1 `todo` for comments), `astro check` 0 errors, `npm run build` passes. Left: the owner's
  check T093. A leftover from T081: `publicBody` and `membersOnlyHeadings` in `src/lib/video.ts` are no longer read by
  the feed; the owner moved their removal to plan phase 6 as T183.
- T093 and plan phase 5 closed (2026-10-12) on the owner's word, without a hands-on walkthrough (see the note on T093
  in tasks.md for what no person has seen). Next in the plan: phase 6, which begins with the interface languages
  (T176 to T182), then the admin pages (T094 to T102, T138, T143, T175, T183), the final Clerk removal (T167) and the
  switch-day rehearsal (T135).

### 2026-10-12: plan phase 6, interface languages (T176 to T181)

- T176 first: `check:lang` (browser checks over CDP, its own server and a throwaway database), written to fail until the
  work existed. T177 carried the current site's mechanism over file by file (the inline block of `Head.astro`, `T.astro`,
  `LangToggle.astro`, `src/i18n/lang.ts`, `src/scripts/lang.ts`, `site.i18n`); what served Clerk only was left behind
  (`I18N.md` section 8). T178 put the strings of phases 1 to 5 into `ui` and `adminUi`, about 190 entries; T179 made
  the 15 error codes one list with a text each in both languages. 48 of 48 browser checks, 392 server tests,
  `astro check` 0 errors.
- Decisions of the owner on the way: the choice stays with the device; a switch in a second tab is followed through the
  `storage` event; the English name of the status `metr` is "maitre" (Latin letters, no accents, as the French word);
  the leftover of `publicBody` and `membersOnlyHeadings` goes to T183.
- T180: the parity references moved to `495e959`; whitespace between block elements became a named level of equality
  after measuring that every `{/* */}` comment between elements leaves a space and that a post page rendered inside a
  conditional loses the whitespace its slot had; the residuals are in the T180 bullet above.
- Left: T182, the owner's check of the English texts ("maitre", the hand-over and recovery-code explanations) and of the
  switch on the home page, a post, the sign-in page, the account page, the feedback form and an admin page.
- T094 to T096 (2026-10-12, tests first): the content rules are one module, `server/src/content/rules.ts`. The three
  bypasses of `RISKS.md` section 2 were reproduced against the real pipeline and are pinned as refusals; the fix is that
  the body gate asks the sanitizer instead of reading Markdown with expressions of its own, so there is one definition
  of raw HTML and of an unsafe address. T095 wrote the routes' shapes into the contract and its tests (19 red until
  T097 and T098). The video flow is worked out like a post, as the owner asked; four decisions of the tests were
  accepted: any editor may restore, a draft is the audience `hidden`, the upload cap is 500 MiB, a save without
  `If-Match` is 400.
- T097 (2026-10-12): the panel's routes for posts and videos. One module reads and writes the content tables for the
  panel (`server/src/access/admin-entries.ts`), the routes know no SQL, and the version of an entry is its `updated_at`
  with microseconds, compared under the row's lock. A hand-check of the video flow is part of T102.
- T098 (2026-10-12): the upload of a video file, `PUT /api/admin/videos/:id/file`. Streamed to a temporary file in the
  volume, faststart-checked, then renamed to a name the server makes; refusals (type, an existing source, size from
  `Content-Length`, faststart) come before anything is stored. The size cap is the environment variable
  `VIDEO_UPLOAD_CAP_MB` (default 500) and the free-space reserve of T138 will be `VIDEO_FREE_RESERVE_MB`: the owner
  chose `.env` over a table of settings, because the limit is a property of the machine and changes rarely. The
  cross-site guard has one exception, this path, for a non-JSON body. T095 is fully green. The panel's page for it is
  T175.
- T138 (2026-10-12): the rule for the server's disk. One module (`server/src/video/space.ts`) decides: a file over the
  cap is refused, and so is one that would leave less than the reserve free (`VIDEO_FREE_RESERVE_MB`, default 2 GiB,
  in `.env` like the cap). The panel asks `GET /api/admin/videos/space` for the room before it offers a file;
  `video:register` applies the cap but not the reserve. Keeping the database and its backups off the video volume
  stays a deployment rule (quickstart, phase 4), not something the code can enforce.
- T099 (2026-10-12): the posts page of the panel on the new API. An editor can now list, search, add, edit, copy,
  delete and restore posts in the browser, choose who may read a post (everyone, signed-in members, chosen statuses and
  named people), preview the text as the site will render it, and see conflicts instead of overwriting another
  editor's save. The form's behaviour in a browser is for the hand check of T102; the images and the video upload are
  T143 and T175.
- T099, later the same day: the browser checks (`check:lang`, `check:auth`) had stopped on this machine because
  Windows reserves TCP ports 9294-9393 and the scripts asked for 9333 and 9334; they take a free port now. The posts
  form got examples in its empty fields and an explanation of the audience at the owner's request, and was driven in a
  real browser once (31 checks, not kept in the repository).
- T099, the same evening: the audience's block of chosen statuses and people is always visible (greyed until chosen
  only); `npm run check:admin-posts` drives the form in a browser; the browser checks clean up their profile folders.
- T175 (2026-10-12): the videos page of the panel. An editor can add, change, delete and restore videos, set a free
  video's link or a paid lecture's (write-only), upload an MP4 with the free room shown and every refusal explained,
  and replace a file by a link or back after a confirmation. The account page's menu and the panel's navigation have
  the entry. `npm run check:admin-videos` drives all of it in a browser. The dates the panels propose come from the
  server's clock. The hand check of the video flow is T102.
- T175 follow-up (2026-10-12, the owner's orders): the saved link or id of a video, a paid lecture's too, is shown in
  the form and can be changed (editors only; no list, public answer or audit row carries it); a lecture can be copied
  on the server (a draft with the same link or file); every host is guaranteed to play: an adapter per host with a
  `parse` that reduces a pasted address or embed code to the stored id (YouTube, VK with its hash, Rutube with its
  key, Vimeo with its code, Odnoklassniki, Yandex Disk), a save is refused when the text is not an address of the host,
  Vimeo (a row without an adapter until now) and Odnoklassniki (migration 019, provisional number) play, and their
  hosts are in `site.videoAccess.playerHosts`. The per-host steps and the upload are in [VIDEOS.md](VIDEOS.md).
- T100 (2026-10-12): the old publishing path is gone. Deleted: `workers/content-admin/` (the Worker that wrote posts to
  GitHub with a token), `scripts/check-content-admin.mjs` (its 128 cases went to `server/test/content-rules.test.ts` in
  T083), `scripts/content-admin-dev.mjs` and `scripts/github-stand-in.mjs`, the npm scripts `check:content-admin` and
  `content-admin:dev`, the content service's child in `dev:all`, and `site.admin.endpoint` / `devEndpoint`. ADMIN.md and
  ADMIN-GITHUB-PAGES.md carry a "superseded" note. Nothing in the panel writes to GitHub any more.
- T183 (2026-10-12): `src/lib/video.ts` lost the build-time half that nothing called (`getVideos`, `videoCard`,
  `videoLink`, `videoTerms`, `videoSearch`, `publicBody`, `membersOnlyHeadings`); the members-only rule has one home,
  the backend and the importer's guards.
- T143 (2026-10-12): pictures for posts and members-only blocks. An editor uploads a PNG, JPEG, WebP or GIF (5 MB, the
  type read from the content, SVG refused) from the form, or pastes an https address of one from the internet; it goes
  into the text at the cursor. Files are `images/<sha256>.<ext>` in the video volume and are served at
  `/images/u/...`; the list offers "put into the text" and "copy the address", and nothing is deleted. Migration 020
  (provisional number). The editors' guide is section 7 of [VIDEOS.md](VIDEOS.md).

### 2026-10-12: plan phase 6, content administration (T094 to T100, T138, T143, T175, T183)

The bullets above this heading that begin with a task number are the log of the phase task by task; this is the
summary of what the phase decided and found.

- Order: the rules and their tests first (T094, T096: the 128 cases of the old Worker as one plain module), the routes
  (T097, T095), the upload with the disk rule (T098, T138), the posts page (T099), the videos page (T175, at the owner's
  word that adding a video must be worked in the panel), then the removal of the old path (T100), pictures (T143) and
  the clean-up (T183).
- Decisions of the owner on the way: the limit and the reserve are environment variables (`VIDEO_UPLOAD_CAP_MB`,
  `VIDEO_FREE_RESERVE_MB`, and `IMAGE_UPLOAD_CAP_MB` at 5 MB); a paid lecture's saved link is shown to the editor (the
  first design had it write-only; the owner needs to see an id to change it) and to nobody else; the form fields carry
  examples and a short explanation of the audience; every form has create, edit and a soft delete with restore; a
  lecture can be copied; every video host must really play, including Vimeo and Odnoklassniki; a picture is uploaded
  or linked from the internet, with copying of its address and no deleting; Yandex Metrika stays on the site for good.
- What the phase found: Vimeo had been offered by the panel with no adapter, so a Vimeo video was saved and never
  played; a pasted address was stored as typed and only a bare id could play; the provider list of the form fell back
  to YouTube on every open; the browser's clock could put a new entry in the server's future (the panel's dates now
  come from the server's `Date` header); Windows reserves a port range (9294 to 9393 at the time) that stops a browser
  started for the debugging protocol, so the browser checks ask the system for a free port.
- Known and not explained: in about 2 of 30 runs a public page answered 404 for a moment right after a save. The
  checks wait up to 5 seconds and print the wait; a clock difference between this machine and the database's
  container is the suspect and is not proven.
- Left for later: deleting a picture and showing where it is used; a copy button that also takes the files of a post.
- Owner check: T102. It adds, beyond the criteria of the plan, a real link from each host, a 500 MB upload that plays,
  and a picture put into a post.
- T167 (2026-10-12): the previous sign-in provider and React are removed for good (the second half of T054): five
  packages and the `overrides` block, three scripts, the configuration keys, the dev pre-bundling integration, two
  dead strings; the lock lost 498 packages and changed none; a clean `npm ci` builds and every check passes. The
  feedback form's autofill reads `/api/auth/me`. CLERK.md and CLERK-DASHBOARD.md carry a superseded note.

### 2026-10-13: plan phase 7, comments, reactions, feedback, settings (T103 to T111, T144, T145, T147, T151, T184 to T188)

A summary of what the phase decided and found; the task-by-task record is in `specs/001-self-hosted-club-site/tasks.md`.

- Order: the tests first (T103 comments, T104 feedback and the mail queue, T105 settings), the rules written down with
  the owner before any code (T184: a flat list newest first, one day to change or delete one's own comment, the cap of
  20 under one entry, six reactions, one per account), then the parts in the order the owner could look at them:
  comments (T106, T151), reactions (T186, T187), the feedback route and its panel page (T107), the mail (T108), the
  form on the site (T109, T144), the settings (T110, T147). The fill-time rule of sign-up (T188) and the Session
  Replay marks (T145) closed the phase.
- Decisions of the owner on the way: the comments and the six reactions keep the look of the previous service's block;
  its comments and reactions are not carried over (FR-041); a guest who sees a paid lecture as a teaser also reads its
  comments, and only a writer writes (T151); the feedback list is paged and searched on the server like the posts'
  list; `nodemailer` 10.0.16 (consent given the same day); the order of the form chain was left to the planner; the
  mailbox could not be named, so T111 moved to plan phase 8.
- One rule, one home, again: who may write a comment or react is one function (the access module's writer rule, also
  used by the reactions' routes); the numbers of the pages of an admin list are `server/src/http/paging.ts`; "one bare
  address" is `server/src/mail/address.ts`, used by the mailer, the queue and the settings route; the topics and the
  lengths of the feedback form are `src/lib/feedback-rules.ts`; the fill time is `src/lib/fill-time.ts`, read by the
  feedback route, the sign-up route and the sign-up page.
- Mail: the form stores the message and its notice in one transaction and sends nothing in the request; a worker loop
  owned by the server sends one row at a time under `for update skip locked`, keeps one short error line, and tries
  again for ever (1, 5, 15 minutes, an hour, 3 hours, then every 6 hours). Every risky option of the library is spelled
  out and compared whole by a test. With no mailbox set the queue waits and nothing is lost; `MAIL_OUTBOX_DIR` writes
  each message to a file for a machine with no mailbox.
- Settings: the superuser only (404 to everyone else, an administrator included), the password typed again with every
  change; a new recipient is a request with an 8-digit code (scrypt hash, five tries, thirty minutes) mailed to the
  NEW address, a warning to the old one, active only after the code, the old one told once it has changed.
- What the phase found: a feedback list that stopped at 200 messages (now paged and searched on the server); a device
  whose clock is off sent a form "from the future" and was refused (the form and the sign-up page now learn the
  server's clock from the `Date` header); the page-size helper existed in three copies (one module now); a check
  script that inserted `is_superuser` was caught by the test that scans for such writes; a worker test read a
  database row before the transaction had committed (the test polls); the first wrong password of a sign-in carries no
  count of tries left, only from the third failure, so a check asserted too much.
- Known and not exercised: a login and a send through a real provider over TLS (T111, plan phase 8; the transport has
  been run only against a stand-in server of its own, with the certificate check on); a page for the log of settings
  changes (the table `settings_log` is written by a trigger and has no reader yet).
- Owner check: T113, with the list `specs/001-self-hosted-club-site/owner-check-phase-7.md`. Passed on 2026-10-13 at
  the owner's word; the sending mailbox was tried on his machine (a personal Outlook.com mailbox, then a Gmail one) and
  refused both logins, so the check ran through the development outbox and T111 stays open.

### 2026-10-13: polish (T127, T189, T131, T158, T155, T132, T130, T129)

- T127: `npm run check:secrets` (a self test, then the working tree, `dist/client` and the whole history) finds no
  secret value and no personal address; the one address in the copy of the pictures' authors list was left out of the
  shipped copy.
- T189: the owner chose to publish an export of one commit with a neutral name and address and to keep this history
  private; the export is made from the committed HEAD by the recipe in `tasks.md`, and `CLAUDE.md` no longer names
  the machine's user folder.
- T131 and T158: every document that describes an arrangement the rewrite replaced opens with a "Superseded" note
  saying what replaced it (`CLERK*.md`, `AUTH*.md`, `CLOUDFLARE.md`, `DISQUS-FIX.md`, `PAID-VIDEO.md`, `ADMIN*.md`;
  `CONTENT.md`, `templates/post.md` and `METRIKA.md` for the way posts are written and the names that moved). Only
  lines were added; nothing was deleted.
- T155: the removals of the old services were already named in T083, T100, T071 and T167; what was left was
  `scripts/dev-all.mjs` with `dev:all` and `dev:all:clean`, which started `astro dev` alone. They are removed at the
  owner's word, `dev:clean` stays, and `README.md`, `CLAUDE.md` and `CONTENT.md` point to `dev:site`.
- T127 amended at the owner's word: `npm run check:secrets` also reports the paths of the machine (a drive path outside
  the system folders, its WSL form, the home folder, the account name) in the tree and in `dist/client`, never
  printing the path; the history is not searched for them because it is private.
- T132: the three deferred items of plan phase 9 are listed in `MIGRATION-PLAN.md` section 11 with the condition under
  which each starts (a sending mailbox and the language of letters; the owner asking for full-text search as a feature
  of its own; the owner preferring argon2). Nothing was built.
- T130: `RISKS.md` reviewed. Entry 2 ended (the Worker is gone and the sanitizer closes the three bypasses); entries 1,
  3, 4 and 5 hold, no date renewed; the owner confirmed entries 3 and 4 in writing the same day.
- T129: the release checks ran and are recorded in `tasks.md`: `astro check` 0 errors, the build green, `astro dev` up,
  the pagination check passed on a throwaway database seeded from the files, route parity as accepted. Open: 23 files
  that `prettier --check` flags (21 before today; two from T145) and a stale `reference/astro-routes.txt`.
- Documentation servers: none for T127, T189, T131, T158, T155 and T129; postgresql-docs for T132 (2 searches, 1
  section); nodejs-docs for T130 (1 search).

### 2026-10-13: Constitution Check on the finished system (T128)

The eight gates of `.specify/memory/constitution.md` (1.1.0, "Development Workflow and Quality Gates"), checked
against the system as it is today, with what was measured and what was not. A gate marked "holds" has evidence; "open"
is a point only the owner can close; nothing below was changed to make a gate pass.

- Measured today: the whole server suite, 647 of 647 (213 s); `npm run check`: `astro check` 0 errors, 0 warnings, 5
  hints, `prettier --check` 21 files (20 never formatted, `Base.astro` does not parse); `npm run build` green;
  `check:bundles` clean (46 canaries, 12 markers); `check:secrets` clean in the tree (523 files), `dist/client` (35
  files) and the history (218 commits, the commits' address accepted); `check:markup` and `check:screenshots` on a
  throwaway database imported from the old application's content at `495e959`, served by this process on a
  system-chosen port.

**Gate 1, the stack and the dependencies: holds, one point open.**

- Node is pinned (`engines` `>=20.0.0 <21`, `engine-strict=true`), Astro `^4.16.18`, Tailwind `^3.4.17`,
  `@astrojs/node` 8.3.4; `@tailwindcss/typography` is not installed; `npm ls` is clean.
- Since the first commit 9 direct dependencies were added (`@astrojs/markdown-remark`, `@astrojs/node`, `express`,
  `gray-matter`, `nodemailer`, `pg`, `postgrator`, `@types/express`, `@types/pg`) and 6 removed
  (`@astrojs/sitemap`, the three Clerk packages, `react`, `react-dom`). Every added one is named in the documents;
  eight have a row with the owner's consent in `research.md` section 12.
- Open: `gray-matter` 4.0.3 was declared on 2026-10-10 (`c97c75a`) and is listed in the section "Dependencies added by
  the rewrite" above with its leaving condition (T135), but it has no row in `research.md` section 12 and the owner's
  word for this one package is not written down in the files (the note of the importer's session said it was needed).

**Gate 2, addresses and visible parity: holds, one point open.**

- Addresses: the route list of the running site against `reference/hugo-routes.txt` has no Hugo route missing but the
  nine `/page/1/` aliases that were accepted; 133 routes are new. `reference/astro-routes.txt` was regenerated today
  (148 routes: minus the three panel pages a guest gets a 404 or a redirect on, plus `/auth/recover/` and
  `/video/lecture-4/`).
- Markup: `check:markup` 148 routes, 0 differences. 142 pages are compared: `<main>` is identical in all 142, and the
  whole documents are equal apart from whitespace between block elements (at T180 it was 102 identical and 41 equal
  apart from whitespace; the shared templates changed since: the contact form of every page (T109, T167), the comments
  block (T106), the removed counter script of the previous comments service in `Base.astro`). Not compared, by name:
  the two rewritten sign pages (T053), the two paid lectures (T082, T139), and two routes that exist only here.
- Pictures: `check:screenshots`, 15 page types in four variants (light, dark, English, Russian): 48 of 60 pairs
  identical. `sign-in` differs by 7.8 % (the page was rewritten, accepted at T180). `post` differs by 0.12 to 0.17 % and
  `video-public` by 17.4 % of the page: both now show the club's own comments block with the reactions row under the
  entry, opened, where the old page showed a "Show comments" button (T106, T151, T186, the owner's decisions); at T180
  these two were 135 to 149 pixels at the views counter.
- Open: the owner has not yet accepted the new residuals of `post` and `video-public` (the report with the pairs side
  by side is written by the check; it is not kept in the repository).
- Interface strings: `check:lang` was last run in T176 (48 of 48) and not repeated today.

**Gate 3, one home for every rule: holds.**

- `check:bundles` finds nothing of the database or of an entry in the browser's files.
- The test "no file outside server/src/access reads the content tables" passes; no address of a post or a video is put
  together by hand outside `post-url.ts` and `video-url.ts` (one comment mentions the old form); one module
  (`src/markdown/options.ts`) is read by `astro.config.mjs` and by the backend renderer; the status rules and the
  content rules have their tests (`status-rules`, `content-rules`) and the constants test agrees the config with the
  column defaults.

**Gate 4, security: holds for what exists; three points open.**

- Tests pass for: the visibility matrix (a hidden entry and a missing one are the same 404, comments and reactions
  included), deny by default on the admin routes, the status model, the `__Host-` cookie, scrypt, and Markdown without
  raw HTML. `check:secrets` is clean; no `PUBLIC_` variable is read (`server/src/config.ts` says so in a comment).
- Open (a): the history, with the name and address of the commits, is on a remote that is readable without signing in
  (gate 8). The gate's words "no personal address in the repository" are about what is published.
- Open (b): "video bytes never pass through Node; every player request is checked before nginx serves it": the check
  endpoint and its tests exist, nginx does not (plan phase 8).
- Open (c): "Node's port is never published": `compose.dev.yml` binds the database to `127.0.0.1` only, and the
  production compose file and proxy are not written (T116, T117).

**Gate 5, documentation: holds, two notes.**

- All 217 source files checked (`server/src`, `src/lib`, components, pages, layouts, scripts, i18n, `scripts/`) carry
  a comment in their first 14 lines (a heuristic: it proves a comment is there, not what it says). `README.md`,
  `MIGRATION-PLAN.md`, `REWRITE.md` and `tasks.md` have today's entries for T127 to T130 and this task.
- Note: 104 tracked text files outside the content carry non-ASCII characters, almost all of them Cyrillic site strings
  or quotations of them; four carry an em or en dash (`AUTH.md`, `src/i18n/strings.ts` twice, `src/lib/seo.ts`), older
  than the rewrite. No check enforces "ASCII, no em dash" for new text; it was not audited line by line.

**Gate 6, checks named and local steps written: holds, one point open.**

- `quickstart.md` has a section for every plan phase and the cross-cutting checks; the owner's hand checks of phases 6
  and 7 are in `owner-check-phase-6.md` and `owner-check-phase-7.md`.
- Open: the constitution asks for `npm run fix`, `npm run check` and `npm run build` to pass. `npm run check` exits 2
  because `prettier --check` flags 21 files that were never formatted (T129), and `npm run fix` is not run by the
  owner's rule (it rewrites files of `.claude` and `.specify`).

**Gate 7, scope and nothing destructive: holds.**

- No migration drops data without moving it first: `008` drops the two old columns of `videos` only after every
  public video's source is a row of `video_sources` and it stops with the slug if one could not be moved; `010`
  replaces the check constraint on the provider by a reference to the new table of providers; the
  `delete from video_sources` lines of `009`, `010` and `014` are inside the store function and run when a public
  video becomes paid, so that its public embed id is never read as the lecture's secret (tested by
  `video-source-flip`); `012` and `015` add triggers that refuse `truncate`. There is no `undo` migration file.
- The content import twice over changes nothing (tests "the import run twice makes no duplicates", "the real folders
  import one row per file, twice over").

**Gate 8, branch and git: does not hold as written, two points open.**

- Branch: only `main` exists; no branch was created, switched or deleted. No `git push` was run in this working
  session. Commits were made on the owner's standing authorisation (CLAUDE.md, "Git").
- Open (a), the remote: the repository has a remote `origin` (a GitHub repository), pushed to three times on
  2026-10-13, at 13:42, 16:37 and 19:02 (the reflog of `origin/main` says "update by push"), the last time at
  `28bafc9`; the local `main` was six commits ahead of it when this was checked. An anonymous request for the
  repository page is answered 200, so it is readable without signing in. That contradicts what the documents say ("no
  remote until the owner publishes it": constitution VIII, `CLAUDE.md`, `plan.md`) and what T189 (C) was chosen to
  prevent: the commits' name and address are in the history that is now public. The note of T127 amended ("the history
  is not searched for paths because it is private") rests on the same premise. Nothing was changed.
  Decided by the owner on 2026-10-13: option C of T189, the public repository is replaced by an export of one commit
  with the neutral name and address, made from HEAD at the moment of publication. Making the new repository, the push
  and the removal (or hiding) of the old one are the owner's own actions; a Claude session does not push, on request
  either. Until they are done the statements "no remote" in `CLAUDE.md`, constitution VIII and `plan.md` stay as they
  are, and open points (a) and (b) stay open.
- Open (b), the footers: 21 commits, from 2026-10-11 22:27 to 2026-10-12 00:32 (the first is `b77b71e`, the last
  `0716446`), end with a `Co-Authored-By` line naming the assistant. The rule (CLAUDE.md, "Git"; constitution VIII)
  says no mention of the assistant in a commit and no such footer, and it overrides the harness's default text. All 21
  are within what was pushed. Commits made since then carry none. They cannot be changed without rewriting history,
  which needs the owner's word (a reset or a force push is never done unasked).

**What cannot be checked before a host exists (plan phase 8; these gates stay open on purpose).**

- The production compose file, the nginx front, "Node's port is never published", a backup with a rehearsed restore,
  and readers reaching the site without a VPN. The outside-services sentence of "Stack and Architecture Constraints"
  names YouTube embeds only, while the config lists the embed hosts of VK, Rutube, Vimeo and Odnoklassniki (the
  providers of migrations 010 and 011, T175); amending that sentence is the owner's, through `/speckit-constitution`.

### 2026-10-13: the guide for a colleague who clones the repository

- `GETTING-STARTED.md` (the owner's request, after T128): what to install, the clone, `npm ci`, the four lines of
  `.env`, the database container, `db:migrate`, `import:content`, `dev:site`, the first administrator (by the
  command or by the setup page), and a list of failures with their cures. It was run from a fresh copy of the committed
  files on spare ports (database 5440, site 3100) so as not to touch the owner's container or server: `npm ci`
  passed, the container became healthy, 23 migrations were applied, 24 posts and 22 videos were imported, and `/`,
  `/posts/`, `/video/`, `/about/`, `/tags/`, `/search/`, `/auth/signin/` and `/auth/signup/` answered 200
  (`/admin/posts/` answers 404 to a visitor, as designed). Not run: `npm run superuser` (it needs a terminal to type
  the password) and the test suite on the fresh copy. The test copy, its container and its volume were removed.
