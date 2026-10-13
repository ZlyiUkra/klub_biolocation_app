-- The writers of the content tables (T028 of specs/001-self-hosted-club-site).
--
-- store_post and store_video create or update one entry together with its posts or videos row and say what they did:
-- 'created', 'updated' or 'unchanged'. They exist so that the code that saves content never has to read the content
-- tables to decide what to write - only server/src/access/ selects from them (constitution III, the boundary test of
-- T024). The import of today's files (server/src/cli/import-content.ts) calls them now; the editors' API of plan
-- phase 6 will call the same functions, so there is one place that knows how an entry is stored.
--
-- What a re-import may and may not change, because the owner's decisions made in the panel later must not be undone
-- by a file:
-- - It updates the content: title, date, body, tags, categories, the rendered output and its version stamp.
-- - It sets `audience` and `teaser` when the entry is created, and afterwards only moves between `hidden` and
--   `everyone` when the source's `draft` flag moved (p_hidden). Any other audience an editor has chosen is kept.
-- - Nothing is ever deleted: a file that disappears leaves its entry where it is.
-- 'unchanged' means no row was written at all, so the save token (`updated_at`) stays where it was.

create function store_post(
  p_slug text, p_title text, p_hidden boolean, p_published_at timestamptz,
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
    insert into entries (kind, slug, title, audience, published_at)
    values ('post', p_slug, p_title, case when p_hidden then 'hidden' else 'everyone' end, p_published_at)
    returning id into v_id;
    insert into posts (entry_id, body_markdown, body_html, headings, plain_text, summary, tags, categories, render_version)
    values (v_id, p_body_markdown, p_body_html, p_headings, p_plain_text, p_summary, p_tags, p_categories, p_render_version);
    return 'created';
  end if;

  v_new_audience := case
    when p_hidden then 'hidden'
    when v_audience = 'hidden' then 'everyone'
    else v_audience
  end;

  select e.title = p_title and e.published_at = p_published_at and e.audience = v_new_audience
         and p.body_markdown = p_body_markdown and p.tags = p_tags and p.categories = p_categories
         and p.render_version = p_render_version
    into v_same
    from entries e join posts p on p.entry_id = e.id
   where e.id = v_id;
  if v_same then
    return 'unchanged';
  end if;

  update entries set title = p_title, published_at = p_published_at, audience = v_new_audience where id = v_id;
  update posts
     set body_markdown = p_body_markdown, body_html = p_body_html, headings = p_headings,
         plain_text = p_plain_text, summary = p_summary, tags = p_tags, categories = p_categories,
         render_version = p_render_version
   where entry_id = v_id;
  return 'updated';
end
$$;

create function store_video(
  p_slug text, p_title text, p_hidden boolean, p_published_at timestamptz, p_teaser boolean,
  p_description_markdown text, p_description_html text,
  p_members_only_markdown text, p_members_only_html text,
  p_platform text, p_external_id text, p_paid boolean,
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
    insert into entries (kind, slug, title, audience, teaser, published_at)
    values ('video', p_slug, p_title, case when p_hidden then 'hidden' else 'everyone' end, p_teaser, p_published_at)
    returning id into v_id;
    insert into videos (entry_id, description_markdown, description_html, members_only_markdown, members_only_html,
                        platform, external_id, paid, tags, categories, render_version)
    values (v_id, p_description_markdown, p_description_html, p_members_only_markdown, p_members_only_html,
            p_platform, p_external_id, p_paid, p_tags, p_categories, p_render_version);
    return 'created';
  end if;

  v_new_audience := case
    when p_hidden then 'hidden'
    when v_audience = 'hidden' then 'everyone'
    else v_audience
  end;

  select e.title = p_title and e.published_at = p_published_at and e.audience = v_new_audience
         and v.description_markdown = p_description_markdown
         and v.members_only_markdown is not distinct from p_members_only_markdown
         and v.platform = p_platform and v.external_id is not distinct from p_external_id
         and v.paid = p_paid and v.tags = p_tags and v.categories = p_categories
         and v.render_version = p_render_version
    into v_same
    from entries e join videos v on v.entry_id = e.id
   where e.id = v_id;
  if v_same then
    return 'unchanged';
  end if;

  update entries set title = p_title, published_at = p_published_at, audience = v_new_audience where id = v_id;
  update videos
     set description_markdown = p_description_markdown, description_html = p_description_html,
         members_only_markdown = p_members_only_markdown, members_only_html = p_members_only_html,
         platform = p_platform, external_id = p_external_id, paid = p_paid,
         tags = p_tags, categories = p_categories, render_version = p_render_version
   where entry_id = v_id;
  return 'updated';
end
$$;
