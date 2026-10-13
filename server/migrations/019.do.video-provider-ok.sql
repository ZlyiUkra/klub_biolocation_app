-- Odnoklassniki (ok.ru) as a place a video can come from (added 2026-10-12, T175, at the owner's word: the club posts
-- on VK, Rutube, YouTube, Yandex Disk and Odnoklassniki). Like Vimeo in migration 011 it is one row; the adapter that
-- plays it is server/src/video/providers/ok.ts, and the reference is the number in the video's address.
--
-- The number of this migration is provisional until it is applied on the owner's database.

insert into video_providers (code, label) values ('ok', 'Odnoklassniki')
on conflict (code) do nothing;
