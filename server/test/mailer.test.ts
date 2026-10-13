// The mail module: the address rule, the configuration of the transport, and the worker's pass over the queue
// (T108 of specs/001-self-hosted-club-site; research.md section 11, data-model.md "mail_queue", FR-033, FR-034;
// tests written first, red until server/src/mail/{address,mailer,queue}.ts exist). The two cases of
// server/test/feedback.test.ts that call `deliverDue` are the other half of this task's red.
//
// What is fixed here:
// - One home for "is this one bare address": `isBareAddress`, which the settings route (T110) takes too. The list of
//   refused texts is the one the settings test (T105) names, plus a few the mailer must refuse before anything is
//   handed to nodemailer: the address parser of a mail library is where the 2025-2026 advisories were.
// - The nodemailer options are a pure function of the configuration and are compared whole, so an option left at its
//   default (file access, URL access, the number of recipients, TLS, timeouts) shows up here as a failing test and not
//   as a surprise in production.
// - The worker sends outside any request, takes a row for itself before it sends (two passes at once never send the
//   same row twice), and never lets a failure of one row stop the others.

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";
import { isBareAddress } from "../src/mail/address.js";
import {
  createOutboxTransport,
  createSmtpTransport,
  loadMailConfig,
  smtpOptions,
} from "../src/mail/mailer.js";
import {
  deliverDue,
  mailBackoffMs,
  startMailWorker,
  type MailMessage,
  type MailTransport,
} from "../src/mail/queue.js";
import { createPool } from "../src/db/pool.js";
import {
  createTestDatabase,
  skipWithoutDatabase,
  type TestDatabase,
} from "./helpers/db.js";

const opts = { skip: skipWithoutDatabase };

test("one bare address: the shapes that are one address pass, everything else is refused", () => {
  for (const good of [
    "a@b.test",
    "club-desk@example.test",
    "first.last+tag@sub.example.org",
    "o'brien@example.test",
    "x_y-z@mail.example.co.uk",
  ]) {
    assert.equal(isBareAddress(good), true, good);
  }
  const bad: unknown[] = [
    "",
    "   ",
    " a@b.test",
    "a@b.test ",
    "not-an-address",
    "a@",
    "@b.test",
    "a@b",
    "a@@b.test",
    "a@b..test",
    "a@-b.test",
    "a@b-.test",
    ".a@b.test",
    "a.@b.test",
    "a..b@b.test",
    "Club Desk <desk@example.test>",
    "<desk@example.test>",
    '"desk"@example.test',
    "desk@example.test (comment)",
    "a@b.test, c@d.test",
    "a@b.test;c@d.test",
    "a@b.test\r\nBcc: x@y.test",
    "a@b.test\nBcc: x@y.test",
    "a b@example.test",
    "a\tb@example.test",
    "a@exa mple.test",
    "a@[127.0.0.1]",
    "a@b.test\u0000",
    "почта@пример.рф",
    `${"x".repeat(65)}@example.test`,
    `a@${"x".repeat(64)}.test`,
    `${"x".repeat(250)}@example.test`,
    null,
    undefined,
    42,
    {},
  ];
  for (const text of bad) {
    assert.equal(
      isBareAddress(text),
      false,
      JSON.stringify(text)?.slice(0, 50),
    );
  }
});

test("the configuration: nothing set is no mail, a whole set is SMTP, a partial one stops with the names missing", () => {
  assert.equal(loadMailConfig({}), null);
  assert.equal(loadMailConfig({ SMTP_HOST: "", MAIL_OUTBOX_DIR: "" }), null);

  const full = {
    SMTP_HOST: "smtp.example.test",
    SMTP_PORT: "587",
    SMTP_USER: "club@example.test",
    SMTP_PASSWORD: "an app password",
  };
  assert.deepEqual(loadMailConfig(full), {
    kind: "smtp",
    host: "smtp.example.test",
    port: 587,
    secure: false,
    user: "club@example.test",
    password: "an app password",
    from: "club@example.test",
  });
  // The sender is the user when that is an address, and a name of its own otherwise.
  assert.deepEqual(
    loadMailConfig({
      ...full,
      SMTP_USER: "apikey",
      SMTP_FROM: "club@example.test",
    }),
    {
      kind: "smtp",
      host: "smtp.example.test",
      port: 587,
      secure: false,
      user: "apikey",
      password: "an app password",
      from: "club@example.test",
    },
  );
  assert.throws(
    () => loadMailConfig({ ...full, SMTP_USER: "apikey" }),
    /SMTP_FROM/,
  );
  // Port 465 is the one that is encrypted from the first byte.
  const implicit = loadMailConfig({ ...full, SMTP_PORT: "465" });
  assert.equal(implicit?.kind === "smtp" && implicit.secure, true);

  assert.throws(
    () => loadMailConfig({ SMTP_HOST: "smtp.example.test" }),
    /SMTP_PORT, SMTP_USER, SMTP_PASSWORD/,
  );
  assert.throws(() => loadMailConfig({ ...full, SMTP_PORT: "0" }), /SMTP_PORT/);
  assert.throws(
    () => loadMailConfig({ ...full, SMTP_PORT: "58x" }),
    /SMTP_PORT/,
  );
  assert.throws(
    () => loadMailConfig({ ...full, SMTP_FROM: "Club <club@example.test>" }),
    /SMTP_FROM/,
  );
  assert.throws(
    () => loadMailConfig({ ...full, SMTP_HOST: "smtp.example.test:587" }),
    /SMTP_HOST/,
  );

  // The outbox is a development tool; a real SMTP configuration wins over it. The folder is made absolute at the
  // start, so a later change of the working directory cannot move it.
  assert.deepEqual(loadMailConfig({ MAIL_OUTBOX_DIR: "outbox-here" }), {
    kind: "outbox",
    dir: resolve("outbox-here"),
  });
  assert.equal(
    loadMailConfig({ ...full, MAIL_OUTBOX_DIR: "/tmp/outbox" })?.kind,
    "smtp",
  );
});

test("the nodemailer options are all spelled out: no file or URL reads, one recipient, encrypted, short timeouts", () => {
  const starttls = smtpOptions({
    kind: "smtp",
    host: "smtp.example.test",
    port: 587,
    secure: false,
    user: "club@example.test",
    password: "an app password",
    from: "club@example.test",
  });
  assert.deepEqual(starttls, {
    host: "smtp.example.test",
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user: "club@example.test", pass: "an app password" },
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    disableFileAccess: true,
    disableUrlAccess: true,
    maxRecipients: 1,
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 60_000,
    pool: false,
    logger: false,
  });
  const implicit = smtpOptions({
    kind: "smtp",
    host: "smtp.example.test",
    port: 465,
    secure: true,
    user: "club@example.test",
    password: "an app password",
    from: "club@example.test",
  });
  assert.equal(implicit.secure, true);
  assert.equal(implicit.requireTLS, false, "no upgrade is needed or asked");
});

test("the retry schedule grows and stops growing: a minute at first, six hours at most", () => {
  const waits = [1, 2, 3, 4, 5, 6, 7, 8, 20].map(mailBackoffMs);
  assert.equal(waits[0], 60_000);
  for (let i = 1; i < waits.length; i += 1) {
    assert.ok(waits[i]! >= waits[i - 1]!, `attempt ${i + 1} waits no less`);
  }
  assert.equal(waits.at(-1), 6 * 60 * 60_000);
  assert.ok(mailBackoffMs(0) > 0, "a count of zero is still a wait");
  assert.ok(mailBackoffMs(Number.MAX_SAFE_INTEGER) <= 6 * 60 * 60_000);
});

test("a server that offers no encryption is refused before the password or the message is sent", async () => {
  // A plain SMTP stand-in that greets, answers EHLO with AUTH and no STARTTLS, and writes down every line it receives.
  const received: string[] = [];
  const server = createServer((socket) => {
    let buffer = "";
    socket.write("220 stand-in ESMTP ready\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("latin1");
      for (
        let at = buffer.indexOf("\r\n");
        at >= 0;
        at = buffer.indexOf("\r\n")
      ) {
        const line = buffer.slice(0, at);
        buffer = buffer.slice(at + 2);
        received.push(line);
        if (/^EHLO/i.test(line)) {
          socket.write("250-stand-in\r\n250 AUTH PLAIN LOGIN\r\n");
        } else if (/^QUIT/i.test(line)) {
          socket.write("221 bye\r\n");
          socket.end();
        } else {
          socket.write("502 not implemented\r\n");
        }
      }
    });
    socket.on("error", () => undefined);
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  const port =
    typeof address === "object" && address !== null ? address.port : 0;
  const password = "never-on-the-wire-9f3a";
  try {
    const transport = createSmtpTransport({
      kind: "smtp",
      host: "127.0.0.1",
      port,
      secure: false,
      user: "club@example.test",
      password,
      from: "club@example.test",
    });
    await assert.rejects(
      transport.send({
        to: "desk@example.test",
        subject: "Subject",
        text: "A message that must not be sent in the clear",
      }),
    );
    const wire = received.join("\n");
    assert.ok(
      received.some((line) => /^EHLO/i.test(line)),
      "it did connect",
    );
    assert.equal(/^AUTH/im.test(wire), false, "no login was tried");
    assert.equal(/^MAIL FROM/im.test(wire), false, "no message was begun");
    assert.equal(wire.includes(password), false);
    assert.equal(
      wire.includes(Buffer.from(password).toString("base64")),
      false,
    );
    assert.equal(wire.includes("must not be sent"), false);
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
  }
});

test("the outbox transport writes each message as a text file of its own and nothing else", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kb-outbox-"));
  try {
    const transport = createOutboxTransport({ kind: "outbox", dir });
    await transport.send({
      to: "club@example.test",
      subject: "Club site: a message from the feedback form",
      text: "Hello\nthere",
    });
    await transport.send({
      to: "club@example.test",
      subject: "Second",
      text: "Again",
    });
    const files = readdirSync(dir).sort();
    assert.equal(files.length, 2);
    assert.ok(
      files.every((f) => /^[0-9T-]+-\d+\.txt$/.test(f)),
      files.join(),
    );
    const first = readFileSync(join(dir, files[0]!), "utf8");
    assert.match(first, /^To: club@example\.test\r?\n/);
    assert.match(first, /Subject: Club site: a message from the feedback form/);
    assert.match(first, /Hello\r?\nthere/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- the worker's pass, against a database ---------------------------------------------------------------------

let db: TestDatabase;
before(async () => {
  if (skipWithoutDatabase) return;
  db = await createTestDatabase();
});
after(async () => {
  if (skipWithoutDatabase) return;
  await db.drop();
});

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000);

async function queue(
  kind: string,
  to: string,
  subject: string,
  body: string,
  extra: { nextAttemptAt?: Date; attempts?: number } = {},
): Promise<number> {
  const r = await db.pool.query(
    `insert into mail_queue (kind, to_address, subject, body, next_attempt_at, attempts)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [
      kind,
      to,
      subject,
      body,
      extra.nextAttemptAt ?? ago(1),
      extra.attempts ?? 0,
    ],
  );
  return Number(r.rows[0].id);
}

const rowOf = async (id: number) =>
  (await db.pool.query(`select * from mail_queue where id = $1`, [id])).rows[0];

const recorder = () => {
  const sent: MailMessage[] = [];
  const transport: MailTransport = {
    async send(message) {
      sent.push(message);
    },
  };
  return { sent, transport };
};

test(
  "every kind of row goes out as exactly to, subject and text; a settings kind touches no message",
  opts,
  async () => {
    await db.pool.query("delete from mail_queue");
    const a = await queue("recipient_code", "new@example.test", "Code", "123");
    const b = await queue(
      "recipient_changed",
      "old@example.test",
      "Changed",
      "done",
    );
    const { sent, transport } = recorder();
    const now = new Date();
    const result = await deliverDue(db.pool, transport, now);
    assert.deepEqual(result, { sent: 2, failed: 0 });
    assert.deepEqual(
      sent.map((m) => Object.keys(m).sort().join()),
      ["subject,text,to", "subject,text,to"],
    );
    assert.deepEqual(sent.map((m) => m.to).sort(), [
      "new@example.test",
      "old@example.test",
    ]);
    for (const id of [a, b]) {
      const row = await rowOf(id);
      assert.ok(row.sent_at, "marked as sent");
      assert.equal(row.last_error, null);
    }
  },
);

test(
  "two passes at once send a row once: the first takes it, the second skips it",
  opts,
  async () => {
    await db.pool.query("delete from mail_queue");
    await queue("recipient_code", "race@example.test", "Race", "once");
    let calls = 0;
    const slow: MailTransport = {
      async send() {
        calls += 1;
        await new Promise((r) => setTimeout(r, 150));
      },
    };
    const [x, y] = await Promise.all([
      deliverDue(db.pool, slow),
      deliverDue(db.pool, slow),
    ]);
    assert.equal(calls, 1, "the transport was asked once");
    assert.equal(x.sent + y.sent, 1);
    assert.equal(x.failed + y.failed, 0);
  },
);

test(
  "a failure of one row does not stop the others, and the error kept is one short line",
  opts,
  async () => {
    await db.pool.query("delete from mail_queue");
    const bad = await queue("recipient_code", "bad@example.test", "Bad", "x", {
      nextAttemptAt: ago(3),
    });
    const good = await queue(
      "recipient_code",
      "good@example.test",
      "Good",
      "x",
      {
        nextAttemptAt: ago(2),
      },
    );
    const sent: string[] = [];
    const transport: MailTransport = {
      async send(message) {
        if (message.to === "bad@example.test") {
          throw new Error(
            `535 5.7.8 Username and Password not accepted\r\nline two ${"z".repeat(900)}`,
          );
        }
        sent.push(message.to);
      },
    };
    const result = await deliverDue(db.pool, transport);
    assert.deepEqual(result, { sent: 1, failed: 1 });
    assert.deepEqual(sent, ["good@example.test"]);
    const failedRow = await rowOf(bad);
    assert.equal(Number(failedRow.attempts), 1);
    assert.equal(failedRow.sent_at, null);
    assert.match(
      failedRow.last_error,
      /^535 5\.7\.8 Username and Password not accepted/,
    );
    assert.equal(/[\r\n]/.test(failedRow.last_error), false, "one line");
    assert.ok(failedRow.last_error.length <= 300, "a short one");
    assert.ok((await rowOf(good)).sent_at);
  },
);

test(
  "the wait grows with each failure and a thrown value that is not an Error is kept as text",
  opts,
  async () => {
    await db.pool.query("delete from mail_queue");
    const id = await queue("recipient_code", "slow@example.test", "S", "x");
    const failing: MailTransport = {
      async send() {
        throw "just a string";
      },
    };
    let now = new Date();
    const gaps: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const result = await deliverDue(db.pool, failing, now);
      assert.deepEqual(result, { sent: 0, failed: 1 }, `pass ${i + 1}`);
      const row = await rowOf(id);
      const next = new Date(row.next_attempt_at);
      gaps.push(next.getTime() - now.getTime());
      assert.equal(Number(row.attempts), i + 1);
      assert.match(row.last_error, /just a string/);
      now = next;
    }
    assert.equal(gaps[0], mailBackoffMs(1));
    assert.ok(gaps[1]! > gaps[0]!);
    assert.ok(gaps[3]! >= gaps[2]!);
  },
);

test(
  "a row whose recipient is not one bare address is failed without the transport being asked",
  opts,
  async () => {
    await db.pool.query("delete from mail_queue");
    // The table refuses a line break; a comma or a second address is what only the module's own rule catches.
    const id = await queue("recipient_code", "a@b.test,c@d.test", "Two", "x");
    let calls = 0;
    const transport: MailTransport = {
      async send() {
        calls += 1;
      },
    };
    const result = await deliverDue(db.pool, transport);
    assert.deepEqual(result, { sent: 0, failed: 1 });
    assert.equal(calls, 0);
    assert.match((await rowOf(id)).last_error, /one bare address/);
  },
);

test(
  "a batch is bounded and the rest waits for the next pass",
  opts,
  async () => {
    await db.pool.query("delete from mail_queue");
    for (let i = 0; i < 12; i += 1) {
      await queue("recipient_code", `n${i}@example.test`, "N", "x", {
        nextAttemptAt: ago(60 - i),
      });
    }
    const { sent, transport } = recorder();
    const first = await deliverDue(db.pool, transport, new Date(), 5);
    assert.deepEqual(first, { sent: 5, failed: 0 });
    assert.deepEqual(
      sent.map((m) => m.to),
      ["n0", "n1", "n2", "n3", "n4"].map((n) => `${n}@example.test`),
      "the soonest due first",
    );
    const rest = await deliverDue(db.pool, transport, new Date(), 100);
    assert.deepEqual(rest, { sent: 7, failed: 0 });
  },
);

test(
  "the worker loop sends what is due at once and on every interval, never two passes together, and stops cleanly",
  opts,
  async () => {
    await db.pool.query("delete from mail_queue");
    const first = await queue("recipient_code", "loop1@example.test", "L", "x");
    let running = 0;
    let overlap = 0;
    const sent: string[] = [];
    const transport: MailTransport = {
      async send(message) {
        running += 1;
        if (running > 1) overlap += 1;
        await new Promise((r) => setTimeout(r, 40));
        sent.push(message.to);
        running -= 1;
      },
    };
    const errors: unknown[] = [];
    const worker = startMailWorker({
      pool: db.pool,
      transport,
      intervalMs: 20,
      onError: (error) => errors.push(error),
    });
    const waitFor = async (check: () => boolean) => {
      // Up to ten seconds: the whole suite runs files side by side and a pass can be late on a busy machine.
      for (let i = 0; i < 500 && !check(); i += 1) {
        await new Promise((r) => setTimeout(r, 20));
      }
      assert.ok(check(), "timed out");
    };
    await waitFor(() => sent.includes("loop1@example.test"));
    // The transport answers before the pass commits the row, so the mark is waited for, not read at once.
    for (let i = 0; i < 500 && !(await rowOf(first)).sent_at; i += 1) {
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.ok((await rowOf(first)).sent_at);
    // A row that arrives later is picked up by a later pass.
    await queue("recipient_code", "loop2@example.test", "L", "x");
    await waitFor(() => sent.includes("loop2@example.test"));
    await worker.stop();
    const after = sent.length;
    await queue("recipient_code", "loop3@example.test", "L", "x");
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(sent.length, after, "nothing is sent after stop");
    assert.equal(overlap, 0, "no two passes ran together");
    assert.deepEqual(errors, []);
  },
);

test(
  "a pass that cannot reach the database is reported and the loop goes on",
  opts,
  async () => {
    const errors: unknown[] = [];
    // A pool whose database is not there (nothing listens on port 1): every pass fails to connect.
    const broken = createPool("postgres://nobody:none@127.0.0.1:1/none");
    const worker = startMailWorker({
      pool: broken,
      transport: { async send() {} },
      intervalMs: 20,
      onError: (error) => errors.push(error),
    });
    for (let i = 0; i < 250 && errors.length < 2; i += 1) {
      await new Promise((r) => setTimeout(r, 20));
    }
    await worker.stop();
    await broken.end();
    assert.ok(errors.length >= 2, "reported, and tried again");
  },
);
