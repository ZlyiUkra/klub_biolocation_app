// Checks that nothing a visitor's browser can fetch carries the database client, the content runtime or the text of an
// entry (task T037 of specs/001-self-hosted-club-site; CLAUDE.md, "A browser script must never import src/lib/posts.ts,
// lists.ts, video.ts or terms.ts").
//
// The trap it guards, from 2026-10-02: the admin panel's browser script imported a module that imports
// `astro:content`; the build stayed green and `astro check` said nothing, yet the panel's bundle carried the content
// runtime and `dist/_astro` gained a browser copy of every post, drafts included - files anyone could fetch. With posts
// in a database the same mistake would ship something worse, the connection code, so the check is wider: it looks at
// every file under dist/client for
//   - markers of the database client and of the content runtime (a list below), and
//   - a canary from the body of EVERY source entry: posts, videos, drafts, hidden entries and the members-only blocks.
//     (src/content/pages is not scanned: the about page is built as a file and carries its own text on purpose.)
//     The canary is a 40-character run from a long line of the body; it cannot be in any built file, because the pages
//     that are built as files (about, the sign-in pages, the admin shells) carry no entry's text.
//
// Usage:  node scripts/check-bundles.mjs [distClient]   (default dist/client, run it after npm run build)
//         node scripts/check-bundles.mjs --self-test    (proves the detector fires; no build needed)
//
// Exit code 0 when clean, 1 with a list of findings.

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, relative } from "node:path";

const markers = [
  // The database client and its protocol library.
  "pg-protocol",
  "pg-pool",
  "node-postgres",
  "postgres://",
  "postgresql://",
  "DATABASE_URL",
  // The content runtime of Astro and what the site's own modules export for it.
  "astro:content",
  "defineCollection",
  "getCollection(",
  "getEntryBySlug",
  // Names of the site's own server-side modules.
  "api-client",
  "access/entries",
];

const textExtensions = new Set([
  ".js",
  ".mjs",
  ".css",
  ".html",
  ".json",
  ".xml",
  ".txt",
  ".map",
  ".md",
  ".svg",
]);

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

// One canary per source file: the first 40 characters of its longest plain line of body text.
export function canariesOf(sourceDirs) {
  const canaries = [];
  for (const dir of sourceDirs) {
    for (const file of walk(dir).filter((f) => f.endsWith(".md"))) {
      const text = readFileSync(file, "utf8").replace(
        /^---[\s\S]*?\n---\r?\n/,
        "",
      );
      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(
          (line) =>
            line.length >= 60 &&
            !/^[#<>|`-]/.test(line) &&
            !line.includes("](") &&
            !line.includes("{"),
        );
      if (lines.length === 0) continue;
      const longest = lines.sort((a, b) => b.length - a.length)[0];
      canaries.push({ file, text: longest.slice(0, 40) });
    }
  }
  return canaries;
}

export function scan(distClient, canaries) {
  const findings = [];
  for (const file of walk(distClient)) {
    if (!textExtensions.has(extname(file).toLowerCase())) continue;
    if (statSync(file).size > 20 * 1024 * 1024) continue;
    const content = readFileSync(file, "utf8");
    const where = relative(distClient, file).split("\\").join("/");
    for (const marker of markers) {
      if (content.includes(marker))
        findings.push(`${where}: contains "${marker}"`);
    }
    for (const canary of canaries) {
      if (content.includes(canary.text)) {
        findings.push(
          `${where}: contains the text of ${canary.file.split("\\").join("/")}`,
        );
      }
    }
  }
  return findings;
}

function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), "kb-bundles-"));
  try {
    const source = join(dir, "src");
    const dist = join(dir, "dist");
    mkdirSync(source);
    mkdirSync(join(dist, "_astro"), { recursive: true });
    writeFileSync(
      join(source, "a.md"),
      "---\ntitle: A\n---\nThis line is long enough to be a canary for the self test of the bundle check.\n",
    );
    writeFileSync(
      join(dist, "_astro", "clean.js"),
      "console.log('nothing here');",
    );
    const canaries = canariesOf([source]);
    if (canaries.length !== 1) throw new Error("self test: no canary found");
    if (scan(dist, canaries).length !== 0)
      throw new Error("self test: a clean tree was flagged");
    writeFileSync(
      join(dist, "_astro", "leak.js"),
      `var x="${canaries[0].text}";`,
    );
    writeFileSync(
      join(dist, "_astro", "db.js"),
      "import pg from 'node-postgres';",
    );
    const found = scan(dist, canaries);
    if (found.length !== 2)
      throw new Error(`self test: expected 2 findings, got ${found.length}`);
    console.log(
      "self test passed: a leaked entry text and a database marker are both caught.",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const isMain =
  process.argv[1] &&
  import.meta.url.endsWith(
    process.argv[1].split("\\").join("/").split("/").pop(),
  );
if (isMain) {
  if (process.argv[2] === "--self-test") {
    selfTest();
  } else {
    const dist = process.argv[2] ?? "dist/client";
    const canaries = canariesOf(
      ["src/content/posts", "src/content/video"].filter((d) => {
        try {
          return statSync(d).isDirectory();
        } catch {
          return false;
        }
      }),
    );
    const findings = scan(dist, canaries);
    console.log(
      `${canaries.length} entry canaries, ${markers.length} markers, ${dist}`,
    );
    if (findings.length > 0) {
      console.error(findings.join("\n"));
      console.error(
        `\n${findings.length} finding(s): the browser could fetch what it must not.`,
      );
      process.exit(1);
    }
    console.log(
      "check:bundles: nothing of the database or of an entry is in the browser's files.",
    );
  }
}
