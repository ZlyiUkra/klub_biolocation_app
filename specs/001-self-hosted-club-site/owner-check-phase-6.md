# Owner check, plan phase 6 (T102): content administration

Run on the owner's own copy of the site, signed in as a maitre or an admin. Tick each line; write what you saw next to
a line that fails. The editors' guide to the same pages is [VIDEOS.md](../../VIDEOS.md).

Before you start: `npm run db:migrate` has been run (migrations 019 and 020), the application was rebuilt
(`npm run build`) and started in your usual way, and `.env` has `VIDEO_ROOT`.

## What is guaranteed, and by what

| Video | Written to the database | Plays | Held by |
| --- | --- | --- | --- |
| YouTube link or id | yes, as the 11-character id | yes, privacy-enhanced embed | `server/test/content-admin.test.ts` (provider matrix), `video-providers.test.ts` |
| VK Video link or embed code | yes, as `owner_id` (and `_hash` for a private one) | yes, `vk.com/video_ext.php` | the same |
| Rutube link or embed code | yes, as the 32-character id (and `?p=` key) | yes, `rutube.ru/play/embed` | the same |
| Vimeo link or embed code | yes, as `id` (and `/hash` when unlisted) | yes, `player.vimeo.com` | the same |
| Odnoklassniki link | yes, as the number | yes, `ok.ru/videoembed` | the same |
| Yandex Disk public link of one file | yes, as `https://disk.yandex.ru/i/<key>` | yes, a direct address asked of Yandex at each play | `video-access.test.ts` (with a stand-in for Yandex) |
| An MP4 file uploaded to the server | yes, a row in `video_files` and the file in the volume | yes, from `/media/video/<slug>` | `content-admin.test.ts` (upload), `check:admin-videos` |

What is **not** accepted, on purpose: an MP4 whose index is at the end (the page gives the `ffmpeg` command that
repairs it), a file that is not MP4 (WebM, MOV and so on: convert first), a Yandex Disk folder link, a text that is no
address of the chosen host (refused at the save with a hint), an SVG picture.

What no test can promise: that the host lets the video be embedded (a private YouTube video, a VK video closed for
embedding, a Vimeo setting that forbids it) or that Yandex has not closed a public link for a while. Section 4 below is
the real-world check of that.

## 1. A post

- [ ] Create a post with a title, a text and an audience "everyone"; save. The page says it is on the site.
- [ ] Open its address in a private window (no session): it is there within 10 seconds.
- [ ] Put `<script>alert(1)</script>` and `<div>x</div>` into the text; save. The page refuses with a reason and the
      text stays in the form.
- [ ] Press the preview: it shows what the site will show.

## 2. Pictures

- [ ] Open "Pictures", upload a PNG or JPEG of under 5 MB. It is put into the text at the cursor.
- [ ] Save; the picture is on the post's page. The same picture uploaded again is not stored twice.
- [ ] Paste `https://` and an address of a picture from the internet into "Or the address of a picture"; it is put
      into the text. An address starting `http://` is refused.
- [ ] In the list, "Copy the address" gives the picture's address.

## 3. Conflict

- [ ] Open one post in two tabs; save in the first, then in the second. The second is told it was changed and keeps
      its text.

## 4. A video from every host (use a real video of yours for each)

For each host: choose it, paste the **address of the video's page** (or the embed code), save, open the video's page
in a private window (audience "everyone", not paid).

- [ ] YouTube
- [ ] VK Video
- [ ] Rutube
- [ ] Vimeo
- [ ] Odnoklassniki
- [ ] Yandex Disk (a public link of one file)

A text that is not an address of the host (say a YouTube link under "Vimeo") must be refused with the hint.

## 5. A paid lecture and a file

- [ ] Create a paid lecture without a source; the form stays open and offers the file and the link.
- [ ] Set a link; reopen the lecture: the same link is in the field, and the host is the one you chose.
- [ ] Upload an MP4 of about 500 MB (index first). The room is shown, the progress runs, the page says the file is
      uploaded and checked. Open the lecture as a member with access: it plays and can be seeked.
- [ ] Upload an MP4 with its index at the end: the page explains it and gives the `ffmpeg` command.
- [ ] Replace the file with a link, then the link with the file: each asks for a confirmation that names what goes.
- [ ] The lecture's link is in no list and in no public page (look at the page source of the lecture).

## 6. Copy, delete, restore

- [ ] "Copy" on a lecture: a draft appears with the same text and source; open it and publish it.
- [ ] Delete a video; it leaves the list and its public address answers 404. "Show deleted" lists it; restore.

## 7. Languages

- [ ] Switch the site to English and back: the posts page, the videos page, the pictures block and the hints read in
      the chosen language; the content does not change.

## 8. The counter

- [ ] Yandex Metrika is still counting: the visit is in the counter's report (counter 113224698).

When every line is ticked, say "T102 passed"; for a failing line, say which one and what you saw.
