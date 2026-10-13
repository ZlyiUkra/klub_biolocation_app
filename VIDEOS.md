# Videos: how to add, change, copy and delete them

For the editors of the club's site (the statuses maitre and admin). The page is `/admin/videos/`, reached from the
account page ("Videos" in the management menu). Everything below is done on that page; nothing needs a developer.

## 1. What a video is here

A video is a page of the site (title, description, tags, who may see it) plus **one source**: where the picture comes
from. The source is either a **link** to a video that lives on another host, or a **file** uploaded to the club's own
server. A video has one source at a time.

- A **free** video needs its link when it is created. Everyone it is open to (see "Who sees it") can watch.
- A **paid lecture** may be created without a source and get it later. Only signed-in members who have access see the
  player; the page's text is public unless its audience says otherwise.
- The saved link or identifier is shown in the form, to read and to change. It is shown only to editors, never in a
  list, a public page or an answer for visitors.

## 2. Adding a video from another host

Pick the host in "Where the video is", then paste **the address of the video's page** (or the embed code) into the
field below it. The page shows an example and a hint for the chosen host. The server reduces what you paste to the
bare identifier and refuses it with a message if it does not look like a video of that host, so a video that cannot
play is not saved.

| Host | Paste | Notes |
| --- | --- | --- |
| YouTube | the address from the browser bar, a `youtu.be` link, an embed code, or the 11-character id | Played through the privacy-enhanced host. A video the owner of the channel has made private or non-embeddable will not play. |
| VK Video | the video page address (`vk.com/video-123_456` or `vkvideo.ru/...`), or the whole embed code | For a private or link-only video use Share, then Export, and paste the embed code: it carries the `hash` that is needed. |
| Rutube | the video page address, or the embed code | A private video's address ends in `?p=...`: paste it whole. |
| Vimeo | `vimeo.com/<number>`, or with the code after the number for an unlisted video, or the embed code | The video's privacy setting must allow embedding on other sites. |
| Odnoklassniki (ok.ru) | `ok.ru/video/<number>` | The video must open without signing in. |
| Yandex Disk | the public link of **one file**, `disk.yandex.ru/i/...` (or `yadi.sk/i/...`) | Share the file, "Access by link", copy the link. A folder link is refused. See "Yandex Disk" below. |

To change the source of a saved video: change the host and the field, press "Set the link". It acts at once; you do not
have to press the form's own Save for it.

### Yandex Disk

Yandex Disk is a file store, not a video host. The site asks Yandex for a short-lived direct address each time a
member presses play, so:

- Yandex limits how much a public file may be downloaded; when the limit is reached the video says it is unavailable
  until Yandex reopens it.
- The public link is the key to the file: anyone who has it can download the file from Yandex. For a paid lecture keep
  it only in this form.
- The file should be an MP4 with its index at the start (see section 3) or it starts slowly.

## 3. Uploading a file to the club's own server

Open the video, find "A file on the server", choose the file and press "Upload". The page shows how much room the
server has and refuses at once a file that would not fit.

Requirements, in the order the page checks them:

1. **MP4.** Other formats are refused: convert first (for example with `ffmpeg -i in.mov -c:v libx264 -c:a aac out.mp4`).
2. **The index at the start of the file ("faststart").** Otherwise the video cannot begin to play until it has been
   downloaded whole. The server checks this and, if it is wrong, tells you the repair command:

   `ffmpeg -i in.mp4 -c copy -movflags +faststart out.mp4`

   It copies the streams without re-encoding, so it takes seconds, and the picture is not touched.
3. **Size.** The cap is 500 MB by default and is set by `VIDEO_UPLOAD_CAP_MB` in the server's `.env`. The server also
   keeps a reserve of free disk (`VIDEO_FREE_RESERVE_MB`, 2048 by default) and refuses an upload that would eat it.
   The web server in front (nginx) must allow the same size: its `client_max_body_size` must be at least the cap.
4. **Time.** A large file takes as long as your connection needs; the page shows a progress bar. Do not close the
   tab until it says the file is uploaded and checked.

Replacing: a file can replace a link and a link can replace a file. The page asks to confirm and says what goes. The
old link row is deleted; the bytes of an old file stay on the server's disk (they are never deleted by the page).

Where the files live is the server's video volume; that folder is part of the backup.

## 4. Who sees it

"Who sees the video" is the audience:

- **Everyone**: every visitor.
- **Signed-in members**: any signed-in account that is not blocked.
- **Chosen**: only the statuses you tick and the people you name (find them by name or e-mail). "Show a teaser" lets
  everyone else see the title and description but not the player.
- **Draft** (the checkbox): hidden from everyone but editors until you clear it.

"Paid" is separate: a paid lecture's player is for members whose status opens lectures. "Available until" ends the
period of the video: the page stays, the video stops playing.

## 5. Changing, copying, deleting

- **Edit**: open it from the list, change, Save. If someone else saved in the meantime the page tells you and keeps
  your text.
- **Copy**: the "Copy" button in the list makes a new **draft** with the same text, tags, audience, link or file. The
  copy of a file points at the same bytes. Open it, change the title and the address, clear "Draft".
- **Delete**: puts it away (the address stays taken); "Show deleted" lists it and "Restore" brings it back.

## 6. If a video does not play

1. Open the video's own page on the host in a private window: if it does not play there, it will not play here.
2. Check the privacy setting of the video at the host (embedding allowed? unlisted instead of private?).
3. For Yandex Disk, open the public link: Yandex may have closed it for a while.
4. For an uploaded file, run the faststart command above and upload again.

## 7. Pictures in the text

The post form and the lecture form have a "Pictures" block under the text (open it by pressing its title).

- **Upload**: choose a PNG, JPEG, WebP or GIF of up to 5 MB (`IMAGE_UPLOAD_CAP_MB` in `.env` changes the limit),
  press "Upload the picture". It is put into the text where the cursor was, as `![name](address)`; change the name
  between the brackets to describe the picture. A lecture's form puts it into the text area you were last in, the
  description or the members-only block.
- **From the internet**: paste an address that starts with `https://` and press "Insert by address". The picture stays
  on the other site: if it is removed there, it disappears from your text, so uploading is safer.
- **The list**: every uploaded picture, newest first, with "Put into the text" and "Copy the address". Pictures are
  not deleted from the page. The same file uploaded twice is one picture.
- An SVG is refused (it can carry a script), and so is a file whose content is not the picture type it claims.
- The pictures live in the `images/` folder of the video volume and obey the same free-space reserve as the video
  files; the volume is part of the backup.
