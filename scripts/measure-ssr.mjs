// Measures one page's worth of data access two ways (T015 of specs/001-self-hosted-club-site).
//
// The question (research.md section 2, plan phase 0): should a page read its data from the backend in process
// (a direct function call over the pool) or through the backend's HTTP API on the loopback address? Pages will make
// one call each either way; this prints what each costs so the choice is a measurement.
//
// What it measures and what it does not: the same query (a list of 24 rows shaped like post cards) is run N times
// through the pool directly and N times through a local HTTP server that runs it and answers JSON, with the same
// pool. It is data access only. Astro's own rendering is not part of the comparison, because the site is not yet
// rendered on demand (phase 1); that time is the same for both options.
//
// Run:  npm run server:build && node --env-file=.env scripts/measure-ssr.mjs [iterations]
// Needs DATABASE_URL (the development database) and the compiled server in server/dist.

import { createServer } from "node:http";
import { performance } from "node:perf_hooks";
import { createPool } from "../server/dist/server/src/db/pool.js";

const iterations = Number(process.argv[2] ?? 300);
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    "DATABASE_URL is not set. Start the development database and use --env-file=.env.",
  );
  process.exit(1);
}

const sql = `select i as id, md5(i::text) as slug, repeat('x', 200) as summary, now() as published_at
             from generate_series(1, 24) as i`;
const pool = createPool(databaseUrl);

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (p) =>
    sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return { median: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1] };
}
const fmt = (n) => n.toFixed(2).padStart(7) + " ms";

const server = createServer(async (_req, res) => {
  const { rows } = await pool.query(sql);
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(rows));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/`;

try {
  // Warm both paths: first connection, first plan, first socket.
  for (let i = 0; i < 20; i++) {
    await pool.query(sql);
    await (await fetch(url)).json();
  }

  const direct = [];
  for (let i = 0; i < iterations; i++) {
    const t = performance.now();
    await pool.query(sql);
    direct.push(performance.now() - t);
  }

  const http = [];
  for (let i = 0; i < iterations; i++) {
    const t = performance.now();
    await (await fetch(url)).json();
    http.push(performance.now() - t);
  }

  const a = stats(direct);
  const b = stats(http);
  console.log(
    `Data access for one 24-row list, ${iterations} iterations each (Node ${process.version})`,
  );
  console.log(
    `  in process      median ${fmt(a.median)}   p95 ${fmt(a.p95)}   max ${fmt(a.max)}`,
  );
  console.log(
    `  loopback HTTP   median ${fmt(b.median)}   p95 ${fmt(b.p95)}   max ${fmt(b.max)}`,
  );
  console.log(
    `  difference      median ${fmt(b.median - a.median)}   p95 ${fmt(b.p95 - a.p95)}`,
  );
} finally {
  server.close();
  await pool.end();
}
