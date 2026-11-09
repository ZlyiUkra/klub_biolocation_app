---
description: "Task list for the self-hosted club site"
---

# Tasks: Self-hosted club site

**Input**: Design documents from `specs/001-self-hosted-club-site/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/http-api.md,
security-review-superuser.md, quickstart.md

**Tests**: requested. The plan's whole safety case is rule modules proved by `node:test` (the 129 content, 68 status
and 56 video-access cases of the Workers are the specification), integration tests against a throwaway PostgreSQL,
and the existing browser checks. Test tasks come before the code they test.

**Organization**: grouped by the spec's user stories, which follow the plan's phases 0 to 8. Phase 9 of the plan
(mail confirmation and reset, full-text search, argon2) is deferred and has no tasks here.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1 to US11, the spec's user stories (US11 added 2026-10-12)
- Every edit to an existing file carries a short English comment saying why; existing comments are never removed
  (constitution V). Every new file opens with a header naming its source, the decisions that would look like
  mistakes, and the verification results.
- Owner checks are tasks: the work is not done until the owner has run them and said so.
- From T176 on (added 2026-10-12), no visible interface string is written as a literal in a page or a script: it goes
  into `src/i18n/strings.ts` or `src/i18n/admin.ts` in English and Russian (spec FR-045, constitution II 1.1.0,
  `I18N.md`). The tasks written before that date that add a page (T099, T175, T106, T107, T109, T110, T147) follow it
  without saying so.

Priority (added 2026-10-10 to the tasks T139 to T159, which come from `parity-inventory.md`): HIGH means that something the
old application does is lost or a right is wrong if the task is missed; MEDIUM that a visible behaviour or a check is
missing; LOW that it is tidying. It orders work inside a phase; it does not move a task to another phase.

## Map: plan phase -> tasks phase -> story

| Plan phase                     | Tasks phase | Story         |
| ------------------------------ | ----------- | ------------- |
| 0 Skeleton                     | 1 and 2     | enabling      |
| 1 Posts from the database      | 3           | US1           |
| 2 Own sign-in                  | 4           | US3           |
| 3 Statuses and the superuser   | 5           | US4           |
| 4 Video from the server        | 6           | US5           |
| 5 Visibility everywhere        | 7           | US2           |
| 6 Content admin                | 8a and 8    | US11, US6     |
| 7 Comments, feedback, settings | 9           | US7, US8, US9 |
| 8 Server and switch            | 10          | US10          |

## Documentation servers (the owner connects them; nothing is guessed)

- This list is the same as the one on the phase tracker (the artifact named in `REWRITE.md`): the servers of a phase
  are the union of the servers of its work items there. If the two ever differ, change both in one step.
- Every server is raised in WSL with `./df <domain> serve` and then checked in Claude Code with `/mcp`. A name below is
  the server's name without the `-docs` suffix; the port is the one the tracker shows.
- Connected at the start of this planning session: astro, astro-markdown-pipeline, docker, express,
  frontend-architecture, github-actions, node-postgres, nodejs, patterns, postgrator, postgres-image, postgresql,
  typescript. Search `astro` with version "4".
- Not connected then: owasp, nginx, nodemailer, certbot, linux, mdn, vite, tailwind, helmet, express-rate-limit,
  ffmpeg, argon2; zod and auth were on neither list and are checked with `/mcp` before the phase that uses them. A task
  that names one of these has "Needs: <name>-docs" and must not be started until the owner says it is connected; ask
  before the task, do not work around it.

| Server                  | Port | Plan phases                  |
| ----------------------- | ---- | ---------------------------- |
| argon2                  | 8814 | 9                            |
| astro                   | 8763 | 1, 2, 3, 4, 5, 6, 7, 8       |
| astro-markdown-pipeline | 8808 | 1, 6                         |
| auth                    | 8797 | 2                            |
| certbot                 | 8811 | 8                            |
| docker                  | 8780 | 0, 8                         |
| express                 | 8791 | 0, 1, 2, 3, 4, 6, 7          |
| express-rate-limit      | 8812 | 2                            |
| ffmpeg                  | 8813 | 4                            |
| frontend-architecture   | 8790 | 0                            |
| github-actions          | 8794 | 0, 8                         |
| helmet                  | 8809 | 2                            |
| linux                   | 8782 | 8                            |
| mdn                     | 8784 | 1, 2, 4, 6, 7                |
| nginx                   | 8798 | 4, 6, 7, 8                   |
| node-postgres           | 8805 | 0, 1, 2                      |
| nodejs                  | 8796 | 0, 1, 2, 3, 4, 5, 6          |
| nodemailer              | 8810 | 7, 9                         |
| owasp                   | 8795 | 1, 2, 3, 5, 6, 7, 9          |
| patterns                | 8777 | 0                            |
| postgrator              | 8806 | 0                            |
| postgres-image          | 8807 | 0                            |
| postgresql              | 8792 | 0, 1, 2, 3, 4, 5, 6, 7, 8, 9 |
| tailwind                | 8775 | 2, 3, 4, 5, 6, 7             |
| typescript              | 8772 | 0                            |
| vite                    | 8778 | 1                            |
| zod                     | 8770 | 1, 6                         |

Servers of plan phase 1 (tasks T018-T041): postgresql, node-postgres, nodejs, zod, astro-markdown-pipeline, astro,
owasp, express, vite, mdn. The per-task `Docs:` and `Needs:` lines below name the ones each task reads; where a
server is on the phase list and on no task line, it is read for the work the phase item names (zod for the import
and the front matter gate, vite for the bundle check, mdn for the feeds and the sitemap).

---

## Phase 1: Setup (plan phase 0)

**Purpose**: the second project and the tools around it. Nothing runs yet.

- [x] T001 Write `REWRITE.md` at the repository root: the decisions of the verdict and the plan in one place (ports
      and adapters, the strangler switch, the rule homes of constitution III), with a "Session log" section. Docs:
      frontend-architecture-docs, patterns-docs.
- [x] T002 [P] Create `server/tsconfig.json` (NodeNext, `outDir` `server/dist`, strict) and add `server/` to the
      `exclude` list of the root `tsconfig.json` with a comment saying why. Docs: typescript-docs, nodejs-docs.
- [x] T003 [P] Add `.env.example` (variable names only, no values) and make sure `.env` and `server/dist/` are
      ignored in `.gitignore`.
- [x] T004 Ask the owner for the install of the phase 0 packages, naming each with purpose and size, then add to
      `package.json` and `package-lock.json`: express 5.2.1, pg 8.23.1, postgrator 8.0.0 and the dev types
      @types/express 5.0 and @types/pg 8.23.1; pin exactly where the version would drift past Node 20, with the
      reason next to the pin. Consent for this list was given on 2026-10-09; sizes are reported before install.
- [x] T005 [P] Create `compose.dev.yml` with PostgreSQL 16 (image pinned by digest), a health check and a named
      volume; the password comes from `.env`. Docs: docker-docs, postgres-image-docs.
- [x] T006 [P] Turn off the deploy workflow of the old repository's Pages build in this repository: find the file
      under `.github/workflows/` and remove or disable it, with a note in `REWRITE.md` (the new repository has no Pages
      deployment). Docs: github-actions-docs.
- [x] T007 [P] Add the npm scripts `server:dev`, `server:build`, `db:migrate`, `test:server` to `package.json`.

---

## Phase 2: Foundational (plan phase 0, blocks every story)

**Purpose**: the pool, migrations, app shell, request guards and the first measurement.

- [x] T008 Create `server/src/config.ts`: read the environment with `--env-file`, fail at start on a missing
      secret, never read `PUBLIC_*`; keep names in `.env.example` in step. Docs: nodejs-docs.
- [x] T009 Create `server/src/db/pool.ts` (one `pg` Pool, a `withTransaction` helper following the BEGIN, COMMIT,
      ROLLBACK, release pattern) and `server/src/db/health.ts`. Docs: node-postgres-docs.
- [x] T010 Create `server/src/db/migrate.ts` (postgrator 8.0.0 over a `pg` client, `migrationPattern`
      `server/migrations/*`, checksums on) and `server/migrations/001.do.baseline.sql`; the runner is a command, never run
      at server start. Docs: postgrator-docs (version "8"), postgresql-docs.
- [x] T011 Create `server/src/http/errors.ts` (the `{error, message}` shape and stable codes of
      `contracts/http-api.md`) and `server/src/http/app.ts` (Express 5, `trust proxy`, JSON body limit, the error
      handler). Docs: express-docs.
- [x] T012 Create `server/src/http/guards.ts`: JSON-only writes, `Origin` equal to the site origin,
      `Sec-Fetch-Site` same-origin when present, answering 403 `cross_site`. Needs: owasp-docs, mdn-docs.
- [x] T013 Create `server/src/main.ts` with `GET /healthz` (200 when the pool answers, 503 otherwise) and the
      listen call; no Astro yet.
- [x] T014 [P] Create the test harness `server/test/helpers/db.ts` (a throwaway schema or database per run, applies
      the migrations) and `server/test/health.test.ts`, `server/test/migrate.test.ts` using `node:test`. Docs:
      nodejs-docs.
- [x] T015 [P] Write `scripts/measure-ssr.mjs`: render one list page in process versus through loopback HTTP and
      print the difference; record the result and the decision (client module over HTTP, or `locals`) in `REWRITE.md`.
- [x] T016 Update `README.md` (new "Server" section: how to start the database, migrate, run the server) and
      `MIGRATION-PLAN.md` (status of plan phase 0); add the session-log entry to `REWRITE.md`.
- [x] T017 OWNER CHECK, plan phase 0: database starts; `npm run db:migrate` creates the tables; `/healthz` answers
      200 and 503 with the database stopped; `npm run test:server` passes; `npm run dev` behaves as before. Say what to
      run and what to look at.

**Checkpoint**: the skeleton stands; stories can start. US1 comes first.

---

## Phase 3: User Story 1 - the visitor reads the site as before (Priority: P1) - plan phase 1

**Goal**: posts and videos come from the database; every address and page is unchanged.

**Independent Test**: the quickstart's phase 1: import twice with no duplicates; the stored HTML equals today's
build; `npm run build` works with the database stopped; `check:pages` over HTTP passes; the route diff has no `<`.

### Tests first

- [x] T018 [P] [US1] `server/test/render.test.ts`: for every current post, the rendered HTML equals the output of
      today's build of the same Markdown; the sanitizer removes raw HTML and script, keeps math classes and code blocks.
      Docs: astro-markdown-pipeline-docs; Needs: owasp-docs.
- [x] T019 [P] [US1] `server/test/import.test.ts`: the import creates the expected rows, run twice makes no
      duplicates, and a changed source updates the row.
- [x] T020 [P] [US1] `server/test/future-date.test.ts`: an entry with a future `published_at` is absent from lists,
      feeds, search and sitemap queries.

### Implementation

- [x] T021 [US1] Ask the owner for consent to add `@astrojs/node` 8.3.4, `@astrojs/markdown-remark` 5.3.0 (exact) and
      `rehype-sanitize` 6.0.0 (or say that an own plugin is written instead), then install. Report sizes first.
- [x] T022 [US1] The first content tables: entries, posts and videos, with the tables saying which statuses and which
      people may see an entry, and their indexes.
      `server/migrations/002.do.entries-posts-videos.sql`: `entries`, `posts`, `videos`,
      `entry_audience_statuses`, `entry_audience_users`, their indexes (data-model.md). Docs: postgresql-docs.
- [x] T023 [US1] `server/migrations/003.do.entry-view.sql`: the `entry_view` SQL function; in this phase it knows
      `everyone` and `hidden` and the future-date and soft-delete rules; the other branches are added in phase 7.
- [x] T024 [US1] `server/src/access/entries.ts`: the only module that selects from `entries`, `posts`, `videos`;
      every read takes a viewer. Add `server/test/access-boundary.test.ts` that fails when any other file selects from
      those tables.
- [x] T025 [P] [US1] Make the shared plain modules free of Astro imports and used by both runtimes:
      `src/content/post-fields.ts`, `src/lib/summary.ts`, `src/lib/post-url.ts`, `src/lib/date.ts`; add
      `src/markdown/options.ts` holding the Markdown options and make `astro.config.mjs` import it, with a comment.
- [x] T026 [US1] `server/src/content/render.ts`: `createMarkdownProcessor` with `src/markdown/options.ts`, the
      sanitizer before KaTeX and Shiki, returning HTML, headings, plain text, summary and the pipeline version stamp; a
      stale stamp re-renders on read. Docs: astro-markdown-pipeline-docs.
- [x] T027 [US1] `server/src/content/validate.ts`: the first gate (front matter rules ported from the content
      Worker); the sanitizer stays the second. The full rule cases come with T094 later; here only the front matter shape.
      Docs: zod-docs.
- [x] T028 [US1] `server/src/cli/import-content.ts`: idempotent import of `src/content/posts/*.md` and the video
      entries into rows; paid lectures get `teaser` true by default; add `npm run import:content`. Docs: nodejs-docs,
      zod-docs.
- [x] T029 [P] [US1] `scripts/check-render.mjs` and `npm run check:render`: the byte comparison of T018 as a
      command that prints the differences.
- [x] T030 [US1] `server/src/content/api.ts`: `GET /api/posts`, `/api/posts/:slug`, `/api/videos`,
      `/api/videos/:slug`, `/api/terms`, `/api/search-index` (contracts); year grouping and pagination from
      `src/lib/lists.ts` rules; a guest index kept in memory with a version counter.
- [x] T031 [US1] `src/lib/api-client.ts`: one backend call per page; the in-process or HTTP choice from T015 stays
      behind this module.
- [x] T032 [US1] `astro.config.mjs`: `output: "server"`, `@astrojs/node` in `middleware` mode, with a comment; keep
      the `static` lines noted. Docs: astro-docs (version "4").
- [x] T033 [US1] `src/middleware.ts`: puts a `viewer` (guest for now) into `Astro.locals`; add the type to
      `src/env.d.ts`. Docs: astro-docs.
- [x] T034 [US1] Convert the routes to on-demand with no `getStaticPaths`: `src/pages/posts/[...page].astro`,
      `src/pages/posts/[slug].astro` (the current post route), `src/pages/tags/[slug]/[...page].astro`,
      `src/pages/categories/[slug]/[...page].astro`, `src/pages/video/[...video].astro`, `src/pages/index.astro`; keep
      `export const prerender = true` only on 404, about and the sign-in and sign-up pages (the search page has been on demand since T140, so its facets are the viewer's; the 404 page is on demand too, because a rewrite to it cannot reach a prerendered route). A year's address, /posts/<year>/ and /video/<year>/, reaches the single-entry route first, so `src/middleware.ts` passes it to the list route. Done 2026-10-10: all 149 pages of the build before come from the running server byte for byte the same, and the build works with the database stopped. Docs:
      astro-docs.
- [x] T035 [US1] Endpoints on demand: `src/pages/rss.xml.ts`, `src/pages/video/rss.xml.ts`,
      `src/pages/search/data.json.ts`, and `src/pages/sitemap.xml.ts` replacing `@astrojs/sitemap` (remove it from
      `astro.config.mjs` and `package.json` with the owner's word). Docs: astro-docs (version "4"), mdn-docs. Done 2026-10-10 with the owner's word: the sitemap stays at its old addresses, `/sitemap-index.xml` and `/sitemap-0.xml`, built by `src/lib/sitemap.ts`; `/rss.xml`, `/video/rss.xml`, `/search/data.json` and `/sitemap-index.xml` come back byte for byte as before and `/sitemap-0.xml` lists the same 119 addresses (in another order). `trailingSlash: "always"` makes on-demand endpoints answer only with a slash, so `src/middleware.ts` adds it inside the server.
- [x] T036 [US1] Mount Astro in Express: `server/src/main.ts` serves `dist/client` with `express.static`, then the
      Astro `handler`, last. Docs: express-docs, astro-docs. Also (found in T032): `astro preview` serves nothing in
      `middleware` mode (every address answers 404), so the scripts that spawn it (`check:auth`) need this server
      or a small static one; give them one here.
- [x] T037 [P] [US1] `scripts/check-bundles.mjs`: fails if any file of `dist/client` contains the database client or
      the content runtime (the 2026-10-02 trap of CLAUDE.md); add `npm run check:bundles`. Docs: vite-docs.
- [x] T038 [US1] Update `scripts/check-pagination.mjs` to read the lists over HTTP from the running server and keep
      its mirror of `src/lib/lists.ts` rules.
- [x] T139 [US1] Priority HIGH. G1 of parity-inventory.md. T034 also converts the routes it left out:
      `src/pages/video/[slug].astro`, `src/pages/tags/index.astro` and `src/pages/categories/index.astro`, which read
      tags and categories through `getTerms()` over `astro:content`. They take their data from `src/lib/api-client.ts`
      (`listTerms`, `getVideo`); `src/lib/terms.ts`, `posts.ts` and `video.ts` lose their content-collection callers
      once nothing else uses them. Without this the term pages and the single video page would stop showing data when
      the files are switched off.
- [x] T140 [US1] Priority MEDIUM. G2. The search shell stays prerendered but its Section, Category and Tag filter
      lists were written at build time from `getTerms()`; fill them from `GET /api/terms` for the viewer (client fill
      or an on-demand page) so a new tag appears and a hidden entry's tag never does. Re-measure the address of
      `/search/data.json` on the new server (the trailing-slash and `import.meta.env.DEV` rule of CLAUDE.md): moved to T035 and T036, because it can only be measured once the endpoint is on demand and a server serves it. Done 2026-10-10: the search page is on demand and its facets come from the backend.
- [x] T141 [US1] Priority HIGH. G3. The home page carousel: fixed in T032 (the folder is found from the working
      directory, public/ then dist/client/; the byte comparison found the loss). Keep the home page named in T133 and
      T134 as the check of it, and make `check:markup` fail on a home page with no `#home-carousel` section.
      Done 2026-10-10: `check:markup` also fails when the home page has no section, a slide count different from the
      photos in `public/images/carousel`, a photo that is not served, or no module script that moves the slides.
- [x] T148 [US1] Priority MEDIUM. G10. The sitemap built by T035 keeps the old exclusions: no `/page/<n>/` list pages,
      no `/auth/`, no `/admin/`; the admin pages T099, T107 and T110 are sent with `noindex` through the `Base.astro`
      prop, and T089 checks the sitemap and the feeds for them.
      Done 2026-10-10 for the pages that exist now, in `check:markup`: no `/page/<n>/`, `/auth/` or `/admin/` address in
      the sitemap; the sitemap equals the routes of the site minus those, and the old build's sitemap address for
      address (119 and 119); `noindex` on exactly the `/admin/` pages and on no public page. The rule is by prefix, so
      the admin pages T099, T107 and T110 are covered when they appear.
- [x] T150 [US1] Priority HIGH. G12. The build guards of `getVideos()` have no successor yet. Port them as rule cases
      of the importer (T028), of `server/src/content/validate.ts` and of the save path (T097): a paid entry's text
      carries no YouTube or Yandex Disk address (the block 2 included), a block marker in a public entry is refused, a
      block that cannot be recognised is refused, a public lecture needs its embed id. Add them to the cases of T094
      (which port the posts Worker's 129 only).
      Done 2026-10-10 in the part that exists now: `src/content/video-guards.ts` (`videoTextProblems`, plain module, no
      Astro import) holds the rules, the importer applies them before anything is rendered, `src/lib/video.ts` imports
      the same address patterns, and `server/test/video-guards.test.ts` and six cases in `import.test.ts` prove them.
      Still to do in T094 and T097: the editors' save path calls `videoTextProblems` and answers with its codes
      (`youtube_in_paid`, `yandex_in_paid`, `block_in_public`, `block_unrecognised`).
- [x] T154 [US1] Priority LOW. G16. `check:pages:stress` built a temporary project copy with 159 generated posts; with
      content in the database it has no meaning. Replace it with a run over HTTP against a throwaway database seeded
      with the same 159 posts, with the expectations of `scripts/check-pagination.mjs` (T038 or T091).
      Done 2026-10-10 as `scripts/stress-site.mjs` (`npm run check:pages:stress`, and `npm run stress:site` for
      measuring N posts over any span of years). Measured first, at the owner's request: see REWRITE.md.
- [x] T039 [US1] Route parity: regenerate `reference/astro-routes.txt` from the running server and diff with
      `reference/hugo-routes.txt`; only `>` lines are acceptable.
      Done 2026-10-10 with `scripts/list-routes.mjs` (crawl from `/`, the sitemap and seven unlinked pages): 149
      routes; the only `<` lines are the nine Hugo-only `/page/1/` aliases that CLAUDE.md accepts; 134 `>` lines.
- [x] T161 [US1] Priority MEDIUM. Scale, step 1 (owner, 2026-10-10, after the measurement of T154): the lists, the
      term pages, the feeds and the sitemap must not read the plain text of every entry. `visibleEntries` in
      `server/src/access/entries.ts` selects `plain_text` (and a video's description) for every row, which is 90% of
      what a list request moves (21 MB of 24 MB at 10 000 posts); only the search index and a video's card summary
      need it. Select the text only where it is used. The rules do not change, and every page stays byte for byte the
      same. Done when `npm run stress:site -- --posts 10000 --years 2000..2040` shows the list request at least
      twice as fast as before (235 ms in the hand query, 270 ms through the API) and `check:pages`,
      `check:pages:stress` and the route comparison pass. Docs: postgresql-docs, node-postgres-docs.
      Done 2026-10-10: `visibleEntries` takes how much text it needs (`none`, `videos`, `all`); only the search index reads
      the whole text. Measured at 10 000 posts (median): the API list 293 -> 177 ms, terms 227 -> 112 ms (twice), a list
      page 300 -> 180 ms, the sitemap 621 -> 356 ms, the feed 300 -> 164 ms. The goal of "at least twice" is met for the
      terms and not for the list (1.7 times): what is left is the visibility function over every entry (42 ms), the 6 500
      cards of the answer (2.1 MB of JSON) and the site cutting them itself, which is T162's work. Pages, both feeds, the
      search index and the sitemap are byte for byte what they were.
- [x] T162 [US1] Priority MEDIUM. Scale, step 2 (owner, 2026-10-10): year and page cut on the backend, so a page costs
      the same at 10 000 posts as at 100. The pagination rules (`pageNumbers`, `pageUrl`, `paginateList`,
      `yearLinks`, `yearSwitcher`, `groupByYear`) move from `src/lib/lists.ts` into a plain shared module that
      imports nothing from Astro (listed in `server/test/shared.test.ts`), used by the site and by the backend, so
      the rule still has one home. The list endpoints (`/api/posts`, `/api/videos` and the term lists) take a year
      and a page and answer that page, the number of pages and the list of years with counts; the list of years is
      cached by `contentVersion`. Years come from the data, never from a constant: a test seeds posts in 40 years,
      past and future, and in a year with no entries. The tag and category pages and `/video/` work the same.
      Done when every page of the current site is byte for byte the same, `check:pages` and
      `check:pages:stress` pass, and a page at 10 000 posts answers in under 50 ms median.
      Done 2026-10-10 in four commits. The rules are `src/lib/pagination.ts` (no Astro imports; `lists.ts` re-exports
      them; the three numbers of the owner's rules live there and `src/config.ts` takes them). One new route `GET
      /api/list` (kind, tag, category, year, page) in place of cutting in the site: years from one grouped query, the
      chosen year's light rows by a date range in the site's fixed offset, order by the one comparator (posts before
      videos on an equal instant, which is what the merged tag pages did). A guest's years and term counts are kept
      until `contentVersion` moves. Posts, video, tag and category routes ask for one page; the tag cloud, the Tags
      page and the search facets take counts; the neighbours of a post are read around its date (a few small reads,
      same answer as the whole list, tested). Measured at 10 000 posts in 41 years (median): a list page ~300 -> ~20
      ms, a tag or category page ~300 -> ~17 ms, the Tags page 8 ms; 149 pages byte for byte identical; `check:pages`
      and `check:pages:stress` pass; 127 tests. Left on the whole list on purpose: the sitemap, the two feeds (they
      need every address; 350 and 170 ms at 10 000), the search index (T163) and the Categories page, which prints
      every entry of every category by design.
- [x] T040 [US1] Update `README.md`, `MIGRATION-PLAN.md`, `REWRITE.md` session log, and the comments in every
      file edited; note the cache constant (10 seconds) in `REWRITE.md` for phase 8.
      Done 2026-10-10: README section on lists cut by the backend and the checks, MIGRATION-PLAN pointer, REWRITE.md
      entry with the constants for phase 8 (nginx guest cache 10 s, in-memory answers keyed by `contentVersion`,
      5 s timeout of the site's calls).
- [x] T133 [US1] Markup parity of every page type (added 2026-10-10 at the owner's word; the byte comparison of T018
      covers a post's body only). `scripts/check-markup.mjs` and `npm run check:markup`: build the old repository at
      `2b4aac9` (its path is an argument), fetch from the running new server the home page, a list, a year page, a tag,
      a category, a post with a formula and a code block, a video, search and account, and diff the `<main>` region of
      each against the old build's. Only the differences CLAUDE.md lists are accepted (the minifier's, asset hashes);
      anything else is printed and fails. Docs: nodejs-docs.
      Done 2026-10-10: it compares all 149 routes, whole documents and `<main>` regions; old build made from `git archive
      2b4aac9` of the old repository, in a temporary folder (the repository is untouched). 149 of 149 identical.
- [x] T134 [US1] Visual parity of every page type, SC-002 (added 2026-10-10 at the owner's word). Screenshots of the
      same page types as T133, light and dark, from the old build and from the new server, by the headless Edge
      procedure of CLAUDE.md ("Visual check"); the two sets side by side for the owner, the residual differences
      measured and recorded in `REWRITE.md`. A residual that is not already a recorded, accepted one is a defect.
      Done 2026-10-10 with `scripts/check-screenshots.mjs` (`npm run check:screenshots -- --old-dist <dir>`): 15 page
      types, light and dark, 1280 wide; 26 pairs of 30 identical, the rest are one glyph of 55 to 70 pixels that also
      differs between two captures of the old build alone. Report: see `REWRITE.md`.
- [x] T136 [US1] The sources of paid lectures in the database (added 2026-10-10 at the owner's word: the lectures stay
      where they are, Yandex Disk included, and their links must already be in the database).
      `server/migrations/006.do.video-sources.sql`: `video_sources` (one row per paid video: provider `youtube`,
      `vk`, `rutube` or `yandex-disk`, and a reference that no list, page or API answer ever carries) and the
      function `store_video_source`; `server/src/content/video-sources.ts` reads the old Worker's `VIDEOS` shape,
      `npm run import:video-sources -- <file>` stores it and prints counts only; `server/test/video-sources.test.ts`
      includes "the API never shows a source"; the access-boundary test knows the table. Done 2026-10-10 against the
      development database: 3 sources (2 YouTube demo ids, 1 Yandex Disk lecture). Removed by T135 with the other
      one-off tools; the table and the function stay.
- [x] T041 [US1] OWNER CHECK, plan phase 1: the main region of a post, `/posts/`, a tag, the categories, the feed
      and the search index match the current site apart from asset hashes; a formula and a code block render as before;
      `check:pages` passes; the build works with the database stopped; a post saved through the API is on the lists.
      The owner is shown the results of T133 and T134, not only the pages: this task is not done without them.
      Accepted by the owner 2026-10-10 after the results of T133, T134, T162 and the checks above (149 of 149 pages,
      feeds and search index equal by md5, the build with the database stopped).

**Checkpoint**: US1 delivers the new content home with no visible change; it is the MVP.

---

## Phase 4: User Story 3 - own sign-up and sign-in (Priority: P1) - plan phase 2

**Goal**: accounts, sessions, limits and the header without a flicker; Clerk and React gone.

**Independent Test**: quickstart phase 2: sign up as guest, sign in by address and by login, a second session ended
from the first, wrong passwords slow the account without locking it for good, a temporary password forces a change.

### Tests first

- [x] T042 [P] [US3] `server/test/password.test.ts`: scrypt parameters recorded in the hash string, verify, the
      semaphore limits concurrency, minimum 8 and maximum 128.
      Written 2026-10-10 as `todo` cases (8 of them, 0 failing) against the stubs `server/src/auth/password.ts` and
      `server/src/auth/semaphore.ts`; T047 writes the real module and removes the flag. OWASP Password Storage Cheat
      Sheet confirms N=2^17, r=8, p=1 as its first scrypt setting; ASVS 5.0 V6.2.1 asks for at least 8 characters
      (15 strongly recommended) and the Authentication Cheat Sheet for a maximum of at least 64: 8 and 128 are within.
- [x] T043 [P] [US3] `server/test/session.test.ts`: renewal on sign-in and on a change of rights, idle and absolute
      expiry per status, revocation, cookie flags (`__Host-`, `Secure`, `HttpOnly`, `SameSite=Lax`).
      Written 2026-10-11 (owner chose variant A of the lifetimes, the plan's numbers, blocked stays on the editor tier):
      9 cases, 8 `todo` until T046 and T048, one passing now (the lifetimes by tier). The lifetimes are
      `src/lib/session-lifetimes.ts` (plain module, `site.auth.sessionLifetimes` takes them from there); the stub of
      `server/src/auth/session.ts` fixes the signatures.
- [x] T044 [P] [US3] `server/test/signin.test.ts`: address versus login by the presence of `@`, the same answer for
      unknown, wrong and expired, back-off 1, 5, 15 minutes and never permanent, a temporary password reaches only the
      change form, an expired one is refused, a passwordless imported account cannot sign in.
      Written 2026-10-11 (owner chose variant A and the project's own code for the address limit): 9 cases, all `todo`
      until T047, T049, T050 (0 failing), against the stubs `server/src/auth/limits.ts` and `signin.ts`. Numbers: five
      failures in a row bring 1 minute, the tenth 5 minutes, the fifteenth and every fifth after it 15 minutes, never
      permanent; one address 20 failures in 15 minutes. Attempts made inside a pause do not count, and an unknown
      identifier is paused the same way, so the pause cannot be used to find accounts.
- [x] T045 [P] [US3] `server/test/next-path.test.ts`: the `nextPath()` rule (the `/\host/` and tab-after-slash
      cases of 2026-09-28) on the server.
      Written 2026-10-11: 6 cases, all `todo` until T051, against the stub `server/src/auth/next-path.ts`
      (`nextPath(raw, origin, fallback)`). Every expected value was first checked against the rule as it stands in
      `src/scripts/auth.ts`; the one addition is a length cap (2000 characters fall back instead of being echoed).

### Implementation

- [x] T046 [US3] `server/migrations/012.do.users-sessions.sql`: `users`, `sessions`, `login_attempts`,
      `audit_log` (data-model.md), the status check constraint, the case-insensitive unique indexes.
      Done 2026-10-11 and applied to the development database: the four tables, the two foreign keys that migration 002
      was waiting for (`entries.created_by`, `entry_audience_users.user_id`; 0 rows of 45 carried a value), indexes on
      `lower(email)` and `lower(login)`, and a trigger that makes `audit_log` refuse UPDATE, DELETE and TRUNCATE (the
      owner's variant A). `login_attempts` has three kinds of key: account, identifier (a hash of an unknown one, so
      the pause cannot tell accounts apart) and address; kept 30 days. `server/test/schema-accounts.test.ts`, 5 cases
      passing. No data to move: the old site's members come with T055.
- [x] T047 [US3] `server/src/auth/password.ts`: `crypto.scrypt` at N=2^17, r=8, p=1, raised `maxmem`, a counting
      semaphore of two; the parameter string is part of the hash. Needs: owasp-docs; Docs: nodejs-docs.
      Done 2026-10-11: `server/src/auth/password.ts` and `semaphore.ts`; the 8 cases of T042 run now (no `todo`) plus
      3 added: `spendHashingTime` (what an unknown identifier calls so the time does not tell it apart), a crafted
      string cannot ask for absurd cost (N, r, p capped), and NFKC normalisation. One hash is about 257 ms on this
      machine. No new dependency.
- [x] T048 [US3] `server/src/auth/session.ts`: 256-bit id, SHA-256 stored, `__Host-` cookie, lifetimes read from
      `src/config.ts` (`site.auth.sessionLifetimes`, one constant each), renewal rules, session list.
      Done 2026-10-11: the module is real and the 8 `todo` cases of T043 run and pass, plus 2 added (address prefix
      for IPv4, IPv6 and the mapped form; the idle clock is written at most once a minute and expired rows are
      swept by `deleteExpiredSessions`, which the periodic job will call). The idle length is read from the
      account's current status at every use, so a change of rights takes effect at the next request. Renewal
      deletes the old id and creates the new one in one transaction, with fresh clocks. No new dependency.
- [x] T049 [US3] `server/src/auth/limits.ts`: per address in memory, per account in the database
      (`failed_count`, `locked_until`), back-off, never permanent; decide at this task, with the owner, whether a
      package replaces it. Needs: owasp-docs, express-rate-limit-docs (only if the package is chosen).
      Done 2026-10-11: own code, no package (owner's choice). `server/src/auth/limits.ts`: `pauseAfterFailures`, the
      in-memory `AddressLimiter` (sliding window, 20 failures in 15 minutes, bounded to 10 000 addresses), and the
      database part: `pauseRemainingSeconds`, `recordFailedAttempt` (an account in `users`, an unknown identifier as
      rows of `login_attempts` under a SHA-256, paused by the same function), `clearFailedAttempts`,
      `deleteOldAttempts` (30 days, for the periodic job). The numbers and the window cases of T044 run; new
      `server/test/limits.test.ts` has 3 cases. T050 must ask for the pause before looking at the password and
      record only the attempts it checked.
- [x] T050 [US3] `server/src/auth/routes.ts`: `signup`, `signin`, `signout`, `change-password`, `me`, `sessions`
      (contracts); `limited` sessions for `must_change`; every write behind the guards of T012.
      Done 2026-10-11, with the owner's three choices of the sketch: an address already registered says so (409);
      sign-up has a hidden honeypot field and at most 10 sign-ups an hour per address (T159, variant A; the fill-time
      rule waits for T104); a wrong current password in change-password counts against the account like a sign-in.
      `server/src/auth/signin.ts` (core, the 9 cases of T044 run), `accounts.ts` (read, create, change password),
      `routes.ts` (7 routes, mounted under `/api/auth` behind the cross-site guard), `session.ts` gained
      `handleOf` and `endSessionByHandle`, `errors.ts` an optional `field`, `AddressLimiter` takes its numbers as
      options. New `server/test/auth-routes.test.ts` (8 cases over HTTP). 187 pass, 0 todo, 0 fail.
- [x] T051 [US3] `server/src/auth/next-path.ts` and its use in `signin`; the rule stays in this one place.
      Done 2026-10-11: the function moved from `src/scripts/auth.ts` with origin and fallback as arguments, a
      2000-character cap, and a fall-back instead of an exception for a string the URL parser rejects. The 6 cases of
      T045 run and pass. The browser copy is removed with Clerk (T054); its use in `signin` comes with T050.
- [x] T052 [US3] Wire the viewer: `src/middleware.ts` reads the session through the backend and fills
      `Astro.locals.viewer`; `src/components/AuthButton.astro` and the inline block of `src/layouts/Base.astro` draw
      the header from it so the icon is right at first paint (the flag `kb-auth-expires` goes away).
      Done 2026-10-11, with T142 (owner chose rendering the five pages on demand, not a presence cookie): the
      backend reads the session in one place, `server/src/auth/viewer.ts` (`viewerOfRequest`), and the content API
      uses it; the site's middleware asks `/api/auth/me` when a Cookie header is present; `Base.astro` writes
      `kb-member` on the html element and `AuthButton.astro` its address and label from the server; the six
      `prerender = true` lines (about, auth x3, admin x2) are gone. A guest's pages stay byte-identical: 149 of 149
      by `check:markup`. NOT done here, by decision: the inline block of `Base.astro` that reads the old flag is left
      as it was (it is inert, nothing writes the flag any more) because removing it changes a guest's markup; it
      goes with the Clerk scripts in T054, where the markup check gets the listed difference. A session that must
      change its password reads as a guest on every page. 190 tests pass; viewer.test.ts has 3 cases.
- [x] T053 [US3] Rewrite `src/pages/auth/signin.astro`, `signup.astro`, `account.astro` to forms posting to the
      API; account page shows status, sessions, the forced-change form; keep their addresses. Needs: tailwind-docs.
      Done 2026-10-11, after the owner approved the sketch and chose: the tries left shown from the third failure and a
      live countdown on every form (sign-in, sign-up, change of password), a repeat-password field, and a show/hide eye
      on every password field. New: `src/scripts/auth-forms.ts` (requests, countdown, eye toggles),
      `src/components/AuthField.astro` (the feedback form's classes, `ym-disable-keys`), the three pages rewritten with
      the same addresses. The server's 401 and 400 answers carry `attemptsLeft` and `retryAfterSeconds` (and `problem`
      on a form field); `/api/auth/me` carries `blockedBy`. Carried over from the old account page: status in words,
      the blocked note naming who closed the access, the panel links for metr and admin, the device list with the one
      in use marked, sign-out. NOT carried yet, as the task list says: paging the devices five to a page and editing
      the name and login (T146). `check:markup` lists the three pages as rewritten on purpose; 146 of 149 compare
      identical. No tailwind-docs call was needed: the classes are the feedback form's. 190 tests pass.
- [x] T054 [US3] (first part; the rest is T167) Remove Clerk and React: `src/scripts/auth.ts`, `auth-flag.ts`, `same-page.ts` (reduce to what the
      new pages need), `src/scripts/account-status.ts`, `@clerk/*`, `react`, `react-dom` from `package.json`, the
      Clerk keys from `src/config.ts`; confirm no Clerk chunk in `dist/`. Docs: astro-docs.
      Split 2026-10-11 at the owner's choice (variant A): the admin pages and the paid-video player still use the
      previous provider's session and are the reference for their rewrites (T070, the lecture player of phase 4, the
      editor of phase 6), so the packages and the scripts those three need stay until T167. Done now: the inline flag
      block of `Base.astro`'s head, `account-devices.ts`, `account-status.ts` and `styles/clerk.css` (unused by any
      page); `check:markup` removes the old flag block from the old pages before comparing and prints how many.
      The status is written "мэтр" in every visible string (the owner's spelling). Sign-in, sign-up, account and every
      public page no longer load anything of the previous provider.
- [x] T055 [US3] `server/src/cli/import-members.ts`: reads an exported list of addresses (a path argument, never
      committed), creates guest accounts with no password, idempotent, writes one audit row per run; add
      `npm run import:members`.
      Done 2026-10-11 after the owner's sketch review: `server/src/cli/import-members.ts` (parser and import),
      `import-members-cli.ts`, `npm run import:members -- <path> [--dry-run]`. Two formats (a plain list; the previous
      provider's CSV, of which only the address, the name and the login are read and every other column is only
      named). The owner's rules: the file is accepted whole or refused whole (line numbers and reason codes, never the
      text); every account is a guest with no password and no status or date is read (the statuses cannot be taken out
      of the export, so administrators give them, owner 2026-10-11); an existing account is never touched; a login that
      is not valid or is taken is left out and counted; one transaction; a dry run rolls back; one audit row with
      counts and column names. 8 tests, 201 pass. 1000 addresses go in well under a second. Removed by T135.
- [x] T056 [US3] Server-side `/auth/` page access: guests see sign-in and sign-up; members are sent to the account
      page; a `must_change` session sees only the change form.
      Done 2026-10-11, with the owner's two choices of the plan: only the /auth/ pages are restricted for a session that
      must change its password (the rest of the site is open to it as to a guest), and a signed-in visitor of the
      sign-in or sign-up page is sent on to `next` when it is a page of this site, otherwise to the account page (a
      `next` that is itself sign-in or sign-up counts as not worth going to, so no loop). The rule lives in
      `src/middleware.ts` (`authPageRedirect`), answers 302 with `Cache-Control: no-store`, and uses the one
      `nextPath`, moved to the shared `src/lib/next-path.ts`. The account page reloads itself when the back-forward
      cache brings it back after a sign-out. 5 tests on the real built site (`server/test/auth-pages.test.ts`), 206
      pass. Source: astro-docs 4.16, "Middleware" (`onRequest()` returns a Response, directly or through `next()`).
- [x] T142 [US3] Priority HIGH. G4. The header must be right from the first paint (FR-016) on every page, but the
      pages T034 keeps prerendered (about, 404, the search shell, sign-in, sign-up) are static files with no viewer.
      Decide in T052 between rendering those pages on demand and a presence cookie that the inline block reads; test
      both the first paint and the Back button after sign-out (bfcache) in T058 and add a case to T043 or T044.
      Decided and done 2026-10-11 in T052: on demand. The Back button case (bfcache) is the `pageshow` handler in
      `AuthButton.astro`, which asks `/api/auth/me`; T058 and T153 must exercise it in a browser.
- [x] T166 [US3] Priority MEDIUM. Owner, 2026-10-11, seeing the new account page: the account page keeps the layout the
      previous provider's card had - a menu on the left (profile, security, devices; and for a metr or an admin the
      panel sections once they exist) and the content of the chosen item on the right. Same classes and both themes;
      done together with T146, which fills the profile and devices sections. Check against the screenshots of the old
      account page in `parity-inventory.md` where they exist; otherwise ask the owner for one.
      Done 2026-10-11 together with T146: a menu on the left (Профиль, Безопасность, Устройства; for a metr and an
      admin the block "Управление" with the two panel links, kept as they were; sign-out at the bottom), the chosen
      section on the right and in the address hash (#profile, #security, #devices); a row of tabs above the content
      below the md breakpoint; with no scripts the three sections stand one under another. The owner chose the
      variants A of the sketch (tabs on narrow screens, panel links kept).
- [x] T146 [US3] Priority MEDIUM. G8. The account page gets what Clerk's card gave: editing the display name and login
      name, and the list of devices five to a page (reusing the `Pagination.astro` rule or
      `src/scripts/admin-pager.ts`). Changing the email address waits for plan phase 9 (FR-012a); record that.
      Done 2026-10-11: `PATCH /api/auth/profile` (`updateProfile` in `accounts.ts`; sign-up's constants, one home;
      full session only; 409 for a taken login; empty login removes it; audit row `profile_changed` names the fields
      and never the values; the owner chose not to ask for the current password, variant A). The devices are five to
      a page by `site.pagination` through `AdminPager.astro` and `bindPager` (`pageCount` takes the page size). The
      address is shown and not editable, with a line saying so: its change is the phase 9 work (FR-012a). 207 tests
      pass, `check:markup` 146 identical of 149, `check:bundles` and `check:pages` pass.
- [x] T153 [US3] Priority MEDIUM. G15. Rewrite `scripts/check-auth-browser.mjs` for the new pages (Edge over CDP, as
      today): the header at first paint, `next`, sign-out, the session list, no Clerk chunk on any page; keep `npm run
      check:auth`. Needs the server of T036 (`astro preview` serves nothing in middleware mode).
      Done 2026-10-11 (owner approved the three recommended variants): the script starts its own server and a
      throwaway database, drives headless Edge, and makes 55 checks: the header in the first byte for a guest and a
      member on five pages and in both themes, who sees which /auth/ page, `next`, the form with the tries left and
      the countdown, a temporary password, seven devices in two pages, ending one and all the others, profile,
      password change, sign-out and the Back button, and no provider CODE in anything a page loads (decided by
      content, through the imports between chunks; the bare name is only listed as a note: the publishable key in
      `src/config.ts` and some comments are T167's). It found a real defect: a body-less DELETE was refused by the
      cross-site guard, so no device could be ended from the page; fixed in `sendJson` (always sends the content
      type on a write). `npm run check:auth` now builds the site and the backend first.
- [x] T159 [US3] Priority MEDIUM. G21. Clerk's bot protection on sign-up has no counterpart and an account costs
      nothing: add the honeypot field and the fill-time rule of T104 to sign-up (T050), or record the owner's decision
      that guests are harmless until given a status (they cannot comment, FR-032).
      Done 2026-10-11 in T050 (owner chose variant A): the honeypot field `website` and a cap of 10 sign-ups an hour
      per address. The fill-time rule is left with T104; T053 must render the honeypot field out of sight.
- [x] T057 [US3] Update `README.md`, `AUTH.md` (superseded sections marked, not deleted), `MIGRATION-PLAN.md`,
      `REWRITE.md` session log.
      Done 2026-10-11: README (the own sign-in paragraph, the commands, the Clerk paragraphs marked superseded), AUTH.md
      (a note on sections 10, 11 and 12 saying what still stands), MIGRATION-PLAN.md (one bullet), REWRITE.md. Nothing deleted.
- [x] T058 [US3] OWNER CHECK, plan phase 2 (the criterion "no provider chunk in the build" reads, until T167: on no page
      except the admin pages and the paid video page): a new account is a guest; the header shows the account icon with no
      flicker; sessions on two devices are listed and ended; the temporary-password flow; no Clerk chunk in the build.
      Accepted by the owner 2026-10-11 after the owner's own check on http://localhost:3000/. The temporary-password flow is
      covered by `check:auth` only: the issue of a temporary password is plan phase 3.

---

## Phase 5: User Story 4 - statuses, administrators, the superuser (Priority: P2) - plan phase 3

**Goal**: the status rules and the one protected superuser, recoverable and transferable.

**Independent Test**: quickstart phase 3 and the rehearsals of `security-review-superuser.md` section 6.

### Tests first

- [x] T059 [P] [US4] `server/test/status-rules.test.ts`: port every case of the statuses Worker's 68, add the
      temporary-password actor matrix and the "protected" answer for the superuser.
      Done 2026-10-11 (step 1 of the three-step plan the owner approved): `server/test/status-rules.test.ts`, 9
      table-driven tests of the Worker's rules in its own order; the list of statuses is checked against the
      check constraint of migration 012.
- [x] T060 [P] [US4] `server/test/superuser.test.ts`: the refusals and successes listed in the security review
      section 6 (handover to a non-admin, wrong password, after expiry or cancel, a second open request, a spent or
      voided or invented recovery code, rate limited, any route that changes the superuser, one's own status).
      Done 2026-10-11 (step 2): `superuser.test.ts`, `handover.test.ts`, `superuser-routes.test.ts`.
- [x] T061 [P] [US4] `server/test/superuser-writes.test.ts`: fails if any statement outside the status module
      writes `is_superuser`.
      Done 2026-10-11: `superuser-writes.test.ts` reads the sources of the server, the site and the scripts.

### Implementation

- [x] T062 [US4] `server/migrations/013.do.superuser-recovery-handover.sql`: the partial unique index on
      `is_superuser`, `recovery_codes`, `handover_requests` with its partial unique index (data-model.md).
      Done 2026-10-11: three parts in one file; no existing data to move (no row has the flag).
- [x] T063 [US4] `server/src/users/status-rules.ts`: the statuses and who-gives-what as one plain module with no
      Astro imports; add the status list to `src/config.ts` and a test that the migration's check constraint and the
      module agree.
      Done 2026-10-11: `server/src/users/status-rules.ts` (plain module, no imports; `refusalOfChange`,
      `refusalOfTemporaryPassword`, `assignable`); `site.admin.statuses` already held the list in `src/config.ts`.
- [x] T064 [US4] `server/src/users/audit.ts`: append-only audit writer; no update or delete statement exists.
      Done 2026-10-11: one INSERT, usable inside a transaction; a test greps the server source for any statement
      that changes or removes an audit row or deletes an account.
- [x] T065 [US4] `server/src/users/routes.ts`: `GET /api/admin/users`, `PATCH .../status`, `POST
      .../temp-password` (shown once, 30 days, voids the previous, `must_change`), block and lift under the rules of
      ADMIN.md section 2.
      Done 2026-10-11: `server/src/users/routes.ts`, mounted at `/api/admin`; the target row is locked with FOR
      UPDATE and the audit row commits with the change; 404 to anyone who may not use it, 403 with a `reason`
      otherwise; the list searches by substring (name, address, login) and pages at 20 (at most 50). The temporary
      password is 80 bits (owner's choice, 2026-10-11), `server/src/users/temp-password.ts`. 228 tests pass.
- [x] T066 [US4] `server/src/cli/superuser.ts`: `create` (password from the terminal, prints ten recovery codes
      once), `set-password`, `hand-over <email>` (instant); add `npm run superuser`. Docs: nodejs-docs.
      Done 2026-10-11 (owner's choices A): `create` makes or promotes any account, `hand-over` goes to any existing
      account which becomes an admin, `set-password` leaves the codes; plus `status`. The password is typed with the
      echo off and never taken from an argument; with no terminal the command refuses. Not yet tried at a real
      terminal by the owner: run `npm run db:migrate`, then `npm run superuser -- create <address>`.
- [x] T067 [US4] `src/config.ts`: add `site.admin.handoverCoolingHours` as the single constant (24; zero means
      instant) with a comment pointing at the security review; no other place holds the number.
      Done 2026-10-11: the number lives in `src/lib/handover-rules.ts` (the backend cannot compile config.ts),
      `src/config.ts` re-exports it as `site.admin.handoverCoolingHours`; listed in `shared.test.ts`.
- [x] T068 [US4] `server/src/users/handover.ts`: start (password re-entered, target must already be an admin),
      accept (target's own password), cancel, `effective_at` from the constant, completion in one transaction that
      clears the old flag, sets the new, ends every session of both, and logs; a job completes due requests.
      Done 2026-10-11: `server/src/users/handover.ts`; the job is a timer in `main.ts` (once a minute and at start,
      owner's choice A); a request lapses after 7 days; the target must be an admin at the start and at the end.
- [x] T069 [US4] `server/src/users/recovery.ts`: ten codes of at least 80 random bits, SHA-256 stored, shown once;
      use sets a new password, ends every other session, voids the rest and issues a fresh set at next sign-in;
      regenerate after the password; one answer for every kind of failure; per-address and global limits.
      Done 2026-10-11: `server/src/users/recovery.ts`; the fresh set is returned in the answer of the request that
      spent the code (nothing is kept to be shown later); limits are 5 failures an address in 15 minutes and 30 an
      hour in all, neither per account.
- [x] T070 [US4] Pages: rewrite `src/pages/admin/users.astro` against the new API; add the handover and recovery
      blocks to the superuser's account page and the "pending handover" banner; metr and admin see the user list; every
      other viewer gets 404, not a redirect.
      Step 3a done 2026-10-11: `/admin/users/` is 404 to everyone but a metr and an admin (decided in the page's
      frontmatter from the viewer) and `src/scripts/admin-users.ts` asks `/api/admin/users` with the cookie; a
      temporary password is issued from the row and shown once with its end date. `check:auth` has 8 new checks
      (63 pass). Open in T070: the superuser's blocks and the handover banner on the account page (step 3b).
      Step 3b done 2026-10-11: the account page has the banner for both sides of an open hand-over (accept with
      the asked side's password, decline before accepting, cancel for either side while it waits), and for the
      superuser a section with the list of administrators, the start form and the ten recovery codes (create a
      new set with the password, shown once with a copy button, count of unspent codes). Two small server
      additions: `?status=` on the users list and `recoveryCodesLeft` on `GET /api/account/handover`.
      `check:auth` has 13 more checks (76 pass); 247 server tests pass. Still open in T070: nothing; T168 (the
      recovery page) is step 3c.
- [x] T071 [US4] Delete `workers/statuses/` and its drift test `scripts/check-statuses.mjs` and the `ADMIN_IDS`
      dependency (`npm run statuses:*`, `settings.local.json` mention) once T059 passes; update `ADMIN.md`.
      Done 2026-10-11: six tracked files removed (the Worker and its README, the drift check, the three `statuses-*`
      scripts); `package.json` lost the three commands and keeps its two old notes with a third that says why;
      `dev-all.mjs` starts two services; `site.admin.statusesEndpoint` and `statusesDevEndpoint` left
      `src/config.ts`; ADMIN.md, README.md, CLAUDE.md and ADMIN-GITHUB-PAGES.md carry dated notes. No ignored local
      file of the service (key, settings) existed in this working copy, so nothing outside git was deleted. The
      68 cases live on in `server/test/status-rules.test.ts` (T059).
- [x] T072 [US4] Rehearse on a copy of the data: server command, handover with cooling, recovery with a code, each
      ending in a sign-in as the new holder and failing safely on a second use (SC-010); record the result in
      `security-review-superuser.md` section 6.
      Done 2026-10-11: `npm run rehearse:superuser` (`scripts/rehearse-superuser.mjs`), 26 checks, all passed; the
      record is in `security-review-superuser.md` section 6 with what it did not cover (the prompt at a real terminal,
      the real clock, the club's real accounts at T135).
- [x] T073 [US4] Add the residual-risk entry for a leaked recovery code to `RISKS.md` with a review date; update
      `README.md`, `MIGRATION-PLAN.md`, `REWRITE.md` session log.
      Done 2026-10-11: `RISKS.md` section 3 (what is risked, what makes it acceptable, what it does not cover, review
      on 2027-04-11 and before phase 8, the owner confirms it with T074); the three documents carry the phase 3
      status.
- [x] T168 [US4] Priority MEDIUM. Owner, 2026-10-11 (step 2 of plan phase 3): the recovery route
      `POST /api/superuser/recover` is called with no session, so it needs a page of its own: `/auth/recover/`, with
      the address or login, one recovery code and the new password twice (the eye icon like the other forms), the
      paused-with-countdown answer of the sign-in form, and the fresh set of ten codes shown once with a copy
      button after success; a link to it from the sign-in page. Done together with T070 (step 3); add the page to
      the rewritten-on-purpose list of `check:markup` and a case to `check:auth`.
      Done 2026-10-11 (step 3c, owner's variant A): `src/pages/auth/recover.astro` with a link "Восстановить по коду"
      on the sign-in page; one sentence for every refusal of address and code, the new password's rules in words,
      the 429 pause as a countdown, the fresh set of ten shown once with a copy button. `check:auth` has 9 more
      checks (85 pass). The page is not in the `check:markup` list: that list is the 149 routes of the old
      application, and this page is new; `check:markup` instead learnt that `/admin/users/` answers 404 to a
      guest by design (T070) and reports it as gated. `check:markup` defaults to the owner's :3000; run it with
      `--origin` of a throwaway server.
- [x] T169 [US4] Priority MEDIUM. Owner, 2026-10-11, after the hosting question: the first superuser, and a new one
      when none is left, must be creatable on a hosting with no command line. Owner's order: right after step 3 of
      plan phase 3 (no hosting is chosen yet). Recommended design, to be shown as a sketch before any code: while no row has
      `is_superuser`, the server makes one setup token at start (128 bits, kept in memory only, never in the database,
      printed to the server log only, valid 60 minutes, a new one at each restart); the page `/auth/setup/` takes the
      token, an address and the password twice and makes the account through the same `createSuperuser()` that the
      command uses (so `superuser-writes.test.ts` still sees one writer); the page and the route answer 404 for ever
      once a superuser exists; wrong tokens are counted per address like recovery codes and one answer covers every
      failure; ten recovery codes are shown once at the end. Alternative recorded: two environment variables read once
      at start (address and password), then required to be changed at the first sign-in - simpler, but the password
      sits in the hosting panel. Tests: no token once a superuser exists, token not in the database or any answer,
      expired token, wrong token paused, the role cannot be taken by a second caller racing the first. Docs:
      owasp-docs.
      Done 2026-10-11 (owner's variant A2, with the emergency switch and the log code as the fallback): the owner's
      question showed that a code in the server log needs a log reader, which a hosting with no command line may not
      give, so the code comes first from `SETUP_CODE` in the hosting's settings (24 characters or more, refused
      otherwise), and only when it is not set from a code the server makes and prints in its log, renewed every hour
      while the door is open. `ALLOW_SUPERUSER_SETUP=1` opens the page although a superuser exists (the old holder
      stays an admin). Files: `server/src/users/setup.ts`, `setup-routes.ts`, `setupSuperuser` in `superuser.ts`,
      `src/pages/auth/setup.astro`, `getSetupOpen` in `src/lib/api-client.ts`, `server/test/setup.test.ts` (7
      tests), 6 new checks in `check:auth` (91 pass), `.env.example`. The test of two callers at once found that
      `createSuperuser` took no lock when no holder existed and answered the second caller with a database error;
      it now answers `exists`. The door is in `RISKS.md` section 4.
- [x] T170 [US4] Priority HIGH. Owner, 2026-10-11 (after T169 and the rehearsal's path D): the four ways of making or
      moving the superuser (A command, B hand-over, C recovery code, D setup door) must not contradict one another and
      there must always be a way back; the consilium of that day (five archetypes and the interrogator, verdict in
      `.specify/consilium/2026-10-11-superuser-mechanism.md`) judged the code and the owner approved the full
      variant. Done 2026-10-11: (1) `server/src/users/credentials.ts`: one function sets a password, ends the sessions
      and closes an open hand-over of either side (audit `handover_closed`, reason `credentials_changed`; the role
      moving closes with `role_moved`, which was silent before); called by the command's `create` and `set-password`,
      the recovery code, the setup door, the account page's change of password; an admin's temporary password calls
      the closing too; a source test fails when another file sets `password_hash` (F1). (2) The emergency switch
      works only with `SETUP_CODE` (the switch alone is ignored with a log line: a code printed in a log must never
      replace a holder), for 30 minutes after the start and for one use (N1, F2). (3) `lockAccounts`: accounts are
      locked in id order in the command's hand-over, the setup door and `completeOne`, and the request row after the
      accounts (F7). (4) Log warnings at start (switch on; switch ignored; `SETUP_CODE` left in place) (R5). (5) The
      setup door writes `superuser_password_set` (via `setup_door`) for the holder's own address instead of a
      replacement, and its `superuser_setup_used` row cannot turn a success into a 500 (N6). (6) `SUPERUSER.md`, the
      one document on how we work with the superuser, with a table of ways held against the code by tests
      (`superuser-ways.ts`, `superuser-ways.test.ts`); stale statements in the review and risks corrected.
      Verified: 267 server tests (13 new), rehearsal 46 checks (3 new in path D plus the closing by a recovery code).
- [x] T171 [US4] Priority LOW. From the consilium of 2026-10-11 (N3): a correct recovery or setup code is stopped by
      the global ceiling of failures (30 an hour) while an attacker keeps it exhausted from six addresses. A code of
      80 or 128 bits cannot be guessed online, so a correct one may pass the ceiling (the per-address pause stays);
      tests: ceiling exhausted and the right code works; the wrong one still gets the same answer and the pause.
      Done 2026-10-11: the recovery route and the setup door let a right code past the global ceiling (not past the
      per-address pause); `server/test/code-limits.test.ts`. `SUPERUSER.md` section 8 says it.
- [x] T172 [US4] Priority LOW. From the consilium of 2026-10-11 (performance): `redeemRecoveryCode` counts a failure
      after the lookup, so a burst of parallel wrong codes all pass the limit check before any is counted and all spend
      the hashing time. Reserve the attempt before the lookup and give it back on success (a `forgive` on
      `AddressLimiter`); test: a burst of 50 wrong codes is let through at most as many times as the limit.
      Done 2026-10-11: `AddressLimiter.forgive`; the attempt is counted before the lookup and given back when it was
      right; 50 parallel wrong codes: 5 answered, 45 limited (`code-limits.test.ts`).
- [x] T173 [US4] Priority LOW. From the consilium of 2026-10-11 (F4): after way A's hand-over and way B the new holder
      has no recovery codes until it makes a set; the account page of a superuser with zero unspent codes shows a
      prominent block asking for a set (with the password typed again), and `npm run superuser -- status` says the same.
      Done 2026-10-11: the line of the account page is an amber box that says the consequence in words when there are
      none; `status` prints the instruction. The line is written by the page's script and `check:auth` does not read
      it, so the owner's check T074 is where it is looked at.
- [x] T174 [US4] Priority LOW. From the consilium of 2026-10-11 (nitpicker 8): the limits 5 per 15 minutes and 30 an
      hour and `emailShape` are literals in both `recovery.ts` and `setup.ts`, and the email is validated twice on
      the door's path; one constant object and one validator, per constitution III. No behaviour changes; the existing
      tests are the proof.
      Done 2026-10-11: `CodeAttemptLimits` in `auth/limits.ts` (extended by `RecoveryLimits` and `SetupLimits`,
      so the counters stay separate) and `isAcceptableAddress` in `superuser.ts`.
- [x] T074 [US4] OWNER CHECK, plan phase 3: a metr cannot make a metr or an admin; nobody changes their own status;
      the superuser is protected; a blocked member sees only public entries; the role moves only after acceptance and
      the cooling period; a recovery code works once and sets a new password. Since 2026-10-11 also: read
      `SUPERUSER.md`; a changed password closes an open hand-over; the setup page on an empty database; the emergency
      switch is one use and 30 minutes; `npm run superuser -- create <address>` once at a real terminal.
      Closed 2026-10-11 on the owner's word, WITHOUT a hands-on walkthrough: the owner had no way to try the list
      and trusted the automated checks (271 server tests, rehearsal 46 checks, `check:auth` 91, `astro check` 0
      errors); anything that fails in production is corrected then. Not exercised by any person or script: the
      hidden password prompt of `npm run superuser` at a real terminal, and the amber "no codes" block of the
      account page (rendered by script, not read by `check:auth`). Both stay on the switch-day rehearsal (T135).

---

## Phase 6: User Story 5 - lectures from the club's server (Priority: P2) - plan phase 4

**Goal**: lecture files served after a per-request check; the members-only block is a real lock.

**Independent Test**: quickstart phase 4.

### Owner decision first

- [x] T152 [US5] Priority HIGH. G14, owner decision 2026-10-10: the paid-access record of the old site (`member` and
      `memberUntil` in the member's metadata) is kept, and it must be used. Do not guess its rule: write a short
      design note with the options first (a `users.access_until` column; how it combines with the status list of
      `lectureViewers`: opens, closes after the date, or both; what the member and the administrator see; the time
      zone is UTC) and have the owner choose; then the migration, one function in the access module that gives the
      viewer's effective right to lectures, the account page showing the end date, T055's file carrying the old
      `member`/`memberUntil` if Clerk's export has them (otherwise the administrators enter the date), and tests at
      the boundary (expires at the instant, a blocked member is refused first).
      Design note written 2026-10-11: `design-member-until.md` (what the old site did, what the new one has, four
      choices with a recommendation and an alternative each). Waits for the owner's choices; nothing is built. The
      implementation is best done together with the lecture access function of plan phase 4 (T076 to T085).
      Moved 2026-10-11 at the owner's order from plan phase 3 to this phase, to be talked over again when its turn
      comes here, together with the lecture access function (T076 to T085): the four choices of the design note are
      put to the owner again then, and may be changed. Nothing is built before that. Plan phase 3 no longer waits
      for it.
      Owner's choices 2026-10-11 (design-member-until.md section 9): 1-A, 2-A, 3-A, 4-A as recommended; plus: nobody
      has lectures through a date by default, an administrator writes the date for each user, and a grant without an
      end gets 100 years from the day (one constant). Still to be built together with T076 to T085.
      Owner's second round 2026-10-11 (design-member-until.md sections 10 and 11): the person's date is the one
      clock (it limits the statuses too; metr and admin never limited) and is set to +100 years when a status makes
      the account a user; old paying guests keep the date from the file; a video has `available_until` (+100 years
      by default) and after it the page stays and the video does not play for anybody but the editors. Supersedes
      choice 1-A of the first round.
      Done 2026-10-11 as a step of its own (migration `014.do.access-dates.sql`; the numbers of T077, T087, T106 and
      T107 moved up by one): `users.access_until`, `videos.available_until`, SQL function `lecture_view` (the one
      home of the lecture rule), `server/src/users/lecture-access.ts` (the date after a status change),
      `PATCH /api/admin/users/:id/access`, the date in `/api/auth/me`, the user list and the video answer, the old
      `member`/`memberUntil` columns of the members file, `availableUntil` in the video front matter, the account
      page line and the date field of the users page, `src/lib/lecture-rules.ts`. Tests: `lecture-access.test.ts`.
      The player itself (T081, T082) and the 404/403 split of the stream still come with their own tasks.

### Tests first

- [x] T075 [P] [US5] `server/test/video-access.test.ts`: port every case of the video-access Worker's 56; add the
      per-request recheck (block then seek is refused), the 404 for invisible, 401 for a signed-out visitor of an
      existing paid entry, and the direct internal location returning 404.
      Written 2026-10-11 (tests first): 15 tests in `server/test/video-access.test.ts`, all marked `todo` until T077
      (`video_files`), T080 (`GET /media/video/:slug`, the option `videoRoot`) and T137 (providers) exist; the header
      of the file says where each of the Worker's 56 cases went (the 14 token cases and the CORS cases have no
      counterpart: sessions here are opaque ids). It proposes one route the contract lacks, `GET
      /api/videos/:slug/source` -> `{embedUrl}` or `{videoUrl}`, which needs the owner's word before T137.
      Refusals tested: 401 `signed_out`, 403 `forbidden` / `blocked` / `expired`, 404 `no_source`, 503 `unavailable`.
      When T080 and T137 land, remove the `todo` option there.
- [x] T076 [P] [US5] `server/test/members-block.test.ts`: both values of the setting; under "locked" the block is
      absent from every response to a viewer without full access; under "hidden" it is sent and marked hidden.
      Written 2026-10-11 (tests first): 7 tests in `server/test/members-block.test.ts`, marked `todo` until T077 (the
      `settings` table) and T081 (the backend's split) exist. They show the leak of today: a guest receives the block in
      the entry's answer. Proposed field: `content.membersOnlyHidden` (true when the block is sent to a viewer who may
      not play). Also tested: a flip of the switch is seen on the next request including the guests' cached answers,
      a blocked account never has the block under locked, an unknown setting value counts as locked.

### Implementation

- [x] T077 [US5] `server/migrations/015.do.video-files-settings.sql`: `video_files`, `settings` with
      `members_block_mode` default `locked`, the settings-log table (data-model.md).
      Done 2026-10-11: migration `015.do.video-files-settings.sql`. `video_files` (one per video, a plain relative
      volume path, MP4 and faststart only), a source row or a file row never both (deferred trigger; the public-video
      rule of migration 008 accepts either), `settings` with a CHECK on the keys and on the two modes, seeded `locked`,
      `settings_log` written by a trigger and append-only. Tests: `schema-video-files.test.ts`. The mode CHECK means an
      unknown mode cannot be stored; the reader of T081 must still treat an unknown value as `locked`.
- [x] T078 [US5] `server/src/video/faststart.ts`: refuse an MP4 whose `moov` atom is not before the media data;
      decide with the owner whether ffprobe is used. Needs: ffmpeg-docs (only if ffprobe is chosen).
      Done 2026-10-11, the owner leaving the choice to the assistant: no ffprobe, no dependency. `checkFaststart(path)`
      reads only the headers of the top-level boxes (32- and 64-bit sizes, size zero) and stops at the first `moov` (ok)
      or `mdat` (refused); reasons `not_mp4`, `moov_after_mdat`, `no_moov`, `truncated`, `unreadable`; at most 64
      boxes; `faststartMessage` gives the sentence for the register command (T079), which names no path. Tests:
      `faststart.test.ts`, files built box by box. What it cannot know is whether the streams inside are playable.
- [x] T160 [US5] Priority HIGH. One home for the source of a video (owner, 2026-10-10: not now, but it must be done and
      never forgotten). Today the source is in two places: `videos.platform` and `videos.external_id` for public videos,
      `video_sources` for paid ones, and for a paid lecture `videos.platform` holds a meaningless default. This task
      moves every video's source into `video_sources` (one row per video: provider and reference), in a migration that
      MOVES the existing rows (the 18 public embed ids and the 3 paid sources) and then drops the two columns; rewrites
      `store_video`, the importer, the access module's reads and the API's `externalId` (still sent for a public video
      only), and the tests. It must be finished BEFORE T137, T080 and T082 are started, which are written against it;
      the test in `server/test/schema-content.test.ts` marked `todo` for T160 starts passing when it is done and its
      `todo` flag is removed here.
      Done 2026-10-10, before T161 at the owner's word, as migration `008.do.video-source-one-home.sql`: it moves the
      18 public embed ids into `video_sources`, refuses to continue if a public video has none, drops the two columns, and
      adds a deferred constraint trigger that keeps "a public video has a source". `store_video` keeps its signature and
      writes the source; the access module joins `video_sources` and answers `platform` and `externalId` null for a paid
      lecture; the importer no longer accepts `file` as a platform. Planned migrations moved up by one number (users and
      sessions are 012 now, after migrations 009 to 011, T046). The `todo` flag is gone and the test passes.
- [x] T137 [US5] (done 2026-10-11: providers youtube, vk, rutube, yandex-disk and the route `GET /api/videos/:slug/source`, at the owner's report that a student could not play a paid lecture; the file source is answered by the same route with the stream address, T080) `server/src/video/providers/`: one interface (`resolve(reference)` returning an embed address or a
      short-lived file address) and one file per provider: `youtube`, `vk`, `rutube`, `yandex-disk`, and `file`
      (the server's own volume, T079; `file` is chosen by the presence of a `video_files` row, not by a `provider` value
      in `video_sources`, whose CHECK does not list it - the consilium of 2026-10-10 asked for the wording to agree).
      Added the same day, and corrected by the owner: a public video may be hosted on Yandex Disk as well, and more
      places may come (Vimeo for one), so the providers are the rows of `video_providers` (migration 010), the one home
      of that list. A new provider is one row and one adapter file here. The type in
      `server/src/content/video-sources.ts` only describes the two shapes of the old Worker's file and stays. Added 2026-10-10 at the owner's word: the server's disk is small, so lectures stay
      with their host and a new source is one new file. The Yandex Disk adapter is the old Worker's rule ported: public
      link of one file only, asked only after the membership check, the answer accepted only on the download host,
      8 seconds to answer, a 503 that names the status and never the link. The reference comes from `video_sources`
      through the access module only. Docs: nodejs-docs, owasp-docs (server-side request forgery).
- [x] T079 [US5] `server/src/cli/register-video.ts`: registers a copied file against a video entry after the
      faststart check; the column `external_id` is gone (migration 008), a file source is a `video_files` row and nothing else;
      add `npm run video:register`. Used only for files small enough for
      the server's disk (the owner, 2026-10-10: there is no room for large files); refuses when T138's free-space rule
      says so; an entry has a `video_sources` row or a `video_files` row, never both (a deferred trigger, or a CHECK and a
      composite key if T137 keeps `file` as a provider: decide in T077, consilium of 2026-10-10).
      Done 2026-10-11: `npm run video:register -- <slug> <file> [--replace-source]`; `VIDEO_ROOT` names the volume
      folder (`.env.example`). `server/src/video/register.ts` (file checks: inside the volume by `realpath`, a regular
      file, not empty, faststart) and `server/src/access/video-files.ts` (the database part, in the access module). A
      video that still has a source row is refused unless `--replace-source` is given, because that deletes the row (a
      paid link is not recoverable); registering again replaces the file row; an audit row with the slug and size,
      never a path or a reference. T138's free-space rule is not here: it applies to this command when it exists.
      Tests: `register-video.test.ts`.
- [x] T165 [US5] Priority LOW. DECISION FIRST, BUILD LATER (owner, 2026-10-10: if resources allow, video may be written
      into the database itself; nothing is built until the owner decides after a short report). The report answers: (1)
      where the bytes would live: the database's data volume is on the same disk as the video volume, so it saves no
      space and T138's free-space rule applies unchanged; (2) how: a `database` row in `video_providers` (migration 010)
      whose reference is the id of a PostgreSQL large object (up to 4 TB; a `bytea` value tops out at 1 GB), read in
      chunks with `lo_read`/`lo_lseek` so that a player can seek; one adapter file (T137) and no change to today's rows;
      (3) constitution IV says video bytes never pass through Node and nginx serves the file after the session check;
      stored in the database every byte would pass through Node and a pooled connection, so a limit of concurrent
      streams and a measurement are needed; (4) `pg_dump` would carry the lectures, so every backup (T120) would be as
      big as the library; (5) a measurement on a throwaway database (`npm run stress:site` style) with a 500 MB file:
      first byte, a seek, memory, five parallel streams. Recorded recommendation: files on the volume (T077 to T080) stay
      the default, the database is for a case where no volume is possible. Docs: postgresql-docs, node-postgres-docs.
      Report delivered 2026-10-12: `video-in-database-report.md` (answers 1 to 5 with a measurement of a 500 MB large
      object on a throwaway database: 678 MB on disk, 52 MB/s one stream, seek 2 ms, nothing kept). Recommendation:
      do not build.
      DECIDED 2026-10-12 by the owner: do not build; the video stays on the volume (and the big lectures with their
      host). The database is not a place for video; nothing was built. Reopen only if no volume can ever exist.
- [x] T080 [US5] `server/src/video/stream.ts`: `GET /media/video/:slug` checking session, status and visibility
      on every request, answering with `X-Accel-Redirect`; in development, ranges served by Express with the same
      checks. Docs: express-docs, nodejs-docs; Needs: nginx-docs, mdn-docs.
      Done 2026-10-11: `server/src/video/stream.ts`, mounted at `/media` when `VIDEO_ROOT` is set (`VIDEO_ACCEL` makes
      it answer with `X-Accel-Redirect` for nginx; unset, `res.sendFile` serves ranges, 206 and 416). The rule is
      `lecture_view`, read again on every request; 401 `signed_out`, 403 `forbidden`/`blocked`/`expired`, 404
      `not_found`/`no_source`; `private, no-store` on every answer. The source route answers a file lecture with
      `{videoUrl: "/media/video/<slug>"}` and the page script accepts that path. T075's tests all run for real now
      (16). The nginx `internal` location itself is written with the Compose stack (phase 8).
- [x] T081 [US5] Store the members-only block in its own column and send it only under the rule of T076;
      `src/lib/video.ts` loses `publicBody()` and `membersOnlyHeadings()` copies once the backend owns the split.
      Done 2026-10-11 for the backend and the video page: `getEntry` sends `membersOnlyHtml` to a viewer for whom
      `lecture_view` says open, and under the `hidden` setting to everybody with `membersOnlyHidden: true` for those who
      may not play; under `locked` (the default; any other value counts as locked) to nobody else. The setting is read
      in the same query. The page renders the block already shown for a viewer who may play. NOT done, on purpose: the
      two helper copies in `src/lib/video.ts` are still read by the RSS feed (`rss.xml.ts`) and the file-based list
      code; they go with T089 (feeds and search per audience), not before. T076's seven tests pass; the old
      guest expectation of `content-api.test.ts` was changed (a guest now has no block by default).
- [x] T082 [US5] One player component `src/components/VideoPlayer.astro` for every video: the file player when a
      file is registered, the provider's address from T137 (embed, or a Yandex Disk file played in a video element)
      otherwise, for a public video as much as for a paid one (a public lecture may be hosted on Yandex Disk; today the
      page plays only a YouTube id and ignores the platform, as the old site did); guests see the placeholder and the teaser. Needs: tailwind-docs,
      mdn-docs.
      Done 2026-10-11: `src/components/VideoPlayer.astro` (renamed from `PaidVideo.astro`; the script file and the
      `data-paid-video` attribute keep their names) is the one player. The backend's `lecture` is known at render, so
      the state is in the first byte: a public YouTube video has its frame printed at once; a public video on another
      provider no longer gets a YouTube frame with the wrong id; an open video without a known address asks
      `/api/videos/:slug/source` (provider embeds, Yandex Disk, a file on the volume). `playerHosts` gained `vk.com`
      and `rutube.ru`. Tests: `video-page.test.ts` on the real built site. No documentation server was consulted:
      the classes are the old component's own.
- [x] T083 [US5] Remove `src/scripts/paid-video.ts`, `workers/video-access/`, the `VIDEOS` map and
      `site.videoAccess` from `src/config.ts`; update `PAID-VIDEO.md` as superseded. The Yandex Disk handling does
      not go: it lives on in the adapter of T137 (changed 2026-10-10; the lectures stay on Yandex Disk).
      Done 2026-10-12: `workers/video-access/`, `scripts/check-video-access.mjs`, `scripts/video-access-dev.mjs`, the npm
      scripts `check:video-access` and `video-access:dev`, the Worker child of `dev:all` and the `VIDEOS` map are gone;
      `site.videoAccess.endpoint` and `devEndpoint` are gone (the object keeps the player's hosts and events, because
      three files read it). The script is renamed, not deleted, at the owner's word: `src/scripts/video-player.ts`.
      `scripts/check-content-admin.mjs` lost its comparison with the video Worker (it goes with T100). `PAID-VIDEO.md`
      is marked superseded at the top. `ADMIN.md`, `CLOUDFLARE.md`, `README.md`, `MIGRATION-PLAN.md`, `REWRITE.md` are
      T084's.
- [x] T084 [US5] Update `README.md`, `MIGRATION-PLAN.md`, `REWRITE.md` session log.
      Done 2026-10-12: README.md ("Video from the club's own server"), MIGRATION-PLAN.md (a dated note under Progress),
      REWRITE.md (the decision on video bytes and the session log of the phase). ADMIN.md and CLOUDFLARE.md still describe
      the Worker arrangement; they are history documents, marked when their own tasks come (T100, T167).
- [x] T149 [US5] Priority HIGH. G11. The player component of T082 has the five states of the old one: a guest (sign-in
      link that returns to the lecture), signed in without access (a notice; the recheck button becomes a plain reload
      because the state is known at render), blocked, no source for the entry, and unavailable (the provider did not
      answer). T075 or T085 tests each.
      Done 2026-10-11 together with T082, in the same component: guest (sign-in link with `next` set to the lecture),
      no_access (notice, "check again" is a plain reload because the state is known at render), blocked, expired,
      and the two states only the script can learn, no source (`404 no_source`) and unavailable (`503`). Tested in
      `video-page.test.ts` (the five render states) and `video-access.test.ts` (the 404 and 503 answers).
- [x] T085 [US5] OWNER CHECK, plan phase 4: a lecture plays and seeks; a student plays a paid lecture, a guest sees
      the placeholder, a blocked member is refused on the next seek; the internal location is unreachable directly.
      Closed 2026-10-12 on the owner's word: "everything is fine, close plan phase 4". The owner had run the commands
      (migration 015, `import:content`, `video:register` of `lecture-4`) and the assistant had read the state; the
      assistant did NOT see the walkthrough steps one by one. What no person has reported in detail: a student with a
      date playing and seeking, a guest seeing the placeholder, a blocked member refused on the next seek. They are
      covered by `video-access.test.ts` and `video-page.test.ts` (327 server tests), and stay on the switch-day
      rehearsal (T135) together with the nginx `internal` location, which the tests cannot reach.

---

## Phase 7: User Story 2 - the audience holds everywhere (Priority: P1, built late) - plan phase 5

**Goal**: every surface honours the audience, proved by the full matrix.

**Independent Test**: quickstart phase 5.

- [x] T086 [P] [US2] `server/test/visibility-matrix.test.ts`: statuses (guest, student, expert, master, metr,
      admin, blocked, named person) by audiences (everyone, members, restricted, hidden) by teaser, across the nine
      surfaces (page, lists, tags, categories, search, feeds, sitemap, comments, card previews) plus head metadata;
      expects 0 leaks (SC-003).
      Done 2026-10-12: nine viewers (anonymous, guest, student, expert, master, metr, admin, blocked, named) by 16
      entries (a post and a video for each audience and teaser). One function `expected` states the rule of
      data-model.md, and every surface is compared with it: the page, both lists, the list pages with their year
      counts, tags, categories, search by title and by text, neighbours, the two feeds, the sitemap, the page and its
      head, plus a scan that no word of an absent entry and no locked word of a teaser is in any response. The 18
      cases of everyone and hidden are live and pass; the 18 of members, restricted and teaser carry `todo` until
      T087 to T090 (remove it in T090), and one `todo` stands for comments (plan phase 7). Rule decisions pinned: a
      blocked viewer is a guest for entry rules, a named person is let in by name, metr and admin are not let into
      `restricted` by status alone; a teaser is present on every surface as a card and its text is on none.
- [x] T087 [US2] Extend `entry_view` in a new migration `server/migrations/016.do.entry-view-audiences.sql` with
      `members`, `restricted` and the named-person branch; keep the 404 contract.
      Done 2026-10-12: `entry_view` has the `members`, `restricted`, named-person and teaser branches (rules in
      data-model.md); a blocked account is a guest, a missing status is `guest`; `lecture_view` now passes the
      account's status and answers `none` unless the entry is seen in full. `entry-view.test.ts` was rewritten from
      the interim answers; the API surfaces of the matrix (T086) are live and pass for every audience, the site's feeds,
      sitemap and pages for members, restricted and teaser stay `todo` until T089 and T090. 357 server tests pass.
- [x] T088 [US2] Make every list, term count, year switcher count and previous or next link compute from the
      viewer's visible set in `server/src/access/entries.ts` and `src/lib/lists.ts` callers.
      Done 2026-10-12, with no production code to change: the backend already built every list, term count, year
      count and neighbour from `visibleEntries` (T024, T162), and every list, term and entry route of the site already
      passed the viewer's cookie (T034, T035), so the sets came out of `entry_view` the moment migration 016 gave it
      its branches. What this task adds is the proof on the real pages: nine cases in `visibility-matrix.test.ts`
      fetch `/posts/`, `/video/`, their year pages, every tag page, every category page and both term indexes as each
      viewer, and compare the entries they link with the rule; and the entry page of a full view carries no link to
      an absent entry. 366 server tests pass.
- [x] T089 [US2] Search index, both feeds and the sitemap per audience; the guest versions are the cacheable
      ones; add the version counter bump on every content write.
      Done 2026-10-12. The per-audience sets were already the backend's answers for the request's cookie (T035, T163),
      so the feeds, the sitemap and the search of the site hold exactly what the viewer's view says: the matrix now
      proves it for every audience (feeds, sitemap, the site's `/search/query.json`, cards without locked text). What
      was missing was real: migration 017 `content_version` (a counter bumped by statement triggers on entries, posts,
      videos and both audience tables; the version derived from `updated_at` did not move when an entry's audience
      lists changed, so a guest's cached terms went stale), and the cache headers: `src/lib/audience-cache.ts` gives a
      guest's answer `public, max-age=10` and an ETag with 304, an account's `private, no-store`, both `Vary: Cookie`.
      New tests: `content-version.test.ts` (3) and one case of the matrix; 379 server tests pass, `astro check` 0
      errors. The entry page and head of a teaser stay `todo` for T090.
- [x] T090 [US2] The locked card: `src/components/CardList.astro` shows a teaser entry with a lock notice;
      `src/components/SEO.astro` emits no `og`, `article:*` or description of an entry the viewer cannot see; the
      previous and next links skip invisible entries.
      Done 2026-10-12. A teaser's page was a 404; it is `src/layouts/LockedEntry.astro` now (title, date, introduction,
      tags and `src/components/LockedNotice.astro`: sign-in for a visitor with no session, a plain sentence for an
      account the audience does not include, and never the rule of who the entry is for). `Base.astro` takes `locked`,
      which drops `SEO.astro`'s whole output (so there is no description, `og:*`, `twitter:*`, `article:*`, `video:*`
      or canonical address, not an edit inside `SEO.astro`) and adds `noindex, nofollow`. Cards carry `locked` from the
      backend's `view` and say "closed for you" in the lists and on the tag pages. Neighbours were already the
      viewer's own visible set (T088). The visibility matrix has no `todo` left but the comments (plan phase 7): 55
      cases pass; 388 server tests pass. The Russian literals of the notice and the card are named by T178.
- [x] T091 [US2] Check query plans for the list and term queries against the 24 posts and a stress set of several
      thousand; add indexes if a plan scans; record in `data-model.md`.
      Done 2026-10-12 (the owner chose all three steps). At the real content every read is 1 to 4 ms; at 6 600 entries
      the plans showed the cost was the rule asked per row by id, not the scans. Migration 018: the rule as a pure
      function of the row's columns (`entry_view_of`, with `entry_member`, `entry_listed`, `entry_named`; `entry_view` by
      id calls it), the index `entries (kind, published_at)` for the neighbour lookups, and the tag and category
      filters through the GIN indexes. Lists 159 to 14 ms, years 92 to 10, terms 151 to 14, a tag 105 to 1.6, neighbours
      79 to 0.4. Figures in `data-model.md` ("Query plans"); `entry-view-paths.test.ts` compares the two forms of the
      rule; 389 server tests pass.
- [x] T092 [US2] Update `README.md`, `MIGRATION-PLAN.md`, `REWRITE.md` session log.
      Done 2026-10-12: README.md has the paragraph "The audience holds on every surface", MIGRATION-PLAN.md a note under
      the one of plan phase 4, REWRITE.md the log section "plan phase 5, visibility everywhere" (the decisions pinned
      by the tests, why `content_version` is a counter and not a sequence, the measurement of T091). No documentation
      server was consulted: the task records what the earlier tasks found.
- [x] T093 [US2] OWNER CHECK, plan phase 5: a post for one named member appears for that member in the list,
      search and feed and for anyone else nowhere (404, absent from the index).
      Closed 2026-10-12 on the owner's word ("close phase five"), without the hand walkthrough: the steps are written
      in `quickstart.md` (phase 5) and nobody has run them. What no person has seen: the named member's post in the
      list, search and feed, and the 404 for another member, a guest, the blocked account and the admin. It is covered
      by `visibility-matrix.test.ts` (55 cases, nine viewers by sixteen entries, every surface) and
      `entry-view-paths.test.ts` (390 server tests), and the hand check goes with T102, where the admin form sets an
      audience without SQL, and with the switch-day rehearsal (T135).

---

## Phase 8a: User Story 11 - the interface in English and Russian (Priority: P2) - plan phase 6, first

**Goal**: the two interface languages of the current site carried over, and every interface string that phases 1 to 5
added put into both languages, before the pages of phases 6 and 7 are written. Added 2026-10-12 at the owner's
request; the source is `klub_biolocation_astro`, branch `refactor-app`, from `2b4aac9` on (`I18N.md` there).

**Independent Test**: quickstart "Interface languages".

### Tests first

- [x] T176 [P] [US11] `scripts/check-lang.mjs` and `npm run check:lang` (browser over CDP, like `check:auth`), written
      first and failing: with nothing stored every page type is in English; the switch turns the page Russian without
      a reload and keeps a half-filled form; a reload, another page and a second tab keep the choice, with the class
      set before the body exists; choosing English stores `en`; a scan of every page type (spec SC-013), read with
      `innerText`, finds no interface text in the other language; a refused sign-in is told in the chosen language.
      Docs: mdn-docs.
      Done 2026-10-12 (written first; it fails until T177 and T178, which is what it is for). `scripts/check-lang.mjs`,
      `npm run check:lang`, its own server on 4389 and Edge on 9334. 46 checks: 17 page types in English with nothing
      stored and again in Russian (visible text only, content exempt by the markup of today, listed in the file's
      header), and the switch (in place, form kept, reload, another page, second tab, `en` stored, class before the
      body) and a refused sign-in in both languages. First run against the current build: 3 pass, 43 fail, as expected;
      the three that pass are the account fixtures, the English default of the About page (nothing is stored yet) and
      the Russian refusal, which is still the only language.

### Implementation

- [x] T177 [US11] Carry the mechanism over: the commits of `klub_biolocation_astro` `refactor-app` after `2b4aac9` that
      build the languages (`0d6db3d`, `77db5f4`), as patches applied here (each git step other than a commit asked of
      the owner, as always). Resolve the conflicts with the files phases 1 to 5 rewrote (`Base.astro`, `Header.astro`,
      `CardList.astro`, the auth pages and their scripts, the users page) by keeping this repository's code and adding
      the language parts to it; drop what served Clerk only (its localization in `auth.ts`,
      `reloadOnLanguageChange()`). `I18N.md` comes along and gets a section on what differs here. Docs: astro-docs,
      tailwind-docs, mdn-docs.
      Done 2026-10-12. The diff of the current site from `2b4aac9` to its last language commit (67 files) was read
      there and applied here file by file with `git apply`: 31 files applied whole, 35 had hunks that no longer fitted
      and were merged by hand (`config.ts`, `Base.astro`, `Post.astro`, `Menu.astro`, `CardList.astro`, `AuthButton.astro`,
      the list, tag, category, search and video pages, `search.ts`, `lists.ts`, `date.ts`); `auth.ts` was left out
      (Clerk only). Not carried, left to T178 because those pages are this repository's own: the three `/auth/` pages,
      the account page, the users page and its script, and the expectations of `check-auth-browser.mjs` (their
      rejected hunks are kept outside the repository). Also: the search index and filter speak in the section's key;
      `date.ts` types its result in place because the backend compiles it. `I18N.md` has section 8. `astro check` 0
      errors, backend builds, 389 server tests pass (1 `todo`), the site builds. `npm run check:lang` on a build of
      this tree: 39 of 46 pass, including the whole switch (in place, form kept, reload, second tab, `en` stored,
      class before the body); the 7 that fail are the sign-in, sign-up, recover, account and users pages and the
      English refusal of a sign-in, which are T178. No documentation server was consulted: nothing about a framework
      was asserted, the code is the current site's own.
- [x] T178 [US11] Every interface string that phases 1 to 5 added goes into `ui` or `adminUi` in both languages and is
      printed with `T`, `langAttrs()`, `setPhrase()` or `phrase()`: the own sign-in, sign-up and password-change pages
      and their scripts, the account page, the users page (T070), the player's messages (`VideoPlayer.astro`), the
      locked notice and the lock label of plan phase 5 (`LockedNotice.astro`, `CardList.astro`), the status names. A
      search for Cyrillic outside `src/i18n/` and `src/content/` finds only content and comments. Docs: astro-docs.
      Done 2026-10-12. About 190 new entries in `ui` (`strings.ts`) and `adminUi` (`admin.ts`): the shared pieces of
      the forms (`form_*`), sign-in, sign-up, setup and recovery (`signin_*`, `signup_*`, `setup_*`, `recover_*`),
      the account page (`acct_*`), the users page (`users_*`, the stale values that described the previous status
      service were corrected), the player's ended line, the locked notice and the card's lock label. The pages print
      them with `T`, `langAttrs()` and, in scripts, `setPhrase()`, `format()` and `phrase()`: a message on the screen
      follows a switch, and `confirm()` and an `<option>` take the language shown. A wait, the tries left and a date are
      Phrases of their own (`describeWait`, `form_tries_word`, the two locales). What is still Cyrillic outside
      `src/i18n/` and `src/content/`: comments; the bilingual names in `src/config.ts` (sections, statuses) and the
      month names of `date.ts`; the carousel captions; the subject of the sign-in help letter (`site.contact.signInSubject`,
      the club's mail is Russian); the " (копия)" mark of a copied post (content); and `auth.ts` and `clerk-ru.ts`, which
      T167 deletes. `npm run check:lang` 46 of 46, `npm run check:auth` 91 of 91, 389 server tests pass, `astro check` 0
      errors; all run on a build of this tree made in a copy, so the owner's `dist/` was not touched. The English texts
      are new and wait for the owner's eye at T182.
- [x] T179 [US11] Refusals by code: a text for each `error` code of `contracts/http-api.md`, in both languages, used
      where the pages read a refusal (`src/lib/api-client.ts` and the page scripts), so that it is shown in the chosen
      language; an unknown code shows a general message. The API's `message` stays English; the errors line of
      `contracts/http-api.md` says so. Docs: mdn-docs.
      Done 2026-10-12. `src/lib/error-codes.ts` is the one list of the 15 codes (the backend's `ErrorCode` type is
      derived from it), `src/i18n/errors.ts` a record over it with a text in both languages for each, and a general
      sentence for a code nobody listed (never the raw code or the server's message). The forms' common refusals
      (`commonRefusal` in `auth-forms.ts`) read it; the users page and the posts page tell an answer they have no reason
      for by its code instead of "the service is unavailable". `contracts/http-api.md` says that the `message` is
      English and never shown. `server/test/error-codes.test.ts` (3): both languages for every code, the unknown code,
      every code a route sends is in the list; `check:lang` got a browser case in which the sign-in answer is a 503
      `unavailable` and the page says the code's text in each language (48 of 48). 392 server tests pass, `astro check`
      0 errors. No documentation server was consulted: the codes are the API's own.
- [x] T180 [US11] Move the parity references to the current site with its languages: `check:markup` (T133) and
      `check:screenshots` (T134) build the old repository at the last commit of the languages on `refactor-app`
      instead of `2b4aac9`, and compare in English and in Russian; residuals recorded in `REWRITE.md` as before. The
      post-body fixtures of `server/test/fixtures/render/` hold no interface text and stay. Docs: astro-docs.
      Done 2026-10-12. Both scripts take the old repository at `495e959` (tip of `refactor-app`; last code `77db5f4`).
      `check:markup`: 149 routes, 0 differences: 102 documents identical, 41 equal apart from whitespace between block
      elements (a third level, reported on its own line; the post page rendered inside a conditional since T090 loses
      that whitespace), and named, counted exceptions: the views counter gap (09687fa), the player's hidden templates
      (T082), the paid lectures' pages (T082, T139), the three account pages (T053), the guest-gated users page (T070).
      One HTML serves both languages, so one pass covers English and Russian. `check:screenshots` takes every page type
      in four variants (light/dark x EN/RU): 12 of 15 types identical in all four; `post` and `video-public` differ by
      135 to 149 pixels at the views counter (the gap fix), `sign-in` is the rewritten page, `account` is not captured
      as before. Residuals accepted by the owner and recorded in `REWRITE.md`. The server under test must hold the old
      repository's content (an entry only this repository has, lecture-4, changes the lists). Two shell gaps closed:
      the tag page and the card list left one extra space each (comment count). Docs: astro-docs was not consulted; the
      whitespace behaviour of comments was measured with `@astrojs/compiler` itself.
- [x] T181 [US11] Documents: `README.md`, `REWRITE.md` (the decision and the session log), `CLAUDE.md` (no literal
      interface string; read page text with `innerText`; the one CSS rule tied to the default), `MIGRATION-PLAN.md`.
      Done 2026-10-12. `README.md` (the interface-languages paragraph, the checks line, the dictionary line, the two
      reference lines moved to `495e959`), `CLAUDE.md` (one rule: no literal interface string, the helpers, error texts,
      `innerText`, the one default-language CSS rule, the comment-leaves-a-space pitfall), `MIGRATION-PLAN.md` (dated note),
      `I18N.md` section 8 and `REWRITE.md` (the decision was there; the session log of T176 to T181 added). No
      documentation server was needed.
- [x] T182 [US11] OWNER CHECK, the interface languages: quickstart "Interface languages". The owner switches on the
      home page, a post, the sign-in page, the account page, the feedback form and an admin page, reloads, opens a
      second tab, and says the translations read right. Plan phase 6's check (T102) does not pass before this one.
      Closed 2026-10-12 on the owner's word, without a hands-on walkthrough of the pages (as T093 was). What no person has
      seen: the English texts as a whole ("maitre", the hand-over and recovery-code explanations) and the switch on the six
      pages; the browser checks of T176 (48 of 48) and the parity checks of T180 stand in for it. The hand check is part
      of T102.

---

## Phase 8: User Story 6 - editors write posts and videos (Priority: P2) - plan phase 6

**Goal**: the admin panel on the database, with audience, preview, upload and conflict answers.

**Independent Test**: quickstart phases 6 and 7, items 1 and 2.

### Tests first

- [x] T094 [P] [US6] `server/test/content-rules.test.ts`: port every case of the content Worker's 129, add the
      three bypasses of `RISKS.md` section 2 as refusals, raw HTML and script as refusals or neutralised output.
      Done 2026-10-12 (tests first, red until T096). `server/test/content-rules.test.ts`: 80 tests. The Worker's cases are
      accounted for in the header (128 today, 129 before T083 removed one): 48 refused saves, 8 accepted bodies, a valid
      save, the request shape, and every published post's text are here; transport, 409/404 and the size answer go to
      T095 and T097; the token and role cases are the sessions' and status rules' (already tested); the YAML, lastmod,
      GitHub and token cases leave with the write path (T100). The three bypasses were reproduced against the real
      pipeline first (a code span across a blank line, a fence whose info string has a backtick, a reference label with
      an escaped bracket: all three pass the Worker's gate and render as script or a javascript: link) and are pinned as
      refusals of the first gate. Every refused HTML or link case is also sent through `renderMarkdown`, and all 16 come
      out neutral today, so the second gate does not lean on the first. `server/src/content/rules.ts` is a stub with the
      interface (`postSaveProblems`, `bodyProblem`, `contentLimits`, `ownedFields`, the re-exported `videoTextProblems`):
      62 red tests, 18 green (16 renderer, the limits, the re-export). No documentation server was consulted.
- [x] T095 [P] [US6] `server/test/content-admin.test.ts`: `If-Match` conflict answer 409, a non-editor gets 404 on
      every admin route, preview equals the published render, upload streaming with a 500 MB file over the raised
      route limit only.
      Done 2026-10-12 (tests first, red until T097 and T098). `server/test/content-admin.test.ts`: 21 tests for posts
      and videos alike, against the shapes now written in `contracts/http-api.md` ("Posts and videos in the panel":
      fields, `ETag`/`If-Match` on `updatedAt`, 409 `stale` and `exists`, soft delete and restore, source and file
      routes, the audit action names). Covered: the 404 gate for six kinds of viewer with an editor control; the rules
      and bypasses through the save; a refused save writes nothing; a slug never changes; the two-editor `If-Match`
      sequence; partial saves and re-render; the audience form and the draft against the public entry route; soft
      delete; the preview equal to the stored render; the raised body limit on the admin routes only; a paid reference
      that no answer or audit row carries; the guards for a paid lecture; the file and link switch with the bytes left on
      the volume; faststart refusal with nothing left; and a 500 MiB upload streamed (process memory growth under
      200 MiB) and one byte over the cap refused from `Content-Length` alone (`KB_SKIP_BIG_UPLOAD=1` leaves the first
      out). 19 red, 2 green (cross-site guard, the 100 kB limit of other routes). `AppDeps.uploadCapBytes` was named
      (unused until T098). Decisions the tests fix and the owner may change: restore is for any editor; a draft is the
      audience `hidden`; the cap is 500 MiB; no `Content-Length` over the cap is read. No documentation server consulted.

### Implementation

- [x] T096 [US6] `server/src/content/rules.ts`: the content rules as one plain module used by the API and the
      pages (shared by import in `src/lib/`), replacing the copies in `workers/content-admin/` and `src/lib/`.
      Done 2026-10-12. `server/src/content/rules.ts` is the one home: `postSaveProblems` and `videoSaveProblems` (flat
      request of the contract, `partial` for an update, a video's flags, link shape and guards), `bodyProblem`, the limits
      and field lists, `videoTextProblems` re-exported. The body gate no longer reads Markdown with regular expressions:
      it parses with the renderer's own pipeline and asks the one sanitizer (`remarkNoRawHtml`, untouched, so
      `renderVersion` stays 1) whether it would change the tree, handing the finding out through the document's
      frontmatter (Astro 4, Markdown & MDX, "Modifying frontmatter programmatically"). That closes the three bypasses.
      `server/src/content/validate.ts` and its test are gone (their boundary cases moved into `content-rules.test.ts`);
      the Worker's copy goes with T100. The functions are async because the parser is. `content-rules.test.ts`: 94 of
      94 pass (it was reshaped from the Worker's nesting to the contract's flat request when the rules took the audience
      form and the video fields); the whole suite is 480 pass, with only T095's 18 red until T097 and T098.
      Docs: astro-docs (one search).
- [x] T097 [US6] `server/src/content/admin-routes.ts`: posts and videos CRUD with `If-Match` on `updated_at`,
      `POST /api/admin/preview`, soft delete (contracts). Docs: express-docs, postgresql-docs.
      Done 2026-10-12. `server/src/content/admin-routes.ts` (list, read, create, update with `If-Match`, delete, restore,
      the link of a video, preview) over `server/src/access/admin-entries.ts`, the one place the panel reads and writes
      the content tables (the access-boundary test keeps that folder the only one). The caller check is
      `server/src/users/actor.ts`, shared with the users router. The stamp is `updated_at` as text with microseconds,
      compared under `FOR UPDATE OF e`; the texts that changed are rendered before the lock; a write and its audit row
      are one transaction naming fields only. The admin content paths take 512 KiB and the 100 kB parser of `app.ts`
      steps aside for them. `deleted=1` lists only the deleted ones. T095: 14 of 21 pass; the 6 red are the file
      upload (T098) and one gate case that includes it; the 500 MiB test is skipped with `KB_SKIP_BIG_UPLOAD=1`. The
      whole suite: 492 pass, 6 red, 1 todo. Test fixes found on the way: a draft is not on the public route even for
      an editor (only the panel shows it), and a hostile text goes to the preview, not to a save. Docs: express-docs
      (async handlers, `express.json` limit), postgresql-docs (`FOR UPDATE OF`).
- [x] T098 [US6] `server/src/content/upload.ts`: `PUT /api/admin/videos/:id/file` streamed to the volume, size
      limit for that route only, runs the faststart check of T078. Needs: nginx-docs, owasp-docs.
      Done 2026-10-12. The file work is `server/src/content/upload.ts` (a temporary `.upload-<random>.part` file in the
      volume, a counter that stops at the announced length, the faststart check, then an atomic rename to a name this
      server makes; the client's file name is never read) and the route is in `admin-routes.ts`; the database half is
      `attachUploadedFile` in the access module. Refusals come before a byte is stored: 400 for a type other than
      `video/mp4` or a missing `Content-Length`, 409 `has_source` unless `?replace=1`, 413 `too_large` from the
      announced length, 422 `not_faststart` (the temporary file is removed); the rest of a refused body is read and
      thrown away up to 64 MiB / 15 s (nginx's `lingering_close`), so a browser sees the answer and not a network
      error. The cap is the environment variable `VIDEO_UPLOAD_CAP_MB` (optional, default 500, `.env.example`,
      `loadUploadCapBytes` in `config.ts`), the owner's word of 2026-10-12: not a database setting. The cross-site
      guard lets `PUT /admin/videos/:id/file` carry a non-JSON body (Origin and fetch metadata still checked). Old
      bytes are never deleted by a replacement. T095: 21 of 21 pass; the whole suite 500 pass, 1 todo. Docs: nginx-docs
      (`client_max_body_size`, `proxy_request_buffering`), owasp-docs (file upload: own file names, limits before parsing).
- [x] T138 [US6] A rule for the server's disk before any upload (added 2026-10-10 at the owner's word: the planned
      server is small). `server/src/video/space.ts`: free space of the video volume is read before an upload is
      accepted; an upload is refused with a plain message when it would leave less than a reserve (the environment
      variable `VIDEO_FREE_RESERVE_MB`, default 2048, owner 2026-10-12) or exceeds the size cap (`VIDEO_UPLOAD_CAP_MB`,
      default 500, read since T098); the database and its backups never share a volume
      with the files. Applies to T098 and T079; the admin sees the free space on the video page. Docs: nodejs-docs.
      Done 2026-10-12. `server/src/video/space.ts`: `volumeSpace` (`fs.statfs`, `bavail`, read on every request),
      `spaceVerdict` (over the cap, then less than the reserve left) and `roomForUpload`. The upload route answers 413
      `too_large` with `reason` `over_cap` or `no_space` (the free bytes and the reserve in the body) from the announced
      length, and the same `no_space` when the disk fills while the file arrives (ENOSPC, the temporary file removed).
      `GET /api/admin/videos/space` gives the panel `freeBytes`, `totalBytes`, `reserveBytes`, `capBytes`, `roomBytes`.
      `video:register` applies the cap only (the file is already on the disk, so the reserve would free nothing).
      The reserve is `VIDEO_FREE_RESERVE_MB` in `.env` (optional, default 2048, 0 switches it off). Tests: `space.test.ts`
      and a simulated disk in `content-admin.test.ts`; the whole suite 510 pass, 1 todo. Docs: nodejs-docs (`fs.statfs`).
- [x] T099 [US6] Rewrite `src/pages/admin/posts.astro` and `src/scripts/admin-posts.ts` against the API: the
      visibility form (audience, statuses, named people, teaser), preview, upload, the copy button as today; the script
      imports only plain modules (`src/lib/post-url.ts`). Needs: tailwind-docs, mdn-docs.
      Done 2026-10-12. `src/pages/admin/posts/index.astro` answers 404 to anyone but a metr or an admin (the users
      page's gate) and `src/scripts/admin-posts.ts` asks `/api/admin/posts` with the session cookie: a list a page at
      a time with a search and a switch for the deleted ones (restore button), the form with the audience (everyone,
      signed-in members, the chosen statuses and named people, a person found by name and added by number), the
      teaser, the draft, tag and category suggestions from `/api/terms`, the preview (`POST /api/admin/preview`), the
      copy, save with `If-Match` (409 `stale` keeps the form, 409 `exists` proposes the next address), soft delete. A
      saved post is on the site at once: the wait for a rebuild and the Clerk code are gone. `sendJson` takes extra
      headers. Dictionary: nine entries of the old flow removed, new ones for the audience, the deleted ones and the
      preview (both languages). Not here: image upload (T143) and the video upload (T175); the task text's "upload"
      is the latter. Checked: `astro check` 0 errors, `check:bundles` clean, the page served to an admin with the form,
      the audience list, the five statuses and the preview button, and 404 to a guest and a visitor, the bundle
      carrying the posts API and `If-Match` and no Clerk. Later the same day, after the owner's remarks: examples in the
      empty fields and a short explanation of who sees a post under the audience list (both languages). The form was
      driven in a real browser against a throwaway server (31 checks: list, examples, validation, create with preview,
      public at once, restricted audience with a person found by name, a stale save kept in the form, a taken address,
      delete and restore, Russian), `check:lang` 48 of 48 (the post addresses, titles and suggested terms of the
      posts page are content, exempt like the tag chips) and `check:auth` 91 of 91. The browsers had not failed: Windows
      reserves TCP ports 9294-9393 (Hyper-V, WSL, Docker; `netsh interface ipv4 show excludedportrange protocol=tcp`),
      which holds 9333 and 9334 of the two check scripts, so a browser asked to listen there started with no debugging
      port. Both scripts now ask the system for a free port. Docs: none consulted (the class lists and DOM calls are
      the page's own, unchanged). The same evening, the owner's remark that the chosen could not be found: the block
      of statuses and named people is always on the page, greyed and disabled until the audience is "only the chosen".
      The form check is in the repository: `npm run check:admin-posts` (33 checks, port 4386, a throwaway database,
      removes its browser profile). The check scripts now remove the browser profile folders they make (89 of them,
      4.3 GB, had piled up in the temp folder and were deleted, with two leftover `kb_stress_*` databases).
- [x] T175 [US6] Priority HIGH. Added 2026-10-11 at the owner's word: adding, editing and deleting a VIDEO is worked
      out like a post (T097 to T099), not left to markdown files and commands. The API of T097 already lists
      `/api/admin/videos`; what is missing is the page and the whole flow behind it: `src/pages/admin/videos.astro`
      and its script, in the panel next to the posts page (`AdminNav`); a form for the title, the description, the
      date, free or paid, tags and categories, the members-only block, the video's own end date (`available_until`,
      T152) and the audience of T087; the source: a file (the upload of T098 with the faststart check of T078, the disk
      rule of T138) or a provider link (YouTube, VK, Rutube, Yandex Disk; the link of a paid lecture is write-only, it
      is never shown again, the page says only that one is set); switching a video between a file and a link is a
      confirmed action, because the old source row is deleted; delete is the soft delete of the posts (the page
      stays recoverable by an admin); a conflict answer 409 on a stale save like posts; every change goes to the
      audit log. It replaces for videos what `import:content`, `import:video-sources` and `video:register` do by
      hand, which stay as the bulk import and the repair tools. Tests: the cases of T095 extended to videos (a
      non-editor gets 404, preview equals render, the upload route limit, the file and source switch).
      Docs: express-docs, tailwind-docs, mdn-docs.
      Done 2026-10-12. The page `/admin/videos/` (`src/pages/admin/videos/index.astro`, script `src/scripts/admin-videos.ts`)
      answers 404 to anyone but a metr or an admin and is in the panel's navigation and in the account page's menu
      (the owner had found no video option in the cabinet). It lists, searches, adds, edits, deletes and restores
      videos with the same form as posts (audience, named people found by name, teaser, draft, preview, conflicts) plus:
      free or paid, the date it is available until, a members-only block (paid only), and the source - a free video
      needs its link at creation; a saved video's link and file are managed by two buttons that act at once. The link
      of a paid lecture is never shown again (the page says one is set); a free video's is shown. The file: the page
      asks `GET /api/admin/videos/space` and shows the free room, refuses a file that would not fit before sending it,
      shows progress, and explains a refusal (over the cap, no room, an index after the video with the ffmpeg repair
      command, not an MP4). A file replaces a link and the other way round only after a confirmation that says what
      goes (the old link row is deleted; the old file's bytes stay). `videoUrl` moved to `src/lib/video-url.ts` for the
      browser. Not here: a copy button (a copy needs its own link or file anyway). Checked in a real browser:
      `npm run check:admin-videos`, 28 checks (the way from the account page, free video with and without a link,
      a YouTube address in a paid text, a paid lecture with no source, three kinds of files, file to link and back,
      the paid link nowhere on the page or in the answer, a stale save, delete and restore, Russian); `check:lang`
      50 of 50 with the new page, `check:auth` 91 of 91, `check:admin-posts` 33 of 33, `astro check` 0 errors,
      `check:bundles` clean. Found on the way: the default date of a new entry came from the browser's clock, so it
      now comes from the server's (the Date header of the answers, `serverNow()`); and once in about 30 runs the
      public route answered 404 for a moment after a save - the cause is not established (a clock difference between
      this machine and the database VM is a suspect), the checks wait up to 5 seconds and print the wait. The form
      checks take free ports. Docs: none consulted (the pieces are the posts page's own).
- [x] T100 [US6] Delete `workers/content-admin/`, `scripts/check-content-admin.mjs` and the GitHub write path;
      update `ADMIN.md` and `ADMIN-GITHUB-PAGES.md` as superseded.
      Done 2026-10-12. Deleted: `workers/content-admin/` (the whole folder, so `workers/` is gone), `scripts/check-content-admin.mjs`,
      `scripts/content-admin-dev.mjs`, `scripts/github-stand-in.mjs`, the npm scripts `check:content-admin` and
      `content-admin:dev`, the content service's child of `dev:all` with its port advice, and `site.admin.endpoint` /
      `devEndpoint` (nothing read them). ADMIN.md and ADMIN-GITHUB-PAGES.md carry a "superseded" note at the top;
      CLAUDE.md and REWRITE.md record the removal. The comments in other files that name the Worker are history and
      stay (the owner's rule on existing comments); `post-fields.ts` and `dev-all.mjs` got a dated note beside them.
      Checked: `astro check` 0 errors, the server tests 551 of 552 (the one is the known TODO T104/T105),
      `check:admin-posts` 33 of 33. Docs: none consulted.
- [x] T143 [US6] Priority MEDIUM. G5, NOT COVERED before. Images for posts and members-only blocks: today they come
      from `public/images/` through git, which an editor without git cannot do. Add a route to upload an image (size
      cap, type check by content, stored on the volume and served as `/images/...`, listed in the editor's form), or
      record the owner's decision that images keep shipping with a deploy. Beside T098 and subject to the disk rule of
      T138.
      Done 2026-10-12, by the owner's decision (upload, plus a link to a picture on the internet, 5 MB, the list with
      "copy the address" and no deleting). Migration 020 (provisional number): table `images` (hash, ext, name, size,
      who, when). `PUT /api/admin/images?name=` takes the bytes with the picture's own type (png, jpeg, webp, gif),
      refuses over the cap (`IMAGE_UPLOAD_CAP_MB`, default 5) and past the free-space reserve before reading a byte,
      checks the type by the first bytes (SVG is refused), stores `images/<sha256>.<ext>` in the video volume (one file
      for the same bytes) and answers `/images/u/<sha256>.<ext>`; `GET /api/admin/images` lists them; the file is
      served publicly with `nosniff` and a year of caching. The panel: a "Pictures" block in the post form and in the
      lecture form (upload with progress, an https address from the internet, the list with "put into the text" and
      "copy the address"); the picture goes where the cursor was, in the post or in the members-only block. Nothing is
      deleted. Checked: `server/test/images.test.ts` (7), the posts browser check 41 of 41 (a refused file, an upload
      put at the cursor, served to anyone, an http address refused, an https address inserted, the saved post's page
      carries the picture), the server tests 558 of 559 (the known TODO), `check:lang` 50, `check:admin-videos` 33,
      `astro check` 0 errors. Not done: deleting a picture, and showing which posts use one. Docs: none consulted.
- [x] T183 [US6] Priority LOW. Left over from T081 and moved here at the owner's word (2026-10-12, at the close of
      plan phase 5): `publicBody()` and `membersOnlyHeadings()` in `src/lib/video.ts` (and `plainifyMarkdown` if
      nothing else reads it) are the copies of the members-only rule the backend now owns (T081). The video feed no
      longer reads them; the build-time functions of the same file do. Remove them and their callers, keeping one
      home for the rule, and name the other readers if any is found. Beside T175, which touches the same file.
      Done 2026-10-12. Removed from `src/lib/video.ts`: `publicBody()`, `membersOnlyHeadings()` and, with them, the
      whole build-time half that nothing called any more - `getVideos()` (and its build guards, which the importer
      holds since T150), `videoCard()`, `videoLink()`, `videoTerms()`, `videoSearch()` and the `Video` type. The file
      keeps `videoUrl`, `apiVideoCard`, `apiVideoLink` and `videoPageData`. The other readers of the rule: none in
      `src/` or `server/src/` outside the importer (`members-only.ts`, `video-guards.ts`) and the backend's own
      `plainifyMarkdown`/`summary` use, which stay. Checked: `astro check` 0 errors, `npm run build`, `check:bundles`
      clean, `check:lang` 50 of 50. Docs: none consulted.
- [x] T101 [US6] Update `README.md`, `MIGRATION-PLAN.md`, `REWRITE.md` session log.
      Done 2026-10-12. README: one paragraph of plan phase 6 (the panel, the rules, the hosts, the upload and its
      limits, the pictures, the copy, the migrations 015 to 020, the removed publishing path, the checks and the
      guide). MIGRATION-PLAN: a note at the top. REWRITE: the summary of the phase (order, the owner's decisions, what
      was found, what is not explained, what is left). Added by the owner's word the same day: the Yandex Metrika
      counter is never removed - `server/test/metrika.test.ts`, a standing rule in METRIKA.md and notes in T117 and
      T167. Docs: none consulted.
- [x] T102 [US6] OWNER CHECK, plan phase 6: a saved post is on the site at once for a signed-in viewer and within
      10 seconds for a visitor; raw HTML is refused; a 500 MB file uploads and plays; two sessions editing one entry
      get a conflict. Since 2026-10-12 also: T182 (the interface languages) has passed, and the new admin pages read
      right in both languages.
      Passed 2026-10-12 by the owner's word, after the check list `owner-check-phase-6.md` was given to him ("we
      consider the check list passed"); the list was not ticked line by line in the repository, and the real link
      from each host and the 500 MB upload are what that word covers.

---

## Phase 9: User Stories 7, 8, 9 - comments, feedback, settings (Priority: P3) - plan phase 7

**Goal**: comments without Disqus, a feedback form that stores and mails, the superuser's settings page.

**Independent Test**: quickstart phase 7.

### Tests first

- [x] T103 [P] [US7] Tests first for comments: who may read and write, text always shown as text, a moderator hides
      and restores, nothing leaks from a hidden entry.
      `server/test/comments.test.ts`: a guest reads and cannot write, a student writes, markup is
      stored and shown as text, a metr hides and restores, a comment on a hidden entry is nowhere visible.
      Done 2026-10-13 (tests first, red until T106). `server/test/comments.test.ts`: 13 tests, 0 green, 13 red for the
      right reasons (no route, no `comments` table, `Disqus.astro` still there). They cover: the guest, the signed-out
      visitor, the account whose date ended and the blocked account (401 `unauthorized`, 403 `forbidden`, 403
      `blocked`); the writers (a student with a date, a metr, an admin); the answer's shape and order and no address;
      markup kept as typed and answered as JSON; the body rules (trim, longest, empty, NUL as 400, a request over the
      parser's limit as 413); hide and restore with the stored `hidden_by`/`hidden_at` and one audit row each
      (`comment_hidden`, `comment_restored`, against the entry, the text not copied); the 404 of everyone but metr and
      admin; T151 (a guest reads the comments of a paid lecture shown as a teaser and cannot write; without a teaser the
      entry is not there); an entry that is hidden, in the future or deleted has no comments for anyone, an admin
      included, and they return with it; a blocked author's comments stay; limit B (10 stored comments in 10 minutes
      per account, then 429 with `Retry-After`; hiding is not limited); and a static check that the previous comment
      component, `site.disqus` and the count script are gone and that `Comments.astro` has no `set:html`.
      `server/src/comments/routes.ts` is a stub with `commentLimits`. Decisions the tests fix and the owner may change:
      who writes (a status that opens the lectures with a date that has not ended, and the editors), hide and restore
      answer 404 to everyone else, the numbers of limit B. NOT fixed, because the documents do not decide it: a guest
      who holds a paying date, and a student with no date. Documentation servers: none consulted.
      Amended the same day (2026-10-13), after the owner's answers (T184): the file now has 18 tests, 0 green, all red
      for the same reasons. Changed: the list is newest first and carries `mine` and `editedAt`; a guest that holds a
      paying date writes and a lecture status with no date does not; limit B is 5 in 10 minutes. Added: the author
      changes and deletes their own comment during one day (a deletion keeps the row; hidden and deleted comments
      are the editors' and cannot be touched by the author), and at most 20 comments under one entry per account
      (409 `entry_cap`). The decisions that were open are closed by the owner's word.
- [x] T184 [US7] Written down before any code: the owner's rules for comments and the six reactions (who writes,
      limits, one day to edit, one reaction per account) in the spec, contract and data model.
      Added 2026-10-13 at the owner's word (the screenshot of the previous service's block and his
      answers): the requirement and the contract before the code. `spec.md` (FR-032 clarified, FR-047 added, two
      acceptance scenarios), `contracts/http-api.md` ("Comments": the list newest first, change and delete by the
      author within a day, the cap, the six reactions and their three routes, the one writer rule),
      `data-model.md` (`comments.edited_at`, `deleted_at`; table `reactions`). Done 2026-10-13. No documentation
      server consulted.
- [x] T185 [P] [US7] Tests first for reactions: six zeros for everyone, one reaction per account that can be changed
      or removed, only writers give one, the pictures and the component exist.
      Added 2026-10-13 (T184). `server/test/reactions.test.ts`: 8 tests, 0 green, 8 red (no route, no
      table, no pictures, no component). They cover: six zeros for everyone; one reaction per account and entry,
      changed in place and removed, with the counts and `mine`; who gives one (the writer rule: a student with a date,
      the old paying guest, metr, admin; 401, 403 and `blocked` for the rest, on `PUT` and `DELETE`); an unknown kind
      as 400 on `kind`; the entry's visibility (a teaser is read by a guest, an entry nobody sees is 404 for all); a
      blocked account's reaction stays; and two static checks, the six pictures with their licence as files of the
      site and the component and the labels in both languages. Done 2026-10-13. No documentation server consulted.
- [x] T104 [P] [US8] Tests first for the feedback form and the mail queue: a message is stored before any mail, a mail
      failure keeps it, bots and bursts are refused.
      `server/test/feedback.test.ts`: stored before mail, mail failure keeps the row, a burst past the
      limit is refused with nothing stored, a filled honeypot or a too-fast submit or an oversized body refused, visitor
      text never reaches a header.
      Done 2026-10-13 (tests first, red until T107 and T108). `server/test/feedback.test.ts`: 9 tests, 0 green, 9 red
      for the right reasons (no route, no `feedback` or `mail_queue` table, no worker). They cover: a valid message
      stored with its `feedback_notice` mail row at once and nothing sent in the request, only the network part of the
      address kept; a mail failure keeps the message (attempt counted, error kept, next attempt later, not asked again
      before it is due, success sets `mailed_at` and clears the error, a sent row is not sent twice); visitor text never
      in a header (a fixed subject, the setting as recipient, a message of exactly `to`, `subject` and `text`, a line
      break refused in the one-line fields); the subject as a code of the fixed list (T144); the honeypot and the fill
      time (too short, missing, not a number, future, a day old) as a plain 400 that names no check; the size rules
      (5000, 100, 200 characters, NUL, a 413 past the parser's limit); a cross-site post; limit C (5 stored messages
      an hour per address, refusals not counted, Retry-After); and the admin list for metr and admin. The stubs are
      `server/src/feedback/routes.ts` (`feedbackLimits`, `feedbackSubjects`) and `server/src/mail/queue.ts`
      (`deliverDue`, `MailTransport`). Contract and data model changed first: `name` and `subject` columns,
      `mail_queue.feedback_id`, the `201 {received: true}` answer. Decisions the tests fix and the owner may change: the
      numbers above, the plain 400 for a bot, one-line `name` and `contact`. NOT here: the fill-time rule of sign-up
      that T159 left with this task; it changes the sign-up form and its tests, and is proposed as T188. Documentation
      servers: owasp-docs (3 searches, the cheat sheet on bots for the hidden field).
- [x] T105 [P] [US9] Tests first for the superuser's settings: the password is re-entered, a code is mailed to the new
      recipient, the old address is told, every change is logged.
      `server/test/settings.test.ts`: only the superuser reaches it; the password is re-entered;
      a new recipient works only after its code; the old address is told; every change is logged; the members-block
      switch changes no other code path.
      Done 2026-10-13 (tests first, red until T107 for the `mail_queue` table and T110 for the routes).
      `server/test/settings.test.ts`: 8 tests, 0 green, 8 red for the right reasons (no route, no `mail_queue`). They
      cover: the 404 of an unknown route on every verb for a signed-out visitor, a guest, a student, a metr and a plain
      admin; the read (`feedbackRecipient`, `recipientPending`, `membersBlockMode`, no-store); the switch (password
      required, a bad value refused on `membersBlockMode`, `updated_by` and one `settings_log` row, a repeat writes no
      second, and under "hidden" nothing but the two block members differs in the entry, the list or the search, and no
      mail or recipient moves); a static check that only the entry query and the settings route name the setting; the
      recipient change (202, the code mailed to the new address only, a warning without the code to the old address
      at once, the old address told again when it changes, active only after the code, the code in no table in the
      clear, a code works once); replacement by a second request, five wrong codes, 30 minutes; the address rules (one
      bare address of at most 254 characters, a list, a display name, a line break, the current address refused); and
      the password's pause as in `reauth.ts`. The stub is `server/src/settings/routes.ts` (`settingsLimits`).
      Added after reading the Authentication Cheat Sheet ("Changing A User's Registered Email Address"): the warning to
      the OLD address when the change is asked for, not only after it; the owner may drop it. Contract and data model
      changed first (`recipient_change_requested` kind, the pending value). Documentation servers: owasp-docs (1
      search, 1 read).

### Implementation

- [x] T106 [US7] The site's own comments replace Disqus: the table, the routes, the comments block with the previous
      look, and the previous service removed from the pages.
      `server/migrations/021.do.comments.sql` and `server/src/comments/routes.ts` (contracts); a
      component `src/components/Comments.astro` showing text only; remove `src/components/Disqus.astro`, the Disqus
      count script of `Base.astro` and `site.disqus` from `src/config.ts`.
      Widened 2026-10-13 (T184, the owner's answers): the list is newest first with `mine` and `editedAt`; `PATCH` and
      `DELETE /api/comments/:id` for the author within a day (soft delete: `deleted_at`, `edited_at` columns); the
      20-per-entry cap (409 `entry_cap`); limit B is 5 in 10 minutes (`commentLimits`); the one writer rule is a
      function of its own that T186 uses too; the component has the look of the previous service (T187 owns the
      pictures and the reactions row, this task owns the comments block: count, sign-in link or name, letter avatar,
      the field, the list). Migration numbers in this phase are the next free ones after 020 (T106 021, T186 022, T107 023: T186 is built before T107, so it takes the next number; corrected 2026-10-13); renumber them here when another migration lands first.
      Done 2026-10-13. Server: `server/migrations/021.do.comments.sql` (table `comments` with `edited_at`,
      `deleted_at`, `hidden_by`/`hidden_at`; `person_lecture_access`, the person half of the lecture rule, which
      `lecture_view` now calls, so "who writes" and "who opens a paid lecture" are one rule in one place; answers of
      `lecture_view` unchanged), `server/src/access/comments.ts` (the only reader of the table; every function asks
      `entry_view`), `server/src/comments/routes.ts` (`commentLimits`, the five routes, mounted in `http/app.ts`),
      `src/lib/comment-rules.ts` (the two numbers the page shares: 2000 characters and one day). Page:
      `src/components/Comments.astro`, `src/scripts/comments.ts` (text only, no `innerHTML`), `src/styles/comments.css`,
      the strings of both languages in `src/i18n/strings.ts`; `Disqus.astro`, its count script in `Base.astro`,
      `site.disqus`, its types in `env.d.ts` and the rule hiding its advertising frame are removed; the locked page
      (`src/layouts/LockedEntry.astro`) carries the block too (T151). `server/test/comments.test.ts`: 18 of 18 green.
      `npm run check:comments` (new, `scripts/check-comments.mjs`): 17 of 17, in a browser: a signed-out visitor, a
      student who writes, changes and deletes (markup shown as text, nothing ran), a guest account told why the field is
      closed, a metr who hides and restores, the block under a locked lecture, the count in Russian. The full server
      suite: only the red tests of T104, T105 and T185 fail, as they must; the comments row of the visibility matrix,
      a todo since T086, is a real test now (every entry carries a comment, and its thread is there exactly when the
      entry is, a teaser's included). `check:markup` (named difference added for the two comment blocks, counted):
      149 routes, 0 differences. `astro check` 0 errors. Migration 021 is to be applied to the development database
      (`npm run db:migrate`). Decisions the owner
      may change: the block is always shown, with no reveal button (T151 says the button is gone; a "hide comments"
      toggle is a small addition); the order of the checks (entry, who, window, text, cap); the list is capped at the
      newest 500. NOT done here, by the split of the work: the reactions row and the pictures (T186, T187), the numbers
      of comments on the list cards (nothing showed them before). Documentation servers: none consulted.
      Amended 2026-10-13, the owner's word after the report: a button above the block hides the thread and shows it
      again (the old site's block had one). The block is shown on every load, the button is written hidden and shown by
      the script (nothing is offered to a browser without scripts), and the choice is not remembered; labels
      `comments_collapse` and `comments_expand` in both languages, the look in `src/styles/comments.css`.
      `check:comments` has three checks more (20 of 20). No documentation server needed.
- [x] T186 [US7] Reactions on the server: the table and the three routes behind the entry's visibility and the one
      writer rule, answering the six counts and the viewer's own choice.
      Added 2026-10-13 (T184). The reactions: `server/migrations/022.do.reactions.sql` (table `reactions`, data-model.md) and
      `server/src/comments/reactions.ts` with `GET`, `PUT` and `DELETE /api/entries/:kind/:slug/reactions`, behind
      the same entry visibility and the same writer rule as the comments; no new limit (one row per account and
      entry bounds it). Makes T185 green. Needs: express-docs, postgresql-docs.
      Done 2026-10-13. The migration is numbered 022, not 023 (it is the next after 021; the feedback tables of T107
      become 023). `server/migrations/022.do.reactions.sql`: the primary key (`entry_id`, `user_id`) is the rule "one
      per account per entry", the six kinds a check constraint, an index on (`entry_id`, `kind`) for the counts.
      `server/src/access/reactions.ts` is the only reader of the table (the counts and the viewer's own kind in one
      query; setting is one `INSERT ... ON CONFLICT DO UPDATE` whose `WHERE` leaves a row untouched when the kind is the
      same one); `server/src/comments/reactions.ts` has the three routes, mounted in `http/app.ts`, with the comment
      route's order (entry 404, signed out 401, not a writer 403 or `blocked`, kind 400) and the one writer rule
      `person_lecture_access`; every answer is `{counts, total, mine}` and no-store; `entryKinds` of the comment
      routes is exported so the two files name an entry the same way. `server/test/reactions.test.ts`: 6 of 8 green;
      the two red ones are the pictures and the component, which T187 builds. One test case was wrong and is
      corrected: a members entry with no teaser is a 404 for a signed-out visitor only, a signed-in guest account
      reads its counts (the same correction the comments test had). Full server suite: 593 of 612; the 19 red are
      T104 (9, until T107 and T108), T105 (8, until T107 and T110) and T185's two (T187), as they must. `astro check`
      0 errors. Migration 022 is to be applied to the development database (`npm run db:migrate`, with 021).
      Documentation servers: postgresql-docs (1 search, 1 read), express-docs (1 search).
- [x] T187 [US7] The look of the reactions: the question and the response count above six Noto Emoji pictures with
      names and counts, the picked one marked, a sign-in prompt for visitors.
      Added 2026-10-13 (T184). The look of the previous comment service: `src/components/Reactions.astro`
      (the title, the response count and the six pictures with their names and counts, the picked one marked, the
      sign-in prompt for a signed-out visitor, the counts only for a guest account), `public/images/reactions/` with
      six Noto Emoji pictures and their licence text (named Apache 2.0 here on 2026-10-13 and corrected the same day:
      the source states the OFL 1.1 and, in its README, Apache 2.0; both texts are kept, see the Done note and
      RISKS.md 5), the labels in both languages in `src/i18n/`, and
      the styles in a file of their own beside `custom.css` (a scoped style cannot reach what the script builds, see
      CLAUDE.md). Compared against the owner's screenshot of 2026-10-13 at 1280 and at 400 px, light and dark. The
      owner asked for the closest look; Noto Emoji is the closest freely licensed set and was named to him on
      2026-10-13 (the files are assets, not a package; he sees them in the owner check). Needs: tailwind-docs.
      Done 2026-10-13. LICENCE CORRECTED: this task and T185 said Apache 2.0; the LICENSE file of the source
      repository (googlefonts/noto-emoji) has been the SIL Open Font License 1.1 since its commit "Update LICENSE to
      OFL" of 2024-07-29, and only its README still says Apache for "most image resources". So that no reading can
      become a conflict later, `public/images/reactions/LICENSE.txt` keeps BOTH texts (the OFL as the source ships it
      today, Apache 2.0 as it shipped until then), the authors list and the facts; the files are copied unchanged, so
      no notice of changes is owed, and no mention on a page is needed. The open point is an entry of its own in
      RISKS.md (5), with what to do if a picture is ever changed, sold or published with the repository. Built: `src/components/Reactions.astro` (the question, the response count, six buttons with
      the picture, the name and the count; the root is a div, because a section inside the comments section would end
      the named difference of `check:markup` early), `src/scripts/reactions.ts` (one request for the counts and
      the viewer, a press picks, changes or takes back; the answer of the server is what is painted),
      `src/scripts/comment-viewer.ts` (the viewer and `canWrite`, the display half of the writer rule, moved out of
      `comments.ts` so the two blocks ask one function and make one request to `/api/auth/me`),
      `src/lib/reaction-kinds.ts` (the six names, one home shared with the backend, whose route re-exports it),
      `src/styles/reactions.css`, `reactionLabels` and five phrases in `src/i18n/strings.ts` (both languages;
      the count of responses has the Russian plural and counts reactions, where the previous service
      counted "answers"). Found and fixed while comparing at 1280 and 400 px:
      the article's own styles (`.prose ul`, `.prose img`, `.prose h2`, `.prose ol`, `.article-prose p`,
      `.prose a`) reached the block and gave the pictures a shadow box and a bullet each, and the comments block
      (T106) a large count with a line under it, an indented list and a blue sign-in link; every rule of both
      stylesheets now has one class more than those, and names what it takes back. `server/test/reactions.test.ts`:
      8 of 8 green. `npm run check:comments`: 29 of 29 (the row in English and Russian, a signed-out visitor told to
      sign in, a student picks, changes, takes back and keeps it across a reload, a guest account sees the counts and
      cannot add); with `KB_SHOT_DIR` it also writes `look-1280-dark/light` and `look-400-dark/light`.
      `check:markup`: 149 routes, 0 differences. `astro check` 0 errors. Documentation servers: tailwind-docs
      (2 searches: `theme()` with dot notation and the dark mode selector, v3.4).
- [x] T107 [US8] The feedback form's server side: the tables for messages and the mail queue, the route that stores a
      message first, and the admin page that lists them.
      `server/migrations/023.do.feedback-mail.sql` (`feedback`, `mail_queue`; 022 is the reactions of T186), `server/src/feedback/
      routes.ts` (`POST /api/feedback`) and the admin page `src/pages/admin/feedback.astro`.
      Widened 2026-10-13 (T104): the table has `name` and `subject`, the queue row has `feedback_id`; the route also
      has `GET /api/admin/feedback` (metr and admin, newest first, only the network part of the address); the
      numbers are `feedbackLimits` in `server/src/feedback/routes.ts`. Makes T104 green, with T108.
      Done 2026-10-13. `server/migrations/023.do.feedback-mail.sql`: `feedback` (the message, name, contact, topic
      code, the network part of the address, `mailed_at`, `mail_error`) and `mail_queue` (kind, recipient at the time,
      subject, body, `feedback_id`, attempts, `next_attempt_at`, `sent_at`, `last_error`, `created_at`; a feedback
      notice belongs to its message and no other kind does; a partial index on the unsent rows is what the worker will
      read). `server/src/feedback/routes.ts`: `POST /api/feedback` (limit C taken first and given back when the form is
      refused, the honeypot and the fill time one plain 400, then the fields, then one transaction that writes the message
      and its `feedback_notice` row; nothing is sent in the request) and `GET /api/admin/feedback` (404 to anyone who is
      not a metr or an admin, newest first, only the network part of the address, `limit` up to 200); mounted in
      `http/app.ts` before the `/admin` routers. `server/src/mail/messages.ts`: the subject line (fixed texts, a code at
      most) and the plain-text body of a notice. With no `feedback_recipient` set the message is still stored, with
      `mail_error` "no recipient is set" and no queue row, so nothing is lost before T110 seeds the setting. The page:
      `src/pages/admin/feedback/index.astro` and `src/scripts/admin-feedback.ts` (newest first, 20 to a page with the
      panel's pager, text only, the mail state of each message in both languages; a 404 page for a student and a visitor),
      the fourth link of `AdminNav.astro` and of the account menu, `site.admin.feedbackPage`, the strings of both
      languages. `server/test/feedback.test.ts`: 7 of 9 green; the two red ones call `deliverDue` and wait for T108.
      `npm run check:feedback` (new, `scripts/check-feedback.mjs`): 14 of 14 in a browser. The full server suite: 603 of
      612, the nine red ones are T104's two (T108) and T105's seven (T110). `astro check` 0 errors. Migration 023 is to be
      applied to the development database (`npm run db:migrate`). Not yet: the form of the site still posts to the previous
      service (T109), and no recipient is set until T110. Documentation servers: postgresql-docs (2 searches: the actual
      current time against the transaction's start, partial indexes).
      Amended 2026-10-13, the owner's order (before T188): the admin list is paged and searched on the server, the way
      the posts' list of the panel is. `GET /api/admin/feedback?page=&limit=&q=` answers `{items, total}`, twenty to a
      page and fifty at most, newest first; it answered the newest hundred (two hundred at most) as a bare array and the
      browser cut that into pages, so nothing older was reachable and nothing could be searched. The search is a
      case-blind substring of the message text, the name or the contact, one field at a time, written with `strpos`
      and not LIKE so that `%`, `_` and a backslash are plain characters; the network part of the address and the
      topic code are not searched. The page numbers (`defaultPageSize` 20, `maxPageSize` 50, `positiveInt`) moved to
      `server/src/http/paging.ts`, which the posts' and the people's routes import in place of their own copies, so a
      third list did not become a third copy. The page has the search form of the posts' page (`ym-disable-keys` on the
      field, since what is typed is a name or an address) and asks the server for every page and every search; the
      count line says "Found" while a search is on. `server/test/feedback.test.ts`: 11 tests, 9 green (the list test
      changed to the new shape and two tests added, red first; the two red ones wait for T108). `npm run
      check:feedback`: 22 of 22 (8 new). The full server suite: 605 of 614, the nine red ones are the same. Documentation
      servers: postgresql-docs (2 searches: `strpos`, LIKE and its escape character).
- [x] T188 [US3] Sign-up gets the fill-time rule of the feedback form: a form sent in under 3 seconds, missing, from
      the future or a day old is refused with a plain 400.
      Priority LOW. Added 2026-10-13 (T104). The fill-time rule of sign-up that T159 and T050 left with T104:
      the sign-up page sends `startedAt` like the feedback form, and `POST /api/auth/signup` refuses a form sent
      under 3 seconds after it was opened, missing, in the future or a day old, with the same plain 400 as the
      feedback form (the honeypot and the cap of 10 an hour per address already exist). It changes the sign-up form,
      `server/src/auth/routes.ts` and every existing test that signs up, so it is a task of its own and the owner
      decides whether it is wanted: a guest account cannot comment or react (FR-032, FR-047), so the harm of a bot's
      account is small. The numbers and the answer come from `feedbackLimits` (one home).
      Placed after T107 at the owner's word (2026-10-13): the numbers are then in working code, not in the stub.
      Done 2026-10-13. One home for the rule: `src/lib/fill-time.ts` (`fillTime` 3 seconds and a day, and
      `fillTimeAccepted`, a plain module the backend and the page both compile; listed in `server/test/shared.test.ts`).
      `feedbackLimits.minFillMs` and `maxFillAgeMs` read it and the feedback route asks `fillTimeAccepted`, so the
      feedback form behaves as before; `POST /api/auth/signup` asks the same after the honeypot, with the same plain 400
      and the same count against the cap of ten (the attempt is counted before any check). The page
      (`src/pages/auth/signup.astro`) asks `GET /api/auth/me` at once to learn the server's clock, sends `startedAt`
      in it, and HOLDS the send back until three seconds have passed since the page opened, so a person whose password
      manager fills every field is never turned away by the rule. Tests first: `server/test/fill-time.test.ts` (4) and
      one case of `server/test/auth-routes.test.ts` (honeypot, at once, none, not a number, future, a day old, zero,
      and the two edges that pass); every existing sign-up of the tests and of three check scripts names a `startedAt`
      ten seconds ago. `npm run check:auth` grew a section of the form in a browser (99 of 99): sent at once it is held
      back and then goes through and opens the account page; from a device whose clock is ten minutes ahead it still
      goes through. Documentation servers: none (the rule is the club's own and the feedback form's, already in
      working code).
- [x] T108 [US8] Mail sending: ask the owner's consent for the nodemailer package, then build the mailer and the queue
      worker that sends outside any request.
      Ask the owner for consent to add `nodemailer` 10.0.16, report its size, install; then
      `server/src/mail/mailer.ts` (explicit options for file access, raw messages and address parsing) and
      `server/src/mail/queue.ts` (a worker loop reading the queue table, never inside a request). Needs:
      nodemailer-docs; the owner connects it before this task starts.
      Done 2026-10-13, with the owner's consent for `nodemailer` 10.0.16 (given the same day; 1.58 MB unpacked, no
      dependencies of its own, its own type declarations, MIT-0, Node 20 or later; installed at the exact version).
      Tests first, `server/test/mailer.test.ts` (14 tests, new). `server/src/mail/address.ts`: `isBareAddress`, the one
      rule for "one bare address", which the settings route (T110) takes too; strict on purpose (no display name,
      comment, quoted string, list or non-ASCII). `server/src/mail/mailer.ts`: `loadMailConfig` (`SMTP_HOST`,
      `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` and the optional `SMTP_FROM`, all or none; with none the queue waits and
      the start line says so; `MAIL_OUTBOX_DIR` is the development outbox, one text file per message), `smtpOptions`
      (every risky option spelled out and compared whole by a test: file and URL access off, one recipient, STARTTLS
      required except on port 465, TLS 1.2 as the floor, certificates checked, short timeouts, no pool, no logger) and
      the transport, which builds the message from `to`, `subject` and `text` only. `server/src/mail/queue.ts`:
      `deliverDue` (a row at a time under `for update skip locked`, so two passes never send one row twice; a success
      sets `sent_at` and the message's `mailed_at`, a failure counts an attempt, keeps one short error line on the row
      and on the message and moves the next attempt: 1 minute, 5, 15, an hour, 3 hours, then every 6 hours for ever)
      and `startMailWorker` (a pass at start and every 30 seconds, never two together, stopped before the pool at
      shutdown); started by `main.ts`. `npm run check:mail` (new, `scripts/check-mail.mjs`): 13 of 13 in the real
      server process (a half-written SMTP set stops the start and the password is not printed, the waiting notice goes
      out at start, a message posted through the route goes out on a later pass, the answer did not wait for mail). The
      two red tests of T104 are green. The full server suite: 621 of 628, the seven red ones are T105's (T110). Not
      exercised: a send through a real SMTP server over TLS, which waits for the mailbox of T111; what is exercised is
      that a server that offers no STARTTLS is refused with no login and no message sent. Documentation servers:
      nodemailer-docs (5 searches and 3 sections: the security options of the message and of the SMTP transport, the
      TLS options, the error reference, the changelog of the 2025-2026 fixes).
- [x] T109 [US8] The feedback form on the site posts to the site's own route instead of the external web3forms
      service, with the same look and the same open event.
      Replace the web3forms call in the feedback form (`src/components/ContactModal.astro` and its
      script) with the site's own form, keeping the `site.contact.openEvent` contract; keep its look.
      Done 2026-10-13. The form (footer button, and the open event of the sign-in page's help link) posts JSON to
      `POST /api/feedback`: `message` is the route's `body`, `name` its `name`, `email` its `contact`, the hidden
      subject its `subject`; the service's access key and address are gone from the markup. A honeypot field `website`
      (off-screen, out of the tab order and hidden from assistive technology), `startedAt` in the SERVER's time (the
      offset is learned from the Date header of the `/api/auth/me` answer the form asks for when it opens, now for every
      visitor and not only a member, so a device whose clock is minutes off still sends; checked in the browser with a
      clock ten minutes ahead), `maxlength` from the route's own limits, the submit button off while a message is on its
      way, and a third toast for the route's 429. The look is as it was (screenshot checked). One home for the topic
      codes and the three lengths: `src/lib/feedback-rules.ts`, read by the route (which re-exports them, so the tests
      are unchanged) and by the form; `site.contact.signInSubject` is the code `signin_problem` now. `npm run
      check:markup` marks the contact form's `<form>` on both sides (note 6 of the script) and takes the new toast
      template out of the new document: 149 routes, 0 differences. `npm run check:feedback` grew a section of the form,
      38 of 38 in all: the footer button, no old service in the markup, the limits and the honeypot, a visitor's message
      stored as typed with its notice queued and nothing sent in the request, a form sent at once and a filled honeypot
      refused with nothing stored, the open event's address and topic code, a member's name and address filled in, the
      skewed clock, the sixth message of an hour as the 429 toast, and the panel listing what the form stored.
      `check:lang` 52 of 52, `check:auth` 95 of 95, `astro check` 0 errors, `check:bundles` clean. No documentation
      server was needed (the route and its rules are the club's own). Messages now reach the club's database; they reach
      its mailbox when the superuser's setting (T110) names a recipient and the server has a mail account (T111).
- [x] T110 [US9] The superuser's settings page and routes: change the recipient with an emailed code, re-enter the
      password, the locked-or-hidden switch, the change log.
      `server/src/settings/routes.ts` and `src/pages/admin/settings.astro`: recipient with the emailed
      code, the old address told, password re-entered, the locked-or-hidden switch, the change log; the recipient seeds
      from the environment only on the first start; the address is never in the repository.
      Widened 2026-10-13 (T105): the routes are `GET` and `PUT /api/admin/settings` and `POST .../recipient/confirm`
      of the contract; the numbers are `settingsLimits`; the code is stored as a hash; the old address is warned when
      the change is asked for and told when it happens; `members_block_mode` is named by the entry query and this
      route only. Needs the `mail_queue` table of T107 first.
      Done 2026-10-13. `server/src/settings/routes.ts`: `settingsRouter` with `GET` and `PUT /api/admin/settings` and
      `POST /api/admin/settings/recipient/confirm`, 404 to everyone but the superuser (the account is read on every
      request, `users/actor.ts`), no-store, the password checked first by `reauth.ts` (its refusal answers are the
      handover's own, exported from `superuser-routes.ts`). The switch is written here and read by the entry query only
      (the first test of `settings.test.ts` reads the sources); the same value again writes no log row. A new recipient is
      a request: the pending value (address, scrypt hash of the 8-digit code, expiry, tries left) is stored with the mail
      row to the NEW address (the code) and the one to the OLD address (a warning with no code) in one transaction; a
      second request replaces it; a confirmation takes the row for update, a wrong code costs a try and the fifth voids
      the request, an expired request is removed when met, a code that is not eight digits costs nothing; a right code
      makes the address active (the trigger of migration 015 logs who, from, to), removes the request and queues the
      notice to the old address. `server/src/settings/seed.ts`: `FEEDBACK_RECIPIENT_SEED` read at every start and used
      only when no recipient is set; an address that is not one bare address stops the start. The three mail texts are in
      `server/src/mail/messages.ts` (fixed subjects; the code and the addresses in the body only). The page:
      `src/pages/admin/settings/index.astro` and `src/scripts/admin-settings.ts` (the recipient in force, the open
      request, the code form, the switch with a password field of its own, every sentence in both languages, the
      password and the code cleared after each answer); `Astro.locals.superuser` from `src/middleware.ts` is what makes
      the page a 404 to anyone else. `server/test/settings.test.ts` 7 of 7 green and `settings-seed.test.ts` (new) 2 of
      2; the full server suite 630 of 630 on the third run (a race in a loop test of T108 and the scan of
      `superuser-writes.test.ts`, which reads `scripts/` too, were found and fixed). `npm run check:settings` (new,
      `scripts/check-settings.mjs`): 23 of 23 in a browser. `check:auth` 96 of 96, `check:lang` 52 of 52, `astro check`
      0 errors, `check:bundles` clean. No documentation server was needed: the flow is the one T105 wrote, with the
      Authentication Cheat Sheet it cites. Not built: a page of the settings log (the log is written by the database; a
      reader of it is a task of its own if the owner wants one).
- [x] T147 [US9] The account page and the admin menu link to the two new admin pages, Feedback and Settings, for a
      metr or an admin and for nobody else.
      Priority MEDIUM. G9. The account page shows the "Posts" and "Users" links to a metr or admin (T070)
      and `AdminNav.astro` lists the new `/admin/feedback/` and `/admin/settings/` pages (T107, T110).
      First half done 2026-10-11 (with T070): the account menu shows "Публикации" and "Пользователи" to a metr and an
      admin and to nobody else (`check:auth` has two checks for it). Second half stays open: the two pages do not exist
      before T107 and T110, and a link to a missing page would be a dead link; `AdminNav.astro` gets them when those
      tasks add the pages.
      Moved 2026-10-11 at the owner's order from plan phase 3 to this phase, where the two pages it needs are built:
      T147 is closed here, when T107 and T110 have added the pages and `AdminNav.astro` lists them, and not before.
      Plan phase 3 no longer waits for it.
      Closed 2026-10-13, with T110. Feedback was added with T107. Settings is the superuser's page, so its link is drawn
      for the superuser only, not for every metr and administrator: `src/middleware.ts` puts `superuser` into
      `Astro.locals`, `AdminNav.astro` shows the link on it, and the account menu shows it under `isSuperuser`. A metr's
      and an administrator's panel row and menu have no settings link (`check:settings` and `check:auth`).
- [x] T151 [US7] Comments under a paid lecture shown as a teaser: a guest may read them to see what the course is
      about, only an account with lecture access writes.
      Priority HIGH. G13, owner decision 2026-10-10 (replaces the closing of comments to guests on paid
      lectures of 2026-09-28): a guest who sees a paid lecture as a teaser also reads its comments, so they understand
      what is going on and are encouraged to buy the course; writing needs a status that opens the lectures. Test it
      in T103 with the rule in `data-model.md` (a comment is shown to anyone for whom `entry_view` is not `none`) and
      record that the reveal button of Disqus is gone.
      Done 2026-10-13 with T106: the test is in `server/test/comments.test.ts` ("a paid lecture shown as a teaser"),
      the browser check is `check:comments` ("the block under a locked lecture"); the reveal button and the "locked
      until signed in" prop went with `Disqus.astro`, and the locked page carries the comments block.
- [x] T112 [US7] Documentation for phase 7: README, MIGRATION-PLAN, FEEDBACK-FORM.md and the REWRITE.md session log
      updated for comments, reactions, feedback and settings.
      Update `README.md`, `MIGRATION-PLAN.md`, `FEEDBACK-FORM.md`, `REWRITE.md` session log.
      Done 2026-10-13. `README.md`: a section "Comments, reactions, feedback and settings" (what each is, the rules, the
      mail, the migrations 021 to 023, the checks and their counts), and a note under the 2026-09-22 section that every
      line about Disqus is history; the layout list says Disqus is gone. `MIGRATION-PLAN.md`: a dated note beside the
      other phases'. `FEEDBACK-FORM.md`: a section at the top that says the form posts to the club's own server and
      what is refused, read and mailed; the older text below it stays as history. `REWRITE.md`: the session log of
      plan phase 7 (order, the owner's decisions, the one-home rules, mail, settings, what was found, what is not
      exercised) and the mailbox note under "Open points". New: `MAIL.md` (T111) and
      `specs/001-self-hosted-club-site/owner-check-phase-7.md`, the list the owner ticks for T113. Documentation
      servers: none.
- [x] T113 [US7] The owner's own check of phase 7: comments and reactions look and behave right, the feedback form
      delivers, the settings page changes the recipient safely.
      OWNER CHECK, plan phase 7 (widened 2026-10-13 with the reactions and the look of the previous
      service's block: the six pictures, the counts, a comment changed and deleted within a day): a guest reads and
      cannot write, a member writes, a metr hides; a
      feedback message is on the admin page and in the mailbox; a burst is refused with 429 and nothing stored; a new
      recipient works only after its code.
      Amended 2026-10-13, the owner's word: the part "in the mailbox" went with T111 to plan phase 8 (a real mailbox
      needs the real server). Here a message is seen on the admin page and as a file of the development outbox
      (`MAIL_OUTBOX_DIR`); the recipient's code is read from that file too.
      Passed 2026-10-13 at the owner's word, with the list `owner-check-phase-7.md`. What the development database
      and the outbox showed when he said so: the recipient changed by the emailed code (a request and its confirmation
      in the settings log, the code mail sent), a feedback message stored, listed and mailed to the new recipient (its
      notice sent, a file in the outbox), the message sent before any recipient kept with "no recipient is set", and a
      date of access given to the student. Not traced in the database: comments, reactions, the burst refused with
      429, the locked-or-hidden switch and a fast sign-up; they were looked at by eye, or taken as covered by the
      tests and browser checks named in the list's first table. The real mailbox is not part of this check: T111,
      plan phase 8.
- [x] T144 [US3] The help link of the sign-in page opens the feedback form with the subject set to a sign-in problem
      and a signed-in member's name and address filled in.
      Priority MEDIUM. G6. The help link of the sign-in page opens the feedback form with the subject
      "sign-in problem", and a signed-in member's name and address are prefilled: `POST /api/feedback` gets an
      optional `subject` from a fixed list (never into a mail header, T104), `GET /api/auth/me` carries the address,
      T053 adds the help link, T109 the prefill.
      Partly done 2026-10-11 in T053: the help link of the sign-in page opens the form with the subject; `GET /api/auth/me`
      carries the address. Open: the fixed subject list on `POST /api/feedback` (T104) and the prefill (T109).
      MOVED 2026-10-11 from plan phase 2 to this phase, at the owner's word (moved, not closed): what phase 2 could do
      is done (see above); what is open can only be done here, with T104 and T109.
      Closed 2026-10-13, with T109: the fixed subject list is `src/lib/feedback-rules.ts` (the route refuses anything
      else, T107), the help link sends its code (`site.contact.signInSubject` is `signin_problem`), and the form fills a
      signed-in member's name and address from `GET /api/auth/me` at every opening; `npm run check:feedback` drives the
      open event with the code and the address and a student's account, and reads the stored rows back.
- [x] T145 [US3] Yandex Metrika's Session Replay must not record the new sign-in, sign-up, account, admin and settings
      forms: their fields are marked to be skipped.
      Priority HIGH. G7. Yandex Metrika's Session Replay would record the new sign-in, sign-up, account,
      admin and settings forms. Mark personal fields with `ym-disable-keys` and the admin pages with `ym-hide-content`
      in T053, T070, T099, T109 and T110 (METRIKA.md 3.1); the owner decides METRIKA.md 3.2 to 3.4.
      Partly done 2026-10-11: every field of the three account pages carries `ym-disable-keys` (`AuthField.astro`).
      Open: the admin and settings pages (T070, T099, T109, T110).
      MOVED 2026-10-11 from plan phase 2 to this phase, at the owner's word (moved, not closed): the account pages are
      done; the admin pages (T070, T099) and the settings page (T110) are built later, and each must carry the
      attributes when it is built, so the task is closed here with T110.
      Done 2026-10-13. Tests first, `server/test/metrika-marks.test.ts` (2, red for six places): every text-like field of
      the account, recovery, setup, settings, users and feedback pages, the feedback form and the comment box carries
      `ym-disable-keys`, and the elements a script or a template fills with a person's name or address as text carry
      `ym-hide-content`. The audit found six places without a mark and they are marked now: the member's address on the
      account page, the hand-over banner and its state line, the select of administrators the role can go to (all
      `src/pages/auth/account.astro`), and the recipient now and the pending address of the settings page
      (`src/pages/admin/settings/index.astro`). The panel's users and feedback lists, the temporary password and the
      recovery codes already had it. Not marked on purpose: an editor's post and video text and the panel's lists of
      posts and videos (public content). METRIKA.md 3.1 says so; 3.2 to 3.4 stay the owner's decision, and the counter is
      untouched. Documentation servers: none (Yandex's two classes are in METRIKA.md, quoted from its help page).

---

## Phase 10: User Story 10 - reachable without a VPN, switch without downtime (Priority: P2) - plan phase 8

**Goal**: production on the club's server, backups with a rehearsed restore, the redirecting last build.

**Independent Test**: quickstart phase 8.

- [ ] T114 [US10] Ask the owner for the server, registrar country and domain (decided by someone else); nothing in
      this phase starts before they are named. Record them in `REWRITE.md` without any personal address.
      Owner, 2026-10-13: there is no data on the server, the domain or the country, and there will not be soon; he
      raises it himself when the application is finished. Nothing of this phase starts before then, except what he
      orders.
- [ ] T111 [US8] Choose the sending mailbox together with the owner and check that its provider accepts the server;
      the first step that needs the real server.
      Decide the sending mailbox with the owner (the verdict recommends the recipient mailbox's own
      SMTP with an app password in the environment) and check that the provider accepts the server; this is the first
      step that needs the real server.
      Partly done 2026-10-13, at the owner's word ("take it and do what can be done; nobody can name the club's mailbox
      today"): the mailbox is NOT chosen and the provider has NOT been asked, so the task stays open. Built: the check
      `npm run mail:check [-- --to <address>]` (`server/src/mail/probe.ts`, `server/src/cli/mail-check-cli.ts`;
      `verifySmtp` in `mailer.ts`, the one module that knows nodemailer), which connects with the options of the
      server's own worker, names the step that failed (connection, encryption, login, message) with the usual cause, and
      with `--to` sends one fixed test message; tests `server/test/mail-check.test.ts` run the real command against an
      SMTP stand-in that speaks TLS from the first byte and after STARTTLS with a certificate made in memory
      (`server/test/helpers/smtp-stand-in.ts`), 9 cases, the real TLS and STARTTLS paths exercised for the first time
      and the certificate check never weakened. The choice and its options (a mailbox made for the site is recommended,
      the club's own mailbox, a sending service, a server of its own) are written in `MAIL.md`, which also says how to
      read each outcome. Open: the owner names a mailbox; the four variables are set on the real server; the check is
      run there with `--to` and its message is seen in an inbox. Until then a message is stored, shown in
      `/admin/feedback/` and queued, and nothing leaves the server.
      MOVED 2026-10-13 from plan phase 7 to this phase, at the owner's word (moved, not closed): the mailbox is not
      named yet, and the one check that matters, whether the provider accepts the server, can only be made from the
      server that T114 names. Everything that could be built without it is built (the check and MAIL.md above); the
      phase-7 owner check (T113) sees a feedback message on the admin page and in the development outbox, and the real
      mailbox joins the check of this phase (T125).
      Mailbox named 2026-10-13: an Outlook.com mailbox of the owner's, to send from (a personal one, not the club's; the
      address is in the git-ignored `.env` of his machine and in no file of the repository). `.env` carries the four
      `SMTP_*` lines commented out and `MAIL_OUTBOX_DIR` switched on; the owner types the app password himself and
      removes the comment marks. Still open: his run of `npm run mail:check` on his machine (Microsoft may refuse a
      password login for a personal mailbox; the check says which step), and the run from the real server.
- [ ] T115 [P] [US10] `deploy/Dockerfile`: `node:20.20.2-bookworm-slim` by digest, `apt-get upgrade`, `USER node`,
      read-only root, dropped capabilities, no published port. Docs: docker-docs.
- [ ] T164 [US10] Priority LOW. A separate database role for the application (consilium of 2026-10-10, security and
      best-practices): the application connects as one role, which in development is the image's superuser, so column
      privileges, views and row-level security would separate nothing. Create a role for the running server with only the
      rights it uses (select, insert, update, delete on the tables it touches, execute on the storing functions) and keep
      the owner role for migrations and the importer's one-off commands; the server's `DATABASE_URL` names the first, the
      migration command the second. Test: the application role cannot alter a table or read `pg_shadow`. Docs:
      postgresql-docs, postgres-image-docs.
- [ ] T116 [P] [US10] `deploy/compose.yml`: app, PostgreSQL 16 by digest, nginx; memory limits, log rotation,
      health checks, named volumes. Docs: docker-docs, postgres-image-docs.
- [ ] T117 [US10] `deploy/nginx/site.conf`: TLS, the internal `/_video/` location, guest page cache of 10 seconds
      when no session cookie is present and `private, no-store` otherwise, trailing-slash redirect, rate and body
      limits, security headers. Needs: nginx-docs, owasp-docs.
      Standing rule (the owner, 2026-10-12): the Yandex Metrika counter stays on the site; the Content-Security-Policy
      and every other header must allow `mc.yandex.ru` (script, image pixel, connection). `server/test/metrika.test.ts`
      guards the counter in the layout.
- [ ] T118 [US10] Certificates for the site's domain are issued and renewed by certbot, and the renewal is checked so
      the site never serves an expired one.
      Certificates issued and renewed. Needs: certbot-docs.
- [ ] T119 [US10] Firewall and host settings of the server: only the web ports are open to the outside, the database
      and the app stay internal, set from the Linux documentation.
      Firewall and host settings. Needs: linux-docs.
- [ ] T120 [P] [US10] `deploy/backup.sh` and `deploy/restore.md`: `pg_dump -Fc` plus the video volume; rehearse a
      restore on a clean volume and record it (SC-009). Docs: postgresql-docs, docker-docs.
- [ ] T121 [US10] Rehearse the final import: content import, members import, video registration, on the server;
      fix what the rehearsal finds before the real day.
- [ ] T122 [US10] Prepare the redirecting last build of the old site: write the instructions and the Astro
      `redirects` config as a file in this repository (`deploy/pages-redirect/`), for the owner to apply to the old
      repository; this repository never changes the old one.
- [ ] T123 [US10] Reachability check from a network that blocks Cloudflare and YouTube: read, sign in, play a
      lecture, with no request to a blocked service on that path (SC-004).
- [ ] T156 [US10] Priority MEDIUM. G18. The conditions of RISKS.md 1 for staying on Node 20: `npm audit` on every
      build (T129) and a weekly rebuild of the image (T115).
- [ ] T157 [US10] Priority MEDIUM. G19. After T114 names the domain: set `site` in `astro.config.mjs` and check that
      the feeds, the sitemap, the canonical links and `og:url` carry it (a check in T124 or T125).
- [ ] T124 [US10] Update `README.md`, `MIGRATION-PLAN.md`, `REWRITE.md` session log; record the switch day.
- [ ] T125 [US10] OWNER CHECK, plan phase 8: the site answers over HTTPS on the new domain, a restore from backup
      works, every old address redirects.
- [ ] T135 [US10] Retire the one-off migration tools after the real switch day (added 2026-10-10 at the owner's
      word; do it only once the owner confirms the switch happened and nothing is left to import). Remove the
      content import (`server/src/cli/import-content.ts`, `import-content-cli.ts`, `server/test/import.test.ts`,
      `npm run import:content`), the members import of plan phase 2 (`server/src/cli/import-members.ts`, `import-members-cli.ts`,
      `server/test/import-members.test.ts`, `npm run import:members`), and every package that only they use -
      `gray-matter` 4.0.3 first of all - from `package.json` and the lockfile. The database functions `store_post`
      and `store_video` stay: the editors' API uses them. Record each removal in `REWRITE.md` ("Dependencies added
      by the rewrite") and run `npm run test:server`, `npm run check` and `npm run build`.

---

## Phase 11: Polish and cross-cutting

- [ ] T126 [P] Load check of SC-011 with 1 000 members' worth of accounts and 100 simultaneous viewers: guest pages
      within 2 seconds for 95%, playback stalls under 2 seconds a minute.
- [x] T127 [P] Secrets scan for SC-012: no secret and no personal address in the repository or in `dist/client`.
      Done 2026-10-13. `npm run check:secrets` (`scripts/check-secrets.mjs`, with a self test that plants each kind of
      finding and proves the detector fires): scans the working tree (tracked and not ignored), `dist/client` (a missing
      folder is a failure) and the whole history (every added line on every branch, and every author and committer
      address). It looks for the VALUES of the secrets of the owner's `.env` (commented lines included, the password of
      `DATABASE_URL`), the shapes of well-known credentials, a password inside an address, and any e-mail address not on
      a short allowlist of reasons (the reserved documentation and test names, a git SSH user, a provider's made-up
      address, a noreply address). It never prints a value: a kind and a place, an address with its local part masked.
      Found and fixed: the copy of the AUTHORS file in `public/images/reactions/LICENSE.txt` (shipped to the browser)
      carried one author's e-mail address; it is left out of the copy, with a note in the file, the name stays. Found and
      NOT fixed, because only a rewrite of the history can: that address is in the commit that added the file (accepted
      by name in the script), and the address the owner's commits carry is the author and committer address of all of
      them; the scan reports it until the owner decides (T189). No secret value was found anywhere. `astro check` and
      the suite are untouched by it. Documentation servers: none.
      Amended 2026-10-13, the owner's word (no path of his machine may stay in the repository, now or later): the scan
      also looks, in the working tree and in `dist/client`, for a drive-letter path outside the system folders, the same
      disk in its WSL form, and this machine's home folder and account name (read from the operating system at run
      time, like the `.env` values; a common account name such as root or node is skipped). A path is never printed,
      only its kind and `file:line`. The history is not searched for paths: it is private (T189, option C) and the
      published export is one commit equal to its tree. The self test grew 14 cases (each kind fires, the system
      folders and look-alikes stay quiet, the option off means silence, nothing is printed); the real scan was probed
      with a planted path in an untracked file. Documentation servers: none.
- [x] T128 Verify the Constitution Check gates again on the finished system and record them in `REWRITE.md`.
      Done 2026-10-13, results as they were; the record is the section "Constitution Check on the finished system
      (T128)" of `REWRITE.md`. Gates 1 to 7 hold, with the open points named there; gate 8 does not hold as written.
      Measured today: the whole server suite 647 of 647; `astro check` 0 errors; `check:bundles` and
      `check:secrets` clean; the route list against `reference/hugo-routes.txt` shows only the nine accepted
      `/page/1/` aliases; `check:markup` 148 routes, 0 differences (142 compared, `<main>` identical in all 142);
      `check:screenshots` 48 of 60 pairs identical, the 12 others in three page types (`sign-in`, rewritten as
      before; `post` and `video-public`, where the comments block and the reactions of plan phase 7 now sit under
      the entry). Open for the owner: (a) gate 8, the repository has a remote that was pushed to three times today
      and is readable without signing in, so the history with the commits' name and address is public, which T189 (C)
      was chosen to prevent; (b) gate 8, 21 commits of 2026-10-11 and 2026-10-12 carry a `Co-Authored-By` line naming
      the assistant, against the rule of CLAUDE.md and constitution VIII; (c) gate 1, `gray-matter` has no row in
      `research.md` section 12 and the owner's word for it is not written down; (d) gate 2, the owner has not yet
      accepted the new residuals of `post` and `video-public`; (e) gate 6, `prettier --check` is red on 21 files
      that were not formatted before (T129). Infrastructure points wait for the host (plan phase 8). Two points of
      T129 are closed here at the owner's word: the two files of T145 are formatted, and
      `reference/astro-routes.txt` is regenerated (148 routes), which made `check:markup` name two routes that exist
      only in the rewrite (`/auth/recover/`, `/video/lecture-4/`) in `scripts/check-markup.mjs`. Documentation
      servers: none.
      Decided by the owner the same evening: (a) and (b) are answered by option C of T189 - the public repository is
      replaced by a fresh export with the neutral name and address (one commit, so the 21 footers go with the old
      history); the new repository, the push and the removal of the old one are his own actions, and both points close
      when they are done. The rule against the footer is repeated in both `CLAUDE.md` files. (c) and (d) wait for his
      answer. (e): the 20 files stay unformatted for now, at his word.
      Closed the same evening: (a) and (b) by the replacement. The new repository holds the export and one commit on
      top of it, the history of the working folder was restarted from them (the old one is a private backup outside the
      repository), no commit names the assistant, and `npm run check:secrets` passes with no exemption flag. (c) and
      (d) are left for later, at his word.
- [x] T129 Run `npm run fix`, `npm run check`, `npm run build`, start `npm run dev` once, and the route-parity and
      pagination checks; report results plainly.
      Done 2026-10-13, results as they were. `npm run fix` was not run: it is `prettier --write .` and rewrites files of
      `.claude` and `.specify` (the owner's rule), so `prettier --check` is the measure. (1) `npm run check`: exit 2.
      `astro check` over 151 files: 0 errors, 0 warnings, 5 hints (an unused import in `check-admin-posts.mjs`, two
      uses of the deprecated `event` in `CardList.astro` and the tag page, a suggestion for `audience-cache.ts`, and
      `langs` in `Head.astro`, which `define:vars` supplies at run time). `prettier --check` flags 23 files: 20 were
      unformatted before T145 (eight spec documents, four auth pages, `admin/users/index.astro`, `VideoPlayer.astro`,
      `LockedNotice.astro`, `admin-users.ts`, two check scripts, one test and `VIDEOS.md`); `src/layouts/Base.astro`
      does not parse (the Yandex Metrika block; true since the first commit of this repository, and the block stays);
      two are T145's `ym-*` marks (`src/pages/admin/settings/index.astro`, `src/pages/auth/account.astro`: Prettier
      would wrap a paragraph that holds one expression), left as they are until the owner says. (2) `npm run build`:
      exit 0, complete in 5.8 s. (3) `astro dev` once on a spare port: ready in 946 ms, `/` answered 200, no pre-scan
      error; stopped by process id, port free. (4) `check:pages` against a throwaway database seeded from the files of
      `src/content` (23 published posts in 3 years, 21 videos): 74 list pages walked, all checks passed. (5) Route
      parity: the nine Hugo routes the site lacks are exactly the nine `/page/1/` aliases that were accepted; 133
      routes are new. The tracked `reference/astro-routes.txt` differs by minus `/admin/posts/`, `/admin/users/` and
      `/auth/account/` (a guest gets a 404 or a redirect there since T056 and T099) and plus `/auth/recover/` and
      `/video/lecture-4/`, so it is stale; it was left as it was. The owner's server on the default port and his
      database were not touched, and the throwaway database is dropped. Documentation servers: none consulted
      (astro-docs was connected and not needed).
- [x] T130 Review the entries and dates of RISKS.md and close or renew each one, so no accepted risk is left to expire
      unnoticed.
      Review `RISKS.md` entries and dates; close or renew each.
      Done 2026-10-13. Five entries. Entry 2 (the post validator of the admin panel) is ended: T096 and T100 removed its
      reason, and `content-rules.test.ts` passes 94 of 94 today; the entry stays as the record, as the file's rule asks.
      Entries 1, 3, 4 and 5 hold and carry a "Reviewed" line each; no date was renewed, because none is due (the nearest
      are 2027-04-09 and 2027-04-11, 178 and 180 days away) and every "before going live" condition belongs to plan
      phase 8. The numbers of entries 3 and 4 were checked against the code, and the owner confirmed both entries in
      writing the same day (they had been owed since T074, which was closed without a walkthrough). Documentation
      servers: nodejs-docs (1 search; the release schedule of Node is not in it).
- [x] T131 Tidy documents superseded by the rewrite (`CLERK*.md`, `AUTH*.md`, `CLOUDFLARE.md`, `DISQUS-FIX.md`,
      `PAID-VIDEO.md`, `ADMIN*.md`): add a "superseded on <date> by REWRITE.md" line at the top of each; delete
      nothing.
      Done 2026-10-13. A note "Superseded 2026-10-13 (T131; see REWRITE.md)" now stands at the top of `CLERK-KEY.md`,
      `CLERK-REVIEW.md`, `AUTH.md`, `AUTH-IMPLEMENTATION.md`, `CLOUDFLARE.md` and `DISQUS-FIX.md`; each says what
      replaced the arrangement it describes. `CLERK.md` and `CLERK-DASHBOARD.md` (T167), `PAID-VIDEO.md` (T083),
      `ADMIN.md` and `ADMIN-GITHUB-PAGES.md` (T100) already carried theirs and were left as they were. Only lines
      were added; nothing was deleted or reworded. Documentation servers: none.
- [x] T155 Priority LOW. G17. Name every removal in the task that removes its owner:
      `scripts/check-video-access.mjs`, `video-access-dev.mjs`, `dev-all.mjs`, `content-admin-dev.mjs`,
      `github-stand-in.mjs`, the `statuses-*.mjs` scripts, the npm scripts that call them, the Clerk pre-bundling
      integration and the `dev:clean` script of `astro.config.mjs` and `package.json` (T054, T071, T083, T100).
      Done 2026-10-13. Most of the removals were already named where they were made: T083 (`check-video-access.mjs`,
      `video-access-dev.mjs`, the npm scripts `check:video-access` and `video-access:dev`), T100
      (`content-admin-dev.mjs`, `github-stand-in.mjs`, `check-content-admin.mjs`, `check:content-admin`,
      `content-admin:dev`), T071 (the three `statuses-*.mjs` scripts, `check-statuses.mjs`, the three `statuses:*`
      commands) and T167 (the Clerk pre-bundling integration of `astro.config.mjs`). Two things had been emptied and
      not removed: `scripts/dev-all.mjs` and the npm scripts `dev:all` and `dev:all:clean`, which started `astro dev`
      alone since T083 and still warned about a port of an access service that no longer exists. Removed now, at the
      owner's word (option A): those three. `dev:clean` stays: it clears Vite's dependency cache and has nothing of
      Clerk in it. `README.md` (the command list and the paragraph that told readers to use `dev:all` for videos, now
      about `dev:site`), `CLAUDE.md` (the cure sentence) and `CONTENT.md` (two steps of the old lecture procedure)
      no longer send a reader to `dev:all`; the journals, the documents under a "Superseded" note and the older notes
      of `package.json` keep the name as history, and `package.json` has a note of the removal. Documentation
      servers: none.
- [x] T158 Priority LOW. G20. T131's list of superseded documents also carries `CONTENT.md` and `templates/post.md`
      (the git path to a new post; point them to the admin panel) and the follow-up of `METRIKA.md`.
      Done 2026-10-13. `CONTENT.md` opens with a note that posts and videos are written in the admin panel since
      2026-10-12, that the files in `src/content/` are only the input of the one-off import, and that where the
      panel's rules differ `server/src/content/` decides; `templates/post.md` carries the same pointer inside its
      comment block (never published); `METRIKA.md` opens with a follow-up naming what moved (the player component
      and script, the feedback form's endpoint, the sign-in flag block) and what still stands (3.5). Documentation
      servers: none.
- [x] T163 Priority LOW. Scale, step 3, search (owner, 2026-10-10; DECISION OF THE OWNER FIRST). The search page
      downloads the whole index into the browser: 38 kB at 159 posts, 2 MB at 1 000, 21 MB at 10 000, which is not
      viable. Before building anything, the owner chooses between: keep the browser search and send only titles,
      tags and summaries (the text is searched on the server), or search on the server for everything
      (`/api/search?q=` with the section, tag and category facets, PostgreSQL full-text search). Both must keep the
      search page looking and behaving as it does now (SC-002). This is the deferred "full-text search" of T132
      brought forward by the measurement; record the decision there. Needs a measurement at 1 000 and 10 000 posts
      before and after, with `npm run stress:site`.
      Done 2026-10-10 (owner's decision: server search with the same rules, no morphology). The rules moved from
      `src/scripts/search.ts` to `src/lib/search-rules.ts` (plain module, shared with the backend); `GET /api/search`
      (`server/src/content/search.ts`) scans the viewer's search index, which the backend keeps folded in memory for a
      guest until `contentVersion` moves; the page asks the site's endpoint `/search/query.json`, which turns kinds
      into addresses and section labels. Results are capped at 200 (the counts are full). Parity: 204 combinations of
      query and boxes give the same total, counts, order, snippets and tags as the old browser code. Measured at 10 000
      posts (median): 21.4 MB index and 540 ms before; a query that matches every post 14 ms and 45 kB, counts only 9
      ms; at 1 000 posts 6 ms. `/search/data.json` is kept until the owner decides to remove it.
- [x] T189 [US10] Decide before the first publication what the history carries as the address of its commits.
      Added 2026-10-13 (T127). All commits have the owner's mailbox as author and committer address, so publishing the
      repository publishes it. The owner chooses: (A) rewrite the history with another address (for example the code
      host's noreply address) before anything is pushed - there is no remote yet, so it is cheap now and only asks his go-ahead, as a
      rewrite changes every hash; (B) publish as it is and run `npm run check:secrets -- --accept-history-authors`;
      (C) publish a fresh export with one commit and keep this history private. The scan fails until he chooses.
      Prepared 2026-10-13, at the owner's word ("all three"); NONE is applied and the working repository is untouched.
      Two copies sit in a scratch folder beside it (each a repository with no remote), and the scan passes on both,
      history included:
        - `rewritten\`: (A) the same 207 commits with every author and committer address replaced by the placeholder
          `noreply@klub-biolocation.invalid` (the name is kept), and the one author's address of the pictures' notice
          removed from the file in every commit; made with `git filter-branch` (an env filter for the two addresses, a
          tree filter with `sed` for the file), then the backup refs, the reflog and the unreachable objects were
          dropped, so the old addresses are in no object of that copy.
        - `fresh\`: (C) one commit holding the 536 files of HEAD, with the same placeholder identity.
        - (B) needs no copy: `npm run check:secrets -- --accept-history-authors` passes on the repository as it is.
      To adopt A or C: the copies are snapshots of the HEAD of that day, so adopt one when the work on this repository
      is at a stopping place (or redo the rewrite, about three minutes), move this folder aside and put the copy in its
      place; `git config user.email` of the chosen repository must be an address the owner agrees to publish, and the
      placeholder can be replaced by the code host's noreply address with the same command. Nothing in this repository
      sets a different address for FUTURE commits yet: they carry the owner's mailbox until `git config user.email` is
      changed here too. The scratch folder is not part of the repository and is deleted when the owner has chosen.
      Closed 2026-10-13 at the owner's word: "all three" meant the three options, and the three are delivered (the two
      copies and the flag, each scanned clean). None is applied to this repository: which one it becomes is the owner's
      choice, and `npm run check:secrets` keeps failing on the commits' address until he makes it, so the choice cannot
      be forgotten at the release check (T128, T129).
      Chosen 2026-10-13 by the owner: (C), with one change to what had been prepared. His condition: nowhere in what is
      published - no name, no mention of him as the developer, no key. The prepared copies kept the author's NAME (only
      the address was replaced), so neither `rewritten\` nor `fresh\` met it. The export therefore carries a neutral
      name as well as a neutral address (`Klub Biolocation <noreply@klub-biolocation.invalid>`; both can be replaced
      with the same commands), is one commit with a neutral message, and `CLAUDE.md` no longer names the machine's
      user folder (the one line of the tree that did). This repository and its history stay private and are left as
      they are. What is published is an export of the committed HEAD, made like this:
        git archive HEAD | tar -x -C <empty folder>
        in that folder: git init -b main, git config user.name and user.email (the two neutral values), git add -A,
        git commit -m "<neutral message>"
      An export is a snapshot: it is redone from HEAD when the owner publishes (T128, T129), and the release check is
      `npm run check:secrets` run inside the export, with a copy of `.env` placed there for the scan and removed after
      it (the export has no `.env` of its own, so the values of the owner's secrets would not be searched for
      otherwise). In this repository the same command reports the commits' address for good; here it is run with
      `--accept-history-authors`, because this history is never published.
      Done 2026-10-13: the export is a repository in a folder beside this one, named like it with the suffix
      `-export` (no remote), made from c615678: 536 files,
      one commit, author and committer `Klub Biolocation`, no name token of the owner in the tree (Latin and Cyrillic
      spellings searched), `npm run check:secrets` clean on its tree and its history (`--no-dist`: the export has no
      build). In this repository the scan is clean on the tree, `dist/client` and the history with
      `--accept-history-authors`. The scratch folder with the two earlier copies, which kept the name, is deleted.
      Amended 2026-10-13, the owner's word: no absolute path of his machine stays in any tracked file, so the paths
      above were taken out (CLAUDE.md, "Markdown and prose conventions").
      Carried out 2026-10-13, evening, by the owner's hands: the export was pushed to a new empty repository (the
      earlier one, which had received the private history, was deleted), and this folder's history was restarted from
      the pushed commit, so the working folder is the published repository and no export folder is needed any more. The
      old history is one private backup file outside the repository. In this folder the release check
      `npm run check:secrets` is clean with no `--accept-history-authors`; the note above that it fails on the
      commits' address no longer applies.
- [x] T132 Record the deferred plan phase 9 items (address confirmation and reset by mail, full-text search, argon2)
      as a list in `MIGRATION-PLAN.md`, with the condition under which each starts.
      Done 2026-10-13. `MIGRATION-PLAN.md` section 11 lists the three items, each with what stands today and the
      condition that starts it: mail confirmation and reset (a working sending mailbox, T111; the owner's decision on the
      language of letters to members; the owner's word), PostgreSQL full-text search (the owner asks for it as a feature of
      its own and accepts that the results change; a text search configuration is chosen), argon2 (the owner prefers it
      and consents to the package). A dated note in the Progress section points to it. Everything in the list was taken
      from the plan, the spec, the verdict of 2026-10-09, RISKS.md, T146, T163 and `password.ts`; the one fact from a
      documentation server is that the dictionary list of PostgreSQL 16 has a Russian snowball stemmer and no Ukrainian
      one. Documentation servers: postgresql-docs (2 searches, 1 section).
- [x] T167 Priority MEDIUM. (Kept in this phase because it can only run after phases 3, 4 and 6.) Final removal of the previous sign-in provider and React (the second half of T054,
      owner's variant A, 2026-10-11). Only after T070 (users page), the lecture player of phase 4 and the editor of
      phase 6 exist: delete `src/scripts/auth.ts`, `auth-flag.ts`, `clerk-ru.ts`, `admin-users.ts`, `admin-posts.ts`,
      `paid-video.ts` as they are replaced, `@clerk/*`, `react`, `react-dom` from `package.json`, `publishableKey`,
      `flagKey` and `contactKey` from `src/config.ts`, `scripts/check-auth-browser.mjs`'s provider parts (T153);
      confirm no provider chunk in `dist/`; `check:bundles` and `check:markup` stay green.
      Do not touch the Yandex Metrika block of `src/layouts/Base.astro` (the owner, 2026-10-12: it never goes);
      `server/test/metrika.test.ts` fails if it does.
      Done 2026-10-12. Deleted `src/scripts/auth.ts`, `auth-flag.ts`, `clerk-ru.ts`; `@clerk/clerk-js`,
      `@clerk/localizations`, `@clerk/ui`, `react`, `react-dom` and the `overrides` block from `package.json`, the
      lock regenerated (498 packages out, none changed or added; a clean `npm ci` installs and builds); `site.clerk`,
      `site.auth.flagKey`, `site.auth.contactKey`; the dev pre-bundling integration in `astro.config.mjs`; two dead
      status-service strings. `admin-users.ts`, `admin-posts.ts` and the player script were already the club's own and
      stay; `paid-video.ts` had become `video-player.ts`. The feedback form now fills a member's name and email from
      `GET /api/auth/me` (the localStorage record had no writer left). `check:auth` loads the panel pages and a video
      page too and fails on the provider's name anywhere. CLERK.md and CLERK-DASHBOARD.md carry a superseded note;
      the older comments that name the provider stay as history. The Metrika block is untouched. Docs: none consulted.
      Checked in the scratch copy after a clean `npm ci`: `astro check` 0 errors, build, `check:bundles`, `check:auth` 95 of
      95 (it first failed twice: a comment in the feedback form's inline script still named the provider, fixed; and one
      sleep-based Back check under heavy load from another project, which passed on the rerun), `check:markup` 0 of
      149 routes differ (the feedback form's attribute and script are a named difference now, and /admin/posts/ joined
      /admin/users/ among the pages that answer 404 to a guest, which the check had not been told since T099),
      `check:lang` 50, `check:admin-posts` 41, `check:admin-videos` 33, server tests 560 of 561 (the known TODO).
- [x] T190 [US10] The site's own visit counter in place of the outside one (the owner's word, 2026-11-09: the project uses
      no outside service that counts, confirms or permits; fonts stay, and so do the video embeds and Yandex Metrika, which
      is the colleague's). Decided with the owner: every load of a page counts, as the outside counter counted, not one
      count per visitor; nothing about the visitor is stored; the numbers start at zero. FR-048.
      Done 2026-11-09. The outside counter (Busuanzi) is gone: its script, its two connection hints and the two HTML
      comments that named it from `Head.astro`, the footer total, the article's page count and the style selectors in
      `main.css`. Its replacement: migration 024 (`site_views`, one row; `entry_views`, a row from an entry's first load),
      `server/src/access/views.ts`, `server/src/views/routes.ts` (`POST /api/views` and
      `POST /api/entries/:kind/:slug/views`; a program that is not a person's browser and an address past 120 loads in ten
      minutes get the numbers and are not counted; an entry the viewer may not see is a 404 and counts nothing),
      `src/components/ViewCount.astro` and `src/scripts/view-counter.ts`, the `countedEntry` prop of `ArticleLayout.astro`
      set by `Post.astro` and `VideoLayout.astro`, note 7 of `scripts/check-markup.mjs`. Tests first: `server/test/views.test.ts`,
      9 cases (twenty loads at the same instant are twenty; the window; the refusal of a write that is not a JSON request
      from the site). Documents: README, FR-037 and FR-048 of the spec, X-03 and N-06 of the parity inventory.
      Checked: `astro check` 0 errors; `astro dev` starts on a spare port; the build is green and `check:bundles` passes;
      `check:secrets` clean; the server's `tsc` is clean. End to end on a spare port with a throwaway database and a copy of
      the build, in a real Edge: the article printed site 4 and page 2, the home page site 5 and no page box, the sign-in
      page nothing, and the two stored numbers (5 and 2) were what the pages had printed; the raw pages hold no outside
      address of the counter; the throwaway database, the copy and the port were removed. The whole server suite: 656 of
      656 (the 647 of T128 and the 9 of this task).
      Not done and not claimed: `npm run check:markup` was not run (it needs the old repository's build and a server on the
      old content); its two new patterns were checked against the real pages instead. The numbers of the outside counter
      are not carried over, by the owner's decision. Documentation servers: astro-docs (1 search), express-docs (2),
      postgresql-docs (2), node-postgres-docs (2), mdn-docs (1).

---

## Dependencies and order

- Phases 1 and 2 block everything.
- Phase 3 (US1) blocks all the others: it brings the content store and the Astro mounting.
- Phase 4 (US3) blocks phases 5, 6, 8 and 9; phase 5 (US4) blocks phases 6, 8 and 9.
- Phase 6 (US5) needs the settings table of T077 and can run alongside phase 7 once phase 5 is done.
- Phase 7 (US2) needs phases 3 to 6; phase 8 (US6) needs phase 7 for the audience form to mean anything.
- Phase 8a (US11, T176 to T182, added 2026-10-12) needs phases 3 to 7, whose pages it translates, and comes before the
  rest of phase 8 and before phase 9, whose pages are written in both languages from the start.
- Phase 9 needs phases 4 to 8; T108 needs nodemailer-docs connected and the owner's consent.
- Phase 10 needs everything above and the server, registrar and domain.
- Within a phase: tests, then migrations, then modules, then routes, then pages, then removals, then documents, then
  the owner's check.

## Parallel opportunities

- Phase 1: T002, T003, T005, T006, T007 together after T001.
- Phase 3: T018 to T020 together; T025, T029, T037 together with the migrations.
- Phase 4: T042 to T045 together.
- Phase 5: T059 to T061 together.
- Phase 6: T075, T076 together; phase 6 and phase 7 after phase 5.
- Phase 10: T115, T116, T120 together.

## Implementation strategy

- **MVP**: phases 1 to 3 (US1) deliver the content home with no visible change and the sign-in still on Clerk until
  phase 4; stop there and check before going on.
- **Safe order**: each phase ends with the owner's check, a commit on request, and its documents; the old site stays
  live throughout.
- **Data migrations**: a migration that changes the shape of a table moves the existing rows in the same migration and
  is tested with a row of each kind that exists; a change that was decided and postponed becomes a task with a number
  and the task it must precede (T160 is the first), and where possible a `todo` test that states the end state, so
  that every test run reminds. A phase's owner check does not pass while such a task before it is open.
- **Never**: install a package before the owner has seen its purpose and size; start a task that needs an
  unconnected documentation server; push; branch; or touch the old repository.
