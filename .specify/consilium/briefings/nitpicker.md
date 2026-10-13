# nitpicker briefing

lastActualized: 2026-10-10
sources: local (CLAUDE.md of the project; constitution 1.0.1; migrations 006-008; REWRITE.md); see _common-facts.md

## What to hold the proposal to

- [2026-10-10] CLAUDE.md: every change carries an English comment saying why; applied migrations are never edited
  (006 still says "video_files (migration 009)", now 011; 007 and 008 replace store_video); names must say what they
  are: `video_sources` now holds public ids too, so is the name still right?
- [2026-10-10] Wording that was imprecise and was fixed: "paid has no external id" was a table constraint, now a
  structural fact; `platform` for a paid lecture is null on the wire (was "youtube"); `provider` vs `platform` are two
  words for one thing across the API (`platform`) and the table (`provider`).
- [2026-10-10] `file` was dropped from the importer's platform list in T160; a file source is not a provider value but
  a `video_files` row: check that no text, test or comment still treats `file` as a provider.
- [2026-10-10] Loose ends to look for: data-model.md, tasks.md and test comments agree on the column list; the
  `reference` length 500 and the `provider` check list live in migration 006 only; tests insert videos only through
  a CTE now (a public video without a source is refused at commit).
