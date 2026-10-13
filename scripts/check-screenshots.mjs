// Visual parity of the page types, light and dark, old build against the running new server (task T134 of
// specs/001-self-hosted-club-site, success criterion SC-002; `npm run check:screenshots`).
//
// What it does:
//   1. serves the old build (`--old-dist`, a folder built from commit 495e959 by check-markup.mjs since T180) and a pass-through
//      to the new server (`--origin`) on spare ports, four listeners in all: old/new x light/dark. Each one injects a
//      script at the top of every HTML page that stores the theme in localStorage before the page's own theme code
//      runs, which is how CLAUDE.md ("Visual check") forces light mode: `--blink-settings=preferredColorScheme` does
//      not work;
//   2. takes a screenshot of every page type with headless Edge, at 1280 pixels wide, after warming the browser
//      profile (the carousel's JPEGs are progressive, so a cold first capture decodes a different scan);
//   3. decodes both PNGs here (no dependency: node:zlib and the PNG filters) and measures the difference: the number
//      of pixels that differ, the largest difference in a channel, and the share of the page that differs;
//   4. writes an HTML page that shows the pairs side by side, with the numbers, next to the images.
//
// A pair is "identical" when no pixel differs; "residual" otherwise, with the numbers. Whether a residual is accepted is
// the owner's call and is recorded in REWRITE.md; a residual that is not already a recorded, accepted one is a defect.
//
// Changed 2026-10-12 (T180): every page is taken in both interface languages as well as both themes, so each page type
// gives four pairs. The language is the choice the site stores itself, localStorage["kb-lang"] ("en" or "ru"), written
// by the same injected script as the theme before the page's own code runs; the old build is the one with the
// languages, its commit 495e959 (check-markup.mjs, the same reference). The pass of the old application and of this one
// must be compared in the same language, or a pair says nothing: that is why a listener exists for each of the four
// combinations of theme and language, on each side - eight in all.
//
// Usage:  node scripts/check-screenshots.mjs --old-dist <dir> [--origin http://127.0.0.1:3000] [--out <dir>]
//                                            [--width 1280] [--height 1800] [--langs en,ru] [--only home,post]
// Exit code 0 when every pair is identical, 1 otherwise (the report is written either way).

import { spawn } from "node:child_process";
import fs from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : args[at + 1];
};

// Resolved, so that the containment check of serveOld() compares like with like (a mixed-slash argument did not).
const oldDistArgument = option("--old-dist");
const oldDist = oldDistArgument ? path.resolve(oldDistArgument) : undefined;
if (!oldDist) {
  console.error(
    "Give --old-dist <the old build's dist folder>; see the header.",
  );
  process.exit(2);
}
const origin = option(
  "--origin",
  process.env.CHECK_ORIGIN ?? "http://127.0.0.1:3000",
).replace(/\/$/, "");
// Added 2026-10-12 (T180): the languages the pages are taken in.
const langs = option("--langs", "en,ru").split(",");
const width = Number(option("--width", "1280"));
const height = Number(option("--height", "1800"));
const outDir = path.resolve(
  option(
    "--out",
    path.join(os.tmpdir(), `klub-screenshots-${Date.now().toString(36)}`),
  ),
);
const edge =
  process.env.EDGE_PATH ??
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
if (!fs.existsSync(edge)) {
  console.error(`Edge not found at ${edge}; set EDGE_PATH.`);
  process.exit(2);
}

// ---------------------------------------------------------------------------------------------
// The pages: one of every type the site has.

const routes = fs
  .readFileSync(path.join(projectRoot, "reference/astro-routes.txt"), "utf8")
  .split(/\r?\n/)
  .filter(Boolean);

function frontMatterOf(file) {
  return (
    fs.readFileSync(file, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ??
    ""
  );
}
const videoDir = path.join(projectRoot, "src/content/video");
const videos = fs
  .readdirSync(videoDir)
  .filter((f) => f.endsWith(".md"))
  .map((f) => ({
    slug: f.slice(0, -3),
    paid: /^access:\s*paid\s*$/m.test(frontMatterOf(path.join(videoDir, f))),
  }));
const publicVideo = videos.find((v) => !v.paid)?.slug;
const paidVideo = videos.find((v) => v.paid)?.slug;
const years = routes
  .map((r) => r.match(/^\/posts\/(\d{4})\/$/)?.[1])
  .filter(Boolean)
  .sort()
  .reverse();
const firstPost = routes.find(
  (r) => /^\/posts\/[^/]+\/$/.test(r) && !/^\/posts\/\d{4}\/$/.test(r),
);
const page2 = routes.find((r) => /^\/posts\/\d{4}\/page\/2\/$/.test(r));
const firstTag = routes.find((r) => /^\/tags\/[^/]+\/$/.test(r));
const firstCategory = routes.find((r) => /^\/categories\/[^/]+\/$/.test(r));

// --only home,post limits the run to those page types.
const only = option("--only")?.split(",");
const pages = [
  ["home", "/"],
  ["about", "/about/"],
  ["posts", "/posts/"],
  ["posts-year", years[0] ? `/posts/${years[0]}/` : null],
  ["posts-year-page-2", page2 ?? null],
  ["post", firstPost ?? null],
  ["tags", "/tags/"],
  ["tag", firstTag ?? null],
  ["categories", "/categories/"],
  ["category", firstCategory ?? null],
  ["video-list", "/video/"],
  ["video-public", publicVideo ? `/video/${publicVideo}/` : null],
  ["video-paid", paidVideo ? `/video/${paidVideo}/` : null],
  ["search", "/search/"],
  ["sign-in", "/auth/signin/"],
  ["account", "/auth/account/"],
]
  .filter(([, address]) => address !== null)
  .filter(([label]) => !only || only.includes(label));

// ---------------------------------------------------------------------------------------------
// The four listeners.

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".xml": "application/xml",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain",
};

// Runs before the page's own theme code: the first element of <head>.
// Changed 2026-10-12 (T180): the stored language goes in beside the theme.
const injection = (theme, lang) =>
  `<script>try{localStorage.setItem("theme",${JSON.stringify(theme)});localStorage.setItem("kb-lang",${JSON.stringify(lang)})}catch(e){}</script>`;

function withTheme(html, theme, lang) {
  return html.replace(/<head[^>]*>/i, (tag) => tag + injection(theme, lang));
}

function serveOld(theme, lang) {
  return createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    let file = path.join(oldDist, decodeURIComponent(url.pathname));
    if (!file.startsWith(oldDist)) {
      res.statusCode = 403;
      return res.end();
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory())
      file = path.join(file, "index.html");
    let status = 200;
    if (!fs.existsSync(file)) {
      file = path.join(oldDist, "404.html");
      status = 404;
    }
    const type =
      types[path.extname(file).toLowerCase()] ?? "application/octet-stream";
    res.statusCode = status;
    res.setHeader("content-type", type);
    const body = fs.readFileSync(file);
    res.end(
      type.startsWith("text/html")
        ? withTheme(body.toString("utf8"), theme, lang)
        : body,
    );
  });
}

function serveNew(theme, lang) {
  return createServer(async (req, res) => {
    const response = await fetch(origin + req.url, { redirect: "manual" });
    const type =
      response.headers.get("content-type") ?? "application/octet-stream";
    res.statusCode = response.status;
    res.setHeader("content-type", type);
    const body = Buffer.from(await response.arrayBuffer());
    res.end(
      type.startsWith("text/html")
        ? withTheme(body.toString("utf8"), theme, lang)
        : body,
    );
  });
}

const listeners = {};
async function listen(name, server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  listeners[name] = { server, port: server.address().port };
}

// ---------------------------------------------------------------------------------------------
// PNG decoding: 8-bit, not interlaced, colour type 2 (RGB) or 6 (RGBA), which is what Edge writes.

function decodePng(buffer) {
  let at = 8;
  let w = 0;
  let h = 0;
  let channels = 0;
  const data = [];
  while (at < buffer.length) {
    const length = buffer.readUInt32BE(at);
    const kind = buffer.toString("latin1", at + 4, at + 8);
    const body = buffer.subarray(at + 8, at + 8 + length);
    if (kind === "IHDR") {
      w = body.readUInt32BE(0);
      h = body.readUInt32BE(4);
      const depth = body[8];
      const colour = body[9];
      if (depth !== 8 || body[12] !== 0 || (colour !== 2 && colour !== 6))
        throw new Error("unsupported PNG layout");
      channels = colour === 6 ? 4 : 3;
    } else if (kind === "IDAT") data.push(body);
    at += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(data));
  const stride = w * channels;
  const out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? out[y * stride + x - channels] : 0;
      const up = y > 0 ? out[(y - 1) * stride + x] : 0;
      const upLeft =
        y > 0 && x >= channels ? out[(y - 1) * stride + x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      out[y * stride + x] = value & 255;
    }
  }
  return { width: w, height: h, channels, pixels: out };
}

function compare(a, b) {
  if (a.width !== b.width || a.height !== b.height)
    return {
      sizeDiffers: true,
      a: [a.width, a.height],
      b: [b.width, b.height],
    };
  let differing = 0;
  let largest = 0;
  let box = null;
  const total = a.width * a.height;
  for (let p = 0; p < total; p++) {
    let worst = 0;
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(
        a.pixels[p * a.channels + c] - b.pixels[p * b.channels + c],
      );
      if (d > worst) worst = d;
    }
    if (worst > 0) {
      differing++;
      const x = p % a.width;
      const y = Math.floor(p / a.width);
      if (!box) box = [x, y, x, y];
      else {
        box[0] = Math.min(box[0], x);
        box[1] = Math.min(box[1], y);
        box[2] = Math.max(box[2], x);
        box[3] = Math.max(box[3], y);
      }
    }
    if (worst > largest) largest = worst;
  }
  return { differing, largest, total, box };
}

// ---------------------------------------------------------------------------------------------

// Asynchronous on purpose: the listeners run in this very process, and a blocking spawn would stop them from
// answering the browser, which then waits for its page until the timeout.
async function shoot(port, address, theme, file, profile) {
  const child = spawn(
    edge,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      `--user-data-dir=${profile}`,
      "--hide-scrollbars",
      `--window-size=${width},${height}`,
      `--screenshot=${file}`,
      "--virtual-time-budget=20000",
      `http://127.0.0.1:${port}${encodeURI(address)}`,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill();
      resolve();
    }, 120000);
    child.on("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  // The browser's first process may exit while its renderer is still writing the file, so the file is awaited: it must
  // exist and stop growing.
  let lastSize = -1;
  for (let waited = 0; waited < 30000; waited += 250) {
    if (fs.existsSync(file)) {
      const size = fs.statSync(file).size;
      if (size > 0 && size === lastSize) return;
      lastSize = size;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `no screenshot for ${address} (${theme}); the browser said:
${output.slice(-1500)}`,
  );
}

fs.mkdirSync(outDir, { recursive: true });
console.log(`output: ${outDir}`);
// Changed 2026-10-12 (T180): one listener for each side, theme and language.
for (const lang of langs) {
  for (const theme of ["light", "dark"]) {
    await listen(`old-${theme}-${lang}`, serveOld(theme, lang));
    await listen(`new-${theme}-${lang}`, serveNew(theme, lang));
  }
}

// Added 2026-10-12 (T180): the four combinations a page is taken in, in this order.
const variants = langs.flatMap((lang) =>
  ["light", "dark"].map((theme) => `${theme}-${lang}`),
);
const rows = [];
const notCaptured = [];
// Added 2026-10-12 (T099): declared outside the try so that the finally below can remove the profile folders.
const profiles = {};
try {
  // Warm one profile per listener with a throwaway capture, then reuse it for the real ones.
  for (const name of Object.keys(listeners)) {
    profiles[name] = fs.mkdtempSync(path.join(os.tmpdir(), "klub-edge-"));
    await shoot(
      listeners[name].port,
      "/",
      name,
      path.join(outDir, `warm-${name}.png`),
      profiles[name],
    );
    fs.rmSync(path.join(outDir, `warm-${name}.png`));
  }

  for (const [label, address] of pages) {
    // Changed 2026-10-12 (T180): "themes" became "variants", keyed `<theme>-<language>`.
    const row = { label, address, variants: {} };
    // A page that navigates away by itself (the account page of a guest goes to the sign-in page) never settles for
    // the screenshot; it is listed as not captured, not as a failure of the comparison.
    try {
      for (const variant of variants) {
        const [theme] = variant.split("-");
        const files = {};
        for (const side of ["old", "new"]) {
          const name = `${side}-${variant}`;
          files[side] = `${label}.${name}.png`;
          await shoot(
            listeners[name].port,
            address,
            theme,
            path.join(outDir, files[side]),
            profiles[name],
          );
        }
        const result = compare(
          decodePng(fs.readFileSync(path.join(outDir, files.old))),
          decodePng(fs.readFileSync(path.join(outDir, files.new))),
        );
        row.variants[variant] = { files, result };
        const text = result.sizeDiffers
          ? `size differs: ${result.a} against ${result.b}`
          : result.differing === 0
            ? "identical"
            : `${result.differing} of ${result.total} pixels differ (${((100 * result.differing) / result.total).toFixed(3)}%), largest channel difference ${result.largest}/255, in the box x ${result.box[0]}-${result.box[2]}, y ${result.box[1]}-${result.box[3]}`;
        console.log(`${label.padEnd(20)} ${variant.padEnd(8)} ${text}`);
      }
      rows.push(row);
    } catch (error) {
      const reason = String(error.message).split("\n")[0];
      notCaptured.push({ label, address, reason });
      console.log(`${label.padEnd(20)} not captured: ${reason}`);
    }
  }
} finally {
  for (const { server } of Object.values(listeners)) server.close();
  // Added 2026-10-12 (T099): the folders this run made, removed with it (each is about 20 MB).
  for (const dir of Object.values(profiles)) {
    fs.rmSync(dir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 300,
    });
  }
}

// ---------------------------------------------------------------------------------------------
// The report.

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const describe = (r) =>
  r.sizeDiffers
    ? `size differs: ${r.a.join("x")} against ${r.b.join("x")}`
    : r.differing === 0
      ? "identical"
      : `${r.differing} pixels differ (${((100 * r.differing) / r.total).toFixed(3)}%), largest ${r.largest}/255`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Visual parity, old build against new server</title>
<style>
  body { font: 14px/1.4 system-ui, sans-serif; margin: 16px; background: #fff; color: #111; }
  h2 { margin: 28px 0 4px; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
  figure { margin: 0; }
  figcaption { font-size: 12px; color: #444; }
  img { width: 100%; border: 1px solid #bbb; }
  .ok { color: #0a6b2d; } .bad { color: #a11; }
</style></head><body>
<h1>Visual parity: old build (left) against the new server (right)</h1>
<p>${width} pixels wide, light and dark, headless Edge. Images are in this folder.</p>
<ul>${notCaptured
  .map(
    (n) =>
      `<li>${esc(n.label)} (${esc(n.address)}): not captured, ${esc(n.reason)}</li>`,
  )
  .join("")}${rows
  .map((r) =>
    variants
      .map((t) => {
        const d = describe(r.variants[t].result);
        return `<li><a href="#${r.label}">${r.label}</a> ${t}: <span class="${d === "identical" ? "ok" : "bad"}">${esc(d)}</span></li>`;
      })
      .join(""),
  )
  .join("")}</ul>
${rows
  .map(
    (r) => `<h2 id="${r.label}">${r.label} <small>${esc(r.address)}</small></h2>
${variants
  .map(
    (t) => `<div class="pair">
<figure><img src="${r.variants[t].files.old}" alt=""><figcaption>old, ${t}</figcaption></figure>
<figure><img src="${r.variants[t].files.new}" alt=""><figcaption>new, ${t}: ${esc(describe(r.variants[t].result))}</figcaption></figure>
</div>`,
  )
  .join("\n")}`,
  )
  .join("\n")}
</body></html>
`;
const reportFile = path.join(outDir, "report.html");
fs.writeFileSync(reportFile, html);
console.log(`report: ${reportFile}`);

const allIdentical = rows.every((r) =>
  variants.every(
    (t) =>
      !r.variants[t].result.sizeDiffers && r.variants[t].result.differing === 0,
  ),
);
console.log(
  allIdentical
    ? "all pairs identical"
    : "some pairs differ: see the report and record the residuals in REWRITE.md",
);
process.exit(allIdentical ? 0 : 1);
