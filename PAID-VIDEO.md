# Paid videos: how they work, how to add one, where to see it

**Superseded on 2026-10-11 (T083 of `specs/001-self-hosted-club-site`).** The access service of `workers/video-access/`, the
`VIDEOS` secret, `npm run dev:all` as the way to see a paid video, `npm run video-access:dev` and `npm run
check:video-access` no longer exist. A paid lecture is a row of the club's own database; the rule who may play it is the
SQL function `lecture_view`; the player asks `GET /api/videos/:slug/source` or, for a file on the server's volume,
`GET /media/video/:slug`. To add a paid lecture: write `src/content/video/<slug>.md` with `access: paid`, run
`npm run import:content`, then `npm run video:register -- <slug> <file>` for a file in the video volume or
`npm run import:video-sources -- <file>` for the old `videos.local.json` of links. Everything below describes the
previous arrangement and is kept as history.

Written on 2026-09-28, the day the mechanism was built on the branch `clerk-auth`. The design was settled by a
consilium the same day; its verdict, with every remark and the tests that back it, is
`.specify/consilium/2026-09-28-paid-video-access.md`. This file is the how-to for the two administrators.

**For any work on videos on this machine, start the site with `npm run dev:all`**, not `npm run dev`: it runs the
access service next to the dev server; without it a signed-in visitor gets "Видео сейчас недоступно" on every paid
video (a guest still sees the sign-in box). Section 3 has the details. (Added 2026-09-28, when `dev:all` was added.)

## 1. What a visitor sees

A paid video is an ordinary entry in the Video section, marked `access: paid`. Its card, title, date, tags and text
are public, like any other video, so search engines and shared links still show that the lecture exists. Only the
player is closed. In its place the page shows a box of the player's size with one of these texts:

- A guest (not signed in): "Эта лекция доступна участникам клуба." and a "Войти" button. After signing in the
  visitor comes back to the same video.
- Signed in, no access: "Лекция откроется после оплаты участия в клубе..." and a "Проверить ещё раз" button. The
  button asks again at once, so a member who has just been granted access does not have to wait or sign out.
- Signed in, access granted: the player itself.
- A member, but the video is not connected yet (its id is missing at the service, section 4 step 4): "Лекция ещё
  не подключена. Загляните позже."
- Anything broken (the service unreachable, a wrong setting): "Видео сейчас недоступно. Обновите страницу позже."
  The reason is written to the browser console.

The comments under a paid video follow the player (the owner's choice, 2026-09-28): the "Показать комментарии"
button appears only once the service has answered with the player, so a guest and a signed-in visitor without access
see no comments there. On public videos and posts the comments are as before. This hides the block on the page and no
more: a Disqus thread can also be opened on disqus.com itself, and writing there needs a Disqus account, not a club
membership. Comments that only members can read would have to be the site's own (a consilium subject of its own).

Changed later on 2026-09-28, the owner's decision; the paragraph above describes the first choice. On a paid video
the comments are closed to a guest only: they show as soon as the page has confirmed that the visitor is signed in,
access or not, so that someone who has not paid yet can ask and be instructed there. In short:

- A guest: block 1 (below) and the sign-in box.
- Signed in, no access yet: block 1, the "after payment" box and the comments.
- A member: block 1, the player, block 2 and the comments.

The page settles whether the visitor is signed in before it asks the service, so on the live site, while the service
is not deployed, a guest still gets the sign-in box (it got "Видео сейчас недоступно" until that night) and a
signed-in visitor gets "Видео сейчас недоступно" with the comments.

Under the player a paid lecture can have two parts of text (added the same night, the colleague's proposal):

- **Block 1**, the description, time codes and anything else everybody may read. It is the ordinary text of the
  entry, as on any video.
- **Block 2**, explanations, diagrams and pictures for the members who may watch. It shows only once the player has
  appeared; a guest and a signed-in visitor without access do not see it, and its headings are left out of the
  table of contents. It is hidden, not locked: its text is in the page source and in the public repository, and its
  pictures are public files that anyone with the address can open. Section 4, "Materials for members", says how to
  write it. A real lock (the service handing block 2 out like the video id) would be a consilium subject.

## 2. How it works, in five lines

1. The page holds no id of a paid video: the build refuses an entry that carries one (`videoId`, `videoUrl`,
   `thumbnail`, or a YouTube link in the text). Since 2026-10-02 a Yandex Disk link in the text is refused too.
2. The id lives in one place: a secret of a small service on Cloudflare, `workers/video-access/worker.mjs`, which
   maps the entry's slug to the id.
3. When a signed-in visitor opens a paid video, the page asks that service with the visitor's Clerk session token.
4. The service checks the token's signature and the two fields the administrator writes in the Clerk Dashboard,
   `member` and `memberUntil`, and answers with the player address to a member only.
5. The page puts the player in place of the box.

The lock is the service. Everything on the page is presentation: a visitor who edits the page in the browser gets
nothing, because the page never had the id.

What it does not protect: a member who has the player open can copy the YouTube id from it and pass it on, and
YouTube plays an unlisted video for anyone who has its id. Ending a member's access stops the site from handing out
the id again, but does not take back an id already seen. Section 8 says what to do about it before real sales.

## 3. Where to see it now, on this machine

No paid video plays on the live site yet: the service is not deployed (section 5). Locally everything works, with
two paid examples. `src/content/video/paid-demo.md` is a draft, so it exists in `npm run dev` only and never reaches
the published site. `paid-demo-2.md` (open `/video/paid-demo-2/` the same way) is published, at the owner's request
of 2026-09-28, and is listed under Video like every lecture; on the live site, until the service is deployed and
`VIDEOS` carries its slug, a guest sees the sign-in box there and a signed-in visitor "Видео сейчас недоступно".

1. Open a terminal in the project folder and run `npm run dev:all`. It starts the service at
   `http://127.0.0.1:8787` and the site at `http://localhost:4321` together, in the same terminal. The service prints
   where it reads the video ids from, then one line per request (`POST /video 401`, `200`, ...).
2. To stop, press Ctrl+C once. Both end; anything still running five seconds later is killed together with every
   process it started, so no port stays taken. A second Ctrl+C kills at once. If one of the two ends by itself - a
   crash, or port 8787 taken by a service left running in another terminal - the other is stopped as well and the
   terminal says which one ended and why.
3. Arguments go to the site: `npm run dev:all -- --port 4387`. The local service accepts the ports 4321, 4387 and
   4388 only. The two can still be started separately, `npm run video-access:dev` in one terminal and `npm run dev`
   in another; that was the only way until `dev:all` was added on 2026-09-28.
4. Open `http://localhost:4321/video/paid-demo/` (the list at `http://localhost:4321/video/` shows it too, as the
   newest video). As a guest you see the sign-in box.
5. Sign in with the demo account (`demo+clerk_test@example.com`, password `Demo-2026-klub`, code `424242` if Clerk
   asks for one). Open the video again. Without access you see "Лекция откроется после оплаты...".
6. Grant the demo account access in the Clerk Dashboard, both steps (they are also section 5.1 and section 6):
   - **Sessions -> Customize session token**: add the two claims of CLERK-DASHBOARD.md section 7.2, item 3.
     This is once per Clerk instance.
   - **Users -> the demo user -> Metadata -> Public -> Edit**: `{ "member": true, "memberUntil": "2026-12-31" }`.
7. Back on the video, select "Проверить ещё раз". The player appears.

The local service reads the ids from `workers/video-access/videos.local.json`, which git ignores, so no real id ever
enters the repository. Today it maps `paid-demo` to a public YouTube demo video (`M7lc1UVf-VE`, the sample video of
YouTube's own player documentation), and `paid-demo-2` to a public Blender Foundation film (`aqz-KE-bpKQ`, "Big Buck
Bunny"), both stand-ins. Put the id of a real unlisted lecture there to see that instead. The file is
read on every request; no restart is needed.

## 4. Adding a paid video, step by step

1. **Upload the video to YouTube as Unlisted**, never Public. In the upload settings keep "Allow embedding" on.
   Keep the original file somewhere outside YouTube as well: moving to a better host later (section 8) means
   uploading it again.
2. **Copy the video id.** YouTube's Share button gives `https://youtu.be/<id>`; the id is the part after the slash,
   usually 11 characters, for example `M7lc1UVf-VE`.
3. **Choose the slug**: the file name the entry will have, without `.md`. Latin letters, digits and hyphens, for
   example `lecture-dowsing-2`. The page will be `/video/lecture-dowsing-2/`.
4. **Give the id to the service.** Add the line to the master copy of the list, then in the Cloudflare Dashboard
   open the Worker (section 5.2) -> Settings -> Variables and Secrets -> `VIDEOS` -> Edit, and paste the whole
   list. Corrected 2026-09-28: this step said "add a line to the JSON", but Cloudflare never shows a secret again
   after it is saved (CLOUDFLARE.md, 6.8), so the field opens empty and whatever is saved replaces the old list. The
   master copy lives in the club's password manager; the list with every line:

   ```json
   {
     "paid-demo": "M7lc1UVf-VE",
     "lecture-dowsing-2": "<the id from step 2>"
   }
   ```

   Save and deploy. For a local check, add the same line to `workers/video-access/videos.local.json`.

5. **Create the entry** `src/content/video/lecture-dowsing-2.md`. Copy the header of a public video and change it:
   - add `access: paid`;
   - delete `videoId`, `videoUrl` and `thumbnail` - the build fails if any of them is there;
   - write no YouTube link in the text below the header, not even one with a timestamp - the build fails on that
     too, because the text is public (it goes into the page, the RSS feed and the search index).
   - since 2026-10-02 the same holds for a Yandex Disk link (`disk.yandex.<domain>`, `disk.360.yandex.ru`,
     `yadi.sk`), in the members' block as well: a paid lecture's text may not link to any file on Yandex Disk.

   ```markdown
   ---
   title: "Название лекции"
   description: "Одна-две фразы о лекции."
   date: "2026-10-05"
   access: paid
   duration: "48:10"
   tags: ["video", "биолокация"]
   categories: ["обучающие видео"]
   ---

   Описание лекции, которое видят все.
   ```

6. **Check it locally** as in section 3: as a guest you see the sign-in box, as a member the player.
7. **Build**: `npm run build`. A mistake from step 5 stops the build with a message naming the file and the field.
8. **Commit, open a pull request, merge.** After the site is rebuilt the lecture is at
   `https://debi7.github.io/video/lecture-dowsing-2/` and in the list at `https://debi7.github.io/video/`.

The order of steps 4 and 8 does not matter much: if the page goes live before the id is in `VIDEOS`, members see
"Лекция ещё не подключена" until it is added, and nobody sees anything they should not.

**Turning a public video into a paid one** is steps 1 to 8 with a new upload. The old id has been public on the site
and stays in the git history, so marking the old entry `access: paid` alone would not close it. Set the old YouTube
video to Private after the new one is in place.

### Materials for members (block 2)

Added 2026-09-28. In the entry's text, after what everybody may read, wrap the members' part in a div with the
attribute `data-members-only`. The blank lines after the opening line and before the closing one are needed: without
them the Markdown inside is not turned into headings, paragraphs and pictures.

```markdown
Описание лекции и тайм-коды, которые видят все.

<div data-members-only>

## Материалы к лекции

Пояснения к лекции.

![Схема](/images/video/lecture-dowsing-2/diagram.png)

</div>
```

- Pictures go in `public/images/video/<slug>/` and are written with that address, starting with `/images/`.
- The opening line is exactly `<div data-members-only>` and the block ends with `</div>`, with no other div inside.
  Anything else fails the build with a message naming the file, because a block that is not recognised would reach
  the list card, the feed and the search index.
- Only a paid entry (`access: paid`) may have such a block; on a public one nobody would ever see it, and the build
  says so.
- The block never reaches the list card, `/video/rss.xml`, the site search or the table of contents; the page is
  the only place it is written, hidden until the player appears. `paid-demo-2` has one, with a sample diagram.
- No YouTube link inside it either: the rule of step 5 covers the whole text.

### More than one paid video

Added 2026-09-28 at the owner's request. There is no separate setting for "several": every paid video is the same
two things as the first one, and steps 1 to 8 are repeated for each.

- **One entry file per video** in `src/content/video/`, each with `access: paid` and its own slug (the file name).
- **One line per video in `VIDEOS`**, all in the same JSON object, the key being the slug and the value the id:

  ```json
  {
    "paid-demo": "M7lc1UVf-VE",
    "lecture-dowsing-2": "aaaaaaaaaaa",
    "lecture-dowsing-3": "bbbbbbbbbbb"
  }
  ```

  A comma after every line but the last. When a lecture is added, add the line to the master copy (step 4) and paste
  the whole list into the secret; do not create a second secret. One secret holds up to 5 KB on Cloudflare's free plan (its "Limits" page), which is about 130 lines
  of this length.

- **Nothing changes in Clerk.** The session token claims of section 5.1 are set once per instance, whatever the number
  of videos, and a member's record of section 6 (`member`, `memberUntil`) opens every paid video at once: there is one
  kind of membership. A member granted access yesterday sees a lecture added today without anything being done for
  them.
- **Where they show**: each paid lecture is a card in the list `/video/` among the public ones, in date order, and has
  its own page `/video/<slug>/`. The tag and category pages list it as well. A guest sees every card and every page,
  with the box in place of the player.
- **Locally**: add the lines to `workers/video-access/videos.local.json` and the files to `src/content/video/`. A file
  with `draft: true` shows in `npm run dev` only, as `paid-demo` does, which is a way to try a lecture before
  publishing it.
- **Removing one**: delete its file (the page disappears with the next build) and its line in `VIDEOS`, and set the
  YouTube video to Private.
- **Different videos for different people** (one course bought, another not) is not built: today access is all paid
  videos or none. The consilium verdict of 2026-09-28 keeps the way open ("packs"): a list of courses in the member's
  record and a course name next to each id in `VIDEOS`, with no change to the records written before.

## 5. One-time setup for the live site

Not done yet. Until it is, paid videos work only on this machine (section 3).

### 5.1 Clerk Dashboard

**Sessions -> Customize session token -> Edit**, and add (CLERK-DASHBOARD.md section 7.2, item 3):

```json
{
  "member": "{{user.public_metadata.member}}",
  "memberUntil": "{{user.public_metadata.memberUntil}}"
}
```

This puts the two fields of the access record into the token the service checks. Without it every member gets
"Лекция откроется после оплаты". It is per instance: the development instance and a production instance each need
it.

Step by step (added 2026-09-28 at the owner's request; the path is Clerk's own, from "Customize your session token"
in its Core 3 documentation; the exact button labels may differ slightly):

1. Sign in at `https://dashboard.clerk.com` and pick the application in the menu at the top left. Check the
   environment switch next to it: **Development** for the instance the site uses today (the one whose key is in
   `src/config.ts`).
2. Open the **Sessions** page (Clerk's documentation calls it that; in the Dashboard it is in the settings
   sidebar).
3. Find the block **Customize session token**. It has a **Claims** editor, which is empty (`{}`) on a new instance.
4. Replace its content with the JSON above. If the editor already holds other claims, keep them and add the two
   lines inside the same braces, with a comma between entries.
5. Select **Save**. The editor refuses JSON that does not parse; a missing comma or quote is the usual cause.

The quotes around `{{user.public_metadata.member}}` are right: Clerk replaces the whole string with the value and
keeps its type, so a `true` in the metadata arrives in the token as `true`, not as text (Clerk, "JWT templates",
Shortcodes). A signed-in visitor's token picks up the change within a minute; "Проверить ещё раз" on a paid video
asks for a fresh one at once.

Granting access to one user is section 6; the first time, try it on the demo account:

1. In the left sidebar, open **Users** and type `demo+clerk_test@example.com` into the search field. Open the user.
2. Scroll down the user's page to **Metadata**. It has three parts: Public, Private and Unsafe. Use **Public** only:
   the visitor's browser can write Unsafe, so it must never decide access.
3. Next to **Public**, select **Edit**. An editor opens with the current content, `{}` for a new user.
4. Enter the record, keeping any other keys that are already there:

   ```json
   {
     "member": true,
     "memberUntil": "2026-12-31"
   }
   ```

   `true` without quotes; the date exactly in the form `YYYY-MM-DD`.

5. Select **Save**.
6. Check it: with `npm run dev:all` running and the demo account signed in, open
   `http://localhost:4321/video/paid-demo/` and select "Проверить ещё раз". The player appears, and the terminal of
   `dev:all` prints `POST /video 200` (it printed `403` before).

### 5.2 Cloudflare: the service

Added 2026-09-28: CLOUDFLARE.md is the full version of this section - registering the account, protecting it, the
roles, the costs, why Cloudflare and what else exists. The steps below are its short form and are kept in step with
it.

Cloudflare's free plan is enough: 100,000 requests a day and 10 ms of processor time per request; the check takes
about 0.5 ms (`npm run check:video-access` prints the timing). The labels below are Cloudflare's as of 2026-09 and
may move.

1. **The owner creates the Cloudflare account** and invites the colleague (Manage account -> Members). The account
   that holds the service holds the video ids, so it should belong to the club, not to whoever happened to set it
   up.
2. **Workers & Pages -> Create -> Create Worker.** Name it `video-access`. Cloudflare asks once for a
   `workers.dev` subdomain; it becomes part of a public address, so pick a neutral one. Deploy the sample.
3. **Edit code**, replace everything in the editor with the content of `workers/video-access/worker.mjs` from the
   repository, and **Deploy**. The file has no imports, so nothing else is needed. The header
   `X-Video-Access-Version` of every answer shows which version is deployed; compare it with `VERSION` in the file
   after a change.
4. **Settings -> Variables and Secrets -> Add**, three entries:
   - `CLERK_PUBLISHABLE_KEY`, type Text: the same `pk_...` as `site.clerk.publishableKey` in `src/config.ts`. The
     service trusts only tokens of that Clerk instance.
   - `ALLOWED_ORIGINS`, type Text: `https://debi7.github.io`. More than one is written with commas.
   - `VIDEOS`, type **Secret**: the JSON of section 4, step 4.
5. **Check it** from any terminal, with the address Cloudflare shows (`https://video-access.<subdomain>.workers.dev`):

   ```sh
   curl -i -X POST https://video-access.<subdomain>.workers.dev/video
   ```

   The answer must be `401` with `{"error":"unauthenticated","reason":"no_token"}`.

6. **Tell the site where the service is**: in `src/config.ts` set `site.videoAccess.endpoint` to that address,
   without a trailing slash and without `/video`. Commit and merge.

**When the Clerk key changes** (a new instance, or the move to production), change `CLERK_PUBLISHABLE_KEY` of the
service at the same time, or every member gets "Видео сейчас недоступно" (the console shows the service's reason,
`issuer` or `unknown_kid`).

## 6. Granting and ending access

This is CLERK-DASHBOARD.md sections 7.3 to 7.5, unchanged. In short:

- Grant: **Users -> the user -> Metadata -> Public -> Edit**,
  `{ "member": true, "memberUntil": "YYYY-MM-DD" }`. `true` without quotes; the date in exactly that form. The
  member sees the video within about a minute, or at once after "Проверить ещё раз".
- The last day is included. Access ends at midnight UTC after `memberUntil`, with no action from anyone.
- End early: set `member` to `false`.
- A typo closes access, never opens it: `"true"` in quotes, a date like `31.12.2026`, a date that does not exist,
  or a missing field all mean "no access".
- Added 2026-10-02 with the members' statuses (ADMIN.md): a member whose `status` is `blocked` is refused every paid
  lecture, paid access or not, and the box says the account's access to the materials is closed (the service answers
  403 "blocked", VERSION 2026-10-02.1). A metr or an admin blocks and unblocks at `/admin/users/`. The claim `status`
  must be in the session token template (CLERK-DASHBOARD.md 7.2) for this to work.
- Added later on 2026-10-02, the owner's rule (ADMIN.md section 1): a status opens every paid lecture too. A member whose
  `status` is `student`, `expert`, `master`, `metr` or `admin` (`site.admin.lectureViewers`) gets the video without
  `member` and `memberUntil`, and with no end date; a guest (no status) does not. So the usual way to grant access is
  now a status at `/admin/users/`; the record above still works on its own, and `blocked` closes both (VERSION
  2026-10-02.2).

Access covers every paid video: there is one kind of membership. Separate courses ("sets" of videos) can be added
later without changing what is already written in anybody's metadata.

## 7. When something does not work

- **Guest box although signed in**: the header's sign-in mark has expired. Open any page of the site's
  `/auth/` section, or sign in again.
- **"Лекция откроется после оплаты" for a member**: the Customize session token step (5.1) is missing, or the
  metadata has a typo (section 6), or `memberUntil` has passed. After fixing it, select "Проверить ещё раз".
- **"Лекция ещё не подключена"**: the slug is not in `VIDEOS` (section 4, step 4), or the file name and the
  `VIDEOS` key differ.
- **"Видео сейчас недоступно"**: open the browser console (F12). It says which of these it is:
  - `site.videoAccess.endpoint is empty`: section 5.2, step 6 is not done;
  - `the access service answered 401 ... issuer` or `unknown_kid`: the service has another Clerk key than the
    site (section 5.2, the last paragraph);
  - `answered 503`: a setting of the service is missing or its `VIDEOS` is not valid JSON; the service's own log
    (Worker -> Logs) names it;
  - `could not be asked`: the service address is wrong, or `ALLOWED_ORIGINS` lacks the site's address;
  - `refused the player address`: the service answered an address outside `site.videoAccess.playerHosts`.
- Locally: is the service running (`npm run dev:all`, or `npm run video-access:dev` on its own)? It prints one line
  per request.

## 8. Before real sales

These do not block showing the mechanism, but each is a condition before money is taken. The consilium verdict has
the reasoning.

- **YouTube's rule on charging** (added 2026-09-28, found while writing CLOUDFLARE.md, after the consilium). YouTube's
  Developer Policies say: "API Clients must not charge users to watch content in an embedded YouTube player." Signing
  in before a video is allowed; charging for watching in the embedded player is not. The owner has to settle whether
  the club's membership falls under it before any money is taken for lectures shown this way. CLOUDFLARE.md section 2.3
  quotes the clause and lists the ways out; moving the paid lectures to another host is the item below.

- **The video host.** YouTube cannot take back an id per person. Either the owner accepts that in writing, or the
  lectures move to a host with signed, expiring addresses (Bunny Stream or Cloudflare Stream, roughly 1 USD a
  month at this size). Only the service changes then; the site and the entries stay as they are. Until then, to
  cut off a leaked lecture for everyone: upload it again, put the new id in `VIDEOS`, set the old video to Private.
- **A production Clerk instance.** Clerk says a development instance must not serve a live site. Production needs
  the club's own domain; the Clerk key and the service's `CLERK_PUBLISHABLE_KEY` then change together, and each
  member's access has to be granted again there (records do not move between instances).
- **Third-party scripts on the paid pages.** The page-view counter and the Disqus scripts run with the site's
  rights on every page. A compromised counter could read what the page reads. Consider leaving them off the paid
  pages.
- **Flooding.** The free plan stops answering after 100,000 requests a day, until midnight UTC; paid videos then
  show "Видео сейчас недоступно" while the rest of the site works. A rate limit needs a custom domain on
  Cloudflare.

## 9. The files

- `src/content/config.ts`: the `access` field and the rules for a paid entry.
- `src/lib/video.ts`: the build check on the text of a paid entry.
- `src/layouts/VideoLayout.astro`: a paid video gets the box instead of the player.
- `src/components/PaidVideo.astro`: the box, its texts and the player template.
- `src/scripts/paid-video.ts`: asks the service, shows the result.
- `src/config.ts`, `site.videoAccess`: the service address and the allowed player hosts.
- `workers/video-access/worker.mjs`: the service.
- `scripts/video-access-dev.mjs` (`npm run video-access:dev`): the service on this machine.
- `scripts/dev-all.mjs` (`npm run dev:all`): the service and the site together, and stopping both for certain.
- `scripts/check-video-access.mjs` (`npm run check:video-access`): 35 tests of the service, no network needed.
- `src/content/video/paid-demo.md`: the example, a draft.

Added 2026-09-30: section 10 adds the files for lectures on Yandex Disk, and the service's tests number 41 since then.

## 10. Lectures on Yandex Disk

Added 2026-09-30, at the owner's request. A paid lecture can live on Yandex Disk instead of YouTube. The first one is
`src/content/video/lecture-part-3.md`: `/video/lecture-part-3/`, first in the Video list by its date, 2026-09-29. A
visitor sees what section 1 describes; only the player differs - the browser's own video player instead of YouTube's.

### 10.1 How it works

- The entry is an ordinary paid entry (`access: paid`) with no address of the video; `src/content/config.ts` refuses
  one.
- In `VIDEOS` the slug maps to the file's public link instead of a YouTube id:
  `"lecture-part-3": {"yandexDisk": "https://disk.yandex.ru/i/<key>"}`. Only the link of a single file (`/i/`), never
  of a folder (`/d/`).
- For a member, and only after the membership check, the service asks Yandex Disk's public API
  (`cloud-api.yandex.net`; no account or token is needed for a public file) for a direct address of the file and
  answers `{"videoUrl": "https://downloader.disk.yandex.ru/..."}`. The page accepts that address only on a host in
  `site.videoAccess.fileHosts` and plays it in a `<video>` element (`src/components/PaidVideo.astro`).
- The video travels from Yandex straight to the member's browser. The service only hands over the address, so a
  lecture costs the Worker one small request, not its traffic.
- The card, the feed, the table of contents and the search treat it like any paid lecture: the title, the description
  and the text above block 2 are in the search index; block 2 and the link are not.

### 10.2 Adding a lecture from Yandex Disk

1. Upload the MP4 to Yandex Disk. In the file's menu choose "Поделиться", make sure access is "Доступ по ссылке", and
   copy the link, of the form `https://disk.yandex.ru/i/<key>`.
2. Create the entry as in section 4: `access: paid`, and no link anywhere in it. Since 2026-10-02 the build stops on
   a Yandex Disk link in the text, with a message naming the file (`yandexDiskAddress` in `src/lib/video.ts`).
3. Add the slug to `VIDEOS`: locally in `workers/video-access/videos.local.json` (ignored by git), on the live site in
   the Worker's secret (`CLOUDFLARE.md` section 6; the whole list is typed again).
4. Locally an edit of `videos.local.json` needs no restart; a change to the service's code (`worker.mjs`) needs
   `npm run dev:all` stopped and started again.
5. Check it signed in as the demo member (section 3): the player appears and its time line can be dragged to the middle.

### 10.3 Limits and risks

- **Yandex Disk is a file store, not a video host.** Yandex limits how much a public file may be downloaded and does
  not publish the thresholds. Every view downloads up to the whole file (478 MB for `lecture-part-3`). Past the limit
  Yandex can close the link for a while, and every member then sees "Видео сейчас недоступно" until it reopens. Fine
  for a small club, without a guarantee; if the audience grows, lectures belong on a video host.
- **One quality.** No adaptive streaming: the file plays as it was uploaded (`lecture-part-3`: 1280x720, about
  0.56 Mbit/s), so a slow connection pauses to buffer instead of switching to a lower quality.
- **The index at the start of the file.** Playback starts at once only when the MP4 keeps its index (the `moov` box) at
  the start ("faststart"); `lecture-part-3` does. A file without it makes the browser fetch the end first; re-save it
  with `ffmpeg -i in.mp4 -c copy -movflags +faststart out.mp4` before uploading.
- **A member can download the lecture.** The direct address is in the page while it plays. The browser's own download
  button is hidden (`controlslist="nodownload"`), but "Save video as" and the developer tools still reach it. The
  address works only for a limited time (Yandex does not document how long), so a copied address stops working; a
  downloaded file does not. With YouTube a member could not download, but could pass the id on for good.
- **The public link is the key to the file.** Whoever has it can watch and download the file on Yandex Disk,
  bypassing the site. Keep it only in `VIDEOS` and its master copy (`CLOUDFLARE.md` 6.8). If it leaks: in Yandex Disk
  close access to the file, share it again (a new link), and put the new link into `VIDEOS`. Since 2026-10-02 the
  build refuses a Yandex Disk link in a paid lecture's text, so it cannot leak that way by accident.
- **Captcha.** A plain request for the Disk page from this machine got a captcha; the API and the download host did
  not. Whether Yandex treats requests from Cloudflare's servers the same way shows only once the service is deployed;
  a captcha there would come out as a 503, "Видео сейчас недоступно".
- **Yandex on every play.** The service asks Yandex each time a member opens the lecture, with an 8-second limit; if
  Yandex is slow or down, the member gets "Видео сейчас недоступно" and can reload later.
- **One access for all paid lectures.** A member who has access sees every paid lecture, on YouTube or on Yandex Disk;
  there is no access per lecture (the owner's decision of 2026-09-30).
- **Nothing plays on the live site yet.** Until the service is deployed (section 5.2, `CLOUDFLARE.md` section 6) and
  its `VIDEOS` carries the slug, a signed-in member sees "Видео сейчас недоступно", as with `paid-demo-2`.

### 10.4 Checked on 2026-09-30

- The file, through Yandex Disk's public API: MP4, 478 MB, 1 h 58 min, 1280x720, index at the start, antivirus
  "clean".
- The API gives a download address on `downloader.disk.yandex.ru`, which redirects to Yandex's storage; the file comes
  as `video/mp4`, with byte ranges (seeking works) and `Content-Disposition: attachment`, which a video element
  ignores.
- Headless Edge played such an address in a plain video element: the metadata after 1.7 s, a seek to the middle in
  0.8 s, then playing.
- `npm run check:video-access`: 41/41, six of them new for Yandex Disk - a visitor without access never makes the
  service call Yandex, the answer carries no link, and Yandex down, a foreign download host or a folder link each give 503.
- The build: `/video/lecture-part-3/` first on `/video/`, in the search index without block 2, and the link in no file
  of `dist/`.
- Not checked end to end with the demo member through `npm run dev:all`: the service running on this machine at the
  time still had the code from before, and it is the owner's process. After a restart, section 10.2 step 5 is that
  check.

### 10.5 The files

- `workers/video-access/worker.mjs`: `yandexDiskFile()` and the `{"yandexDisk"}` value (VERSION 2026-09-30.1).
- `src/config.ts`, `site.videoAccess.fileHosts`: the hosts a file address may point to.
- `src/components/PaidVideo.astro`: the second template, `template[data-paid-file]`, with the video element.
- `src/scripts/paid-video.ts`: `playFile()`, for an answer with `videoUrl`.
- `scripts/check-video-access.mjs`: a made-up Yandex Disk API and the six new tests.
- `src/content/video/lecture-part-3.md`: the first lecture on Yandex Disk.
- `src/lib/video.ts`, `yandexDiskAddress`: the build check on a Yandex Disk link in a paid entry's text (added
  2026-10-02).
