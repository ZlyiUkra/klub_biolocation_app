-- The dates of the paid lectures' access (T152 of specs/001-self-hosted-club-site; design-member-until.md sections 9 to
-- 11, the owner's rules of 2026-10-11; plan phase 4).
--
-- Two clocks. A PERSON's date (`users.access_until`) is the one clock of their right to the paid lectures: an account is
-- let in while the date has not passed (the last day included, UTC), and a metr or an admin is never limited by it. A
-- VIDEO's date (`videos.available_until`) says how long the video is available on the site: after it the page stays
-- and the video does not play for anybody but the editors.
--
-- Existing data: nothing is lost and nobody who could watch is shut out. Every account that holds a status that opens
-- the lectures gets today plus 100 years (the owner's default, the same as an account gets when a status makes it a
-- user), and every video gets the same, so the first day after this migration behaves as the day before it. A guest
-- has no date and so no access; the old paying guests (`member`, `memberUntil` of the previous provider) come with the
-- members file of T055 (an optional `memberUntil`), which is not run yet.
--
-- Decisions that would otherwise look like mistakes:
-- - `lecture_view` is the one home of "may this viewer play this video" (constitution III and IV), written like
--   `entry_view` and called by the access module only. It asks `entry_view` first, so a video the viewer cannot see
--   at all is 'none' here too. It reads the ACCOUNT's row for the status and the date, not what a session remembers:
--   a block or a changed date acts at once.
-- - The answer is one of 'open', 'guest', 'no_access', 'blocked', 'expired', 'none'. 'expired' is the video's own
--   period, decided before the viewer's rights, because nobody but an editor can play it then, and a guest looking at
--   an ended video should be told it has ended and not that they must sign in. 'blocked' comes before the date, as in
--   the old rule, so a blocked member with a date in the future is refused.
-- - A free video (`paid` false) is open to everybody, a blocked account included (a blocked account is a guest for
--   everything public), until its own period ends.
-- - The 100 years is repeated here as an interval because a SQL default cannot read the TypeScript constant;
--   `src/lib/lecture-rules.ts` is the home and a test pins the two together.
-- - `store_video` gains a last parameter `p_available_until` with a null default: null on a new video leaves the column
--   default (100 years), null on an existing one leaves the value alone, a date sets it. The old signature is dropped
--   first, because with a default the two would be ambiguous for the callers that pass eighteen values.

alter table users
  add column access_until date;

comment on column users.access_until is
  'The last UTC day the account may open the paid lectures; null when none. A metr or an admin is never limited by it.';

update users
   set access_until = ((now() at time zone 'utc')::date + interval '100 years')::date
 where status in ('student', 'expert', 'master', 'metr', 'admin');

alter table videos
  add column available_until date not null
    default (((now() at time zone 'utc')::date + interval '100 years')::date);

comment on column videos.available_until is
  'The last UTC day the video is available on the site; after it the page stays and the video does not play for non-editors.';

create function lecture_view(viewer_id bigint, entry_id bigint)
  returns text
  language sql
  stable
as $$
  select case
           when v.entry_id is null then 'none'
           when entry_view($1, null::text, $2) = 'none' then 'none'
           when v.available_until < (now() at time zone 'utc')::date
                and not coalesce(u.status in ('metr', 'admin'), false) then 'expired'
           when not v.paid then 'open'
           when u.id is null then 'guest'
           when u.status = 'blocked' then 'blocked'
           when u.status in ('metr', 'admin') then 'open'
           when u.access_until is not null
                and u.access_until >= (now() at time zone 'utc')::date then 'open'
           else 'no_access'
         end
    from (select 1) one
    left join videos v on v.entry_id = $2
    left join users u on u.id = $1
$$;

comment on function lecture_view(bigint, bigint) is
  'open | guest | no_access | blocked | expired | none for (viewer, video); the one home of the lecture access rule';

drop function store_video(
  text, text, text, boolean, timestamptz, boolean, text, text, jsonb, text, text, text, text, boolean, text,
  text[], text[], integer);

create function store_video(
  p_slug text, p_title text, p_description text, p_hidden boolean, p_published_at timestamptz, p_teaser boolean,
  p_description_markdown text, p_description_html text, p_headings jsonb,
  p_members_only_markdown text, p_members_only_html text,
  p_platform text, p_external_id text, p_paid boolean, p_duration text,
  p_tags text[], p_categories text[], p_render_version integer,
  p_available_until date default null
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
    if p_available_until is not null then
      update videos set available_until = p_available_until where entry_id = v_id;
    end if;
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
         and (p_available_until is null or v.available_until = p_available_until)
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
         tags = p_tags, categories = p_categories, render_version = p_render_version,
         available_until = coalesce(p_available_until, available_until)
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
