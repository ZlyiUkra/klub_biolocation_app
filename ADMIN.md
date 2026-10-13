# Admin panel: posts and member statuses

Written 2026-10-02, when the panel was built at the owner's request, and rewritten the same evening as a step-by-step
guide. The design is the consilium verdict `.specify/consilium/2026-10-02-admin-posts.md`. This file is meant to let
anyone set the panel up again from nothing - on a new computer, after a reinstall, or on the live site - and to say what
to do when it complains. Sections 1 to 6 are for the people who run the club; sections 7 to 11 are the technical record.

> **Superseded 2026-10-12 (T100, plan phase 6).** The content service `workers/content-admin/`, its GitHub token, its
> GitHub stand-in, `npm run content-admin:dev` and `check:content-admin` are deleted. Posts and videos are written by
> the club's own backend (`server/src/content/`) into its database and shown at `/admin/posts/` and `/admin/videos/`;
> nothing is committed to GitHub from the panel. The sections below that describe the Worker, its token and the build
> that followed a save are history; [VIDEOS.md](VIDEOS.md) is the guide for the pages that replaced them.

> **Changed 2026-10-11 (T071, plan phase 3).** The status service `workers/statuses/`, the Clerk secret key on this
> computer, `npm run statuses:dev`, `statuses:key` and `check:statuses`, and the session-token arrangement are gone.
> Every account has its status as a column in the club's own database; a metr or an admin assigns it at
> `/admin/users/` through `/api/admin/users` (`server/src/users/`), the rules of sections 1 and 2 are the plain module
> `server/src/users/status-rules.ts`, and the 68 cases of the old check are in `server/test/status-rules.test.ts`.
> Sections 3, 5, 6, 8 and 9 below describe the removed arrangement and stay as history; the superuser, the hand-over
> and the recovery codes are in `specs/001-self-hosted-club-site/security-review-superuser.md` and README.md.

## In plain words

While the site is on GitHub Pages, [ADMIN-GITHUB-PAGES.md](ADMIN-GITHUB-PAGES.md) is the day-to-day guide: a new post
from the panel to the live site, and a new member and their status, step by step.

- The site has two admin pages. On `/admin/posts/` posts are added, edited and deleted without GitHub. On
  `/admin/users/` members are given their status.
- Every member has a status. A new account is a **guest**. A **metr** or an **admin** gives the others. Only a metr or
  an admin may touch the posts.
- Any status except guest and blocked opens the paid lectures. A **blocked** member can sign in but opens nothing, and
  their account page says who blocked them.
- Every member sees their own status on the account page (`/auth/account/`), inside the account card, between
  "Профиль" and "Адреса электронной почты". A metr or an admin also sees two links there, "Публикации" and
  "Пользователи"; each admin page has a row at the top leading back to the account page and to the other admin page.
- The panel works in two places: on this computer, with `npm run dev:all` (section 3), and on the live site once two
  services are deployed on Cloudflare (section 7).

## 1. The statuses

| Status    | Shown as      | Who gives it              | Paid lectures | Posts | Gives statuses                   |
| --------- | ------------- | ------------------------- | ------------- | ----- | -------------------------------- |
| `guest`   | гость         | nobody: every new account | no            | no    | no                               |
| `student` | студент       | a metr or an admin        | yes           | no    | no                               |
| `expert`  | эксперт       | a metr or an admin        | yes           | no    | no                               |
| `master`  | мастер        | a metr or an admin        | yes           | no    | no                               |
| `metr`    | мэтр          | an admin only             | yes           | yes   | student, expert, master, blocked |
| `admin`   | администратор | an admin only             | yes           | yes   | every status except guest        |
| `blocked` | заблокирован  | a metr or an admin        | no            | no    | no                               |

- Student, expert and master differ only in name for now; each opens the lectures with no end date.
- A status is the key `status` in the member's public metadata in Clerk. No status at all, or a value that is not in the
  list, counts as guest. The list and the names live in `src/config.ts` (`site.admin`).
- The older way of opening the lectures, `member` and `memberUntil` in public metadata (CLERK-DASHBOARD.md 7.3), still
  works beside the statuses, so an account set up that way keeps its access. Blocked closes both.

## 2. Who may do what

The services (section 8) enforce every rule; the pages only show what the services allow.

- Nobody changes their own status.
- Nobody gives guest, an admin included: it is only what an account starts as. To take access away, block the member.
- An admin gives any other status to anyone else, metr and admin included.
- A metr changes only a guest, student, expert, master or blocked member, and only to student, expert, master or
  blocked. A metr never makes anyone a metr or an admin (the owner, 2026-10-02: only an admin makes a metr), never
  touches a metr or an admin, and cannot lift a block an admin set.
- The admins listed in `ADMIN_IDS` (section 3, step 4) cannot be changed from the site at all, and count as admins even
  if their metadata says otherwise. The list may never be empty, so the site cannot lose its last admin. The owner's
  account goes there.
- A new status reaches the member within about a minute: the services read it from the member's session token, which
  Clerk renews every 60 seconds. The account page shows it at the next reload, because it reads the account itself.

## 3. Setting it up on this computer

Do this once per computer, in this order. Each step says what you should see when it worked.

### Step 1. The session token carries the status (Clerk Dashboard, once per Clerk instance)

1. Open the Clerk Dashboard, choose this application and **Development** at the top left.
2. **Configure -> Sessions -> Customize session token -> Edit**. The text must be exactly this, commas included:

   ```json
   {
     "member": "{{user.public_metadata.member}}",
     "memberUntil": "{{user.public_metadata.memberUntil}}",
     "status": "{{user.public_metadata.status}}"
   }
   ```

3. **Save**.

Without the third line every page of the panel refuses you even after step 2 (section 6 has the message).

### Step 2. Your own account is an admin (Clerk Dashboard)

1. **Users** -> your own user -> **Metadata** -> **Public** -> **Edit**. Not Private, not Unsafe.
2. Add `"status": "admin"` next to what is already there, for example:

   ```json
   {
     "member": true,
     "memberUntil": "2099-12-31",
     "status": "admin"
   }
   ```

   `admin` in lower case and in quotes. **Save**.

3. On the same page, copy your **User ID** (`user_...`). It is not secret; it is needed in step 4.

Check: reload `/auth/account/`. The account card shows "Статус: администратор" between "Профиль" and the email
addresses, and the links "Публикации" and "Пользователи" are above the card.

### Step 3. A secret key for this computer (Clerk Dashboard)

The status service talks to Clerk with a **secret key** (`sk_test_...`). That key can read, change and delete every
user of the instance, so treat it like a password: never paste it into a chat, an email, a commit or a screenshot.

Recommended: give this computer a key of its own. Clerk allows several active secret keys and advises naming each after
the place it is used, so that a leak means deleting one key, not changing every place (Clerk Core 3, "Rotate your Clerk
API keys").

1. Clerk Dashboard -> **API keys** -> **Secret keys** -> **+ Add new key**.
2. Name it after this computer, for example `local-statuses-<computer name>`, and create it.
3. Keep the Dashboard page open; the next step asks for the key.

### Step 4. Save the key encrypted, and list the protected admins (terminal and one small file)

1. In the project folder, run:

   ```
   npm run statuses:key
   ```

   PowerShell asks for the key. Paste it (right click, or Ctrl+V) and press Enter; it shows as asterisks, on purpose.
   It answers:
   `Saved, encrypted for this Windows account: workers/statuses/clerk-secret.local.dpapi (a test key, NN characters).`

   The key is now in that file encrypted by Windows for your Windows account (section 9 explains how). The file is
   useless on another computer or under another account, and git ignores it. The key is not stored anywhere else on
   this computer.

2. Create `workers/statuses/settings.local.json` (git ignores it) with your User ID from step 2:

   ```json
   { "ADMIN_IDS": "user_..." }
   ```

   Several protected admins: `"user_aaa,user_bbb"`. These ids are not secret.

If `settings.local.json` already holds `"CLERK_SECRET_KEY"` (the way this guide said before the encryption): run
`npm run statuses:key` anyway. It takes the key from that file, encrypts it, and then tells you to delete that line;
do so, so that the file reads like the example above. It never edits the file itself. The service no longer reads the
key from there, and says so in the terminal while the line is still there.

To replace the saved key later (a new key, a leak): `npm run statuses:key -- --replace`. Without `--replace` it refuses,
so running it twice by mistake changes nothing.

On macOS or Linux there is no Windows encryption: set `CLERK_SECRET_KEY` in the environment of the terminal that runs
`npm run dev:all` instead, and do not write it into a file in the project.

### Step 5. Start everything

```
npm run dev:all
```

It starts four things: the video service (port 8787), the content service (8789), the status service (8790) and the
site (4321). Among the lines it prints, the status service says
`Clerk secret key: from the encrypted file (npm run statuses:key).`

After a change to anything under `workers/` or `scripts/`, stop it with Ctrl+C and start it again; the site itself
reloads by itself, the services do not.

### Step 6. Check

1. `/auth/account/`: your status in the card, the two links above it.
2. `/admin/posts/`: the list of posts.
3. `/admin/users/`: the list of members, newest first, each with a status badge and the registration date.

## 4. Everyday use

### Posts (`/admin/posts/`)

- **Новая публикация**: fill in the title, the address (Latin lower case, digits and hyphens), the date, the
  description, tags, categories and the text, and save. On the live site the post appears about two minutes later -
  the page waits and says so - and is then found by the search and listed under its tags and categories.
- **Изменить** opens a post to edit it. The address cannot change: the comments hang on it.
- **Копировать** starts a new post from an existing one, for those who would rather change fields than write Markdown
  from nothing. Every field and the whole text are copied, with three changes made so that the copy conflicts with
  nothing by default:
  - the address becomes a free one, `<address>-copy`, or `-copy-2`, `-copy-3` when that is taken too (drafts and
    future posts count). You may type another; it must be unique, because two posts cannot share `/posts/<address>/`;
  - the title gets " (копия)" at the end, so the list never shows two equal titles - change it before saving;
  - the date becomes now, so the copy is filed as a new post.

  Nothing is saved until you press save. The draft tick is copied as it was.

- **No address is ever written over.** If the address you save was taken in the meantime (another editor, or the same
  copy saved twice), the service refuses, and the panel reloads the list and puts the next free address into the field
  with a note; check it and save again. Addresses that are only digits (they are the year pages) and `page` are refused
  too, so a post can never take the place of a list page.
- **Удалить** asks for confirmation first.
- The list shows 20 posts to a page, with page numbers under it, as on the site's own lists.
- On this computer a save changes the file in `src/content/posts/` of the working copy (there is no GitHub here), so it
  reaches the live site only with a normal commit. `git status` shows it; `git checkout -- src/content/posts/<file>`
  undoes it.

### Statuses (`/admin/users/`)

- Search by name or email, choose the status in the row, **Применить**, confirm.
- The list shows 20 members to a page, newest first, with page numbers under it; a new search starts on page 1.
- The list offers only the statuses you may give that member (section 2); the others are greyed out.
- On this computer the status service talks to the real Clerk instance: a status set here is set for that member
  everywhere, the live site included, since both use the same Clerk instance.

### What a member sees

- The account page shows their status in the card from the first sign-in ("гость").
- A paid lecture opens for student, expert, master, metr and admin. A guest sees "откроется после оплаты"; a blocked
  member sees that access is closed, and the account page says whether a metr or an administrator closed it.
- After a status change, a member who is looking at a lecture can press "Проверить ещё раз"; otherwise it takes up to a
  minute.

## 5. When the key is lost, leaked, or the computer changes

- **New computer, reinstalled Windows, or another Windows account**: the encrypted file cannot be read there (the
  service prints "Key not valid for use in specified state"). Do steps 3 and 4 again on that computer; then delete the
  old computer's key in the Clerk Dashboard.
- **The key may have been seen by someone**: Clerk Dashboard -> API keys -> **+ Add new key**, then
  `npm run statuses:key -- --replace` with the new one, check `/admin/users/`, and only then delete the old key in the
  Dashboard (Clerk's own order: add, switch, then delete).
- **Moving the project folder** needs nothing: the encryption is tied to the Windows account, not to the path.

## 6. When a page complains

- "У этой учётной записи нет прав на публикации. Их выдаёт администратор сайта." (grey) - your account has no
  `status` of metr or admin in its public metadata. Step 2.
- "Статус учётной записи «администратор» есть, но сессия его не передаёт: в шаблоне сессионного токена Clerk нет
  строки status ..." (red) - the account has the status but the session token does not carry it. Step 1, then reload;
  no new sign-in is needed.
- "Сервис статусов не настроен: секретный ключ Clerk не сохранён (npm run statuses:key) или в
  workers/statuses/settings.local.json нет ADMIN_IDS ..." - step 4.
- "Сервис статусов недоступен. Попробуйте позже." - the status service is not running (start `npm run dev:all`), or
  Clerk refused the key (deleted in the Dashboard: step 4 with `--replace`). The terminal of `npm run dev:all` shows the
  reason in a line starting with `statuses:`.
- "Сервис публикаций ещё не подключён" or "Сервис статусов ещё не подключён" on the live site - the services are not
  deployed yet (section 7).
- The status is shown **above** the account card instead of inside it - Clerk changed the inside of its card in an
  update; the status is still right. `src/scripts/account-status.ts` finds the place by Clerk's class names and says
  which in its header; recheck them, as AUTH.md 12.6 asks for the sign-in form.
- `npm run statuses:key` says "The key is already saved" - add `-- --replace` to change it. "That is not a Clerk secret
  key" - the pasted text does not start with `sk_test_` or `sk_live_` (the publishable key starts with `pk_`).

## 7. The live site (not done yet)

1. **Cloudflare** (the account the owner is to create, CLOUDFLARE.md section 6): two more Workers, for example
   `content-admin` and `statuses`, each with its file from `workers/` pasted into the editor, and these settings
   (Worker -> Settings -> Variables and Secrets):
   - `content-admin`: `CLERK_PUBLISHABLE_KEY`, `ALLOWED_ORIGINS` = `https://debi7.github.io`, `GITHUB_REPO` =
     `Debi7/Debi7.github.io`, `GITHUB_BRANCH` = `main`, and the secret `GITHUB_TOKEN`;
   - `statuses`: `CLERK_PUBLISHABLE_KEY`, `ALLOWED_ORIGINS` = `https://debi7.github.io`, `ADMIN_IDS`, and the secret
     `CLERK_SECRET_KEY` - a key of its own, named for example `worker-statuses` (step 3), not this computer's.
2. **The GitHub token, made by the colleague**, who owns the repository: a fine-grained personal access token can only
   be made by the owner of the repository it reaches (GitHub, "Managing your personal access tokens"). GitHub ->
   Settings -> Developer settings -> Personal access tokens -> Fine-grained tokens -> Generate new token; resource owner
   her account; "Only select repositories" -> `Debi7.github.io`; Repository permissions -> **Contents: Read and write**,
   nothing else (in particular not Workflows); an expiry date, written down here when it is made. A classic token is
   refused: it would reach every repository of hers. GitHub shows the token once; it goes straight into the Worker's
   secret.
3. `src/config.ts`: `site.admin.endpoint` and `site.admin.statusesEndpoint` get the two Workers' addresses.
4. Step 1 of section 3 on the Clerk instance the live site uses (today the same development instance), and the owner's
   status (step 2).
5. Then, on the live site: a post saved, found by `/search/`, its tags in the cloud and on `/tags/<tag>/`, in its
   categories, the feed and the sitemap; an edit detected as live; a deletion gone from the cloud when it was a tag's
   only post; a status given and seen on that member's account page; and the Workers' CPU time read in the Cloudflare
   Dashboard.

## 8. How it works

- Two pages, `src/pages/admin/posts/index.astro` and `src/pages/admin/users/index.astro`, with their scripts
  `src/scripts/admin-posts.ts` and `src/scripts/admin-users.ts`, and the row at their top, `src/components/AdminNav.astro`.
  They use `Base.astro`, so the header, the theme switch and both palettes are the site's. They are `noindex`, left out
  of the sitemap, and not in the menu.
- Three Cloudflare Workers, each a single file pasted into the Dashboard, each holding one secret and nothing else
  secret, so a bug in one exposes nothing of the others:
  - `workers/content-admin/worker.mjs` holds the GitHub token. It lists, reads, adds, edits and deletes posts, and
    writes only `src/content/posts/<slug>.md`.
  - `workers/statuses/worker.mjs` holds the Clerk secret key. It lists members and sets one member's `status`.
  - `workers/video-access/worker.mjs` holds the paid lectures' links, and opens one for a status of
    `site.admin.lectureViewers` or for the older paid access, never for blocked.
    All three check the Clerk session token with the same code, and the tests fail when the copies differ.
- A save goes: the page sends the fields and the text with the editor's session token; the Worker checks the token and
  the status, checks the post against a copy of the `posts` schema (`src/content/post-fields.ts`) and its own stricter
  rules, writes the Markdown file, and commits it on `main` through GitHub's API. The push starts the usual build. The
  page then fetches the post's own page until the new version is there (a new post: the address answers; an edit: the
  page's modified time is the one the save stamped; a deletion: the address is gone), for at most 8 minutes.
- Rules a save cannot break, whatever the request says:
  - the address (slug): Latin lower case, digits and hyphens, not a bare number (a year is a list page), not "page",
    unique when new, never changed by an edit;
  - the front matter is written by the Worker from typed fields - quoted strings without line breaks, lists, a boolean,
    a date with its offset - so no other field (`access`, `layout`) can be slipped in;
  - the text may not contain raw HTML outside code, or links to anything but web pages, mail addresses and paths on the
    site: Astro passes raw HTML into the page unchanged, and the pages share their origin with the sign-in pages;
  - an edit rewrites only the lines of the fields the panel shows, and only when their value changed; comments in the
    front matter and fields the panel does not show stay as they were. It adds or updates `lastmod`;
  - a post changed by someone else since it was opened is not overwritten (the panel says to reload), and the branch is
    never forced, so nothing anybody else committed is lost.
- A status change writes, by Clerk's merge (Backend API `PATCH /users/{user_id}/metadata`, "a deep merge"), the keys
  `status`, `statusBy` and `statusAt` in public metadata, and who changed it and from what in private metadata, which
  the member cannot read. `member`, `memberUntil` and every other key stay as they were.
- The account page reads the status from the account (`publicMetadata`) and puts it into Clerk's card as a section of
  its own (`src/scripts/account-status.ts`). Clerk lets a site add whole pages to the card but nothing inside its own
  pages, so the script builds the section from the email section's parts, keeps it in place while Clerk redraws, and
  falls back to the panel above the card if it cannot find the place within 5 seconds.
- When something is not set up, the pages say what: a 403 to an account whose metadata says metr or admin means the
  token template (step 1); the status service answers a missing key or `ADMIN_IDS` with 503 "not_configured", and only
  to a metr or an admin, so the users page can name step 4.

## 9. The local secret key

- `npm run statuses:key` (`scripts/statuses-key.mjs`) hands the key to PowerShell, which encrypts it with Windows' Data
  Protection API (DPAPI) for the signed-in Windows account and writes `workers/statuses/clerk-secret.local.dpapi`.
  `npm run statuses:dev` (`scripts/statuses-dev.mjs`, started by `dev:all`) asks PowerShell to decrypt it whenever the
  file changes and keeps the key only in its own memory. Both use `scripts/statuses-secret.mjs`.
- What this protects against: the file read by anyone or anything else - another person, another Windows account,
  another computer, a backup or an archive of the folder, a file-sharing or AI tool, a commit made by mistake. In all of
  those it is unreadable.
- What it cannot protect against: a program running under your own Windows account, which can decrypt it exactly as the
  service does. No file on a computer that has to use the key can stop that; keeping this computer's own named key
  (step 3) is what limits the damage, since that one key can be deleted in the Dashboard.
- The key never appears on a command line, in the terminal, or in the service's messages: the scripts pass it to
  PowerShell through the environment of that one process or the hidden prompt, and print only its kind and length.
- The order of preference in `statuses:dev`: the environment variable `CLERK_SECRET_KEY` when it is set, otherwise the
  encrypted file. A `CLERK_SECRET_KEY` left in `settings.local.json` is ignored, with a warning.

## 10. The files

- `src/pages/admin/posts/index.astro`, `src/scripts/admin-posts.ts` - the posts page.
- `src/pages/admin/users/index.astro`, `src/scripts/admin-users.ts` - the statuses page.
- `src/components/AdminNav.astro` - the row at the top of both pages.
- `src/components/AdminPager.astro`, `src/scripts/admin-pager.ts` - the page numbers under both lists, 20 to a page
  (`site.admin.pageSize`): the account card's "Устройства" pager, which is the site's `Pagination.astro` made of buttons,
  with the site's rule for which numbers show.
- `src/pages/auth/account.astro`, `src/scripts/account-status.ts` - the status in the account card, the blocked note,
  the panel links.
- `src/config.ts`, `site.admin` - addresses, statuses, their names, who edits posts, who opens lectures.
- `src/content/post-fields.ts` - the `posts` schema, moved out of `src/content/config.ts` so the check can load it.
- `src/lib/post-url.ts` - `postUrl()`, moved out of `src/lib/posts.ts` so the panel's script can use it in the browser.
- `workers/content-admin/worker.mjs`, `scripts/content-admin-dev.mjs`, `scripts/github-stand-in.mjs`,
  `scripts/check-content-admin.mjs` - the content service, its local runner, its GitHub stand-in, its tests.
- `workers/statuses/worker.mjs`, `scripts/statuses-dev.mjs`, `scripts/check-statuses.mjs` - the status service.
- `scripts/statuses-key.mjs`, `scripts/statuses-secret.mjs` - the encrypted local key (section 9).
- `workers/video-access/worker.mjs` (VERSION 2026-10-02.2), `src/scripts/paid-video.ts`, `src/components/PaidVideo.astro`
  - the statuses and paid lectures.
- `src/layouts/Base.astro` (the `noindex` prop), `astro.config.mjs` (the sitemap leaves `/admin/` out),
  `scripts/dev-all.mjs` (four processes), `package.json` (the scripts), `.gitignore` (the local settings file and the
  encrypted key).

## 11. Checked on 2026-10-02

- `npm run check:content-admin` 129/129 (among them: a second post at a taken address is refused with 409 "exists"),
  `npm run check:statuses` 68/68 (with the page size: a limit and an offset passed on, 0, 51, 2.5 and "20" refused),
  `npm run check:video-access` 56/56.
- The pager's numbers against the site's rule (1/1, 2/2, 3/5, 1/6, 2/6, 7/20, 20/20 and the page counts for 0, 20, 21,
  24 and 57 items), and the copy's free addresses (`-copy`, `-copy-2`, a taken plain address to `-2` and `-3`, at most
  80 characters, no double hyphen after a cut), both on the shipped code transpiled in a scratch folder.
- `npm run check` 0 errors, `npm run build` green, `npm run check:pages` passed.
- A guest opening `/admin/posts/` is sent to the sign-in page (headless Edge on the dev server). The content service on
  this computer: preflight 204, no token 401, a foreign origin 403.
- In `dist/`, the Clerk chunk is referenced by the two admin pages, the three auth pages and the video pages (the paid
  video's dynamic import); no other page. The first build of the panel had imported `postUrl` from `src/lib/posts.ts`,
  which brought `astro:content` and a browser copy of every post, drafts included, into `dist/_astro`; hence
  `src/lib/post-url.ts`.
- The two pages in both themes, and the navigation row and the pager in the dark theme (headless Edge, on a copy of
  `dist/`).
- The encrypted key, on a made-up key in a scratch copy of the scripts: the file holds no plain text and decrypts back
  to the same key; a second run without `--replace` refuses and leaves the file as it was; a publishable key is refused
  and leaves the old file; `--replace` with a good key replaces it and leaves `settings.local.json` untouched; a missing
  file gives PowerShell's message, never the key.
- The owner's first signed-in run (2026-10-02): the posts page refused first for the missing public metadata, then for
  the missing token claim; the users page answered "unavailable" for the missing key. Those three are now the messages
  of section 6.
- Not checked by a run yet: the status section inside Clerk's card with a real signed-in account, a real save, and a
  real status change - the owner's test of section 3, step 6.
