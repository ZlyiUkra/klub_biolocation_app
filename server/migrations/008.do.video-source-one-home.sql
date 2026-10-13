-- One home for the source of a video (added 2026-10-10, task T160 of specs/001-self-hosted-club-site; the owner's
-- instruction that the two homes of a source must become one, with the existing data MOVED and not left behind).
--
-- Until now a video's source lived in two places: `videos.platform` and `videos.external_id` for a public video, and
-- `video_sources` (migration 006) for a paid one, while a paid lecture's `videos.platform` held a default that meant
-- nothing ("youtube", for a lecture on Yandex Disk). After this migration every video's source is one row of
-- `video_sources` - provider and reference - and `videos` has neither column.
--
-- Decisions that would otherwise look like mistakes:
-- - Existing rows are moved first, in this file, before the columns are dropped: every public video's platform and
--   embed id become its `video_sources` row. A paid video's row is already there (written by `store_video_source`);
--   its default platform is discarded because it never described anything. A public video that could not be moved
--   (no embed id) stops the migration with its slug, so nothing is dropped on the way to a half-moved state.
-- - Who may see a source did not change. A public video's reference is its embed id and is shown (the API's
--   `externalId`); a paid video's reference is a secret and is never selected into a list, a page or an API answer.
--   What used to be the table constraint "a paid video carries no embed id" is now the structure itself: the id of a
--   paid lecture is in a table only the access module selects (server/test/access-boundary.test.ts), and the API
--   answers `platform` and `externalId` null for it (server/test/content-api.test.ts).
-- - What used to be the table constraint "a public video has a source" cannot be a CHECK any more, because the source
--   is another table. It is a deferred constraint trigger on both tables: a public video must have its row when the
--   transaction ends, and the row of a public video cannot be deleted. Deferred, so that `store_video` may insert
--   the video and then its source in one transaction.
-- - `store_video` keeps its signature (the importer and the editors' save call it unchanged): `p_platform` and
--   `p_external_id` are now written to `video_sources`. A paid video must pass no embed id (its source is written by
--   `store_video_source`, which reads the secret from its own file); a public one must pass both. `file` is not a
--   platform here: a file on this server's volume is registered in `video_files` when lectures move onto the server.

-- 1. Move the public videos' sources.
insert into video_sources (entry_id, provider, reference)
select entry_id, platform, external_id
  from videos
 where not paid and external_id is not null and platform in ('youtube', 'vk', 'rutube')
on conflict (entry_id) do update
  set provider = excluded.provider, reference = excluded.reference, saved_at = now();

-- 2. Nothing is dropped while a public video would be left without a source.
do $$
declare
  v_slug text;
begin
  select e.slug into v_slug
    from videos v join entries e on e.id = v.entry_id
   where not v.paid and not exists (select 1 from video_sources s where s.entry_id = v.entry_id)
   limit 1;
  if v_slug is not null then
    raise exception 'public video % has no embed id to move into video_sources', v_slug using errcode = '23514';
  end if;
end
$$;

-- 3. The two columns go, and with them the two table constraints that named them.
alter table videos drop column platform, drop column external_id;

-- 4. The rule "a public video has a source", checked at the end of the transaction.
create function video_has_source() returns trigger
  language plpgsql
as $$
declare
  v_id bigint;
  v_paid boolean;
begin
  v_id := case tg_table_name when 'videos' then new.entry_id else old.entry_id end;
  select paid into v_paid from videos where entry_id = v_id;
  if v_paid is false and not exists (select 1 from video_sources where entry_id = v_id) then
    raise exception 'public video % has no source', v_id using errcode = '23514';
  end if;
  return null;
end
$$;

create constraint trigger videos_public_has_a_source
  after insert or update of paid on videos
  deferrable initially deferred
  for each row execute function video_has_source();

create constraint trigger video_sources_keep_public_source
  after delete or update of entry_id on video_sources
  deferrable initially deferred
  for each row execute function video_has_source();

-- 5. `store_video` writes the source of a public video into `video_sources`. Same signature as migration 007.
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
  end if;
  return 'updated';
end
$$;
