# Facts every archetype receives (topic of 2026-10-11: one mechanism for the superuser, ways A, B, C and D)

lastActualized: 2026-10-11
sources: local (server/src/users/superuser.ts, handover.ts, recovery.ts, setup.ts, setup-routes.ts, main.ts;
security-review-superuser.md; RISKS.md sections 3 and 4; scripts/rehearse-superuser.mjs, 43 checks, 43 passed);
owasp-docs (Forgot Password and Secure Code Review cheat sheets, ASVS 5.0 V6/V7); postgresql-docs 16 (explicit locking,
deadlocks); argon2-docs and auth-docs consulted and found not relevant (auth-docs is Better Auth and NextAuth only)

## The ways the role comes or moves (all write the flag only through superuser.ts; a source test scans server/src,
src and scripts)

- [2026-10-11] A, the server command: create (account made or promoted, becomes admin, ten recovery codes), set-password
  (ends sessions, keeps codes), hand-over (instant, to any account which becomes admin; the new holder gets NO codes).
  Authority: access to the server.
- [2026-10-11] B, the hand-over from the pages: the holder starts it with the password, the target must be an admin and
  accepts with its own password, 24 hours of waiting, instant cancel by either side, completion by a timer in the
  server process once a minute; nothing is lost by a restart. The new holder gets NO codes.
- [2026-10-11] C, a recovery code: ten codes of 80 bits, SHA-256, each once, using one voids the set and returns a fresh
  set in the same answer; unauthenticated route, 5 failures an address per 15 minutes and 30 an hour in all; sets a
  password only, never moves the role.
- [2026-10-11] D, the setup door (T169): /auth/setup/ and POST /api/setup, open while no superuser exists, or with
  ALLOW_SUPERUSER_SETUP=1 (emergency switch: the typed account takes the role, the old holder stays an admin, sessions
  of both end, old codes void, an open hand-over closes). The code is SETUP_CODE from the settings (24+ characters, in
  memory only) or, if unset, a 128-bit code printed to the log and renewed every hour. Same limits as C, separate
  counters. In settings mode a successful use does NOT shut the door while the switch is on.

## Findings of 2026-10-11 to be judged (from the code, not yet decided)

- [2026-10-11] F1: no password change of the holder (C, A set-password, D with the holder's own address, the ordinary
  change of password on the account page) closes an open B request. A stolen session plus password can start a
  hand-over; the owner recovers by code; the request still completes after 24 hours.
- [2026-10-11] F2: with the switch on and a known SETUP_CODE the role is taken at once, bypassing the 24 hours and the
  codes; and the code is not spent by use in settings mode.
- [2026-10-11] F3: documents say "exactly three ways" and "no API changes the role"; D is a public API that does.
- [2026-10-11] F4: after A hand-over and B the new holder has zero codes, after D ten.
- [2026-10-11] F5: C and D counters are separate, so an attacker can exhaust both for an hour each (restart resets).
- [2026-10-11] F6: the door is open on any database with no superuser, including the day the members are imported and
  before the owner has made the account; the site is public by then.
- [2026-10-11] F7: lock order differs between D replace (holder, then target) and completeOne (both in one statement):
  a deadlock is possible and ends as a 500 with the data intact (postgresql-docs: consistent lock order is the
  defence; retry is the fallback).
- [2026-10-11] F8: review mitigation 8 says a test enumerates routes; what exists is a source scan of flag writes.

## Invariants the owner asked for on 2026-10-11

- [2026-10-11] Always exactly one superuser (unique index); always at least one way to recover it that does not need the
  database (server command A or the settings of the hosting D); no way may leave an open request that acts on old
  credentials; the decision about the role lives in one place (superuser.ts).
- [2026-10-11] The owner wants the result fast, to close plan phase 3: advice must say what is needed for that and what
  can wait.

# Previous topic (2026-10-10): normalizing the tables that describe a video

lastActualized: 2026-10-10
sources: local (server/migrations 002-008, specs/001-self-hosted-club-site data-model.md, tasks.md T137 T080 T081 T082
T138 T152 T160, server/src/access/entries.ts, server/test/access-boundary.test.ts, .specify/memory/constitution.md 1.0.1,
REWRITE.md T154 and T160 entries); postgresql-docs (PostgreSQL 16)

## Shape today (after migration 008, applied to the development database on 2026-10-10)

- [2026-10-10] `entries` (shared part: kind, slug, title, description, audience, teaser, published_at, deleted_at, save
  token) -> `videos` (entry_id PK/FK; description_markdown/html, headings, members_only_markdown/html, paid, duration,
  tags, categories, render_version) -> `video_sources` (entry_id PK/FK to videos; provider in youtube|vk|rutube|
  yandex-disk; reference 1..500 chars; saved_at). One row of `video_sources` per video; 18 public + 3 paid today.
- [2026-10-10] Before 008 the same fact lived twice: `videos.platform` + `videos.external_id` for public videos and
  `video_sources` for paid ones; a paid lecture on Yandex Disk carried platform "youtube" (a meaningless default).
  The owner did not understand why parts of one video's data sit in two tables and asked for this consilium.
- [2026-10-10] Writers: `store_video` (public video: writes provider and embed id into video_sources; paid: refuses an
  embed id) and `store_video_source` (paid only, reads the secret from the owner's file via import:video-sources).
  Rule "a public video has a source" = deferred constraint trigger on both tables (a CHECK cannot cross tables).
- [2026-10-10] Readers: only server/src/access/ may select entries, posts, videos, video_files, video_sources (a test
  scans server/src). getEntry joins video_sources and returns platform/externalId null when paid. Lists, feeds, terms,
  sitemap and the search index never touch video_sources.
- [2026-10-10] Planned: `video_files` (T077, migration 011: volume_path, size, content_type, faststart_ok): "an entry has
  one source or the other, never both"; provider adapters one file per provider (T137) keyed by `provider`, the Yandex
  Disk adapter ports the old Worker (public link of one file, asked only after the membership check, answer accepted
  only on the download host); stream route T080; one player T082; T138 free-space rule (small disk: lectures stay with
  their host).
- [2026-10-10] Data: 21 videos, 24 posts today; owner expects hundreds, not thousands. Measured 2026-10-10 (T154):
  a list page costs ~35 ms at 1 000 entries and ~300 ms at 10 000 because the list reads every row; lists do not
  need the source at all, only the video page and the stream route do.
- [2026-10-10] Rules in force: constitution III "one home for every rule, copies forbidden"; IV "server decides, deny by
  default, no secret in the repository or in an API answer"; owner standing rule "nothing of the old application is
  lost", a data migration moves existing rows; 117 server tests and byte-identical comparison of 149 pages pass.

## PostgreSQL 16 facts relevant to the options (postgresql-docs, 2026-10-10)

- [2026-10-10] Column privileges exist (`GRANT SELECT (col) ON t TO role`), but a role that has the privilege on the
  whole table can read every column; granting the table and revoking one column does nothing (ref-grant, Notes).
  The application connects as ONE role, so column grants separate nothing unless a second role is introduced; in
  development DATABASE_URL is the image's superuser `klub`, which bypasses privileges and row security.
- [2026-10-10] Views: `security_invoker` (15+) checks base relations with the caller's privileges; `security_barrier`
  is for row-level security and can be slower (ref-create-view, rules-privileges). A view is a different name for the
  same rows, it does not hide a column from a role that can read the table.
- [2026-10-10] Row-level security: enabling it with no policy is default-deny; the table owner bypasses it unless
  FORCE ROW LEVEL SECURITY is set (ref-alter-table). It filters rows, not columns.
- [2026-10-10] Deferrable constraints are checked at the end of the transaction when INITIALLY DEFERRED (create-table,
  set-constraints); a CHECK cannot reference another table, a constraint trigger can.
- [2026-10-10] TOAST moves wide values out of line when a row exceeds ~2 kB and leaves unchanged out-of-line values
  alone on UPDATE (storage-toast): splitting a table only to keep rows narrow buys little.
