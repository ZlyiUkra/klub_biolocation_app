-- The speed of the visibility rule at scale (T091 of specs/001-self-hosted-club-site; plan phase 5). Measured on a
-- throwaway database of 6 000 posts and 600 videos with every audience (the figures are in data-model.md, "Query
-- plans"): the rule decided per row by id cost 80 ms for the 6 600 rows of a list, a year count or a term count, the
-- same decision from the row's own columns 1.8 ms; a neighbour lookup scanned the whole table (42 ms and 69 ms), and a
-- tag page evaluated the rule for every entry before it looked at the tag.
--
-- What changes, and what does not:
-- - The RULE is unchanged and still has one home. It moves into `entry_view_of`, a pure function of the entry's own
--   columns and three facts about the viewer; migration 016's text is the specification and the tests of
--   server/test/entry-view.test.ts and visibility-matrix.test.ts are the proof. `entry_view(viewer, status, entry)`
--   stays the by-id entry point (the lecture rule, a single entry) and now only fetches the row and the viewer's facts
--   and calls the same function, so there is no second copy of the rule.
-- - The three facts are functions of their own, each about one lookup: `entry_member` (signed in and not blocked),
--   `entry_listed` (the viewer's status, a blocked account counting as a guest, is on the entry's list) and
--   `entry_named` (the viewer is a member and named on the entry). The list queries ask the last two only for a
--   restricted entry, so the lookups cost nothing for the others.
-- - Why a pure function and not a function that looks things up: PostgreSQL inlines a SQL function into the query only
--   when its body holds no sub-select. `entry_view_of` has none, so the planner folds it into the query's own
--   expression; a function with an `exists` inside was measured at 53 ms for the same rows.
-- - One index, (kind, published_at): the nearest-neighbour lookups are `min`/`max` of the date among the visible
--   entries of a kind, which an index in that order answers by walking it from the entry's date and stopping at the
--   first visible one (0.3 ms instead of 42 ms), and a year of a list is a range of it.

create function entry_member(viewer_id bigint, viewer_status text)
  returns boolean
  language sql
  immutable
as $$
  select viewer_id is not null and coalesce(viewer_status, 'guest') <> 'blocked'
$$;

comment on function entry_member(bigint, text) is
  'a signed-in, non-blocked viewer; a blocked account is a guest for every entry rule';

create function entry_listed(viewer_status text, entry_id bigint)
  returns boolean
  language sql
  stable
as $$
  select exists (
    select 1 from entry_audience_statuses s
     where s.entry_id = $2
       and s.status = case when coalesce($1, 'guest') = 'blocked' then 'guest' else coalesce($1, 'guest') end
  )
$$;

comment on function entry_listed(text, bigint) is
  'the viewer''s status is on the entry''s list; a blocked account counts as a guest, a signed-out visitor is a guest';

create function entry_named(viewer_id bigint, viewer_status text, entry_id bigint)
  returns boolean
  language sql
  stable
as $$
  select entry_member($1, $2)
     and exists (select 1 from entry_audience_users u where u.entry_id = $3 and u.user_id = $1)
$$;

comment on function entry_named(bigint, text, bigint) is
  'the viewer is a signed-in, non-blocked account that is named on the entry';

create function entry_view_of(
  audience text, teaser boolean, deleted_at timestamptz, published_at timestamptz,
  member boolean, listed boolean, named boolean
)
  returns text
  language sql
  stable
as $$
  select case
           when $3 is not null then 'none'
           when $4 > now() then 'none'
           when $1 = 'hidden' then 'none'
           when $1 = 'everyone' then 'full'
           when $1 = 'members' then
             case when $5 then 'full' when $2 then 'teaser' else 'none' end
           when $1 = 'restricted' then
             case when $7 or $6 then 'full' when $2 then 'teaser' else 'none' end
           else 'none'
         end
$$;

comment on function entry_view_of(text, boolean, timestamptz, timestamptz, boolean, boolean, boolean) is
  'full | teaser | none from an entry''s own columns and three facts about the viewer: the one statement of the rule';

create or replace function entry_view(viewer_id bigint, viewer_status text, entry_id bigint)
  returns text
  language sql
  stable
as $$
  select coalesce(
    (select entry_view_of(
              e.audience, e.teaser, e.deleted_at, e.published_at,
              entry_member(viewer_id, viewer_status),
              case when e.audience = 'restricted' then entry_listed(viewer_status, e.id) else false end,
              case when e.audience = 'restricted' then entry_named(viewer_id, viewer_status, e.id) else false end
            )
       from entries e
      where e.id = entry_id),
    'none'
  )
$$;

comment on function entry_view(bigint, text, bigint) is
  'full | teaser | none for (viewer, entry) by id; the rule is entry_view_of, this only fetches its inputs; fails closed';

create index entries_kind_published_idx on entries (kind, published_at);
