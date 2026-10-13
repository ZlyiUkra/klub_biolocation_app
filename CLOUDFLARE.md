# Cloudflare and the access service: why, what to register, what else exists

> **Superseded 2026-10-13 (T131; see REWRITE.md).** The access service this file picks a host for
> (`workers/video-access/`) no longer exists, and the rewrite runs on one server of the club's own, not on
> Cloudflare (the consilium of 2026-10-09). Nothing here is to be registered or paid for. The comparison is kept as it
> was written; its prices and terms are those of 2026-09-28.

Written on 2026-09-28 at the owner's request, for the two administrators of the site. Every price, limit and term
below was read on the vendor's own pages on 2026-09-28; section 12 lists them. Prices and terms change: read the page
again before paying for anything or relying on a limit.

**Nothing has been registered on Cloudflare yet, and nothing has been sent there.** Paid videos work only on the
developer's machine today (`npm run dev:all`, `PAID-VIDEO.md` section 3).

## 1. In short

- GitHub Pages hands out files and runs no program. The site stays there, free, as it is.
- A paid lecture needs one small program that runs on a server: it checks that the visitor is signed in and has paid,
  and only then gives out the YouTube id of the lecture. That program is the access service,
  `workers/video-access/worker.mjs`. It is written and tested; it does not run anywhere public yet.
- The proposal is to run it as a Cloudflare Worker on the free plan: no payment card, 100,000 requests a day (the club
  needs a few hundred), and the file runs there as it is.
- To register: one Cloudflare account, free. To do after: five steps in its Dashboard, one line in `src/config.ts`,
  one setting in the Clerk Dashboard (section 6).
- Two questions decide whether this is the right way at all, and both are the owner's: can the audience reach the
  services the site depends on (section 4), and does the club accept that a paying member can pass a YouTube id on
  (section 2).

## 2. Do we need Cloudflare if the videos are on YouTube?

The owner's question of 2026-09-28. YouTube stores the lectures and plays them, but it cannot tell a paying member of
the club from anybody else. A site that shows a lecture to members only needs something that decides who gets the
lecture's address, and on GitHub Pages that something cannot be the site itself (3.2). The access service is that
something; Cloudflare is only where it would run.

While this document was being written, a rule of YouTube's turned up that matters more than the choice of Cloudflare:
YouTube forbids charging people to watch a video in its embedded player (2.3). It is set out here first because it
decides what the service is for.

### 2.1 What YouTube itself offers

- **Unlisted** (what `PAID-VIDEO.md` uses today). "Unlisted videos and playlists can be seen and shared by anyone with
  the link", no Google account is needed, and anyone with the link can pass it on. Not in search or recommendations.
  Embedding on another site is a separate per-video switch ("Allow embedding"). In other words: the id is the key,
  and whoever has it watches.
- **Private.** Shared by email address, "with up to 50 email addresses" per video. The viewer needs a Google account
  and has to be signed in to the very account the video was shared with, so a forwarded link opens nothing. But a
  private video does not play in an embedded player on another site ("If you embedded the video in a website or app,
  it no longer works"), only on youtube.com, and it has no comments. The strongest per-person lock YouTube has, for
  at most 50 people per lecture, invited by hand, each of whom has to give the club a Google address.
- **Channel memberships** (members-only videos). YouTube sells the membership, takes the payments, handles refunds,
  and pays the channel "70% of membership revenue after applicable taxes and fees". The channel has to be in the
  YouTube Partner Program at the fan-funding level: 500 subscribers, 3 public uploads in the last 90 days, and 3,000
  qualified watch hours in the last 12 months (or 3 million Shorts views in 90 days); the owner at least 18; the channel
  not "made for kids"; members-only videos "fully original content". Non-members see the title and the picture, not
  the video. Whether a members-only video plays in an embedded player on another site, YouTube's pages do not say.
  YouTube has announced higher entry thresholds for the Partner Program from 2027-02-01 and says the fan-funding
  requirements do not change.
- **Embedding only on chosen sites** exists, but only for partners with YouTube's Content Manager, which the club is
  not.
- **Hiding YouTube's logo, title or links in the player** is not possible and not allowed (Developer Policies III.I.4
  and III.I.6; `modestbranding` "is deprecated and has no effect"; `rel=0` only keeps the suggested videos to the same
  channel). This was already the answer of 2026-09-28 in `PAID-VIDEO.md`.

### 2.2 What the service adds on top of Unlisted, and what it does not

- The id is never public: not in the page, the feeds, the search index or the repository.
- Access follows the member's record: it starts when the administrator writes `member: true` and ends by itself after
  `memberUntil`.
- It does **not** stop a member who has the player open from copying the id and passing it on; YouTube cannot take an
  unlisted id back from one person (`PAID-VIDEO.md` section 2 and section 8).

### 2.3 YouTube's rule on charging for embedded videos

YouTube's Developer Policies (last updated 2026-09-14) apply to "all access and use of the YouTube embedded player",
and say, in the section "Playback Integrity":

> API Clients must not charge users to watch content in an embedded YouTube player. API Clients must not otherwise
> gate access to a video by requiring a user to take an action other than clicking the play button [...]. For
> clarity, if your API Client's normal functionality requires a certain action that is not specific to YouTube API
> Services, such as login or age verification, that functionality is allowed.

Asking visitors to sign in before a video is allowed. Charging them for watching a lecture in YouTube's embedded
player is what the first sentence forbids, and a paid membership whose purpose is watching embedded lectures is close
to that description. This document is not legal advice: whether the club's membership counts is for the owner to
settle, with YouTube or with a lawyer. What follows for the plan:

- **The demo is fine.** It charges nothing, and its example plays YouTube's own sample video.
- **Before money is taken**, one of these, the owner's choice:
  - Move the paid lectures to a host meant for paid video: Cloudflare Stream (5 USD a month per 1,000 minutes stored,
    1 USD per 1,000 minutes watched, no free allowance), Vimeo, or the club's own files in Cloudflare R2 storage (10 GB
    a month free, no charge for traffic; R2 is switched on through a checkout, and whether it asks for a card is not
    stated) with an ordinary video player. The service stays and changes one function:
    it hands out a signed, expiring address of that host instead of a YouTube id, which also removes the "a member can
    pass the id on" problem of 2.2. `PAID-VIDEO.md` section 8 already costs this move; it needs the original video
    files.
  - Use YouTube's channel memberships (2.1): YouTube takes the money and decides who watches, lectures play on
    YouTube, and the site only links to them. No access service is needed at all, but the channel has to qualify.
  - Keep YouTube and the membership as they are, having settled the question above.

So: **with YouTube as the paid host, Cloudflare is needed to keep the ids out of sight, but YouTube's rules are the
bigger question. With another host, Cloudflare (or a similar service) is needed all the more, because signed
addresses have to be made somewhere that is not the public site. With channel memberships, it is not needed.**

## 3. What has been built, and why that way

Built on 2026-09-28 on the branch `clerk-auth`, after a consilium the same day (its verdict:
`.specify/consilium/2026-09-28-paid-video-access.md`; the how-to: `PAID-VIDEO.md`).

### 3.1 The chain, from a click to the player

1. A paid lecture is an ordinary entry in `src/content/video/` with `access: paid` and **no video id**. The build
   refuses a paid entry that carries an id or a YouTube link anywhere in its text (`src/content/config.ts`,
   `src/lib/video.ts`), because everything in an entry ends up public: in the page, the RSS feed, the search index and
   the repository on GitHub.
2. The page of a paid lecture shows a box instead of the player (`src/components/PaidVideo.astro`). A guest sees
   "sign in"; a signed-in visitor's page goes on to step 3.
3. The page asks Clerk, the sign-in service the site already uses, for the visitor's session token: a short text that
   says who is signed in and what the administrator wrote into their record (`member`, `memberUntil`), signed by
   Clerk so that nobody can alter it.
4. The page sends the token and the lecture's slug to the access service (`POST /video`).
5. The service checks the token with Clerk's public key (the same check any server does; no Clerk secret is needed),
   checks that `member` is `true` and that today is not after `memberUntil`, and looks the slug up in its secret list
   `VIDEOS`, which maps each paid lecture to its YouTube id.
6. Only then does it answer with the player's address. The page checks that the address points to YouTube and nowhere
   else, and puts the player in place; the comments appear with it.

Everybody else - a guest, a signed-in visitor without access, somebody reading the page source or the repository -
never gets the id, because it is not anywhere they can read. It lives only in the service's secret.

### 3.2 Why a server at all

The colleague's first idea was a check in the browser: wrap the player in Clerk's "signed in" component and show it
when the user's record says "paid". It is the natural first idea, and on a site with its own server it would be
enough. On GitHub Pages it is not, because the player's address would have to be in the page to be shown, and a page
is readable by anyone before and regardless of any check that runs in it: the source view of the browser, a
download with `curl`, a search engine. The check has to run where the visitor cannot see or change it, and GitHub
Pages has no such place. That is the only reason for a second service.

### 3.3 Why it is built the way it is

- **One file, no imports.** It can be pasted into Cloudflare's online editor; nothing has to be installed on anybody's
  machine. There is no `wrangler` (Cloudflare's command-line tool): it would be a new dependency with its own Node
  requirements, and this project is fixed on Node 20.
- **Web-standard code.** It uses only what every modern JavaScript runtime has (`fetch`, `Request`, `Response`, the
  browser's cryptography API). The same file runs unchanged in Node on the developer's machine
  (`scripts/video-access-dev.mjs`) and in the tests, and it can move to another host (section 8) with a few lines of
  adapter at most.
- **Only public keys from Clerk.** The service needs no Clerk secret key, so no Clerk secret sits at Cloudflare. It
  trusts only the Clerk instance whose public key is in its settings.
- **One secret: the list of ids.** `VIDEOS` is the only secret. The repository never holds a real id of a paid video;
  the local list for the developer's machine (`workers/video-access/videos.local.json`) is ignored by git.
- **Mistakes close, never open.** `"true"` in quotes, a date written `31.12.2026`, a missing field: every such typo in
  a member's record means "no access".
- **Tested without a network:** `npm run check:video-access`, 35 cases (forged and expired tokens, wrong instance,
  wrong site, typos in the record, a missing id, the CORS answers). The same run measures one check at 0.63 ms
  (median) and 2.07 ms (99th percentile) of processor time on the developer's machine; the free plan allows 10 ms.

### 3.4 What is done and what is not

Done, in the repository: the service, its tests, its local runner, `npm run dev:all`, the paid page with its states,
the build rules, the draft example `paid-demo`, the documents.

Not done:

- The Cloudflare account and the Worker (section 6). Until then `site.videoAccess.endpoint` in `src/config.ts` is
  empty, and a paid lecture on the live site would say "Видео сейчас недоступно". There is none there: the only paid
  entry is a draft, which the live build leaves out.
- The two claims in the Clerk Dashboard ("Customize session token", `PAID-VIDEO.md` section 5.1). They are needed on
  the developer's machine as much as on the live site.
- Automatic deployment of the service together with the site (proposed in section 10, waiting for the owner).
- Before real sales (`PAID-VIDEO.md` section 8): a production Clerk instance, which needs a domain of the club's own,
  and a decision about the video host.

## 4. Can the audience reach it?

The owner raised it on 2026-09-28: in some of the countries the audience lives in, Cloudflare may be blocked or
slowed down. Which countries, and what the state is there, is deliberately not written into this file. What was
measured the same day from the developer's machine, and what follows from it:

- **Sign-in already goes through Cloudflare.** The Frontend API host of the site's Clerk instance answers with
  `Server: cloudflare`, from addresses in Cloudflare's ranges; so does Clerk's image host. The site has depended on
  Cloudflare since the move to Clerk, before any Worker existed.
- **GitHub Pages** is served by Fastly; **the YouTube player** by Google.
- Where Cloudflare cannot be reached, sign-in fails, and with it every paid lecture, whichever host runs the access
  service. Moving the service elsewhere does not change that; only a sign-in provider that is not behind Cloudflare
  would, which is a much larger decision than this document's.
- The same holds for YouTube: where it is blocked or slowed down, lectures do not play, whatever the service does.
- **How to check for a given place:** ask a member there to open the site, sign in and play a public video. The
  measurements the OONI project publishes per country and per site (https://explorer.ooni.org) show whether
  Cloudflare, YouTube or GitHub Pages are blocked there.

## 5. Accounts the live site depends on

What exists, what is new, what comes later. Prices as read on 2026-09-28.

- **GitHub** - exists. The repository `Debi7/Debi7.github.io` on the colleague's account; GitHub Pages publishes the
  site and GitHub Actions builds it on every merge into `main` (`DEPLOY.md`). No cost today.
- **Clerk** - exists: sign-up, sign-in, the account page, and the member records the administrator edits. The site
  uses a development instance (`CLERK-DASHBOARD.md`). Clerk's Free plan covers 50,000 monthly retained users per
  application and allows a custom domain; Pro is 25 USD a month, or 20 USD a month billed yearly, and adds, among other
  things, multi-factor authentication and the removal of Clerk's branding. A development instance is capped at 100
  users and must not serve the real launch (`CLERK.md`).
- **YouTube** - exists: the channel that holds the lectures, uploaded as Unlisted. No cost.
- **Disqus** - exists: the comments, on the colleague's Disqus account. Not touched by this work.
- **Cloudflare** - new, for the access service only. Free plan, no card (section 6).
- **A domain of the club's own** - later, before real sales. Clerk's production instance requires "a domain you own"
  and DNS records on it; `debi7.github.io` cannot carry them. The same domain can then point at GitHub Pages, so the
  site gets the club's address as well. Any registrar will do. Cloudflare's own registrar sells at the registry's
  price with no markup, but it needs a payment card, and a domain bought there must keep Cloudflare's name servers.
  The price depends on the name and the ending (`.com`, `.org`, ...) and is shown before buying.
- **Stripe** - only if payments ever move into the site through Clerk Billing (`CLERK-DASHBOARD.md`). Not planned.

## 6. Registering Cloudflare and setting up the service, step by step

The labels are Cloudflare's as of 2026-09-28; Cloudflare moves them now and then, so a button may have a slightly
different name. `PAID-VIDEO.md` section 5.2 is the short form of 6.6 to 6.9 and must be kept in step with it.

### 6.1 Before starting

- **Whose account.** The account that runs the service holds the ids of every paid lecture, so it should belong to the
  club, not to whoever happens to click through the sign-up. Use an address both administrators can read, not a
  personal mailbox that leaves with a person.
- **A password manager**, or at least one safe place both administrators can open: the account's password, the
  two-factor recovery codes, and the master copy of the `VIDEOS` list (6.8 says why that copy is needed).
- **A phone with an authenticator app**, or a hardware security key, for two-factor sign-in.

### 6.2 Create the account

1. Open `https://dash.cloudflare.com/sign-up`.
2. Enter the email address and a password. Cloudflare asks for nothing else at this point; no card is asked for the
   free plan ("Start building for free - no credit card required", on Cloudflare's plans page).
3. Confirm the address with the link Cloudflare sends. Inviting other people later needs a verified address.
4. The Dashboard may offer to "add a website" or "add a domain". Skip it: the service runs on a `workers.dev` address
   and needs no domain on Cloudflare.

### 6.3 Protect it

1. Open the profile menu (top right) -> **My Profile** -> **Authentication**, and turn on **two-factor
   authentication**. Cloudflare offers a security key, an authenticator app or a code by email; the first two are the
   stronger ones.
2. Save the **recovery codes** Cloudflare shows into the password manager. Without them, a lost phone means a
   locked-out account.
3. Once the colleague has joined (6.4), a Super Administrator can turn on **2FA Enforcement**, which requires
   two-factor sign-in of every member.

### 6.4 Invite the colleague

**Manage Account -> Members -> Invite** (inviting needs the Super Administrator role, which the account's creator has,
and a verified address). Enter the colleague's email and choose a role. The roles that matter here:

- **Super Administrator**: everything, including members, billing and API tokens.
- **Administrator**: the whole account, but not members and billing.
- **Workers Platform Admin**: Workers and the other developer products only.

Recommended: both administrators Super Administrator, so that the club does not depend on one person being reachable.
The owner's call. Cloudflare's pages do not state a limit on members for a free account.

### 6.5 Choose the workers.dev subdomain

Every account gets one name under `workers.dev`, and every Worker's address is built from it:
`https://video-access.<the name>.workers.dev`. Cloudflare asks for the name the first time a Worker is created (or on
**Workers & Pages**, where it is shown next to "Your subdomain").

- The address is public, and it is what the site will call. Pick something neutral; Cloudflare forbids names of other
  businesses, organisations or people.
- It can be changed later (**Workers & Pages** -> **Change** next to "Your subdomain"), but the service's address
  changes with it, and the site must then be told the new one (6.9).
- Cloudflare's terms allow it to rename a `workers.dev` name "for any or no reason", with at least a week's notice.
  A custom domain (section 9) is the protection against that.

### 6.6 Create the Worker

1. **Workers & Pages -> Create -> Create Worker** (Cloudflare may offer a "Hello World" start; take it).
2. Name it `video-access`, exactly: the name becomes part of the address.
3. **Deploy** the sample as it is. This creates the Worker; its code is replaced in the next step.

### 6.7 Put the service's code in

1. Open the Worker -> **Edit code**.
2. Delete everything in the editor and paste the whole content of `workers/video-access/worker.mjs` from the
   repository (the version on `main`).
3. **Deploy.**
4. Every answer of the service carries the header `X-Video-Access-Version`. When `worker.mjs` changes in the
   repository, its `VERSION` line changes too, and the code has to be pasted again; comparing the two shows whether
   the live copy is the current one.

### 6.8 The three settings

Open the Worker -> **Settings** -> **Variables and Secrets** -> **Add**, three times:

- `CLERK_PUBLISHABLE_KEY`, type **Text**: the `pk_...` from `site.clerk.publishableKey` in `src/config.ts`. It is
  public by design; it tells the service which Clerk instance to trust.
- `ALLOWED_ORIGINS`, type **Text**: `https://debi7.github.io`. Only pages of this address may ask the service. More
  than one address is written with commas, no spaces.
- `VIDEOS`, type **Secret**: the list of paid lectures, one line per lecture, `{"<slug>": "<YouTube id>", ...}`
  (`PAID-VIDEO.md` section 4).
  Added 2026-09-30: a lecture stored on Yandex Disk takes its public link instead of an id,
  `"<slug>": {"yandexDisk": "https://disk.yandex.ru/i/<key>"}`, in the same list (`PAID-VIDEO.md` section 10).

Then **Deploy**. Two facts about secrets matter for everyday work:

- **A secret cannot be read back.** Cloudflare: "secret values are not visible within Wrangler or Cloudflare dashboard
  after you define them." Editing `VIDEOS` therefore means typing the whole list again, not adding one line to what
  is shown. Keep the master copy of the list in the password manager, change it there, and paste all of it into the
  secret each time. Without that copy, adding one lecture means finding every id again.
- **A text variable is not secret.** Never put an id into a Text variable, and never put the Clerk secret key
  (`sk_...`) anywhere at Cloudflare: the service does not need it.

The free plan allows 64 variables per Worker and 5 KB per variable, which is about 130 lectures in `VIDEOS`.

### 6.9 Check it, then connect the site

1. From any terminal, with the address Cloudflare shows for the Worker:

   ```sh
   curl -i -X POST https://video-access.<the name>.workers.dev/video
   ```

   The answer must be `401` with `{"error":"unauthenticated","reason":"no_token"}`, and the header
   `X-Video-Access-Version` must equal `VERSION` in `worker.mjs`.

2. In `src/config.ts`, set `site.videoAccess.endpoint` to `https://video-access.<the name>.workers.dev` (no trailing
   slash, no `/video`). Commit, open a pull request, merge: the site rebuilds itself.
3. If not done yet: the two claims in the Clerk Dashboard (`PAID-VIDEO.md` section 5.1), then a member record for a
   test user (`PAID-VIDEO.md` section 6).
4. Open a published paid lecture as that user: the player appears. As a guest: the sign-in box.

### 6.10 Later: when the Clerk key changes

A new Clerk instance (the move to production) has a new `pk_...`. Change `CLERK_PUBLISHABLE_KEY` of the service at the
same time as `src/config.ts`, or every member gets "Видео сейчас недоступно".

## 7. What it costs

- **Free plan**: 100,000 requests a day, counted from midnight UTC; up to 10 ms of processor time per request (time
  spent waiting for the network does not count); 100 Workers per account; no charge for data sent out.
- **What the club uses.** A signed-in visitor opening a paid lecture makes one request, plus one preflight request
  the first time in two hours (the browser remembers the answer), plus at most one retry when the token has just
  expired: three at most, one usually. 100,000 a day is therefore more than 30,000 openings of paid lectures a day.
  Guests and public pages make none. Processor time: about 0.6 ms of the 10 ms.
- **When the daily limit is reached**, Cloudflare answers with its error 1027 until midnight UTC. Paid lectures then
  show "Видео сейчас недоступно"; the rest of the site, which is on GitHub Pages, works.
- **If more is ever needed**: Workers Paid, at least 5 USD a month per account, includes 10 million requests and 30
  million milliseconds of processor time a month (then 0.30 USD per million requests and 0.02 USD per million
  milliseconds). It needs a payment card.
- **What "free" means in the terms.** Cloudflare describes the free plan as "for personal or hobby projects that
  aren't business-critical". That is a description, not a prohibition: the subscription agreement (checked
  2026-09-28) contains no clause against commercial use on the free plan. Three clauses do apply to every free user:
  no processing of payment-card data on a web property that uses free services (the site takes no payments, so this
  holds), no reselling of Cloudflare's services, and Cloudflare may end free services "in our sole discretion". If the
  club's income comes to depend on the service, the 5 USD plan is the business-grade version of the same thing.

## 8. Why Cloudflare: the comparison with the alternatives

### 8.1 What the club needs from the host

1. **Commercial use allowed on the free plan.** The club sells access; a plan "for non-commercial use" is out.
2. **No payment card to start.** A demo should not need one.
3. **No sleeping.** A member who selects a lecture should not wait a minute for a service to wake up.
4. **Runs the existing file** (a standard `fetch(request)` handler) as it is, or with a few lines of adapter.
5. **Secrets** for the list of ids.
6. **Limits far above the club's use**, a few hundred requests a day.
7. **Reachable by the audience** (section 4).
8. **Useful for the next step**: if the paid lectures move to a host with signed addresses (2.3), the service has to
   sign them, and video storage on the same account is simpler.

### 8.2 The candidates in one table

Read on 2026-09-28 from each vendor's pages (section 12). "Adapter" means the file needs a small wrapper for the
host's own entry point.

| Host                 | Free plan, commercial use          | Card to start          | Sleeps or cold starts           | Runs the file        | Cheapest paid         |
| -------------------- | ---------------------------------- | ---------------------- | ------------------------------- | -------------------- | --------------------- |
| Cloudflare Workers   | yes, 100,000 requests a day        | no                     | no cold starts, in its words    | as it is             | 5 USD a month         |
| Netlify Functions    | yes, 300 credits a month           | no                     | not documented                  | adapter              | 9 USD a month         |
| Deno Deploy          | not forbidden, 1M requests a month | not stated             | idle apps stop after 20-30 s    | adapter              | 20 USD a month        |
| Vercel Functions     | **no**, Hobby is non-commercial    | not stated             | reduced by pre-warming          | as it is             | 20 USD a month        |
| AWS Lambda           | yes, 1M requests a month           | yes (being phased out) | cold starts under 1% of calls   | adapter              | pay per use           |
| Google Cloud Run     | yes, 2M requests a month           | yes, billing account   | scales to zero                  | adapter or container | pay per use           |
| Azure Functions      | yes, 250,000 runs a month          | yes, card and phone    | scales to zero                  | adapter              | pay per use           |
| Firebase Functions   | only on the paid Blaze plan        | yes, billing account   | as Google Cloud                 | adapter              | pay per use           |
| Render               | "not for production"               | no                     | **sleeps after 15 min, ~1 min** | server needed        | 7 USD a month         |
| Fly.io               | none for new accounts              | yes                    | stops when idle                 | server needed        | about 2 USD a month   |
| Railway              | 1 USD of credit a month            | no for the trial       | optional sleeping               | server needed        | 5 USD a month         |
| Bunny Edge Scripting | none, 14-day trial                 | no for the trial       | not documented                  | adapter              | 1 USD a month minimum |

### 8.3 Each candidate, with its good and bad sides

- **Cloudflare Workers.**
  - Good: meets 1 to 6 and 8. The file runs unchanged; it can be pasted into an online editor, so nothing has to be
    installed; no waking up to wait for (Cloudflare: its model "eliminates the cold starts of the virtual machine
    model", an isolate starting "around a hundred times faster than a Node process"); 100,000 requests a day is several
    hundred times what the club needs; the paid plan is 5 USD a month; video storage (R2, 10 GB free) and a video
    service with signed addresses (Stream) are on the same account; a domain can be bought there at cost later.
  - Bad: section 9 (another account, a public address, a `workers.dev` name that Cloudflare may change, a free plan
    described as "for personal or hobby projects"), and section 4.
- **Netlify Functions.** The closest second.
  - Good: commercial projects are allowed on the free plan, in Netlify's words, "Deploy with no credit card required
    and no fees. Ever."; standard `Request`/`Response` handlers.
  - Bad: since 2025-09-04 new accounts are on credits. Free is 300 credits a month as a hard limit: requests cost 2
    credits per 10,000 and computing 10 credits per GB-hour, and when the credits run out "all of your web projects
    ... are paused" behind a "Site not available" page until the next month. The club's use would take a small part
    of that, but the stop is harder than Cloudflare's (whose limit is per day). Cold starts are not documented. The
    file needs a short adapter (settings are read with `Netlify.env.get`). Paid: 9 USD a month (1,000 credits), Pro from 20 USD.
- **Deno Deploy.**
  - Good: 1 million requests a month free; standard `Request`/`Response`; secrets are never shown again after saving,
    as at Cloudflare.
  - Bad: labelled "For personal use and smaller projects" (no clause against commercial use was found either);
    whether a card is asked is not stated; "Idle apps automatically shut down after ~20-30 seconds", and how long they
    take to start again is not stated; the platform was replaced recently (Deno Deploy Classic "will be shut down on
    July 20, 2026"). Pro 20 USD a month.
- **Vercel Functions.**
  - Good: standard handlers.
  - Bad: the free Hobby plan is ruled out: "Hobby teams are restricted to non-commercial personal use only", and its
    examples of commercial use include "Any method of requesting or processing payment from visitors of the site".
    For the club that means Pro, 20 USD a month.
- **AWS Lambda.**
  - Good: 1 million requests a month in the always-free tier.
  - Bad: AWS asks for a card to verify the account (a September 2026 announcement says "For most new customers, no
    credit card is required to start", rolled out gradually); a new account on AWS's free plan "closes automatically"
    after six months unless it moves to the paid plan; the handler takes AWS's own event format, so the file needs an
    adapter; the setup (permissions, function address) is the heaviest of all.
- **Google Cloud Run** and **Firebase Functions** (Google Cloud underneath).
  - Good: 2 million requests a month free, no end date.
  - Bad: a billing account with a card is required; functions are written in the Express style, so the file needs an
    adapter or a container; instances scale to zero when idle.
- **Azure Functions.**
  - Good: 250,000 runs a month free on the current plan.
  - Bad: a card and a phone number are required; the handler is partly standard; the older "Consumption" plan is
    being retired.
- **Render, Fly.io, Railway.** These run whole servers, not functions, so the file would need a small server around
  it. Render's free service sleeps after 15 minutes without traffic and "takes about one minute" to wake, and Render
  itself says not to use free instances for production; Fly.io has no free allowance for new accounts and needs a
  card; Railway gives a one-off trial and then 1 USD of credit a month. None fits better than a function host.
- **Bunny Edge Scripting.** Standard handlers through Bunny's own wrapper, 0.20 USD per million requests, but an
  account minimum of 1 USD a month and no free plan beyond a 14-day trial. The owner turned Bunny down on 2026-09-28
  as paid.
- **A server of the club's own.** A monthly fee, and somebody has to keep it updated and secure. Out of proportion
  for one small function.

### 8.4 Conclusion

On what the club needs, Cloudflare Workers fits best: the only candidate that meets every point of 8.1 except the
open question 7, with the file as it is and nothing to install. Netlify is the fallback if Cloudflare is ruled out,
at the cost of a short adapter and a harder monthly stop. The others either need a card, forbid commercial use on the
free plan, or sleep.

Point 7, reachability, can overturn this for a given audience; section 4 is about that.

## 9. The downsides of Cloudflare

- **One more account to keep.** It holds the lecture ids. A lost password without recovery codes, or an account in the
  name of someone who has left, means setting it up again (section 6 takes about half an hour, provided the master
  copy of `VIDEOS` exists).
- **A public address anyone can call.** Nobody gets an id without a member's token, but anybody can send requests. A
  flood of them would use up the 100,000 a day, and paid lectures would be unavailable until midnight UTC. Cloudflare's
  firewall rules against floods apply to a domain on Cloudflare (a zone), not to a `workers.dev` address; the free plan
  allows one such rule. A code-level limit exists as well (the "Rate Limiting" binding, generally available since
  2025-09-19), but it is set up with `wrangler`, and its plan availability is not stated. For the club's size this is a
  risk to note, not to build against now.
- **The address can change.** Cloudflare may rename a `workers.dev` name with a week's notice (6.5); the site's
  `endpoint` then has to follow. A domain of the club's own on Cloudflare removes this, and removes the previous point
  too.
- **Free can end.** Like any free plan, at the vendor's discretion; the paid plan is 5 USD a month.
- **Reachability** is section 4.
- **Lock-in is small.** The service is standard JavaScript. Moving it means pasting the same file into another host
  (with a short adapter where the host expects a different entry point), copying three settings, and changing one line
  in `src/config.ts`.

## 10. Automatic deployment: proposed, not built

Today the service is deployed by pasting (6.7). The owner asked on 2026-09-28 for one action that publishes the site
and the service together. The proposal, waiting for the owner's decision on Cloudflare:

- A second job in `.github/workflows/deploy.yml`, next to the site's. On every merge into `main` it runs the
  service's 35 tests and then uploads `worker.mjs` to Cloudflare through Cloudflare's API with a short Node script of
  the project's own (no `wrangler`, no new dependency). The settings `CLERK_PUBLISHABLE_KEY` and `ALLOWED_ORIGINS`
  come from `src/config.ts` and `astro.config.mjs`, so they cannot drift from the site; the secret `VIDEOS` stays
  where it is and is kept on every upload. Then the job asks the live service for its version and fails if it is not
  the new one.
- It needs two secrets in the GitHub repository (**Settings -> Secrets and variables -> Actions**, on the colleague's
  repository): `CLOUDFLARE_ACCOUNT_ID` (Cloudflare: **Workers & Pages** -> **Account Details** -> copy **Account ID**)
  and `CLOUDFLARE_API_TOKEN`. The token is made under **Account API tokens -> Create Token**; Cloudflare's template
  "Edit Cloudflare Workers" grants far more than needed (routes, storage, logs), so a custom token with the single
  permission **Account -> Workers Scripts -> Edit** is enough and is what should be made. Cloudflare shows a token
  once.
- Until the two secrets exist, the job says so and does nothing, so it can be merged before the account exists.
- What changes for the administrators: nothing is pasted any more; a merge publishes both. `VIDEOS` is still edited in
  the Cloudflare Dashboard, because the ids must not pass through GitHub.

## 11. Decisions that are the owner's

- Is Cloudflare the host for the access service (sections 4, 8, 9)?
- If so: who creates the account, with which address, and which role the colleague gets (6.1, 6.4).
- Automatic deployment (section 10): yes or no.
- Before real sales: the domain, the production Clerk instance, and whether YouTube stays the video host
  (`PAID-VIDEO.md` section 8).

## 12. Sources

Read on 2026-09-28.

Cloudflare:

- Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Plans: https://www.cloudflare.com/plans/
- Self-Serve Subscription Agreement (last updated 2025-09-12): https://www.cloudflare.com/terms/
- Developer Platform service-specific terms: https://www.cloudflare.com/service-specific-terms-developer-platform/
- Creating an account: https://developers.cloudflare.com/fundamentals/account/create-account/
- Members and roles: https://developers.cloudflare.com/fundamentals/manage-members/ and
  https://developers.cloudflare.com/fundamentals/manage-members/roles/
- Two-factor authentication: https://developers.cloudflare.com/fundamentals/user-profiles/2fa/
- workers.dev: https://developers.cloudflare.com/workers/configuration/routing/workers-dev/
- Secrets: https://developers.cloudflare.com/workers/configuration/secrets/
- API token permissions and templates: https://developers.cloudflare.com/fundamentals/api/reference/permissions/ and
  https://developers.cloudflare.com/fundamentals/api/reference/template/
- Worker upload through the API: https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/update/
- Rate limiting rules: https://developers.cloudflare.com/waf/rate-limiting-rules/ ; the binding:
  https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- Registrar: https://developers.cloudflare.com/registrar/ and https://developers.cloudflare.com/registrar/faq/
- Custom domains for Workers: https://developers.cloudflare.com/workers/configuration/routing/custom-domains/

Clerk:

- Pricing: https://clerk.com/pricing
- Deploy to production ("You will need to have a domain you own"):
  https://clerk.com/docs/guides/development/deployment/production

YouTube:

- Developer Policies (last updated 2026-09-14), "Playback Integrity" and "Prohibited Actions":
  https://developers.google.com/youtube/terms/developer-policies
- Embedding and the policies that apply to it: https://support.google.com/youtube/answer/171780
- Video privacy settings (Unlisted, Private): https://support.google.com/youtube/answer/157177 and
  https://support.google.com/youtube/answer/9230970 ; watching a private video: https://support.google.com/youtube/answer/77272
- Player parameters (`modestbranding`, `rel`): https://developers.google.com/youtube/player_parameters
- Channel memberships: https://support.google.com/youtube/answer/7636690 , https://support.google.com/youtube/answer/7544492 ,
  revenue share https://support.google.com/youtube/answer/7491256 ; Partner Program thresholds
  https://support.google.com/youtube/answer/13429240 and the 2027 change https://support.google.com/youtube/answer/12843009

Other hosts:

- Netlify: https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/ ,
  https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/ ,
  https://www.netlify.com/blog/introducing-netlify-free-plan/ (2024-11-12), https://docs.netlify.com/build/functions/overview/
- Deno Deploy: https://deno.com/deploy/pricing , https://docs.deno.com/deploy/
- Vercel: https://vercel.com/docs/limits/fair-use-guidelines , https://vercel.com/docs/plans/hobby ,
  https://vercel.com/docs/plans/pro-plan
- AWS Lambda: https://aws.amazon.com/lambda/pricing/ ,
  https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html ,
  https://aws.amazon.com/free/registration-faqs/ , https://aws.amazon.com/blogs/aws/aws-reimagines-the-getting-started-experience/
- Google Cloud Run: https://cloud.google.com/run/pricing , https://docs.cloud.google.com/free/docs/free-cloud-features
- Azure Functions: https://azure.microsoft.com/en-us/pricing/details/functions/ ,
  https://azure.microsoft.com/en-us/pricing/purchase-options/azure-account
- Firebase: https://firebase.google.com/pricing
- Render: https://render.com/docs/free ; Fly.io: https://docs.fly.io/about/pricing/ ; Railway:
  https://docs.railway.com/reference/pricing/free-trial
- Bunny Edge Scripting: https://bunny.net/docs/scripting/pricing
- Cloudflare, how Workers run: https://developers.cloudflare.com/workers/reference/how-workers-works/
