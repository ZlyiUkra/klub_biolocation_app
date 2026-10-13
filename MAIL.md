# The site's outgoing mail: choosing the mailbox and checking it

Written on 2026-10-13 (T111 of `specs/001-self-hosted-club-site`). The site sends mail from one mailbox of its own: the
notice of a feedback message, and the codes and warnings of the settings page. This file says what that mailbox has to
be, how to choose one, how to put it on the server, and how to check that its provider accepts the server. The code is
`server/src/mail/` (the queue, the transport, the check); the research note is `research.md` section 11.

## In plain words

- The site does not read mail. It only sends, a few messages a day at most.
- It sends through an ordinary mailbox at an ordinary provider, logging in with four values: a host, a port, a user and
  a password. The password is an app password, a password the provider makes for one program and that can be taken
  back without touching the account.
- Where the messages go is a different matter: that is the recipient, set by the superuser on the settings page, and it
  need not be the mailbox the site sends from.
- Nothing leaves the server until the four values are in the server's environment. Until then the messages wait in a
  table, and nothing is lost; the admin list of feedback shows them either way.

## What the mailbox must offer

- SMTP with a login (the provider's "outgoing mail" or "SMTP submission").
- Encryption: port 465 (TLS from the first byte) or port 587 (STARTTLS). The site refuses a server that offers neither,
  and never sends a password or a message in the clear. Port 25 is for servers talking to servers and is not used.
- A valid certificate for the host name the provider documents. The site never accepts a certificate it cannot check.
- An app password, or an SMTP key, so that the account's own password is not in the server's environment.
- This server must be able to reach it: hosting providers often close outbound mail ports, and a provider may refuse a
  login from an address it has not seen. Only a check run on the server itself answers that.

## Choosing the mailbox

Recommended: **a mailbox made only for the site** (option B). The reasons are in the list; the other options follow.

- **A. The club's own mailbox, through its provider's SMTP.** Free and nothing new to create; the notices come from an
  address the club already reads. The cost: the server holds a credential of a mailbox people use, and a problem with
  the site's use of it (a provider's limit, a security block) lands on the club's own mail. This is what the council's
  verdict of 2026-10-09 recommended, before it was known that nobody could name the club's mailbox today.
- **B. A new mailbox used by the site and nothing else (recommended).** The same cost as A: free. The credential has
  no other use, so revoking it or losing it touches nobody's mail, and a provider's block can be fixed by making
  another. The notices arrive wherever the superuser points the recipient. The cost: one more account to keep alive,
  and some providers want a telephone number to make one.
- **C. A sending service (an SMTP relay with its own key).** The best deliverability, and the key is made for a
  program. It needs a domain of the club's own with DNS records (SPF and DKIM), so it waits for the site's domain
  (plan phase 8), and it is one more outside service on the path.
- **D. A mail server on the hosting itself.** Not recommended: a new server's mail goes to spam unless its address has a
  reputation, and keeping it patched is a job of its own for a few messages a day.

Any of A, B or C works with the code as it is: the four values are all it needs, and the choice can change later with
no change to the site.

## Putting it on the server

1. In the server's environment (the `.env` file on the development machine; the hosting's settings in production) set:
   `SMTP_HOST` (the host name only, no port), `SMTP_PORT` (465 or 587), `SMTP_USER` (the login, usually the address),
   `SMTP_PASSWORD` (the app password). Add `SMTP_FROM` only when `SMTP_USER` is not an address: then it is the sender's
   address, one bare address. Set all of them or none: a half-written set stops the start and names what is missing.
2. Run the check on the server (below).
3. Restart the application. The start line says which transport is in use.

The credentials live only in the server's environment. They are never in the repository, never shipped to a browser and
never editable from the site (FR-036, FR-038).

## The check: `npm run mail:check`

```
npm run mail:check                        connect, encrypt, log in; sends nothing
npm run mail:check -- --to <address>      the same, and one fixed test message to that address
```

It reads the same variables as the server and connects with the same options as the server's own worker, so it cannot
pass where the worker would fail. It prints what it tried, the step that failed, the library's and the server's own
words, and what usually causes it. It never prints the password, and it records nothing in the database.

What each outcome means:

- **"login accepted", no `--to`**: the machine reached the provider, the channel is encrypted with a certificate that
  checked out, and the login was taken. No message was sent, so whether the provider takes mail for an address is not
  yet proved.
- **"accepted a test message"**: the provider took a message from this mailbox for that address. Look in that mailbox,
  and in its spam folder: "accepted" is the provider's word, not the inbox's.
- **"FAILED at the connection step"**: DNS, the port, a firewall. Check `SMTP_HOST` and `SMTP_PORT` against the
  provider's page, then ask the hosting provider whether outbound connections to that port are allowed.
- **"FAILED at the encryption step"**: the server offered no encryption, or its certificate is not one this machine
  trusts (a wrong host name, a wrong clock, a proxy that re-signs traffic). The check never offers to skip it.
- **"FAILED at the login step"**: the user or the password was refused. Almost always the password is not an app
  password, or SMTP access is not switched on for the mailbox. Look in the mailbox for a security notice.
- **"FAILED at the message step"**: the login worked and the message did not: the recipient refused, or the provider
  does not let this mailbox send as `SMTP_FROM`. Try a recipient at the same provider.

Run it from the machine that will run the site. Run on any other machine it proves that the settings are right, and
nothing about whether the provider accepts the server.

## What the provider may call things

Providers rename their settings, and a rule that held last year may not hold. These are values providers have
published, to be confirmed on the provider's own help page before they are used:

- Gmail: host `smtp.gmail.com`, port 465 or 587; the account needs two-step verification, and an app password is made
  under the account's security settings.
- Yandex Mail: host `smtp.yandex.com`, port 465; an app password is made for "mail programs", and access by mail
  programs may need to be switched on in the mailbox's settings.
- Mail.ru: host `smtp.mail.ru`, port 465; an "external application" password is made in the mailbox's settings.

## What is still open

- The mailbox itself (T111): nobody could name the club's mailbox on 2026-10-13, so the choice waits. The tool and this
  file are what could be done without it.
- The real run: a login and a send through a provider from the real server, which needs both the mailbox and the
  server. Until then the transport has been exercised against a stand-in server that speaks TLS from the first byte and
  after STARTTLS, with a certificate of its own (`server/test/mail-check.test.ts`), and against a server that offers no
  encryption (`server/test/mailer.test.ts`).
