// Stress and measurement run against a throwaway database (task T154 of specs/001-self-hosted-club-site;
// successor of `check:pages:stress`, which built a temporary copy of the project with generated posts).
//
// What it does, in order:
//   1. creates a database of its own on the server DATABASE_URL names (kb_stress_<random>), applies the migrations;
//   2. writes generated posts and videos as Markdown files into a temporary folder and imports them with the real
//      importer (render, store_post), so the rows are the shape the site really has;
//   3. starts the backend with the built site on a free port, in this process, against that database;
//   4. measures the data the pages ask for (the API lists) and the pages themselves, cold and warm, and prints sizes
//      and times;
//   5. with `--check`, runs scripts/check-pagination.mjs against it, pointed at the generated sources, which walks
//      every year list, tag list and category list, over HTTP;
//   6. drops its database and removes its temporary folder, but only when everything passed: a failed run keeps both
//      and prints their names (nothing is deleted that the run did not create).
//
// Usage:  npm run stress:site -- [--check] [--keep] [--plan <name>] [--posts N] [--years A..B]
//   --keep       leaves the database and the folder in place after a passing run, for queries made by hand.
//   plan "pagination" (default with --check): 159 posts in 2023 (1), 2022 (5), 2021 (6), 2020 (47), 2019 (100), three
//        posts with one date and time (tie-break), two posts dated in the future and one draft; the same shape the old
//        stress test used, so the expectations of check-pagination.mjs are the ones it always had.
//   plan "spread" (default for measuring): N posts (default 10000) spread evenly over the years A..B (default
//        2012..2040, i.e. both before and after today), the tags and categories drawn from a pool of 40.
//
// Needs: DATABASE_URL (the development database server; the role must be allowed to create a database), the built
// site in dist/ (npm run build) and the compiled server (npm run server:build). `npm run stress:site` does the second.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const serverDist = path.join(projectRoot, "server/dist/server/src");

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : args[at + 1];
};

const check = flag("--check");
const plan = option("--plan", check ? "pagination" : "spread");
const postCount = Number(option("--posts", "10000"));
const [firstYear, lastYear] = option("--years", "2012..2040")
  .split("..")
  .map(Number);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    "DATABASE_URL is not set. Start the development database and use --env-file=.env.",
  );
  process.exit(1);
}

const pad = (n) => String(n).padStart(2, "0");
const now = Date.now();

// ---------------------------------------------------------------------------------------------
// The generated sources.

function writeSource(dir, name, frontMatter, text) {
  fs.writeFileSync(
    path.join(dir, `${name}.md`),
    `---\n${frontMatter}\n---\n\n${text}\n`,
  );
}

// The shape the old stress test generated: see the header.
function generatePaginationPlan(postsDir) {
  const stressPlan = { 2023: 1, 2022: 5, 2021: 6, 2020: 47, 2019: 100 };
  let count = 0;
  for (const [year, total] of Object.entries(stressPlan)) {
    for (let i = 1; i <= total; i++) {
      const tie = year === "2020" && i <= 3;
      const date = tie
        ? `${year}-06-15T10:00:00+03:00`
        : `${year}-${pad(((i - 1) % 12) + 1)}-${pad(((i * 7) % 28) + 1)}T${pad(i % 24)}:00:00+03:00`;
      const title = tie
        ? ["Charlie", "Alpha", "Bravo"][i - 1]
        : `Generated ${year} number ${i}`;
      writeSource(
        postsDir,
        `stress-${year}-${String(i).padStart(3, "0")}`,
        `title: "${title}"\ndate: "${date}"\ntags: ["stress"]\ncategories: ["stress"]\ndraft: false`,
        `Post ${i} of ${year}.\n\n## Section\n\nText.`,
      );
      count++;
    }
  }
  const soon = new Date(now + 30 * 24 * 3600 * 1000)
    .toISOString()
    .replace(/\.\d+Z$/, "Z");
  const nextYear = `${new Date(now).getUTCFullYear() + 1}-06-10T10:00:00+03:00`;
  writeSource(
    postsDir,
    "stress-future-soon",
    `title: "Future, in a month"\ndate: "${soon}"\ntags: ["stress"]\ncategories: ["stress"]\ndraft: false`,
    "Not yet.",
  );
  writeSource(
    postsDir,
    "stress-future-next-year",
    `title: "Future, next year"\ndate: "${nextYear}"\ntags: ["stress"]\ncategories: ["stress"]\ndraft: false`,
    "Not yet.",
  );
  writeSource(
    postsDir,
    "stress-2018-draft",
    `title: "Draft only"\ndate: "2018-05-05T10:00:00+03:00"\ndraft: true`,
    "A draft.",
  );
  return count;
}

// N posts spread over the years firstYear..lastYear: the days of a year are used in turn, so no year is empty and the
// counts per year are equal to within one. Tags and categories come from a pool so that the term lists are long too.
function generateSpreadPlan(postsDir) {
  const years = lastYear - firstYear + 1;
  const tagPool = Array.from({ length: 40 }, (_, i) => `tag-${pad(i)}`);
  const categoryPool = Array.from({ length: 8 }, (_, i) => `category-${i}`);
  // A body of about 3 kB, the size of the club's longer posts, so a stored row is realistic.
  const paragraph =
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ";
  const body = Array.from({ length: 24 }, () => paragraph).join("\n\n");
  for (let i = 0; i < postCount; i++) {
    const year = firstYear + (i % years);
    const day = Math.floor(i / years);
    const date = `${year}-${pad((day % 12) + 1)}-${pad((Math.floor(day / 12) % 28) + 1)}T${pad(day % 24)}:00:00+03:00`;
    const tags = [0, 7, 19].map((s) => tagPool[(i * 3 + s) % tagPool.length]);
    writeSource(
      postsDir,
      `spread-${String(i).padStart(6, "0")}`,
      `title: "Spread post ${i}"\ndate: "${date}"\ntags: [${[...new Set(tags)].map((t) => `"${t}"`).join(", ")}]\ncategories: ["${categoryPool[i % categoryPool.length]}"]\ndraft: false`,
      `Post ${i}.\n\n## Section\n\n${body}`,
    );
  }
  return postCount;
}

// ---------------------------------------------------------------------------------------------
// The throwaway database.

const adminUrl = new URL(databaseUrl);
const dbName = `kb_stress_${randomBytes(4).toString("hex")}`;
const stressUrl = new URL(databaseUrl);
stressUrl.pathname = `/${dbName}`;

async function createDatabase() {
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    // The name is generated here from hex digits only, so it is safe to place in the statement.
    await admin.query(`create database ${dbName}`);
  } finally {
    await admin.end();
  }
}

async function dropDatabase() {
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await admin.query(`drop database ${dbName} with (force)`);
  } finally {
    await admin.end();
  }
}

// ---------------------------------------------------------------------------------------------
// Measuring.

const fmtMs = (n) => `${n.toFixed(1)} ms`.padStart(10);
const fmtKb = (n) => `${(n / 1024).toFixed(1)} kB`.padStart(11);

async function timed(url, rounds) {
  const samples = [];
  let size = 0;
  let status = 0;
  for (let i = 0; i < rounds; i++) {
    const t = performance.now();
    const response = await fetch(url);
    const text = await response.text();
    samples.push(performance.now() - t);
    size = Buffer.byteLength(text);
    status = response.status;
  }
  samples.sort((a, b) => a - b);
  return {
    status,
    size,
    first: samples[0],
    median: samples[Math.floor(samples.length / 2)],
    max: samples[samples.length - 1],
  };
}

async function measure(origin, years, tag, category) {
  // Years after today hold only entries that are not yet published, so their pages answer 404 by design: the newest
  // year to measure is the newest one that is not in the future.
  const thisYear = new Date().getFullYear();
  const newest = years.find((y) => Number(y) <= thisYear) ?? years[0];
  const oldest = years[years.length - 1];
  const targets = [
    ["API list of posts", "/api/posts"],
    ["API terms", "/api/terms"],
    ["page /posts/ (newest year)", "/posts/"],
    ["page /posts/<newest>/page/2/", `/posts/${newest}/page/2/`],
    ["page /posts/<oldest>/", `/posts/${oldest}/`],
    [`page /tags/${tag}/`, `/tags/${tag}/`],
    [`page /categories/${category}/`, `/categories/${category}/`],
    ["page /tags/ (all tags)", "/tags/"],
    // Added 2026-10-10 (T163): the search the page uses now. Three words that the generated posts carry, one of them
    // common (matches every post), one rare, and the facets alone.
    ["page /search/query.json?q=common word", "/search/query.json?q=post"],
    [
      "page /search/query.json?q=two words",
      "/search/query.json?q=stress%20post",
    ],
    ["page /search/query.json (counts only)", "/search/query.json"],
    ["page /sitemap-0.xml", "/sitemap-0.xml"],
    ["page /rss.xml", "/rss.xml"],
    ["page /", "/"],
  ];
  console.log(
    `\n${"request".padEnd(36)}${"status".padStart(7)}${"size".padStart(11)}${"first".padStart(10)}${"median".padStart(10)}${"max".padStart(10)}`,
  );
  for (const [label, url] of targets) {
    const result = await timed(origin + url, 7);
    console.log(
      `${label.padEnd(36)}${String(result.status).padStart(7)}${fmtKb(result.size)}${fmtMs(result.first)}${fmtMs(result.median)}${fmtMs(result.max)}`,
    );
  }
}

// ---------------------------------------------------------------------------------------------

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "klub-stress-"));
const postsDir = path.join(tempRoot, "src/content/posts");
const videoDir = path.join(tempRoot, "src/content/video");
fs.mkdirSync(postsDir, { recursive: true });
fs.mkdirSync(videoDir, { recursive: true });
// check-pagination.mjs reads these two files of the project it is pointed at.
fs.mkdirSync(path.join(tempRoot, "src/lib"), { recursive: true });
fs.copyFileSync(
  path.join(projectRoot, "src/config.ts"),
  path.join(tempRoot, "src/config.ts"),
);
fs.copyFileSync(
  path.join(projectRoot, "src/lib/date.ts"),
  path.join(tempRoot, "src/lib/date.ts"),
);
// Added 2026-10-10 (T162): the three pagination numbers are read from src/lib/pagination.ts now.
fs.copyFileSync(
  path.join(projectRoot, "src/lib/pagination.ts"),
  path.join(tempRoot, "src/lib/pagination.ts"),
);

let passed = false;
let created = false;
let pool;
let server;
try {
  const generated =
    plan === "pagination"
      ? generatePaginationPlan(postsDir)
      : generateSpreadPlan(postsDir);
  console.log(`generated ${generated} posts (plan "${plan}") in ${tempRoot}`);

  await createDatabase();
  created = true;
  console.log(`database ${dbName} created`);

  const { migrate } = await import(
    pathToFileURL(path.join(serverDist, "db/migrate.js")).href
  );
  const { createPool } = await import(
    pathToFileURL(path.join(serverDist, "db/pool.js")).href
  );
  const { importContent } = await import(
    pathToFileURL(path.join(serverDist, "cli/import-content.js")).href
  );
  const { createApp } = await import(
    pathToFileURL(path.join(serverDist, "http/app.js")).href
  );
  const { loadSite } = await import(
    pathToFileURL(path.join(serverDist, "http/site.js")).href
  );

  const migrationClient = new pg.Client({
    connectionString: stressUrl.toString(),
  });
  await migrationClient.connect();
  await migrate(migrationClient);
  await migrationClient.end();

  pool = createPool(stressUrl.toString());
  const t0 = performance.now();
  const report = await importContent(pool, { postsDir, videoDir });
  console.log(
    `imported: ${report.posts.created} posts in ${((performance.now() - t0) / 1000).toFixed(1)} s`,
  );

  const site = await loadSite(projectRoot);
  if (!site) throw new Error("the site is not built; run npm run build first");

  // A free port: listen on 0 and let the system choose, then tell the site's api client where the backend is.
  const app = createApp({
    pool,
    siteOrigin: "http://127.0.0.1:0",
    site,
  });
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  process.env.BACKEND_ORIGIN = origin;
  console.log(`site on ${origin}`);

  // The years that have posts, newest first, for the measuring targets.
  const years = [
    ...new Set(
      fs
        .readdirSync(postsDir)
        .map(
          (f) =>
            fs
              .readFileSync(path.join(postsDir, f), "utf8")
              .match(/^date: "(\d{4})/m)?.[1],
        )
        .filter(Boolean),
    ),
  ].sort((a, b) => Number(b) - Number(a));

  await measure(
    origin,
    years,
    plan === "pagination" ? "stress" : "tag-00",
    plan === "pagination" ? "stress" : "category-0",
  );

  if (check) {
    console.log("\nrunning scripts/check-pagination.mjs against it ...");
    // Asynchronous on purpose: the site runs in this very process, and a blocking spawn would stop it from answering.
    const status = await new Promise((resolve) => {
      const child = spawn(
        process.execPath,
        [path.join(projectRoot, "scripts/check-pagination.mjs")],
        {
          stdio: "inherit",
          env: { ...process.env, CHECK_ORIGIN: origin, CHECK_ROOT: tempRoot },
        },
      );
      child.on("exit", (code) => resolve(code));
    });
    if (status !== 0) throw new Error("the pagination check failed");
  }
  passed = true;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (pool) await pool.end();
  if (passed && flag("--keep")) {
    // Asked for with --keep: the database stays for hand-made queries; dropping it is the caller's job.
    console.log(`
kept on request: database ${dbName}, folder ${tempRoot}`);
  } else if (passed) {
    // Only what this run created: its own database and its own temporary folder.
    if (created) await dropDatabase();
    fs.rmSync(tempRoot, { recursive: true });
    console.log("\nthrowaway database dropped, temporary folder removed");
  } else {
    console.log(
      `\nkept for inspection: database ${created ? dbName : "(not created)"}, folder ${tempRoot}`,
    );
  }
}
process.exit(passed ? 0 : 1);
