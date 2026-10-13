-- The audiences of an entry (T087 of specs/001-self-hosted-club-site; data-model.md, "The visibility function"; spec
-- FR-008 to FR-011; plan phase 5). Migration 003 knew `everyone` and failed closed on the rest; this one adds the
-- `members` and `restricted` branches, the named-person branch and the teaser, and keeps the one contract: the caller
-- answers 404 for 'none', never 403.
--
-- The rule, in the order the function decides it:
--   1. soft-deleted, or published_at in the future: 'none' for everybody (an editor's preview is a separate route);
--   2. `hidden`: 'none' for everybody;
--   3. `everyone`: 'full';
--   4. `members`: 'full' for any signed-in, non-blocked viewer; otherwise 'teaser' when the entry's flag is set, else
--      'none';
--   5. `restricted`: 'full' for a viewer whose status is listed on the entry, or who is named on it; otherwise
--      'teaser' when the flag is set, else 'none';
--   6. any audience this function does not know: 'none' (fail closed, as before).
--
-- Decisions that would otherwise look like mistakes:
-- - A blocked account is a GUEST for every entry rule (data-model.md rule 3). It is therefore not "signed in" for
--   `members`, its status counts as `guest` for the list of `restricted`, and a name does not let it in. That is the
--   safe direction, and it is what the visibility matrix (server/test/visibility-matrix.test.ts) pins. The status
--   `blocked` can be written on a restricted entry by the table's check constraint, and never matches.
-- - A signed-out visitor is the status `guest` with no id. A list that names the status `guest` is therefore open to
--   a visitor with no session too: "guest" means "no status", and nobody has a status they could be asked for.
-- - metr and admin are not let into `restricted` or `members`-only text by their status alone. An editor reads an
--   entry the audience hides through the editors' preview route (plan phase 6), not through this function, so one
--   rule has one home and "admin sees everything" is not a second, silent audience.
-- - `viewer_status` null is read as `guest`: the function must not turn a missing argument into 'none' for a
--   signed-in person by SQL's three-valued logic. `lecture_view` used to pass null (migration 014); it passes the
--   account's real status now.
-- - `lecture_view` answers 'none' unless the viewer sees the entry in FULL. Before this migration a viewer either saw
--   an entry in full or not at all, so "not 'none'" meant "full"; a teaser is a third answer, and a viewer who sees
--   only the card must not be able to play the lecture or be told how to get its source.
-- - The two `exists` lookups run only for a restricted entry (CASE evaluates its branches in order and stops), and
--   both read the primary key of their table (entry_id first), so a list of many entries pays for them only on the
--   few restricted ones.
--
-- STABLE, as before: it reads tables and uses now(), which is fixed for the length of one statement.

create or replace function entry_view(viewer_id bigint, viewer_status text, entry_id bigint)
  returns text
  language sql
  stable
as $$
  select coalesce(
    (select case
              when e.deleted_at is not null then 'none'
              when e.published_at > now() then 'none'
              when e.audience = 'hidden' then 'none'
              when e.audience = 'everyone' then 'full'
              when e.audience = 'members' then
                case when viewer_id is not null and coalesce(viewer_status, 'guest') <> 'blocked' then 'full'
                     when e.teaser then 'teaser'
                     else 'none'
                end
              when e.audience = 'restricted' then
                case when viewer_id is not null
                          and coalesce(viewer_status, 'guest') <> 'blocked'
                          and exists (select 1 from entry_audience_users u
                                       where u.entry_id = e.id and u.user_id = viewer_id) then 'full'
                     when exists (select 1 from entry_audience_statuses s
                                   where s.entry_id = e.id
                                     and s.status = case when coalesce(viewer_status, 'guest') = 'blocked'
                                                         then 'guest'
                                                         else coalesce(viewer_status, 'guest') end) then 'full'
                     when e.teaser then 'teaser'
                     else 'none'
                end
              else 'none'
            end
       from entries e
      where e.id = entry_id),
    'none'
  )
$$;

comment on function entry_view(bigint, text, bigint) is
  'full | teaser | none for (viewer, entry); the only decision about who may see an entry; fails closed';

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
           when u.id is null then 'guest'
           when u.status = 'blocked' then 'blocked'
           when u.status in ('metr', 'admin') then 'open'
           when u.access_until is not null
                and u.access_until >= (now() at time zone 'utc')::date then 'open'
           else 'no_access'
         end
    from (select 1) one
    left join videos v on v.entry_id = $2
    left join users u on u.id = $1
$$;

comment on function lecture_view(bigint, bigint) is
  'open | guest | no_access | blocked | expired | none for (viewer, video); the one home of the lecture access rule; none unless the entry is seen in full';
