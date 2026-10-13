// The `npm run mail:check` command (T111 of specs/001-self-hosted-club-site; research.md section 11). It checks the
// mailbox the server is configured to send from, with the same transport options as the site's own worker.
//
//   npm run mail:check                       connect, encrypt, log in; sends nothing
//   npm run mail:check -- --to <address>     the same, and one fixed test message to that address
//
// Decisions that would otherwise look like mistakes:
// - It reads the same variables as the server (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM), through
//   `loadMailConfig`, so the rules for a whole set, a bare address and a host name with no port are the server's own.
//   It is run on the machine that will run the site: whether a provider accepts that machine is what it answers.
// - The development outbox is refused with a message of its own: it writes files and talks to no server, so there is
//   nothing to check, and a "success" there would mislead.
// - Nothing here touches the database, the queue or a setting; a test message is sent straight to the address given and
//   is not recorded anywhere.
// - The messages are in English: this is a tool of the person who runs the server (as `npm run superuser` is).
// - It sets `process.exitCode` and returns, so the output is flushed before the process ends.

import { ConfigError } from "../config.js";
import { isBareAddress } from "../mail/address.js";
import { loadMailConfig } from "../mail/mailer.js";
import { probeSmtp } from "../mail/probe.js";

const usage = `Usage:
  npm run mail:check
  npm run mail:check -- --to <address>`;

function fail(...lines: string[]): void {
  for (const line of lines) console.error(line);
  process.exitCode = 1;
}

const args = process.argv.slice(2);
let to: string | null = null;
let usageError = false;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--to") {
    const value = args[i + 1];
    if (value === undefined || value.startsWith("--")) {
      usageError = true;
    } else {
      to = value;
      i += 1;
    }
  } else {
    usageError = true;
  }
}

if (usageError || (to !== null && !isBareAddress(to))) {
  fail(
    usageError
      ? usage
      : "--to must be one bare address, such as desk@example.org: no name, no brackets, no list.",
  );
} else {
  try {
    const config = loadMailConfig(process.env);
    if (config === null) {
      fail(
        "No mailbox is configured: SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASSWORD are not set (see .env.example).",
      );
    } else if (config.kind === "outbox") {
      fail(
        "Only the development outbox is configured: it writes each message to a file and talks to no server, so there is nothing to check.",
        "Set SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASSWORD to check a real mailbox (see .env.example).",
      );
    } else {
      const report = await probeSmtp(config, to);
      for (const line of report.lines) console.log(line);
      if (!report.ok) process.exitCode = 1;
    }
  } catch (error) {
    if (error instanceof ConfigError) fail(error.message);
    else throw error;
  }
}
