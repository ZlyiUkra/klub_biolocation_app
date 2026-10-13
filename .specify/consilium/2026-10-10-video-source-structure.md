---
consilium: 2026-10-10
topic: Where the source of a video lives in the database - a second table for the source, or columns of the video's own table
slug: video-source-structure
verdict: approved-with-conditions
route: direct-verified
archetypes:
  nitpicker: ok
  security: ok
  performance: ok
  best-practices: ok
  pragmatist: ok
---

# Where the source of a video lives

## Agreed proposal

Every video keeps its text, tags and paid flag in one table and its source - where the picture comes from, a provider
and a reference - in a second table with one row per video. The split stays. The text of a video is what everyone
reads and what every list touches; the source is the one thing that is secret for a paid lecture, is written by its own
function, changes over the life of a video (a hosted video, then a file on the club's server) and is read by one place.
Two small rules are added so that a video which changes between public and paid cannot keep a source it should not
have: flipping a public video to paid removes its old public source until the real secret is written, and the database
itself refuses a public video whose provider has no public embed id.

## Bounds and constraints

- In scope: migration 009 (the flip rule and the provider rule), tests for both directions, one paragraph and a
  glossary in data-model.md, text fixes in tasks T079 and T137, a task for a separate database role.
- Out of scope: renaming columns or function parameters, the file variant (decided at T077), one list of providers for
  the TypeScript side (a note at T137 until then).

## Surviving remarks

- [confirmed] A video flipped from public to paid kept its public embed id as its source row (nitpicker, security,
  pragmatist; migration 008, store_video).
- [confirmed] The provider allowed for a public video was enforced only by store_video; a hand-made write was not
  stopped (security; the interrogation downgraded it from HIGH to LOW-MEDIUM: no attacker, a trap for a future writer).
- [confirmed] The set of public providers is written in four places (migration 006 CHECK, migration 008 store_video,
  the importer's platform list, the TypeScript type of video-sources.ts) (nitpicker).
- [confirmed] T137 listed `file` as a provider while the schema says it is not; T079 spoke of a column that is gone
  (best-practices, nitpicker).
- [confirmed] One database role connects, and in development it is a superuser: column privileges, views and row-level
  security would separate nothing; a second role is the real privilege separation and is wider than videos (security,
  best-practices).

## Flagged by the interrogator

- [weak] `file` as a provider in video_sources (the "D-lite" of best-practices): its reference would be filler like
  the old default platform; the archetype withdrew it - decision of the user: deferred to T077.
- [weak] "paid to public leaves a yandex-disk row" (nitpicker): withdrawn, store_video overwrites it in the same call.
- [weak] Severity HIGH on the paid-to-public path (security): downgraded, no writer other than store_video exists.

## Amendment, the same day, by the owner

The second rule above (a public video's provider must be youtube, vk or rutube) was wrong: a public video may be
hosted on Yandex Disk too, and the places a video can come from may grow (Vimeo and others). It was taken back by
migration 010: the providers are rows of a table `video_providers`, the two constraint triggers of migration 009 are
removed, and the only rule kept from 009 is that a public video flipped to paid loses its old source row. The council
had treated "public" as "an embed id"; it is "a source that needs no secret", whatever the provider.

## Deliberately not done

- Columns back in videos for public videos (option B): two homes for one fact again.
- Column privileges, a view or row-level security over one table (option C): one connecting role, so nothing is
  separated, and one careless select * leaks.
- Renaming provider/platform and reference/externalId: applied function signatures cannot change; a glossary instead.

## Execution route

- Council recommendation: direct-verified - a small migration, two behaviours to prove by running.
- User decision: confirmed on 2026-10-10 (structure kept, route direct-verified, a note at T137 for the provider list,
  a task for the separate database role).
- Verification list: a public video flipped to paid has no source row; the real secret can then be written; a paid video
  flipped to public without an embed id is refused and with one gets it as its row; a hand-made flag flip or provider
  change that would give a public video a yandex-disk source is refused by the database; 120 server tests; 149 pages
  byte for byte; import:content unchanged; check:bundles.
