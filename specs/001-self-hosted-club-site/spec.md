# Feature Specification: Self-hosted club site

**Feature Branch**: `main` (no feature branch is created; the repository's own rule is that branches change only with
the owner's permission)

**Created**: 2026-10-10

**Amended**: 2026-10-12 (the interface in two languages: User Story 11, FR-043 to FR-046, SC-013)

**Status**: Draft

**Input**: User description: "Self-hosted club site: the site stops depending on outside services for anything a
visitor, a member or an administrator does on it - signing up and signing in, reading posts, watching lectures, writing
comments, sending feedback, and running the site. Everything lives on one server the club controls, around one
database that is the single source of truth. The site looks the same and keeps every address it has today; what
changes is where its content comes from." The full wording and the owner's answers are in
`.specify/consilium/2026-10-09-self-hosted-rewrite.md`; the principles are in `.specify/memory/constitution.md`.

## Clarifications

### Session 2026-10-10

- Q: What happens to the existing members of the previous sign-in provider, whose passwords cannot be carried over?
  -> A: Every one of them becomes a guest and receives a temporary password from an administrator, which they must
  change at their next sign-in.
- Q: Whose account holds the superuser role at the start? -> A: The owner of this repository, who creates it with the
  server command; the person the product nominally belongs to receives the admin status only.
- Q: What does a person sign in with? -> A: Either an electronic address or a login name; the address is the main way
  and is required, the login name is an optional second identifier.
- Q: What scale must the site serve? -> A: Up to 1 000 members and up to 100 simultaneous viewers.
- Q: Can an account be deleted? -> A: No; an account can only be blocked, and its comments and history stay.
- Q: How long does a temporary password stay valid? -> A: 30 days; after that an administrator issues a new one.
- Q: How soon does a saved change reach an anonymous visitor? -> A: Within 10 seconds (left to the planner's
  judgement by the owner on 2026-10-10); the editor and any signed-in viewer see it at once.
- Q: Who may receive the superuser role from the settings page? -> A: Only an account that is already an admin
  (owner, 2026-10-10).
- Q: Does the role wait before it moves? -> A: Yes, 24 hours for a handover made from the settings page, and it can
  be cancelled instantly at any moment before it moves, by the superuser or by the receiving account (owner,
  2026-10-10). The server command moves the role at once.

### Session 2026-10-12

- Q: In which languages is the site's interface? -> A: English, the default, and Russian, chosen with a switch beside
  the menu (owner, 2026-10-12). The current site has had it since that day.
- Q: Is the content translated? -> A: No. Posts and video descriptions, with their titles, tags and categories, read
  the same in both languages, as do the site's name and the About text; no address depends on the language (owner,
  2026-10-12).
- Q: Which parts of the interface are translated? -> A: All of it: the menu, the buttons, the labels and the messages,
  the feedback form, the sign-in, sign-up and account pages, and the admin pages (owner, 2026-10-12).
- Q: Is the visitor's choice remembered? -> A: Yes, for every page and every later visit, the choice of English as
  much as the choice of Russian (owner, 2026-10-12).
- Q: Does the choice follow a member to other devices? -> A: No. It belongs to the device, and the account holds no
  language; there is no site-wide mechanism for choosing it (owner, 2026-10-12).

## User Scenarios & Testing _(mandatory)_

### User Story 1 - A visitor reads the site exactly as before (Priority: P1)

A visitor opens the club's home page, the lists of posts, a tag, a category, a post and the search, and sees the same
site they know, at the same addresses. Behind the scenes the posts and the list of videos now come from the club's own
content store instead of files baked into the site, and a post saved by an editor is on the site at once.

**Why this priority**: every other story builds on the content being served from the new home. If a visitor sees a
different site or a broken address, the rewrite has failed whatever else works.

**Independent Test**: with only this story built, compare today's pages with the new ones: every address in the route
contract answers, the visible page matches, the feeds, the search index and the sitemap list the same published
entries. It delivers the new content home with no visible change.

**Acceptance Scenarios**:

1. **Given** the route contract of the current site, **When** each address (with its trailing slash) is requested,
   **Then** it answers with the page that address shows today, and no address has disappeared.
2. **Given** a published post, **When** it is opened on the new site and on the current site, **Then** the page looks
   the same at 99.9% visual parity, formulas and code blocks included.
3. **Given** an editor saves a post, **When** a visitor opens the lists and the post, **Then** the new post is there
   without anyone rebuilding the site.
4. **Given** a post dated in the future, **When** a visitor lists posts, **Then** it is not shown until its date.

---

### User Story 2 - Every entry's audience holds everywhere (Priority: P1)

Each post and each video has an audience: everyone, any member, chosen statuses or named people, or nobody. The rule is
applied wherever the entry could surface: its own page, the lists, tags and categories, search, the feeds, the sitemap,
the comments and the card previews. An entry a viewer may not see answers "not found" everywhere, so its existence is
not revealed. A paid lecture may carry a teaser: the card and the introduction are visible, the rest is locked.

**Why this priority**: it is the rule that makes the site safe to host paid and private material; a single leaking
surface defeats it.

**Independent Test**: create entries with each audience, then view the whole site as a guest, a member of each status,
a named person and a blocked member; the set of entries that appear must be identical on every surface for each viewer.

**Acceptance Scenarios**:

1. **Given** a post visible to one named member only, **When** that member opens the lists, search and feed, **Then**
   it appears in all three; **When** anyone else does, **Then** it appears nowhere and its address answers "not found".
2. **Given** a hidden entry, **When** anyone requests its page, a tag or category page containing it, or the search
   index, **Then** there is no trace of it.
3. **Given** a paid lecture with a teaser, **When** a guest views it, **Then** the guest sees the card and the
   introduction and a locked notice, and the locked part is not in what was sent to the browser.
4. **Given** a member whose status is changed, **When** they next load a page, **Then** what they may see follows
   the new status.

---

### User Story 3 - A person signs up and signs in on the club's own site (Priority: P1)

A new person creates an account and signs in, with no outside identity provider and no email step at first. A new
account is a guest until an administrator gives it a status. A member sees their status on the account page, can see
and end their sessions on other devices, and is sent back to the page they came from after signing in.

**Why this priority**: members, paid lectures, comments and administration all depend on accounts; and the site's
current sign-in sits behind a service that part of the audience cannot reach.

**Independent Test**: sign up, sign in, view the account page, sign in on a second device, end that session from the
first, and sign out; all without any outside service.

**Acceptance Scenarios**:

1. **Given** no account, **When** a person signs up with a valid password of at least 8 characters, **Then** the
   account exists as a guest and they are signed in.
2. **Given** a signed-in member, **When** the header is drawn, **Then** it shows the account state from the first
   paint, without a flicker between guest and member.
3. **Given** repeated wrong passwords for one account or from one address, **When** the limit is passed, **Then**
   further attempts are refused for a while and the account owner is not locked out for good.
4. **Given** a sign-in link carrying a "go back to" address, **When** it points outside the site, **Then** the person
   lands on the account page instead.

---

### User Story 4 - Statuses, administrators and one protected superuser (Priority: P2)

Members have a status: guest, student, expert, master, metr, admin or blocked. Administrators give statuses under the
rules the owner settled on 2026-10-02. One superuser exists above the administrators, can change every other account,
cannot be demoted, blocked or deleted through the site, and can be recovered or handed over in two independent ways.

**Why this priority**: it is how the club controls who sees paid material and who edits the site; it is needed before
content administration and video can be trusted.

**Independent Test**: with accounts of each status, attempt every status change the rules allow and forbid, from each
actor; then rehearse a superuser handover and a recovery on a copy of the data.

**Acceptance Scenarios**:

1. **Given** a metr, **When** they try to make someone a metr or an admin, touch a metr or an admin, or lift a block
   an admin set, **Then** it is refused.
2. **Given** any actor, **When** they try to change their own status or to give guest, **Then** it is refused.
3. **Given** a blocked member, **When** they use the site, **Then** they see what a guest sees and no paid resource,
   and their account page says they are blocked.
4. **Given** the superuser, **When** they hand the role to another account from the settings page, **Then** the role
   moves only after that account accepts with its own password, every superuser session ends, and the change is logged.
5. **Given** the superuser has lost their password and the server is not at hand, **When** they use one of their
   one-time recovery codes, **Then** a new password is set once, every other session ends, the code is spent, and the
   event is logged.
6. **Given** access to the server, **When** the superuser command is run, **Then** it can create the superuser, set a
   new password for it or hand the role to another account.

---

### User Story 5 - A member watches a lecture hosted by the club (Priority: P2)

A member whose status opens the paid lectures plays a lecture, seeks within it and resumes, with the video served from
the club's own server. A guest sees the placeholder, and a blocked member is refused. The members-only text block of a
paid lecture is a real lock: it is not sent to anyone without full access.

**Why this priority**: paid lectures are the club's main member benefit and the main reason readers in restricted
regions need the site without a VPN.

**Independent Test**: as a student, play a lecture and seek; as a guest, see the placeholder; block the student and
seek again; confirm the members-only text is absent from what a guest receives.

**Acceptance Scenarios**:

1. **Given** a student and a paid lecture, **When** they press play and seek, **Then** it plays and seeks without
   leaving the club's server.
2. **Given** a guest, **When** they open the lecture page, **Then** they see the placeholder and the teaser and cannot
   fetch the video by any address.
3. **Given** a member who is blocked during playback, **When** the player's next request is made, **Then** it is
   refused.
4. **Given** the locked setting, **When** a guest views the members-only block's page, **Then** the block is not in
   what the browser received; **Given** the switch set to hidden, **Then** the block is sent but hidden until the player
   appears, as today.
5. **Given** a public sample video with no file yet, **When** it is opened, **Then** it keeps its current outside
   embed until a file exists.

---

### User Story 6 - Editors write posts and videos with an audience (Priority: P2)

A metr or an admin creates, edits and deletes posts and videos from the admin pages, chooses each entry's audience and
teaser, previews it with the same rendering the site uses, and uploads a video file. Concurrent edits are not silently
overwritten, and raw HTML in an entry is refused.

**Why this priority**: with content in a store the club needs its own way to maintain it, replacing the Git-based
panel.

**Independent Test**: as an editor, create a post with a named-people audience, preview it, save it and see it on the
site; upload a large video and play it; edit the same post from two sessions and observe the conflict answer.

**Acceptance Scenarios**:

1. **Given** an editor saves a post, **When** a permitted signed-in visitor opens it, **Then** it is there at once
   and matches the preview; an anonymous visitor sees it within 10 seconds.
2. **Given** an entry containing raw HTML or script, **When** it is saved, **Then** it is refused or neutralised and
   nothing from it executes on any page.
3. **Given** two editors edit one entry, **When** the second saves, **Then** they are told of the conflict and nothing
   is lost.
4. **Given** a member who is not a metr or an admin, **When** they request an admin page or its data, **Then** the
   answer is "not found".

---

### User Story 7 - Members discuss entries in comments (Priority: P3)

Comments belong to posts and to videos. Those whose status opens the lectures write; whoever may see the entry reads;
text is shown as text; a metr or an admin can hide and restore a comment. The previous third-party comment service and
its history are dropped.

**Why this priority**: it restores a feature the site had, without an outside service; the site is complete without
it.

**Independent Test**: as a guest, read and fail to write; as a student, write; as a metr, hide a comment and restore
it; confirm a comment on a hidden entry is nowhere visible.

**Acceptance Scenarios**:

1. **Given** a guest, **When** they view an entry with comments, **Then** they can read and cannot write.
2. **Given** a comment containing markup, **When** it is displayed, **Then** it appears as plain text.
3. **Given** a metr hides a comment, **When** others load the entry, **Then** it is gone, and restoring it brings it
   back.
4. **Given** an author's own comment less than a day old, **When** they change or delete it, **Then** the change shows
   at once; after a day neither is possible. (2026-10-13)
5. **Given** a student, **When** they pick a reaction on an entry and later another, **Then** the entry counts one
   reaction of theirs, the last; a signed-out visitor is asked to sign in, and a guest account sees the counts and
   cannot choose. (2026-10-13)

---

### User Story 8 - Visitors send feedback that cannot become an attack (Priority: P3)

A visitor sends feedback or a complaint through the site's own form. The message is stored first, listed on an admin
page, and mailed to the administrators. Bursts, bots and oversized messages are refused, and nothing a visitor types is
ever placed where it could alter the mail.

**Why this priority**: the club needs a channel to hear from readers; the existing form uses an outside service.

**Independent Test**: send a message and see it on the admin page and in the recipient's mailbox; send a rapid burst
and see it refused with nothing stored; stop the mail and confirm the message is still stored.

**Acceptance Scenarios**:

1. **Given** a visitor sends a valid message, **When** it is accepted, **Then** it is stored, listed for
   administrators and mailed.
2. **Given** the mail cannot be sent, **When** a message arrives, **Then** it is still stored and shown to
   administrators.
3. **Given** a burst past the limit, a filled hidden field or an oversized body, **When** it arrives, **Then** it is
   refused and nothing is stored.

---

### User Story 9 - The superuser manages settings the owner changes alone (Priority: P3)

A settings page, available only to the superuser, holds the feedback recipient address and the switch between a locked
and a hidden members-only block. A new recipient address takes effect only after a code sent to it is entered; the old
address is told of the change; the superuser re-enters their password before any change; every change is logged.

**Why this priority**: it lets the product's single owner steer these two behaviours without a developer; they have
safe defaults until then.

**Independent Test**: as the superuser, change the recipient (confirm with the code, see the old address notified),
flip the switch, and check the change log; as anyone else, find no such page.

**Acceptance Scenarios**:

1. **Given** a new recipient address, **When** the superuser submits it, **Then** it is used only after the emailed
   code is entered, and the old address is informed.
2. **Given** any setting change, **When** it is made, **Then** the superuser's password was re-entered and a log entry
   records who, when, from what and to what.
3. **Given** the switch is flipped to hidden or locked, **When** a paid lecture is viewed, **Then** it behaves as in
   User Story 5, scenario 4, with no other code change.

---

### User Story 10 - Readers reach the site without a VPN, and the switch costs no downtime (Priority: P2)

A reader in a country where Cloudflare and YouTube are throttled or blocked opens the site, reads, signs in and plays
a lecture without a VPN. On the day of the switch, the new site is live at its own domain with the final content, and
the old site's every page redirects there, so no visitor meets an outage.

**Why this priority**: it is the reason for the whole rewrite and the condition under which it goes live.

**Independent Test**: from a network that blocks the named services, complete a read, sign-in and playback; rehearse
the switch with a final import and check that every old address lands on its new counterpart.

**Acceptance Scenarios**:

1. **Given** a network that blocks the named outside services, **When** a reader reads a post, signs in and plays a
   lecture, **Then** every step works and no request on that path depends on a blocked service.
2. **Given** the switch day, **When** the final content import and the last build of the old site are done, **Then**
   every old address redirects to the new address and the new site never went down.
3. **Given** the old site, **When** the rewrite is under way, **Then** it keeps running unchanged until that day.

---

### User Story 11 - The interface speaks English or Russian (Priority: P2)

A visitor opens the site and finds the menu, the buttons and every message in English. A press on the switch beside
the menu turns the whole interface into Russian at once, without reloading the page and without losing anything typed
into a form; the next page, the next visit and every other open tab are in Russian too, until the visitor switches
back. Signing in, editing the account, sending feedback and working in the admin pages all happen in the chosen
language, while posts and lecture descriptions read exactly as they are written.

**Why this priority**: the owner asked for it on 2026-10-12 and the current site already has it, so the rewrite must
not lose it; and the pages the later phases add cost less to write in both languages from the start than to translate
afterwards.

**Independent Test**: in a fresh browser, open every page type in English; switch, reload, open another page and a
second tab; go through sign-in, the account, the feedback form and an admin page in both languages, and check that no
interface text is left in the other language.

**Acceptance Scenarios**:

1. **Given** a visitor who never chose a language, **When** any page opens, **Then** the interface is in English and no
   Russian interface text shows.
2. **Given** a page in English with a half-filled form, **When** the visitor presses the switch, **Then** every
   interface text turns Russian at once, the page does not reload and the form keeps what was typed.
3. **Given** a visitor who chose a language, **When** they open another page, come back the next day or have a second
   tab open, **Then** the interface is in that language from the first paint, with no flash of the other.
4. **Given** either language, **When** a post or a video is shown, **Then** its title, text, tags and categories are
   exactly as written.
5. **Given** a refused sign-in, a form error or any other refusal from the server, **When** its message is shown,
   **Then** it is in the chosen language.

---

### Edge Cases

- A post's visibility is changed from everyone to hidden while a visitor has it open: the next request answers "not
  found", and caches never serve it to anyone who may not see it.
- A member is blocked, demoted or deleted during a session or while a video plays: the change takes effect on the next
  request, including each seek.
- Two accounts claim the same address or login name (differing only in letter case) at sign-up, or a status change
  arrives while the member is signing in; a login name that looks like another account's address is refused.
- The superuser role is being handed over and the receiving account never accepts, or accepts after a recovery code was
  used: the role stays where it is, and an old pending handover cannot be used later.
- A recovery code is reused, guessed, or tried in a burst: refused, rate-limited, and logged.
- A post is saved with a formula, code, a footnote or a table that must render exactly as today; a stored rendering is
  out of date after the rendering rules change.
- The content store is unreachable: pages that show nothing from it still answer, the rest answer a clear error, and
  the site's build does not need the store.
- A paid lecture imported from the current site has the members-only block in its text; a public entry is saved with
  such a block.
- A video file is uploaded that is not playable from the start, is too large, or is still being written when requested.
- A visitor requests a range of a video past its end, or opens the internal video location directly.
- The mail provider refuses or delays a message; the recipient address setting is changed while messages are queued.
- A comment is written on an entry that becomes invisible afterwards.
- A temporary password is used on day 31, or a second one is issued before the first is used: the expired or voided
  one is refused with the same message as a wrong password.
- An address with a missing trailing slash, an encoded non-ASCII tag address, or a year page with no posts.
- Content imported from the current repository is imported twice: no duplicates and no loss.
- The browser stores nothing (a private window, blocked site data): the switch still works on the page, and the next
  page opens in English.
- Scripts are off: the interface is in English, the switch does nothing, and every page still reads correctly.
- The server refuses with a reason the interface has no text for yet: the page shows a general message in the chosen
  language, never a raw code.

## Requirements _(mandatory)_

### Functional Requirements

**Content and addresses**

- **FR-001**: Every address in the route contract (`reference/hugo-routes.txt`) MUST keep answering, with its trailing
  slash; addresses may be added and none removed.
- **FR-002**: Posts and the list of videos MUST come from one authoritative content store, and an entry saved by an
  editor MUST be visible to permitted visitors without any manual rebuild or deploy.
- **FR-003**: What a visitor sees MUST stay at 99.9% visual parity with the current site; a visible departure happens
  only by the owner's decision.
- **FR-004**: An existing post's rendering (formulas, code blocks, footnotes, headings, table of contents, summaries)
  MUST match what the current site renders for the same text.
- **FR-005**: A post dated in the future MUST be left out of every list, feed, search and sitemap until its date.
- **FR-006**: The content of the current site MUST be importable into the store by a repeatable, rehearsed import that
  creates no duplicates and loses nothing when run again.
- **FR-007**: The feeds, the sitemap and the search index MUST list exactly the entries the requesting audience may
  see.

**Visibility**

- **FR-008**: Every post and video MUST have an audience chosen from: everyone, any member, a list of statuses plus
  named people, or nobody; and MAY have a teaser.
- **FR-009**: The audience rule MUST be decided in one place and applied on every surface: page, lists, tags,
  categories, search, feeds, sitemap, comments, card previews and page head metadata.
- **FR-010**: An entry a viewer may not see MUST answer "not found" on every surface, never "forbidden", and MUST not
  be inferable from counts, neighbours, tags or previews.
- **FR-011**: A new post MUST default to everyone; a draft MUST map to nobody; only imported paid lectures carry a
  teaser by default.

**Accounts and sessions**

- **FR-012**: A person MUST be able to sign up and sign in with the club's own accounts, with no outside identity
  provider; passwords have a minimum of 8 characters, are stored so that they are never retrievable, and a new account
  starts as guest without any email step.
- **FR-012a**: Every account MUST have an electronic address, unique regardless of letter case, which is the main sign-in
  identifier and is required at sign-up; an account MAY also have a login name, unique regardless of letter case, and
  sign-in MUST accept either identifier with the same password and the same limits (clarified 2026-10-10). The
  address is not confirmed by mail until phase 9, so it proves nothing about its holder and MUST NOT by itself grant
  anything beyond guest.
- **FR-013**: Sessions MUST be kept on the server, MUST be renewed on sign-in and on any change of rights, MUST be
  listable and endable by their owner, and MUST expire.
- **FR-014**: Writes from the browser MUST be accepted only from the site itself; sign-in and other sensitive attempts
  MUST be rate-limited per account and per address.
- **FR-015**: The "go back to" address after sign-in MUST be accepted only if it is a page of this site.
- **FR-016**: The header MUST show the account state correctly from the first paint.

**Statuses and the superuser**

- **FR-017**: The statuses guest, student, expert, master, metr, admin and blocked, and the who-gives-what rules of
  ADMIN.md sections 1 and 2, MUST be enforced by the server on every request; the pages only show what the server
  allows.
- **FR-018**: Every status except guest and blocked MUST open the paid lectures; a blocked member MUST see what a
  guest sees and no paid resource.
- **FR-018a**: No account MUST be deletable through the site, by anyone, the owner of the account included; the only
  way to withdraw an account's access is to block it, and a blocked account's comments and history stay (clarified
  2026-10-10).
- **FR-019**: Exactly one superuser MUST exist; it MUST not be demoted, blocked or deleted through the site, and MUST be
  an admin otherwise.
- **FR-020**: The superuser role MUST be creatable, re-passworded and transferable by a command on the server.
- **FR-021**: Without the server, the role MUST be transferable only by a handover the superuser starts with their
  password and the other account accepts with its own password; the receiving account MUST already be an admin; the
  role moves after a cooling period of 24 hours during which the superuser or the receiving account can cancel; every
  superuser session ends when it moves and the change is logged (clarified 2026-10-10).
- **FR-022**: Without the server, the superuser MUST be recoverable by one of ten one-time recovery codes shown once at
  creation, stored only in a non-reversible form, each usable once and rate-limited; a fresh set voids the old; using a
  code sets a new password, ends every other session and is logged.
- **FR-023**: Every status change, handover, recovery and setting change MUST be recorded in an audit log naming who,
  when, from what and to what.

**Video**

- **FR-024**: Lecture files MUST be served from the club's own server; every playback request, every seek included,
  MUST be checked against the viewer's session, status and the entry's visibility before any bytes are sent, and the
  files MUST not be reachable by any other address.
- **FR-025**: A guest MUST see the placeholder or teaser; a blocked member MUST be refused on the next request.
- **FR-026**: The members-only block of a paid lecture MUST be held separately and sent only to viewers with full
  access under the "locked" setting; under the "hidden" setting it is sent to everyone and hidden until the player
  appears, as the site does today; the choice is one setting.
- **FR-027**: A public sample video without a file MUST keep its current outside embed until a file is registered.

**Content administration**

- **FR-028**: A metr or an admin MUST be able to create, edit, delete, preview and set the audience and teaser of posts
  and videos, and to upload a video file; others MUST get "not found" for these pages and their data.
- **FR-029**: The content rules (required fields, allowed values, forbidden constructs) MUST be one rule set applied by
  the server on every save; raw HTML MUST be refused or neutralised before it can be shown.
- **FR-030**: A save over a newer version of the same entry MUST be answered with a conflict, not applied silently.
- **FR-031**: The preview MUST use the same rendering as the published page.

**Comments, feedback, settings**

- **FR-032**: Comments MUST belong to a post or a video; those whose status opens the lectures write, whoever may see
  the entry reads, text is displayed as text, and a metr or an admin can hide and restore a comment.
  Clarified 2026-10-13 (owner): the list is flat (no replies) and newest first; "writes" means a status that opens the
  lectures with a date that has not ended, or a guest account that holds a paying date (the old members), and the
  editors; an account with a lecture status and no date at all does not write; an account writes at most 5 comments
  in 10 minutes and at most 20 under one entry; the author may change or delete their own comment during one day
  after writing it (a deletion keeps the row, out of every list); the look follows the previous comment service's.
- **FR-047**: Every post and video MUST carry a rating of six reactions (upvote, funny, love, surprised, angry, sad)
  beside its comments, in the look of the previous comment service (added 2026-10-13, owner): anyone who may see the
  entry reads the counts; an account that may write comments gives one reaction per entry, and may change or remove
  it; the previous service's reactions are not carried over (FR-041).
- **FR-033**: The feedback form MUST store every accepted message before anything else, list it on an admin page, and
  mail it to the recipient address; a mail failure MUST lose nothing.
- **FR-034**: The feedback form MUST refuse bursts, bot fills, oversized bodies and cross-site posts, and MUST never
  place visitor text in a mail header.
- **FR-035**: A superuser-only settings page MUST hold the feedback recipient address and the locked-or-hidden switch;
  a new recipient takes effect only after a code sent to it is entered, the old address is told, and the password is
  re-entered before any change.
- **FR-036**: The recipient address MUST never be written into the public repository; the sending mailbox and its
  credentials MUST live only in the server's environment and not be editable from the site.

**Reach, safety, operation**

- **FR-037**: Reading, signing in and playing a lecture MUST work from a network that blocks the throttled outside
  services, with no VPN; only the outside services the owner kept (the analytics counter, the web fonts, the visit
  counter and the placeholder embeds) may be on a visitor's path.
- **FR-038**: No secret MUST enter the repository or any value shipped to the browser.
- **FR-039**: The switch MUST cost visitors no downtime: the old site runs unchanged until the final import, and then
  every one of its pages redirects to the new address.
- **FR-040**: The data and the video files MUST be backed up, and a restore from backup MUST be rehearsed before the
  switch.
- **FR-041**: The previous third-party comment history MUST be dropped, and the previous sign-in provider, its code
  and its members' accounts MUST be replaced by the club's own accounts.
- **FR-042**: Each existing member of the previous sign-in provider MUST get a club account as a guest (clarified
  2026-10-10), with a temporary password set by an administrator and passed to the member outside the site; the
  member MUST be made to change it at the next sign-in, and the temporary password MUST stop working once changed or
  after 30 days, whichever comes first; an administrator MAY issue a new one at any time, which voids the previous
  (clarified 2026-10-10).

**Interface languages (added 2026-10-12)**

- **FR-043**: The interface MUST be available in English and in Russian, English by default. The content (posts and
  video descriptions, with their titles, tags and categories) MUST NOT be translated, and no address MUST depend on
  the language (owner, 2026-10-12).
- **FR-044**: A switch beside the menu MUST change every interface text on the page at once, without a reload and
  without losing what a form holds. The choice MUST be remembered for every page and every later visit, whichever
  language it is, and a page MUST show the chosen language from its first paint.
- **FR-045**: Every interface text MUST exist in both languages in one place. That covers the pages this feature adds
  (sign-in, sign-up, password change, account, the admin pages, feedback, comments, settings) and the messages that a
  refusal from the server leads to; a refusal MUST be shown in the chosen language.
- **FR-046**: The choice of language MUST NOT change which entries a visitor sees or how soon a saved change reaches
  an anonymous visitor, and the text of each language MUST be marked with its language for assistive technology.

### Key Entities

- **Account**: a person who signs in; has a name, a unique address, an optional unique login name, a status, a blocked flag with who blocked, a password they
  alone know, and sessions. At most one account carries the superuser flag.
- **Session**: a signed-in device of an account; has an issue and expiry time and can be ended by its owner or by a
  change of rights.
- **Status**: one of guest, student, expert, master, metr, admin, blocked; decides what the account may see and give.
- **Entry**: a post or a video; has a title, text, tags, categories, date, an audience, a teaser flag and a stored
  rendering; posts and videos are two kinds that share only plain data.
- **Audience**: who may see an entry; everyone, any member, a set of statuses plus named accounts, or nobody.
- **Video file**: a lecture file on the club's server attached to a video entry, with a size and a playable-from-start
  flag; the members-only block is held apart from the entry's public text.
- **Comment**: text by an account on an entry; may be hidden and restored by a metr or an admin. It outlives its
  author's block, because accounts are never deleted.
- **Feedback message**: text and contact from a visitor; stored, listed, and mailed.
- **Setting**: a value only the superuser changes (recipient address, locked-or-hidden switch), with its change log.
- **Recovery code**: a one-time code for the superuser; stored only in non-reversible form; spent when used.
- **Audit record**: who did what to whom, when, from what and to what.
- **Interface text**: a piece of the interface (a label, a button, a message) held once, in both languages; content is
  never one.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of the addresses in the route contract answer on the new site, each with its trailing slash, and 0
  disappear; every old address redirects to its new counterpart on the switch day.
- **SC-002**: Side-by-side comparison of every page type (home, lists, tag, category, post with formula and code, video,
  search, account) shows 99.9% visual parity in light and dark themes, with the residuals recorded.
- **SC-003**: For every combination of viewer status, audience and teaser in the test matrix, an entry's presence or
  absence is identical on all nine surfaces, with 0 leaks.
- **SC-004**: A reader on a network that blocks the throttled services completes read, sign-in and a lecture playback
  with 0 requests to those services on that path, and without a VPN.
- **SC-005**: A new person goes from the sign-up page to a signed-in account page in under 2 minutes, with no outside
  service and no email step.
- **SC-006**: A status change reaches the affected member's access within 1 minute, and a block stops playback on the
  member's next request.
- **SC-007**: 100% of the rule cases of the three current services (content, statuses, video access) pass against the
  new rules with no case dropped.
- **SC-008**: A burst of feedback beyond the limit is refused with 0 messages stored, and 100% of accepted messages are
  stored even when mail delivery fails.
- **SC-009**: The final switch is completed with 0 minutes of downtime for visitors, and a restore from backup
  rehearsed before it recovers every account, entry, comment and video file, losing only changes since the last backup.
- **SC-010**: Both superuser recovery paths (the server command and the recovery codes) and the handover are rehearsed
  on a copy of the data, each completing successfully once and failing safely on a second use.
- **SC-011**: With 1 000 members and 100 simultaneous viewers (clarified 2026-10-10), at least 95% of page views for a
  guest show their main content within 2 seconds on an ordinary connection, and every simultaneous lecture playback
  keeps playing without stalling for more than 2 seconds in a minute.
- **SC-012**: No secret and no personal address is found in the public repository or in any file shipped to the
  browser, checked before each release.
- **SC-013**: In each language, a scan of every page type (home, lists, tag, category, post, video, search, sign-in,
  sign-up, account, feedback, the admin and settings pages) finds 0 interface texts in the other language and 0
  untranslated messages; a chosen language holds after a reload, on another page and in a second tab, with no flash
  of the other language.

## Assumptions

- The design, the 80-day phase plan, the owner's answers and the council's remarks are in
  `.specify/consilium/2026-10-09-self-hosted-rewrite.md`; this specification states the outcomes, and the plan chooses
  the means. Principles that bind every plan are in `.specify/memory/constitution.md`.
- The stack is frozen by the constitution (Node 20, Astro 4.x, Tailwind 3.4); the end of life of Node 20 is an
  accepted, dated risk in `RISKS.md`.
- Decisions recorded for planning: database migrations use postgrator 8.0.0 (owner, 2026-10-10); the rewrite is
  delivered in phases 0 to 8 with phase 9 deferred, each ending in a check the owner runs locally.
- Scale: up to 1 000 members and 100 simultaneous viewers (owner, 2026-10-10); the site is sized for one server, and a
  larger audience is a later decision, not a requirement of this feature.
- Out of scope: payments on the site, HLS or transcoding, translations of the content (the interface is in two
  languages since 2026-10-12, FR-043), an inbound mail server, importing the Disqus history, and any change of design
  the owner has not ordered.
- External services that stay by the owner's decision: Yandex Metrika, Google Fonts and the visit counter; the 18
  public sample videos keep their placeholder YouTube ids until MP4 files exist. These are the only outside
  dependencies on a visitor's path.
- Members' accounts from the current sign-in provider are not migrated with their passwords (a password cannot be
  carried over). Owner decision 2026-10-10: each existing member becomes a guest and receives a temporary password from
  an administrator, which must be changed at the next sign-in (FR-042); statuses are then given again by a metr or an
  admin under the usual rules.
- Address confirmation and password reset by mail, and full-text search in the database, are deferred (phase 9); until
  then a lost member password is reset by an administrator giving a temporary password that must be changed at next
  sign-in.
- Still open and decided later, outside this specification: the server's and the registrar's country, the new site's
  domain, and which mailbox the site sends from. Phases 0 to 7 run locally and do not depend on them.
- The club's product nominally belongs to one person who administers all of it. Owner decision 2026-10-10: that
  person receives the admin status only; the superuser account is held by the owner of this repository, who creates it
  with the server command. The handover and recovery paths of FR-021 and FR-022 stay available but are not used to
  hand the role to the product's owner at the start. The settings page is therefore operated by the superuser, not by
  the product's owner.
- Settled 2026-10-10: the settings-page handover waits 24 hours and can be cancelled instantly at any time before
  the role moves; the length is one constant (zero means instant), and the server command always moves the role at
  once.
- The superuser's own security review of the loosened "no interface can touch it" rule is part of the plan, not of
  this specification.
- The interface's two languages were built on the current site on 2026-10-12 (`klub_biolocation_astro`, branch
  `refactor-app`, described in its `I18N.md`) and are carried over rather than designed again.
- The choice of language belongs to the device: a member who signs in on a second device chooses there once.
  Following a member across devices, and letters to members in their language, are not required now; they are
  decided when the mail of phase 9 is planned. Settled later the same day (owner): the choice stays with the device
  and the account holds no language; phase 9 settles the language of letters to members without one.
