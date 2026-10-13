-- The pictures an editor uploads for posts and for the members-only blocks of lectures (T143 of
-- specs/001-self-hosted-club-site, added 2026-10-12 at the owner's word: an editor without git must be able to add a
-- picture, and a link to a picture elsewhere on the internet is allowed too, which needs no table).
--
-- The file lives on the video volume under `images/<sha256>.<ext>` and is served at `/images/u/<sha256>.<ext>`. The name
-- is the SHA-256 of the bytes, so the same picture uploaded twice is one file and one row, and an address never
-- changes or points at something else. This table keeps what the list of the panel shows: the name the editor's file
-- had (text only, never a path), its size, who uploaded it and when.
--
-- Nothing deletes a row or a file (the owner's rule: bytes are removed by the owner, never by a save).
--
-- The number of this migration is provisional until it is applied on the owner's database.

create table images (
  hash          text primary key check (hash ~ '^[0-9a-f]{64}$'),
  ext           text        not null check (ext in ('png', 'jpg', 'webp', 'gif')),
  original_name text        not null default '' check (length(original_name) <= 100),
  size_bytes    integer     not null check (size_bytes > 0),
  uploaded_by   bigint      references users (id),
  uploaded_at   timestamptz not null default clock_timestamp()
);

create index images_uploaded_at_idx on images (uploaded_at desc, hash);
