---
consilium: 2026-10-02
topic: An admin panel on the static site - editors without GitHub add, edit and delete posts; superusers grant the rights
slug: admin-posts
verdict: approved-with-conditions
route: direct-verified
archetypes:
  nitpicker: ok
  security: ok
  performance: ok
  best-practices: ok
  pragmatist: ok
---

# An admin panel for posts

## Agreed proposal

People the owner trusts, who have no GitHub account and are not developers, sign in on the club's site and add new
posts, edit existing ones and delete them, through a form in the site's own look, in the light or the dark theme as
each of them prefers. A saved post appears on the site by itself a couple of minutes later, with no review step, and
from then on it is part of the site like a post written by hand: it is found by the site search, its tags join the
tag cloud and the tag pages, and it appears in its categories, the feed and the sitemap. Rights are held by people,
not by a shared password: a superuser decides who may edit posts and who else is a superuser, from the site itself,
and the site never ends up with nobody able to administer it. The way a saved post reaches the live site is one
replaceable step, because the owner expects the hosting to change; videos follow later in the same manner.

## Bounds and constraints

- In scope now: creating, editing and deleting posts (Markdown with front matter, `src/content/posts/`), images of a
  post (`public/images/posts/<slug>/`), the editor and superuser roles, granting and revoking them from the site, the
  admin pages, two new Cloudflare Workers, local runners with stand-ins for GitHub and Clerk, tests, documents.
- Out of scope now: videos (add, edit, delete - later, by the same pattern), a preview rendered by a second Markdown
  pipeline, a rate limiter (Durable Object or KV), comments.
- The site stays `output: "static"` on GitHub Pages; Node 20, Astro 4.16; no new npm dependency; the Workers are
  plain JavaScript files without imports, deployed by pasting, like `workers/video-access/worker.mjs`.
- The owner's decisions of 2026-10-02, not reopened: editors have no GitHub access; an own system, not a hosted CMS;
  a save publishes without review; GitHub Actions is the publishing mechanism for now only; granting rights from the
  site is needed now; the admin pages follow the site's light and dark themes with the same switch; posts saved
  from the admin must appear in the search and in the tag cloud.
- The Clerk instance is a development instance, and the owner does not know whether there will be a production one.
  The design must work on the development instance; its limits are to be checked, not assumed.
- Alternatives refused: a hosted Pages CMS (a third party gets write access to the repository and keeps the list of
  editors), Decap or Sveltia (every editor needs a GitHub account), content outside git (posts would leave the
  build: search index, feed, tag and category pages, pagination, sitemap).

## Design

- **Pages.** `/admin/posts/` (list, create, edit, delete) and `/admin/users/` (superusers only: grant and revoke).
  Both use `src/layouts/Base.astro` as `src/pages/auth/signin.astro` does, so the theme bootstrap, the switch and the
  palette are the site's; admin styles go in a plain `src/styles/admin.css` on the site's variables (`--page-bg`,
  `--panel-bg`), never on `bg-white` utilities, which `custom.css` overrides with `!important`. The form is rendered
  in markup, not built by the script. Clerk comes from `getClerk()` in the page scripts only; the pages are
  `noindex` and not in the menu. Hiding the forms from people without a role is presentation; the Workers enforce.
- **Roles.** One key in Clerk public metadata, `role`: `"superuser"` or `"editor"` (absent means none), carried into
  the session token as the claim `role` through the token template, next to `member` and `memberUntil`
  (CLERK-DASHBOARD.md 7.2). A superuser may do everything an editor may. The role names live in one module of the
  site; the Workers' copies are named in their headers and checked by a drift test.
- **The content Worker** (`workers/content-admin/worker.mjs`, new). Holds the GitHub token and nothing else secret.
  Routes: list posts, read a post with its sha, create, update, delete. It verifies the session token exactly as
  video-access does (a copy of `verifySession` and its helpers, compared with the original by a test), requires
  `role` to be `editor` or `superuser`, validates, and commits through one function, `publish(files, message)`,
  which today writes to `main` of the repository and is the only place to change when the hosting changes.
- **The roles Worker** (`workers/roles/worker.mjs`, new). Holds the Clerk secret key of the instance and the setting
  `SUPERUSER_IDS`, and nothing else. Routes: list the users who hold a role, find a user by email, set or remove a
  role. Only a superuser may call it.
- **The video Worker** stays as it is and holds only `VIDEOS`. No Worker holds two of the three secrets.
- **Publication.** Every save is a commit on `main`, which starts the existing workflow. The page waits for the
  saved version to be live (below), with a time limit.

## Remarks that survived

- [confirmed] Raw HTML in a post body reaches every visitor's page unsanitised, on the origin that also serves the
  sign-in pages; a stolen editor session would become a script on the whole site. The content Worker refuses a body
  with an HTML tag outside code spans and fenced code, and link targets with `javascript:` or `data:`. Measured
  2026-10-02: none of the 24 existing posts has raw HTML outside code, so the rule refuses nothing that exists
  (security 1, nitpicker 1, best-practices 3, pragmatist after examination).
- [confirmed] The GitHub token can write any path of the repository, `package.json` and `astro.config.mjs` included,
  whose code runs in the build that publishes the site. The content Worker allows, by default-deny, only
  `src/content/posts/<slug>.md` and `public/images/posts/<slug>/<generated name>`, builds the tree from the current
  head of `main` and checks that the commit touches nothing else (security 2, nitpicker 6).
- [confirmed] The Worker cannot import the zod schema, so it carries a copy of the rules, and a no-network test feeds
  the same valid and invalid cases to the copy and to the real schema. To make the real schema importable outside
  Astro, the fields of `posts` move from `src/content/config.ts` to a file of their own that imports `z` from
  `astro/zod` (approved by the owner on 2026-10-02). `zod` 3.25.76 is in `node_modules` as Astro's dependency
  (nitpicker 1, best-practices 2, performance 10, pragmatist 7).
- [confirmed] The Worker writes the front matter itself from typed fields: quoted strings, no line breaks in a
  one-line field, length limits, and only the fields of the `posts` schema - never `access`, `videoId` or `layout`
  (security 4).
- [confirmed] The slug is typed by the editor, not transliterated: Latin lower case, digits and hyphens, a length
  limit, never a bare year, not a reserved name, unique on create (the create fails if the file exists), and never
  changed by an edit, because the address and the Disqus thread hang on it (`postUrl()`, CLAUDE.md) (nitpicker 9,
  security 3, pragmatist 11).
- [confirmed] An edit changes only the lines of the fields the form owns and keeps the rest of the front matter as
  it was, so the YAML comments in 3 of the 24 posts and fields the form does not show survive. The owner's rule is
  that existing comments are not deleted; the owner left the choice to the council (best-practices 4, nitpicker 3;
  pragmatist 8 proposed accepting the loss).
- [confirmed] A file that passes the Worker but fails the build stops every later deploy. The page waits at most
  about 8 minutes, then says the post is not published and that the owner should be told; the documents give the
  revert (`git revert` by the owner or the colleague). The Actions API is not used, because Actions is temporary
  (nitpicker 2, best-practices 3).
- [confirmed] After an edit the post's address already answers 200 with the old version, so a 200 proves nothing.
  The page fetches the post with `cache: "no-store"` and a query that defeats caches, and compares a marker of the
  saved version; which marker (a stamped `lastmod` shown in the head, or the saved title and description in the
  page) is decided when building, by looking at `dist/` (performance 5; `article:modified_time` is absent from a
  post without `lastmod`, measured 2026-10-02).
- [confirmed] Concurrency: updates of `main` are fast-forward only, never forced, so nothing of the colleague's is
  lost; a moved head is re-read and the save retried once; a stale sha of the file answers 409 and the page asks to
  reload (nitpicker 8, security 10, best-practices 9).
- [confirmed] Images: resized in the browser (the canvas also drops EXIF), at most about 300 KB each and 10 a post,
  jpeg, png or webp checked by their first bytes, never SVG, names generated by the Worker, sizes checked against
  `Content-Length` before the body is parsed, base64 passed on without decoding (security 8, performance 1-2,
  pragmatist 1).
- [confirmed] The GitHub token is a fine-grained personal access token made by the repository's owner (the
  colleague) for this one repository, with "Contents: read and write" only and an expiry date that the documents
  record; a classic token is refused because it reaches every repository of its maker (security, pragmatist 5,
  best-practices 10).
- [confirmed] Everything is built and shown on this machine first, with stand-ins for GitHub and for Clerk's Backend
  API, before any secret exists (pragmatist, best-practices 11, nitpicker 5).
- [confirmed] Roles: the first superusers are the Clerk user ids in `SUPERUSER_IDS`, a setting of the roles Worker
  that only the owner changes in Cloudflare; those ids are superusers whatever the metadata says and can never be
  demoted from the site. Nobody changes their own role; a superuser cannot be demoted if none would be left; the
  Worker writes only the `role` key and keeps the rest of the public metadata (`member`, `memberUntil`); every
  change records who did it, to whom, from what to what and when; a demotion also revokes the person's sessions
  (security R2.2-R2.7, nitpicker R2.1-R2.7, best-practices R2).
- [confirmed] A newly registered account carries no `role` claim, and nothing a user can write reaches it: the
  template reads `public_metadata.role` only (security R2.9).
- [confirmed] Posts saved from the admin go through the same build as hand-written ones, so the search index, the
  tag cloud, the tag and category pages, the feed and the sitemap include them with no extra code. The form offers
  the existing tags and categories, so that a new post joins them instead of starting near-duplicates (owner,
  2026-10-02).

## Marked by the examiner

- [weak, withdrawn] "Writing `.github/workflows` executes code": a separate "Workflows" permission guards that
  folder (from memory, to be checked at plan time); the harm through `package.json` and `astro.config.mjs` stands,
  and the allow-list closes both.
- [weak, withdrawn] "A queue of saves uses up Actions minutes": the repository is public and its minutes are free.
- [weak] A rate limiter and an `iat` freshness check: deferred; the size and count caps stay.
- [weak, withdrawn] zod or `wrangler` inside the Worker: a new dependency and a build step for a file that is pasted.
- [weak, withdrawn] "A shared module for the JWT check": the Workers are single pasted files without imports.
- [conflicts, decided] One Worker with a router (pragmatist, performance) against separate Workers (security,
  nitpicker, best-practices after the roles requirement). The owner did not know which is better; decided for
  separate Workers, because with the Clerk secret key in play three secrets would otherwise share one process.
  Cost: three files to paste and the JWT check in three copies, held equal by a test.
- [to check] Clerk Backend API: whether the metadata endpoint merges or replaces, its rate limits, and the limits of
  a development instance (users, sessions). The documentation server was unreachable on 2026-10-02.

## Amended after the council, the same day (the owner's status model)

- During the building the owner replaced the two roles of this verdict (superuser, editor) with statuses: `guest`
  (every new account, which has no status), `student`, `expert`, `master`, `metr`, `admin`, and `blocked` (signed up,
  but no access to any material, and told who closed it - a metr or an admin). A metr or an admin assigns statuses; only
  a metr or an admin may add, edit and delete posts. The key is `status` in public metadata and the claim `status` in
  the session token, instead of `role`.
- The rules of "Remarks that survived" carry over: the first admins are the ids in `ADMIN_IDS` (the verdict's
  `SUPERUSER_IDS`), never changeable from the site, and the list may not be empty, which is what keeps the last admin;
  nobody changes their own status; only the `status` keys are written, by Clerk's merge, so `member` and `memberUntil`
  survive. Added by the same model: a metr may change only guest, student, expert, master and blocked, only to one of
  those, and may not lift an admin's block; a blocked member is refused paid lectures by the video Worker.
- Implemented as `workers/statuses/` (the verdict's "roles Worker") and `/admin/users/`; ADMIN.md is the how-to.
- Session revocation on a demotion was not built: a new status reaches the token within a minute (Clerk renews it every
  60 seconds), which the owner's model does not need to beat; recorded in ADMIN.md section 6.
- Later the same day the owner completed the model: `guest` is never given, only started as, so neither a metr nor an
  admin may set it (to take access away, a member is blocked); a metr gives student, expert, master or blocked and
  never metr or admin; an admin gives every status but guest, metr and admin included; every status but guest and
  blocked opens the paid lectures, with no end date, beside the older `member`/`memberUntil` record; the account page
  shows the status; the panel runs locally and on GitHub Pages. Implemented as VERSION 2026-10-02.2 of the status and
  video Workers, with `site.admin.lectureViewers` and its drift check.

## Deliberately not done

- No hosted CMS, no GitHub accounts for editors, no content outside git (above).
- No Markdown preview in the browser: it would be a second renderer, drifting from the build (remark-math,
  rehype-katex). The page links to the published post instead.
- No reading of the GitHub Actions status: Actions is temporary; the page waits for the post itself.

## Execution route

- Council's recommendation: direct-verified (security, performance, pragmatist); speckit (nitpicker, and
  best-practices for the specification only).
- Owner's decision, 2026-10-02: direct-verified.
- Increments, each shown on this machine before the next:
  1. Create a text post: `/admin/posts/`, the content Worker, the stand-in for GitHub, the drift test.
  2. Edit and delete posts.
  3. Roles from the site: `/admin/users/`, the roles Worker, the stand-in for Clerk's Backend API.
  4. Images.
  5. The live site: the Cloudflare account, the token from the colleague, the Workers deployed, the addresses in
     `src/config.ts`, the checks on the live site.
- Verification list:
  - A request to each Worker without a token, with an expired or not-yet-valid one, a wrong `iss` or `azp`, an
    unknown `kid`, no `sid`, a pending `sts`, a token without a role, with `role` as another type, and with `member`
    only, is refused, and the stand-in records no write.
  - The copies of `verifySession` in the three Workers are equal (a test), and the role names in the Workers equal
    the site's.
  - Hostile bodies are refused: a script tag, `onerror`, an iframe, `javascript:` and `data:` links,
    `data-members-only`.
  - Paths: `..`, a backslash, encoded slashes, a trailing dot, a capital letter, a bare year, a reserved name, an
    existing slug on create, a changed slug on edit - all refused; nothing outside the two allowed folders is ever
    written.
  - Front matter: a title with a colon, quotes, `#`, a line break, `---`; a date written with `+03:00`; the file's
    line endings match the existing posts; the written file passes the real schema.
  - An edit of each of the 3 posts with YAML comments keeps the comments and the other fields byte for byte.
  - A stale sha answers 409; a moved head is retried once and never forced.
  - Images: a 6 MB photo comes out under the cap; SVG, a renamed HTML file, an 11th image and an oversized body are
    refused.
  - Roles: a non-superuser cannot call the roles Worker; nobody changes their own role; the last superuser and the
    ids in `SUPERUSER_IDS` cannot be demoted; `member` and `memberUntil` survive a role change; the change is
    recorded; a new account has no role claim.
  - The admin pages in both themes (screenshots), and no guest page gains the admin script or Clerk (`dist/`).
  - After a save on the live site: the post is found by `/search/`, its tags are in the cloud and on
    `/tags/<tag>/`, it is in its categories, the feed and the sitemap; an edit is detected as live by the marker; a
    deleted post's address answers 404 and its tags drop out of the cloud when it was their only post.
  - `npm run check`, `npm run build`, `npm run check:pages`, `npm run check:video-access` and the new checks pass;
    `npm run dev` starts; the Workers' CPU is read in the Cloudflare dashboard after deployment.
