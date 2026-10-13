-- The visibility function (T023 of specs/001-self-hosted-club-site; data-model.md, "The visibility function").
--
-- entry_view(viewer_id, viewer_status, entry_id) answers one question: how much of an entry may this viewer see.
-- 'full' means everything, 'teaser' means the card but not the content, 'none' means the entry does not exist as far
-- as the viewer can tell (the caller answers 404, never 403). It is the one home of that decision (constitution III
-- and IV); the access module (server/src/access/entries.ts) is the only code that calls it, and every list, feed,
-- sitemap, search index, term count and previous/next link goes through that module.
--
-- What it knows in this migration, and what it deliberately does not:
-- - Rule 1 and 2 of the model: a soft-deleted entry, an entry whose published_at is still in the future, and a
--   `hidden` entry are 'none' for everyone, administrators included. An editor's preview is a separate route.
-- - `everyone` is 'full' for every viewer, a blocked one included (a blocked account is treated as a guest for
--   entry rules, and a guest sees public entries).
-- - `members` and `restricted` are not decided here. Their branches arrive with the migration that introduces
--   accounts' statuses and the audience form; until then the function FAILS CLOSED: any audience it does not
--   know answers 'none'. That is the safe direction, because the only entries that can have those audiences before
--   then are ones an editor set by hand. The migration that adds the branches replaces this function with
--   `create or replace function` and changes the test that pins the interim behaviour.
-- - viewer_id and viewer_status are accepted now so that no caller changes later; they are not read yet.
--
-- STABLE, not IMMUTABLE: it reads tables and uses now(), which is fixed for the length of one statement, so a list
-- query sees one consistent clock.

create function entry_view(viewer_id bigint, viewer_status text, entry_id bigint)
  returns text
  language sql
  stable
as $$
  select coalesce(
    (select case
              when e.deleted_at is not null then 'none'
              when e.published_at > now() then 'none'
              when e.audience = 'everyone' then 'full'
              else 'none'
            end
       from entries e
      where e.id = entry_id),
    'none'
  )
$$;

comment on function entry_view(bigint, text, bigint) is
  'full | teaser | none for (viewer, entry); the only decision about who may see an entry; fails closed';
