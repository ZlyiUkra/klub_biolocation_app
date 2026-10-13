// The one reader of the content tables (tasks T024 and T030 of specs/001-self-hosted-club-site).
//
// Rule (constitution III and IV, research.md section 4): every read of `entries`, `posts` and `videos` goes through
// this module and takes a viewer. An entry the viewer may not see is absent - never "forbidden" - and the decision is
// the SQL function `entry_view` (migration 003); nothing here repeats it. Lists, feeds, the sitemap, term counts and
// the search index are all built from `visibleEntries` below, which is why a future-dated entry, a hidden one or a
// deleted one is absent from every surface at once, and why a number derived from entries (a tag's count, the
// neighbours of an entry) never counts what the viewer cannot see.
//
// Writers are not in this module: saving an entry is the job of the database functions `store_post` and
// `store_video` (migration 005), called by the importer and later by the editors' API; a writer does not read these
// tables to decide what to write. server/test/access-boundary.test.ts fails when any file outside this folder
// selects from them.

import { plainifyMarkdown, summary } from "../../../src/lib/summary.js";
import {
  compareMergedNewestFirst,
  compareNewestFirst,
} from "../../../src/lib/entry-order.js";
// Added 2026-10-10 (T162): the fixed offset that decides which year a date belongs to, and the range of a year.
import {
  FRONT_MATTER_OFFSET_MINUTES,
  yearRange,
} from "../../../src/lib/date.js";
// Added 2026-10-10 (T034): the reading time is the site's rule, computed here from the stored text.
import { readingTime } from "../../../src/lib/reading-time.js";
import type { Pool } from "../db/pool.js";
// Changed 2026-10-10 (T033): the viewer type is shared with the site's middleware, one definition.
import type { Viewer, ViewerStatus } from "../../../src/lib/viewer.js";

export type { Viewer, ViewerStatus };

// The `ViewerStatus` and `Viewer` types were here until T033; they are in src/lib/viewer.ts now.

export type EntryKind = "post" | "video";

export type EntryListItem = {
  kind: EntryKind;
  slug: string;
  title: string;
  /** The front matter description: meta description and share text. */
  description: string;
  publishedAt: Date;
  /** The card text: the stored summary of a post, the rule of src/lib/summary.ts applied to a video's description. */
  summary: string;
  tags: string[];
  categories: string[];
  /** `teaser` when the viewer sees the card but not the content. */
  view: "full" | "teaser";
};

export type PostContent = {
  kind: "post";
  html: string;
  headings: { depth: number; slug: string; text: string }[];
  lastmod: Date | null;
  shareTitle: string | null;
  shareDescription: string | null;
  /** The reading time in minutes, by the site's rule (src/lib/reading-time.ts). */
  readingMinutes: number;
};

export type VideoContent = {
  kind: "video";
  descriptionHtml: string;
  /** Headings of the public text, for the table of contents (T139). */
  headings: { depth: number; slug: string; text: string }[];
  /** The text for members, in its own column; present only when the viewer sees the entry in full. */
  membersOnlyHtml: string | null;
  /**
   * Added 2026-10-11 (T081, FR-026): true when the block above is sent to a viewer who may not play the video, which
   * only the "hidden" setting does; the page keeps it hidden until the player appears. False when the viewer may play
   * (the block is theirs) and when there is no block.
   */
  membersOnlyHidden: boolean;
  // Changed 2026-10-10 (T160): null for a paid lecture. Its provider is part of its secret source, so it is not
  // named either (it used to be a meaningless default).
  platform: string | null;
  /** The embed id; null for a paid lecture, whose file the stream route serves. */
  externalId: string | null;
  paid: boolean;
  duration: string | null;
  /**
   * Added 2026-10-11 (T152): what `lecture_view` (migration 014) says about this viewer and this video, the one
   * decision about who may play it. `open`, `guest`, `no_access`, `blocked` or `expired`.
   */
  lecture: LectureState;
  /** The last UTC day (`YYYY-MM-DD`) the video is available; after it the page stays and the video does not play. */
  availableUntil: string;
};

/** The answers of `lecture_view` that a visible video can have ('none' means no entry, which is a 404 before this). */
export type LectureState =
  "open" | "guest" | "no_access" | "blocked" | "expired";

export type EntryDetail = EntryListItem & {
  /** null for a teaser: the viewer sees the card and none of the content. */
  content: PostContent | VideoContent | null;
};

export type TermCount = {
  kind: "tag" | "category";
  name: string;
  count: number;
};

export type SearchItem = {
  kind: EntryKind;
  slug: string;
  title: string;
  /** Added 2026-10-10 (T035): the rest of what the site's search client shows and filters on. */
  date: Date;
  tags: string[];
  categories: string[];
  summary: string;
  /** Plain text for the index; empty when the viewer sees only a teaser. */
  text: string;
};

type VisibleRow = {
  kind: EntryKind;
  slug: string;
  title: string;
  description: string;
  published_at: Date;
  tags: string[];
  categories: string[];
  view: "full" | "teaser";
  text: string;
  post_summary: string | null;
};

// How much of an entry's text a read needs (T161, 2026-10-10). The plain text of a post is the largest column the
// lists could touch (about 3 kB a post, 90% of what a list request moved at 10 000 posts, measured in T154), and only
// the search index uses it:
// - "none": lists of posts, terms - the card text of a post is its stored summary, so no text is read at all;
// - "videos": the cards of the video list - a video's card text is the site's summary rule applied to its description,
//   which is read for videos only (posts bring an empty string);
// - "all": the search index, which carries the whole plain text of every entry the viewer may see.
type TextNeed = "none" | "videos" | "all";

const textColumn: Record<TextNeed, string> = {
  none: "'' as text,",
  videos: "coalesce(v.description_markdown, '') as text,",
  all: "coalesce(p.plain_text, v.description_markdown, '') as text,",
};

// What narrows a read of the entries the viewer may see (T162 added the last four): a kind, one address, a tag or a
// category by its exact name, and a range of dates (`from` inclusive, `to` exclusive). Every part is optional and they
// combine with "and". The narrowing is done by the database, so a page of a list never reads the rest of the library.
type EntryFilter = {
  kind?: EntryKind;
  slug?: string;
  tag?: string;
  category?: string;
  from?: Date;
  to?: Date;
};

// The decision for the entry aliased `e`, for the viewer in $1 (id) and $2 (status). Added 2026-10-12 (T091): the list
// queries ask the rule in its by-columns form (`entry_view_of`, migration 018) instead of by id, which costs a fetch per
// row; the rule itself is in that SQL function and nowhere here, and this text only hands it its inputs. The two lookups
// are made for a restricted entry only. `entry_view($1, $2, e.id)` is the same answer for one entry by id.
export const viewOfEntry = `entry_view_of(e.audience, e.teaser, e.deleted_at, e.published_at,
                  entry_member($1::bigint, $2::text),
                  case when e.audience = 'restricted' then entry_listed($2::text, e.id) else false end,
                  case when e.audience = 'restricted' then entry_named($1::bigint, $2::text, e.id) else false end)`;

// The "where" parts of a filter, pushing their values onto `params`. One home for both readers below (the rows and the
// years), so a count of a year and the entries of that year cannot be narrowed differently.
function filterClauses(filter: EntryFilter, params: unknown[]): string[] {
  const where: string[] = [];
  const add = (clause: (placeholder: string) => string, value: unknown) => {
    params.push(value);
    where.push(clause(`$${params.length}`));
  };
  if (filter.kind !== undefined) add((p) => `kind = ${p}`, filter.kind);
  if (filter.slug !== undefined) add((p) => `slug = ${p}`, filter.slug);
  // Changed 2026-10-12 (T091): through the GIN indexes of posts and videos (`id` is the entry's), not by testing the
  // merged column of every entry: the same set, found without evaluating the rule for entries that lack the term.
  if (filter.tag !== undefined) {
    add(
      (p) =>
        `id in (select entry_id from posts where tags @> array[${p}]::text[] union all select entry_id from videos where tags @> array[${p}]::text[])`,
      filter.tag,
    );
  }
  if (filter.category !== undefined) {
    add(
      (p) =>
        `id in (select entry_id from posts where categories @> array[${p}]::text[] union all select entry_id from videos where categories @> array[${p}]::text[])`,
      filter.category,
    );
  }
  if (filter.from !== undefined)
    add((p) => `published_at >= ${p}`, filter.from);
  if (filter.to !== undefined) add((p) => `published_at < ${p}`, filter.to);
  return where;
}

// The single query that reads the content tables for lists. The inner select computes the view once per entry; the
// outer one drops what the viewer may not see. `filter` narrows it (above); `text` says how much text is read, and is
// the only part of the query that differs between a list and the search index.
async function visibleEntries(
  pool: Pool,
  viewer: Viewer,
  filter: EntryFilter = {},
  text: TextNeed = "none",
): Promise<VisibleRow[]> {
  const params: unknown[] = [viewer.userId, viewer.status];
  const where = filterClauses(filter, params);
  const result = await pool.query<VisibleRow>(
    `select kind, slug, title, description, published_at, tags, categories, view, text, post_summary
       from (
         select e.id, e.kind, e.slug, e.title, e.description, e.published_at,
                coalesce(p.tags, v.tags, '{}') as tags,
                coalesce(p.categories, v.categories, '{}') as categories,
                ${textColumn[text]}
                p.summary as post_summary,
                ${viewOfEntry} as view
           from entries e
           left join posts p on p.entry_id = e.id
           left join videos v on v.entry_id = e.id
       ) visible
      where view <> 'none'${where.length > 0 ? " and " + where.join(" and ") : ""}`,
    params,
  );
  return result.rows;
}

const toListItem = (row: VisibleRow): EntryListItem => ({
  kind: row.kind,
  slug: row.slug,
  title: row.title,
  description: row.description,
  publishedAt: row.published_at,
  // A post carries the summary it was stored with; a video's card text is the site's summary rule applied to the
  // public part of its description, which is all its description column holds.
  summary: row.post_summary ?? summary(row.text),
  tags: row.tags,
  categories: row.categories,
  view: row.view,
});

const newestFirst = (a: EntryListItem, b: EntryListItem): number =>
  compareNewestFirst(
    { date: a.publishedAt, title: a.title, slug: a.slug },
    { date: b.publishedAt, title: b.title, slug: b.slug },
  );

/** Entries of one kind that the viewer may see, newest first. Lists, feeds and the sitemap are built from this. */
export async function listEntries(
  pool: Pool,
  viewer: Viewer,
  kind: EntryKind,
): Promise<EntryListItem[]> {
  // A post's card text is its stored summary; only the video list reads descriptions (T161).
  return (
    await visibleEntries(
      pool,
      viewer,
      { kind },
      kind === "video" ? "videos" : "none",
    )
  )
    .map(toListItem)
    .sort(newestFirst);
}

/**
 * The entries a list page is cut from (T162): the viewer's visible entries narrowed by kind (both kinds when absent), tag,
 * category and one year, in the order of the site's lists. A year is a calendar year in the site's fixed offset
 * (src/lib/date.ts), the same rule `formatYear` applies on the site. When kinds merge, posts come before videos on an
 * equal instant, which is what the pages did before the database cut the lists.
 */
export async function listEntriesFor(
  pool: Pool,
  viewer: Viewer,
  filter: { kind?: EntryKind; tag?: string; category?: string; year?: number },
): Promise<EntryListItem[]> {
  const { year, ...narrow } = filter;
  const range = year === undefined ? {} : yearRange(year);
  return (
    await visibleEntries(
      pool,
      viewer,
      { ...narrow, ...range },
      narrow.kind === "post" ? "none" : "videos",
    )
  )
    .map(toListItem)
    .sort((a, b) =>
      compareMergedNewestFirst(
        { kind: a.kind, date: a.publishedAt, title: a.title, slug: a.slug },
        { kind: b.kind, date: b.publishedAt, title: b.title, slug: b.slug },
      ),
    );
}

/**
 * The years that have entries the viewer may see, newest first, each with its number of entries, under the same
 * narrowing as listEntriesFor (T162). One grouped query: the database counts, nothing is sent to be counted.
 */
export async function listYears(
  pool: Pool,
  viewer: Viewer,
  filter: { kind?: EntryKind; tag?: string; category?: string },
): Promise<{ year: number; count: number }[]> {
  const params: unknown[] = [
    viewer.userId,
    viewer.status,
    FRONT_MATTER_OFFSET_MINUTES,
  ];
  const where = filterClauses(filter, params);
  const result = await pool.query<{ year: number; count: number }>(
    `select extract(year from published_at at time zone make_interval(mins => $3::int))::int as year,
            count(*)::int as count
       from (
         select e.id, e.kind, e.published_at,
                coalesce(p.tags, v.tags, '{}') as tags,
                coalesce(p.categories, v.categories, '{}') as categories,
                ${viewOfEntry} as view
           from entries e
           left join posts p on p.entry_id = e.id
           left join videos v on v.entry_id = e.id
       ) visible
      where view <> 'none'${where.length > 0 ? " and " + where.join(" and ") : ""}
      group by 1
      order by 1 desc`,
    params,
  );
  return result.rows;
}

/**
 * The newer and the older neighbour of an entry in the viewer's own list of its kind, or null at either end (T162).
 * It reads the entries that share the entry's instant and, when the entry is first or last among them, the group at
 * the nearest instant on that side: a handful of rows, never the whole list. The order inside a group is
 * compareNewestFirst(), the same one every list uses, so the neighbours are exactly what a full list would give.
 * `next` is the newer one, `prev` the older one, the site's names for them.
 */
export async function neighboursOf(
  pool: Pool,
  viewer: Viewer,
  kind: EntryKind,
  slug: string,
): Promise<{ next: EntryListItem | null; prev: EntryListItem | null }> {
  const current = (await visibleEntries(pool, viewer, { kind, slug }))[0];
  if (current === undefined) return { next: null, prev: null };
  const at = current.published_at;
  // Entries that share an instant. The instant is the JavaScript date, a millisecond; the group is [at, at + 1 ms).
  const groupAt = async (instant: Date): Promise<EntryListItem[]> =>
    (
      await visibleEntries(pool, viewer, {
        kind,
        from: instant,
        to: new Date(instant.getTime() + 1),
      })
    )
      .map(toListItem)
      .sort(newestFirst);
  // The nearest instant that has an entry the viewer may see, strictly after the group (`newer`) or before it.
  const nearest = async (side: "newer" | "older"): Promise<Date | null> => {
    const params: unknown[] = [viewer.userId, viewer.status, kind];
    const bound =
      side === "newer" ? new Date(at.getTime() + 1) : new Date(at.getTime());
    params.push(bound);
    const result = await pool.query<{ instant: Date | null }>(
      `select ${side === "newer" ? "min" : "max"}(published_at) as instant
         from (
           select e.kind, e.published_at, ${viewOfEntry} as view
             from entries e
         ) visible
        where view <> 'none' and kind = $3 and published_at ${side === "newer" ? ">=" : "<"} $4`,
      params,
    );
    return result.rows[0]?.instant ?? null;
  };

  const group = await groupAt(at);
  const index = group.findIndex((item) => item.slug === slug);
  let next: EntryListItem | null = null;
  let prev: EntryListItem | null = null;
  if (index > 0) next = group[index - 1] ?? null;
  else {
    const newer = await nearest("newer");
    if (newer !== null) next = (await groupAt(newer)).at(-1) ?? null;
  }
  if (index >= 0 && index < group.length - 1) prev = group[index + 1] ?? null;
  else {
    const older = await nearest("older");
    if (older !== null) prev = (await groupAt(older))[0] ?? null;
  }
  return { next, prev };
}

/** Tags and categories with the number of entries the viewer may see under each; a term with none is absent. */
export async function listTerms(
  pool: Pool,
  viewer: Viewer,
): Promise<TermCount[]> {
  // Counting terms needs names and nothing else (T161).
  const rows = await visibleEntries(pool, viewer, {}, "none");
  const counts = new Map<string, TermCount>();
  for (const row of rows) {
    const terms: [TermCount["kind"], string[]][] = [
      ["tag", row.tags],
      ["category", row.categories],
    ];
    for (const [kind, names] of terms) {
      for (const name of new Set(names)) {
        // `kind` never contains a bar, so the first bar separates the two parts unambiguously.
        const key = `${kind}|${name}`;
        const found = counts.get(key);
        if (found) found.count += 1;
        else counts.set(key, { kind, name, count: 1 });
      }
    }
  }
  return [...counts.values()].sort(
    (a, b) =>
      a.kind.localeCompare(b.kind) ||
      b.count - a.count ||
      a.name.localeCompare(b.name),
  );
}

/** The search index for the viewer: only entries the viewer may see, and only what the view allows. */
export async function searchIndex(
  pool: Pool,
  viewer: Viewer,
): Promise<SearchItem[]> {
  // The one reader of the whole plain text (T161).
  return (await visibleEntries(pool, viewer, {}, "all"))
    .map((row) => ({ item: toListItem(row), text: row.text }))
    .sort((a, b) => newestFirst(a.item, b.item))
    .map(({ item, text }) => ({
      kind: item.kind,
      slug: item.slug,
      title: item.title,
      date: item.publishedAt,
      tags: item.tags,
      categories: item.categories,
      summary: item.summary,
      // A post stores its plain text already; a video stores its description as Markdown, so the site's rule is applied
      // here (src/lib/summary.ts), which is what the build's index did to both.
      text:
        item.view !== "full"
          ? ""
          : item.kind === "video"
            ? plainifyMarkdown(text)
            : text,
    }));
}

type DetailRow = VisibleRow & {
  body_html: string | null;
  body_markdown: string | null;
  headings: PostContent["headings"] | null;
  lastmod: Date | null;
  share_title: string | null;
  share_description: string | null;
  description_html: string | null;
  video_headings: PostContent["headings"] | null;
  members_only_html: string | null;
  members_only_hidden: boolean | null;
  platform: string | null;
  external_id: string | null;
  paid: boolean | null;
  duration: string | null;
  lecture: string | null;
  available_until: string | null;
};

/**
 * One entry by address with its content, or null when it does not exist or the viewer may not see it (the caller
 * answers 404). For a teaser the content is null: the viewer sees the card, never the text.
 */
export async function getEntry(
  pool: Pool,
  viewer: Viewer,
  kind: EntryKind,
  slug: string,
): Promise<EntryDetail | null> {
  const result = await pool.query<DetailRow>(
    `select * from (
       select e.kind, e.slug, e.title, e.description, e.published_at,
              coalesce(p.tags, v.tags, '{}') as tags,
              coalesce(p.categories, v.categories, '{}') as categories,
              coalesce(p.plain_text, v.description_markdown, '') as text,
              p.summary as post_summary,
              p.body_html, p.body_markdown, p.headings, p.lastmod, p.share_title, p.share_description,
              v.description_html, v.headings as video_headings, v.paid, v.duration,
              -- Added 2026-10-11 (T081, FR-026): the members-only block goes to a viewer for whom the lecture is open,
              -- and under the "hidden" setting to everybody, marked hidden; under "locked" (the default, and what any
              -- value but "hidden" means) it goes to nobody else, so the text is not in what the browser received. The
              -- setting is read from the settings table here and nowhere else (research.md section 10).
              case when v.members_only_html is null then null
                   when l.lecture = 'open' then v.members_only_html
                   when (select value #>> '{}' from settings where key = 'members_block_mode') = 'hidden'
                        then v.members_only_html
                   else null end as members_only_html,
              (v.members_only_html is not null and l.lecture is distinct from 'open') as members_only_hidden,
              -- Changed 2026-10-10 (T160): the source of a video is one row of video_sources. A public video's is its embed
              -- id and is shown; a paid video's is a secret and is masked here, so the value never leaves the database.
              -- Changed 2026-10-11 (T152): a video whose own period has ended is masked too, so the answer carries no
              -- source for a viewer who may not play it; the page says the period has ended instead.
              case when v.paid or l.lecture = 'expired' then null else s.provider end as platform,
              case when v.paid or l.lecture = 'expired' then null else s.reference end as external_id,
              l.lecture, to_char(v.available_until, 'YYYY-MM-DD') as available_until,
              entry_view($1::bigint, $2::text, e.id) as view
         from entries e
         left join posts p on p.entry_id = e.id
         left join videos v on v.entry_id = e.id
         left join video_sources s on s.entry_id = e.id
         left join lateral (select case when v.entry_id is null then null
                                        else lecture_view($1::bigint, e.id) end as lecture) l on true
        where e.kind = $3 and e.slug = $4
     ) one
     where view <> 'none'`,
    [viewer.userId, viewer.status, kind, slug],
  );
  const row = result.rows[0];
  if (!row) return null;

  const item = toListItem(row);
  if (row.view !== "full") return { ...item, content: null };
  if (row.kind === "post") {
    return {
      ...item,
      content: {
        kind: "post",
        html: row.body_html ?? "",
        headings: row.headings ?? [],
        lastmod: row.lastmod,
        shareTitle: row.share_title,
        shareDescription: row.share_description,
        readingMinutes: readingTime(row.body_markdown ?? ""),
      },
    };
  }
  return {
    ...item,
    content: {
      kind: "video",
      descriptionHtml: row.description_html ?? "",
      headings: row.video_headings ?? [],
      membersOnlyHtml: row.members_only_html,
      membersOnlyHidden:
        row.members_only_html !== null && row.members_only_hidden === true,
      platform: row.platform,
      externalId: row.external_id,
      paid: row.paid ?? false,
      duration: row.duration,
      lecture: (row.lecture as LectureState | null) ?? "guest",
      availableUntil: row.available_until ?? "",
    },
  };
}

/**
 * A string that changes whenever what any viewer could see may have changed: a write to an entry, its post or video
 * row or its audience (the counter of migration 017, bumped by triggers so no write path can forget it), or a date
 * that passed so that an entry became visible (the count of visible entries, which needs no write). The caches of the
 * guest index, the terms and the years, and the ETags of the feeds, are keyed on it.
 *
 * Changed 2026-10-12 (T089): it was derived from `entries.updated_at`, which a change of an entry's audience tables did
 * not move.
 */
export async function contentVersion(pool: Pool): Promise<string> {
  const result = await pool.query<{ version: string }>(
    `select (select counter from content_version)::text || ':' ||
            (count(*) filter (where published_at <= now() and deleted_at is null))::text as version
       from entries`,
  );
  return result.rows[0]?.version ?? "";
}

/**
 * Added 2026-10-11 (T137): what the source route needs about one video for one viewer - the answer of the lecture
 * rule and the stored source. The source is a secret for a paid lecture: this is the only function that selects it
 * for a viewer, and the caller applies `lecture` before it uses `provider` and `reference`. null when there is no
 * such video.
 */
export async function getVideoSource(
  pool: Pool,
  viewer: Viewer,
  slug: string,
): Promise<{
  lecture: string;
  provider: string | null;
  reference: string | null;
  /** Added 2026-10-11 (T080): the video is a file on the server's volume (the stream route plays it). */
  hasFile: boolean;
} | null> {
  const result = await pool.query<{
    lecture: string;
    provider: string | null;
    reference: string | null;
    has_file: boolean;
  }>(
    `select lecture_view($1::bigint, e.id) as lecture, s.provider, s.reference,
            exists (select 1 from video_files f where f.entry_id = e.id) as has_file
       from entries e
       join videos v on v.entry_id = e.id
       left join video_sources s on s.entry_id = e.id
      where e.kind = 'video' and e.slug = $2`,
    [viewer.userId, slug],
  );
  const row = result.rows[0];
  return row === undefined
    ? null
    : {
        lecture: row.lecture,
        provider: row.provider,
        reference: row.reference,
        hasFile: row.has_file,
      };
}
