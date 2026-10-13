-- The content tables (T022 of specs/001-self-hosted-club-site; data-model.md, "Content").
--
-- entries is the shared part of every post and video; posts and videos hold what is specific to each kind; two small
-- tables hold the audience of a restricted entry. Nothing in this file is hard-deleted by the application: an entry
-- leaves every surface by `deleted_at`, so the foreign keys below are plain (no cascade) on purpose - a stray
-- DELETE fails instead of taking comments and the audit trail's anchor with it.
--
-- Decisions that would otherwise look like mistakes:
-- - `created_by` and `entry_audience_users.user_id` are bigint columns with no foreign key yet: the accounts table
--   arrives with plan phase 2, and that migration adds both constraints. Until then they are null or unused.
-- - The set of statuses is written here as a literal because the module that owns the list (the status rules of
--   plan phase 3) does not exist yet; the test that proves the two agree comes with that module (data-model.md,
--   "Conventions").
-- - `updated_at` is the token of an optimistic save (FR-030). It is set by the database, by triggers, and moves
--   whenever the entry row or its posts/videos row changes, so no application code can forget to move it.
--   clock_timestamp() is used, not now(): two saves in one transaction still get different tokens.
-- - posts and videos carry a constant `kind` column and a composite foreign key, so a post row cannot hang on a
--   video entry or the other way round.

create table entries (
  id           bigint generated always as identity primary key,
  kind         text        not null check (kind in ('post', 'video')),
  slug         text        not null,
  title        text        not null,
  audience     text        not null default 'everyone'
                           check (audience in ('everyone', 'members', 'restricted', 'hidden')),
  teaser       boolean     not null default false,
  published_at timestamptz not null default now(),
  updated_at   timestamptz not null default clock_timestamp(),
  deleted_at   timestamptz,
  created_by   bigint,
  -- An address is one path segment; a post is never named after a year (the year pages own those addresses).
  constraint entries_slug_shape check (slug <> '' and slug !~ '[/[:space:]]'),
  constraint entries_post_not_a_year check (kind <> 'post' or slug !~ '^[0-9]{4}$'),
  constraint entries_kind_slug_key unique (kind, slug),
  -- The target of the composite foreign keys of posts and videos.
  constraint entries_id_kind_key unique (id, kind)
);

-- Lists: the visible entries of a kind, newest first, soft-deleted ones never indexed.
create index entries_list_idx on entries (audience, published_at desc) where deleted_at is null;

create table entry_audience_statuses (
  entry_id bigint not null references entries (id),
  status   text   not null check (status in ('guest', 'student', 'expert', 'master', 'metr', 'admin', 'blocked')),
  primary key (entry_id, status)
);

create table entry_audience_users (
  entry_id bigint not null references entries (id),
  user_id  bigint not null,
  primary key (entry_id, user_id)
);

create table posts (
  entry_id       bigint  primary key,
  kind           text    not null default 'post' check (kind = 'post'),
  body_markdown  text    not null,
  body_html      text    not null,
  headings       jsonb   not null default '[]',
  plain_text     text    not null default '',
  summary        text    not null default '',
  tags           text[]  not null default '{}',
  categories     text[]  not null default '{}',
  render_version integer not null,
  foreign key (entry_id, kind) references entries (id, kind)
);

create index posts_tags_idx on posts using gin (tags);
create index posts_categories_idx on posts using gin (categories);

create table videos (
  entry_id              bigint  primary key,
  kind                  text    not null default 'video' check (kind = 'video'),
  description_markdown  text    not null default '',
  description_html      text    not null default '',
  -- The locked block lives in its own columns and is sent only to viewers with full access (plan phase 4).
  members_only_markdown text,
  members_only_html     text,
  platform              text    not null default 'youtube' check (platform in ('youtube', 'vk', 'rutube', 'file')),
  external_id           text,
  paid                  boolean not null default false,
  tags                  text[]  not null default '{}',
  categories            text[]  not null default '{}',
  render_version        integer not null,
  foreign key (entry_id, kind) references entries (id, kind),
  -- The rules of the current build (src/content/config.ts): a paid lecture carries no video id, because the id is
  -- what the paid mechanism exists to keep back; a public one needs its id, unless a file has taken its place.
  constraint videos_paid_has_no_external_id check (not paid or external_id is null),
  constraint videos_public_has_a_source check (paid or platform = 'file' or external_id is not null)
);

create index videos_tags_idx on videos using gin (tags);
create index videos_categories_idx on videos using gin (categories);

-- The save token moves with every change to the entry or to its kind-specific row.
create function entries_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end
$$;

create trigger entries_touch_trg before update on entries
  for each row execute function entries_touch();

create function entry_child_touch() returns trigger language plpgsql as $$
begin
  update entries set updated_at = clock_timestamp() where id = new.entry_id;
  return null;
end
$$;

create trigger posts_touch_trg after insert or update on posts
  for each row execute function entry_child_touch();
create trigger videos_touch_trg after insert or update on videos
  for each row execute function entry_child_touch();
