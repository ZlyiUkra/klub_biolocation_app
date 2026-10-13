// The one module that knows nodemailer (T108 of specs/001-self-hosted-club-site; research.md section 11, FR-033,
// FR-034). The queue (queue.ts) hands it a `MailMessage` of exactly `to`, `subject` and `text`; this module adds the
// sender from the environment and the transport's options, and nothing else.
//
// Decisions that would otherwise look like mistakes:
// - Every option that has a risky default is spelled out, and `smtpOptions` is a pure function the tests compare whole
//   (server/test/mailer.test.ts), so an option that is left to its default shows up as a failing test. From
//   nodemailer-docs (10.x, "Security options", "TLS options", the error reference):
//     `disableFileAccess` and `disableUrlAccess` stop a message node from reading a local path or fetching an address
//       (defaults are false). Nothing here has an attachment, but "nothing here uses it" is not a control.
//     `maxRecipients: 1` is the library's own backstop for a hostile or runaway recipient list (default 100000); every
//       message here has one recipient.
//     `requireTLS` is true on every port but 465, so a server that does not offer STARTTLS fails the send and the
//       password never crosses the network in the clear (the default is false, which would send on). Port 465 is
//       encrypted from the first byte (`secure`). `ignoreTLS` is never set.
//     `tls.rejectUnauthorized` is stated although true is the default, and TLS 1.2 is the floor; a self-signed
//       certificate is not accepted by any setting of this module.
//     The three timeouts are shorter than the library's (2 minutes, 30 seconds, 10 minutes): a pass of the worker that
//       hangs on a provider holds a database connection while it waits.
//     No pool: a few messages a day do not need standing connections; no logger: the library's own log would carry
//       the server's replies and, at its debug level, the credentials.
// - The message object is built here from three fields. There is no `raw`, `headers`, `list`, `envelope`, `replyTo`
//   or `attachments` member, so nothing a visitor typed can become one, and the recipient is checked as one bare
//   address (address.ts) by the queue before it gets here.
// - The sender's address is the mailbox the server logs in with (`SMTP_USER`) unless `SMTP_FROM` names another, and it
//   is validated as a bare address too: a header is built from it.
// - `MAIL_OUTBOX_DIR` is a development tool: each message is written to a text file of its own instead of being sent,
//   so the owner can read the notice of the feedback form on a machine with no mail account. It is used only when no
//   SMTP variable is set at all; a real configuration always wins, and the server's start line says which one is in
//   use. Files are created and never overwritten or removed.
// - The password is never logged, never in an error text and never in a thrown message of this module.

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createTransport } from "nodemailer";
import { ConfigError } from "../config.js";
import { isBareAddress } from "./address.js";
import type { MailMessage, MailTransport } from "./queue.js";

/** Where the mail goes: a real SMTP account, a folder of text files for development, or nowhere (null). */
export type MailConfig =
  | {
      kind: "smtp";
      host: string;
      port: number;
      /** TLS from the first byte (port 465); otherwise STARTTLS is required. */
      secure: boolean;
      user: string;
      password: string;
      from: string;
    }
  | { kind: "outbox"; dir: string }
  | null;

/** The sender's display name; the address comes from the environment. */
const senderName = "Club site";

function text(env: NodeJS.ProcessEnv, name: string): string {
  return (env[name] ?? "").trim();
}

/**
 * Reads the mail variables. None set is `null`: the queue then waits (the start line says so) and nothing is lost. Any
 * SMTP variable set means the whole set is required, so a half-written configuration stops the start with the names
 * that are missing instead of failing at the first message.
 */
export function loadMailConfig(
  env: NodeJS.ProcessEnv = process.env,
): MailConfig {
  const names = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "SMTP_FROM",
  ];
  const anySmtp = names.some((name) => text(env, name) !== "");
  if (!anySmtp) {
    const dir = text(env, "MAIL_OUTBOX_DIR");
    return dir === "" ? null : { kind: "outbox", dir: resolve(dir) };
  }

  const missing = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD"]
    // The password is compared as given: leading or trailing spaces can be part of one.
    .filter((name) =>
      name === "SMTP_PASSWORD"
        ? (env[name] ?? "") === ""
        : text(env, name) === "",
    );
  if (missing.length > 0) {
    throw new ConfigError(
      `Missing environment variables: ${missing.join(", ")} (see .env.example)`,
    );
  }
  const host = text(env, "SMTP_HOST");
  if (!/^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(host)) {
    throw new ConfigError(
      `SMTP_HOST must be a host name with no port or path, got "${host}"`,
    );
  }
  const rawPort = text(env, "SMTP_PORT");
  const port = Number(rawPort);
  if (!/^[0-9]+$/.test(rawPort) || port < 1 || port > 65535) {
    throw new ConfigError(
      `SMTP_PORT must be a whole number from 1 to 65535, got "${rawPort}"`,
    );
  }
  const user = text(env, "SMTP_USER");
  const rawFrom = text(env, "SMTP_FROM");
  const from = rawFrom !== "" ? rawFrom : user;
  if (!isBareAddress(from)) {
    throw new ConfigError(
      rawFrom !== ""
        ? "SMTP_FROM must be one bare address, such as club@example.org"
        : "SMTP_FROM is required when SMTP_USER is not an address: the sender must be one bare address",
    );
  }
  return {
    kind: "smtp",
    host,
    port,
    secure: port === 465,
    user,
    password: env["SMTP_PASSWORD"] ?? "",
    from,
  };
}

/** The options handed to `createTransport` for an SMTP configuration; pure, so the tests can state all of them. */
export function smtpOptions(config: Extract<MailConfig, { kind: "smtp" }>) {
  return {
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure,
    auth: { user: config.user, pass: config.password },
    tls: { minVersion: "TLSv1.2" as const, rejectUnauthorized: true },
    disableFileAccess: true,
    disableUrlAccess: true,
    maxRecipients: 1,
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 60_000,
    pool: false as const,
    logger: false,
  };
}

/** The transport that sends through nodemailer; `send` throws when the provider did not take the message. */
export function createSmtpTransport(
  config: Extract<MailConfig, { kind: "smtp" }>,
): MailTransport {
  const transporter = createTransport(smtpOptions(config));
  return {
    async send(message: MailMessage): Promise<void> {
      const info = await transporter.sendMail({
        from: { name: senderName, address: config.from },
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
      // One recipient, and the server must have accepted it: a provider that takes the message and refuses the
      // address is a failure to report, not a delivery.
      if (info.accepted.length !== 1) {
        throw new Error("the server did not accept the recipient");
      }
    },
  };
}

/**
 * Added 2026-10-13 (T111): connects with the options of the real transport, upgrades to TLS and logs in, and sends
 * nothing (nodemailer 10.x, "SMTP transport > Verifying the configuration": `verify()` tests DNS, the connection, the
 * TLS upgrade and the authentication). It throws the library's error, whose `code` and `response` the mail check reads.
 * It lives here so that this stays the one module that knows nodemailer and spells out the options.
 */
export async function verifySmtp(
  config: Extract<MailConfig, { kind: "smtp" }>,
): Promise<void> {
  const transporter = createTransport(smtpOptions(config));
  try {
    await transporter.verify();
  } finally {
    transporter.close();
  }
}

let outboxCounter = 0;

/** The development transport: one text file per message in `dir`, named by time and a counter, never overwritten. */
export function createOutboxTransport(
  config: Extract<MailConfig, { kind: "outbox" }>,
): MailTransport {
  return {
    async send(message: MailMessage): Promise<void> {
      await mkdir(config.dir, { recursive: true });
      outboxCounter += 1;
      const stamp = new Date().toISOString().replace(/[-:.]/g, "").slice(0, -1);
      const name = `${stamp}-${String(outboxCounter).padStart(6, "0")}.txt`;
      await writeFile(
        join(config.dir, name),
        `To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}`,
        { flag: "wx" },
      );
    },
  };
}

/** The transport for a configuration that exists (the caller has dealt with the none). */
export function createTransportFor(
  config: Exclude<MailConfig, null>,
): MailTransport {
  return config.kind === "smtp"
    ? createSmtpTransport(config)
    : createOutboxTransport(config);
}
