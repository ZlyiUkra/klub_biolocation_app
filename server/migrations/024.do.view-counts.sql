-- The site's own visit counter (T190 of specs/001-self-hosted-club-site; FR-048, FR-037; tests: server/test/views.test.ts).
-- The owner's word of 2026-11-09: the site uses no outside service that counts. The outside counter the old site loaded
-- (Busuanzi) is removed from every page and this is what replaces it: one number for the whole site and one for every post
-- and video, each raised by one on every load of a page, as the outside counter did.
--
-- Existing data: none to move. The numbers of the outside counter lived at its service and are not carried over (the
-- owner's word, 2026-11-09: the new counter starts at zero), so the one site row is seeded with 0 below and an entry has
-- no row until its first counted load.
--
-- Decisions that would otherwise look like mistakes:
-- - Counts only. No row says who loaded a page, from where or when: a counter that stores a visitor's address or
--   browser would be a second kind of record about people, which the rewrite does not keep (constitution IV).
-- - Two small tables and not a column on `entries`: an UPDATE of `entries` is what the content triggers watch, and a
--   counter raised on every page load would make the site think every entry changed.
-- - `site_views` has one row by construction: its key is the boolean `true` and a check forbids `false`, so a second row
--   cannot exist and the counter is raised by one UPDATE of that row, with no INSERT race at the very first load.
-- - `entry_views` has a row from an entry's first counted load, created by `INSERT ... ON CONFLICT DO UPDATE`, which
--   PostgreSQL documents as an atomic insert-or-update that holds under high concurrency (INSERT, "ON CONFLICT Clause").
--   Two loads at the same instant cannot lose one: each adds one to the value the other left.
-- - The key of `entry_views` references `entries (id)` and nothing cascades: an entry is never deleted by the
--   application (migration 002), so a stray DELETE of an entry must fail and not take its count with it.

create table site_views (
  id    boolean primary key default true check (id),
  views bigint  not null default 0 check (views >= 0)
);

insert into site_views (id, views) values (true, 0);

create table entry_views (
  entry_id bigint primary key references entries (id),
  views    bigint not null check (views > 0)
);

comment on table site_views is 'The one row of the site''s total page loads, raised by one on every counted load (T190)';
comment on table entry_views is 'Page loads of one post or video, a row from its first counted load (T190)';
