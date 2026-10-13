<!--
Sync Impact Report (1.1.0, 2026-10-12)
- Version change: 1.0.1 -> 1.1.0 (MINOR): principle II's rule on site strings is split. The content keeps its language
  and is never translated, as before; the interface is in English and Russian from one dictionary (owner,
  2026-10-12). No principle added, removed or renamed.
- Templates: plan, spec and tasks templates checked; none states the rule, no change needed.
- Follow-up: CLAUDE.md, "Hard constraints", carries the same rule and gets the same note; spec FR-043 to FR-046.

Sync Impact Report (1.0.1, 2026-10-10)
- Version change: 1.0.0 -> 1.0.1 (PATCH): principle VIII now names the repository the rewrite moved to instead of
  a branch; no principle added, removed or redefined.
- Templates: no change needed.

Sync Impact Report (1.0.0)
- Version change: unversioned template -> 1.0.0 (first ratification).
- Principles defined: I. Frozen Stack, Consented Dependencies; II. Visual and Address Parity; III. One Home for
  Every Rule; IV. Server-Side Security by Default; V. Documentation Is Part of the Change; VI. Verified, Measured,
  Demonstrable; VII. Discuss First, Smallest Diff; VIII. Git Discipline.
- Added sections: Stack and Architecture Constraints; Development Workflow and Quality Gates; Governance.
- Removed sections: none.
- Templates: .specify/templates/plan-template.md - reviewed, no change needed (its Constitution Check is filled
  per feature from the gates listed below); .specify/templates/spec-template.md - reviewed, no change needed;
  .specify/templates/tasks-template.md - reviewed, no change needed; .claude/skills/speckit-*/SKILL.md - reviewed,
  no outdated references.
- Follow-up TODOs: none.
- Sources: CLAUDE.md, .specify/consilium/2026-10-09-self-hosted-rewrite.md, RISKS.md, ADMIN.md sections 1-2.
-->

# klub_biolocation_astro Constitution

## Core Principles

### I. Frozen Stack, Consented Dependencies

- Node 20, Astro 4.x and Tailwind 3.4 MUST NOT be upgraded, and an upgrade MUST NOT be proposed. The backend of the
  self-hosted rewrite runs on Node 20 as well (`node:20.20.2-bookworm-slim`, pinned by digest).
- A new dependency MUST NOT be installed without the owner's explicit consent, given after being told the package,
  its purpose and its approximate size. A package whose `engines` exceed Node 20 is unusable (`cookie@2`,
  `kysely` 0.29, Vitest 4 are known cases); versions that would drift past Node 20 are pinned exactly, with the reason
  written next to the pin.
- npm only: `package-lock.json`, `.npmrc` (`engine-strict`) and `npm ci` are the install contract.
- `@tailwindcss/typography` MUST NOT be installed; `src/styles/custom.css` stays plain CSS imported last.

Rationale: the machines the project is built on cap Node at 20. The end-of-life risk this creates is accepted in
writing in RISKS.md section 1, with its mitigations and review date.

### II. Visual and Address Parity

- Every address in `reference/hugo-routes.txt` MUST keep working, with its trailing slash. Routes may be added; none
  may disappear.
- What a visitor sees MUST stay at 99.9% parity with the current site. Class attributes copied from the original
  templates stay as they are. A visible departure happens only by the owner's decision, never as the side effect of
  a code change; screenshot and markup comparisons are the acceptance check.
- Content (posts and video descriptions, with their titles, tags and categories) keeps the language it is written in
  and is never translated. The interface is in English, the default, and in Russian (owner, 2026-10-12): every
  interface string exists in both languages in one place, and none is written as a literal in a page or a script.

Rationale: the design is expected to move over time, but each move is the owner's call.

### III. One Home for Every Rule

- Every rule lives in exactly one place, and copies are forbidden:
  - settings that change with the code live in `src/config.ts`; settings the owner changes alone live in the
    superuser's settings table; no setting lives in both;
  - an entry's address is built only by `postUrl()` and `videoUrl()`;
  - who may see an entry is decided only by the backend's access module and its SQL function;
  - the status rules and the content rules are one plain module each, used by the API and by the pages;
  - the Markdown options are one module, used by `astro.config.mjs` and by the backend renderer.
- When two runtimes need the same rule, they import one plain module that has no Astro imports.
- A browser script MUST NOT import `src/lib/posts.ts`, `lists.ts`, `video.ts`, `terms.ts` or any module that reaches
  the database; the check is a look at the page's chunks in the build output.
- Posts and videos stay two entities that share code only on plain data; shared code never branches on the kind of
  entry.

Rationale: every copy in this project's history drifted (three session checks, the Disqus shortname, term pages built
from one collection), and the drift was found by visitors before tests.

### IV. Server-Side Security by Default

- The server decides access on every request; a page only shows what it was given. Access is denied by default, and
  an entry a viewer may not see answers 404 everywhere it could surface: its page, lists, tags, categories, search,
  feeds, sitemap, comments, card previews and head meta.
- The status model of ADMIN.md sections 1 and 2 is enforced by the server: nobody gives guest; a metr gives only
  student, expert, master or blocked; an admin gives everything but guest; nobody changes their own status; a blocked
  member sees what a guest sees and no paid resource. The superuser is unique and protected, and is recovered or
  handed over only by the command on the server, by a handover the other account accepts, or by a one-time recovery
  code.
- No secret enters the repository or a `PUBLIC_*` variable; secrets live in the server's environment. Passwords are
  stored as scrypt hashes and are never retrievable; sessions are kept on the server behind a `__Host-` cookie.
- Markdown is rendered without raw HTML and sanitized on the parsed tree; text from users is shown as text; nothing a
  visitor typed is placed in a mail header. Video bytes never pass through Node; every player request is checked
  against the session before nginx serves it.
- The public repository holds no personal addresses (the feedback recipient included) and never names the club's
  registration country or the aggressor country.

Rationale: the content validator of 2026-10-02 was bypassed three ways on 2026-10-09 (RISKS.md section 2); rules
enforced only by a page or by a regular expression do not hold.

### V. Documentation Is Part of the Change

- Every edit to an existing file carries a short English comment saying why it was made. Comments already in a file
  are never deleted, translated or rewritten; a correction goes next to them.
- A new or ported file opens with a header naming its source, the decisions that would otherwise look like mistakes,
  and the verification results.
- Every change is reflected in README.md; plan status in MIGRATION-PLAN.md; details in the topical document; the
  branch's session log gets its entry before a session ends.
- Repository text is English and ASCII, without em dashes; a new Markdown file wraps at 120 characters.

Rationale: later sessions must trace a decision without re-deriving it.

### VI. Verified, Measured, Demonstrable

- A step is done only after `npm run fix`, `npm run check` and `npm run build` pass and `npm run dev` has started
  once, plus the runtime checks of the area touched (the pagination check, the ported rule cases under `node:test`,
  the browser checks).
- A claim about behaviour rests on a measurement or on a documentation excerpt of the right major version, taken from
  the docs servers; Astro is searched with version "4" and an excerpt counts only if its versions include 4.16.
  Memory is not evidence.
- Every step ends with what the owner runs locally and what to look at. Servers started for checks use spare ports
  and their own Vite cache, and are stopped by process id.

### VII. Discuss First, Smallest Diff

- Propose the approach, name the trade-off, recommend, and wait for the go-ahead; a question is answered, not acted
  on. Recording a decision in README.md, MIGRATION-PLAN.md or CLAUDE.md, and fixing what the owner just reported as
  broken, are exempt.
- Do what was asked with the smallest diff; no refactor, rename or widening without asking. A broken change is fixed
  at its root or backed out; compensating hacks are not stacked.
- No code whose default behaviour deletes, overwrites or truncates data.

### VIII. Git Discipline

- Never push, and never suggest a force push. Commit only when asked, confirming each commit; review remarks are
  answered with new commits, not amendments.
- No mention of AI or of the assistant in commits or pull requests, and no attribution footers.
- Work on the named branch; never create, switch or delete a branch without the owner's permission. Before a
  commit, fetch and prove that every remote commit is kept (the left count of `git rev-list --left-right --count`
  is 0).
- The rewrite lives in its own repository, `klub_biolocation_app` (since 2026-10-10), which has no remote until the
  owner publishes it and no Pages deployment; the original repository stays the live site and is not changed by the
  rewrite.

## Stack and Architecture Constraints

- Frontend: Astro 4.16 with `output: "server"` through `@astrojs/node` in middleware mode inside Express, from the
  rewrite's first content phase; pre-rendering only for pages that show nothing from the database; `astro build`
  never reads the database.
- Backend: Express 5 on Node 20, TypeScript in `server/` compiled by `tsc` (NodeNext), excluded from the root
  tsconfig.
- Data: PostgreSQL 16 in Docker is the single source of truth; migrations are plain SQL; statuses are a fixed set.
- Infrastructure: one server with Docker Compose and nginx in front; Node's port is never published; backups have a
  rehearsed restore.
- Outside services allowed on a visitor's path: Yandex Metrika, Google Fonts, the visit counter, and the placeholder
  YouTube embeds until the MP4 files exist. Outgoing mail goes through a mailbox provider's SMTP. Nothing else.
- Readers in countries where Cloudflare and YouTube are throttled or blocked MUST reach the site without a VPN.
- Accepted risks live in RISKS.md, each with its review date.

## Development Workflow and Quality Gates

- A design question goes to the consilium first; its verdict is kept in `.specify/consilium/`. A feature then follows
  spec-kit: specify, plan, tasks; the Agile Tasks hooks regenerate `agile-tasks.md`.
- Every plan's Constitution Check answers these gates, and any exception is justified in its Complexity Tracking:
  1. Stack unchanged; every new dependency listed with purpose, size and the owner's consent (I).
  2. No address removed; the visible change, if any, approved by the owner (II).
  3. Each rule touched has one home; no copy introduced; no browser import of a database module (III).
  4. Access decided on the server, deny by default, 404 for the invisible, no secret or personal address in the
     repository, Markdown sanitized (IV).
  5. Comments, headers, README, MIGRATION-PLAN, topical document and session log planned (V).
  6. Checks named for the step, and the owner's local test steps written (VI).
  7. Scope equals the request; nothing destructive by default (VII).
  8. Branch named; no push; commits only on request (VIII).
- The docs servers to consult for each work item are named in the verdict's plan.

## Governance

- This constitution prevails over conflicting practice in specs, plans and tasks. CLAUDE.md remains the detailed
  working guide and must agree with it; a conflict is settled by the owner.
- Amendments are made only by the owner's decision, through `/speckit-constitution`, with a Sync Impact Report and a
  semantic version: MAJOR for a removed or redefined principle, MINOR for a new or materially expanded one, PATCH for
  wording.
- Every plan and every review checks compliance; a deviation needs the owner's approval, recorded in the plan.

**Version**: 1.1.0 | **Ratified**: 2026-10-10 | **Last Amended**: 2026-10-12
