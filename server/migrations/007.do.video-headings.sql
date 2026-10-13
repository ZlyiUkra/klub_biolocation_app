-- The headings of a video's public text (added 2026-10-10, task T139 of specs/001-self-hosted-club-site).
--
-- A post stores the headings of its rendered body for the table of contents (posts.headings). A video page has the same
-- table of contents, and until now its headings were not stored, so a page that reads from the database could not draw
-- it. They are the headings of the public part of the text only: the members-only block is rendered into its own
-- column and its headings never belong to the contents a guest sees (the old build filtered them out of the list for
-- the same reason).
--
-- Existing rows: the column starts as an empty list and the next `npm run import:content` fills it, because
-- `store_video` below counts a different list as a change and answers "updated" once for every video. The owner's rule
-- is that a migration moves the data it needs: this one cannot compute headings in SQL, so the importer is the mover
-- and the step is named in tasks.md (T139) and in REWRITE.md.

alter table videos add column headings jsonb not null default '[]';

drop function store_video(text, text, text, boolean, timestamptz, boolean, text, text, text, text, text, text, boolean, text, text[], text[], integer);

create function store_video(
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
  select id, audience into v_id, v_audience from entries where kind = 'video' and slug = p_slug;

  if v_id is null then
    insert into entries (kind, slug, title, description, audience, teaser, published_at)
    values ('video', p_slug, p_title, p_description, case when p_hidden then 'hidden' else 'everyone' end,
            p_teaser, p_published_at)
    returning id into v_id;
    insert into videos (entry_id, description_markdown, description_html, headings, members_only_markdown,
                        members_only_html, platform, external_id, paid, duration, tags, categories, render_version)
    values (v_id, p_description_markdown, p_description_html, p_headings, p_members_only_markdown,
            p_members_only_html, p_platform, p_external_id, p_paid, p_duration, p_tags, p_categories,
            p_render_version);
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
         and v.platform = p_platform and v.external_id is not distinct from p_external_id
         and v.paid = p_paid and v.duration is not distinct from p_duration
         and v.tags = p_tags and v.categories = p_categories
         and v.render_version = p_render_version
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
         platform = p_platform, external_id = p_external_id, paid = p_paid, duration = p_duration,
         tags = p_tags, categories = p_categories, render_version = p_render_version
   where entry_id = v_id;
  return 'updated';
end
$$;
