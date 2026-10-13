-- Vimeo as a place a video can come from (added 2026-10-10 at the owner's word, after migration 010 made the providers
-- rows of a table: a new provider is one row and one adapter file, task T137).
--
-- Only the row is added here. A provider with no adapter cannot play: the table says the place exists, the adapter of
-- T137 says how to turn a reference into something a browser can play. For Vimeo the reference is the video's numeric
-- id; a private (unlisted) video also needs the hash of its address, which the adapter will take from the reference
-- when it is written ("<id>/<hash>"), so no column changes when that happens.

insert into video_providers (code, label) values ('vimeo', 'Vimeo')
on conflict (code) do nothing;
