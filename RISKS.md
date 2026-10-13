# Accepted risks

Risks the owner has looked at and accepted in writing, each with the date of the decision, what makes it acceptable,
and when it is looked at again. A risk leaves this file only when the reason for it is gone, and the entry then says
so instead of disappearing. Written on 2026-10-09 with the consilium verdict
`.specify/consilium/2026-10-09-self-hosted-rewrite.md`.

## 1. Node 20 after its end of life

- Accepted by the owner on 2026-10-09. Review on 2027-04-09, and again before the self-hosted site goes live
  (phase 8 of the verdict), whichever comes first.
- The facts on 2026-10-09: Node 20 reached its end of life on 2026-04-30; its last release is 20.20.2 of 2026-03-24.
  The security release of July 2026 shipped for the 26, 24 and 22 lines only and says that end-of-life versions are
  always affected (https://nodejs.org/en/blog/vulnerability/july-2026-security-releases). The official Docker images
  are built for 26, 24 and 22 only (https://raw.githubusercontent.com/nodejs/docker-node/main/versions.json); the tag
  `node:20.20.2-bookworm-slim` can still be pulled but is no longer rebuilt.
- Why it stays: the project runs on Node 20 on every machine it is developed on and will not move (CLAUDE.md, "Hard
  constraints"); the backend of the rewrite is written for Node 20 too.
- What makes it acceptable, all required before the site faces the internet: Node is never reachable from outside,
  only through nginx, and its port is not published; the image is `node:20.20.2-bookworm-slim` pinned by digest, with
  `apt-get upgrade` on every build so the Debian layer keeps its security updates (Debian 12 is supported until
  2028-06-30); the container runs as `node`, with a read-only root and dropped capabilities; every other dependency is
  on its latest patch release, and `npm audit` runs on every build. Recommended in addition: a weekly rebuild.
- What it does not cover: a flaw in Node's own HTTP parser or runtime found after 20.20.2 stays unpatched. nginx in
  front narrows that, it does not remove it.
- Reviewed 2026-10-13 (T130): still accepted, no date renewed. The conditions above are all work of plan phase 8 and none
  is built yet (the image and its user, T115; the compose file that publishes no port, T116; the proxy, T117; `npm audit`
  on every build and the weekly rebuild, T156), so the entry stays open until the site goes live. The facts of
  2026-10-09 come from nodejs.org pages and were not re-read: the documentation server holds the API reference of each
  major version, not the release schedule. Next review: 2027-04-09 (178 days), or before going live.

## 2. The post validator of the admin panel can be bypassed (stored XSS) - ended 2026-10-13

- Found on 2026-10-09 by the consilium and reproduced against the real Markdown pipeline of the site. Not fixed, by
  the owner's decision of the same day: the rewrite replaces this code. If the rewrite does not go ahead, it must be
  fixed before the club's site is used with the admin panel.
- Where: `bodyProblem()` in `workers/content-admin/worker.mjs`, the check that is meant to refuse raw HTML outside
  code and links other than web, mail and the site's own paths (ADMIN.md 8). Its regular expressions read Markdown
  differently from the parser that renders it. Three cases pass the check and render as script or as a `javascript:`
  link: a code span that runs across a blank line, a code fence whose info string contains a backtick, and a
  reference link whose label contains an escaped bracket.
- What it allows: an editor (a metr) saves such a post; when an admin opens the page, the script runs as the admin on
  the site's origin and can call the statuses service on the admin's behalf, for example to make the metr an admin.
- Why it is not live today: the content-admin Worker is not deployed yet (ADMIN.md 7, "The live site (not done
  yet)"), so no post reaches the site through it.
- The fix, whichever code base it lands in: stop passing raw HTML through the Markdown pipeline and filter URL schemes
  on the parsed tree (a sanitizer such as `rehype-sanitize`), keeping the validator as a first gate only. More regular
  expressions would not close the class.
- Reproduced and pinned on 2026-10-12 (T094): `server/test/content-rules.test.ts` holds the three inputs as refusals of the first
  gate (red until T096 writes it) and sends them through the renderer, where the sanitizer already neutralises all three.
- **Ended 2026-10-13 (T130 review).** The reason is gone, and the entry stays as the record. T096 (2026-10-12) replaced
  the regular expressions with the renderer's own parse and the one sanitizer, which refuses the three inputs at the
  first gate (`server/src/content/rules.ts`); T100 (2026-10-12) deleted `workers/content-admin/`, the code this entry
  is about. `server/test/content-rules.test.ts` passes 94 of 94 today, the three inputs among them. What stays true
  is the lesson in "The fix": the sanitizer on the parsed tree is the control, and the first gate is only a courtesy.

## 3. A leaked recovery code takes the superuser account

- Recorded on 2026-10-11, at the end of plan phase 3 (T073), from the security review of the
  superuser (`specs/001-self-hosted-club-site/security-review-superuser.md`) section 5. The design it belongs to is the one the owner chose on 2026-10-10 and
  2026-10-11 (the recovery codes as a way back with no command line, and the hand-over); the owner confirms this entry
  with the phase check T074. Review on 2027-04-11, and again before the self-hosted site goes live (phase 8 of the
  verdict), whichever comes first.
- The risk: whoever holds one unspent recovery code and knows the superuser's address or login can set a new password
  on `/auth/recover/` and sign in as the superuser. The waiting period of the hand-over does not apply to this path:
  recovery has to work when the owner has forgotten the password and has no other channel to wait on.
- What makes it acceptable: the codes are 80 random bits each, stored only as SHA-256, shown once and never again;
  a spent code and the rest of its set are void the moment one is used, and the answer to that request already
  carries a fresh set; every failure gets one and the same answer; the page is paused per address (5 failures in 15
  minutes) and by a global ceiling (30 an hour); a recovery ends every session of the account and sets a new
  password, so the owner's next sign-in with the old password fails, which is the sign that something happened, and
  it writes the audit row `recovery_code_used`. Guessing a code is not the risk (2^80); losing the paper is.
- What it does not cover: a code that leaks and is used before the owner notices still gives the account to the
  thief for that time, and the thief receives the fresh set of codes in the answer, so the owner is locked out until
  the server command (`npm run superuser -- set-password`) is run. Until mail exists (plan phase 9) nothing is
  announced by mail; the only signs are a failed sign-in and the audit log. The control is the owner's discipline: keep the codes on paper or in a password manager, away
  from the computer the site is run from, and make a new set (account page, section "Суперпользователь") whenever
  a copy may have been seen.
- What would end this entry: mail notification of both events at the account's address (phase 9), or the owner
  deciding to drop the codes and keep only the server command.
- Reviewed 2026-10-13 (T130): still holds, no date renewed. The numbers above match the code (five failures an address
  in fifteen minutes and thirty an hour in all, `server/src/auth/limits.ts`; 80-bit codes; every session ended).
  **Confirmed in writing by the owner on 2026-10-13**, as the entry describes it (the phase check T074 had been closed
  on 2026-10-11 without a hands-on walkthrough, so the confirmation was still owed). Next review: 2027-04-11 (180
  days), or before going live.

## 4. The setup door and its emergency switch

- Recorded on 2026-10-11 with T169, from the owner's choices of the same day (the code in `SETUP_CODE`, the emergency
  switch, the log code as a fallback); the owner confirms this entry with the phase check T074. Review on 2027-04-11,
  and again before the self-hosted site goes live (phase 8), whichever comes first.
- The risk: the page `/auth/setup/` is public while it is open, and whoever holds the code can become the superuser
  (while none exists) or, with `ALLOW_SUPERUSER_SETUP=1`, take the role from the holder. The code is therefore as
  secret as the server's own settings; a hosting's staff, or anyone who can read its settings panel or its log, can
  read it.
- What makes it acceptable: the door is shut for good by the first superuser, with no timer and no restart (the state
  is read from the database on every request) unless the emergency switch is on, which is limited as below; a code in
  the settings is refused under 24 characters; a generated code is 128 bits and lives an hour; the code is never in
  the database, a response or the audit log, and is compared in constant time; failures are paused (5 an address in 15
  minutes, 30 an hour in all) and every failure has one answer; the emergency switch is off unless the owner sets it,
  and a use of the door writes the audit rows `superuser_setup_used` and, for a replacement,
  `superuser_setup_replaced`.
- **The switch's three limits (the consilium of 2026-10-11, T170):** it works only together with `SETUP_CODE` (with no
  code from the settings the switch is ignored and the log says so, because a code printed in a log can be read by
  people who are not the owner); it works for 30 minutes after the server starts; and a use shuts it until the next
  start. So a forgotten switch is not a standing key, and a leaked log is not a key at all. The server also writes a
  note to its log when `SETUP_CODE` is still set while a superuser exists.
- What it does not cover: a leaked `SETUP_CODE` is a leaked key to the role until the first superuser exists, and,
  with the switch on, for the 30 minutes after a start and for one use. The owner removes `SETUP_CODE` after the first
  superuser exists and keeps `ALLOW_SUPERUSER_SETUP` off except for the minutes of an emergency; a log that is read by
  others shows the generated code while the door is open (the first superuser only).
- The way this fits with the other three ways (a server command, a hand-over from the pages, a recovery code) and
  what the four have in common is in `SUPERUSER.md`.
- What would end this entry: a deployment with a command line the owner always has (then the switch and the page may
  be removed), or the owner deciding to drop the setup door.
- Reviewed 2026-10-13 (T130): still holds, no date renewed. The numbers above match the code (the switch lives 30
  minutes after a start and works for one use; a code from the settings is refused under 24 characters; a generated
  one is 128 bits and lasts an hour; the same two failure windows as the recovery page). **Confirmed in writing by
  the owner on 2026-10-13**, as the entry describes it. Next review: 2027-04-11 (180 days), or before going live.

## 5. The licence of the reaction pictures is stated two ways by their source

- Accepted by the owner on 2026-10-13, who asked that nothing about it can become a conflict later. Review before the
  site goes live (phase 8 of the verdict), and again whenever the pictures are copied out of the site, changed, or
  published with the repository, whichever comes first.
- The facts on 2026-10-13: the six pictures in `public/images/reactions/` are files of Noto Emoji
  (https://github.com/googlefonts/noto-emoji, `2D/svg/`), copied unchanged. The `LICENSE` file of that repository has
  been the SIL Open Font License 1.1 since its commit "Update LICENSE to OFL" of 2024-07-29; its README still says
  that most image resources are under the Apache License 2.0, which was its `LICENSE` from 2015 to that commit. The
  two statements disagree and the source has not reconciled them.
- Why it is acceptable: both texts, the copyright line and the list of authors are kept beside the pictures in
  `public/images/reactions/LICENSE.txt`, which the site also serves, so either reading is satisfied; both licences
  allow use on a site and bundling with the site's files; nothing was changed, so Apache's notice of changes is not
  owed and the OFL's rule for modified versions does not arise; the repository has no NOTICE file and the OFL header
  names no Reserved Font Name.
- What it does not cover: the OFL forbids selling the files by themselves, and if a picture is ever changed it must
  stay under the OFL and carry no reserved name, while Apache then asks for a notice of the change. A new file from
  the same source, or from another source, needs its own entry in that file. Nothing here is legal advice; if the
  site is ever sold or the repository published, have a person who knows licences read `LICENSE.txt` first.
- What would end this entry: the pictures replaced by files with one clear licence, or the source stating one.
- Reviewed 2026-10-13 (T130): still holds, no date renewed. One of its triggers will fire at the first publication: the
  repository is to be published as an export (T189), so "published with the repository" is the day `LICENSE.txt` is
  read once more by a person who knows licences, as the entry says.
