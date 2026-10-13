# Report for T165: video bytes in the database itself

Written 2026-10-12 at the owner's request ("decision first, build later"). Nothing was built or kept: the measurement was
a throwaway script on a throwaway database that was dropped, on the development machine (PostgreSQL 16 in Docker, 288 GB
of disk free). This file records what it showed so the decision can be taken once and not re-measured.

## The answers to the five questions of the task

1. **Where the bytes would live.** In PostgreSQL's data volume, which is on the same disk as the video volume. It saves
   no space. The disk rule of T138 (reserve, size cap) applies unchanged, and the database and its backups would no
   longer be separable from the files.
2. **How.** A row `database` in `video_providers` (migration 010) whose reference is the id of a large object; one
   adapter file (T137); no existing row changes. A large object holds up to 4 TB and can be read by offset (`lo_get`,
   `lo_put`), so a player can seek. A `bytea` column tops out at 1 GB and is read whole, so it is not an option for a
   lecture.
3. **Constitution IV** says video bytes never pass through Node and nginx serves the file after the session check. With
   the bytes in the database every byte of every play would pass through Node and a pooled connection. The route of T080
   would have to read range by range (a connection held for the whole play would starve the pool), and nginx could not
   use `X-Accel-Redirect` at all.
4. **Backups.** `pg_dump` would carry the lectures, so every backup (T120) would be as large as the library, and a
   restore of the database would be a restore of the video library.
5. **Measurement** (a 500 MB large object, 1 MB chunks, one machine, database in Docker on the same host):

| What                                      | Large object in PostgreSQL | Plain file on the volume      |
| ----------------------------------------- | -------------------------- | ----------------------------- |
| Size on disk for 500 MB of video          | 678 MB (+36%)              | 500 MB                        |
| Write 500 MB                              | 9.3 s (54 MB/s)            | not measured (a copy)         |
| First 64 KB, median                       | 1.8 ms                     | 0.06 ms                       |
| Seek to a random offset, median (max)     | 2.1 ms (3.3 ms)            | 0.06 ms                       |
| One sequential stream                     | 52 MB/s                    | disk and cache speed, no Node |
| Five parallel streams, total (per stream) | 71 MB/s (about 14 MB/s)    | served by nginx, none in Node |
| Node memory while streaming (peak RSS)    | 118 to 127 MB              | not in Node at all            |

## What this means

- It works and it is fast enough for a lecture. A two-hour lecture of 478 MB plays at about 0.5 MB/s, so 14 MB/s per
  stream is more than enough, and a seek costs 2 ms. Speed is not the reason to refuse.
- The reasons to refuse are the other ones: 36% more disk for the same video, backups and restores that grow with the
  library, every byte through Node and the pool, and a conflict with the constitution's rule that Node never carries
  video bytes.

## Recommendation, and the alternative

- **Recommended: do not build it.** Files on the volume (T077 to T080, done) stay the one way for the club's own
  files; the big lectures stay with their host (Yandex Disk adapter, done). The database is not a place for video.
- **Alternative, only if no volume can exist** (a hosting that gives a database and nothing else): build the adapter and
  the large-object reader of point 2, accept points 3 and 4, and raise the pool size for streaming. About a day of
  work, and a changed constitution rule, which is the owner's to change.
