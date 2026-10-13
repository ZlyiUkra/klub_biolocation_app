// Browser checks of the interface languages, driven through the DevTools protocol of headless Edge (T176 of
// specs/001-self-hosted-club-site; user story 11, FR-043 to FR-046, SC-013).
//
// Written first, on 2026-10-12, and expected to FAIL until T177 carries the mechanism over from the current site
// (`klub_biolocation_astro`, branch `refactor-app`, `I18N.md`) and T178 puts the interface strings of plan phases 1
// to 5 into both languages. What a failing run shows is the work left; nothing here is to be loosened to make it pass.
//
// Run: npm run check:lang (builds the site and the backend first, then runs this with `--env-file=.env` and Node's
// --experimental-websocket flag, which is for this script's own protocol connection). Needs the development database
// (compose.dev.yml) and Microsoft Edge at the path below. Port 4389 must be free (check:auth uses 4388, so the two can be run one after the other without waiting); the
// protocol port is chosen at run time.
//
// The contract it checks is the one of the current site's I18N.md, and nothing else of its design:
// - the choice is `localStorage["kb-lang"]`, `en` or `ru`; with nothing stored the interface is English;
// - Russian puts the class `lang-ru` on <html> before the body exists (no flash of English);
// - a switch with `[data-lang-toggle]` changes the page in place: no reload, a half-filled form keeps its text;
// - a reload, another page and a second tab follow the choice; the second tab follows a switch made in the first
//   (the `storage` event reaches the other documents of the origin, not the one that wrote - MDN, Window: storage
//   event);
// - choosing English again stores `en`, it does not clear the key (the owner's word of 2026-10-12);
// - a refusal of a sign-in is told in the chosen language.
//
// Decisions that would otherwise look like mistakes:
// - It starts its OWN server (the real built site behind the real backend) on port 4389 with a throwaway database and
//   drops it at the end, like check:auth. The owner's running application and its accounts are never touched.
// - The scan reads what a visitor sees, not the markup: every text node whose element is visible
//   (`checkVisibility()`, which counts `display: none` on any ancestor, so the hidden span of the other language is
//   skipped; the same rule `innerText` applies - MDN, HTMLElement: innerText) plus the `aria-label`, `title` and
//   `placeholder` of visible elements. `textContent` would read both languages at once and always pass.
// - What is CONTENT is exempt, by the markup of today: the article and About bodies (`.prose`), the card titles
//   (`h3`), the card summaries (`.line-clamp-2`), the tag chips, the links to an entry, a tag or a category by name,
//   the `h1` of an entry, a tag or a category page, the category names of the Categories page and of the search
//   facets, and a member's name and address on the users page. Content is not translated (FR-045). If the markup of
//   those moves, this list moves with it; a new place for content needs a line here and a reason.
//   Added 2026-10-12 (T099), on the posts page of the panel: a post's address and title in its row (`[data-slug]`,
//   `[data-title]`) and the tags and categories offered under the form's fields (`[data-terms-for]`) are content.
// - The language switch's own label is exempt: it names the other language in that language's own script ("Switch
//   to Russian (Русский)"), so that a reader who cannot read the page can still find it.
// - English mode fails on any Cyrillic letter outside content. Russian mode fails on any Latin word of three letters
//   or more outside content, after e-mail addresses and addresses are removed, except the names on `allowedLatin`.
//   That is stricter than a list of English interface words, on purpose: a word nobody listed is still found.
// - The test accounts use Latin display names, so a member's name on the account page is not read as Russian text.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PORT = 4389;
// Changed 2026-10-12 (T099): the protocol port is a free one asked of the system, no longer 9334. Windows reserves
// ranges of ports for Hyper-V, WSL and Docker (`netsh interface ipv4 show excludedportrange protocol=tcp`; 9294-9393
// on the owner's machine, which holds both 9333 and 9334), and a browser asked to listen inside one starts without
// saying a word and without a debugging port: "undefined.webSocketDebuggerUrl" was all the script could tell.
const CDP_PORT = await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});
const BASE = `http://127.0.0.1:${PORT}`;
const EDGE =
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const root = fileURLToPath(new URL("../", import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const imports = (path) => import(pathToFileURL(join(root, path)).href);

const { createTestDatabase } = await imports(
  "server/dist/server/test/helpers/db.js",
);
const { importContent } = await imports(
  "server/dist/server/src/cli/import-content.js",
);
const { hashPassword } = await imports(
  "server/dist/server/src/auth/password.js",
);

const setupCode = "check-lang-setup-code-0123456789abcdef";
const failures = [];
let passed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ok    ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? " - " + detail : ""}`);
  }
}

const password = "correct horse battery";
const agent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0";
let counter = 0;
const nextIp = () => `198.51.100.${(counter++ % 240) + 1}`;

// One JSON call to the backend with its own address; returns the status, the body and the session cookie it set.
async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "content-type": "application/json",
      origin: BASE,
      "x-forwarded-for": nextIp(),
      "user-agent": agent,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const line = res.headers
    .getSetCookie()
    .find((c) => c.startsWith("__Host-session="));
  return {
    status: res.status,
    body: await res.json().catch(() => ({})),
    cookie: line ? line.split(";")[0].slice("__Host-session=".length) : null,
  };
}

// Names that may stand in Russian text: the site's own name.
// Names that may stand in Russian text: the site's own name, the names of the services and the theme the footer
// credits, and the placeholder of a code's format ("XXXX-XXXX").
const allowedLatin = new Set([
  "radiesthesia",
  "club",
  "github",
  "telegram",
  "hugo",
  "theme",
  "void",
  "xxxx",
  // Added 2026-10-12 (T175): the video hosts named in the list of the videos page ("VK" is too short to be scanned).
  "youtube",
  "rutube",
  "vimeo",
]);

// Runs in the page. Returns the visible interface text, one string per text node or attribute, content left out.
const scanSource = `(() => {
  const exempt =
    ".prose, h3, .line-clamp-2, .tag-chip, [data-lang-toggle], [data-name], [data-email], .category-toggle, [data-slug], [data-title], [data-terms-for]";
  const slug = /^\\/(posts|video|tags|categories)\\/[^/]+\\/$/;
  const year = /^\\/(posts|video)\\/\\d{4}\\/$/;
  const contentLink = (a) => {
    const h = a.getAttribute("href") || "";
    return slug.test(h) && !year.test(h);
  };
  const path = location.pathname;
  const headingIsContent = slug.test(path) && !year.test(path);
  const out = [];
  const skip = (el) =>
    !el ||
    el.closest("script, style, noscript, template") ||
    !el.checkVisibility() ||
    el.closest(exempt) ||
    el
      .closest("label")
      ?.querySelector('input[data-facet="category"], input[data-facet="tag"]') ||
    (el.closest("a") && contentLink(el.closest("a"))) ||
    (headingIsContent && el.closest("h1")) ||
    (path === "/about/" && el.closest("main") && !el.closest("h1"));
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode()); ) {
    const text = n.nodeValue.replace(/\\s+/g, " ").trim();
    if (text && !skip(n.parentElement)) out.push(text);
  }
  for (const el of document.querySelectorAll("[aria-label], [title], [placeholder]")) {
    if (skip(el)) continue;
    for (const name of ["aria-label", "title", "placeholder"]) {
      const v = (el.getAttribute(name) || "").trim();
      if (v) out.push(v);
    }
  }
  return out;
})()`;

const cyrillic = /[\u0400-\u04FF]/;
function latinWords(texts) {
  const words = [];
  for (const t of texts) {
    const clean = t
      .replace(/[\w.+-]+@[\w.-]+/g, " ")
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/\/[\w./-]*/g, " ");
    for (const w of clean.match(/[A-Za-z]{3,}/g) ?? []) {
      if (!allowedLatin.has(w.toLowerCase())) words.push(t);
    }
  }
  return [...new Set(words)];
}
const sample = (list) =>
  list
    .slice(0, 4)
    .map((s) => JSON.stringify(s.slice(0, 60)))
    .join(", ") + (list.length > 4 ? `, +${list.length - 4} more` : "");

// ---- the server and the database ----
const db = await createTestDatabase();
await importContent(db.pool, {
  postsDir: join(root, "src/content/posts/"),
  videoDir: join(root, "src/content/video/"),
});
const server = spawn(
  process.execPath,
  [join(root, "server/dist/server/src/main.js")],
  {
    cwd: root,
    env: {
      ...process.env,
      DATABASE_URL: db.url,
      PORT: String(PORT),
      SITE_ORIGIN: BASE,
      SETUP_CODE: setupCode,
    },
    stdio: "ignore",
  },
);
let edge;
// Added 2026-10-12 (T099, the owner's rule: a check removes what it made - the browser's profile folder is 60 to 120 MB and
// 89 of them had piled up in the temp folder).
let profileDir;
const sockets = [];
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE + "/healthz")).ok) break;
    } catch {}
    await sleep(500);
  }

  // ---- the accounts and the entries the pages are taken from ----
  const member = await api("POST", "/api/auth/signup", {
    email: "member@example.test",
    password,
    displayName: "Member Person",
    login: "member.p",
    // Added 2026-10-13 (T188): sign-up wants the time its form was opened; ten seconds ago is a person at a keyboard.
    startedAt: Date.now() - 10_000,
  });
  await db.pool.query(
    `insert into users (email, login, display_name, password_hash, status)
     values ('admin@example.test', 'admin.p', 'Admin Person', $1, 'admin')`,
    [await hashPassword(password)],
  );
  const admin = await api("POST", "/api/auth/signin", {
    identifier: "admin.p",
    password,
  });
  // The entries are found the way a visitor finds them, on the list page: only server/src/access reads the content
  // tables (server/test/access-boundary.test.ts also scans scripts/). The write below is allowed.
  const slugsOf = async (section) => {
    const html = await (await fetch(`${BASE}/${section}/`)).text();
    const found = [];
    for (const m of html.matchAll(
      new RegExp(`href="/${section}/([^/"]+)/"`, "g"),
    )) {
      if (!/^d{4}$/.test(m[1]) && !found.includes(m[1])) found.push(m[1]);
    }
    return found;
  };
  const posts = await slugsOf("posts");
  const postSlug = posts[0];
  const lockedSlug = posts[1];
  const videoSlug = (await slugsOf("video"))[0];
  await db.pool.query(
    `update entries set audience = 'members', teaser = true where kind = 'post' and slug = $1`,
    [lockedSlug],
  );
  check(
    "the accounts exist",
    member.cookie !== null && admin.cookie !== null,
    `member ${member.status}, admin ${admin.status}`,
  );

  // ---- the browser ----
  const profile = mkdtempSync(join(tmpdir(), "edge-lang-"));
  profileDir = profile;
  edge = spawn(
    EDGE,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      `--user-data-dir=${profile}`,
      `--remote-debugging-port=${CDP_PORT}`,
      "--window-size=1100,900",
      "--hide-scrollbars",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  const targets = async () => {
    for (let i = 0; i < 40; i++) {
      try {
        // Changed 2026-10-12 (T099): the list can be served a moment before the first page target exists (seen on a
        // busy machine: "undefined.webSocketDebuggerUrl"), so wait until there is a page in it.
        const found = await (
          await fetch(`http://127.0.0.1:${CDP_PORT}/json`)
        ).json();
        if (found.some((t) => t.type === "page")) return found;
      } catch {}
      await sleep(500);
    }
    return [];
  };
  // One tab: its protocol connection and the helpers that drive it.
  async function openTab(wsUrl) {
    const ws = new WebSocket(wsUrl);
    sockets.push(ws);
    await new Promise((r) => ws.addEventListener("open", r));
    let id = 0;
    const pending = new Map();
    const inflight = new Set();
    const listeners = [];
    ws.addEventListener("message", (m) => {
      const d = JSON.parse(m.data);
      for (const listener of listeners) listener(d);
      if (d.id && pending.has(d.id)) {
        pending.get(d.id)(d);
        pending.delete(d.id);
      }
      if (
        d.method === "Network.requestWillBeSent" &&
        d.params.request.url.includes("/api/")
      ) {
        inflight.add(d.params.requestId);
      } else if (
        d.method === "Network.loadingFinished" ||
        d.method === "Network.loadingFailed"
      ) {
        inflight.delete(d.params.requestId);
      }
    });
    const cdp = (method, params = {}) =>
      new Promise((resolve) => {
        const n = ++id;
        pending.set(n, resolve);
        ws.send(JSON.stringify({ id: n, method, params }));
      });
    await cdp("Page.enable");
    await cdp("Network.enable");
    // The class is read the moment the body is first inserted: it has to be there before the body exists.
    await cdp("Page.addScriptToEvaluateOnNewDocument", {
      source: `(() => {
        const o = new MutationObserver(() => {
          if (document.body && window.__langAtBody === undefined) {
            window.__langAtBody = document.documentElement.classList.contains("lang-ru");
            o.disconnect();
          }
        });
        o.observe(document, { childList: true, subtree: true });
      })()`,
    });
    const js = async (expression) =>
      (
        await cdp("Runtime.evaluate", {
          expression,
          awaitPromise: true,
          returnByValue: true,
        })
      ).result?.result?.value;
    const waitLoaded = async (path) => {
      for (let i = 0; i < 100; i++) {
        await sleep(100);
        if (
          (await js("document.readyState")) === "complete" &&
          (await js("location.pathname")) === new URL(BASE + path).pathname
        ) {
          break;
        }
      }
      await sleep(400);
    };
    // Opens a page with the given session and the given stored language (null: nothing stored).
    const go = async (path, { cookie = null, lang = null } = {}) => {
      await cdp("Network.clearBrowserCookies");
      if (cookie) {
        await cdp("Network.setCookie", {
          name: "__Host-session",
          value: cookie,
          url: BASE + "/",
          path: "/",
          secure: true,
          httpOnly: true,
        });
      }
      await cdp("Page.navigate", { url: BASE + "/robots.txt" });
      await sleep(250);
      await js(
        lang === null
          ? `localStorage.removeItem("kb-lang")`
          : `localStorage.setItem("kb-lang", ${JSON.stringify(lang)})`,
      );
      await cdp("Page.navigate", { url: BASE + path });
      await waitLoaded(path);
    };
    const navigate = async (path) => {
      await cdp("Page.navigate", { url: BASE + path });
      await waitLoaded(path);
    };
    const reload = async () => {
      const path = await js("location.pathname + location.search");
      await cdp("Page.reload");
      await waitLoaded(path);
    };
    const fill = (sel, v) =>
      js(
        `(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.value=${JSON.stringify(v)};e.dispatchEvent(new Event("input",{bubbles:true}))})()`,
      );
    const click = async (sel) => {
      const found = await js(
        `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return false;e.click();return true})()`,
      );
      await sleep(150);
      const end = Date.now() + 15000;
      let quiet = 0;
      while (Date.now() < end) {
        quiet = inflight.size === 0 ? quiet + 50 : 0;
        if (quiet >= 250) break;
        await sleep(50);
      }
      return found;
    };
    // Added 2026-10-12 (T179): a listener for the protocol's events, for the check that answers a request itself.
    const on = (listener) => listeners.push(listener);
    return { cdp, js, go, navigate, reload, fill, click, on };
  }

  const first = await targets();
  const tab = await openTab(
    first.find((t) => t.type === "page").webSocketDebuggerUrl,
  );
  const { js } = tab;
  const state = () =>
    js(`({
      ru: document.documentElement.classList.contains("lang-ru"),
      atBody: window.__langAtBody,
      stored: localStorage.getItem("kb-lang"),
      header: document.querySelector("header")?.innerText ?? "",
    })`);

  // ---- 1. the default, and what a visitor sees on each type of page ----
  console.log("Every type of page, nothing stored: English");
  const pages = [
    ["home", "/", null],
    ["post list", "/posts/", null],
    ["post", `/posts/${postSlug}/`, null],
    ["locked post (teaser, guest)", `/posts/${lockedSlug}/`, null],
    ["video list", "/video/", null],
    ["video", `/video/${videoSlug}/`, null],
    ["tags", "/tags/", null],
    ["categories", "/categories/", null],
    ["search", "/search/", null],
    ["about", "/about/", null],
    ["sign-in", "/auth/signin/", null],
    ["sign-up", "/auth/signup/", null],
    ["recover", "/auth/recover/", null],
    ["account", "/auth/account/", member.cookie],
    ["admin posts", "/admin/posts/", admin.cookie],
    // Added 2026-10-12 (T175): the videos page of the panel, in both languages like the others.
    ["admin videos", "/admin/videos/", admin.cookie],
    ["admin users", "/admin/users/", admin.cookie],
    // Added 2026-10-13 (T107): the messages of the feedback form, in both languages like the others.
    ["admin feedback", "/admin/feedback/", admin.cookie],
    ["not found", "/no-such-page/", null],
  ];
  for (const [name, path, cookie] of pages) {
    await tab.go(path, { cookie, lang: null });
    const s = await state();
    const texts = (await js(scanSource)) ?? [];
    const bad = texts.filter((t) => cyrillic.test(t));
    check(
      `${name}: English, no Russian interface text (${texts.length} strings read)`,
      !s.ru && s.stored === null && bad.length === 0 && texts.length > 0,
      `lang-ru=${s.ru} stored=${s.stored}; ${sample(bad)}`,
    );
  }

  console.log("Every type of page, Russian chosen");
  for (const [name, path, cookie] of pages) {
    await tab.go(path, { cookie, lang: "ru" });
    const s = await state();
    const texts = (await js(scanSource)) ?? [];
    const bad = latinWords(texts);
    check(
      `${name}: Russian, no English interface text (${texts.length} strings read)`,
      s.ru && s.atBody === true && bad.length === 0 && texts.length > 0,
      `lang-ru=${s.ru} atBody=${s.atBody}; ${sample(bad)}`,
    );
  }

  // ---- 2. the switch ----
  console.log("The switch");
  await tab.go("/about/", { lang: null });
  let s = await state();
  check(
    "nothing stored: English, the class is not set before the body",
    !s.ru && s.atBody === false && /Posts/.test(s.header),
    JSON.stringify(s).slice(0, 160),
  );
  await js(`window.__keep = 1`);
  const pressed = await tab.click("[data-lang-toggle]");
  await sleep(300);
  s = await state();
  check(
    "the switch turns the page Russian in place, with no reload",
    pressed &&
      s.ru &&
      s.stored === "ru" &&
      (await js("window.__keep")) === 1 &&
      !/Posts/.test(s.header),
    `pressed=${pressed} ${JSON.stringify(s).slice(0, 160)}`,
  );

  await tab.go("/auth/signin/", { lang: null });
  await tab.fill("#signin-identifier", "half.filled");
  await tab.click("[data-lang-toggle]");
  await sleep(300);
  check(
    "a half-filled form keeps its text across a switch",
    (await js(`document.querySelector("#signin-identifier")?.value`)) ===
      "half.filled" && (await state()).ru,
  );

  await tab.go("/posts/", { lang: "ru" });
  await tab.reload();
  s = await state();
  check(
    "a reload keeps Russian, the class set before the body exists",
    s.ru && s.atBody === true,
    JSON.stringify(s).slice(0, 160),
  );
  await tab.navigate("/about/");
  s = await state();
  check(
    "another page keeps Russian, the class set before the body exists",
    s.ru && s.atBody === true && !/Posts/.test(s.header),
    JSON.stringify(s).slice(0, 160),
  );

  // A second tab follows a switch made in the first, through the storage event.
  const second = await (
    await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, {
      method: "PUT",
    })
  ).json();
  const tab2 = await openTab(second.webSocketDebuggerUrl);
  await tab2.navigate("/about/");
  const secondWasRussian = await tab2.js(
    `document.documentElement.classList.contains("lang-ru")`,
  );
  check("a second tab opens in Russian", secondWasRussian === true);
  await tab.click("[data-lang-toggle]");
  await sleep(500);
  s = await state();
  check(
    "choosing English stores `en` and the page turns English",
    s.stored === "en" && !s.ru && /Posts/.test(s.header),
    JSON.stringify(s).slice(0, 160),
  );
  check(
    "the second tab follows the switch of the first",
    // A second tab that never was Russian cannot prove that it followed: it would be English anyway.
    secondWasRussian === true &&
      (await tab2.js(
        `!document.documentElement.classList.contains("lang-ru") && /Posts/.test(document.querySelector("header")?.innerText ?? "")`,
      )) === true,
  );
  await tab.navigate("/posts/");
  s = await state();
  check(
    "an explicit English choice survives a new page",
    !s.ru && s.stored === "en",
    JSON.stringify(s).slice(0, 160),
  );

  // ---- 3. a refused sign-in in the chosen language ----
  console.log("A refused sign-in");
  for (const lang of ["en", "ru"]) {
    await tab.go("/auth/signin/", { lang });
    await tab.fill("#signin-identifier", "nobody@example.test");
    await tab.fill("#signin-password", "not the password");
    await tab.click("#signin-submit");
    await sleep(600);
    const message = (
      (await js(`document.querySelector("#signin-message")?.innerText`)) ?? ""
    ).trim();
    const ok =
      message.length > 0 &&
      (lang === "ru"
        ? cyrillic.test(message) && latinWords([message]).length === 0
        : !cyrillic.test(message));
    check(
      `${lang === "ru" ? "Russian" : "English"}: the refusal is in that language`,
      ok,
      JSON.stringify(message.slice(0, 80)),
    );
  }

  // ---- 4. a refusal known only by its code (T179) ----
  // The browser answers the sign-in request itself with a 503 and the code `unavailable`: the page has no sentence of its
  // own for it, so it says what src/i18n/errors.ts says for the code, in the language shown, and never the server's
  // English `message`.
  console.log("A refusal told by its code");
  tab.on((d) => {
    if (d.method !== "Fetch.requestPaused") return;
    void tab.cdp("Fetch.fulfillRequest", {
      requestId: d.params.requestId,
      responseCode: 503,
      responseHeaders: [{ name: "Content-Type", value: "application/json" }],
      body: Buffer.from(
        JSON.stringify({
          error: "unavailable",
          message: "Backend says: unavailable (English, for logs)",
        }),
      ).toString("base64"),
    });
  });
  await tab.cdp("Fetch.enable", {
    patterns: [{ urlPattern: "*/api/auth/signin*" }],
  });
  for (const [lang, expected] of [
    ["en", "The service is not available now"],
    ["ru", "Сервис сейчас недоступен"],
  ]) {
    await tab.go("/auth/signin/", { lang });
    await tab.fill("#signin-identifier", "someone@example.test");
    await tab.fill("#signin-password", "some password");
    await tab.click("#signin-submit");
    await sleep(600);
    const message = (
      (await js(`document.querySelector("#signin-message")?.innerText`)) ?? ""
    ).trim();
    check(
      `${lang === "ru" ? "Russian" : "English"}: an \`unavailable\` answer is told in that language, not in the server's words`,
      message.includes(expected) && !message.includes("Backend says"),
      JSON.stringify(message.slice(0, 90)),
    );
  }
  await tab.cdp("Fetch.disable");
} finally {
  for (const ws of sockets) {
    try {
      ws.close();
    } catch {}
  }
  edge?.kill();
  server.kill();
  await sleep(800);
  await db.drop();
  // The browser holds its files for a moment after it is told to stop, so the removal retries.
  if (profileDir !== undefined) {
    rmSync(profileDir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 300,
    });
  }
}

console.log(
  `\ncheck:lang: ${passed} passed, ${failures.length} failed${
    failures.length ? ": " + failures.join("; ") : ""
  }`,
);
process.exit(failures.length === 0 ? 0 : 1);
