// The mail check's logic (T111 of specs/001-self-hosted-club-site; server/test/mail-check.test.ts; research.md section
// 11): connect to the configured SMTP server with the site's own transport options, log in, and optionally send one
// fixed test message, and say in plain words which step failed and what usually causes it.
//
// Decisions that would otherwise look like mistakes:
// - It uses `verifySmtp` and `createSmtpTransport` of mailer.ts and nothing of nodemailer directly, so the check runs
//   with exactly the options the site's worker runs with (encryption required, certificates checked, short timeouts)
//   and cannot pass where the worker would fail. A check that connected more loosely than the worker would prove
//   nothing about the server it is meant to prove something about.
// - The test message is fixed text and goes to one address given on the command line. There is no member for anything
//   a visitor or a file could supply, the same rule as for the queue's messages.
// - Without a recipient only the login is proved. The output says so: "accepts the server" is two questions, whether
//   the provider lets this machine log in (verify) and whether it takes a message from the mailbox for an address
//   (send), and only the second one needs a recipient.
// - The password is never in a line: the library's reply texts are one line each and scrubbed of the password and of
//   its base64 form before they are printed, in case a provider ever echoes a login. The check never logs the wire.
// - The hints are written for the person who runs the server. They name the usual cause and the next thing to look at;
//   they are advice, never a claim about a provider, because a provider's rules change.

import { createSmtpTransport, verifySmtp, type MailConfig } from "./mailer.js";

type SmtpConfig = Extract<MailConfig, { kind: "smtp" }>;

/** What the check found: `ok` for the whole run, and the lines to print, in order. */
export type ProbeReport = { ok: boolean; lines: string[] };

/** The one-line, secret-free text of an error or of a reply. */
function oneLine(value: unknown, secrets: string[]): string {
  let text = value instanceof Error ? value.message : String(value);
  text = text.replace(/[\r\n\u0000-\u001f]+/g, " ").trim();
  for (const secret of secrets) {
    if (secret !== "") text = text.split(secret).join("***");
  }
  return text.length > 200 ? `${text.slice(0, 200)}...` : text;
}

type Reading = {
  code: string;
  reply: number | null;
  text: string;
};

function read(error: unknown, secrets: string[]): Reading {
  const object =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : {};
  return {
    code: typeof object["code"] === "string" ? object["code"] : "",
    reply:
      typeof object["responseCode"] === "number"
        ? object["responseCode"]
        : null,
    text: oneLine(error, secrets),
  };
}

/**
 * The failure of one step as a line and a hint. `step` is where the exception came from: `connect` is DNS, the
 * connection, the TLS upgrade and the login (all inside `verify`), `send` is the envelope and the message.
 */
export function explainFailure(
  step: "connect" | "send",
  error: unknown,
  config: SmtpConfig,
  secrets: string[],
): string[] {
  const { code, reply, text } = read(error, secrets);
  const where = `${config.host}:${config.port}`;
  const detail = ` (${[code, reply === null ? "" : `reply ${reply}`, text].filter((part) => part !== "").join("; ")})`;
  const mode = config.secure
    ? "Port 465 expects TLS from the first byte"
    : "Any port but 465 must offer STARTTLS (587 is the usual one)";

  if (/certificate|self[- ]signed|altnames|issuer|CERT_/i.test(text)) {
    return [
      `FAILED at the encryption step: the server's certificate is not trusted by this machine.${detail}`,
      "  Check that SMTP_HOST is the provider's own host name exactly as the provider documents it (a certificate is",
      "  issued for a name, not for an address), and that this machine's clock is right. A provider's certificate is",
      "  never to be accepted by turning the check off; a proxy or a security product on the path that re-signs",
      "  traffic is the other usual cause.",
    ];
  }
  if (code === "EAUTH" || reply === 535 || reply === 534) {
    return [
      `FAILED at the login step: the server refused the user name or the password.${detail}`,
      "  Most providers want an app password (a password made for one program), not the account's own, and some",
      "  need SMTP access or two-step verification turned on first. Check SMTP_USER and SMTP_PASSWORD in the",
      "  environment of the server, with no stray spaces or quotes. A provider may also block a login from an",
      "  address it has not seen: look in the mailbox for a security notice about this machine.",
    ];
  }
  if (code === "ETLS" || /STARTTLS|TLS|SSL|wrong version number/i.test(text)) {
    return [
      `FAILED at the encryption step: ${where} did not give an encrypted channel, so nothing was sent, not even the password.${detail}`,
      `  The site never sends a login or a message in the clear. ${mode}.`,
      "  Check SMTP_PORT against the provider's documentation.",
    ];
  }
  if (code === "EDNS" || /ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(text)) {
    return [
      `FAILED at the connection step: the host name ${config.host} did not resolve.${detail}`,
      "  Check the spelling of SMTP_HOST, and that this machine's DNS works.",
    ];
  }
  if (code === "ETIMEDOUT" || /timed? ?out/i.test(text)) {
    return [
      `FAILED at the connection step: ${where} did not answer in time.${detail}`,
      "  Outbound mail ports are often closed by hosting providers by default (25 most of all; 465 and 587 less",
      "  often). Ask the hosting provider, or try the other of 465 and 587 if the mailbox's provider offers both.",
    ];
  }
  if (step === "connect" && (code === "ECONNECTION" || code === "ESOCKET")) {
    return [
      `FAILED at the connection step: could not connect to ${where}.${detail}`,
      "  Check SMTP_HOST and SMTP_PORT against the provider's documentation, and whether this machine's network or",
      "  the hosting provider allows outbound connections to that port.",
    ];
  }
  if (step === "send" && reply !== null && reply >= 500) {
    return [
      `FAILED at the message step: the server took the login and then refused the message.${detail}`,
      "  The recipient address may be refused, or the provider may not allow this mailbox to send as the address",
      "  in SMTP_FROM. Try a recipient on the same provider, and check SMTP_FROM.",
    ];
  }
  return [
    `FAILED at the ${step === "connect" ? "connection or login" : "message"} step.${detail}`,
    "  The text above is the library's and the server's own; it names no further step.",
  ];
}

/**
 * Runs the check. `to` is the address the test message goes to, or null to prove the login only. It never throws for a
 * failure of the server: that is the report.
 */
export async function probeSmtp(
  config: SmtpConfig,
  to: string | null,
  now: Date = new Date(),
): Promise<ProbeReport> {
  const secrets = [
    config.password,
    Buffer.from(config.password, "utf8").toString("base64"),
  ];
  const lines: string[] = [
    `Server:   ${config.host}:${config.port} (${config.secure ? "TLS from the first byte" : "STARTTLS required"}, certificate verified)`,
    `Login:    ${config.user}`,
    `Sender:   ${config.from}`,
  ];

  try {
    await verifySmtp(config);
  } catch (error) {
    lines.push(...explainFailure("connect", error, config, secrets));
    return { ok: false, lines };
  }
  lines.push(
    "OK: the server is reachable, the channel is encrypted and the login accepted.",
  );

  if (to === null) {
    lines.push(
      "No message was sent: add --to <address> to send one test message and prove that the server also takes mail for an address.",
    );
    return { ok: true, lines };
  }

  try {
    await createSmtpTransport(config).send({
      to,
      subject: "Club site: mail check",
      text: [
        "This is a test message from the club site's mail check (npm run mail:check).",
        `Sent at ${now.toISOString()}.`,
        "If you can read it, the mailbox settings of the server work and nothing else needs to be done.",
      ].join("\n"),
    });
  } catch (error) {
    lines.push(...explainFailure("send", error, config, secrets));
    return { ok: false, lines };
  }
  lines.push(`OK: the server accepted a test message for ${to}.`);
  lines.push(
    "Look in that mailbox, and in its spam folder, to see that it arrived.",
  );
  return { ok: true, lines };
}
