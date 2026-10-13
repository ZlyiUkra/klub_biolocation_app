// Browser check of the superuser's settings page, /admin/settings/, driven through the DevTools protocol of headless Edge
// (T110 of specs/001-self-hosted-club-site; FR-035, FR-036). The sister of check-feedback.mjs, which says how this kind
// of script works.
//
// Run: npm run check:settings (builds the site and the backend first, then runs this with `--env-file=.env` and Node's
// --experimental-websocket flag). Needs the development database (compose.dev.yml) and Microsoft Edge at the path
// below. Both ports are chosen at run time (check-lang.mjs says why). With KB_SHOT_DIR set to a folder it also writes a
// screenshot of the page there.
//
// What it does: starts its OWN server (the built site behind the real backend) with a throwaway database, plants the
// sessions of a superuser, an administrator and a metr, and drives the page as the superuser: the recipient and the
// switch are shown; a wrong password is refused with the tries left and changes nothing; the switch is saved and
// logged; a bad address and the address already in force are told; a new address is asked for with the password, and
// the code is read from the queue row the way a mailbox would; a wrong code costs a try; the right code makes the
// address active; the old address is told. An administrator who is not the superuser and a metr get the 404 page, and
// the panel's row and the account menu show the link to the superuser only. Everything it made - the database, the
// server, the browser and its profile - is removed when it ends, also when it fails.
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
const { hashPassword } = await imports(
  "server/dist/server/src/auth/password.js",
);
const { createSuperuser } = await imports(
  "server/dist/server/src/users/superuser.js",
);
const PORT = await freePort(),
  BASE = `http://127.0.0.1:${PORT}`,
  CDP = await freePort();
const SHOTS = process.env.KB_SHOT_DIR ?? "";
const PASSWORD = "a long enough password";
const OLD = "club-desk@example.test";
const NEW = "new-desk@example.test";

const work = mkdtempSync(join(tmpdir(), "edge-settings-"));
const profile = join(work, "profile");
mkdirSync(profile);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const db = await createTestDatabase();
const accounts = {};
const passwordHash = await hashPassword(PASSWORD);
// The superuser is made by the superuser module, the one place that may write the flag (server/test/
// superuser-writes.test.ts reads this folder too); the administrator and the metr are plain insert rows.
const made = await createSuperuser(db.pool, {
  email: "boss@example.test",
  password: PASSWORD,
});
if (!made.ok) throw new Error("the superuser was not made: " + made.reason);
accounts.boss = {
  id: made.userId,
  cookie: (
    await createSession(db.pool, {
      userId: made.userId,
      status: "admin",
      superuser: true,
      limited: false,
    })
  ).id,
};
for (const [key, status, name] of [
  ["deputy", "admin", "Ada Admin"],
  ["metr", "metr", "Mark Maitre"],
]) {
  const r = await db.pool.query(
    `insert into users (email, display_name, status, password_hash, access_until)
     values ($1, $2, $3, $4, null) returning id`,
    [`${key}@example.test`, name, status, passwordHash],
  );
  const { id: cookie } = await createSession(db.pool, {
    userId: Number(r.rows[0].id),
    status,
    limited: false,
  });
  accounts[key] = { id: Number(r.rows[0].id), cookie };
}
await db.pool.query(
  `insert into settings (key, value) values ('feedback_recipient', $1::jsonb)`,
  [JSON.stringify(OLD)],
);

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
      SMTP_HOST: "",
      SMTP_PORT: "",
      SMTP_USER: "",
      SMTP_PASSWORD: "",
      SMTP_FROM: "",
      MAIL_OUTBOX_DIR: "",
      FEEDBACK_RECIPIENT_SEED: "",
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
    until(`document.getElementById("settings-box")?.hidden === false`);
  const text = (id) =>
    js(`document.getElementById(${JSON.stringify(id)})?.innerText ?? ""`);
  const type = (id, value) =>
    js(
      `(() => { const e = document.getElementById(${JSON.stringify(id)}); e.value = ${JSON.stringify(value)}; })()`,
    );
  const submit = (id) =>
    js(`document.getElementById(${JSON.stringify(id)}).requestSubmit()`);
  const messageIs = (id, re) =>
    until(
      `new RegExp(${JSON.stringify(re)}).test(document.getElementById(${JSON.stringify(id)}).innerText)`,
    );
  const setting = async (key) =>
    (
      await db.pool.query(
        "select value, updated_by from settings where key = $1",
        [key],
      )
    ).rows[0];
  const mailOf = async (kind) =>
    (
      await db.pool.query(
        "select to_address, subject, body from mail_queue where kind = $1 order by id",
        [kind],
      )
    ).rows;
  const links = (selector) =>
    js(
      `[...document.querySelectorAll(${JSON.stringify(selector)})].map((a) => a.getAttribute("href")).filter((h) => h && h.startsWith("/admin/")).join(",")`,
    );

  console.log("The superuser opens the page");
  await as("boss");
  await open("/admin/settings/");
  check("the page opens and shows its box", await ready());
  check(
    "it names the recipient in force and has the switch at its seeded value",
    (await text("settings-recipient-now")).includes(OLD) &&
      (await js(
        `document.querySelector('input[name="membersBlockMode"]:checked')?.value`,
      )) === "locked",
    await text("settings-recipient-now"),
  );
  check(
    "no request is open",
    (await js(`document.getElementById("settings-pending").hidden`)) === true,
  );
  await js(`window.scrollTo(0, 0)`);
  await shot("1-settings");

  console.log("The switch");
  await js(
    `document.querySelector('input[name="membersBlockMode"][value="hidden"]').checked = true`,
  );
  await type("settings-mode-password", "not the password");
  await submit("settings-mode-form");
  check(
    "a wrong password is told and nothing changes, the field is emptied",
    (await messageIs(
      "settings-mode-message",
      "^The password is not right\\.",
    )) &&
      (await setting("members_block_mode")).value === "locked" &&
      (await js(`document.getElementById("settings-mode-password").value`)) ===
        "",
    await text("settings-mode-message"),
  );
  await type("settings-mode-password", PASSWORD);
  await submit("settings-mode-form");
  check(
    "the right password saves the switch, says so, and the value is logged under the superuser",
    (await messageIs("settings-mode-message", "^Saved\\.$")) &&
      (await setting("members_block_mode")).value === "hidden" &&
      Number((await setting("members_block_mode")).updated_by) ===
        accounts.boss.id,
  );
  const log = await db.pool.query(
    "select old_value, new_value, changed_by from settings_log where key = 'members_block_mode' order by id",
  );
  check(
    "and the log has the change: from locked to hidden, by the superuser",
    log.rows.length === 2 &&
      log.rows[1].old_value === "locked" &&
      log.rows[1].new_value === "hidden" &&
      Number(log.rows[1].changed_by) === accounts.boss.id,
    JSON.stringify(log.rows),
  );

  console.log("The recipient");
  await type("settings-recipient-address", "not an address");
  await type("settings-recipient-password", PASSWORD);
  await submit("settings-recipient-form");
  check(
    "an address that is not one address is told, and no mail was queued",
    (await messageIs(
      "settings-recipient-message",
      "One mail address is needed",
    )) && (await mailOf("recipient_code")).length === 0,
    await text("settings-recipient-message"),
  );
  await type("settings-recipient-address", OLD.toUpperCase());
  await type("settings-recipient-password", PASSWORD);
  await submit("settings-recipient-form");
  check(
    "the address already in force is told, and nothing is sent",
    (await messageIs("settings-recipient-message", "already the recipient")) &&
      (await mailOf("recipient_code")).length === 0,
    await text("settings-recipient-message"),
  );
  await type("settings-recipient-address", NEW);
  await type("settings-recipient-password", PASSWORD);
  await submit("settings-recipient-form");
  check(
    "a new address is asked for: the request shows its address, the active recipient has not moved",
    (await until(
      `document.getElementById("settings-pending").hidden === false`,
    )) &&
      (await text("settings-pending-text")).includes(NEW) &&
      (await text("settings-recipient-now")).includes(OLD) &&
      (await setting("feedback_recipient")).value === OLD,
    await text("settings-pending-text"),
  );
  const codeMail = await mailOf("recipient_code");
  const code = /\b\d{8}\b/.exec(codeMail[0]?.body ?? "")?.[0] ?? "";
  const warned = await mailOf("recipient_change_requested");
  check(
    "the code is mailed to the NEW address only, and the OLD address is warned with no code",
    codeMail.length === 1 &&
      codeMail[0].to_address === NEW &&
      code.length === 8 &&
      warned.length === 1 &&
      warned[0].to_address === OLD &&
      !warned[0].body.includes(code),
    JSON.stringify([codeMail.length, warned.length]),
  );
  check(
    "the page holds neither the code nor its hash",
    !(await js(
      `document.documentElement.innerHTML.includes(${JSON.stringify(code)})`,
    )) && !(await js(`document.documentElement.innerHTML.includes("scrypt$")`)),
  );
  await type("settings-code", code === "00000000" ? "11111111" : "00000000");
  await submit("settings-code-form");
  check(
    "a wrong code is told with four tries left, and the recipient is still the old one",
    (await messageIs("settings-code-message", "not right")) &&
      /4 tries left/i.test(await text("settings-code-message")) &&
      (await setting("feedback_recipient")).value === OLD,
    await text("settings-code-message"),
  );
  await type("settings-code", "12ab");
  await submit("settings-code-form");
  check(
    "a code that is not eight digits is told at once and costs no try",
    await messageIs("settings-code-message", "eight digits"),
  );
  await type("settings-code", code);
  await submit("settings-code-form");
  check(
    "the right code makes the new address active, the request is gone, the change is said",
    (await until(
      `document.getElementById("settings-pending").hidden === true`,
    )) &&
      (await text("settings-recipient-now")).includes(NEW) &&
      (await messageIs(
        "settings-recipient-message",
        "The address was changed",
      )) &&
      (await setting("feedback_recipient")).value === NEW &&
      Number((await setting("feedback_recipient")).updated_by) ===
        accounts.boss.id,
    await text("settings-recipient-now"),
  );
  const told = await mailOf("recipient_changed");
  check(
    "the old address is told that it changed, and nothing else was mailed to it",
    told.length === 1 && told[0].to_address === OLD,
    JSON.stringify(told.map((m) => m.to_address)),
  );

  console.log("Who sees the page and its links");
  await open("/admin/feedback/");
  check(
    "the panel's row shows the settings link to the superuser",
    (await links("main nav a")).includes("/admin/settings/"),
    await links("main nav a"),
  );
  await open("/auth/account/");
  await until(`document.getElementById("account-menu") !== null`);
  check(
    "and so does the account menu",
    (await links("#account-menu a")).includes("/admin/settings/"),
    await links("#account-menu a"),
  );
  for (const who of ["deputy", "metr"]) {
    await as(who);
    await open("/admin/settings/");
    check(
      `${who} gets the 404 page, not the settings`,
      (await js(`document.getElementById("settings-box") === null`)) === true,
    );
    await open("/admin/feedback/");
    check(
      `${who}'s panel row has no settings link`,
      !(await links("main nav a")).includes("/admin/settings/"),
      await links("main nav a"),
    );
  }
  await as(null);
  await open("/admin/settings/");
  check(
    "a visitor with no session gets the 404 page too",
    (await js(`document.getElementById("settings-box") === null`)) === true,
  );

  console.log("Russian");
  await as("boss", "ru");
  await open("/admin/settings/");
  await ready();
  check(
    "the labels read in Russian, the address as it is",
    /Сообщения формы обратной связи отправляются на адрес: new-desk@example\.test/.test(
      await text("settings-recipient-now"),
    ) &&
      (await js(
        `document.querySelector("#settings-recipient-title").innerText`,
      )) === "Адрес для сообщений формы",
    await text("settings-recipient-now"),
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
  `\ncheck:settings: ${passed} passed, ${failures.length} failed${failures.length ? ": " + failures.join("; ") : ""}`,
);
process.exit(failures.length ? 1 : 0);
