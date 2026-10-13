-- The content version counter (T089 of specs/001-self-hosted-club-site; plan phase 5).
--
-- What the caches of the guest answers (the search index, the list of years, the terms) and the feeds' ETags are keyed
-- on: a number that moves on EVERY write that can change what any viewer sees. Until this migration the version was
-- derived from `entries.updated_at`, which moves when an entry, its post or its video row is written - and not when
-- the audience of an entry changes through `entry_audience_statuses` or `entry_audience_users`. A restricted entry
-- whose list of statuses lost `guest` would have stayed in the guests' cached terms until the next unrelated write.
--
-- Decisions that would otherwise look like mistakes:
-- - One row in a table, not a sequence. A sequence's `nextval` is visible before the transaction commits and is never
--   rolled back, so a reader could build a cache from the old data and file it under the NEW number and keep it for
--   ever. The row is bumped inside the writer's transaction and becomes visible with the data, so a reader that sees
--   the number sees the data it counts.
-- - Statement-level triggers, one bump per statement however many rows it wrote. The importer writes row by row and
--   pays one extra update each, which is nothing next to the render it does.
-- - The number is a counter of writes only. A date passing is not a write: the version reader adds the number of
--   entries that are visible by now() (server/src/access/entries.ts, `contentVersion`), so an entry whose date arrives
--   changes the version with no write, as before.
-- - It is not bumped by the members-block setting, by accounts or by sessions: none of them changes what a guest sees,
--   and every signed-in answer is built per request.

create table content_version (
  id      boolean primary key default true check (id),
  counter bigint  not null default 0
);

insert into content_version default values;

comment on table content_version is
  'One row. counter moves with every write to entries, posts, videos and the audience tables; the caches key on it';

create function content_version_bump() returns trigger language plpgsql as $$
begin
  update content_version set counter = counter + 1;
  return null;
end
$$;

create trigger entries_version_trg after insert or update or delete on entries
  for each statement execute function content_version_bump();
create trigger posts_version_trg after insert or update or delete on posts
  for each statement execute function content_version_bump();
create trigger videos_version_trg after insert or update or delete on videos
  for each statement execute function content_version_bump();
create trigger entry_audience_statuses_version_trg after insert or update or delete on entry_audience_statuses
  for each statement execute function content_version_bump();
create trigger entry_audience_users_version_trg after insert or update or delete on entry_audience_users
  for each statement execute function content_version_bump();
