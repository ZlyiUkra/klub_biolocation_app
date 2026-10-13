-- The fields of today's pages that the first content tables left out (found while building T030 of
-- specs/001-self-hosted-club-site, the read API, by checking what the pages actually read).
--
-- - entries.description: the front matter `description` of a post or a video, used for the page's meta description and
--   the share text. It belongs to the shared part: both kinds have it, and the editors' form owns it.
-- - posts.lastmod, share_title, share_description: optional fields of the site's post schema, shown as "last updated"
--   and used for the share block. No current post sets them, but the schema accepts them and a page reads them.
-- - videos.duration: the "12:34" label a video page shows.
--
-- The import functions are replaced to carry the new fields. They are dropped first because adding parameters
-- changes the signature, which would otherwise leave the old function beside the new one. A re-import then reports
-- the existing rows as 'updated' once, because they gain these values.

alter table entries add column description text not null default '';
alter table posts
  add column lastmod timestamptz,
  add column share_title text,
  add column share_description text;
alter table videos add column duration text;

drop function store_post(text, text, boolean, timestamptz, text, text, jsonb, text, text, text[], text[], integer);
drop function store_video(text, text, boolean, timestamptz, boolean, text, text, text, text, text, text, boolean, text[], text[], integer);

create function store_post(
  p_slug text, p_title text, p_description text, p_hidden boolean, p_published_at timestamptz,
  p_lastmod timestamptz, p_share_title text, p_share_description text,
  p_body_markdown text, p_body_html text, p_headings jsonb, p_plain_text text, p_summary text,
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
  select id, audience into v_id, v_audience from entries where kind = 'post' and slug = p_slug;

  if v_id is null then
    insert into entries (kind, slug, title, description, audience, published_at)
    values ('post', p_slug, p_title, p_description, case when p_hidden then 'hidden' else 'everyone' end, p_published_at)
    returning id into v_id;
    insert into posts (entry_id, body_markdown, body_html, headings, plain_text, summary, tags, categories,
                       lastmod, share_title, share_description, render_version)
    values (v_id, p_body_markdown, p_body_html, p_headings, p_plain_text, p_summary, p_tags, p_categories,
            p_lastmod, p_share_title, p_share_description, p_render_version);
    return 'created';
  end if;

  v_new_audience := case
    when p_hidden then 'hidden'
    when v_audience = 'hidden' then 'everyone'
    else v_audience
  end;

  select e.title = p_title and e.description = p_description and e.published_at = p_published_at
         and e.audience = v_new_audience
         and p.body_markdown = p_body_markdown and p.tags = p_tags and p.categories = p_categories
         and p.lastmod is not distinct from p_lastmod
         and p.share_title is not distinct from p_share_title
         and p.share_description is not distinct from p_share_description
         and p.summary = p_summary and p.render_version = p_render_version
    into v_same
    from entries e join posts p on p.entry_id = e.id
   where e.id = v_id;
  if v_same then
    return 'unchanged';
  end if;

  update entries set title = p_title, description = p_description, published_at = p_published_at,
                     audience = v_new_audience
   where id = v_id;
  update posts
     set body_markdown = p_body_markdown, body_html = p_body_html, headings = p_headings,
         plain_text = p_plain_text, summary = p_summary, tags = p_tags, categories = p_categories,
         lastmod = p_lastmod, share_title = p_share_title, share_description = p_share_description,
         render_version = p_render_version
   where entry_id = v_id;
  return 'updated';
end
$$;

create function store_video(
  p_slug text, p_title text, p_description text, p_hidden boolean, p_published_at timestamptz, p_teaser boolean,
  p_description_markdown text, p_description_html text,
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
    insert into videos (entry_id, description_markdown, description_html, members_only_markdown, members_only_html,
                        platform, external_id, paid, duration, tags, categories, render_version)
    values (v_id, p_description_markdown, p_description_html, p_members_only_markdown, p_members_only_html,
            p_platform, p_external_id, p_paid, p_duration, p_tags, p_categories, p_render_version);
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
         members_only_markdown = p_members_only_markdown, members_only_html = p_members_only_html,
         platform = p_platform, external_id = p_external_id, paid = p_paid, duration = p_duration,
         tags = p_tags, categories = p_categories, render_version = p_render_version
   where entry_id = v_id;
  return 'updated';
end
$$;
