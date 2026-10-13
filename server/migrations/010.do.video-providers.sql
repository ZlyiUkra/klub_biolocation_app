-- The providers of a video's source become a table of their own (added 2026-10-10, task T160 follow-up; the owner's
-- word after the consilium of the same day: a public video may be hosted on Yandex Disk as well, the list of
-- places a lecture can come from is not three, and more may come, Vimeo for one).
--
-- Two things change, and one thing from migration 009 is taken back:
-- - The CHECK of migration 006 that listed the providers (`youtube`, `vk`, `rutube`, `yandex-disk`) becomes a
--   foreign key to `video_providers`. A new place a video can come from is one row here and one adapter file
--   (task T137), not a migration that rewrites a constraint, and the list has exactly one home in the database; the
--   importer's own copy of it is gone (the database answers for an unknown provider).
-- - A public video may have any registered provider. The consilium's rule of migration 009, "a public video's
--   provider is youtube, vk or rutube", rested on the assumption that a public video is always an embed; it is not,
--   a public lecture may be a file on Yandex Disk, whose public link is the reference. The two constraint triggers
--   and their function are removed. What stays from 009 is the flip rule in `store_video`: a public video that becomes
--   paid loses its old source row, because that row held a public reference that must not be read as a secret.
-- - `store_video` no longer lists the providers itself; it asks `video_providers`.
--
-- Existing data: the four providers of the old CHECK are inserted, so every existing row of `video_sources` satisfies
-- the new foreign key; nothing is moved or lost.

create table video_providers (
  code  text primary key check (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  label text not null
);

insert into video_providers (code, label) values
  ('youtube', 'YouTube'),
  ('vk', 'VK Video'),
  ('rutube', 'Rutube'),
  ('yandex-disk', 'Yandex Disk');

alter table video_sources drop constraint video_sources_provider_check;
alter table video_sources
  add constraint video_sources_provider_fkey foreign key (provider) references video_providers (code);

drop trigger videos_public_provider on videos;
drop trigger video_sources_public_provider on video_sources;
drop function video_public_has_public_provider();

create or replace function store_video(
  p_slug text, p_title text, p_description text, p_hidden boolean, p_published_at timestamptz, p_teaser boolean,
  p_description_markdown text, p_description_html text, p_headings jsonb,
  p_members_only_markdown text, p_members_only_html text,
  p_platform text, p_external_id text, p_paid boolean, p_duration text,
  p_tags text[], p_categories text[], p_render_version integer
) returns text
  language plpgsql
as $$
declare
  v_id bigint;
  v_audience text;
  v_new_audience text;
  v_was_paid boolean;
  v_same boolean;
begin
  if p_paid then
    if p_external_id is not null then
      raise exception 'a paid video carries no source reference here: its source is written by store_video_source'
        using errcode = '23514';
    end if;
  else
    if p_external_id is null or p_external_id = '' then
      raise exception 'a public video needs its source reference (an embed id or a public link)' using errcode = '23514';
    end if;
    if p_platform is null or not exists (select 1 from video_providers where code = p_platform) then
      raise exception 'unknown video provider %', p_platform using errcode = '23514';
    end if;
  end if;

  select id, audience into v_id, v_audience from entries where kind = 'video' and slug = p_slug;

  if v_id is null then
    insert into entries (kind, slug, title, description, audience, teaser, published_at)
    values ('video', p_slug, p_title, p_description, case when p_hidden then 'hidden' else 'everyone' end,
            p_teaser, p_published_at)
    returning id into v_id;
    insert into videos (entry_id, description_markdown, description_html, headings, members_only_markdown,
                        members_only_html, paid, duration, tags, categories, render_version)
    values (v_id, p_description_markdown, p_description_html, p_headings, p_members_only_markdown,
            p_members_only_html, p_paid, p_duration, p_tags, p_categories, p_render_version);
    if not p_paid then
      insert into video_sources (entry_id, provider, reference) values (v_id, p_platform, p_external_id);
    end if;
    return 'created';
  end if;

  v_new_audience := case
    when p_hidden then 'hidden'
    when v_audience = 'hidden' then 'everyone'
    else v_audience
  end;

  select paid into v_was_paid from videos where entry_id = v_id;

  select e.title = p_title and e.description = p_description and e.published_at = p_published_at
         and e.audience = v_new_audience
         and v.description_markdown = p_description_markdown
         and v.headings = p_headings
         and v.members_only_markdown is not distinct from p_members_only_markdown
         and v.paid = p_paid and v.duration is not distinct from p_duration
         and v.tags = p_tags and v.categories = p_categories
         and v.render_version = p_render_version
         -- A paid video's source is not this function's to compare or write; a public one's must match.
         and (p_paid or exists (select 1 from video_sources s
                                 where s.entry_id = e.id and s.provider = p_platform and s.reference = p_external_id))
    into v_same
    from entries e join videos v on v.entry_id = e.id
   where e.id = v_id;
  if v_same then
    return 'unchanged';
  end if;

  update entries set title = p_title, description = p_description, published_at = p_published_at,
                     audience = v_new_audience
   where id = v_id;
  update videos
     set description_markdown = p_description_markdown, description_html = p_description_html,
         headings = p_headings,
         members_only_markdown = p_members_only_markdown, members_only_html = p_members_only_html,
         paid = p_paid, duration = p_duration,
         tags = p_tags, categories = p_categories, render_version = p_render_version
   where entry_id = v_id;
  if not p_paid then
    insert into video_sources (entry_id, provider, reference) values (v_id, p_platform, p_external_id)
    on conflict (entry_id) do update
      set provider = excluded.provider, reference = excluded.reference, saved_at = now();
  elsif not v_was_paid then
    -- public -> paid: the old row is a public reference, which must never be read as the lecture's secret.
    delete from video_sources where entry_id = v_id;
  end if;
  return 'updated';
end
$$;
