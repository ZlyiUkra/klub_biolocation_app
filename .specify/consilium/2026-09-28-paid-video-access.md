---
consilium: 2026-09-28
topic: Paid, members-only videos on the static site - access granted by hand in the Clerk Dashboard
slug: paid-video-access
verdict: approved-with-conditions
route: direct-verified
archetypes:
  nitpicker: ok
  security: ok
  performance: ok
  best-practices: ok
  pragmatist: ok
---

# Paid, members-only videos

## Agreed proposal

Some lectures in the Video section become paid. A visitor pays outside the site, an administrator sees the payment
and grants that visitor access by hand in the Clerk Dashboard, and from then on the visitor, signed in, can watch
every paid lecture until the date the administrator set. Everybody else - guests, and signed-in visitors without
access - sees that the lecture exists, with its title and description, but not the video, and cannot obtain it from
the page, its source, the site's feeds or the public repository. Access ends by itself after its last day, or at
once when the administrator withdraws it. The point is a demonstrable, working first version with one kind of
membership, built so that a better video host, a production Clerk instance and separate courses can be added later
without touching what is already published or recorded.

## Bounds and constraints

- In scope: the `access` field of a video, the build-time rules that keep a paid video's id out of the build, the
  stub and its states on a paid video's page, the access service (a Cloudflare Worker, free plan), a local runner
  and tests for it, a draft example entry, the documents.
- Out of scope: payment integration, comments and likes for signed-in users, separate courses ("packs"), a video
  host with signed URLs, the production Clerk instance, deploying the Worker (the owner's Cloudflare account does
  not exist yet).
- The site stays static on GitHub Pages; Node 20, Astro 4.16, no new npm dependency (no wrangler, no
  `@cloudflare/workers-types`, no React integration).
- The access record is the one CLERK-DASHBOARD.md 7.3 already defines: `member: true` and `memberUntil:
"YYYY-MM-DD"` in public metadata, carried into the session token by the claims of 7.2.

## Remarks that survived

- [confirmed] A paid entry's id can leak through `videoUrl` and `thumbnail`, not only `videoId`, and through the
  body, which reaches the page, the RSS feed and the search index. The schema refuses the three fields on a paid
  entry; `getVideos()` refuses a YouTube address in a paid entry's body (nitpicker 1, security 2, best-practices 2).
- [confirmed] `pack` in front matter would be a second copy of an access policy nothing reads; front matter keeps
  `access` only, and packs are deferred (nitpicker 2, best-practices 1, pragmatist 2).
- [confirmed] The access rule must be an allowlist: `member === true`, `memberUntil` a real date, compared in UTC.
  Measured in Node by security: `Boolean("false")` is true and an Invalid Date compares as "not expired", so a
  lenient check turns an administrator's typo into permanent access (security 3, nitpicker 3).
- [confirmed] Token checks beyond exp/nbf/azp: RS256 only, the key from the JWKS of the instance named in the
  Worker's settings - never from the token's `iss` - `iss` equal to that instance, `sid` present, `sts` not
  "pending" (security 4; `sts`: Clerk core-3 "Session tokens" default claims and "Manual JWT verification" 3).
- [confirmed] Open redirect in `nextPath()`: `?next=/%5Chost/` and `?next=/%09/host/` pass the string test and
  lead to another host; security verified both in headless Edge against a copy of the rule. Fixed by resolving
  with `new URL` and keeping same-origin results only (security 5).
- [confirmed] The page accepts a player address only on `https:` and a listed host, so a broken or hijacked
  Worker cannot inject a script URL (security 7).
- [confirmed] Astro 4.16 hoists a component's script onto every page that imports the component, so "script on
  paid pages only" is impossible without `experimental.directRenderScript`; the script exits at once without a
  stub and loads Clerk by dynamic import only (nitpicker 4, performance 2; best-practices withdrew its contrary
  claim when asked for the 4.16 text).
- [confirmed] One address `POST /video` with `Access-Control-Max-Age: 7200`, so one preflight serves every video
  (performance 4).
- [confirmed] RS256 verification costs about 0.5 ms per request against the 10 ms CPU limit of the free plan
  (performance 5, measured in Node 20; the test script repeats it).
- [confirmed] Missing states: 401 retried once with a fresh token, 404 "not connected yet", a "check again" button
  on 403 for the moment access is granted, an unavailable service (pragmatist 7-8, nitpicker 6, best-practices 6).
- [confirmed] The Worker takes the site's publishable key as its one Clerk setting and derives the JWKS address
  from it, so the two sides are compared by one string and key rotation needs no action (pragmatist, answer to
  the interrogator, over pinning the JWK).
- [confirmed] The colleague's `<SignedIn>` + `publicMetadata.hasCourse` idea is rejected by all five: the iframe
  `src` would be in the built HTML or the bundle, `<SignedIn>` is the Core 2 API (Core 3 has `<Show>`), it needs
  `@clerk/clerk-react` and `@astrojs/react` and a second place that creates Clerk, and `hasCourse` would be a third
  name for `member`. Its administrative half - the administrator writes public metadata - is exactly the runbook.

## Flagged by the interrogator

- [weak] "`astro check` will fail on the Worker" (best-practices 7) - true only for a `.ts` Worker; a `.mjs` file is
  not type-checked without `checkJs`. The Worker is `.mjs`. Resolved by the choice of format.
- [weak] "Clerk puts null in a claim for a missing field" (nitpicker 3) - an assumption, no Clerk text found. The
  allowlist makes the form irrelevant.
- [weak, reduced] "Require `sid` to reject JWT-template tokens" (security 4) - security's own reading of two default
  claim lists; that template tokens share the signing key is unverified. Kept as a cheap check.
- [contradicts the 2026-09-25 verdict] That verdict allowed Clerk to load "when the visitor is a member"; there is no
  way to know membership without Clerk. The honest wording is "a signed-in visitor on a paid page". A signed-in
  non-member pays the Clerk download on a paid page; the owner accepted Clerk's size on 2026-09-26. Not changed:
  a membership hint in local storage (nitpicker) would go stale exactly when access is granted.
- [not a blocker of the demo] Third-party scripts (page counter, Disqus) run in the site's origin on every page,
  paid ones included; a path needs the supplier compromised first. A condition before real sales (security 6).
- [not a blocker of the demo] YouTube unlisted ids cannot be revoked per person. Pragmatist costed a later move to a
  signed-URL host: no site change, about 15 lines in the Worker, about 10 minutes per lecture, roughly 1 USD a month;
  a leaked lecture can be rotated for everyone by re-uploading. A condition before real sales, with the originals
  kept outside YouTube meanwhile (security 1).

## Deliberately not done

- Packs: one membership covers every paid video; adding packs later is an optional claim and a few lines in the
  Worker, with no change to existing records.
- A membership hint flag, to spare signed-in non-members the Clerk download: stale at the one moment it matters.
- `experimental.directRenderScript`: experimental, and it changes hoisting for every script on the site.
- Deploying with wrangler: a new, unpinned dependency with its own Node requirements; the Worker is pasted into the
  Cloudflare Dashboard and reports its version in a response header instead.
- Automating the live paid-page check inside `check:auth`: the build has no paid page (the example is a draft);
  the browser run of 2026-09-28 below was a one-off probe.

## Route

- Council's recommendation: split. Pragmatist and performance: direct-verified (the spec is VIDEO-PAGE.md 6.1 plus
  this verdict). Nitpicker, best-practices and security: speckit (first component outside Pages, a contract between
  two deployments, a negative test matrix).
- Owner's decision (2026-09-28, given while the council sat): finish the discussion and, unless there were
  questions for the owner, implement at once and verify locally. There were none that blocked the build, so the
  route is direct-verified. The concern behind the speckit votes - a written contract and a negative test matrix -
  is met by the contract in the header of `workers/video-access/worker.mjs`, the matrix in
  `scripts/check-video-access.mjs` and the how-to in `PAID-VIDEO.md`.
- Verification list, as run on 2026-09-28:
  - `npm run check:video-access`: 35/35 - 13 kinds of bad token answer 401, 8 kinds of bad access record answer
    403, CORS and routing, 404 for an unknown or prototype slug, 400 for a bad body, 503 for a broken setting or an
    unreachable key list; no network. Timing p50 about 0.5 ms, p99 about 1 ms.
  - Browser, dev server on 4387 with the local Worker and the real Clerk development instance, headless Edge: guest
    sees the sign-in state and loads no Clerk; a public video keeps its player and loads no Clerk; the demo user
    without access gets a real 403 and the "denied" state; "check again" sends a new request; intercepted answers:
    200 with a YouTube address plays, `javascript:` and a foreign host are refused, 404 shows "not connected", 503
    and a repeated 401 show "unavailable"; `next=/%5Cevil.example/`, `next=/%09/evil.example/` and
    `next=//evil.example/` stay on the site, `next=/video/paid-demo/` is followed. 20/20 of those.
  - `dist/`: with the endpoint empty the minifier drops the request code and a video page's script is 378 bytes.
    Built once with a dummy endpoint: the video pages' script is 1.1 KB gzip and reaches the Clerk chunk only
    through `import("./auth...")`; the chunk is imported statically by the three `/auth/` pages only.
  - `npm run check`, `npm run build`, `npm run check:pages`: green. `npm run check:auth`: 18/19, the same as before;
    the one failure is the demo line, which waits for the demo user's metadata in the Dashboard.
  - Left for the owner, live: the Customize session token claims and the demo user's metadata in the Clerk
    Dashboard, then "check again" on `/video/paid-demo/` shows the player (PAID-VIDEO.md section 3).
