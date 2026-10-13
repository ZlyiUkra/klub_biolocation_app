# Data model: Self-hosted club site

Phase 1 of the plan. Entities come from the spec's Key Entities and the clarified decisions; the column lists are the
contract for the migrations of `server/migrations/`, not their text. PostgreSQL 16. Identifiers are `bigint
generated always as identity` unless a random token is stated. All times are `timestamptz`, set by the database.

## Conventions

- Statuses are a fixed set held as a check constraint, not a lookup table: `guest`, `student`, `expert`, `master`,
  `metr`, `admin`, `blocked`. The list lives in one plain module that both the constraint's migration and the rule
  code read; a test fails if they differ.
- Audience is a fixed set: `everyone`, `members`, `restricted`, `hidden`.
- Nothing is hard-deleted except sessions, expired tokens and spent recovery codes. Accounts are never deleted
  (FR-018a); entries are removed by setting `deleted_at` so comments and the audit trail keep their anchor.
- Secrets are never stored in plain text: passwords and recovery codes only as hashes; session ids only as a hash.

## Accounts

### users

| Column                 | Type        | Notes                                                                                                                                                                                                                   |
| ---------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id                     | bigint      | primary key                                                                                                                                                                                                             |
| email                  | text        | required; unique on `lower(email)`; the main sign-in identifier                                                                                                                                                         |
| login                  | text        | optional; unique on `lower(login)`; 3 to 32 of `a-z 0-9 . _ -`; never contains `@`                                                                                                                                      |
| display_name           | text        | shown on comments and the account page                                                                                                                                                                                  |
| status                 | text        | one of the statuses; default `guest`; check constraint                                                                                                                                                                  |
| blocked_by             | bigint      | references users; set when status becomes `blocked`; cleared on lift                                                                                                                                                    |
| blocked_at             | timestamptz |                                                                                                                                                                                                                         |
| is_superuser           | boolean     | default false; partial unique index `where is_superuser` allows at most one row                                                                                                                                         |
| password_hash          | text        | scrypt string with its parameters; null means "cannot sign in until a password is issued"                                                                                                                               |
| must_change            | boolean     | true after a temporary password is issued; sessions are limited to the change form                                                                                                                                      |
| password_expires_at    | timestamptz | set with a temporary password (30 days); null for a chosen password                                                                                                                                                     |
| access_until           | date        | T152, migration 014: last UTC day the paid lectures are open to the account, null = none; metr and admin are never limited; set to today + 100 years when a status that opens lectures is entered from guest or blocked |
| password_changed_at    | timestamptz |                                                                                                                                                                                                                         |
| failed_count           | integer     | consecutive failed sign-ins; reset on success                                                                                                                                                                           |
| locked_until           | timestamptz | short back-off (1, 5, 15 minutes), never permanent                                                                                                                                                                      |
| created_at, updated_at | timestamptz |                                                                                                                                                                                                                         |

Rules:

- A new account has `status = guest`, `blocked_by` null, `is_superuser` false.
- `is_superuser` can be set or cleared only by the server command, by an accepted handover, or by the migration that
  adds the column; the API layer has no statement that updates it.
- The superuser row cannot be blocked, demoted or have its status changed through the API; the status module returns
  "protected" for it.
- No delete statement against `users` exists in the code; a test greps the server source for it.

### sessions

| Column                               | Type        | Notes                                                                     |
| ------------------------------------ | ----------- | ------------------------------------------------------------------------- |
| id_hash                              | bytea       | primary key; SHA-256 of the 256-bit random id sent in the cookie          |
| user_id                              | bigint      | references users                                                          |
| created_at, last_seen_at             | timestamptz |                                                                           |
| idle_expires_at, absolute_expires_at | timestamptz | from the lifetimes of research section 5                                  |
| user_agent_summary                   | text        | short, for the account's session list                                     |
| address_prefix                       | text        | network prefix only, for the list; never the full address                 |
| limited                              | boolean     | true when the account `must_change`: only the change-password route works |

Lifecycle: created on sign-in (a session id is never reused); renewed on sign-in and on any change of the account's
status or password; deleted when ended, expired, or when the account is blocked; a change of rights deletes every
other session of that account.

### login_attempts

Rolling record of failed sign-ins per account, per address prefix and (as a hash, never the text) per unknown identifier, `kind` = `account`, `address` or `identifier`, for the limiter and for the audit view. Rows
older than 30 days are deleted by the periodic job.

## Content

### entries (the shared part)

| Column       | Type        | Notes                                                                              |
| ------------ | ----------- | ---------------------------------------------------------------------------------- |
| id           | bigint      | primary key                                                                        |
| kind         | text        | `post` or `video`; fixed at creation                                               |
| slug         | text        | unique per kind; a post is never named after a year                                |
| title        | text        |                                                                                    |
| description  | text        | the front matter description: meta description and share text; default empty (005) |
| audience     | text        | `everyone` (default for a new post), `members`, `restricted`, `hidden` (a draft)   |
| teaser       | boolean     | default false; true by default only for imported paid lectures                     |
| published_at | timestamptz | the visible date; a future date keeps the entry out of every surface until then    |
| updated_at   | timestamptz | the optimistic-concurrency token for saves (FR-030)                                |
| deleted_at   | timestamptz | soft delete; a deleted entry is invisible everywhere                               |
| created_by   | bigint      | references users                                                                   |

### entry_audience_statuses

(entry_id, status) pairs for `restricted` entries; both columns together are the key.

### entry_audience_users

(entry_id, user_id) pairs for named people; both columns together are the key. A named person sees the entry even if
their status is not listed.

### posts

| Column                         | Type        | Notes                                                    |
| ------------------------------ | ----------- | -------------------------------------------------------- |
| entry_id                       | bigint      | primary key, references entries                          |
| body_markdown                  | text        | the source                                               |
| body_html                      | text        | rendered at save                                         |
| headings                       | jsonb       | for the table of contents                                |
| plain_text                     | text        | for search and the card summary                          |
| summary                        | text        | the card text                                            |
| tags                           | text[]      |                                                          |
| categories                     | text[]      |                                                          |
| render_version                 | integer     | pipeline version stamp; a stale value re-renders on read |
| lastmod                        | timestamptz | optional, shown as "last updated" (migration 005)        |
| share_title, share_description | text        | optional, used by the share block (migration 005)        |

### videos

| Column                | Type    | Notes                                                                                                                                                                                     |
| --------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| entry_id              | bigint  | primary key, references entries                                                                                                                                                           |
| description_markdown  | text    | public part                                                                                                                                                                               |
| description_html      | text    | rendered at save                                                                                                                                                                          |
| members_only_markdown | text    | the locked block, in its own column                                                                                                                                                       |
| members_only_html     | text    | rendered at save; sent only to viewers with full access under "locked"                                                                                                                    |
| paid                  | boolean | paid lectures need a status that opens them                                                                                                                                               |
| tags, categories      | text[]  |                                                                                                                                                                                           |
| render_version        | integer |                                                                                                                                                                                           |
| duration              | text    | the "12:34" label of a video page, optional (migration 005)                                                                                                                               |
| available_until       | date    | T152, migration 014: last UTC day the video plays (default today + 100 years); after it the page stays and only metr and admin can play it; `lecture_view(viewer, entry)` is the one rule |

### video_sources (migration 006, made the only home of a source by migration 008)

Where a video's picture comes from while it is not a file on this server: one row per video. A public video's row
holds its embed id, which the API shows as `platform` and `externalId`; a paid video's row holds a secret (an
unlisted id or the public link of one file) that is never selected into a list, a page or an API answer, and the
API answers `null` for both of its fields. A public video must have its row when a transaction ends (a deferred
constraint trigger); a paid video's row is written by `store_video_source` and may be absent until it is imported.
`videos` has no `platform` or `external_id` column since migration 008.

Why a second table at all (consilium of 2026-10-10): `videos` says what a video is about - text, tags, whether it is paid;
`video_sources` says where it plays from. The two have different readers (every list reads `videos`; only the video's
page and the stream route read the source), different writers (`store_video` and `store_video_source`) and a different
life (a source moves from a hosted video to a file on the club's server while the text does not). For a paid lecture the
source is a secret, and keeping it out of the table that every list reads is what makes a careless `select *` harmless.
One rule follows from the flag: a video flipped from public to paid loses its old public source row until the real
secret is written. Any registered provider may serve a public or a paid video, a public lecture on Yandex Disk
included; the providers are the rows of `video_providers` (migration 010), so a new place a video can come from is one
row and one adapter file (T137).

Names: the table and the function parameters say `provider`/`reference`/`platform`/`external_id`; the API says
`platform` and `externalId`. They are one thing; applied function signatures keep the older words.

| Column    | Type        | Notes                                                       |
| --------- | ----------- | ----------------------------------------------------------- |
| entry_id  | bigint      | primary key, references videos                              |
| provider  | text        | references `video_providers.code`                           |
| reference | text        | an embed id, or the public link of one file; secret if paid |
| saved_at  | timestamptz |                                                             |

Written by `store_video` (a public video's) and `store_video_source` (a paid one's). An entry has a row here or a row
in `video_files`, never both.

### video_providers (migration 010)

The places a video's source can be. `code` is the primary key (`youtube`, `vk`, `rutube`, `yandex-disk`), `label` is
for people. A provider with no adapter file (T137) cannot play; the table says it exists, the adapter says how. `vimeo` was added by
migration 011. If the club ever stores video bytes in the database (T165), that is one more row here (`database`) and an
adapter that reads a large object; no existing row changes.

### video_files

| Column        | Type        | Notes                                                        |
| ------------- | ----------- | ------------------------------------------------------------ |
| id            | bigint      | primary key                                                  |
| entry_id      | bigint      | references entries; at most one current file per video entry |
| volume_path   | text        | relative to the video volume; never exposed                  |
| size_bytes    | bigint      |                                                              |
| content_type  | text        | `video/mp4`                                                  |
| faststart_ok  | boolean     | checked at upload; a file that fails is refused              |
| registered_at | timestamptz |                                                              |

Migration 015 (T077): `entry_id` references `videos` and is unique; `volume_path` is a plain relative path (no leading
slash, no `..`, no backslash, no control character); `content_type` is `video/mp4`; `faststart_ok` can only be true.
A deferred trigger keeps a source row and a file row from standing together at commit; "a public video has a source"
means a source row or a file row.

### The visibility function

`entry_view(viewer_id, viewer_status, entry_id)` returns `full`, `teaser` or `none`:

1. Soft-deleted or `published_at` in the future: `none` (an editor previewing is a separate route, not this function).
2. `hidden`: `none`.
3. `blocked` viewers are treated as guests for the entry rules and are refused paid resources.
4. `everyone`: `full`.
5. `members`: `full` for any signed-in non-blocked viewer; otherwise `teaser` if the flag is set, else `none`.
6. `restricted`: `full` if the status is listed or the viewer is a named person; otherwise `teaser` if set, else `none`.

Only the access module calls it; nothing else reads `entries`, `posts` or `videos`.

Migration 016 (T087) built rules 5 and 6 and fixed what they leave open:

- A blocked account is a guest for every entry rule: it is not "signed in" for `members`, its status counts as `guest`
  against a restricted entry's list, and being named does not let it in. The status `blocked` listed on an entry
  never matches.
- A signed-out visitor is the status `guest` with no id, so a list that names `guest` is open to a visitor with no
  session too.
- metr and admin are not let into `members` or `restricted` text by their status alone; an editor reads what the
  audience hides through the preview route of plan phase 6.
- A missing status is read as `guest`. `lecture_view` passes the account's own status, and answers `none` unless the
  viewer sees the entry in `full`: a teaser viewer sees the card and cannot play or ask for the source.

## Interaction

### comments

| Column     | Type        | Notes                                                                                 |
| ---------- | ----------- | ------------------------------------------------------------------------------------- |
| id         | bigint      | primary key                                                                           |
| entry_id   | bigint      | references entries                                                                    |
| author_id  | bigint      | references users; never null, never deleted                                           |
| body       | text        | plain text only, 1 to 2000 characters, no NUL                                         |
| hidden_by  | bigint      | references users; null when shown                                                     |
| hidden_at  | timestamptz |                                                                                       |
| edited_at  | timestamptz | null until the author changes it (within a day of created_at)                         |
| deleted_at | timestamptz | null unless the author deleted it (within a day); the row stays, out of every answer |
| created_at | timestamptz |                                                                                       |

A comment is shown only to a viewer for whom `entry_view` is not `none`, newest first. Writing needs the writer rule of
contracts/http-api.md ("Comments"): one function, also used by reactions. Hide and restore are for metr and admin and
are audited. Changed 2026-10-13 (T184): `edited_at` and `deleted_at` added; a deleted comment is not counted against
the 20 an account may leave under one entry.

### reactions

| Column     | Type        | Notes                                                           |
| ---------- | ----------- | --------------------------------------------------------------- |
| entry_id   | bigint      | references entries                                              |
| user_id    | bigint      | references users                                                |
| kind       | text        | upvote, funny, love, surprised, angry, sad (a check constraint) |
| created_at | timestamptz |                                                                 |
| updated_at | timestamptz | set when the account changes its kind                           |

Primary key (`entry_id`, `user_id`): one reaction per account per entry, changed in place. Added 2026-10-13 (T184,
FR-047); the previous service's reactions are not carried over. Who may give one is the writer rule of the comments.
Built 2026-10-13 (T186) as migration 022; a blocked account's reaction stays in the counts, and taking one back deletes
the row.

### feedback

| Column         | Type        | Notes                                                                   |
| -------------- | ----------- | ----------------------------------------------------------------------- |
| id             | bigint      | primary key                                                             |
| body           | text        | size limited; stored first, before any mail                             |
| name           | text        | what the visitor typed, one line, treated as text; may be empty         |
| contact        | text        | what the visitor typed, one line, treated as text; may be empty         |
| subject        | text        | a code of the fixed list or null (T144); never visitor text             |
| received_at    | timestamptz |                                                                         |
| address_prefix | text        | the network part only, for abuse review; never the full address        |
| mailed_at      | timestamptz | null until the mail module has sent it                                  |
| mail_error     | text        | the last failure, if any; cleared when the message is sent              |

Changed 2026-10-13 (T104): `name` and `subject` added (the form has a name field, and the sign-in help link names its
subject). Built 2026-10-13 (T107) as migration 023: `name` and `contact` are null when the visitor left them empty,
`address_prefix` is never null (an empty text when the address is unknown), and a message that was mailed carries no
`mail_error`.

### mail_queue

| Column                                         | Type   | Notes                                                                                                 |
| ---------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| id                                             | bigint | primary key                                                                                           |
| kind                                           | text   | `feedback_notice`, `recipient_code`, `recipient_change_requested`, `recipient_changed` (phase 9 adds more)                          |
| to_address                                     | text   | the recipient when the row was written                                                                |
| subject, body                                  | text   | built by the module from the kind and fixed texts; visitor text only in the body                      |
| feedback_id                                    | bigint | references feedback; set for `feedback_notice`, null for the others (T104)                            |
| attempts, next_attempt_at, sent_at, last_error |        | the worker loop's bookkeeping; a failure counts an attempt and moves `next_attempt_at` later             |

A feedback row and its `feedback_notice` row are written in one transaction by the request; the worker (T108) sends
the row and then sets `feedback.mailed_at` or `feedback.mail_error`. Nothing in the request sends mail. Built
2026-10-13 (T107): `created_at` added; `kind` is one of the four named above (a fifth is a migration); `feedback_id` is
set exactly for `feedback_notice`; with no recipient set the message is stored with `mail_error` and no row is queued.
Built 2026-10-13 (T108): the worker takes one due row at a time under `for update skip locked`; a failure keeps one
short line (300 characters at most) in `last_error` and on the message, and the next attempt waits 1 minute, then 5, 15,
an hour, 3 hours and then 6 hours for ever (`mailBackoffMs`): no row is given up on. The recipient is checked as one
bare address again on the way out (`isBareAddress`), and a row that fails that check is failed with no send.

## Control

### settings

| Key                        | Value                       | Notes                                                             |
| -------------------------- | --------------------------- | ----------------------------------------------------------------- |
| feedback_recipient         | text                        | the active address; changes only through the confirmed flow below |
| feedback_recipient_pending | text, code hash, expires_at | set while a new address waits for its code; the code itself is only in the mail (T105) |
| members_block_mode         | `locked` or `hidden`        | default `locked`                                                  |

Migration 015 (T077): `key` is limited by a CHECK to the three keys above, `members_block_mode` to `locked` or
`hidden` and is seeded `locked`; `updated_by` is the account that changed it (null for the system). Every insert or
update that changes a value writes a row of `settings_log` (`key`, `old_value`, `new_value`, `changed_by`,
`changed_at`) from a trigger, and the log is append-only.

The pending value is `{address, codeHash, expiresAt, attemptsLeft}`: a code of 8 digits valid for 30 minutes and 5
tries, kept as a hash, never in this table, the log or the audit trail in the clear (T105).

Only the superuser's page writes this table; every write requires the password re-entered in the same request, and
every change writes a settings-log row with who, when, from and to. The sending mailbox and its credentials are not
here; they stay in the server environment.

### content_version

| Column  | Type    | Notes                                             |
| ------- | ------- | ------------------------------------------------- |
| id      | boolean | primary key, always true: the table holds one row |
| counter | bigint  | moved by a statement-level trigger on every write |

Migration 017 (T089). Triggers on `entries`, `posts`, `videos`, `entry_audience_statuses` and
`entry_audience_users` add one to `counter` per statement, inside the writer's transaction, so a reader that sees the
number also sees the data it counts (a sequence would not: `nextval` is visible before commit and never rolled back).
`contentVersion()` of the access module is `counter` plus the number of entries visible by `now()`, so a date that
arrives changes it with no write. The caches of the guest search index, terms and years are keyed on it, and the
site's feeds, sitemap and search answers carry `Cache-Control: public, max-age=10` with an ETag for a visitor with no
session and `private, no-store` for an account, both with `Vary: Cookie`.

### Query plans (T091, 2026-10-12)

Measured with `EXPLAIN (ANALYZE, BUFFERS)` on a throwaway database, a guest viewer, PostgreSQL 16 in Docker on the
development machine, one request at a time. Two sets: the real content (24 posts and 22 videos) and a stress set of
6 000 posts and 600 videos (10% for members, 10% restricted to two statuses and a named person, 5% hidden, half of the
non-public with a teaser; 150 tags, 12 categories, dates over 2018 to 2026). The database time of the access module's
reads, in milliseconds:

| Read                               | Real content | Stress, before | Stress, after |
| ---------------------------------- | ------------ | -------------- | ------------- |
| every post (feeds, sitemap)        | 1.3          | 159            | 14            |
| every video                        | 1.2          | 17             | 3             |
| one year of the list               | 1.1          | 24             | 4             |
| a tag's list                       | 1.1          | 105            | 1.6           |
| years of the list                  | 0.9          | 92             | 10            |
| years of a tag                     | 1.0          | 101            | 1.6           |
| terms with their counts            | 1.8          | 151            | 14            |
| the search index                   | 1.6          | 173            | 17            |
| neighbours of an entry (6 queries) | 4.1          | 79             | 0.4           |
| one entry by address               | 0.7          | 0.6            | 0.4           |

What the plans showed, and what was done (migration 018):

- A full read of the entries table (a list of everything, the terms, the search index) is a sequential scan on purpose:
  the query returns nearly every row, so no index could help, and the scan was not the cost. The cost was the rule,
  asked per row by id (`entry_view` fetched the entry again for every row: 80 ms for 6 600 rows against 1.8 ms from the
  row's own columns). The rule is now one pure SQL function of the row's columns and three facts about the viewer
  (`entry_view_of`), which the planner inlines into the query; `entry_view` by id remains the entry point for one
  entry and calls it. A SQL function with a sub-select inside is not inlined (53 ms for the same rows), which is why the
  two lookups of a restricted entry's list are separate functions called for restricted entries only.
- The neighbour lookups were two `min`/`max` scans of the whole table (5 and 69 ms). The index
  `entries (kind, published_at)` makes each a walk from the entry's date that stops at the first visible entry
  (0.3 ms), and a year of a list a range of it.
- A tag or category was tested on the merged column of every entry after the rule had been asked for all of them. It
  is a semi-join on the `posts` and `videos` GIN indexes now, so the rule is asked for the matching entries only.
- What is still a full pass, by design: the lists of everything and the search index, whose cost is now the transfer of
  the rows (the plain text of 5 654 entries is most of it, T161), and the guests' answers are kept by the content
  version (T089) so most requests do not reach them.
- At the real size every read is 1 to 4 ms, before and after: this was headroom, not a fix for a slow page.
- The two forms of the rule are compared for every audience, state and viewer by
  `server/test/entry-view-paths.test.ts`.

### audit_log

Append-only: actor, action, target account or entry, from and to values, time, address prefix. Written for status
changes, blocks and lifts, temporary-password issuance, handover steps, recovery-code use and regeneration, setting
changes, the import command, and the superuser command. Nothing updates or deletes its rows through the application.

### recovery_codes

| Column    | Type        | Notes                                                                       |
| --------- | ----------- | --------------------------------------------------------------------------- |
| id        | bigint      | primary key                                                                 |
| user_id   | bigint      | the superuser                                                               |
| code_hash | bytea       | SHA-256 of a random code of at least 80 bits; the code itself is shown once |
| set_id    | uuid        | codes of one issue; issuing a new set voids the previous                    |
| used_at   | timestamptz | spent when used                                                             |
| voided_at | timestamptz | set when a new set replaces it                                              |

### handover_requests

| Column                 | Type        | Notes                                                                                       |
| ---------------------- | ----------- | ------------------------------------------------------------------------------------------- |
| id                     | bigint      | primary key                                                                                 |
| from_user, to_user     | bigint      | from is the superuser; to must be an existing admin                                         |
| created_at, expires_at | timestamptz | a request lapses after 7 days                                                               |
| accepted_at            | timestamptz | set when the other account accepts with its own password                                    |
| effective_at           | timestamptz | `accepted_at` plus the cooling period (24 hours recommended; zero if the owner declines it) |
| cancelled_at           | timestamptz | the superuser, or the target, can cancel before it is effective                             |
| completed_at           | timestamptz | role moved                                                                                  |

At most one open request exists (partial unique index on rows with `completed_at`, `cancelled_at` null).

## State transitions

- Account status: `guest` -> `student | expert | master | blocked` by a metr; any non-guest -> any non-guest by an
  admin (not the superuser's status); `blocked` -> a previous status by a lift under the rules of ADMIN.md section 2
  (a metr cannot lift a block an admin set). Nobody moves anyone to `guest`, and nobody changes their own status.
- Temporary password: issued (hash, `must_change`, 30-day expiry; the previous voided) -> used to reach the change
  form -> changed (flag cleared, hash replaced, sessions of that account ended) or expired (refused as a wrong
  password until a new one is issued).
- Handover: opened by the superuser with the password -> accepted by the target with its own password -> cooling
  period -> role moved (every superuser session ends; the old superuser becomes an admin) or cancelled or lapsed.
- Recovery code: unspent -> used (new password set, every other session ended, remaining codes voided, a fresh set is
  shown once) or voided by a regenerated set.
- Entry: draft (`hidden`) -> published (`audience` set, `published_at` reached) -> changed audience (takes effect on
  the next request; the guest cache bounds the lag) -> soft-deleted.
- Feedback: received (stored) -> mailed, or mail failed and retried; the stored row never depends on the mail.

## Indexes worth naming

- `entries (kind, slug)` unique; `entries (audience, published_at desc) where deleted_at is null` for lists.
- GIN on `posts.tags` and `posts.categories` (and the video equivalents) for term pages.
- `sessions (user_id)`, `sessions (absolute_expires_at)` for the sweep.
- `comments (entry_id, created_at)`; `reactions (entry_id, kind)` for the counts; `audit_log (target, at)`; `login_attempts (key, at)`.
- Query plans for the list and term queries are checked in phase 5 against 24 posts and a stress set of several
  thousand.
