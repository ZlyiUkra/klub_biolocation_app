-- Files of videos kept on the club's own server, the settings table and its log (T077 of
-- specs/001-self-hosted-club-site; data-model.md "video_files" and "settings"; plan phase 4).
--
-- Existing data: nothing is moved or lost. Both tables are new, no video has a file yet (every source is still a row of
-- `video_sources`), and the one settings row seeded here, the members-only block's mode, is `locked`, the default of
-- FR-026. The previous behaviour of the site was "hidden"; the switch to it is the superuser's one setting, not a
-- migration.
--
-- Decisions that would otherwise look like mistakes:
-- - `video_files.entry_id` is the primary reference to `videos`, not to `entries`, so a file cannot belong to a post, and
--   it is UNIQUE: "at most one current file per video". A new file for the same video replaces the row; the history of
--   files is the audit trail of the register command, not this table.
-- - An entry has a source row OR a file row, never both (T079's note, decided here, consilium of 2026-10-10): a deferred
--   constraint trigger on both tables, deferred so that registering a file can delete the old embed row in the same
--   transaction. The rule "a public video has a source" of migration 008 now reads "a public video has a source row or
--   a file row", for the same reason, and is re-checked when a file row goes away.
-- - `volume_path` must be a plain relative path of the video volume: no leading slash, no `..` segment, no backslash, no
--   control character. The column is never exposed; the check is a second wall behind the register command, which
--   already refuses such a path, so a careless insert cannot point the stream route outside the volume.
-- - `faststart_ok` can only be true: a file that fails the check is refused at registration, not stored with a flag
--   (data-model.md says "a file that fails is refused"). The column exists so that a later, stricter check can be
--   recorded without a migration.
-- - `settings` is key and value (jsonb), the keys listed by a CHECK so that a typo in code cannot create a setting
--   nothing reads. `members_block_mode` is further limited to `locked` or `hidden` by a CHECK on the pair, so an
--   unknown mode cannot be stored; the reader still treats anything it does not know as `locked`.
-- - Every insert or update of a setting writes a row of `settings_log` from a trigger: who (`updated_by`, null for the
--   system and for a seed), when, from and to. Writing the log in the database means no code path can change a setting
--   and forget the log. The log is append-only like `audit_log`.
-- - A recipient address is personal data and is a value here (`feedback_recipient`); the log keeps the same text. That
--   is the spec's own requirement (spec.md, user story 8, scenario 2: "from what and to what").

create table video_files (
  id            bigint generated always as identity primary key,
  entry_id      bigint      not null unique references videos (entry_id) on delete cascade,
  volume_path   text        not null
    check (volume_path <> ''
       and volume_path !~ '^/'
       and volume_path !~ '(^|/)[.][.](/|$)'
       and position(chr(92) in volume_path) = 0
       and volume_path !~ '[[:cntrl:]]'),
  size_bytes    bigint      not null check (size_bytes > 0),
  content_type  text        not null check (content_type = 'video/mp4'),
  faststart_ok  boolean     not null check (faststart_ok),
  registered_at timestamptz not null default clock_timestamp()
);

-- An entry has a source row or a file row, never both. Checked at the end of the transaction.
create function video_source_xor_file() returns trigger
  language plpgsql
as $$
declare
  v_id bigint := new.entry_id;
begin
  if exists (select 1 from video_sources where entry_id = v_id)
     and exists (select 1 from video_files where entry_id = v_id) then
    raise exception 'video % has both a source row and a file row', v_id using errcode = '23514';
  end if;
  return null;
end
$$;

create constraint trigger video_files_not_with_source
  after insert or update of entry_id on video_files
  deferrable initially deferred
  for each row execute function video_source_xor_file();

create constraint trigger video_sources_not_with_file
  after insert or update of entry_id on video_sources
  deferrable initially deferred
  for each row execute function video_source_xor_file();

-- "A public video has a source" (migration 008) becomes "a source row or a file row".
create or replace function video_has_source() returns trigger
  language plpgsql
as $$
declare
  v_id bigint;
  v_paid boolean;
begin
  v_id := case tg_table_name when 'videos' then new.entry_id else old.entry_id end;
  select paid into v_paid from videos where entry_id = v_id;
  if v_paid is false
     and not exists (select 1 from video_sources where entry_id = v_id)
     and not exists (select 1 from video_files where entry_id = v_id) then
    raise exception 'public video % has no source', v_id using errcode = '23514';
  end if;
  return null;
end
$$;

-- Taking a file away from a public video must leave it a source row; a cascade from a deleted video finds no video.
create constraint trigger video_files_keep_public_source
  after delete or update of entry_id on video_files
  deferrable initially deferred
  for each row execute function video_has_source();

create table settings (
  key        text        primary key
    check (key in ('feedback_recipient', 'feedback_recipient_pending', 'members_block_mode')),
  value      jsonb       not null,
  updated_at timestamptz not null default clock_timestamp(),
  -- Who changed it: null for the system and for a seed.
  updated_by bigint      references users (id),
  check (key <> 'members_block_mode' or value in ('"locked"'::jsonb, '"hidden"'::jsonb))
);

create table settings_log (
  id         bigint generated always as identity primary key,
  key        text        not null,
  old_value  jsonb,
  new_value  jsonb       not null,
  changed_by bigint      references users (id),
  changed_at timestamptz not null default clock_timestamp()
);

create index settings_log_key_at_idx on settings_log (key, changed_at);

create function settings_log_write() returns trigger
  language plpgsql
as $$
begin
  if tg_op = 'INSERT' or new.value is distinct from old.value then
    insert into settings_log (key, old_value, new_value, changed_by)
    values (new.key, case tg_op when 'UPDATE' then old.value end, new.value, new.updated_by);
  end if;
  return null;
end
$$;

create trigger settings_log_trg
  after insert or update on settings
  for each row execute function settings_log_write();

-- audit_log's function raises for any operation, so it serves the log too.
create trigger settings_log_no_change_trg before update or delete on settings_log
  for each row execute function audit_log_append_only();
create trigger settings_log_no_truncate_trg before truncate on settings_log
  for each statement execute function audit_log_append_only();

-- The default of FR-026. Seeded, not implied, so that a reader has one row to read and the log has its first line.
insert into settings (key, value) values ('members_block_mode', '"locked"');

comment on table video_files is 'A video kept as a file on the server volume; at most one per video; never beside a source row (T077)';
comment on table settings is 'Superuser-only settings, key and jsonb value; every change is logged by trigger into settings_log (T077)';
