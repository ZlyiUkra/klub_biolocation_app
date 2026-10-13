// Browser checks of the site's own sign-in, driven through the DevTools protocol of headless Edge (T153 of
// specs/001-self-hosted-club-site; FR-012, FR-013, FR-016, FR-018a, G15 of parity-inventory.md).
//
// Rewritten on 2026-10-11 for the move off the previous sign-in provider: the Clerk checks, the demo account, the
// publishable key and `astro preview` are gone. The first version of this file dates from 2026-09-25 (server and
// protocol plumbing) and was rewritten for Clerk on 2026-09-26; nothing of those two versions is left on purpose.
//
// Run: npm run check:auth (builds the site and the backend first, then runs this with `--env-file=.env` and Node's
// --experimental-websocket flag, which is for this script's own protocol connection). Needs the development database
// (compose.dev.yml) and Microsoft Edge at the path below. Port 4388 must be free; the protocol port is chosen at run time (check-lang.mjs says why).
//
// What it does, and the decisions that would otherwise look like mistakes:
// - It starts its OWN server (the real built site behind the real backend) on port 4388 with a throwaway database,
//   and drops the database at the end. The owner's running application and its accounts are never touched (the owner
//   chose this variant, 2026-10-11).
// - "No provider code" is decided by CONTENT: every script, module and stylesheet a page loads, followed through the
//   imports between chunks, is searched for the provider's name. Since T167 (2026-10-12) the admin pages and a video page
//   are checked too, and the provider's name anywhere in what a page loads is a failure.
// - Every request that carries a session comes from its own address (X-Forwarded-For, trusted once), so the sign-up
//   and sign-in windows of one check never leak into another.
// - The first paint of the header is checked on the raw HTML, before any script could have run: the member's class
//   and address are in the first byte (T142), not put there by a script.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PORT = 4388;
// Changed 2026-10-12 (T099): the protocol port is a free one asked of the system, no longer 9333. Windows reserves
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

// Added 2026-10-11 (T169): the SETUP_CODE the server of this run is given; 24 characters or more or the server refuses it.
const setupCode = "check-auth-setup-code-0123456789abcdef";
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
const agents = [
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 OPR/115.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36",
];
let counter = 0;
const nextIp = () => `198.51.100.${(counter++ % 240) + 1}`;

// One JSON call to the backend with its own address; returns the status, the body and the session cookie it set.
async function api(method, path, body, cookie, userAgent) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "content-type": "application/json",
      origin: BASE,
      "x-forwarded-for": nextIp(),
      "user-agent":
        userAgent ??
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0",
      ...(cookie ? { cookie: `__Host-session=${cookie}` } : {}),
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

// A page of the site as a plain request: the HTML as sent, with no script run.
async function page(path, cookie) {
  const res = await fetch(BASE + path, {
    redirect: "manual",
    headers: cookie ? { cookie: `__Host-session=${cookie}` } : {},
  });
  return {
    status: res.status,
    location: res.headers.get("location"),
    cache: res.headers.get("cache-control"),
    html: await res.text(),
  };
}

const htmlClass = (html) => /<html[^>]*\sclass="([^"]*)"/.exec(html)?.[1] ?? "";
const authLink = (html) => {
  const tag = /<a id="auth-link"[^>]*>/.exec(html)?.[0] ?? "";
  return {
    href: /\shref="([^"]*)"/.exec(tag)?.[1],
    label: /\saria-label="([^"]*)"/.exec(tag)?.[1],
  };
};

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
      // Added 2026-10-11 (T169): the code of the setup door, so that the page can be driven below.
      SETUP_CODE: setupCode,
    },
    stdio: "ignore",
  },
);
let edge;
// Added 2026-10-12 (T099, the owner's rule: a check removes what it made - the browser's profile folder is 60 to 120 MB and
// 89 of them had piled up in the temp folder).
let profileDir;
let ws;
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE + "/healthz")).ok) break;
    } catch {}
    await sleep(500);
  }

  // ---- the accounts ----
  const member = await api("POST", "/api/auth/signup", {
    email: "anna@example.test",
    password,
    displayName: "Анна Петрова",
    login: "anna.p",
    // Added 2026-10-13 (T188): sign-up wants the time its form was opened; ten seconds ago is a person at a keyboard.
    startedAt: Date.now() - 10_000,
  });
  await db.pool.query(
    `insert into users (email, login, display_name) values ('holder@example.test', 'taken.one', 'Holder')`,
  );
  await db.pool.query(
    `insert into users (email, display_name, password_hash, must_change, password_expires_at)
     values ('temp@example.test', 'Борис', $1, true, now() + interval '30 days')`,
    [await hashPassword("temporary-pass")],
  );
  for (const email of ["wrong@example.test", "pause@example.test"]) {
    await db.pool.query(
      `insert into users (email, display_name, password_hash) values ($1, 'Тест', $2)`,
      [email, await hashPassword(password)],
    );
  }
  check(
    "sign-up gave a session",
    member.status === 201 && member.cookie !== null,
  );

  // ---- 1. the header in the first byte ----
  console.log("The header at first paint (raw HTML, no script run)");
  for (const path of ["/", "/about/", "/posts/", "/video/", "/search/"]) {
    const guest = await page(path);
    check(
      `guest ${path}: no member mark, sign-in address`,
      !htmlClass(guest.html).split(" ").includes("kb-member") &&
        authLink(guest.html).href === "/auth/signin/",
      `class="${htmlClass(guest.html)}" ${JSON.stringify(authLink(guest.html))}`,
    );
    const signed = await page(path, member.cookie);
    check(
      `member ${path}: member mark, account address and label`,
      htmlClass(signed.html).split(" ").includes("kb-member") &&
        authLink(signed.html).href === "/auth/account/" &&
        // Changed 2026-10-12 (T178): the first byte carries the default language, English (src/i18n/lang.ts).
        authLink(signed.html).label === "Account",
      `class="${htmlClass(signed.html)}" ${JSON.stringify(authLink(signed.html))}`,
    );
  }
  const dead = await page("/about/", "not-a-real-session-id");
  check(
    "a dead session cookie is a guest",
    !htmlClass(dead.html).split(" ").includes("kb-member"),
  );

  // ---- 2. who sees which /auth/ page ----
  console.log("Access to the /auth/ pages");
  const guestAccount = await page("/auth/account/");
  check(
    "guest: account page goes to sign-in, no-store",
    guestAccount.status === 302 &&
      guestAccount.location === "/auth/signin/" &&
      guestAccount.cache === "no-store",
  );
  check(
    "guest sees sign-in and sign-up",
    (await page("/auth/signin/")).status === 200 &&
      (await page("/auth/signup/")).status === 200,
  );
  const plain = await page("/auth/signin/", member.cookie);
  check(
    "member: sign-in goes to the account page",
    plain.status === 302 && plain.location === "/auth/account/",
  );
  const nextGood = await page(
    "/auth/signin/?next=%2Fvideo%2Fsome-lecture%2F%3Ft%3D90",
    member.cookie,
  );
  check(
    "member: sign-in follows a `next` of this site",
    nextGood.location === "/video/some-lecture/?t=90",
    String(nextGood.location),
  );
  let bad = true;
  for (const evil of [
    "https%3A%2F%2Fevil.example%2F",
    "%2F%5Cevil.example%2F",
    "%2Fauth%2Fsignin%2F",
  ]) {
    const r = await page(`/auth/signin/?next=${evil}`, member.cookie);
    if (r.location !== "/auth/account/") bad = false;
  }
  check(
    "member: another host, a backslash trick and the sign-in page itself fall back to the account page",
    bad,
  );

  // ---- the browser ----
  const profile = mkdtempSync(join(tmpdir(), "edge-auth-"));
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
  let wsUrl;
  for (let i = 0; i < 40 && !wsUrl; i++) {
    try {
      const list = await (
        await fetch(`http://127.0.0.1:${CDP_PORT}/json`)
      ).json();
      wsUrl = list.find((t) => t.type === "page")?.webSocketDebuggerUrl;
    } catch {}
    if (!wsUrl) await sleep(500);
  }
  ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) {
      pending.get(d.id)(d);
      pending.delete(d.id);
    }
    // Added 2026-10-11 (T071): the API requests in flight, so that a click can wait for its answer instead of a fixed
    // sleep. The fixed sleeps made the sign-in checks flaky when password hashing took longer than the sleep (found
    // when four runs of the same code gave 85, 76, 83 and 80 passes).
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
  const inflight = new Set();
  const cdp = (method, params = {}) =>
    new Promise((resolve) => {
      const n = ++id;
      pending.set(n, resolve);
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  await cdp("Page.enable");
  await cdp("Network.enable");
  const js = async (expression) =>
    (
      await cdp("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      })
    ).result?.result?.value;
  const go = async (path, cookie, theme = "light") => {
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
    await cdp("Page.navigate", { url: "about:blank" });
    await cdp("Page.navigate", { url: BASE + "/robots.txt" });
    await sleep(200);
    await js(`localStorage.setItem("theme", "${theme}")`);
    await cdp("Page.navigate", { url: BASE + path });
    // Changed 2026-10-11 (T071): wait for the document to be complete (module scripts have run by then) instead of a
    // fixed 1.5 s; a click that came before the page's script had attached its handler was a plain form submission
    // and made the sign-in checks flaky. The short sleep after it lets the scripts' first requests start.
    for (let i = 0; i < 100; i++) {
      await sleep(100);
      if (
        (await js("location.pathname + document.readyState")) !== undefined &&
        (await js("document.readyState")) === "complete" &&
        (await js("location.href")) !== "about:blank" &&
        (await js("location.pathname")) === new URL(BASE + path).pathname
      ) {
        break;
      }
    }
    await sleep(400);
  };
  const fill = (sel, v) =>
    js(
      `(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.value=${JSON.stringify(v)};e.dispatchEvent(new Event("input",{bubbles:true}))})()`,
    );
  // Changed 2026-10-11 (T071): after the click, wait until the API requests it started have been answered.
  const click = async (sel) => {
    const result = await js(
      `document.querySelector(${JSON.stringify(sel)}).click()`,
    );
    await sleep(120);
    const end = Date.now() + 15000;
    let quiet = 0;
    while (Date.now() < end) {
      if (inflight.size === 0) {
        quiet += 50;
        if (quiet >= 250) break;
      } else {
        quiet = 0;
      }
      await sleep(50);
    }
    return result;
  };
  const text = (sel) =>
    js(
      `(document.querySelector(${JSON.stringify(sel)})?.textContent ?? "").trim()`,
    );
  const where = () => js("location.pathname + location.search");
  const sessionCookie = async () =>
    (
      await cdp("Network.getCookies", { urls: [BASE + "/"] })
    ).result?.cookies?.find((c) => c.name === "__Host-session") ?? null;

  // ---- 3. the header in the browser, both themes ----
  console.log("The header in the browser");
  for (const theme of ["light", "dark"]) {
    await go("/about/", member.cookie, theme);
    check(
      `member, ${theme}: mark and address after load`,
      (await js(
        `document.documentElement.classList.contains("kb-member") && document.getElementById("auth-link").getAttribute("href")`,
      )) === "/auth/account/",
    );
    await go("/about/", null, theme);
    check(
      `guest, ${theme}: no mark, sign-in address`,
      (await js(
        `!document.documentElement.classList.contains("kb-member") && document.getElementById("auth-link").getAttribute("href")`,
      )) === "/auth/signin/",
    );
  }

  // ---- 4. signing in with the form ----
  console.log("Signing in through the form");
  await go("/auth/signin/?next=%2Fposts%2F", null);
  for (let i = 0; i < 3; i++) {
    await fill("#signin-identifier", "wrong@example.test");
    await fill("#signin-password", `wrong ${i}`);
    await click("#signin-submit");
    await sleep(900);
  }
  check(
    "the third wrong password says how many tries are left",
    (await text("#signin-message")).includes("Осталось"),
    await text("#signin-message"),
  );
  await fill("#signin-identifier", "ANNA.P");
  await fill("#signin-password", password);
  await click("#signin-submit");
  await sleep(1800);
  check(
    "signing in by login name follows `next`",
    (await where()) === "/posts/",
    String(await where()),
  );
  check(
    "the browser holds a session cookie and the header shows the account",
    (await sessionCookie()) !== null &&
      (await js(
        `document.getElementById("auth-link").getAttribute("href")`,
      )) === "/auth/account/",
  );

  await go("/auth/signin/", null);
  for (let i = 0; i < 5; i++) {
    await fill("#signin-identifier", "pause@example.test");
    await fill("#signin-password", `nope ${i}`);
    await click("#signin-submit");
    await sleep(900);
  }
  check(
    "five wrong passwords show a countdown and keep the button off",
    (await text("#signin-message")).includes("Повторите через") &&
      (await js(`document.getElementById("signin-submit").disabled`)) === true,
    await text("#signin-message"),
  );

  // ---- 4b. signing up with the form (T188) ----
  // Added 2026-10-13. The sign-up page holds a form that is sent within three seconds of the page's opening until the
  // rest of the three seconds is over (a password manager fills the fields at once), and says when it was opened in
  // the SERVER's clock, so a device whose clock is ten minutes ahead still signs up. The rule itself (the refusals) is
  // server/test/auth-routes.test.ts; this section is the page's half.
  console.log("Signing up through the form (the fill time)");
  const accountsOf = async (email) =>
    (
      await db.pool.query(
        "select count(*)::int as n from users where lower(email) = $1",
        [email],
      )
    ).rows[0].n;
  const signUpQuickly = async (name, email, login) => {
    await go("/auth/signup/", null);
    await fill("#signup-name", name);
    await fill("#signup-email", email);
    await fill("#signup-login", login);
    await fill("#signup-password", password);
    await fill("#signup-repeat", password);
    await js(`document.getElementById("signup-submit").click()`);
    await sleep(500);
    const heldBack =
      (await accountsOf(email)) === 0 &&
      (await js(`document.getElementById("signup-submit").disabled`)) === true;
    let landed = false;
    for (let i = 0; i < 80 && !landed; i++) {
      await sleep(100);
      landed = (await where()) === "/auth/account/";
    }
    return { heldBack, landed, stored: await accountsOf(email) };
  };
  const fast = await signUpQuickly(
    "Fast Filler",
    "fast.filler@example.test",
    "fast.f",
  );
  check(
    "a form sent at once is held back by the page and not sent in the first second",
    fast.heldBack,
  );
  check(
    "then it goes through: the account exists and its page opens",
    fast.landed && fast.stored === 1,
    JSON.stringify(fast),
  );
  const skewSignup = await cdp("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => { const real = Date.now.bind(Date); Date.now = () => real() + 10 * 60 * 1000; })()`,
  });
  const skewed = await signUpQuickly(
    "Skewed Filler",
    "skewed.filler@example.test",
    "skewed.f",
  );
  check(
    "from a device whose clock runs ten minutes ahead the sign-up still goes through",
    skewed.landed && skewed.stored === 1,
    JSON.stringify(skewed),
  );
  await cdp("Page.removeScriptToEvaluateOnNewDocument", {
    identifier: skewSignup.result.identifier,
  });

  // ---- 5. a temporary password ----
  console.log("Temporary password");
  await go("/auth/signin/", null);
  await fill("#signin-identifier", "temp@example.test");
  await fill("#signin-password", "temporary-pass");
  await click("#signin-submit");
  await sleep(1800);
  check(
    "a temporary password lands on the account page, which shows only the change form",
    (await where()) === "/auth/account/" &&
      (await js(`!document.getElementById("account-menu")`)) === true &&
      (await js(`!!document.getElementById("password-form")`)) === true,
    String(await where()),
  );
  const limitedCookie = (await sessionCookie())?.value ?? null;
  const limitedSessions = await api(
    "GET",
    "/api/auth/sessions",
    undefined,
    limitedCookie,
  );
  check("the devices route refuses it (403)", limitedSessions.status === 403);
  await fill("#password-current", "temporary-pass");
  await fill("#password-new", "a brand new password");
  await fill("#password-repeat", "a brand new password");
  await click("#password-submit");
  await sleep(2500);
  check(
    "after the change the full account page with the menu shows",
    (await js(`!!document.getElementById("account-menu")`)) === true,
  );

  // ---- 6. the devices ----
  console.log("The devices list");
  // The sign-in through the form above left a second session of this account: start the list from one.
  await api(
    "DELETE",
    "/api/auth/sessions?all=others",
    undefined,
    member.cookie,
  );
  const others = [];
  for (const agent of agents) {
    const r = await api(
      "POST",
      "/api/auth/signin",
      { identifier: "anna@example.test", password },
      undefined,
      agent,
    );
    others.push(r.cookie);
  }
  await go("/auth/account/#devices", member.cookie);
  check(
    "seven devices: five on the first page, the numbers 1 and 2",
    (await js(`document.querySelectorAll("#devices-list li").length`)) === 5 &&
      (await js(
        `[...document.querySelectorAll("#devices-pager [data-pager-numbers] > *")].map(e=>e.textContent.trim()).join(",")`,
      )) === "1,2",
  );
  await click("#devices-pager [data-pager-next]");
  await sleep(300);
  check(
    "the second page holds the other two",
    (await js(`document.querySelectorAll("#devices-list li").length`)) === 2,
  );
  await click("#devices-list li button");
  await sleep(1200);
  const afterOne = await api(
    "GET",
    "/api/auth/sessions",
    undefined,
    member.cookie,
  );
  check(
    "ending one device ends exactly one session",
    afterOne.body.length === 6,
    String(afterOne.body.length),
  );
  await click("#devices-end-others");
  await sleep(1200);
  const afterAll = await api(
    "GET",
    "/api/auth/sessions",
    undefined,
    member.cookie,
  );
  check(
    "ending all the others leaves this one",
    afterAll.body.length === 1 && afterAll.body[0].current === true,
  );
  let allDead = true;
  for (const cookie of others) {
    const me = await api("GET", "/api/auth/me", undefined, cookie);
    if (me.body.viewer !== null) allDead = false;
  }
  check("an ended device is a guest at once", allDead);

  // ---- 7. the profile and the password ----
  console.log("Profile and password");
  await go("/auth/account/", member.cookie);
  await fill("#profile-login", "TAKEN.ONE");
  await click("#profile-submit");
  await sleep(800);
  check(
    "a login held by another account is refused with a sentence",
    (await text('[data-field-error="profile-login"]')).includes("занят"),
  );
  await fill("#profile-name", "  Анна   Сидорова ");
  await fill("#profile-login", "Anna.S");
  await click("#profile-submit");
  await sleep(800);
  await go("/auth/account/", member.cookie);
  check(
    "name and login are saved, normalised, and survive a reload",
    (await js(
      `[document.getElementById("profile-name").value, document.getElementById("profile-login").value].join("|")`,
    )) === "Анна Сидорова|anna.s",
  );
  const spare = (
    await api("POST", "/api/auth/signin", { identifier: "anna.s", password })
  ).cookie;
  await go("/auth/account/#security", member.cookie);
  await fill("#password-current", "not it at all");
  await fill("#password-new", "another new password");
  await fill("#password-repeat", "another new password");
  await click("#password-submit");
  await sleep(900);
  check(
    "a wrong current password is refused with the tries left",
    (await text("#password-message")).includes("Текущий пароль неверен"),
    await text("#password-message"),
  );
  await fill("#password-current", password);
  await click("#password-submit");
  await sleep(2500);
  const spareMe = await api("GET", "/api/auth/me", undefined, spare);
  check(
    "changing the password ends the other devices",
    spareMe.body.viewer === null,
  );
  const signedAgain = await api("POST", "/api/auth/signin", {
    identifier: "anna@example.test",
    password: "another new password",
  });
  check("the new password signs in", signedAgain.status === 200);

  // ---- 8. signing out and the Back button ----
  console.log("Signing out");
  await go("/posts/", signedAgain.cookie);
  await cdp("Page.navigate", { url: BASE + "/auth/account/" });
  await sleep(1500);
  await click("#signout-btn");
  await sleep(1800);
  check("sign-out lands on the home page", (await where()) === "/");
  check("the session cookie is gone", (await sessionCookie()) === null);
  await js("history.back()");
  await sleep(1800);
  check(
    "Back after sign-out shows a guest's header, not the account's",
    (await js(
      `!document.documentElement.classList.contains("kb-member") && document.getElementById("auth-link").getAttribute("href")`,
    )) === "/auth/signin/",
  );
  const afterOut = await api(
    "GET",
    "/api/auth/me",
    undefined,
    signedAgain.cookie,
  );
  check(
    "the signed-out session is dead on the server",
    afterOut.body.viewer === null,
  );

  // ---- 10. the users page (T070, step 3 of plan phase 3) ----
  // Added 2026-10-11: the page is 404 to everyone but a metr and an admin (no redirect), and the browser script drives the
  // site's own API: the list, a status change and a temporary password. Placed before section 9 because that one ends
  // the run with the list of provider mentions.
  console.log("The users page");
  const staff = {};
  for (const [key, status, name] of [
    ["metr", "metr", "Мэтр Тест"],
    ["boss", "admin", "Админ Тест"],
    ["plain", "guest", "Простой Участник"],
  ]) {
    const r = await api("POST", "/api/auth/signup", {
      email: `${key}@example.test`,
      password,
      displayName: name,
      login: `${key}.t`,
      // Added 2026-10-13 (T188): sign-up wants the time its form was opened; ten seconds ago is a person at a keyboard.
      startedAt: Date.now() - 10_000,
    });
    await db.pool.query("update users set status = $2 where email = $1", [
      `${key}@example.test`,
      status,
    ]);
    staff[key] = r.cookie;
  }
  const pageGuest = await page("/admin/users/");
  const pagePlain = await page("/admin/users/", staff.plain);
  check(
    "the users page is 404 to a guest and to a plain member, with no redirect",
    pageGuest.status === 404 &&
      pagePlain.status === 404 &&
      pageGuest.location === null &&
      pagePlain.location === null,
    `${pageGuest.status} ${pagePlain.status}`,
  );
  check(
    "the users page is 200 to a metr and to an admin",
    (await page("/admin/users/", staff.metr)).status === 200 &&
      (await page("/admin/users/", staff.boss)).status === 200,
  );
  const rowJs = (email, expr) =>
    `(()=>{const l=[...document.querySelectorAll("#users-list li")].find(x=>x.querySelector("[data-email]").textContent===${JSON.stringify(email)});return ${expr}})()`;
  const searchFor = async (email) => {
    await fill("#users-query", email);
    await click('#users-search button[type="submit"]');
    await sleep(900);
  };
  await go("/admin/users/", staff.boss);
  await js("window.confirm = () => true");
  check(
    "admin: the list is drawn from the site's API",
    (await js('document.querySelectorAll("#users-list li").length')) >= 5,
  );
  await searchFor("plain@example.test");
  check(
    "admin: the search finds the account and shows its status",
    (await js(
      rowJs(
        "plain@example.test",
        'l?.querySelector("[data-status]").textContent',
      ),
    )) === "гостьguest", // Changed 2026-10-12 (T178): setPhrase writes both languages, one span each.
  );
  await js(
    rowJs(
      "plain@example.test",
      '(l.querySelector("[data-choice]").value="student", l.querySelector("[data-choice]").dispatchEvent(new Event("change")), l.querySelector("[data-apply]").click())',
    ),
  );
  await sleep(1200);
  const changed = await db.pool.query(
    "select status from users where email = 'plain@example.test'",
  );
  check(
    "admin: a status chosen on the page is saved",
    changed.rows[0]?.status === "student",
    String(changed.rows[0]?.status),
  );
  await searchFor("plain@example.test");
  await js(
    rowJs(
      "plain@example.test",
      'l.querySelector("[data-temp-button]").click()',
    ),
  );
  await sleep(2500);
  const shown = await js(
    rowJs(
      "plain@example.test",
      'l.querySelector("[data-temp-value]").textContent',
    ),
  );
  check(
    "admin: a temporary password is shown once, in the row",
    /^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/.test(String(shown)),
    String(shown),
  );
  const forced = await db.pool.query(
    "select must_change from users where email = 'plain@example.test'",
  );
  check(
    "the account must change it at the next sign-in",
    forced.rows[0]?.must_change === true,
  );
  await go("/admin/users/", staff.metr);
  await js("window.confirm = () => true");
  await searchFor("boss@example.test");
  check(
    "metr: an admin's row has no status to choose and no password button",
    (await js(
      rowJs("boss@example.test", 'l.querySelector("[data-choice]").disabled'),
    )) === true &&
      (await js(
        rowJs(
          "boss@example.test",
          'l.querySelector("[data-temp-button]") === null',
        ),
      )) === true,
  );

  // ---- 10b. the superuser's section and the hand-over on the account page (T070, step 3b) ----
  // Added 2026-10-11. The superuser is made by the same function the server command uses (a script of this folder may
  // not write the flag itself: server/test/superuser-writes.test.ts reads it). The target of the hand-over is the admin
  // made above.
  console.log("The hand-over and the recovery codes on the account page");
  // Changed 2026-10-11 (T169): the superuser is made on the setup page, the way the owner will make the first one on a
  // hosting with no command line; the same page is checked to be gone afterwards.
  const setupBefore = await page("/auth/setup/");
  check(
    "setup page: open while there is no superuser, noindex",
    setupBefore.status === 200 && /noindex/.test(setupBefore.html),
  );
  await go("/auth/setup/");
  const fillSetup = async (code, email, pw, repeat = pw) => {
    await fill("#setup-code", code);
    await fill("#setup-email", email);
    await fill("#setup-password", pw);
    await fill("#setup-repeat", repeat);
    await click("#setup-submit");
    await sleep(600);
  };
  await fillSetup("not the code", "su@example.test", password);
  check(
    "setup page: a wrong code is refused with one sentence and nothing is made",
    /неверен/.test(await text("#setup-message")) &&
      (await db.pool.query("select 1 from users where is_superuser"))
        .rowCount === 0,
  );
  await fillSetup(setupCode, "su@example.test", password, "another one");
  check(
    "setup page: two different passwords are refused before anything is sent",
    /не совпадают/.test(await text("#setup-message")),
  );
  await fillSetup(setupCode, "su@example.test", password);
  check(
    "setup page: the right code makes the superuser and shows ten codes once",
    (await js('document.querySelectorAll("#setup-codes li").length')) === 10 &&
      (await js('document.getElementById("setup-intro").hidden')) === true,
  );
  const afterSetup = await page("/auth/setup/");
  const afterApi = await api("POST", "/api/setup", {
    code: setupCode,
    email: "other@example.test",
    password,
  });
  check(
    "setup page: shut for good once the superuser exists, page and route alike",
    afterSetup.status === 404 && afterApi.status === 404,
    `${afterSetup.status} ${afterApi.status}`,
  );
  const suCookie = (
    await api("POST", "/api/auth/signin", {
      identifier: "su@example.test",
      password,
    })
  ).cookie;
  const rowsOf = async () =>
    (
      await db.pool.query(
        "select accepted_at, cancelled_at, completed_at from handover_requests order by id desc limit 1",
      )
    ).rows[0];
  await go("/auth/account/#superuser", suCookie);
  await js("window.confirm = () => true");
  check(
    "superuser: the section and its menu item are there, the other members have none",
    (await js('!!document.getElementById("section-superuser")')) === true &&
      (await js('!!document.querySelector("[data-menu=superuser]")')) === true,
  );
  // Added 2026-10-13 (T110, T147): the settings page's link is the superuser's alone; the metr's menu above and below
  // keeps its four links (the settings page itself is checked by `npm run check:settings`).
  check(
    "superuser: the account menu links to the settings page",
    (await js(
      '[...document.querySelectorAll("#account-menu a")].some(a => a.getAttribute("href") === "/admin/settings/")',
    )) === true,
  );
  check(
    "superuser: the list of administrators holds the other administrator",
    (await js(
      '[...document.querySelectorAll("#handover-target option")].some(o => o.textContent.includes("boss@example.test"))',
    )) === true,
  );
  await fill("#handover-start-password", "not the password");
  await click("#handover-start-submit");
  await sleep(1200);
  check(
    "a wrong password is refused and nothing is started",
    (await rowsOf()) === undefined &&
      /неверен/.test(await text("#handover-start-message")),
  );
  await fill("#handover-start-password", password);
  await click("#handover-start-submit");
  await sleep(1500);
  check(
    "the hand-over starts and the section shows who it waits for",
    (await rowsOf())?.accepted_at === null &&
      /boss@example\.test/.test(await text("#superuser-handover-state")),
    JSON.stringify(await rowsOf()),
  );
  await go("/auth/account/", staff.boss);
  await js("window.confirm = () => true");
  check(
    "the asked admin sees the banner with accept and decline",
    (await js('!document.getElementById("handover-banner").hidden')) === true &&
      (await js('!document.getElementById("handover-accept-form").hidden')) ===
        true &&
      /su@example\.test/.test(await text("#handover-banner-text")),
  );
  await fill("#handover-accept-password", password);
  await click("#handover-accept-submit");
  await sleep(1500);
  const accepted = await rowsOf();
  check(
    "accepting takes the asked side's password and starts the waiting period",
    accepted?.accepted_at !== null &&
      accepted?.completed_at === null &&
      /перейд/.test(await text("#handover-banner-text")),
    JSON.stringify(accepted),
  );
  check(
    "after accepting only Cancel is left, the role has not moved",
    (await js('document.getElementById("handover-accept-form").hidden')) ===
      true &&
      (await js('!document.getElementById("handover-cancel").hidden')) === true,
  );
  await click("#handover-cancel");
  await sleep(1200);
  check(
    "the asked side can cancel during the waiting period",
    (await rowsOf())?.cancelled_at !== null &&
      (await js('document.getElementById("handover-banner").hidden')) === true,
  );
  await go("/auth/account/#superuser", suCookie);
  await js("window.confirm = () => true");
  await fill("#handover-start-password", password);
  await click("#handover-start-submit");
  await sleep(1500);
  await go("/auth/account/", staff.boss);
  await click("#handover-decline");
  await sleep(1200);
  check(
    "the asked side can decline before accepting",
    (await rowsOf())?.cancelled_at !== null &&
      (await rowsOf())?.accepted_at === null,
  );
  await go("/auth/account/#superuser", suCookie);
  await js("window.confirm = () => true");
  check(
    "the new superuser has a set of ten codes from the start",
    /10 из 10/.test(await text("#codes-left")),
    await text("#codes-left"),
  );
  await fill("#codes-password", password);
  await click("#codes-submit");
  await sleep(1500);
  check(
    "recovery codes: ten are shown once and the count follows",
    (await js('document.querySelectorAll("#codes-list li").length')) === 10 &&
      /10 из 10/.test(await text("#codes-left")),
    await text("#codes-left"),
  );
  // Added 2026-10-11 (T168, step 3c): the set just shown is what the recovery page is tried with below.
  const shownCodes = JSON.parse(
    await js(
      'JSON.stringify([...document.querySelectorAll("#codes-list li")].map(l => l.textContent))',
    ),
  );
  await go("/auth/account/", staff.metr);
  check(
    "a metr's account page has no superuser section",
    (await js('!!document.getElementById("section-superuser")')) === false,
  );
  // Added 2026-10-11 (T147, first half): the two panel links are for a metr and an admin and for nobody else.
  const panelLinks = `[...document.querySelectorAll("#account-menu a")].map(a => a.getAttribute("href")).filter(h => h.startsWith("/admin/")).join(",")`;
  check(
    // Changed 2026-10-12 (T175): the videos page sits between the two.
    "a metr's account menu links to the posts, videos and users pages",
    // Changed 2026-10-13 (T107): the feedback page is the fourth link of the panel.
    (await js(panelLinks)) ===
      "/admin/posts/,/admin/videos/,/admin/users/,/admin/feedback/",
  );
  await go("/auth/account/", staff.plain);
  check(
    "a plain member's account menu has no panel link",
    (await js(panelLinks)) === "",
  );

  // ---- 10c. the recovery page (T168, step 3c) ----
  // Added 2026-10-11: a guest reaches it from the sign-in page; a wrong code and a wrong pair of passwords are refused
  // in words and change nothing; a right code sets the password, ends the old sessions, shows a fresh set of ten once
  // and is spent; the new password signs in.
  console.log("The recovery page");
  const signinPage = await page("/auth/signin/");
  check(
    "the sign-in page links to the recovery page",
    signinPage.html.includes('href="/auth/recover/"'),
  );
  const recoverGuest = await page("/auth/recover/");
  check(
    "a guest gets the recovery form",
    recoverGuest.status === 200 && recoverGuest.html.includes("recover-form"),
  );
  await go("/auth/recover/");
  const recoverWith = async (identifier, code, next, repeat = next) => {
    await fill("#recover-identifier", identifier);
    await fill("#recover-code", code);
    await fill("#recover-password", next);
    await fill("#recover-repeat", repeat);
    await click("#recover-submit");
    await sleep(1500);
  };
  await recoverWith(
    "su@example.test",
    shownCodes[0],
    "brand new password",
    "another one",
  );
  check(
    "two different new passwords are refused before anything is sent",
    /не совпадают/.test(await text("#recover-message")) &&
      (await api("GET", "/api/auth/me", undefined, suCookie)).body.viewer !==
        null,
  );
  await recoverWith(
    "su@example.test",
    "ZZZZ-ZZZZ-ZZZZ-ZZZZ",
    "brand new password",
  );
  check(
    "a wrong code is refused with one sentence and the session is untouched",
    /неверны/.test(await text("#recover-message")) &&
      (await api("GET", "/api/auth/me", undefined, suCookie)).body.viewer !==
        null,
  );
  await recoverWith("su@example.test", shownCodes[0], "short");
  check(
    "a too short new password is refused in words, and the code is not spent",
    /не короче 8/.test(await text("#recover-message")),
  );
  await recoverWith("su@example.test", shownCodes[0], "brand new password");
  const freshCodes = JSON.parse(
    await js(
      'JSON.stringify([...document.querySelectorAll("#recover-codes li")].map(l => l.textContent))',
    ),
  );
  check(
    "a right code recovers: a fresh set of ten is shown and the form is gone",
    freshCodes.length === 10 &&
      freshCodes.every((c) => !shownCodes.includes(c)) &&
      (await js('document.getElementById("recover-intro").hidden')) === true,
    JSON.stringify(freshCodes.length),
  );
  check(
    "recovery ended the old session",
    (await api("GET", "/api/auth/me", undefined, suCookie)).body.viewer ===
      null,
  );
  const afterRecovery = await api("POST", "/api/auth/signin", {
    identifier: "su@example.test",
    password: "brand new password",
  });
  check("the new password signs in", afterRecovery.status === 200);
  const reused = await api("POST", "/api/superuser/recover", {
    identifier: "su@example.test",
    code: shownCodes[0],
    newPassword: "yet another password",
  });
  check("the spent code is refused", reused.status === 400);

  // ---- 9. no provider code on any public page ----
  console.log("No provider code in what a page loads");
  const first = async (listPath, prefix) => {
    const html = (await page(listPath)).html;
    return new RegExp(`href="(${prefix}[^"/]+/)"`).exec(html)?.[1] ?? null;
  };
  const paths = [
    "/",
    "/about/",
    "/posts/",
    "/video/",
    "/tags/",
    "/categories/",
    "/search/",
    "/auth/signin/",
    "/auth/signup/",
  ];
  const aPost = await first("/posts/", "/posts/");
  if (aPost) paths.push(aPost);
  const videoHtml = (await page("/video/")).html;
  // Changed 2026-10-11: a paid video is told by the marker its page carries, not by a query of the content tables
  // (the boundary test of server/test/access-boundary.test.ts forbids any file outside server/src/access reading them).
  for (const m of videoHtml.matchAll(/href="(\/video\/[^"/]+\/)"/g)) {
    if (paths.includes(m[1])) continue;
    // Changed 2026-10-12 (T167): a video page is checked whatever it is. Every video page now carries the player
    // component's stub (`data-paid-video`), and the player is the club's own script; the exemption that skipped such
    // a page while it was bound to the previous provider is gone with the provider.
    paths.push(m[1]);
    break;
  }
  const memberAfter = signedAgain.cookie;
  const seen = new Map();
  async function bodyOf(url) {
    if (!seen.has(url)) {
      const res = await fetch(url);
      seen.set(url, res.ok ? await res.text() : "");
    }
    return seen.get(url);
  }
  // Every asset a page names, and the chunks those import, followed to the end.
  async function loaded(path, cookie) {
    const html = (await page(path, cookie)).html;
    const found = new Set();
    const queue = [];
    const add = (href, from) => {
      try {
        const url = new URL(href, from).href;
        if (url.startsWith(BASE) && !found.has(url)) {
          found.add(url);
          queue.push(url);
        }
      } catch {}
    };
    for (const m of html.matchAll(/(?:src|href)="([^"]+\.(?:js|css|mjs))"/g)) {
      add(m[1], BASE + path);
    }
    const files = [];
    while (queue.length > 0) {
      const url = queue.shift();
      const content = await bodyOf(url);
      files.push({ url, content });
      for (const m of content.matchAll(
        /["'`](\.{0,2}\/[^"'`\s]+?\.(?:js|mjs|css))["'`]/g,
      )) {
        add(m[1], url);
      }
    }
    return { html, files };
  }
  // What the provider's CODE carries (found in its 2026-10 bundles: its package scope, its library name, its React
  // provider, its window global and its error class). The bare word is NOT a failure: the config still holds the
  // publishable key and a few comments name it until T167 removes them, and a key is not code. Those are listed
  // as a note so that T167 knows what is left.
  const codeMarkers = [
    "@clerk/",
    "clerk-js",
    "ClerkProvider",
    "__clerk",
    "window.Clerk",
    "ClerkRuntimeError",
  ];
  const mentions = (content) => /clerk/i.test(content);
  const carriesCode = (content) => codeMarkers.some((m) => content.includes(m));
  check(
    "the provider-code detector finds its markers and ignores a bare mention",
    carriesCode("a.__clerk_x=1") &&
      carriesCode('import "@clerk/ui"') &&
      !carriesCode("// the previous provider, Clerk, kept a key here") &&
      mentions("// Clerk"),
  );
  const leftovers = new Set();
  const targets = [
    ...paths.map((p) => [p, undefined]),
    ["/auth/account/", memberAfter],
    // Added 2026-10-12 (T167): the three panel pages, with an admin session; they were exempt while they were bound to
    // the previous provider.
    ["/admin/users/", staff.boss],
    ["/admin/posts/", staff.boss],
    ["/admin/videos/", staff.boss],
  ];
  for (const [path, cookie] of targets) {
    const { html, files } = await loaded(path, cookie);
    // The page's own inline scripts and the loaded files; the page's text is not searched (an article may name it).
    const inline = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
      .map((m) => m[1])
      .join("\n");
    const hit = (carriesCode(inline) ? ["inline script"] : []).concat(
      files.filter((f) => carriesCode(f.content)).map((f) => f.url),
    );
    if (mentions(inline)) leftovers.add("inline script of " + path);
    for (const f of files) {
      if (mentions(f.content)) leftovers.add(f.url.replace(BASE, ""));
    }
    check(
      `${path}: nothing of the provider is loaded (${files.length} files)`,
      hit.length === 0,
      hit.join(", "),
    );
  }
  // Changed 2026-10-12 (T167): the provider's name is no longer tolerated in what a page loads. The key and the code are
  // gone, so a mention would mean a leftover of its bundle or its configuration.
  check(
    "the provider's name is nowhere in what any page loads",
    leftovers.size === 0,
    [...leftovers].join(", "),
  );
} finally {
  try {
    ws?.close();
  } catch {}
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
  `\ncheck:auth: ${passed} passed, ${failures.length} failed${
    failures.length ? ": " + failures.join("; ") : ""
  }`,
);
process.exit(failures.length === 0 ? 0 : 1);
