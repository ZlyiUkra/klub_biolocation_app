// Browser check of the panel's page for the messages of the feedback form, /admin/feedback/, driven through the DevTools
// protocol of headless Edge (T107 of specs/001-self-hosted-club-site; FR-033 to FR-036). The sister of
// check-comments.mjs, which says how this kind of script works.
//
// Run: npm run check:feedback (builds the site and the backend first, then runs this with `--env-file=.env` and Node's
// --experimental-websocket flag). Needs the development database (compose.dev.yml) and Microsoft Edge at the path
// below. Both ports are chosen at run time (check-lang.mjs says why). With KB_SHOT_DIR set to a folder it also writes a
// screenshot of the page there.
//
// What it does: starts its OWN server (the built site behind the real backend) with a throwaway database, plants the
// sessions of a metr, a student and an admin, stores 25 messages (24 straight into the table, one through the form's own
// route), and drives the page: a metr reads the newest first, a message that holds markup is shown as text and nothing
// ran, the mail state of a message is shown (waiting, sent, failed), twenty to a page with the pager, the links of the
// panel include the page; a student and a visitor with no session get the 404 page; the labels read in Russian.
// Added 2026-10-13 (the owner's order after T107): the search of the list (a case-blind substring of the text, the
// name or the contact, newest first, paged by the server, an empty search brings the whole list back).
// Everything it made - the database, the server, the browser and its profile - is removed when it ends, also when it
// fails.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const imports = (p) => import(pathToFileURL(join(root, p)).href);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EDGE =
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
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
const { createSession } = await imports(
  "server/dist/server/src/auth/session.js",
);
const PORT = await freePort(),
  BASE = `http://127.0.0.1:${PORT}`,
  CDP = await freePort();
const SHOTS = process.env.KB_SHOT_DIR ?? "";

const work = mkdtempSync(join(tmpdir(), "edge-feedback-"));
const profile = join(work, "profile");
mkdirSync(profile);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const db = await createTestDatabase();
const accounts = {};
for (const [key, status, name] of [
  ["metr", "metr", "Mark Maitre"],
  ["admin", "admin", "Ada Admin"],
  ["student", "student", "Anna Student"],
]) {
  const r = await db.pool.query(
    `insert into users (email, display_name, status, access_until)
     values ($1, $2, $3, null) returning id`,
    [`${key}@example.test`, name, status],
  );
  const { id: cookie } = await createSession(db.pool, {
    userId: Number(r.rows[0].id),
    status,
    limited: false,
  });
  accounts[key] = { id: Number(r.rows[0].id), cookie };
}
await db.pool.query(
  `insert into settings (key, value) values ('feedback_recipient', '"club-desk@example.test"'::jsonb)`,
);
// 24 messages straight into the table, oldest first; the 3rd is sent, the 5th failed, the 7th holds markup. The route's
// own message (below) is the 25th and the newest.
const typed = '<img src=x onerror="window.__pwned=1"> <b>bold</b>\nsecond line';
for (let i = 1; i <= 24; i += 1) {
  const sent = i === 3;
  const failed = i === 5;
  await db.pool.query(
    `insert into feedback (body, name, contact, subject, received_at, address_prefix, mailed_at, mail_error)
     values ($1, $2, $3, $4, now() - ($5 || ' minutes')::interval, '10.0.0', $6, $7)`,
    [
      i === 7 ? typed : `Message number ${i}`,
      i === 7 ? "Mallory" : `Visitor ${i}`,
      i === 7 ? null : `visitor${i}@example.test`,
      i === 9 ? "signin_problem" : null,
      String(200 - i),
      sent ? new Date() : null,
      failed ? "550 mailbox unavailable" : null,
    ],
  );
}

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
      SETUP_CODE: "unused-setup-code-for-checks",
    },
    stdio: "ignore",
  },
);
const edge = spawn(
  EDGE,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${CDP}`,
    "--window-size=1100,1300",
    "about:blank",
  ],
  { stdio: "ignore" },
);
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
let ws;
try {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(BASE + "/healthz")).ok) break;
    } catch {}
    await sleep(500);
  }
  // The newest message goes through the form's own route, as a visitor's would.
  const posted = await fetch(BASE + "/api/feedback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: BASE,
      "X-Forwarded-For": "10.9.8.7",
    },
    body: JSON.stringify({
      body: "The newest message, through the route",
      name: "Nina",
      contact: "nina@example.test",
      subject: "signin_problem",
      website: "",
      startedAt: Date.now() - 20_000,
    }),
  });
  check(
    "the route stores a message",
    posted.status === 201,
    String(posted.status),
  );

  let target;
  for (let i = 0; i < 40 && !target; i++) {
    try {
      target = (
        await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()
      ).find((t) => t.type === "page");
    } catch {}
    if (!target) await sleep(500);
  }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let n = 0;
  const pending = new Map();
  ws.addEventListener("message", (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) {
      pending.get(d.id)(d);
      pending.delete(d.id);
    }
  });
  const cdp = (method, params = {}) =>
    new Promise((r) => {
      const i = ++n;
      pending.set(i, r);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const js = async (e) => {
    const r = await cdp("Runtime.evaluate", {
      expression: e,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.result?.exceptionDetails) {
      console.log(
        "   js error:",
        r.result.exceptionDetails.exception?.description?.slice(0, 200),
      );
    }
    return r.result?.result?.value;
  };
  await cdp("Page.enable");
  await cdp("Network.enable");
  const until = async (expr, ms = 10000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await js(expr)) return true;
      await sleep(100);
    }
    return false;
  };
  const as = async (who, lang = "en") => {
    await cdp("Network.clearBrowserCookies");
    if (who !== null) {
      await cdp("Network.setCookie", {
        name: "__Host-session",
        value: accounts[who].cookie,
        url: BASE + "/",
        path: "/",
        secure: true,
        httpOnly: true,
      });
    }
    await cdp("Page.navigate", { url: BASE + "/robots.txt" });
    await sleep(300);
    await js(`localStorage.setItem("kb-lang", "${lang}")`);
  };
  const open = async (path) => {
    await cdp("Page.navigate", { url: BASE + path });
    await until(`document.readyState === "complete"`);
  };
  const ready = () =>
    until(
      `document.querySelectorAll("#feedback-list > li").length > 0 && document.getElementById("feedback-box").hidden === false`,
    );
  const rows = () =>
    js(
      `[...document.querySelectorAll("#feedback-list > li")].map((li) => ({
        name: li.querySelector("[data-name]").innerText,
        body: li.querySelector("[data-body]").innerText,
        mail: li.querySelector("[data-mail]").innerText,
        topic: li.querySelector("[data-topic]").hidden ? "" : li.querySelector("[data-topic]").innerText,
        network: li.querySelector("[data-network]").innerText,
      }))`,
    );
  const text = (sel) =>
    js(`document.querySelector(${JSON.stringify(sel)})?.innerText ?? ""`);

  console.log("A metr reads the list");
  await as("metr");
  await open("/admin/feedback/");
  check("the page lists the messages", await ready());
  const first = await rows();
  check(
    "twenty to a page, the newest first (the one through the route)",
    first.length === 20 &&
      first[0].name === "Nina" &&
      first[0].body === "The newest message, through the route",
    JSON.stringify(first[0]),
  );
  check(
    "its topic is named and its network part is shown, never the full address",
    first[0].topic === "Cannot sign in" &&
      first[0].network === "Network: 10.9.8" &&
      !JSON.stringify(first).includes("10.9.8.7"),
    JSON.stringify(first[0]),
  );
  check(
    "a message that has not left says so",
    /^Mail not sent yet$/.test(first[0].mail),
    first[0].mail,
  );
  check(
    "the count line and the pager say there are 25 and two pages",
    /Showing 1-20 of 25/.test(await text("#feedback-count")) &&
      (await js(
        `!document.getElementById("feedback-pager").classList.contains("hidden")`,
      )) === true,
    await text("#feedback-count"),
  );
  await shot("1-metr-page-1");

  const mallory = first.find((r) => r.name === "Mallory");
  check(
    "markup is shown as text: no tag was made, nothing ran, the line break stays",
    mallory !== undefined &&
      mallory.body === typed &&
      (await js(
        `document.querySelector("#feedback-list [data-body] img, #feedback-list [data-body] b") === null && window.__pwned === undefined`,
      )) === true,
    JSON.stringify(mallory),
  );
  await js(
    `document.querySelector('#feedback-pager [data-pager-next]').click()`,
  );
  await until(`document.querySelectorAll("#feedback-list > li").length === 5`);
  const second = await rows();
  const byName = (name) => second.find((r) => r.name === name);
  check(
    "the second page holds the five oldest, oldest last",
    second.length === 5 && second[4].name === "Visitor 1",
    JSON.stringify(second.map((r) => r.name)),
  );
  check(
    "a sent message and a failed one say so",
    /^Mail sent: /.test(byName("Visitor 3")?.mail ?? "") &&
      /^Mail failed: 550 mailbox unavailable$/.test(
        byName("Visitor 5")?.mail ?? "",
      ),
    JSON.stringify([byName("Visitor 3")?.mail, byName("Visitor 5")?.mail]),
  );
  check(
    "the panel's row names the page and the page is marked as the current one",
    (
      await js(
        `[...document.querySelectorAll("main nav a, main nav span[aria-current]")].map((e) => e.getAttribute("href") ?? "current:" + e.innerText).join("|")`,
      )
    ).includes("current:Feedback"),
  );

  // Added 2026-10-13 (the owner's order after T107): the search of the list. It is the server that finds and pages, so
  // every case here is a request, and a search made on page 2 starts again from page 1.
  console.log("The search");
  const search = async (value) => {
    await js(
      `(() => {
        const input = document.getElementById("feedback-query");
        input.value = ${JSON.stringify(value)};
        document.getElementById("feedback-search").requestSubmit();
      })()`,
    );
  };
  const countIs = (source) =>
    until(
      `new RegExp(${JSON.stringify(source)}).test(document.getElementById("feedback-count").innerText)`,
    );
  const pagerHidden = () =>
    js(
      `document.getElementById("feedback-pager").classList.contains("hidden")`,
    );
  await search("visitor 1");
  check(
    "a search is not case-sensitive, finds the name, says how many, newest first, and one page needs no pager",
    (await countIs("^Found: 11\\. Showing 1-11, newest first\\.$")) &&
      JSON.stringify((await rows()).map((r) => r.name)) ===
        JSON.stringify([
          "Visitor 19",
          "Visitor 18",
          "Visitor 17",
          "Visitor 16",
          "Visitor 15",
          "Visitor 14",
          "Visitor 13",
          "Visitor 12",
          "Visitor 11",
          "Visitor 10",
          "Visitor 1",
        ]) &&
      (await pagerHidden()) === true,
    await text("#feedback-count"),
  );
  // The pager's scroll and the search's own request leave the page part-way down; the picture shows it from the top.
  await js(`window.scrollTo(0, 0)`);
  await shot("2-search");
  await search("VISITOR8@");
  check(
    "the contact is searched too",
    (await countIs("^Found: 1\\. Showing 1-1, newest first\\.$")) &&
      (await rows()).map((r) => r.name).join() === "Visitor 8",
    await text("#feedback-count"),
  );
  await search("message number");
  check(
    "a search that fills two pages: twenty, a pager, the count of the matches",
    (await countIs("^Found: 23\\. Showing 1-20, newest first\\.$")) &&
      (await rows()).length === 20 &&
      (await pagerHidden()) === false,
    await text("#feedback-count"),
  );
  await js(
    `document.querySelector('#feedback-pager [data-pager-next]').click()`,
  );
  check(
    "its second page is asked from the server: the three oldest matches",
    (await countIs("^Found: 23\\. Showing 21-23, newest first\\.$")) &&
      (await rows()).map((r) => r.name).join() ===
        "Visitor 3,Visitor 2,Visitor 1",
    await text("#feedback-count"),
  );
  await search("<img src=x");
  check(
    "a search made of markup finds the message that holds it and runs nothing",
    (await countIs("^Found: 1\\. ")) &&
      (await rows()).map((r) => r.name).join() === "Mallory" &&
      (await js(`window.__pwned === undefined`)) === true,
    await text("#feedback-count"),
  );
  await search("no such words at all");
  check(
    "a search with no match says so and shows no row",
    (await countIs("^Nothing found\\.$")) &&
      (await rows()).length === 0 &&
      (await pagerHidden()) === true,
    await text("#feedback-count"),
  );
  await search("");
  check(
    "an empty search brings the whole list back, from its first page",
    (await countIs("^Showing 1-20 of 25, newest first\\.$")) &&
      (await rows())[0].name === "Nina",
    await text("#feedback-count"),
  );

  console.log("An admin, a student and a visitor");
  await as("admin");
  await open("/admin/feedback/");
  check("an admin reads it too", await ready());
  await as("student");
  await open("/admin/feedback/");
  check(
    "a student gets the 404 page, not the list",
    (await js(`document.getElementById("feedback-list") === null`)) === true,
  );
  await as(null);
  await open("/admin/feedback/");
  check(
    "a visitor with no session gets the 404 page too",
    (await js(`document.getElementById("feedback-list") === null`)) === true,
  );

  console.log("Russian");
  await as("metr", "ru");
  await open("/admin/feedback/");
  await ready();
  const ru = await rows();
  check(
    "the labels read in Russian, the visitor's text as it was typed",
    ru[0].name === "Nina" &&
      ru[0].topic === "Не получается войти" &&
      /^Письмо ещё не отправлено$/.test(ru[0].mail) &&
      ru[0].network === "Сеть: 10.9.8" &&
      /Показаны 1-20 из 25/.test(await text("#feedback-count")),
    JSON.stringify(ru[0]),
  );
  await search("visitor 1");
  check(
    "the search field and its count line read in Russian",
    (await countIs("^Найдено: 11\\. Показаны 1-11, новые сверху\\.$")) &&
      (await js(`document.getElementById("feedback-query").placeholder`)) ===
        "Текст, имя или контакт",
    await text("#feedback-count"),
  );

  // Added 2026-10-13 (T109): the form of the site, in the browser, end to end - the footer button opens it, a message
  // goes to the club's own route and is stored with its mail row, the refusals are told as a toast, a member's name and
  // address are filled in, the sign-in help's topic is sent as a code, a device whose clock is ten minutes ahead still
  // sends, and the sixth message of an hour from one address is the route's 429. Every stored message is read back from
  // the table, so what the page did is not taken on trust from what it showed.
  console.log("The form of the site");
  const stored = async () =>
    (
      await db.pool.query(
        "select id, body, name, contact, subject from feedback order by id desc limit 1",
      )
    ).rows[0];
  const storedCount = async () =>
    Number(
      (await db.pool.query("select count(*)::int as n from feedback")).rows[0]
        .n,
    );
  const openForm = async (viaEvent = null) => {
    await open("/");
    await until(`document.getElementById("open-modal-btn") !== null`);
    await js(`document.getElementById("toast-container").replaceChildren()`);
    if (viaEvent === null) {
      await js(`document.getElementById("open-modal-btn").click()`);
    } else {
      await js(
        `document.dispatchEvent(new CustomEvent("contact:open", { detail: ${JSON.stringify(viaEvent)} }))`,
      );
    }
    return until(
      `document.getElementById("contact-modal").classList.contains("flex")`,
    );
  };
  const fillForm = (v) =>
    js(`(() => {
      const form = document.getElementById("contact-form");
      const values = ${JSON.stringify(v)};
      for (const [name, value] of Object.entries(values)) {
        form.elements.namedItem(name).value = value;
      }
    })()`);
  const submitForm = () =>
    js(`document.getElementById("contact-form").requestSubmit()`);
  const toastText = async () => {
    await until(
      `document.querySelector("#toast-container > div") !== null`,
      4000,
    );
    return js(
      `document.querySelector("#toast-container > div")?.innerText.replace(/^[^\\w]+/, "").trim() ?? ""`,
    );
  };
  // The page's own clock is read at opening; the minimum fill time is three seconds.
  const waitFill = () => sleep(3500);

  await as(null);
  const base = await storedCount();
  check(
    "the footer button opens the form, and the form no longer points at the old service",
    (await openForm()) &&
      (await js(
        `document.getElementById("contact-form").getAttribute("action")`,
      )) === "/api/feedback" &&
      (await js(
        `document.querySelector('[action*="web3forms"], [name="access_key"]') === null`,
      )) === true,
  );
  check(
    "the three fields carry the route's own limits and the honeypot is out of reach",
    (await js(
      `["name", "email", "message"].map((n) => document.getElementById("contact-form").elements.namedItem(n).maxLength).join()`,
    )) === "100,200,5000" &&
      (await js(
        `(() => { const h = document.getElementById("contact-form").elements.namedItem("website"); return h.tabIndex === -1 && h.closest("[aria-hidden='true']") !== null; })()`,
      )) === true,
  );

  // 1. A visitor's message, after the minimum time.
  await fillForm({
    name: "Vera Visitor",
    email: "vera@example.test",
    message: "A question from the footer button\nwith a second line",
  });
  await shot("3-form-open");
  await waitFill();
  await submitForm();
  check(
    "a visitor's message is sent and the toast says so",
    /Message sent!/.test(await toastText()),
  );
  const viaButton = await stored();
  check(
    "it is stored as typed: body, name, contact, no topic",
    (await storedCount()) === base + 1 &&
      viaButton.body === "A question from the footer button\nwith a second line" &&
      viaButton.name === "Vera Visitor" &&
      viaButton.contact === "vera@example.test" &&
      viaButton.subject === null,
    JSON.stringify(viaButton),
  );
  const queued = await db.pool.query(
    "select kind, to_address from mail_queue where feedback_id = $1",
    [viaButton.id],
  );
  check(
    "and its notice is queued for the recipient, nothing was sent in the request",
    queued.rows.length === 1 &&
      queued.rows[0].kind === "feedback_notice" &&
      queued.rows[0].to_address === "club-desk@example.test",
    JSON.stringify(queued.rows),
  );
  check(
    "the form was closed and emptied",
    (await js(
      `document.getElementById("contact-modal").classList.contains("hidden") && document.getElementById("contact-form").elements.namedItem("message").value === ""`,
    )) === true,
  );

  // 2. Too fast, and a filled honeypot: refused, nothing stored, the toast says it failed; a retry after the wait goes.
  await openForm();
  await fillForm({
    name: "Eager",
    email: "eager@example.test",
    message: "Sent at once",
  });
  const beforeRefused = await storedCount();
  await submitForm();
  check(
    "a form sent at once is refused, nothing is stored, the toast says it failed",
    /Sending failed/.test(await toastText()) &&
      (await storedCount()) === beforeRefused,
  );
  await js(`document.getElementById("toast-container").replaceChildren()`);
  await fillForm({ website: "https://bot.example" });
  await waitFill();
  await submitForm();
  check(
    "a filled honeypot is refused after the wait as well",
    /Sending failed/.test(await toastText()) &&
      (await storedCount()) === beforeRefused,
  );
  await js(`document.getElementById("toast-container").replaceChildren()`);
  await fillForm({ website: "" });
  await submitForm();
  check(
    "the same form sent again, honeypot empty, goes",
    /Message sent!/.test(await toastText()) &&
      (await storedCount()) === beforeRefused + 1,
  );

  // 3. The sign-in page's help: the open event with a topic code and an address.
  await openForm({ email: "help@example.test", subject: "signin_problem" });
  check(
    "the open event writes the address into the empty field",
    (await js(
      `document.getElementById("contact-form").elements.namedItem("email").value`,
    )) === "help@example.test",
  );
  await fillForm({ name: "Locked Out", message: "I cannot sign in" });
  await waitFill();
  await submitForm();
  await toastText();
  const topic = await stored();
  check(
    "the topic is sent as a code and the panel will name it",
    topic.subject === "signin_problem" &&
      topic.contact === "help@example.test" &&
      topic.body === "I cannot sign in",
    JSON.stringify(topic),
  );

  // 4. A signed-in member: the name and the address are filled in; only the message is left to write.
  await as("student");
  await openForm();
  const filled = await until(
    `document.getElementById("contact-form").elements.namedItem("name").value === "Anna Student" && document.getElementById("contact-form").elements.namedItem("email").value === "student@example.test"`,
  );
  check("a member's name and address are filled in", filled);
  await fillForm({ message: "From a signed-in account" });
  await waitFill();
  await submitForm();
  await toastText();
  const member = await stored();
  check(
    "and are what is stored",
    member.name === "Anna Student" &&
      member.contact === "student@example.test" &&
      member.body === "From a signed-in account",
    JSON.stringify(member),
  );

  // 5. A device whose clock is ten minutes ahead: the server's time is learned, so the form still goes.
  await as(null);
  const skewScript = await cdp("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => { const real = Date.now.bind(Date); Date.now = () => real() + 10 * 60 * 1000; })()`,
  });
  await openForm();
  await fillForm({
    name: "Skewed",
    email: "skew@example.test",
    message: "From a device whose clock runs ten minutes ahead",
  });
  await waitFill();
  const beforeSkew = await storedCount();
  await submitForm();
  check(
    "a device whose clock is ten minutes ahead still sends",
    /Message sent!/.test(await toastText()) &&
      (await storedCount()) === beforeSkew + 1,
  );
  await cdp("Page.removeScriptToEvaluateOnNewDocument", {
    identifier: skewScript.result.identifier,
  });

  // 6. Five messages are stored from this address inside the hour; the next one is the route's 429.
  await as(null);
  await openForm();
  await fillForm({
    name: "One too many",
    email: "many@example.test",
    message: "The sixth from the same address",
  });
  await waitFill();
  const beforeLimit = await storedCount();
  await submitForm();
  check(
    "the sixth message of the hour from one address says there are too many, and is not stored",
    /Too many messages/.test(await toastText()) &&
      (await storedCount()) === beforeLimit,
  );

  // The panel lists what the form stored, the topic named.
  await as("metr");
  await open("/admin/feedback/");
  await ready();
  check(
    "the panel lists the messages the form stored, the newest first, the topic named",
    (await rows()).some((r) => r.topic === "Cannot sign in") &&
      /Showing 1-20 of 3\d/.test(await text("#feedback-count")),
    await text("#feedback-count"),
  );

  async function shot(name) {
    if (!SHOTS) return;
    const r = await cdp("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    writeFileSync(
      join(SHOTS, name + ".png"),
      Buffer.from(r.result.data, "base64"),
    );
  }
} catch (error) {
  failures.push("script error: " + error);
  console.log("  FAIL  script error:", error);
} finally {
  try {
    ws?.close();
  } catch {}
  edge.kill();
  server.kill();
  await sleep(800);
  await db.drop().catch(() => {});
  // The browser holds its files for a moment after it is told to stop, so the removal retries.
  rmSync(work, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 300,
  });
}
console.log(
  `\ncheck:feedback: ${passed} passed, ${failures.length} failed${failures.length ? ": " + failures.join("; ") : ""}`,
);
process.exit(failures.length ? 1 : 0);
