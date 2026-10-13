# performance briefing

lastActualized: 2026-10-10
sources: local (REWRITE.md T154 measurements; access/entries.ts queries; scripts/stress-site.mjs); postgresql-docs 16

## Where the cost is

- [2026-10-10] Measured 2026-10-10 on a throwaway database: list/term/feed/sitemap/search requests read every
  published row and a page costs 35 ms at 1 000 entries and 300 ms at 10 000, because the site cuts years and pages
  itself (T161 and T162 will fix this). None of those paths needs a video's source.
- [2026-10-10] The only reader of the source is the video's page (one row by entry id: a primary key lookup, one extra
  index probe on `video_sources_pkey`) and the stream route. The planned adapters make an outbound request (8 s limit)
  after the membership check, which dwarfs any table choice.
- [2026-10-10] Row width: a `videos` row carries description html and markdown and the members-only html and markdown
  (TOAST moves them out of line above ~2 kB); two small columns (provider, reference <= 500 chars) change nothing
  measurable.
- [2026-10-10] Counts: 21 videos, 3 paid; expected hundreds. Table-structure choices are not on any hot path here;
  list queries are, and they are the subject of T161/T162, not of this consilium.
