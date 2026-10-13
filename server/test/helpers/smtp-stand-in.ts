// An SMTP server stand-in for the mail tests (T111 of specs/001-self-hosted-club-site): it speaks the part of ESMTP
// the club's transport uses (EHLO, STARTTLS, AUTH PLAIN, MAIL, RCPT, DATA, QUIT), over TLS from the first byte, after
// STARTTLS, or not at all, and writes down every line it receives so a test can say what did and did not cross the wire.
//
// Decisions that would otherwise look like mistakes:
// - The certificate is made here, in memory, for every run: a self-signed one for 127.0.0.1 and localhost, built by hand
//   as DER because Node has no call that makes one. A key or a certificate kept in the repository would be a secret
//   lying around for a scanner to find, and the owner's rule is that none enters it (FR-038). The transport's own
//   options stay as they are in production (`rejectUnauthorized` true): a test that must trust this certificate hands
//   it to the child process through NODE_EXTRA_CA_CERTS, which Node reads at start, and a test that does not trust it
//   sees the refusal a real wrong certificate gets.
// - It lives in test/ and is compiled with the tests; `node --test` runs it as a (test-less) file, which is harmless
//   because importing it only defines functions (the same as helpers/db.ts).

import { generateKeyPairSync, sign } from "node:crypto";
import { createServer, type Server, type Socket } from "node:net";
import {
  createSecureContext,
  TLSSocket,
  createServer as tlsServer,
} from "node:tls";

// --- a self-signed certificate, by hand ---------------------------------------------------------------------------

const der = (tag: number, ...parts: Buffer[]): Buffer => {
  const body = Buffer.concat(parts);
  const n = body.length;
  const length =
    n < 128
      ? Buffer.from([n])
      : n < 256
        ? Buffer.from([0x81, n])
        : Buffer.from([0x82, n >> 8, n & 0xff]);
  return Buffer.concat([Buffer.from([tag]), length, body]);
};

const oid = (dotted: string): Buffer => {
  const parts = dotted.split(".").map(Number);
  const bytes: number[] = [parts[0]! * 40 + parts[1]!];
  for (const part of parts.slice(2)) {
    const chunk = [part & 0x7f];
    for (let rest = part >> 7; rest > 0; rest >>= 7)
      chunk.unshift((rest & 0x7f) | 0x80);
    bytes.push(...chunk);
  }
  return der(0x06, Buffer.from(bytes));
};

const utcTime = (at: Date): Buffer => {
  const two = (n: number) => String(n).padStart(2, "0");
  const text = `${two(at.getUTCFullYear() % 100)}${two(at.getUTCMonth() + 1)}${two(at.getUTCDate())}${two(at.getUTCHours())}${two(at.getUTCMinutes())}${two(at.getUTCSeconds())}Z`;
  return der(0x17, Buffer.from(text, "ascii"));
};

const nameOf = (common: string): Buffer =>
  der(
    0x30,
    der(
      0x31,
      der(0x30, oid("2.5.4.3"), der(0x0c, Buffer.from(common, "utf8"))),
    ),
  );

const pem = (label: string, body: Buffer): string =>
  `-----BEGIN ${label}-----\n${(body.toString("base64").match(/.{1,64}/g) ?? []).join("\n")}\n-----END ${label}-----\n`;

/** A fresh key and a self-signed certificate for 127.0.0.1 and localhost, valid for a day around now; PEM text. */
export function makeSelfSigned(): { key: string; cert: string } {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const sha256WithRsa = der(0x30, oid("1.2.840.113549.1.1.11"), der(0x05));
  const now = Date.now();
  const names = der(
    0x30,
    der(0x82, Buffer.from("localhost", "ascii")),
    der(0x87, Buffer.from([127, 0, 0, 1])),
  );
  const extensions = der(
    0xa3,
    der(
      0x30,
      der(0x30, oid("2.5.29.17"), der(0x04, names)),
      der(
        0x30,
        oid("2.5.29.19"),
        der(0x01, Buffer.from([0xff])),
        der(0x04, der(0x30, der(0x01, Buffer.from([0xff])))),
      ),
    ),
  );
  const toBeSigned = der(
    0x30,
    der(0xa0, der(0x02, Buffer.from([2]))),
    der(0x02, Buffer.from([1])),
    sha256WithRsa,
    nameOf("localhost"),
    der(
      0x30,
      utcTime(new Date(now - 86_400_000)),
      utcTime(new Date(now + 86_400_000)),
    ),
    nameOf("localhost"),
    publicKey.export({ type: "spki", format: "der" }),
    extensions,
  );
  const signature = sign("sha256", toBeSigned, privateKey);
  const certificate = der(
    0x30,
    toBeSigned,
    sha256WithRsa,
    der(0x03, Buffer.concat([Buffer.from([0]), signature])),
  );
  return {
    key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    cert: pem("CERTIFICATE", certificate),
  };
}

// --- the server ---------------------------------------------------------------------------------------------------

export type StandInOptions = {
  /** `implicit`: TLS from the first byte; `starttls`: plain, then the upgrade; `plain`: AUTH offered and no TLS at all. */
  mode: "implicit" | "starttls" | "plain";
  key: string;
  cert: string;
  /** The login the server accepts; the password is compared as given. */
  user: string;
  password: string;
  /** Answer 550 to RCPT TO, as a provider does for an address it will not take. */
  refuseRecipient?: boolean;
  /** A port to listen on; none means any free one. The transport treats 465 alone as TLS from the first byte. */
  port?: number;
};

export type StandIn = {
  port: number;
  /** Every line received, in order, as text (a message body is one entry, after the DATA line). */
  wire: string[];
  /** The message bodies accepted. */
  messages: string[];
  close(): Promise<void>;
};

export async function startSmtpStandIn(
  options: StandInOptions,
): Promise<StandIn> {
  const wire: string[] = [];
  const messages: string[] = [];
  const context = createSecureContext({ key: options.key, cert: options.cert });
  const sockets = new Set<Socket>();

  // One connection: `socket` is the raw one, or the TLS one it became.
  const converse = (socket: Socket, encrypted: boolean): void => {
    let buffer = "";
    let inData = false;
    let authed = false;
    let loginStep: "password" | null = null;
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => undefined);
    const reply = (text: string): void => {
      socket.write(`${text}\r\n`);
    };
    const checkLogin = (user: string, password: string): void => {
      if (user === options.user && password === options.password) {
        authed = true;
        reply("235 2.7.0 Accepted");
      } else {
        reply("535 5.7.8 Username and Password not accepted");
      }
    };
    const onLine = (line: string): void => {
      wire.push(line);
      const command = line.toUpperCase();
      if (command.startsWith("EHLO") || command.startsWith("HELO")) {
        const lines = ["250-stand-in"];
        if (options.mode === "starttls" && !encrypted)
          lines.push("250-STARTTLS");
        const mayAuth = options.mode !== "starttls" || encrypted;
        if (mayAuth) lines.push("250-AUTH PLAIN");
        lines.push("250 8BITMIME");
        reply(lines.join("\r\n"));
      } else if (
        command === "STARTTLS" &&
        options.mode === "starttls" &&
        !encrypted
      ) {
        reply("220 2.0.0 Ready to start TLS");
        socket.removeAllListeners("data");
        const upgraded = new TLSSocket(socket, {
          isServer: true,
          secureContext: context,
        });
        converse(upgraded, true);
      } else if (command.startsWith("AUTH PLAIN")) {
        const given = line.slice("AUTH PLAIN".length).trim();
        if (given === "") {
          loginStep = "password";
          reply("334 ");
          return;
        }
        const [, user = "", password = ""] = Buffer.from(given, "base64")
          .toString("utf8")
          .split("\0");
        checkLogin(user, password);
      } else if (command.startsWith("MAIL FROM")) {
        if (!authed) reply("530 5.7.0 Authentication required");
        else reply("250 2.1.0 Ok");
      } else if (command.startsWith("RCPT TO")) {
        if (options.refuseRecipient)
          reply("550 5.1.1 The recipient is not accepted");
        else reply("250 2.1.5 Ok");
      } else if (command === "DATA") {
        inData = true;
        reply("354 End data with <CR><LF>.<CR><LF>");
      } else if (command === "RSET" || command === "NOOP") {
        reply("250 2.0.0 Ok");
      } else if (command === "QUIT") {
        reply("221 2.0.0 Bye");
        socket.end();
      } else {
        reply("502 5.5.2 Not implemented");
      }
    };
    socket.on("data", (chunk) => {
      buffer += chunk.toString("latin1");
      for (;;) {
        if (inData) {
          const end = buffer.indexOf("\r\n.\r\n");
          if (end < 0) return;
          const body = buffer.slice(0, end);
          buffer = buffer.slice(end + 5);
          inData = false;
          wire.push(body);
          messages.push(body);
          reply("250 2.0.0 Queued");
          continue;
        }
        const at = buffer.indexOf("\r\n");
        if (at < 0) return;
        const line = buffer.slice(0, at);
        buffer = buffer.slice(at + 2);
        if (loginStep === "password") {
          loginStep = null;
          wire.push(line);
          const [, user = "", password = ""] = Buffer.from(line, "base64")
            .toString("utf8")
            .split("\0");
          checkLogin(user, password);
          continue;
        }
        onLine(line);
      }
    });
    if (!encrypted || options.mode === "implicit")
      reply("220 stand-in ESMTP ready");
  };

  const server: Server =
    options.mode === "implicit"
      ? tlsServer({ key: options.key, cert: options.cert }, (socket) =>
          converse(socket, true),
        )
      : createServer((socket) => converse(socket, false));
  await new Promise<void>((done, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, "127.0.0.1", done);
  });
  const address = server.address();
  const port =
    typeof address === "object" && address !== null ? address.port : 0;
  return {
    port,
    wire,
    messages,
    close: () =>
      new Promise<void>((done) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => done());
      }),
  };
}
