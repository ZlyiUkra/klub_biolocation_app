# Quickstart: validating the self-hosted site

A run-and-check guide, not an implementation. The commands named here are the ones phase 0 and the phases after it
are to create; until a phase is done, its commands do not exist. Contracts are in
[contracts/http-api.md](contracts/http-api.md) and tables in [data-model.md](data-model.md).

## Prerequisites

- Windows 11 with Docker Desktop running, and Node 20 (`engines: >=20.0.0 <21`).
- `npm ci` done; `node_modules/astro/package.json` reports 4.x.
- A local `.env` file for the server, git-ignored, with the database URL, a session secret and the sending mailbox
  (never committed; the example file lists the names only).

## Phase 0: skeleton

1. `docker compose -f compose.dev.yml up -d db` - PostgreSQL 16 starts and reports healthy.
2. `npm run db:migrate` - postgrator creates the tables and records the applied version.
3. `npm run server:dev` - Express listens; `curl http://localhost:<port>/healthz` answers 200 `{"ok":true}`.
4. `npm run test:server` - the `node:test` suite passes.
5. `npm run dev` - the site behaves as before.

Look at: the health route answers 200; stopping the database makes it answer 503; the migrations table lists every
file with its checksum.

## Phase 1: posts from the database

1. `npm run import:content` - rows appear for the 24 posts and the videos; run it twice: no duplicates.
2. `npm run check:render` - the stored HTML of every post is byte-identical to today's build, or the differences are
   listed and accepted.
3. `npm run build` with the database stopped - succeeds (the build never reads the store).
4. `npm run check:pages` over HTTP - the pagination check passes.

Look at: `/`, `/posts/`, a tag, the categories, a post with a formula and a code block, the feed and the search index
match the current site apart from asset hashes. Save a post through the API and see it on the lists.

## Phase 2: own sign-in

1. Sign up with an address and a password of 8 or more characters: the account is a guest, signed in.
2. Sign in with the login name instead of the address, once one is set.
3. Sign in on a second browser; end that session from the first on the account page.
4. Enter a wrong password until the limit: the account is slowed, not locked out for good.
5. `import members <file>`: guest accounts exist with no password; an administrator issues a temporary password; the
   member signs in with it, is sent to the change form and cannot reach anything else; the password stops working
   after the change.

Look at: the header shows the right icon on first paint; no Clerk chunk is in `dist/`.

## Phase 3: statuses and the superuser

1. `superuser create` on the server; keep the printed codes offline.
2. As that account, give a member student; as a metr, try to make a metr (refused), block a member, lift it.
3. Run the rehearsals of [security-review-superuser.md](security-review-superuser.md) section 6 on a copy of the data.

## Phase 4: video

1. `npm run video:register -- <slug> <file>` after copying an MP4 to the volume (`VIDEO_ROOT`); add `--replace-source` for a video that still has an embed id or a paid link.
2. As a student, play and seek; as a guest, see the placeholder; block the student and seek again: refused.
3. Request the internal location directly: 404.

## Phase 5: visibility

1. Create entries with each audience and a named-person entry.
2. Open lists, tags, categories, search, feeds and sitemap as a guest, each status, the named person and a blocked
   member; the visible set is identical on every surface for each viewer.

By hand (T093, the owner's check), before the admin page of plan phase 6 can set an audience: the development database
needs one post for one named member. Written 2026-10-12.

1. Have two ordinary accounts (two browsers or profiles, or one browser and a private window): the person to be named
   (member A) and another member (member B); register them on `/auth/signup/` if they do not exist. The admin
   account and a guest (signed out) are the other viewers.
2. Name member A on one post (here `water-dowsing`; any slug of a post works). In `psql`, started with
   `docker compose -f compose.dev.yml exec db psql -U klub klub`:

   ```sql
   begin;
   update entries set audience = 'restricted', teaser = false where kind = 'post' and slug = 'water-dowsing';
   insert into entry_audience_users (entry_id, user_id)
     select e.id, u.id from entries e, users u
      where e.kind = 'post' and e.slug = 'water-dowsing' and u.email = 'MEMBER-A-EMAIL';
   commit;
   ```

   The statement must answer `INSERT 0 1`; `INSERT 0 0` means the address matched no account.
3. As member A: `/posts/` lists it, `/search/` finds it by its title, `/rss.xml` has its item, `/posts/water-dowsing/`
   opens in full.
4. As member B, as a guest, as the blocked account and as the admin (a metr or an admin is not let in by status
   alone): none of `/posts/`, its year page, `/tags/<one of its tags>/`, `/search/`, `/rss.xml` and `/sitemap-0.xml`
   shows it, and `/posts/water-dowsing/` answers 404. A signed-out visitor may need up to 10 seconds to stop seeing it
   in the feed if the page was fetched just before the change.
5. Put it back:

   ```sql
   begin;
   delete from entry_audience_users
    where entry_id = (select id from entries where kind = 'post' and slug = 'water-dowsing');
   update entries set audience = 'everyone' where kind = 'post' and slug = 'water-dowsing';
   commit;
   ```

## Interface languages (plan phase 6, first; added 2026-10-12)

1. In a fresh browser profile open the home page: the interface is in English.
2. Press the switch beside the menu: everything that is interface turns Russian at once; the posts and the video texts
   do not change.
3. Reload, open a post, the search page and a second tab: all in Russian from the first paint.
4. Half-fill the feedback form and switch: the text stays. Sign in with a wrong password: the message is in the chosen
   language.
5. Open the account page and an admin page in both languages; switch back to English and reload: English stays.
6. `npm run check:lang` passes.

## Phase 6 and 7: content admin, comments, feedback, settings

1. Create, preview and save a post as a metr; edit it from two sessions: the second gets 409.
2. Upload a large MP4; it plays.
3. Write and hide a comment; send feedback and see it on the admin page and in the mailbox; send a burst: refused with
   nothing stored; stop the mail: the message is still stored.
   Changed 2026-10-13: until a mailbox is set on the real server (T111, plan phase 8) "the mailbox" is the development
   outbox, a folder of text files (`MAIL_OUTBOX_DIR`); the real mailbox is part of the phase 8 check.
4. As the superuser, change the feedback recipient: it works only after the emailed code is entered.

## Phase 8: server and switch

1. Production Compose up on the chosen server; HTTPS answers on the new domain.
2. Restore from backup onto a clean volume: every account, entry, comment and file is back.
3. Final import, then the last Pages build: every old address redirects to the new one.

## Cross-cutting checks after every phase

- `npm run fix`, `npm run check`, `npm run build`, and `npm run dev` started once.
- The route-parity diff of CLAUDE.md: no `<` line against `reference/hugo-routes.txt`.
- No secret or personal address in `git diff` or in any file of `dist/client/`.
- README, MIGRATION-PLAN, `REWRITE.md` and the session log updated; each edit carries its comment.
