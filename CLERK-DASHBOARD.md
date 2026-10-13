# The Clerk Dashboard, payments and paid access - for the colleague's decision

> **Superseded 2026-10-12 (T167).** Clerk is gone from this repository: its packages, React, its scripts, its key and
> its configuration are deleted, and the sign-in, the statuses and the paid lectures are the club's own backend. This
> file is kept as the history of the arrangement and is not a description of the site.

Written on 2026-09-26 for the colleague's review, on the branch `clerk-auth`. It explains what the Clerk Dashboard
(https://dashboard.clerk.com) is and which of its pages this site would use (sections 2 and 3), why paid content needs
more than the Dashboard on a static site (sections 4 and 5), how payments can be taken with Stripe, without Stripe and
in crypto (section 6), and, step by step, how to administer the Dashboard and grant paid access by hand (section 7).
The decisions asked for are in section 10.

The build plan is `CLERK.md`, and the reasons behind it are in `.specify/consilium/2026-09-25-clerk-static.md`. This
file changes neither of them. Statements about Clerk were checked against Clerk's current documentation (Core 3) on
2026-09-26; statements about payment providers were checked on their public pages the same day and are listed with
their sources in section 11. Providers change their terms often, so check each one again before signing up.

## 1. The short answer

- Using Clerk means using the Dashboard. The two cannot be separated: sign-in rules, email templates, users, keys and
  access records are configured there and nowhere else. The real question is whether to use Clerk at all.
- On this site the Dashboard matters more than it would elsewhere. The site is a static build on GitHub Pages with no
  server of its own, so the Dashboard is the only place for the settings a backend would normally hold.
- Clerk's own payments (Clerk Billing) work through Stripe only. For an audience spread over many countries that is
  not enough, so payments are taken outside Clerk, by any of the services in section 6, and access is recorded in
  Clerk by hand (section 7). No card data ever reaches the site or its administrators.
- The Dashboard can **record** who has paid access. It cannot **enforce** it on a static site: anything published to
  GitHub Pages is public. Enforcing access needs one small server-side check outside GitHub Pages (section 5).

## 2. Why the Dashboard carries so much weight here

On a site with a server, much of the sign-in behaviour lives in code: which fields a form has, how long a session
lasts, who counts as a paying member. This site has no server. The browser loads Clerk's ready-made components (sign
in, sign up, user profile) on three pages, and those components read their rules from the Clerk instance. That
instance is configured in the Dashboard.

In practice:

- A change to the password rule, the sign-in methods or an email text is a Dashboard change. The site is not rebuilt,
  and the repository does not change.
- Whoever can open the Dashboard controls who can sign in and who has paid access. Access to the Dashboard is
  therefore a question about the project, not a formality (section 3.8).
- Nothing in the repository documents these settings by itself. `CLERK.md` section 1 lists the values the site
  depends on; a change made in the Dashboard should be written down there too.

## 3. The Dashboard pages this site would use

Each item says what the page is for, the value this site needs, and how often anyone would touch it. Page names are
the ones Clerk's documentation used on 2026-09-26; the Dashboard's wording can shift slightly over time.

### 3.1 Application and instances

- One application, for example "Klub Biolocation", with two instances: Development and Production.
- **Development** (publishable key `pk_test_...`): works on `localhost` on any port and on `debi7.github.io`, so one
  key serves local work and the live demo (`CLERK.md` section 0). A "Development" banner shows on the forms, and
  email subjects are prefixed with "Development". It is capped at 100 users (as recorded in `CLERK.md`; this figure
  was not found in the docs on 2026-09-26 and should be confirmed in the Dashboard). Its domain cannot be changed.
- **Production** (`pk_live_...`): needs a domain the club owns, because Clerk asks for DNS records that cannot be
  added to `github.io`. Users created on Development do not move to Production, and neither do their access records.
- Touched: once, at setup; again when the club gets its own domain.

### 3.2 User and authentication (sign-in methods)

- Email address on, password on. Phone, username, social providers and passkeys off (`CLERK.md` section 1).
- Email verification at sign-up **by code**, not by link. A code works on any device and needs no callback page on
  the site; a link only works on the device that started the sign-up.
- Minimum password length 8 (the owner's rule of 2026-09-25).
- Touched: at setup; later only if a sign-in method is added, for example Google.

### 3.3 Emails

- The templates of every mail Clerk sends: verification code, password reset code, and so on. They are edited in a
  WYSIWYG editor under **Emails**.
- This site writes and sends no mail of its own. The mail texts belong to the club, so the language and wording of
  these templates is a product decision, not a code one.
- Touched: at setup, to put the texts into the site's language; rarely afterwards.

### 3.4 Users and metadata

- The list of everyone who has signed up: search by email, create, block or delete a user, see their sessions.
- The demo account for showing the site lives here (`CLERK.md` section 1, item 6).
- **Metadata**, per user. This is where paid access is recorded (sections 4 and 7):
  - `publicMetadata`: written only from the Dashboard or from Clerk's Backend API; the browser can read it but not
    change it. Paid access goes here.
  - `privateMetadata`: written from the Dashboard or the Backend API; the browser cannot even read it. Administrative
    notes about a payment go here.
  - `unsafeMetadata`: the user's own browser can write it, so a visitor could give themselves any value. It must never
    decide access.
- Touched: whenever someone needs help with an account, and each time someone pays (section 7.4).

### 3.5 Sessions

- Session lifetime and the **Customize session token** claims editor.
- The claims editor matters for paid content. It copies single fields of `publicMetadata` into the signed session
  token, so the server-side check of section 5 can read them from the token without asking Clerk. Clerk advises adding
  single fields rather than the whole object, because the token is limited to about 1.2 KB. The claims this site
  would add are in section 7.2.
- Clerk refreshes the session token every 60 seconds, so an access change made in the Dashboard reaches a signed-in
  visitor within about a minute.
- Touched: at setup; once more when paid content is built.

### 3.6 Attack protection

- Bot sign-up protection (a CAPTCHA) and related settings. It is switched off on Development so that the automated
  browser check can sign in (`CLERK.md` section 1, item 5), and it should be on in Production.
- Touched: at setup and when moving to Production.

### 3.7 API keys

- The publishable key (`pk_...`) is public by design and goes into `src/config.ts`.
- The secret key (`sk_...`) is never needed by the static site and must never enter the repository. If a server-side
  check or an automatic payment hook is added (sections 5 and 6), the secret key, or the instance's JWKS public key,
  is stored in that service's own secret settings, never in git.
- Touched: once per instance.

### 3.8 Team (who can open the Dashboard)

- Dashboard access for people, separate from the site's users. `CLERK.md` records three seats on the free plan.
- The colleague is expected to create the application and administer it. The consilium's condition still holds in
  a symmetrical form: whoever creates the application invites the other one as an administrator the same day, so
  that both have full access and nobody depends on someone else's login. Section 7.1 has the steps.
- Touched: once.

### 3.9 Billing (only with Stripe)

- Clerk's built-in subscriptions. Section 6.2 describes it; section 6.3 explains why this site may not be able to use
  it for everyone.

### 3.10 Webhooks (optional)

- Clerk can call an external address on events such as "user created". A static site cannot receive such calls, so
  webhooks matter only together with the server-side piece in section 5.

## 4. Paid content: the three separate questions

"Paid content with restricted access" is three questions, and the Dashboard answers only the first two.

1. **Who has paid?** The payment service knows (section 6). The site never sees card numbers or bank details; an
   administrator sees only what the service reports, such as an email, an amount and a reference.
2. **Where is that recorded?** On the user in Clerk, in `publicMetadata` (section 7.3). A visitor cannot change it.
3. **Who stops a visitor who has not paid?** On a static site, nobody yet. Every file in `dist/` is public on GitHub
   Pages. Clerk in the browser can hide a button or a player, but the page, the video ID or the PDF behind it is still
   delivered to everyone who knows the address. Any check made only in the browser is presentation, not protection.

The consilium already fixed one rule for any option: the video ID of a paid entry never appears in front matter or in
the built HTML (`.specify/consilium/2026-09-25-clerk-static.md`, "Deliberately not done").

## 5. What would enforce access

Something has to run where the visitor cannot see or change it, verify the Clerk session token, and only then hand
out the protected thing. The rest of the site stays static on GitHub Pages; the Astro build does not change.

- **Option A - a small serverless function**, for example a Cloudflare Worker. The page sends the visitor's Clerk
  session token. The function verifies it with the instance's public key, which needs no call to Clerk, reads the
  `member` and `memberUntil` claims (section 7.2), and returns the video ID or a short-lived link. This is the smallest
  real lock: one file and one secret setting, deployed outside the repository's Pages workflow.
- **Option B - a video host with private or signed links**, for example Vimeo with domain restriction or a streaming
  service with signed URLs. This protects the video file itself rather than just its ID. Signed URLs are still
  generated by a function like option A, so B usually comes on top of A rather than instead of it.
- **Option C - no lock, only a hidden player.** No new service is needed, but the paid content is effectively public
  to anyone who looks at the page source. It is acceptable only for a demo, never for material people pay for.

Any of these is a new architectural decision: the first piece of the site that runs outside GitHub Pages. It should
go through its own consilium before it is built.

**Decided and built on 2026-09-28: option A.** The consilium of that day (`.specify/consilium/2026-09-28-paid-video-access.md`)
chose a Cloudflare Worker, `workers/video-access/`, which returns the YouTube embed address to a member; option B can
come later without changing the site. How to set it up, add a paid video and see it is `PAID-VIDEO.md`.

## 6. Taking payments

### 6.1 The first question: where does the club receive the money?

What a payment service can do is decided mostly by where the **seller** is registered: the country of the club, or of
the person or company that receives the money. The buyer's country matters second. Every option below therefore starts
with the same check: can a club registered where this one is open an account with that service?

The club's registration is not recorded anywhere in the repository. It is the first thing to settle (section 10).

### 6.2 With Stripe: Clerk Billing

What it is:

- Plans (for example "Free" and "Club member") made of Features (for example "paid-lectures"), created in the
  Dashboard under Billing. Clerk shows the pricing table and the checkout with its own components; the check in code is
  `has({ plan: "..." })` or `has({ feature: "..." })`.
- A Development instance uses a shared test Stripe account from Clerk, so a paid flow can be shown to the client
  without any Stripe account. Production needs the club's own Stripe account.
- When a subscription ends or payment stops, Clerk moves the user back to the free plan by itself. No manual work.

Where it stops:

- It works only through Stripe, and only where Stripe accepts the seller. On 2026-09-26 Stripe listed 46 countries.
  Among the region's countries, Estonia, Latvia and Lithuania were on the list; Kazakhstan, Uzbekistan, Georgia and
  Armenia were not. Clerk Billing is also not offered in six countries outside the region (Clerk's FAQ).
- Buyers pay by card through Stripe. A buyer whose card an international processor does not accept cannot pay this
  way at all.

When to use it: if the club can open a Stripe account and most of the audience pays with internationally accepted
cards. Otherwise use sections 6.3 and 7, or both side by side (a user with a Billing plan or with manual access is
let through).

### 6.3 Without Stripe

None of these talks to Clerk. Each one takes the money and reports the payment; access is then recorded by hand
(section 7.4), or automatically later through a small function that receives the service's notification and writes
`publicMetadata` through Clerk's Backend API.

- **Merchant of Record: Paddle, Lemon Squeezy.** The service is the legal seller: it takes the payment, handles VAT
  and sales tax, and pays the club out. Paddle sells to buyers in more than 200 countries and territories. Lemon
  Squeezy accepts buyers from all countries except those on its own unsupported list, and pays sellers out by bank
  transfer in 79 countries or through PayPal in more than 200. Both send a notification on every payment. Both review
  what is being sold before approving the seller, so the club's content has to pass their acceptable-use rules.
- **A regional card acquirer.** WayForPay (Ukraine) accepts international cards from buyers anywhere, pays out in
  UAH, and posts every order status to an address the merchant gives, signed with HMAC-MD5. Local acquirers in other
  countries work the same way but usually require a legal entity in their country: Kaspi Pay in Kazakhstan, for
  example, needs a registered business there, and a foreign company has to provide a trade register extract. Pick the
  acquirer of the country where the club is registered.
- **A membership platform: Patreon.** Members pay the platform; the creator sees a member list and can use its API
  (version 2; version 1 stops responding on 2026-10-07). The paid material can even live on the platform, in which
  case the site needs no lock at all, at the price of sending members off the site. Payouts depend on the creator's
  country.
- **A direct bank transfer or payment link.** The simplest option for a small club: an invoice or a bank payment
  link, and the payer puts their sign-in email into the payment reference. It is fully manual and fits section 7
  without any change.

### 6.4 Payers a provider refuses

Every international card provider above refuses sellers and buyers in countries under international sanctions, and
each keeps its own list. A payer who is refused by one provider may be accepted by another, or by the options in 6.5
or the bank transfer in 6.3. It is the club's responsibility to check, before it accepts a payment, that doing so is
lawful where the club is registered and allowed by the provider's terms; this file does not give legal advice.

### 6.5 Crypto (optional)

Two ways, both compatible with section 7:

- **A crypto payment gateway, for example NOWPayments.** It supports USDT and other stablecoins on several networks,
  charges 0.5 % without conversion and 1 % with conversion, plus the network fee, with no monthly fee (its own
  figures, 2026-09-26). It creates an invoice, watches the blockchain, and sends a signed notification (IPN, HMAC)
  when the invoice is paid. The administrator gets a message and records access by hand, or a function does it later.
- **A direct wallet address.** The club publishes one address, preferably for a stablecoin such as USDT, so the price
  does not float. The payer sends the amount and then sends the transaction hash and their sign-in email. The
  administrator checks the transaction in a block explorer (the amount, the network, the receiving address, enough
  confirmations) and records access by hand. There are no fees apart from the network's, but everything is manual.

Things to know before choosing crypto:

- A transfer cannot be reversed. A payment to a wrong network or a wrong address is lost, so the payment page must
  name the network exactly (for example "USDT on TRON (TRC-20)"), not just the coin.
- A refund is a new transfer from the club's wallet, made by hand.
- Gateways run their own identity checks on the seller and may freeze a payment for review.
- The legal and tax status of crypto payments differs between countries; the same check as in 6.4 applies.

### 6.6 Recommendation

Start with manual access (section 7) and one or two payment channels chosen after the question in 6.1 is answered:
for example a Merchant of Record or a regional acquirer for card payers, plus a USDT address for everyone the card
providers refuse. Add automation (a function that writes `publicMetadata` on a payment notification) only once it is
clear which channel people actually use. Clerk Billing is worth adding only if the club can open a Stripe account and
enough of the audience can pay through it.

## 7. Administering the Dashboard and granting access by hand

This section is the runbook for whoever administers the Dashboard. It needs no programming, only a browser.

### 7.1 Getting into the Dashboard

If you create the application:

1. Open https://dashboard.clerk.com and sign up with your own email address. Clerk creates a "Personal workspace" for
   the new account.
2. Create an application named "Klub Biolocation". When asked for sign-in options, choose **Email** and
   **Password** only.
3. Invite the other administrator at once: at the top of the Dashboard select **Invite** (or open the **Team** page and
   select **Invite user**), enter their email, choose the administrator role, select **Invite**.
4. Open **API keys** and send the publishable key (`pk_test_...`) to whoever builds the site. Never send or copy the
   secret key (`sk_test_...`) anywhere.

If you were invited instead: accept the invitation from the email, sign in, and pick the club's workspace in the
workspace menu at the top left.

### 7.2 First-time setup

1. Apply the settings of `CLERK.md` section 1, items 2 to 6: sign-in options, verification by code, password length,
   bot protection on Development, the demo account.
2. **Emails**: open each template and translate its text into the site's language.
3. **Sessions -> Customize session token**: once paid content is being built, add two claims so the server-side check
   can read them (field names as agreed in 7.3):

   ```json
   {
     "member": "{{user.public_metadata.member}}",
     "memberUntil": "{{user.public_metadata.memberUntil}}"
   }
   ```

   Nothing on the site uses these claims until the lock of section 5 exists; adding them early does no harm.

   Amended 2026-09-28: the lock exists now (`PAID-VIDEO.md`), so this step is required. Without these claims every
   member is refused.

   Amended 2026-10-02 with the admin panel and the members' statuses (`ADMIN.md`): a third claim,
   `"status": "{{user.public_metadata.status}}"`, which the content, status and video services read. Without it nobody
   can edit posts or assign statuses, and a blocked member is not recognised as blocked. The statuses themselves -
   guest, student, expert, master, metr, admin, blocked - are given at `/admin/users/` by a metr or an admin, or by hand
   here as `"status": "<value>"` in public metadata, next to the keys already there (ADMIN.md sections 1 and 4.1).

### 7.3 The access record

Paid access is two fields in a user's **public** metadata, written exactly like this:

```json
{
  "member": true,
  "memberUntil": "2026-12-31"
}
```

- `member`: `true` gives access. Write `true` without quotes; `"true"` in quotes is text and would not count.
- `memberUntil`: the last day of access, always in the form `YYYY-MM-DD`. The lock treats the day as included and
  stops access the day after, with no action from anyone. For access with no end date, agree on a far date such as
  `2099-12-31` rather than leaving the field out, so every record has the same shape.
- Added 2026-09-28, when the lock was built: the day ends at midnight UTC, and anything but exactly `true` and a
  real date in that form means "no access" - a missing field too. A typo closes access; it never opens it.
- Added 2026-10-02, the owner's status model (`ADMIN.md` section 1): a status opens the paid lectures as well. Any
  status but guest and blocked - student, expert, master, metr, admin - is access with no end date, given at
  `/admin/users/`; this record still opens them on its own, and the status `blocked` closes both (`PAID-VIDEO.md`
  section 6).

Administrative notes go into the user's **private** metadata, which the visitor's browser cannot read:

```json
{
  "payments": [
    {
      "date": "2026-09-26",
      "channel": "usdt-trc20",
      "amount": "15 USDT",
      "ref": "a1b2c3...",
      "until": "2026-12-31"
    }
  ]
}
```

- `ref` is the payment service's order number or the transaction hash: something to find the payment by, never card
  data, bank account numbers or passport data.

### 7.4 Granting access after a payment

1. The payment service reports a payment, by email or in its own dashboard, with the payer's sign-in email and a
   reference. For a direct crypto transfer, first check the transaction in a block explorer (section 6.5).
2. In the Clerk Dashboard open **Users** and search for that email.
   - Not found: ask the payer to sign up on the site first with the same email. Do not create the account for them;
     they would then have to reset a password they never chose.
   - Found with a different email than the one on the payment: ask the payer which account is theirs before going on.
3. Open the user and find the **Metadata** section.
4. Under **Public**, select **Edit**, enter the record of section 7.3, and save. If the field already holds other
   keys, keep them and add these two.
5. Under **Private**, select **Edit**, add the payment to the `payments` list, and save.
6. Add a line to the payment log (section 7.6).
7. Tell the payer that access is open. A signed-in visitor gets it within about a minute; signing out and in again
   makes it immediate.

### 7.5 Renewing, ending early, refunding

- **Renewal**: change `memberUntil` to the new last day, add the payment to `payments`, add a log line.
- **Ending access early** (a refund, a chargeback, abuse): set `member` to `false` and leave `memberUntil` as it is,
  so the history stays readable; note the reason in private metadata and in the log.
- **Refund**: made in the payment service, or for crypto as a new transfer by hand. Clerk has no part in it.
- **Expiry needs no action**: after `memberUntil` the lock refuses access by itself. The log (7.6) shows who is due
  to expire, so a reminder can be sent before the date.

### 7.6 The payment log

Keep one shared table, for example a spreadsheet the two administrators can both open, **outside the repository**:
it holds personal data, and nothing personal may enter git. One line per payment: date, sign-in email, channel,
amount, reference, new `memberUntil`, who recorded it. It is the only place that shows all members and their dates
at once, and it lets the two administrators check each other's work.

### 7.7 Mistakes to avoid

- Writing access into **unsafe** metadata: the visitor could set it themselves.
- Quotes around `true`, or a date in any form other than `YYYY-MM-DD`.
- Granting access on the Development instance and expecting it on Production later: records do not move (3.1).
- Copying the secret key anywhere, including chats and the payment log.
- Opening access before the payment is confirmed, especially for crypto before enough confirmations.

## 8. Costs and trade-offs of relying on the Dashboard

- **Nothing to write or maintain** for sign-up, email verification, password recovery or account management; the
  forms and the mail are Clerk's. This was the reason for the switch.
- **Settings live outside the repository.** A setting changed in the Dashboard leaves no trace in git. The mitigation
  is discipline: record the values the site depends on in `CLERK.md`.
- **The data lives at Clerk.** Users, sessions and access records are held by an external service. Moving away later
  means exporting users and rebuilding the flows.
- **Manual access costs time.** Every payment is a few minutes of an administrator's work and a delay for the payer
  until it is done. That is fine for tens of members a month; beyond that, automate (section 6.6).
- **Page weight on three pages only.** Clerk weighs about 127 KB gzip (measured 2026-09-25), against about 70 KB of
  JavaScript on the rest of the site. It loads only on `/auth/signin/`, `/auth/signup/` and `/auth/account/`.
- **An external script.** Clerk's UI bundle is fetched from the instance's own host at runtime. This is the same trust
  model the site already accepts for Disqus.
- **Development is not production.** The banner, the "Development" mail subjects and the user cap are fine for a demo
  to the client, not for a public launch. Production needs the club's own domain.

## 9. If the answer is "not Clerk"

The Dashboard is not an add-on that can be declined while Clerk is kept. Declining it means one of these:

- Another hosted provider with a similar dashboard: the same trade-offs under a different name.
- Hand-written sign-in screens and mail with a self-run backend. This is what the review of 2026-09-25 asked to avoid,
  and it cannot run on GitHub Pages either.
- No accounts at all. Paid content would then live on a membership platform that handles its own access (section
  6.3, Patreon).

## 10. Decisions asked of the colleague

1. Use Clerk, and therefore its Dashboard, as described in section 3? This is the basis of `CLERK.md`.
2. Who creates the application and who administers it; the other one is invited the same day (sections 3.8, 7.1).
3. Where is the club registered as a seller (section 6.1)? This decides which payment services are possible.
4. Which payment channels to start with (section 6.6), and whether crypto is one of them (section 6.5).
5. Manual access as described in section 7, with the payment log kept outside the repository?
6. Is one small serverless function outside GitHub Pages (section 5, option A) acceptable, so that paid content is
   actually protected? If yes, the choice of service and video host goes to a separate consilium.
7. Who translates the email templates (section 3.3)?

## 11. Sources

Clerk documentation, Core 3, read on 2026-09-26:

- "User metadata": the three metadata types and who may write them; metadata in the session token and its 1.2 KB
  limit. "User object - updateMetadata()": only unsafe metadata is writable from the frontend.
- "Instances / Environments" and "Change domain": what differs on a Development instance; only a Production domain
  can be changed.
- "Manage your workspace": inviting team members through **Invite** or **Team -> Invite user**.
- "Users": creating a user from the **Users** page.
- "Email and SMS templates": editing mail under **Emails**.
- "Customize your session token": the claims editor under **Sessions**. "Force a session token refresh": the token is
  refreshed every 60 seconds.
- "verifyToken()" and "Token formats": verifying a session token with the public key, without a network call.
- "Clerk Billing", "Clerk Billing for B2C SaaS", "Default Plans": plans, features, `has()`, the free-plan fallback, the
  countries where Billing is not offered, the Development test gateway and the own Stripe account for Production.
  Changelog, 2025-05-13, "Global support for Clerk Billing".

Payment providers, public pages read on 2026-09-26:

- Stripe: https://stripe.com/global
- Paddle: https://www.paddle.com/help/start/intro-to-paddle/which-countries-are-supported-by-paddle and
  https://developer.paddle.com/concepts/sell/supported-countries-locales/
- Lemon Squeezy: https://docs.lemonsqueezy.com/help/getting-started/supported-countries and
  https://www.lemonsqueezy.com/blog/new-bank-payouts
- WayForPay: https://wayforpay.com/en and https://wiki.wayforpay.com/en/view/852102
- Kaspi Pay: https://aww.kz/en/guide/kaspi-pay-dlya-biznesa/ and https://ybcase.com/en/bank-reviews/kaspi-bank
- Patreon: https://docs.patreon.com/ and https://support.patreon.com/hc/en-us/articles/360038061371-Sanctions-Policy
- NOWPayments: https://nowpayments.io/ and https://coingape.com/nowpayments-review/
