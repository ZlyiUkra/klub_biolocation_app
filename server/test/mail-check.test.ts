// The `npm run mail:check` command (T111 of specs/001-self-hosted-club-site; research.md section 11, FR-033, FR-036;
// tests written first, red until server/src/mail/probe.ts and server/src/cli/mail-check-cli.ts exist).
//
// What the command is for: the sending mailbox is chosen with the owner late, and whether its provider accepts the
// server can only be learned from the server itself. The command is that check: it connects with the exact options of
// the site's transport, says in plain words which step failed, and with `--to` sends one fixed test message.
//
// How it is tested: the real command is started as a child process (the way the owner runs it) against an SMTP
// stand-in that speaks TLS from the first byte, TLS after STARTTLS, or no TLS (helpers/smtp-stand-in.ts). The
// stand-in's certificate is self-signed; where a case needs it trusted the child gets it through NODE_EXTRA_CA_CERTS,
// and where it does not the case is the refusal a wrong certificate gets, so the transport's `rejectUnauthorized` is
// exercised and never weakened for a test.
//
// What is fixed here:
// - Every failure names its step (connection, encryption, login, recipient) and exits non-zero; a success says what
//   was and was not proved (without `--to` no message is sent, and the output says so).
// - The password is in no output line, and nothing is put on the wire before the encryption is in place.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import {
  makeSelfSigned,
  startSmtpStandIn,
  type StandIn,
} from "./helpers/smtp-stand-in.js";

const cli = fileURLToPath(
  new URL("../src/cli/mail-check-cli.js", import.meta.url),
);
const user = "club@example.test";
const password = "app-password-7q2x-never-printed";

let dir: string;
let caFile: string;
let tls: { key: string; cert: string };
before(() => {
  dir = mkdtempSync(join(tmpdir(), "kb-mail-check-"));
  tls = makeSelfSigned();
  caFile = join(dir, "stand-in-ca.pem");
  writeFileSync(caFile, tls.cert);
});
after(() => {
  rmSync(dir, { recursive: true, force: true });
});

type Run = { code: number | null; out: string };

/** Runs the command with a clean environment: only what a case names, never the test process's own variables. */
function run(
  env: Record<string, string>,
  args: string[] = [],
  options: { trust?: boolean } = {},
): Promise<Run> {
  const base: Record<string, string> = {};
  for (const name of ["PATH", "Path", "SystemRoot", "TEMP", "TMP"]) {
    const value = process.env[name];
    if (value !== undefined) base[name] = value;
  }
  if (options.trust) base["NODE_EXTRA_CA_CERTS"] = caFile;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, ...args], {
      env: { ...base, ...env },
      windowsHide: true,
    });
    let out = "";
    child.stdout.on("data", (c) => (out += c.toString("utf8")));
    child.stderr.on("data", (c) => (out += c.toString("utf8")));
    child.on("close", (code) => resolve({ code, out }));
  });
}

const smtpEnv = (port: number, extra: Record<string, string> = {}) => ({
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: String(port),
  SMTP_USER: user,
  SMTP_PASSWORD: password,
  ...extra,
});

async function withStandIn(
  mode: "implicit" | "starttls" | "plain",
  body: (standIn: StandIn) => Promise<void>,
  extra: { refuseRecipient?: boolean } = {},
): Promise<void> {
  const standIn = await startSmtpStandIn({
    mode,
    key: tls.key,
    cert: tls.cert,
    user,
    password,
    ...extra,
  });
  try {
    await body(standIn);
  } finally {
    await standIn.close();
  }
}

const never = (out: string) =>
  assert.equal(
    out.includes(password) ||
      out.includes(Buffer.from(password).toString("base64")),
    false,
    "the password is not in the output",
  );

test("a reachable, trusted server with the right login: the check passes and, with no --to, sends nothing", async () => {
  await withStandIn("starttls", async (standIn) => {
    const result = await run(smtpEnv(standIn.port), [], { trust: true });
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /login accepted/i);
    assert.match(result.out, /no message was sent/i);
    assert.ok(
      standIn.wire.some((l) => /^STARTTLS$/i.test(l)),
      "it upgraded to TLS",
    );
    assert.equal(
      standIn.wire.some((l) => /^MAIL FROM/i.test(l)),
      false,
      "no message was begun",
    );
    never(result.out);
  });
});

test("with --to one fixed test message is sent and the server's acceptance is reported", async () => {
  await withStandIn("starttls", async (standIn) => {
    const result = await run(
      smtpEnv(standIn.port),
      ["--to", "desk@example.test"],
      {
        trust: true,
      },
    );
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /accepted/i);
    assert.match(result.out, /desk@example\.test/);
    assert.equal(standIn.messages.length, 1);
    const message = standIn.messages[0]!;
    assert.match(message, /^To: desk@example\.test/im);
    assert.match(message, /^Subject: Club site: mail check/im);
    assert.match(message, /mail:check/);
    never(result.out);
  });
});

test("a wrong password is reported as a refused login, with the reply code and not the password", async () => {
  await withStandIn("starttls", async (standIn) => {
    const result = await run(
      smtpEnv(standIn.port, { SMTP_PASSWORD: "a-wrong-app-password-0001" }),
      [],
      { trust: true },
    );
    assert.equal(result.code, 1, result.out);
    assert.match(result.out, /login/i);
    assert.match(result.out, /535/);
    assert.match(result.out, /app password/i);
    assert.equal(result.out.includes("a-wrong-app-password-0001"), false);
  });
});

test("a certificate that is not trusted is refused before any login, and the output says why", async () => {
  await withStandIn("starttls", async (standIn) => {
    const result = await run(smtpEnv(standIn.port), []);
    assert.equal(result.code, 1, result.out);
    assert.match(
      result.out,
      /FAILED at the encryption step: the server's certificate is not trusted/,
    );
    assert.equal(
      standIn.wire.some((l) => /^AUTH/i.test(l)),
      false,
      "no login was tried",
    );
    never(result.out);
  });
});

test("a server that offers no encryption is refused and neither the password nor a message is sent", async () => {
  await withStandIn("plain", async (standIn) => {
    const result = await run(smtpEnv(standIn.port), [
      "--to",
      "desk@example.test",
    ]);
    assert.equal(result.code, 1, result.out);
    assert.match(result.out, /encrypt|TLS/i);
    const wire = standIn.wire.join("\n");
    assert.equal(/^AUTH/im.test(wire), false, "no login was tried");
    assert.equal(/^MAIL FROM/im.test(wire), false, "no message was begun");
    never(result.out);
    never(wire);
  });
});

test("a recipient the server will not take is a failure of its own, not a success", async () => {
  await withStandIn(
    "starttls",
    async (standIn) => {
      const result = await run(
        smtpEnv(standIn.port),
        ["--to", "desk@example.test"],
        {
          trust: true,
        },
      );
      assert.equal(result.code, 1, result.out);
      assert.match(result.out, /550/);
      assert.match(result.out, /recipient|address/i);
      assert.equal(standIn.messages.length, 0);
    },
    { refuseRecipient: true },
  );
});

test("port 465 is TLS from the first byte: the login and a message go through it", async (t) => {
  let standIn: StandIn;
  try {
    standIn = await startSmtpStandIn({
      mode: "implicit",
      key: tls.key,
      cert: tls.cert,
      user,
      password,
      port: 465,
    });
  } catch (error) {
    // The port is the transport's only implicit-TLS port; a machine that does not let a test bind it (no right to a
    // port below 1024, or the port in use) skips this case instead of failing it.
    t.skip(`port 465 cannot be bound here: ${String(error)}`);
    return;
  }
  try {
    const result = await run(smtpEnv(465), ["--to", "desk@example.test"], {
      trust: true,
    });
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /TLS from the first byte/);
    assert.equal(standIn.messages.length, 1);
    assert.equal(
      standIn.wire.some((l) => /^STARTTLS$/i.test(l)),
      false,
      "no upgrade was needed or asked",
    );
    never(result.out);
  } finally {
    await standIn.close();
  }
});

test("nothing listening on the port is reported as a connection failure with the host and the port", async () => {
  const free = await new Promise<number>((resolve) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port =
        typeof address === "object" && address !== null ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
  const result = await run(smtpEnv(free));
  assert.equal(result.code, 1, result.out);
  assert.match(result.out, new RegExp(`127\\.0\\.0\\.1:${free}`));
  assert.match(result.out, /connect/i);
  never(result.out);
});

test("no SMTP variable, a half-written set, the outbox only and a bad --to each stop before any connection", async () => {
  const none = await run({});
  assert.equal(none.code, 1, none.out);
  assert.match(none.out, /SMTP_HOST/);

  const half = await run({ SMTP_HOST: "smtp.example.test" });
  assert.equal(half.code, 1, half.out);
  assert.match(half.out, /SMTP_PORT/);

  const outbox = await run({ MAIL_OUTBOX_DIR: join(dir, "outbox") });
  assert.equal(outbox.code, 1, outbox.out);
  assert.match(outbox.out, /outbox/i);

  for (const bad of ["not-an-address", "a@b.test,c@d.test", ""]) {
    const result = await run(smtpEnv(1), ["--to", bad]);
    assert.equal(result.code, 1, `${bad}: ${result.out}`);
    assert.match(result.out, /bare address|--to/i, bad);
  }
  const missing = await run(smtpEnv(1), ["--to"]);
  assert.equal(missing.code, 1, missing.out);
  assert.match(missing.out, /--to/);
});
