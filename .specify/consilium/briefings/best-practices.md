# best-practices briefing

lastActualized: 2026-10-10
sources: local (constitution III; data-model.md; migrations 002-008; tasks T077 T137 T160); postgresql-docs 16

## Normal form and one home

- [2026-10-10] `entries` is the shared part (class-table inheritance): kind-specific rows (posts, videos) hang on it
  with a composite FK (id, kind); this is the pattern already used, and `video_sources` is a third level under videos.
- [2026-10-10] Normalization view: provider and reference are attributes that depend only on the video (1:1), so a split
  is not required by normal form. It is justified by different access rules, different writers (`store_video` vs
  `store_video_source`), a different lifetime (a source changes while content does not) and by a variant (a source is
  either a provider reference or a registered file in `video_files`; one source at a time).
- [2026-10-10] Alternatives on the table: (A) as built: one row per video in `video_sources` for all; (B) public id
  back in `videos`, secrets in `video_sources` (two homes again for "where does this video play from"); (C) columns in
  `videos` for everything, a view or privileges hiding the secret; (D) a single source supertype with the file variant
  expressed in the same table (provider 'file') and `video_files` holding only file facts, or provider references and
  files as two satellites of one `video_source` table.
- [2026-10-10] Coupling to code: T137 adapters are keyed by `provider`; T080/T082 read "the source" for a video through
  the access module; constitution III says shared code never branches on the kind of entry - a source that is either a
  provider row or a file row is a branch the player must make once, in the adapter layer.
- [2026-10-10] Name check: after T160 `video_sources` holds the source of every video; the header of migration 006
  still says "paid lecture's picture" (applied: not editable).
