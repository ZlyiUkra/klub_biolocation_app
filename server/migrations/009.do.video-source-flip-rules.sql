-- Rules for a video that changes between public and paid (added 2026-10-10 after the consilium of the same day,
-- .specify/consilium/2026-10-10-video-source-structure.md, which kept the structure of migration 008 and asked for
-- these two fixes).
--
-- 1. public -> paid. `store_video` used to leave the video's source row alone for a paid video, so a video flipped from
--    public to paid kept its old public embed id as its row, and from then on that row looked like the lecture's
--    secret source: a stream route or an adapter would trust it and play the old public video. The row is deleted on
--    the flip; a paid video with no row has no picture until `store_video_source` (npm run import:video-sources)
--    writes the real secret, which is the safe default.
-- 2. A public video's provider must be one that has a public embed id (youtube, vk, rutube). The CHECK of migration
--    006 allows `yandex-disk` for every row because a paid lecture may use it, and the only guard against a public
--    video holding such a row was `store_video`. It is now a rule of the data, checked at the end of the transaction
--    on both tables, so a writer that bypasses `store_video` (a future save path, a hand-made update) is stopped too.
--
-- `store_video` keeps its signature (replaced, not dropped); the only difference from migration 008 is the delete in
-- the update branch.

create function video_public_has_public_provider() returns trigger
  language plpgsql
as $$
declare
  v_paid boolean;
  v_provider text;
begin
  -- Both tables have entry_id: the row that fired this is a video or its source.
  select v.paid, s.provider into v_paid, v_provider
    from videos v left join video_sources s on s.entry_id = v.entry_id
   where v.entry_id = new.entry_id;
  if v_paid is false and v_provider is not null and v_provider not in ('youtube', 'vk', 'rutube') then
    raise exception 'public video % cannot have the source provider %', new.entry_id, v_provider
      using errcode = '23514';
  end if;
  return null;
end
$$;

create constraint trigger videos_public_provider
  after update of paid on videos
  deferrable initially deferred
  for each row execute function video_public_has_public_provider();

create constraint trigger video_sources_public_provider
  after insert or update on video_sources
  deferrable initially deferred
  for each row execute function video_public_has_public_provider();

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
      raise exception 'a paid video carries no embed id: its source is written by store_video_source'
        using errcode = '23514';
    end if;
  elsif p_external_id is null or p_external_id = '' or p_platform is null or p_platform not in ('youtube', 'vk', 'rutube') then
    raise exception 'a public video needs its embed id and a platform that has one' using errcode = '23514';
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
    -- public -> paid: the old row is the public embed id, which must never be read as the lecture's secret.
    delete from video_sources where entry_id = v_id;
  end if;
  return 'updated';
end
$$;
