// Check of the mail wiring in the real server process (T108 of specs/001-self-hosted-club-site; research.md section 11,
// FR-033). The unit tests of server/test/mailer.test.ts and feedback.test.ts call the queue's pass and the transports
// directly; this one starts `server/dist/server/src/main.js` itself, as the owner does, and watches what only the
// process can show: the worker loop starts, sends outside any request, writes what the form stored, marks the message
// as mailed, and a half-written configuration stops the start with the names and without the password.
//
// Run: npm run check:mail (builds the backend first, then runs this with `--env-file=.env`). Needs the development
// database (compose.dev.yml); it makes a throwaway database of its own and a throwaway folder, and removes both and
// stops the server when it ends, also when it fails. The port is chosen at run time. The development outbox
// (MAIL_OUTBOX_DIR) stands for the mailbox: a real SMTP server is not part of this check (T111 is the first step that
// needs one), the transport's own refusal of an unencrypted server is a test of mailer.test.ts.
//
// It takes about 40 seconds, because the loop looks at the queue every 30 seconds and the check waits for a message
// posted after the start to be picked up by it.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const imports = (p) => import(pathToFileURL(join(root, p)).href);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () =>
  new Promise((res, rej) => {
    const s = createServer();
    s.once("error", rej);
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => res(p));
    });
  });
const { createTestDatabase } = await imports(
  "server/dist/server/test/helpers/db.js",
);

const RECIPIENT = "club-desk@example.test";
const PORT = await freePort();
const BASE = `http://127.0.0.1:${PORT}`;
const work = mkdtempSync(join(tmpdir(), "kb-mail-check-"));
const outbox = join(work, "outbox");
const db = await createTestDatabase();

let passed = 0;
const failures = [];
const check = (name, ok, detail = "") => {
  if (ok) {
    passed++;
    console.log("  ok   ", name);
  } else {
    failures.push(name);
    console.log("  FAIL ", name, detail ? "- " + detail : "");
  }
};

// The environment of the child: ours, with every mail variable cleared, then what the case sets.
const envFor = (extra) => ({
  ...process.env,
  DATABASE_URL: db.url,
  PORT: String(PORT),
  SITE_ORIGIN: BASE,
  SETUP_CODE: "unused-setup-code-for-checks",
  SMTP_HOST: "",
  SMTP_PORT: "",
  SMTP_USER: "",
  SMTP_PASSWORD: "",
  SMTP_FROM: "",
  MAIL_OUTBOX_DIR: "",
  ...extra,
});
const mainJs = join(root, "server/dist/server/src/main.js");
const outboxFiles = () => {
  try {
    return readdirSync(outbox).sort();
  } catch {
    return [];
  }
};
const untilTrue = async (fn, ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(500);
  }
  return false;
};

let server = null;
try {
  console.log("A half-written SMTP configuration stops the start");
  const secret = "must-not-be-printed-4c1d";
  const half = spawn(process.execPath, [mainJs], {
    cwd: root,
    env: envFor({ SMTP_HOST: "smtp.example.test", SMTP_PASSWORD: secret }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let halfOutput = "";
  half.stdout.on("data", (c) => (halfOutput += c));
  half.stderr.on("data", (c) => (halfOutput += c));
  const halfCode = await new Promise((res) => {
    half.once("exit", (code) => res(code));
    setTimeout(() => {
      half.kill();
      res("timeout");
    }, 20000);
  });
  check("it exits with code 1", halfCode === 1, String(halfCode));
  check(
    "it names the missing variables",
    /SMTP_PORT, SMTP_USER/.test(halfOutput),
    halfOutput.slice(0, 200),
  );
  check("and never prints the password", !halfOutput.includes(secret));

  console.log("The loop sends what the form stored");
  await db.pool.query(
    `insert into settings (key, value) values ('feedback_recipient', $1::jsonb)`,
    [JSON.stringify(RECIPIENT)],
  );
  // One message and its notice, as the form's route writes them, before the start: the first pass of the loop at
  // start must send it.
  const stored = await db.pool.query(
    `insert into feedback (body, name, contact, subject, address_prefix)
     values ('Written before the start', 'Early', 'early@example.test', 'signin_problem', '10.0.0') returning id`,
  );
  await db.pool.query(
    `insert into mail_queue (kind, to_address, subject, body, feedback_id)
     values ('feedback_notice', $1, 'Club site: a visitor cannot sign in', 'Message:\n\nWritten before the start', $2)`,
    [RECIPIENT, Number(stored.rows[0].id)],
  );

  let output = "";
  server = spawn(process.execPath, [mainJs], {
    cwd: root,
    env: envFor({ MAIL_OUTBOX_DIR: outbox }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (c) => (output += c));
  server.stderr.on("data", (c) => (output += c));
  const up = await untilTrue(async () => {
    try {
      return (await fetch(BASE + "/healthz")).ok;
    } catch {
      return false;
    }
  }, 40000);
  check("the server starts", up, output.slice(0, 300));
  check(
    "the start line says the development outbox is in use",
    /Mail: development outbox/.test(output),
    output.slice(0, 300),
  );

  const first = await untilTrue(() => outboxFiles().length >= 1, 15000);
  check("the first pass at start sends the waiting notice", first);
  if (first) {
    const text = readFileSync(join(outbox, outboxFiles()[0]), "utf8");
    check(
      "the file holds the recipient, the fixed subject and the message",
      text.startsWith(`To: ${RECIPIENT}\n`) &&
        text.includes("Subject: Club site: a visitor cannot sign in") &&
        text.includes("Written before the start"),
      text.slice(0, 200),
    );
  }
  const marked = await db.pool.query(
    `select mailed_at, mail_error from feedback where id = $1`,
    [Number(stored.rows[0].id)],
  );
  check(
    "its message is marked as mailed with no error",
    marked.rows[0]?.mailed_at !== null && marked.rows[0]?.mail_error === null,
    JSON.stringify(marked.rows[0]),
  );

  // A message posted after the start goes through the route and is picked up by a later pass of the loop.
  const posted = await fetch(BASE + "/api/feedback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: BASE,
      "X-Forwarded-For": "10.9.8.7",
    },
    body: JSON.stringify({
      body: "Posted after the start, through the route",
      name: "Late",
      website: "",
      startedAt: Date.now() - 20_000,
    }),
  });
  check("the route stores it", posted.status === 201, String(posted.status));
  check(
    "the answer did not wait for any mail: the file is not there yet",
    outboxFiles().length === 1,
    String(outboxFiles().length),
  );
  const second = await untilTrue(() => outboxFiles().length >= 2, 50000);
  check("a later pass of the loop sends it", second);
  if (second) {
    const text = readFileSync(join(outbox, outboxFiles()[1]), "utf8");
    check(
      "the second file holds the message posted through the route",
      text.includes("Posted after the start, through the route") &&
        text.includes("Network: 10.9.8"),
      text.slice(0, 200),
    );
  }
  check(
    "no file holds the full address of the sender",
    !outboxFiles().some((f) =>
      readFileSync(join(outbox, f), "utf8").includes("10.9.8.7"),
    ),
  );
} catch (error) {
  failures.push("script error: " + error);
  console.log("  FAIL  script error:", error);
} finally {
  try {
    server?.kill();
  } catch {}
  await sleep(800);
  await db.drop().catch(() => {});
  rmSync(work, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 300,
  });
}
console.log(
  `\ncheck:mail: ${passed} passed, ${failures.length} failed${failures.length ? ": " + failures.join("; ") : ""}`,
);
process.exit(failures.length ? 1 : 0);
