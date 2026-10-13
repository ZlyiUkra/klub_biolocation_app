# Getting the Clerk publishable key

> **Superseded 2026-10-13 (T131; see REWRITE.md).** There is no Clerk application and no publishable key any
> more: Clerk was removed on 2026-10-12 (T167) and sign-in is the club's own backend. This file is kept as history
> and is not a procedure to follow.

Written on 2026-09-26 on the branch `clerk-auth`. The sign-in code is built and tested, but it needs one value to
work: the **publishable key** of a Clerk application. That application does not exist yet. This file is the complete
procedure for whoever creates it - no programming, only a browser, about 20 to 30 minutes.

Until the key is in place, the three sign-in pages (`/auth/signin/`, `/auth/signup/`, `/auth/account/`) show "Вход на
сайт ещё не подключён." and the rest of the site works as before.

For what each Dashboard page does and why, see `CLERK-DASHBOARD.md`. The values below are the ones `CLERK.md` section
1 fixed; this file only puts them in order.

## 1. Before you start

- Decide who creates the application. That person becomes its owner. The other administrator is invited in step 4,
  the same day, so that both have full access and nobody depends on someone else's login.
- Use your own email address, one you will keep. It is the login to the Dashboard, not an address visitors will see.
- No credit card is needed. The free Hobby plan covers up to 50,000 monthly retained users (Clerk changelog,
  2026-02-05), far more than this site needs.

## 2. Create the account and the application

1. Open https://dashboard.clerk.com and sign up with your email address. Clerk creates a "Personal workspace".
2. Create a new application. Name: **Klub Biolocation**.
3. When Clerk asks how users sign in, turn on **Email** and **Password** only. Turn off everything else: phone,
   username, Google and every other social provider, passkeys, Web3 wallets.
4. Finish the wizard. Clerk opens the application on its **Development** instance, which is the one this site uses
   for now.

## 3. Settings the site depends on

Open each page in the left menu of the application. Names are the ones Clerk's documentation used on 2026-09-26; the
wording in the Dashboard can differ slightly.

1. **User & authentication -> Email**: sign-up with email on; **Verify at sign-up** on; verification method
   **Email verification code** (not link). A code works on any device; a link does not.
2. **User & authentication -> Password**: password on; minimum length **8**.
3. **Attack protection** (the **Protect** page): leave **Bot sign-up protection**, **Device Trust**, **Lockout policy**
   and **User enumeration protection** on. (Corrected 2026-09-26: this step used to say to turn bot protection off for
   the automated check, but that check only signs in and never signs up, and bot protection applies to sign-ups.
   Device Trust asks a new device for an email code, which is `424242` for the demo address; the check handles it.)
4. **Users -> Create user**, the demo account used for showing the site and by the automated check:
   - email `demo+clerk_test@example.com`
   - password `Demo-2026-klub`

   Both are made up and valid on the Development instance only. An address containing `+clerk_test` receives no real
   mail, and Clerk accepts the code `424242` for it whenever it asks for one.

5. Open that user, find **Metadata**, and under **Public** enter exactly this, then save:

   ```json
   { "member": true }
   ```

   This makes the demo line on the account page appear. Write it under **Public**, never under **Unsafe**.

## 4. Invite the second administrator

At the top of the Dashboard select **Invite**, or open the **Team** page and select **Invite user**. Enter the other
person's email, give them the administrator role, select **Invite**. They accept from the email.

## 5. Copy the key

1. Open **API keys**.
2. Copy the **Publishable key**. It starts with `pk_test_`.
3. Hand it over in either way:
   - send it to whoever works on the code (it is public by design, a chat message is fine), or
   - open `src/config.ts`, find the line `publishableKey: "",` inside the `clerk` block, and put the key between the
     quotes: `publishableKey: "pk_test_...",`.

**Never copy the Secret key** (`sk_test_...`) anywhere: not into the repository, not into a chat, not into a
document. The site does not need it. Anyone holding it can manage every user of the application.

## 6. What happens next

Done by whoever works on the code, once the key is in `src/config.ts`:

1. `npm run check` and `npm run build`, then `npm run check:auth`. The eight checks that were skipped until now run
   against the real instance: the form appears, a wrong password is refused, the demo account signs in, the menu and
   the header follow, the account page shows the profile and the demo line, sign-out works.
2. A look by hand on both local servers: `npm run dev`, then `npm run build` and `npm run preview`. Open
   `/auth/signup/` and `/auth/signin/`, sign in with the demo account, open **Account**, sign out; light and dark
   theme.
3. The documents of `CLERK.md` step 7, then a commit on `clerk-auth`, the colleague's review and the merge to `main`,
   after which GitHub Pages publishes the site and the same walk is repeated on https://debi7.github.io/.

Do not merge the branch into `main` before the key is in: the live site's sign-in pages would say that sign-in is not
set up.

## 7. Limits to know

- **Free plan**: up to 50,000 monthly retained users (a user counts once they come back at least a day after signing
  up). Beyond that Clerk asks for the Pro plan. Source: Clerk changelog 2026-02-05, "New plans, more value", and
  https://clerk.com/pricing.
- **Development instance**:
  - a "Development" badge on the forms, and "Development" in the subject of every mail;
  - a cap on the number of users. `CLERK.md` records 100, but on 2026-09-26 the figure was not found in Clerk's
    documentation, which only describes the error ("You have reached your limit of %d users"). Check it in the
    Dashboard;
  - its users and settings do not move to Production;
  - its domain cannot be changed.
- **Dashboard seats**: `CLERK.md` records three on the free plan. This was not verified on 2026-09-26; the **Team**
  page shows the real number.
- **Production**: needs a domain the club owns, because Clerk asks for DNS records that cannot be added to
  `github.io`. Until then the Development instance serves both local work and the live site.
- **Rate limits**: Clerk's Backend API allows 100 requests per 10 seconds on a Development instance. The site itself
  never calls the Backend API, so this matters only for scripts run against the instance.

## 8. Sources

- Clerk documentation, Core 3, read on 2026-09-26: "Manage your workspace" (inviting team members), "Users" (creating
  a user), "User metadata", "Test emails and phones" (the `+clerk_test` addresses and the code `424242`), "Instances /
  Environments", "Change domain", "Rate limits", "Frontend API errors" (`user_quota_exceeded`).
- Clerk changelog 2026-02-05, "New plans, more value": https://clerk.com/changelog/2026-02-05-new-plans-more-value
- Clerk pricing: https://clerk.com/pricing
