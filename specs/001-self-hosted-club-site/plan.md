# Implementation Plan: Self-hosted club site

**Branch**: `main` (no feature branch; constitution VIII) | **Date**: 2026-10-10, amended 2026-10-12 | **Spec**:
[spec.md](spec.md)

**Input**: Feature specification from `specs/001-self-hosted-club-site/spec.md`, clarified on 2026-10-10.

## Summary

The club's Astro 4.16 site stops being a static build that leans on Clerk, Disqus, three Cloudflare Workers and hosted
players, and becomes one self-hosted application: an Express 5 backend and PostgreSQL 16 in Docker behind nginx, with
Astro rendering on demand inside the same Node process. Content, accounts, statuses, comments, feedback and settings
live in the database; video bytes are served by nginx after a per-request check by Express. The visible site and its
addresses stay as they are.

The technical approach is the council's verdict of 2026-10-09 (`.specify/consilium/2026-10-09-self-hosted-rewrite.md`),
phases 0 to 8 with phase 9 deferred, refined here with the decisions of the clarify session: migrations through
postgrator 8.0.0, the superuser held by the repository's owner, existing members re-admitted as guests with a
30-day temporary password, sign-in by address or login name, accounts never deleted, and a scale of 1 000 members and
100 simultaneous viewers. A dedicated security review of the loosened superuser rule is in
[security-review-superuser.md](security-review-superuser.md).

Amended 2026-10-12: the owner added an interface in English and Russian (spec User Story 11, FR-043 to FR-046). It
was built that day on the current site, and the rewrite carries it over at the start of phase 6, so that the admin,
comment, feedback and settings pages of phases 6 and 7 are written in both languages from the start. The content stays
untranslated. The section "Interface languages" below has the approach.

## Technical Context

**Language/Version**: TypeScript 5.6 on Node 20.20.x (`engines: >=20.0.0 <21`, accepted end-of-life risk in
`RISKS.md` section 1, review 2027-04-09); Astro 4.16.x; Tailwind 3.4; PostgreSQL 16 (image pinned by digest); SQL for
migrations.

**Primary Dependencies**: express 5.2.1, pg 8.23.1, postgrator 8.0.0, @astrojs/node 8.3.4 (middleware mode),
@astrojs/markdown-remark 5.3.0 (exact), rehype-sanitize 6.0.0 or an own plugin, nodemailer 10.0.16 (phase 7); dev:
@types/express 5.0, @types/pg 8.23.1. Node's own `crypto.scrypt`, `node:test` and `node:fs/promises` replace argon2,
Vitest and multer. No ORM, no express-session, no cookie package, no helmet (nginx sets the headers), no rate-limit
package (own small limiter; revisited in phase 2).

**Storage**: PostgreSQL 16 as the single source of truth (content, accounts, sessions, audit, mail queue); lecture
files on a server volume served by nginx; Markdown rendered at save and stored with a pipeline version stamp.

**Testing**: `node:test` for rule modules (the 129 content, 68 status and 56 video-access cases of the Workers are the
specification), integration tests against a throwaway PostgreSQL in Compose, the existing `check:pages` pagination
check over HTTP, and browser checks over CDP for the pages (as `check:auth` does today).

**Target Platform**: one Linux server with Docker Compose (app, PostgreSQL, nginx), 2 GB RAM; development on Windows
11 with Docker Desktop. Country, registrar and domain are decided later by someone else; phases 0 to 7 do not need them.

**Project Type**: web application: Astro frontend plus an Express backend in `server/`, served by one Node process.

**Performance Goals**: 95% of guest page views show main content within 2 seconds (SC-011); a paid lecture keeps
playing with no stall over 2 seconds a minute for 100 simultaneous viewers; about 11 player requests an hour per
viewer, up to 360 with heavy seeking, all served by nginx after one session check each.

**Constraints**: Node 20, Astro 4.x and Tailwind 3.4 frozen; every address in `reference/hugo-routes.txt` with its
trailing slash; 99.9% visual parity; no secret or personal address in the repository; invisible means 404 on every
surface; Node's port never published; `astro build` never reads the database; a browser script never imports a module
that reaches the database; every interface string lives once in `src/i18n/` in both languages, and the content is
never translated (constitution II, 1.1.0).

**Scale/Scope**: up to 1 000 members, 100 simultaneous viewers, tens of posts (24 today) and about 20 video entries,
lecture files up to 500 MB; one server, one database, one developer with an assistant at 20 to 25 hours a week
(about 80 working days of work, five to six months; 83 with the interface languages added on 2026-10-12).

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

Before research (against the constitution 1.0.1 and the verdict):

1. Stack unchanged; every new dependency listed with purpose, size and consent (I): PASS. The dependency list is
   in research.md section 12; the owner's consent of 2026-10-09 covers phases 0 and 1. nodemailer (phase 7) and any
   later package need a fresh consent before they are installed.
2. No address removed; visible change approved (II): PASS. Pages are re-rendered on demand with the same markup;
   the new pages (sign-in changes, admin pages, settings) are additions. Parity is checked per phase.
3. One home per rule; no copy; no browser import of a database module (III): PASS with attention. The visibility rule
   has one SQL function and one reader module; status and content rules are plain modules shared by the API and the
   pages; the Worker copies and their drift tests are deleted in phase 3 and 6.
4. Access on the server, deny by default, 404 for the invisible, no secret in the repository, sanitized Markdown (IV):
   PASS. Designed in research.md sections 4 to 8.
5. Comments, headers, README, MIGRATION-PLAN, topical document, session log planned (V): PASS. Every phase's task
   list includes them; `REWRITE.md` is the topical document, started in phase 0.
6. Checks named for the step; owner's local test steps written (VI): PASS. Each phase has its checks and its
   "what to run, what to look at" in quickstart.md.
7. Scope equals the request; nothing destructive by default (VII): PASS. The import is repeatable and idempotent;
   no migration drops data; the "down" migrations are not run automatically.
8. Branch named; no push; commits only on request (VIII): PASS. Work stays on `main` of `klub_biolocation_app`; no
   remote exists.

After design (Phase 1): PASS on all eight gates. The Complexity Tracking table lists the two places where the plan
carries more structure than the smallest design, each justified by the verdict. One constitution point needs an
owner's decision before phase 3 (whether the handover's cooling period is 24 hours or instant); it is listed under
"Decisions of 2026-10-10 and what is still open".

Re-checked 2026-10-12 for the interface languages, against the constitution 1.1.0: PASS on all eight gates. Gate 1:
no new dependency. Gate 2: English by default is the owner's decision, and the parity references move to a build of
the current site with its languages (T180). Gate 3: every interface string has one home, `src/i18n/`.

Re-checked 2026-10-13 on the finished system (T128): gates 1 to 7 hold with the open points listed in `REWRITE.md`
("Constitution Check on the finished system (T128)"); gate 8 does not hold as written there: the repository has a
remote that was pushed to, and 21 commits carry an attribution line. The owner decides what follows.

## Project Structure

### Documentation (this feature)

```text
specs/001-self-hosted-club-site/
|-- spec.md                          # /speckit-specify and /speckit-clarify
|-- plan.md                          # this file
|-- research.md                      # Phase 0: decisions, alternatives, documentation checked
|-- data-model.md                    # Phase 1: tables, constraints, state transitions
|-- security-review-superuser.md     # Phase 1: dedicated review of the loosened superuser rule
|-- quickstart.md                    # Phase 1: how to run and validate, per phase
|-- contracts/
|   `-- http-api.md                  # Phase 1: every endpoint, who may call it, errors
|-- checklists/requirements.md       # spec quality checklist
`-- tasks.md                         # Phase 2 (/speckit-tasks) - not created here
```

### Source Code (repository root)

```text
server/                              # new: Express 5 backend, its own tsconfig (NodeNext, emits to server/dist)
|-- tsconfig.json
|-- src/
|   |-- main.ts                      # app wiring, trust proxy, error handler, Astro handler mounted last
|   |-- config.ts                    # reads server env (never PUBLIC_*), fails fast on a missing secret
|   |-- db/                          # pool, transaction helper, postgrator runner
|   |-- access/                      # the one module that reads entries tables; visibility SQL caller
|   |-- auth/                        # scrypt, sessions, cookie, signin/signup, rate limits, origin checks
|   |-- users/                       # status rules (plain), users API, superuser, handover, recovery codes
|   |-- content/                     # posts and videos API, import, Markdown render at save, validator
|   |-- video/                       # stream route, X-Accel-Redirect, dev range server, file registration
|   |-- comments/ feedback/ settings/ mail/
|   `-- cli/                         # superuser command, import command, register-video command
|-- migrations/                      # NNN.do.sql (postgrator); NNN.undo.sql only where a rollback is safe
`-- test/                            # node:test, rule cases ported from the three Workers

src/                                 # existing Astro frontend, kept; changes per phase
|-- content/post-fields.ts           # shared plain module (no Astro imports)
|-- lib/{summary,post-url,date}.ts   # shared plain modules
|-- lib/api-client.ts                # new: one call per page to the backend
|-- markdown/options.ts              # new: the Markdown options, used by astro.config.mjs and the renderer
|-- i18n/{lang,strings,admin}.ts     # phase 6 (2026-10-12): every interface string, in English and Russian
|-- components/{T,LangToggle}.astro  # phase 6: a string in both languages; the switch beside the menu
|-- scripts/lang.ts                  # phase 6: the browser half of the switch, the stored choice
|-- middleware.ts                    # new: reads the session, puts the viewer in locals
`-- pages/                           # routes lose getStaticPaths in phase 1 and gain admin and settings pages

deploy/                              # phase 8: compose.yml, nginx conf, app Dockerfile, backup scripts
compose.dev.yml                      # phase 0: PostgreSQL 16 for development
REWRITE.md                           # phase 0: the decisions in one place
workers/                             # existing; each Worker is deleted when its replacement passes its cases
```

**Structure Decision**: a web application with the frontend kept in `src/` and a new backend in `server/`, as the
verdict decided. `server/` has its own `tsconfig.json`; the root `tsconfig.json` excludes it. Plain modules with no
Astro imports are the only code shared across the two. A third top-level folder, `deploy/`, holds production files
and is not part of the build.

## Phases and traceability

| Phase                          | Days  | Delivers                                                                           | Spec stories | Requirements                       |
| ------------------------------ | ----- | ---------------------------------------------------------------------------------- | ------------ | ---------------------------------- |
| 0 Skeleton                     | 3     | `server/`, health route, Compose DB, postgrator, tests, `REWRITE.md`               | enabling     | FR-038                             |
| 1 Posts from the database      | 12    | content tables, import, render at save, server output, feeds, sitemap, search      | 1            | FR-001 to 007                      |
| 2 Own sign-in                  | 10    | users, sessions, scrypt, limits, header without flicker, Clerk removed             | 3            | FR-012, 012a, 013 to 016, 041, 042 |
| 3 Statuses and superuser       | 7     | status rules, users API, superuser command, handover, recovery codes               | 4            | FR-017 to 023, 018a                |
| 4 Video from the server        | 8     | files, stream route, player, locked block setting                                  | 5            | FR-024 to 027                      |
| 5 Visibility everywhere        | 8     | audience on every surface, matrix tests                                            | 2            | FR-008 to 011, 007                 |
| 6 Content admin, languages     | 13    | interface in two languages first; posts and videos API, preview, upload, conflicts | 6, 11        | FR-028 to 031, 043 to 046          |
| 7 Comments, feedback, settings | 13-14 | comments, feedback form and page, mail queue, settings page                        | 7, 8, 9      | FR-032 to 036                      |
| 8 Server and switch            | 8     | production Compose, nginx, TLS, backups and restore, redirect build                | 10           | FR-037, 039, 040                   |
| 9 Deferred                     | 3-6   | mail confirmation and reset, database full-text search                             | none         | none                               |

The order follows the verdict. Phase 5 is separate because the audience column exists from phase 1 but only phase 5
makes every surface honour it and proves it with the full matrix; until then the importer sets "everyone" or "hidden"
only, which phases 1 to 4 can enforce on the surfaces they build.

## Interface languages (added 2026-10-12)

- **What is carried over**: the mechanism the current site got on 2026-10-12 (`klub_biolocation_astro`, branch
  `refactor-app`, its `I18N.md`). Every page carries the interface in both languages; a block in the head marks the
  document before the first paint from the stored choice; one CSS rule hides the other language. The strings live in
  `src/i18n/` as pairs, printed by `T.astro` and `langAttrs()` and written by scripts through `src/scripts/lang.ts`.
  The commits apply on top of `2b4aac9`, where this repository started; what served Clerk only (its localization, the
  reload of the auth pages) is dropped, because phase 2 removed Clerk.
- **Why the server does not choose the language**: the guest cache of research.md section 9 keeps one copy of a page
  per address. A page per language would need the cache to tell the copies apart by the visitor's choice, and without
  that a guest who switched would be served the other language's copy until it expires. A page that carries both
  languages is the same for every guest, so the cache stays as it is and a switch needs no request. The cost is the
  second language's interface text in every page. research.md section 15.
- **Refusals from the server**: the API keeps `{"error": "<code>", "message": "<text>"}` (contracts). The page shows
  the code's text from the dictionary in the chosen language, and a code with no text yet shows a general message. The
  `message` stays English, for logs and tools.
- **Letters**: the letters of phase 7 go to the club's own people (the feedback recipient, the superuser's codes) and
  keep their language; letters to members come with phase 9, which settles their language.
- **Where the work goes**: tasks T176 to T182, at the start of plan phase 6 (tasks phase 8a). Every page written after
  them takes its strings from `src/i18n/` (tasks.md, Format).

## Complexity Tracking

| Violation                                                    | Why Needed                                                                                                 | Simpler Alternative Rejected Because                                                                                                                                 |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A second TypeScript project, `server/`, beside the Astro one | An Express backend with its own NodeNext build is the owner's decision; Astro's tsconfig cannot emit it    | Astro endpoints as the API (performance's suggestion) was marked as contradicting the owner's decision; `server/tsconfig.json` solves the tsconfig clash it answered |
| A Compose stack of three services instead of one process     | nginx must serve video bytes and ranges so Node never carries them, and terminates TLS and the guest cache | Express streaming the files costs Node a connection per viewer and cannot use `X-Accel-Redirect`; a CDN is excluded by the reachability requirement                  |

## Decisions of 2026-10-10 and what is still open

Decided by the owner:

1. Guest page cache: left to the planner. Decision: **10 seconds**, not the council's 60. At 100 simultaneous viewers
   it costs at most 6 renders a minute per distinct guest page, which one process carries easily, and it makes the
   spec's "there at once" true for anyone signed in and nearly true for anonymous visitors (research.md section 9).
   It is one constant; the council's 60 is a one-line change back.
2. Handover target: only an account that is already an admin (security review, mitigation 1).
3. Handover cooling: 24 hours with a cancel option (mitigation 2), kept as one constant.
4. Session lifetimes: the proposed defaults of research.md section 5, one constant each.

5. Settled later the same day: the handover waits 24 hours and can be cancelled instantly at any moment before it
   moves; the length is one constant (zero is instant) and the server command always moves the role at once.

Added 2026-10-12 (owner): the interface in English, the default, and Russian; the content untranslated; the choice
remembered. Carried over at the start of phase 6 (section "Interface languages"). Later the same day (owner): the
choice stays with the device, and the account holds no language.

Still open:

6. Whether `nodemailer` 10.0.16 and the packages of any later phase are consented to now or when the phase starts.
7. In which language letters to members are written: decided with phase 9 (2026-10-12). Whether the language follows
   a member to other devices was settled the same day: it does not (owner).
