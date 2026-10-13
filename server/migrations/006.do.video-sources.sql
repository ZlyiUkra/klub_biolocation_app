-- Where a paid lecture's picture comes from (added 2026-10-10 at the owner's word; specs/001-self-hosted-club-site,
-- tasks T136 and T137). A paid entry keeps `videos.external_id` null by rule (a paid lecture carries no video id in
-- anything a page or the API shows), so its source needs a home of its own: this table.
--
-- Decisions that would otherwise look like mistakes:
-- - The reference is a secret of the club: the public link of a file on Yandex Disk, or an unlisted YouTube id. It is
--   never selected into a list, a page or an API answer. The only reader will be the access module, which hands it to
--   the provider adapter after the membership check (phase 4); server/test/access-boundary.test.ts keeps every
--   other file from selecting this table.
-- - `provider` names a way of reaching the picture, not a hosting company's whole product: the adapter of each one is a
--   file of its own (T137), so a new source is one new value here and one new file there. `file` is not in the list:
--   a file on this server's volume is registered in `video_files` (migration 009), and an entry has one source or the
--   other, never both.
-- - One row per entry, written only by `store_video_source`, which refuses a slug that is not a paid video.

create table video_sources (
  entry_id  bigint      primary key references videos (entry_id),
  provider  text        not null check (provider in ('youtube', 'vk', 'rutube', 'yandex-disk')),
  reference text        not null check (length(reference) between 1 and 500),
  saved_at  timestamptz not null default now()
);

create function store_video_source(p_slug text, p_provider text, p_reference text) returns text
  language plpgsql
as $$
declare
  v_id bigint;
  v_paid boolean;
  v_provider text;
  v_reference text;
begin
  select e.id, v.paid into v_id, v_paid
    from entries e join videos v on v.entry_id = e.id
   where e.kind = 'video' and e.slug = p_slug;
  if v_id is null then
    raise exception 'no video entry with slug %', p_slug using errcode = 'P0002';
  end if;
  if not v_paid then
    raise exception 'video % is not paid: its source is its embed id', p_slug using errcode = '22023';
  end if;

  select provider, reference into v_provider, v_reference from video_sources where entry_id = v_id;
  if not found then
    insert into video_sources (entry_id, provider, reference) values (v_id, p_provider, p_reference);
    return 'created';
  end if;
  if v_provider = p_provider and v_reference = p_reference then
    return 'unchanged';
  end if;
  update video_sources set provider = p_provider, reference = p_reference, saved_at = now() where entry_id = v_id;
  return 'updated';
end
$$;
