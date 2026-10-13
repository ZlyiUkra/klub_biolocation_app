-- Reactions of posts and videos (T186 of specs/001-self-hosted-club-site; data-model.md "reactions", FR-047, T184, T185;
-- tests: server/test/reactions.test.ts). The six the previous comment service offered, one per account per entry; its own
-- reactions are not carried over (FR-041).
--
-- Decisions that would otherwise look like mistakes:
-- - The numbering: this is 022 because it is the next migration after 021, not the number the plan first named
--   (023); the feedback tables of T107 follow as 023.
-- - The primary key (entry_id, user_id) is the rule "one reaction per account per entry", kept by the database itself,
--   so two parallel requests of one account cannot leave two rows; a change of mind is an update of the one row.
-- - The six kinds are a check constraint, the same list as `reactionKinds` in server/src/comments/routes.ts; a test
--   (server/test/reactions.test.ts) stores each of the six through the route, so a kind in the list and missing here
--   fails there. A seventh kind needs this constraint changed by a migration, which is the intended friction.
-- - Like comments, a row is never removed with its account's status: a blocked account's reaction stays in the counts
--   (it is a count of what was given, not a list of people), and an entry that is hidden and shown again has its
--   reactions back. A person who takes theirs back deletes the row, which is the one case a row is removed.
-- - Who may give one is not here: it is `person_lecture_access` (migration 021) asked by the route, so "who writes a
--   comment", "who reacts" and "who opens a paid lecture" stay one rule.

create table reactions (
  entry_id   bigint      not null references entries (id),
  user_id    bigint      not null references users (id),
  kind       text        not null check (kind in ('upvote', 'funny', 'love', 'surprised', 'angry', 'sad')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (entry_id, user_id)
);

-- The counts of one entry by kind; the key's own index serves "this account's reaction under this entry".
create index reactions_entry_kind_idx on reactions (entry_id, kind);

comment on table reactions is 'One reaction (upvote, funny, love, surprised, angry, sad) per account per post or video (T186)';
