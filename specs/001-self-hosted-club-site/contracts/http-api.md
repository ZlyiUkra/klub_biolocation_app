# HTTP contract: Self-hosted club site

The interfaces the application exposes. Phase 1 of the plan; names are the contract the tests will be written against,
and a change to one is a change to this file first. Paths are on the site's own origin; the Express app is never
published directly, only nginx is.

## Conventions

- Bodies are JSON in both directions for `/api/`. A write whose `Content-Type` is not `application/json`, or whose
  `Origin` is not the site's origin, or whose `Sec-Fetch-Site` is present and not `same-origin`, is refused with 403
  `{"error":"cross_site"}` before anything else runs.
- Authentication is the `__Host-` session cookie. There is no bearer token and no API key.
- Errors: `{"error": "<code>", "message": "<text for people>"}`. Codes are stable; messages are not. The `message`
  is English and is for logs and other clients: the site's pages never show it, they print the text of the `error`
  code in the language the page shows (`src/i18n/errors.ts`; the list of codes is `src/lib/error-codes.ts`, and an
  unknown code gets a general sentence).
- A refused sign-in or a wrong current password also carries `attemptsLeft` (from the third failure of a step on, 0
  when a pause starts) and `retryAfterSeconds` (when this failure started a pause); a 400 on a form field carries a
  stable `problem` code beside `field` (added 2026-10-11, T053).
- A 400 or 409 about one form field also carries `"field"` (added 2026-10-11, T050); a pause or a limit is 429 with
  `Retry-After` in seconds. A session that must change its password reaches only `change-password`, `signout` and
  `me`; every other route answers it 403.
- Status codes: 200/201 success; 400 invalid input; 401 not signed in; 403 refused (rights, cross-site); 404 not
  found **or invisible to this viewer**; 409 conflict (stale save, duplicate); 413 too large; 422 well-formed but
  rejected by the content rules; 429 rate limited (with `Retry-After`).
- An entry the viewer may not see is always 404, on every route below, indistinguishable from a missing one.
- Rate limits are named per route in the last column; "limit A" is the sign-in limit, "limit B" the sensitive-action
  limit, "limit C" the public-form limit; their numbers live in one constant block and are set in phase 2.

## Health

| Method and path | Caller                  | Result                                                                          |
| --------------- | ----------------------- | ------------------------------------------------------------------------------- |
| GET `/healthz`  | anyone (nginx, Compose) | 200 `{"ok":true}` when the pool answers a trivial query; 503 otherwise; no data |

## Accounts and sessions

| Method and path                        | Caller | Body -> result                                                           | Notes                                                                                                                                                                                                           |
| -------------------------------------- | ------ | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST `/api/auth/signup`                | anyone | `{email, password, displayName, login?, website?, startedAt}` -> 201 `{viewer}` and a session | account starts as guest; limit A; a filled `website` (the honeypot) or a `startedAt` that is missing, under 3 seconds old, in the future or over a day old is a plain 400 `invalid_input` that names no check (T188; the rule is `src/lib/fill-time.ts`, the feedback form's too)                                                                                                                                                                                |
| POST `/api/auth/signin`                | anyone | `{identifier, password, next?}` -> 200 `{viewer, redirect}`              | identifier is an address, or a login name when it has no `@`; limit A; same message for unknown, wrong or expired                                                                                               |
| POST `/api/auth/signout`               | member | `{}` -> 200                                                              | ends the current session                                                                                                                                                                                        |
| POST `/api/auth/change-password`       | member | `{current, next}` -> 200                                                 | the only route a `must_change` session may use besides signout; ends the account's other sessions                                                                                                               |
| PATCH `/api/auth/profile`              | member | `{displayName?, login?}` -> 200 `{viewer}`                               | full session only (403 while a temporary password is pending); sign-up's rules; 409 `field: login` when taken; `login: ""` or `null` removes it; the address and the status are never read from the body (T146) |
| GET `/api/auth/me`                     | anyone | -> 200 `{viewer}`                                                        | `viewer` is `null` for a guest visitor; never cached                                                                                                                                                            |
| GET `/api/auth/sessions`               | member | -> 200 `[{id, device, created, lastSeen, current}]`                      | `id` is an opaque handle, not the cookie value                                                                                                                                                                  |
| DELETE `/api/auth/sessions/:id`        | member | -> 200                                                                   | own sessions only; 404 for another account's or an unknown handle (the same answer)                                                                                                                             |
| DELETE `/api/auth/sessions?all=others` | member | -> 200 `{ended}`                                                         | ends every session of the account but the current one                                                                                                                                                           |

`viewer`: `{id, displayName, status, blocked, mustChange, canEditContent, isSuperuser}`; derived on the server and
never trusted from the browser. `redirect` is the `nextPath()` result: a same-site path, else the account page.

## Content read (used by the pages through one client module; also public)

| Method and path                            | Result                                               | Notes                                                                                                                                                                                      |
| ------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET `/api/posts`                           | all cards visible to this viewer, newest first       | query: `tag`, `category`; paging stays in the site                                                                                                                                         |
| GET `/api/posts/:slug`                     | the post with `view` = `full` or `teaser`            | 404 when `none`                                                                                                                                                                            |
| GET `/api/videos`, GET `/api/videos/:slug` | the same for videos                                  | `membersOnlyHtml` present only for a viewer for whom the lecture is open under "locked"; under "hidden" sent to everybody with `membersOnlyHidden: true` for those who may not play (T081) |
| GET `/api/list`                            | one page of a list, cut by year and page (T162)      | query: `kind` (post, video, both), `tag`, `category`, `year`, `page`; answer: `items`, `year`, `page`, `last`, `years` with counts; 404 for a missing year or page                         |
| GET `/api/terms`                           | tags and categories with counts for this viewer      | counts never include invisible entries                                                                                                                                                     |
| GET `/api/search`                          | the search: hits, facet counts, first results (T163) | query: `q`, `section` (post, video), `category`, `tag`, comma lists; results capped at 200                                                                                                 |

The feeds (`/rss.xml`, `/video/rss.xml`), and `/sitemap.xml` are Astro endpoints over the same
module; each lists only what the requesting viewer may see, and the guest version is the cacheable one.

## Video

| Method and path                | Caller                | Result                                                                                                                                                                                                                                                                                            |
| ------------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/media/video/:slug`       | member with full view | 200/206 via `X-Accel-Redirect` to the internal location; honours `Range`; the session, status and visibility are checked on **every** request                                                                                                                                                     |
| GET `/media/video/:slug`       | anyone else           | 404 (invisible) or 401 when signed out of a paid entry that exists as a teaser                                                                                                                                                                                                                    |
| GET `/api/videos/:slug/source` | anyone (T137)         | 200 `{embedUrl}`, or `{videoUrl}` (a provider's file address, or `/media/video/<slug>` for a file on the volume); 401 `signed_out`, 403 `forbidden` / `blocked` / `expired`, 404 `not_found` / `no_source`, 503 `unavailable`; `Cache-Control: private, no-store`; the one rule is `lecture_view` |

The internal location `/_video/` is `internal` in nginx and answers 404 to any direct request. In development
Express serves the ranges itself with the same checks.

## Comments

Changed 2026-10-13 (T184, owner's decisions; FR-032 and FR-047): a flat list newest first, one day to change or delete
one's own comment, and the six reactions. "A writer" below is one rule with one home: an account that is not blocked
and either holds a status of `lectureRules.openingStatuses` with a date that has not ended (metr and admin are never
limited by a date), or is a guest account that holds a paying date; a lecture status with no date at all is not a
writer. The same rule decides who reacts.

| Method and path                                | Caller                       | Body -> result                          | Notes                                                                                                                                                                                                                       |
| ---------------------------------------------- | ---------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/api/entries/:kind/:slug/comments`        | anyone who may see the entry | -> 200 `[comment]`, newest first        | `comment` is `{id, author, body, createdAt, editedAt, mine}` (`editedAt` null until changed; `mine` is true for the viewer's own); metr and admin also get hidden ones, with `hidden: true`; deleted ones are in no answer     |
| POST `/api/entries/:kind/:slug/comments`       | a writer                     | `{body}` -> 201 `comment`               | text only, trimmed, 1 to 2000 characters, no NUL; limit B (5 stored comments in 10 minutes per account) -> 429; 20 under one entry per account -> 409 `conflict` with `field` body and `problem` `entry_cap`                  |
| PATCH `/api/comments/:id`                      | the comment's author         | `{body}` -> 200 `comment`               | within 24 hours of `createdAt`, after that 403 `forbidden`; not the author's, hidden, deleted or unknown: 404; sets `editedAt`; same body rules; not under limit B                                                           |
| DELETE `/api/comments/:id`                     | the comment's author         | -> 200 `{deleted: true}`                | within 24 hours, after that 403 `forbidden`; a soft delete (`deleted_at`), the row stays; a deleted comment is not counted against the 20 of an entry                                                                        |
| POST `/api/comments/:id/hide`, `/restore`      | metr, admin                  | `{}` -> 200 `comment`                   | audited as `comment_hidden` and `comment_restored` against the entry, the comment's id in `detail`, never its text; a repeat is a 200 and writes nothing; anyone else, and a deleted comment, 404                              |
| GET `/api/entries/:kind/:slug/reactions`       | anyone who may see the entry | -> 200 `reactions`                      | `{counts: {upvote, funny, love, surprised, angry, sad}, total, mine}`; `mine` is the viewer's kind or null                                                                                                                  |
| PUT `/api/entries/:kind/:slug/reactions`       | a writer                     | `{kind}` -> 200 `reactions`             | one reaction per account per entry: creates it or changes its kind; an unknown kind is 400 `invalid_input` with `field` kind; signed out 401, anyone who is not a writer 403 (`forbidden`, or `blocked`)                      |
| DELETE `/api/entries/:kind/:slug/reactions`    | a writer                     | -> 200 `reactions`                      | removes the viewer's reaction; a repeat is a 200                                                                                                                                                                            |

Both thread and reactions follow the entry: an entry nobody may see answers every route here 404, an editor included
(a draft is shown through the preview route), and what was written returns with the entry.

## Feedback

Changed 2026-10-13 (T104): the fields the form really has, and the answers pinned by the tests.

| Method and path      | Caller | Body -> result                                                              | Notes                                                                                                                                                                                                                                                                                                                                            |
| -------------------- | ------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| POST `/api/feedback` | anyone | `{body, name?, contact?, subject?, website, startedAt}` -> 201 `{received: true}` | `body` 1 to 5000 characters, no NUL; `name` up to 100 and `contact` up to 200, one line; `subject` a code of the fixed list (T144: `signin_problem`), else 400 on `subject`; `website` is the honeypot and must be empty; `startedAt` is the time the form was opened (epoch milliseconds, the server's clock as the page learned it): between 3 seconds and 24 hours ago, else 400; a refused honeypot or fill time answers a plain 400 `invalid_input` with no `field`; stored with its mail row in one transaction, nothing is sent inside the request; limit C (5 stored messages an hour per address) -> 429 with `Retry-After` |

## Administration (all 404 to anyone who may not use them)

| Method and path                                 | Caller                         | Notes                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/api/admin/users`                          | metr, admin                    | list with statuses; `q` (search), `status` (one status only), `page`, `limit`                                                                                                                                                                                                                                  |
| PATCH `/api/admin/users/:id/status`             | metr, admin                    | `{status}`; rules of ADMIN.md 1 and 2 decide; superuser row returns 403 `protected`                                                                                                                                                                                                                            |
| PATCH `/api/admin/users/:id/access`             | metr, admin                    | `{accessUntil: "YYYY-MM-DD" or null}` (T152): the last UTC day the paid lectures are open to the account; audit `access_until_changed`; 400 for a day that is not real; 403 `reason` self, protected, rank (the temporary password's rule); a status change that opens lectures sets it by itself (+100 years) |
| POST `/api/admin/users/:id/temp-password`       | metr, admin                    | -> 200 `{password, expiresAt}` shown once (80 bits, `XXXX-XXXX-XXXX-XXXX`); sets `must_change` and a 30-day expiry; ends the account's sessions; 403 `reason` self, protected, rank                                                                                                                            |
| GET/POST/PATCH/DELETE `/api/admin/posts[/:id]`  | metr, admin                    | `PATCH` needs `If-Match: <updated_at>`; 409 on a stale save                                                                                                                                                                                                                                                    |
| GET/POST/PATCH/DELETE `/api/admin/videos[/:id]` | metr, admin                    | same; `PUT .../file` streams an upload with its own size limit                                                                                                                                                                                                                                                 |
| POST `/api/admin/preview`                       | metr, admin                    | `{markdown}` -> 200 `{html}` through the save-time renderer                                                                                                                                                                                                                                                    |
| GET `/api/admin/feedback`                       | metr, admin                    | one page of the stored messages and their count, newest first: `?page=` (from 1), `?limit=` (20 when not given, 50 at most), `?q=` (a case-blind substring of the text, the name or the contact, at most 100 characters; empty or absent is every message); `{items: [{id, body, name, contact, subject, receivedAt, addressPrefix, mailedAt, mailError}], total}`, `total` counting the messages the search matched, the network part of the address only; no-store (T107, paged and searched 2026-10-13)                                                                                                                                                                                                                                                                                        |
| GET `/api/admin/settings` | superuser | -> 200 `{feedbackRecipient, recipientPending, membersBlockMode}`; `recipientPending` is `{address, expiresAt}` or null; no-store (T105) |
| PUT `/api/admin/settings` | superuser | `{password, membersBlockMode: "locked"\|"hidden"}` -> 200 the settings; `{password, feedbackRecipient}` -> 202 `{recipientPending}` and an 8-digit code mailed to the NEW address and a warning (without the code) to the OLD one, the active recipient unchanged until it is confirmed; the password is re-entered in the same request (400 `password` with the tries left, 429 in a pause); a bare single address of at most 254 characters, not the current one, else 400 `feedbackRecipient`; a second request replaces the first; both fields in one request are applied together or not at all, and a request with neither is 400 with no field; the answer is always the whole state, and the hash of the code is never in it (T105, built T110 2026-10-13) |
| POST `/api/admin/settings/recipient/confirm` | superuser | `{code}` -> 200 the settings, the recipient is the new address, the OLD address is mailed that it changed; a wrong code is 400 `code` with `attemptsLeft` (0 when it was the fifth, which voids the request), 30 minutes void it too, a code works once; a code that is not eight digits is 400 `code` and costs no try; no request waiting is 400 `code` without `attemptsLeft` (T105, built T110 2026-10-13) |
| POST `/api/admin/superuser/handover`            | superuser                      | `{password, toUserId}`; the target must be an admin                                                                                                                                                                                                                                                            |
| POST `/api/account/handover/accept`             | the target                     | `{password}`                                                                                                                                                                                                                                                                                                   |
| POST `/api/account/handover/cancel`             | the superuser or the target    | `{}`                                                                                                                                                                                                                                                                                                           |
| POST `/api/admin/superuser/recovery-codes`      | superuser                      | `{password}` -> a new set shown once; the old set is void                                                                                                                                                                                                                                                      |
| GET `/api/setup/state`                          | anyone                         | -> 200 `{open}`; open while no account holds the role, or while the emergency switch is open (`ALLOW_SUPERUSER_SETUP=1` together with `SETUP_CODE`, 30 minutes after the start, one use; T170); says nothing about the code                                                                                    |
| POST `/api/setup`                               | anyone, while the door is open | `{code, email, password}` -> 200 `{codes}` (ten, shown once); 404 when the door is shut; one 400 for a wrong code; 400 `field` `email` or `password` for the fields; 429 per address 5 in 15 minutes and 30 an hour in all                                                                                     |
| POST `/api/superuser/recover`                   | anyone                         | `{identifier, code, newPassword}` -> 200 `{codes}` (the fresh set, shown once); one 400 for every failure; per address 5 in 15 minutes and 30 an hour in all                                                                                                                                                   |
| GET `/api/account/handover`                     | member                         | -> 200 `{handover, recoveryCodesLeft}`: the open request the account is a side of, or null; the number of unspent recovery codes for the superuser, null for everyone else                                                                                                                                     |

## Posts and videos in the panel (written with T095, 2026-10-12)

The table above names the routes; this is their shape. Every route answers 404 `not_found` to anyone who is not a metr or
an admin with a full session (a visitor, a limited session, a guest, a student, an expert, a blocked account); an
editor's own refusals are the ones named below. Answers carry `Cache-Control: no-store`. An entry is addressed by its
numeric `id` in the path; its `slug` is chosen at creation and never changes (a comment thread, a link and a search
result all hang on it).

Post and video fields (JSON, camelCase): `slug` (create only), `title`, `description`, `publishedAt` (a timestamp with
its offset), `tags`, `categories`, `audience` (`everyone`, `members`, `restricted`, `hidden`; `hidden` is the draft),
`statuses` (the named statuses of a `restricted` entry), `userIds` (the named people), `teaser`, and `body` (Markdown). A
video adds `paid`, `availableUntil` (`YYYY-MM-DD` or null, T152) and `membersOnly` (Markdown or null). The rules of
`server/src/content/rules.ts` decide what is accepted; a save that breaks them is 400 `invalid_input` with
`problems: [{field, code}]`, the codes of the content Worker, and writes nothing.

| Method and path                              | Body -> result                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/api/admin/{posts,videos}`              | `q`, `page`, `limit`, `deleted=1` (only the deleted ones) -> 200 `{items: [{id, slug, title, publishedAt, updatedAt, audience, deleted}], total}`                                                                                                                                                                                                    |
| GET `/api/admin/{posts,videos}/:id`          | -> 200 `{post}` or `{video}` with every field above, `updatedAt`, `deleted`; header `ETag: "<updatedAt>"`; a deleted entry is readable                                                                                                                                                                                                               |
| POST `/api/admin/{posts,videos}`             | the fields, `slug` included -> 201 with the entry; 409 `conflict` `reason: "exists"` for a taken slug, a deleted entry's too                                                                                                                                                                                                                         |
| PATCH `/api/admin/{posts,videos}/:id`        | any subset of the fields; `If-Match` is required (400 `invalid_input` without it); 409 `conflict` `reason: "stale"` with the current `updatedAt` when another save came first, nothing written; `slug` is refused as `unknown`                                                                                                                       |
| DELETE `/api/admin/{posts,videos}/:id`       | -> 200; sets `deleted_at`: the entry is gone from every public surface (404) and its address stays taken                                                                                                                                                                                                                                             |
| POST `/api/admin/{posts,videos}/:id/restore` | -> 200; clears `deleted_at`                                                                                                                                                                                                                                                                                                                          |
| POST `/api/admin/preview`                    | `{markdown}` -> 200 `{html}`: exactly what a save of the same text stores in `body_html`; raw HTML and script-scheme links are gone                                                                                                                                                                                                                  |
| PUT `/api/admin/videos/:id/source`           | `{provider, reference, replace?}` -> 200 with the video; 409 `conflict` `reason: "has_file"` while a file is registered unless `replace` is true (the file row goes, the bytes stay on the volume)                                                                                                                                                   |
| POST `/api/admin/videos/:id/copy`            | `{slug}` -> 201 with the new video: the text, tags, paid flag, date-until, members-only block, named people and the source (the link row or the file row) of the original, as a draft (`audience: "hidden"`); the reference is copied inside the database and never sent; 409 `conflict` `reason: "exists"`; 400 `invalid_input` for a bad slug (T175) |
| PUT `/api/admin/images?name=`                | the bytes, `Content-Type` one of `image/png`, `image/jpeg`, `image/webp`, `image/gif`, a `Content-Length` -> 201 (200 when the same bytes are already there) `{image: {url, name, sizeBytes, uploadedAt}, existing}`, `url` being `/images/u/<sha256>.<ext>`; 400 `invalid_input` for another type or no length; 413 `too_large` `reason` `over_cap` (`IMAGE_UPLOAD_CAP_MB`, default 5 MiB) or `no_space`, decided from `Content-Length`; 422 `unprocessable` `reason: "not_an_image"` when the first bytes are not those of the declared type (T143) |
| GET `/api/admin/images`                      | `?page&limit` -> 200 `{total, capBytes, items: [{url, name, sizeBytes, uploadedAt}]}`, newest first (T143). Both are 404 to anyone who is not a metr or an admin |
| GET `/images/u/<sha256>.<ext>`               | public; the picture, `nosniff`, `Cache-Control: public, max-age=31536000, immutable`; 404 otherwise (T143) |
| GET `/api/admin/videos/space`                | -> 200 `{freeBytes, totalBytes, reserveBytes, capBytes, roomBytes}` (T138): the free space of the video volume, the reserve (`VIDEO_FREE_RESERVE_MB`, default 2 GiB), the cap and the largest file taken now; 503 `unavailable` with no volume configured                                                                                                                                                                                                                                                                           |
| PUT `/api/admin/videos/:id/file`             | the bytes, `Content-Type: video/mp4`, a `Content-Length`, streamed to the volume -> 200 with the video; 413 `too_large` over the cap (`reason: "over_cap"`) or when less than the reserve would be left (`reason: "no_space"`, with `freeBytes` and `reserveBytes`), both decided from `Content-Length` before a byte is read; 422 `unprocessable` `reason: "not_faststart"` (nothing registered, nothing left on the volume); 409 `conflict` `reason: "has_source"` unless `?replace=1` |

A video's `source` in an answer is `{kind: "none"}`, `{kind: "file", sizeBytes}` or
`{kind: "link", provider, referenceSet: true, reference}`. Changed 2026-10-12 at the owner's order: the `reference` of a
paid lecture is in these admin answers too (an editor cannot change what he cannot see); the list of the panel, the public
API and pages and the audit rows never carry it. The `reference` of a save may be an id, a page address or an embed snippet of the provider; it is stored as the provider canonical id (YouTube 11 characters, VK `<owner>_<id>[_<hash>]`, Rutube 32 hex with an optional `?p=`, Vimeo `<id>[/<hash>]`, ok.ru the number, Yandex Disk `https://disk.yandex.ru/i/<key>`), and a text that is none of these is a 400 `invalid_input` with `{field: "source", code: "reference_shape"}` (T175). The providers are `youtube`, `vk`, `rutube`, `yandex-disk`, `vimeo`, `ok`. Only
these admin routes (posts, videos, preview) take a JSON body above 100 KB, up to 512 KiB; the upload has its own cap (the
environment variable `VIDEO_UPLOAD_CAP_MB`, default 500 MiB; since T098), and the cross-site guard accepts a non-JSON
body on that one path (the Origin and fetch-metadata checks stay). Every write is one audit row written in the same transaction: `entry_created`,
`entry_updated`, `entry_deleted`, `entry_restored`, `video_source_set`, `video_file_uploaded`, with the entry as target
and the names of the changed fields, never a text or a reference.

## Pages added (server rendered, each with a trailing slash)

`/admin/posts/`, `/admin/users/`, `/admin/feedback/`, `/admin/settings/`, `/auth/signin/`, `/auth/signup/`,
`/auth/account/` (status, sessions, handover acceptance, forced password change). The existing addresses of
`reference/hugo-routes.txt` are unchanged. Each admin page answers 404, not a login redirect, to a viewer who may not
use it.

## Commands on the server (not HTTP)

| Command                        | Effect                                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| `superuser create`             | creates the one superuser; prompts for the password on the terminal; prints the recovery codes once |
| `superuser set-password`       | sets a new password for it                                                                          |
| `superuser hand-over <email>`  | moves the role to another account at once (server access is the authority)                          |
| `import content`               | repeatable import of the Markdown files into rows; idempotent                                       |
| `import members <file>`        | creates guest accounts without passwords from the exported addresses; idempotent                    |
| `video register <slug> <path>` | registers a copied file against a video entry after the faststart check                             |
| `migrate`                      | runs the postgrator migrations; never run automatically at start                                    |
