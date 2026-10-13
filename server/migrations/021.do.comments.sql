-- Comments on posts and videos (T106 of specs/001-self-hosted-club-site; data-model.md "comments", FR-032, T151, T184;
-- tests: server/test/comments.test.ts, written first by T103). Replaces the previous third-party comment service, whose
-- history is not carried over (FR-041).
--
-- Decisions that would otherwise look like mistakes:
-- - One row per comment, never removed: the author's deletion sets `deleted_at` and a moderator's hiding sets
--   `hidden_by` and `hidden_at`, so the history and the audit trail keep their anchor (a blocked account's comments
--   stay too, and `author_id` is never null). A deleted comment is in no answer; a hidden one is in the answers of metr
--   and admin only, marked.
-- - `body` is plain text and is never rendered to markup anywhere. The only limit written here is a safety net of ten
--   thousand characters and "not empty": the number the owner chose (2000) is `commentLimits` in the route's module and
--   nowhere else, so changing it does not need a migration.
-- - `person_lecture_access` is the PERSON half of `lecture_view`, taken out so that "who may write a comment or give a
--   reaction" is the same rule as "who may open a paid lecture" and not a copy of it (the constitution's third
--   principle). `lecture_view` is replaced below to call it; its answers are unchanged, and
--   server/test/lecture-access.test.ts and visibility-matrix.test.ts are the proof. A guest that holds a paying date
--   and an account whose date ended come out as the lecture rule says: 'open' and 'no_access'.

create table comments (
  id         bigint      generated always as identity primary key,
  entry_id   bigint      not null references entries (id),
  author_id  bigint      not null references users (id),
  body       text        not null check (char_length(body) between 1 and 10000),
  hidden_by  bigint      references users (id),
  hidden_at  timestamptz,
  edited_at  timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  check ((hidden_by is null) = (hidden_at is null))
);

-- The thread of an entry, newest first, and the count one author has left under one entry.
create index comments_thread_idx on comments (entry_id, created_at desc, id desc) where deleted_at is null;
create index comments_author_idx on comments (entry_id, author_id) where deleted_at is null;

comment on table comments is 'Comments of posts and videos; soft-deleted by the author, hidden by a metr or an admin (T106)';

create function person_lecture_access(person_id bigint)
  returns text
  language sql
  stable
as $$
  select case
           when u.id is null then 'guest'
           when u.status = 'blocked' then 'blocked'
           when u.status in ('metr', 'admin') then 'open'
           when u.access_until is not null
                and u.access_until >= (now() at time zone 'utc')::date then 'open'
           else 'no_access'
         end
    from (select 1) one
    left join users u on u.id = $1
$$;

comment on function person_lecture_access(bigint) is
  'open | guest | no_access | blocked for a person, the rule of the paid lectures without the lecture; the one home of who may open them, write a comment or give a reaction';

create or replace function lecture_view(viewer_id bigint, entry_id bigint)
  returns text
  language sql
  stable
as $$
  select case
           when v.entry_id is null then 'none'
           when entry_view($1, coalesce(u.status, 'guest'), $2) <> 'full' then 'none'
           when v.available_until < (now() at time zone 'utc')::date
                and not coalesce(u.status in ('metr', 'admin'), false) then 'expired'
           when not v.paid then 'open'
           else person_lecture_access($1)
         end
    from (select 1) one
    left join videos v on v.entry_id = $2
    left join users u on u.id = $1
$$;

comment on function lecture_view(bigint, bigint) is
  'open | guest | no_access | blocked | expired | none for (viewer, video); the lecture rule over person_lecture_access; none unless the entry is seen in full';
