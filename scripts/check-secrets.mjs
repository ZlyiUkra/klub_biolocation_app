// The secrets scan of SC-012 (task T127 of specs/001-self-hosted-club-site; spec.md SC-012, FR-036, FR-038): no secret
// and no personal address is found in the public repository or in any file shipped to the browser, checked before each
// release.
//
// What it scans, and for what:
//   - the working tree: every file git tracks, plus the files it would add (untracked and not ignored), skipping
//     binaries;
//   - `dist/client`, which is what a browser can fetch (run `npm run build` first; a missing folder is a failure, so a
//     scan that looked at nothing cannot pass);
//   - the HISTORY: every line ever added on any branch, and every author and committer address of every commit, because
//     a secret removed from the tree is still in the public repository the day it is published.
//   It looks for
//   - the VALUES of this machine's own secrets: every assignment in `.env` (a commented one too: a password typed under
//     a comment mark is a password) whose name says it holds one, and the password inside DATABASE_URL, are looked up
//     literally in everything above;
//   - the shapes of well-known credentials (private-key blocks, cloud and code-host tokens, JWTs, a password inside a
//     URL);
//   - any e-mail address that is not on the allowlist below: reserved documentation and test domains, and the few
//     entries that carry a reason;
//   - the paths of the machine the repository is worked on (added 2026-10-13, the owner's word): a drive-letter path
//     outside the system folders, the same disk in its WSL form, this machine's home folder and account name. Looked
//     for in the tree and in `dist/client` only, not in the history: the history of this repository is private (T189,
//     option C) and what is published is an export of one commit whose content is its tree.
//
// Decisions that would otherwise look like mistakes:
// - A finding NEVER prints a secret's value; it prints the variable's name or the credential's kind and `file:line` (or
//   `commit:file`). An address is printed with its local part masked. The scan's own output must be safe to paste.
// - The allowlist is a list of reasons, not of files: an address is allowed because of what it is, and an entry that
//   matches nothing is reported, so the list cannot grow stale unnoticed.
// - Package metadata is third parties' business: `package-lock.json` is generated and carries package authors'
//   addresses; it is skipped for addresses (not for secrets).
// - A path is never printed, only its kind and the place: a path of this machine is the thing the rule keeps out of the
//   repository, and the scan's output is meant to be pasted.
// - The machine's own values (home folder, account name) come from the operating system at run time, as the secrets
//   come from `.env`, so no name of the owner is written into this file. The account name is skipped when it is a
//   common one (root, admin, node, ...), where a word would be found everywhere.
//
// Usage:  node scripts/check-secrets.mjs [--no-history] [--no-dist] [--accept-history-authors]
//         node scripts/check-secrets.mjs --self-test    (proves each detector fires; touches nothing)
//
// `--accept-history-authors` is the owner's conscious decision to publish the history with the address its commits
// carry (the alternative is to rewrite the history with another address before the first publication). It is a flag
// and not an allowlist entry because the address itself must not be written into the repository to excuse it.
//
// Exit code 0 when clean, 1 with the findings listed.

import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createInterface } from "node:readline";
import { homedir, tmpdir, userInfo } from "node:os";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = new Set(process.argv.slice(2));

// --- what counts as an address and what is allowed ------------------------------------------------------------------

const addressPattern =
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

/** Allowed addresses, each with the reason. A pattern is tried against the whole address. */
const allowedAddresses = [
  [
    /@(?:[a-z0-9-]+\.)*example\.(?:com|org|net)$/i,
    "the documentation domains reserved by RFC 2606",
  ],
  [
    /@(?:[a-z0-9-]+\.)*[a-z0-9-]*\.?(?:test|example|invalid|localhost)$/i,
    "the reserved top-level names .test, .example, .invalid and .localhost (RFC 2606)",
  ],
  [
    /@(?:[a-z0-9-]+\.)*example\.co\.uk$/i,
    "example.co.uk, the multi-label fixture of the mailer's own tests (T108); no mailbox is meant by it",
  ],
  [/^git@github\.com$/i, "the SSH user of a git address, not a mailbox"],
  [
    /@[a-z0-9-]+\.accounts\.dev$/i,
    "an address the previous sign-in provider makes up for a development instance when no support address is set (AUTH.md section 12); it names no person",
  ],
  [
    /@users\.noreply\.github\.com$/i,
    "GitHub's address that stands for a person and is no mailbox",
  ],
];

/**
 * Findings that are in the history and that only a rewrite of it would remove, accepted one by one with the reason. An
 * entry names the commit (a prefix of its hash) and the file; it is never a pattern, so a new finding in the same file
 * is still reported.
 */
const knownInHistory = [
  {
    commit: "bbed411",
    file: "public/images/reactions/LICENSE.txt",
    reason:
      "the e-mail address of one author in the copy of the source's AUTHORS file; the working tree has had it left out since T127",
  },
];
const knownUsed = new Set();

/** Files whose addresses are third parties' package metadata and are not looked at. */
const addressExemptFiles = new Set(["package-lock.json"]);

const usedAllowances = new Set();
function allowedAddress(address) {
  for (const [pattern, reason] of allowedAddresses) {
    if (pattern.test(address)) {
      usedAllowances.add(reason);
      return true;
    }
  }
  return false;
}

function mask(address) {
  const [local, domain] = address.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

// --- the shapes of credentials ---------------------------------------------------------------------------------------

const placeholders =
  /^(?:password|passwd|pass|secret|none|nopass|dummy|fake|test|xxx+|\*+|changeme|example|user|username|<[^>]*>|\$\{[^}]*\}|\{[^}]*\}|%s|\.\.\.|\[[^\]]*\])$/i;

const credentialShapes = [
  ["a private-key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["an AWS access key id", /\bAKIA[0-9A-Z]{16}\b/],
  ["a GitHub token", /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ["a GitHub fine-grained token", /\bgithub_pat_[A-Za-z0-9_]{22,}\b/],
  ["a Slack token", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ["a Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["a live secret key (Stripe style)", /\b[sr]k_live_[0-9A-Za-z]{16,}\b/],
  [
    "a secret key of the previous sign-in provider",
    /\bsk_(?:test|live)_[A-Za-z0-9]{20,}\b/,
  ],
  [
    "a JSON Web Token",
    /\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}\b/,
  ],
];

/** `scheme://user:password@host` with a password that is not a placeholder. */
function urlCredential(line) {
  for (const m of line.matchAll(
    /\b[a-z][a-z0-9+.-]*:\/\/([^\s:/@'"`]+):([^\s:/@'"`]+)@[^\s/'"`]+/gi,
  )) {
    if (!placeholders.test(m[2]) && m[2].length >= 3) return true;
  }
  return false;
}

// --- the values of this machine's own secrets --------------------------------------------------------------------------

const secretName =
  /(PASSWORD|PASSWD|SECRET|TOKEN|API_?KEY|PRIVATE|CODE|DATABASE_URL)/i;

/** [{name, value}] read from `.env`: commented assignments included, short and trivial values left out. */
function envSecrets(path = join(root, ".env")) {
  if (!existsSync(path)) return [];
  const found = [];
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = raw.match(/^\s*#?\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m || !secretName.test(m[1])) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (m[1] === "DATABASE_URL") {
      try {
        const url = new URL(value);
        value = decodeURIComponent(url.password);
      } catch {
        continue;
      }
    }
    if (value.length < 6) continue;
    if (/^(?:true|false|none|null|[0-9]+)$/i.test(value)) continue;
    found.push({ name: m[1], value });
  }
  return found;
}

// --- the paths of this machine -----------------------------------------------------------------------------------------

/**
 * A drive-letter path: one letter, a colon, one or more backslashes or slashes (two backslashes inside a JavaScript
 * string, three slashes after `file:`), then a folder - whose name is not a system folder. The letter must stand alone
 * (not the end of `https`), and a first folder that does not start with a letter, digit, underscore or dollar (three
 * dots, say) is not a path. This comment spells no example, because the scan reads this file too.
 */
const drivePath =
  /(?<![A-Za-z0-9])[A-Za-z]:[\\/]+(?!(?:Program Files|Windows|ProgramData)(?![A-Za-z0-9]))[A-Za-z0-9_$]/i;

/** The same disk as WSL shows it. */
const wslDrivePath = /(?<![A-Za-z0-9_.-])\/mnt\/[a-z]\//;

/** Account names that are words everywhere; looking for them would find the tool's own vocabulary. */
const commonAccountNames = new Set([
  "root",
  "admin",
  "administrator",
  "user",
  "users",
  "guest",
  "runner",
  "node",
  "ubuntu",
  "postgres",
  "klub",
  "default",
  "public",
]);

function machineValues() {
  try {
    return { home: homedir(), user: userInfo().username };
  } catch {
    return { home: "", user: "" };
  }
}
const thisMachine = machineValues();

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Lower case, with every run of backslashes read as one slash, so one comparison serves every spelling. */
const flatten = (text) => text.toLowerCase().replace(/\\+/g, "/");

/** The kinds of path of this machine in one line; the path itself is never returned. */
function pathKinds(line, machine) {
  const kinds = [];
  if (drivePath.test(line))
    kinds.push("a drive path outside the system folders");
  if (wslDrivePath.test(line)) kinds.push("a drive path in its WSL form");
  const flat = flatten(line);
  const home = flatten(machine.home ?? "").replace(/\/+$/, "");
  if (home.length >= 6 && home !== "/root" && flat.includes(home)) {
    kinds.push("this machine's home folder");
  }
  const user = (machine.user ?? "").toLowerCase();
  if (user.length >= 3 && !commonAccountNames.has(user)) {
    const asWord =
      user.length >= 5 &&
      new RegExp(`(?<![a-z0-9_])${escapeRegExp(user)}(?![a-z0-9_])`).test(flat);
    if (asWord || flat.includes("/" + user + "/")) {
      kinds.push("this machine's account name");
    }
  }
  return kinds;
}

// --- scanning one line ---------------------------------------------------------------------------------------------------

/**
 * The findings of one line, as [category, detail] pairs. `where` names the place; it is not used here, the caller adds
 * it. `exemptAddresses` skips the address rule (package metadata). `paths` turns on the paths of this machine (the
 * tree and `dist/client`, not the history); `machine` replaces the operating system's values in the self test.
 */
function scanLine(
  line,
  secrets,
  { exemptAddresses = false, paths = false, machine = thisMachine } = {},
) {
  const out = [];
  for (const secret of secrets) {
    if (line.includes(secret.value)) {
      out.push(["a value from .env", `the value of ${secret.name}`]);
    }
  }
  for (const [kind, pattern] of credentialShapes) {
    if (pattern.test(line)) out.push(["a credential", kind]);
  }
  if (line.length < 2000 && urlCredential(line)) {
    out.push(["a credential", "a password inside an address"]);
  }
  if (!exemptAddresses) {
    for (const m of line.matchAll(addressPattern)) {
      const address = m[0];
      if (/^\d/.test(address.split("@")[1] ?? "")) continue;
      if (!allowedAddress(address)) {
        out.push(["a personal address", mask(address)]);
      }
    }
  }
  if (paths && line.length < 20000) {
    for (const kind of pathKinds(line, machine)) {
      out.push(["a path of this machine", kind]);
    }
  }
  return out;
}

const binaryExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".mp4",
  ".webm",
  ".pdf",
  ".zip",
  ".gz",
  ".br",
  ".7z",
]);

function isText(buffer) {
  return !buffer.subarray(0, 8000).includes(0);
}

/** Scans text; `label` is the file or commit that is shown. Returns findings with the line number. */
function scanText(text, label, secrets, options) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    for (const [category, detail] of scanLine(lines[i], secrets, options)) {
      findings.push({ category, detail, where: `${label}:${i + 1}` });
    }
  }
  return findings;
}

// --- the three places ---------------------------------------------------------------------------------------------------

function git(...parts) {
  return execFileSync("git", ["-C", root, ...parts], {
    encoding: "utf8",
    maxBuffer: 1 << 29,
  });
}

function scanTree(secrets) {
  const files = git(
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "-z",
  )
    .split("\0")
    .filter(Boolean);
  const findings = [];
  let scanned = 0;
  for (const file of files) {
    if (binaryExtensions.has(extname(file).toLowerCase())) continue;
    const path = join(root, file);
    if (!existsSync(path)) continue;
    const buffer = readFileSync(path);
    if (!isText(buffer)) continue;
    scanned += 1;
    findings.push(
      ...scanText(buffer.toString("utf8"), file, secrets, {
        exemptAddresses: addressExemptFiles.has(file),
        paths: true,
      }),
    );
  }
  return { findings, scanned };
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

function scanDist(secrets) {
  const dist = join(root, "dist", "client");
  if (!existsSync(dist)) return { findings: null, scanned: 0 };
  const findings = [];
  let scanned = 0;
  for (const path of walk(dist)) {
    if (binaryExtensions.has(extname(path).toLowerCase())) continue;
    const buffer = readFileSync(path);
    if (!isText(buffer)) continue;
    scanned += 1;
    const label =
      "dist/client/" + path.slice(dist.length + 1).replace(/\\/g, "/");
    findings.push(
      ...scanText(buffer.toString("utf8"), label, secrets, { paths: true }),
    );
  }
  return { findings, scanned };
}

async function scanHistory(secrets) {
  const findings = [];
  // The people of the history: author and committer addresses of every commit.
  const people = new Set();
  for (const line of git("log", "--all", "--format=%ae%n%ce").split("\n")) {
    if (line.trim() !== "") people.add(line.trim());
  }
  for (const address of people) {
    if (!allowedAddress(address)) {
      // The owner's conscious decision to publish the history with this address (see the usage note at the top).
      if (args.has("--accept-history-authors")) {
        console.log(
          `  note: ${mask(address)} is the address of commits and is accepted by --accept-history-authors`,
        );
        continue;
      }
      findings.push({
        category: "a personal address",
        detail: `${mask(address)} is the author or committer address of commits`,
        where: "git history",
      });
    }
  }
  // Every added line of every commit on every branch.
  const child = spawn(
    "git",
    [
      "-C",
      root,
      "log",
      "--all",
      "-p",
      "--no-color",
      "--no-ext-diff",
      "--format=@@commit %h",
      "--text",
    ],
    { stdio: ["ignore", "pipe", "ignore"] },
  );
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  let commit = "";
  let file = "";
  let commits = 0;
  const seen = new Set();
  for await (const line of lines) {
    if (line.startsWith("@@commit ")) {
      commit = line.slice(9);
      commits += 1;
      continue;
    }
    if (line.startsWith("+++ ")) {
      file = line.startsWith("+++ b/") ? line.slice(6) : "";
      continue;
    }
    if (!line.startsWith("+") || line.startsWith("+++")) continue;
    if (file === "") continue;
    for (const [category, detail] of scanLine(line.slice(1), secrets, {
      exemptAddresses: addressExemptFiles.has(file),
    })) {
      const key = `${category}|${detail}|${commit}|${file}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // Something already in the history that only a rewrite of it could remove, accepted by name with its reason.
      const known = knownInHistory.find(
        (entry) => commit.startsWith(entry.commit) && entry.file === file,
      );
      if (known !== undefined) {
        knownUsed.add(known);
        continue;
      }
      findings.push({ category, detail, where: `${commit}:${file}` });
    }
  }
  return { findings, scanned: commits };
}

// --- the report ---------------------------------------------------------------------------------------------------------

function report(title, findings) {
  console.log(
    `${title}: ${findings.length === 0 ? "clean" : findings.length + " finding(s)"}`,
  );
  const groups = new Map();
  for (const f of findings) {
    const key = `${f.category}: ${f.detail}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f.where);
  }
  for (const [key, wheres] of groups) {
    console.log(`  - ${key}`);
    for (const where of wheres.slice(0, 6)) console.log(`      ${where}`);
    if (wheres.length > 6)
      console.log(`      ... and ${wheres.length - 6} more`);
  }
}

// --- the self test ------------------------------------------------------------------------------------------------------

function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), "kb-secrets-selftest-"));
  let failed = 0;
  const expect = (name, ok) => {
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}`);
    if (!ok) failed += 1;
  };
  try {
    const envPath = join(dir, ".env");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      envPath,
      [
        "PORT=3000",
        "POSTGRES_PASSWORD=planted-db-password-91",
        "# SMTP_PASSWORD=planted-mail-password-77",
        "DATABASE_URL=postgres://app:planted-url-password-5" +
          "@127.0.0.1:5433/klub",
        "SITE_ORIGIN=http://localhost:3000",
        "SHORT_SECRET=abc",
      ].join("\n"),
    );
    const secrets = envSecrets(envPath);
    const names = secrets
      .map((s) => s.name)
      .sort()
      .join(",");
    expect(
      "the .env reader takes the names that say secret, commented ones too, and the password of the URL",
      names === "DATABASE_URL,POSTGRES_PASSWORD,SMTP_PASSWORD",
    );
    const cases = [
      [
        "a value from .env",
        "token = planted-db-password-91",
        "a value from .env",
      ],
      [
        "the password inside DATABASE_URL",
        "x planted-url-password-5 y",
        "a value from .env",
      ],
      [
        "a private key block",
        // The fixtures are built from two pieces, so that this file carries no planted credential of its own.
        "-----BEGIN RSA " + "PRIVATE KEY-----",
        "a credential",
      ],
      ["an AWS key id", "key AKIA" + "ABCDEFGHIJKLMNOP", "a credential"],
      ["a GitHub token", "t ghp_" + "a".repeat(36), "a credential"],
      [
        "a password inside a URL",
        "postgres://user:hunter2hunter" + "@db.internal/app",
        "a credential",
      ],
      [
        "a personal address",
        "write to jane.doe" + "@gmail.com please",
        "a personal address",
      ],
    ];
    for (const [name, line, category] of cases) {
      const hit = scanLine(line, secrets).some(([c]) => c === category);
      expect(`it fires on ${name}`, hit);
    }
    const quiet = [
      "mail to club@example.test and desk@example.org",
      "postgres://app:password@localhost:5432/app",
      "postgres://app:${POSTGRES_PASSWORD}@db/app",
      "git@github.com:someone/repo.git",
      "@clerk/ui@6.34.1 and node@20.19.0",
      "const port = 3000;",
    ];
    for (const line of quiet) {
      expect(`it is quiet on: ${line}`, scanLine(line, secrets).length === 0);
    }
    const masked = scanLine("jane.doe" + "@gmail.com", secrets)[0]?.[1] ?? "";
    expect(
      "an address is printed with its local part masked",
      masked === "j***@gmail.com",
    );

    // Added 2026-10-13: the paths of this machine. The fixtures are built from pieces for the same reason as above,
    // and the machine's own values are injected, so the test does not depend on who runs it.
    const machine = { home: "/srv/people/alice", user: "alice-k" };
    const pathCases = [
      ["a drive path with backslashes", "see C" + ":\\Projects\\thing"],
      ["a drive path with slashes", "saved to D" + ":/Distr/archive.tar.gz"],
      ["a drive path escaped inside a string", "p = 'C" + ":\\\\Users\\\\x'"],
      ["a drive path inside a file address", "file:///C" + ":/Users/x/a.md"],
      ["the WSL form of a drive path", "cd /mnt" + "/c/Projects/x"],
      ["this machine's home folder", "cd /srv/people/alice/repo"],
      ["this machine's account name", "written by alice-k on a laptop"],
    ];
    for (const [name, line] of pathCases) {
      const hit = scanLine(line, secrets, { paths: true, machine }).some(
        ([c]) => c === "a path of this machine",
      );
      expect(`it fires on ${name}`, hit);
    }
    const pathQuiet = [
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "on Windows it is C" + ":\\... and elsewhere /...",
      "https://example.test/a:b/c and http://localhost:3000/x",
      "at 10:15 the key:/value pair is read; a ? b : c",
      "cd /srv/people/bob/repo",
    ];
    for (const line of pathQuiet) {
      expect(
        `it is quiet on: ${line}`,
        scanLine(line, secrets, { paths: true, machine }).length === 0,
      );
    }
    expect(
      "a path is not looked for where the option is off (the history)",
      scanLine("see C" + ":\\Projects\\thing", secrets).length === 0,
    );
    const shownPath =
      scanLine("see C" + ":\\Projects\\thing", secrets, {
        paths: true,
        machine,
      })[0]?.[1] ?? "";
    expect(
      "a path is never printed, only its kind",
      !/Projects/.test(shownPath),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(
    failed === 0 ? "self test passed" : `self test FAILED: ${failed}`,
  );
  return failed === 0;
}

// --- main ----------------------------------------------------------------------------------------------------------------

if (args.has("--self-test")) {
  process.exit(selfTest() ? 0 : 1);
}

const secrets = envSecrets();
console.log(
  `Looking for ${secrets.length} secret value(s) of .env (${secrets.map((s) => s.name).join(", ") || "none: no .env here"}), the shapes of credentials, addresses off the allowlist, and the paths of this machine in the tree and dist/client.`,
);

let failed = false;

const tree = scanTree(secrets);
console.log(`Working tree: ${tree.scanned} text files.`);
report("Working tree", tree.findings);
if (tree.findings.length > 0) failed = true;

if (!args.has("--no-dist")) {
  const dist = scanDist(secrets);
  if (dist.findings === null) {
    console.log(
      "dist/client: MISSING. Run `npm run build` first; a scan that looked at nothing proves nothing.",
    );
    failed = true;
  } else {
    console.log(`dist/client: ${dist.scanned} text files.`);
    report("dist/client", dist.findings);
    if (dist.findings.length > 0) failed = true;
  }
}

if (!args.has("--no-history")) {
  const history = await scanHistory(secrets);
  console.log(`History: ${history.scanned} commits.`);
  report("History", history.findings);
  if (history.findings.length > 0) failed = true;
}

for (const entry of knownUsed) {
  console.log(
    `Known in history, accepted: ${entry.commit}:${entry.file} (${entry.reason})`,
  );
}

const unused = allowedAddresses
  .map(([, reason]) => reason)
  .filter((reason) => !usedAllowances.has(reason));
if (unused.length > 0) {
  console.log(
    "Allowlist entries that matched nothing this run (remove them when they stay unused):",
  );
  for (const reason of unused) console.log(`  - ${reason}`);
}

console.log(
  failed ? "check:secrets: FINDINGS (see above)" : "check:secrets: clean",
);
process.exit(failed ? 1 : 0);
