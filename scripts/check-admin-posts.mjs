// Browser check of the posts page of the admin panel, /admin/posts/, driven through the DevTools protocol of headless
// Edge (T099 of specs/001-self-hosted-club-site; written after the page, at the owner's request of 2026-10-12, so that a
// change to the page or to the API behind it that breaks the form is found by a run and not by the owner).
//
// Run: npm run check:admin-posts (builds the site and the backend first, then runs this with `--env-file=.env` and Node's
// --experimental-websocket flag). Needs the development database (compose.dev.yml) and Microsoft Edge at the path below.
// Both ports are chosen at run time (check-lang.mjs says why).
//
// What it does: starts its OWN server (the built site behind the real backend) with a throwaway database holding the
// repository's content, signs in an administrator and a student by planting a session, and drives the form: the list,
// the examples and the explanation, validation, create with the preview, public at once, the audience "chosen only"
// with a person found by name, a save over another editor's change (409, the form keeps the text), a taken address,
// delete and restore, and the Russian page. Everything it made - the throwaway database, the server, the browser and
// its profile folder - is removed when it ends, also when it fails.
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
const { importContent } = await imports(
  "server/dist/server/src/cli/import-content.js",
);
const { createSession } = await imports(
  "server/dist/server/src/auth/session.js",
);
// The server's port is a free one asked of the system, as the protocol port is: a fixed port can still be held by the
// server of the run before while it shuts down, and the check would then talk to the dying one.
const PORT = await freePort(),
  BASE = `http://127.0.0.1:${PORT}`,
  CDP = await freePort();
const db = await createTestDatabase();
await importContent(db.pool, {
  postsDir: join(root, "src/content/posts/"),
  videoDir: join(root, "src/content/video/"),
});
const mk = async (key, status) => {
  const r = await db.pool.query(
    `insert into users (email, display_name, status) values ($1,$2,$3) returning id`,
    [`${key}@example.test`, key, status],
  );
  const id = Number(r.rows[0].id);
  const { id: cookie } = await createSession(db.pool, {
    userId: id,
    status,
    limited: false,
  });
  return { id, cookie };
};
// Added 2026-10-12 (T143): the check's own volume for the pictures it uploads, never the owner's VIDEO_ROOT.
const volume = mkdtempSync(join(tmpdir(), "kb-posts-volume-"));
// A 1x1 PNG, a real picture, so that the thumbnail in the list loads.
const pngFile = join(volume, "..", `kb-pixel-${process.pid}.png`);
writeFileSync(
  pngFile,
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);
const textFile = join(volume, "..", `kb-notapicture-${process.pid}.png`);
writeFileSync(textFile, "this is text, not a picture");
const admin = await mk("admin", "admin");
const student = await mk("student", "student");
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
      VIDEO_ROOT: volume,
      VIDEO_FREE_RESERVE_MB: "0",
    },
    stdio: "ignore",
  },
);
const profile = mkdtempSync(join(tmpdir(), "edge-admin-posts-"));
const edge = spawn(
  EDGE,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${CDP}`,
    "--window-size=1100,1000",
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
  const until = async (expr, ms = 8000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await js(expr)) return true;
      await sleep(100);
    }
    return false;
  };
  const open = async (cookie, lang = "en") => {
    await cdp("Network.clearBrowserCookies");
    await cdp("Network.setCookie", {
      name: "__Host-session",
      value: cookie,
      url: BASE + "/",
      path: "/",
      secure: true,
      httpOnly: true,
    });
    await cdp("Page.navigate", { url: BASE + "/robots.txt" });
    await sleep(300);
    await js(`localStorage.setItem("kb-lang", "${lang}")`);
    await cdp("Page.navigate", { url: BASE + "/admin/posts/" });
    return until(
      `document.readyState === "complete" && document.querySelector("#admin-list") && !document.querySelector("#admin-list").hidden`,
    );
  };
  const text = (sel) =>
    js(`document.querySelector(${JSON.stringify(sel)})?.innerText ?? ""`);
  const set = (sel, v) =>
    js(
      `(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.value=${JSON.stringify(v)};e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}))})()`,
    );
  const click = (sel) =>
    js(
      `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e||e.hidden)return false;e.click();return true})()`,
    );
  const submit = () =>
    js(`document.querySelector("#admin-editor").requestSubmit()`);
  const status = () => text("#admin-status");
  const api = (path, init) =>
    js(
      `fetch(${JSON.stringify(path)}, ${JSON.stringify({ credentials: "same-origin", ...init })}).then(async r => ({status: r.status, body: await r.json().catch(()=>null)}))`,
    );

  console.log("The list");
  check(
    "the page opens for an admin and lists posts",
    await open(admin.cookie),
  );
  const rows = await js(
    `document.querySelectorAll("#admin-posts > li").length`,
  );
  check("rows are drawn", rows > 0, `rows ${rows}`);
  check(
    "the count line is shown",
    /Showing 1-\d+ of \d+/.test(await text("#admin-count")),
    await text("#admin-count"),
  );

  console.log("The form: help and examples");
  await click("#admin-new");
  check(
    "the form opens",
    (await js(`!document.querySelector("#admin-editor").hidden`)) === true,
  );
  const ph = await js(
    `["#admin-title","#admin-slug","#admin-description","#admin-tags","#admin-categories","#admin-body"].map(s=>document.querySelector(s).placeholder)`,
  );
  check(
    "every free field carries an example",
    ph.every((p) => p && p.length > 2),
    JSON.stringify(ph),
  );
  check(
    "the audience is explained",
    (await js(
      `document.body.innerText.includes("Every signed-in member") && document.body.innerText.includes("A draft and a post with a future date")`,
    )) === true,
  );
  const options = await js(
    `[...document.querySelectorAll("#admin-audience option")].map(o=>o.value+":"+o.textContent)`,
  );
  check(
    "three audience options",
    options.length === 3,
    JSON.stringify(options),
  );
  check(
    "the suggestions of tags are offered",
    (await js(
      `document.querySelectorAll('[data-terms-for="admin-tags"] button').length`,
    )) > 0,
  );

  console.log("Validation");
  await submit();
  check(
    "an empty form is refused with marked fields",
    await until(`!document.querySelector('[data-error-for="title"]').hidden`),
  );
  check(
    "and nothing was created",
    (await api("/api/admin/posts?q=zzzz-nothing")).body.total === 0,
  );

  console.log("Create, preview, public");
  const slug = "form-check-one";
  await set("#admin-title", "Проверка формы");
  await set("#admin-slug", slug);
  await set("#admin-description", "Описание проверки");
  await set("#admin-tags", "проверка, форма");
  await set("#admin-categories", "статьи");
  await set("#admin-body", "## Раздел\n\nТекст *проверки*.");
  await click("#admin-preview-button");
  check(
    "the preview shows the render",
    await until(
      `document.querySelector("#admin-preview h2") !== null && document.querySelector("#admin-preview em") !== null`,
    ),
  );
  await submit();
  check(
    "a saved post is reported as on the site",
    await until(
      `/on the site/i.test(document.querySelector("#admin-status").innerText)`,
    ),
    await status(),
  );
  // The spec asks for a saved entry to be on the site within 10 seconds for a visitor, so the check waits up to 5. A
  // first answer of 404 was seen in 2 of about 30 runs on the development machine; the cause is not established (the
  // database runs in a VM whose clock may differ from this machine's, and an entry dated "now" would be for that moment
  // in its future - a suspect, not a finding). The wait keeps the check honest to the spec and prints how long it took.
  const startedWaiting = Date.now();
  let pub = await api(`/api/posts/${slug}`);
  while (pub.status !== 200 && Date.now() - startedWaiting < 5000) {
    await sleep(200);
    pub = await api(`/api/posts/${slug}`);
  }
  check(
    "the post is public at once",
    pub.status === 200,
    `status ${pub.status}`,
  );
  if (pub.status === 200 && Date.now() - startedWaiting > 500) {
    console.log(
      `  note   it took ${Date.now() - startedWaiting} ms to be public`,
    );
  }
  await set("#admin-query", slug);
  await js(`document.querySelector("#admin-search").requestSubmit()`);
  check(
    "it appears in the list on search",
    await until(`document.querySelectorAll("#admin-posts > li").length === 1`),
  );

  console.log("Restricted audience and named people");
  await click("#admin-posts [data-edit]");
  check(
    "the edit form opens with the address locked",
    await until(
      `!document.querySelector("#admin-editor").hidden && document.querySelector("#admin-slug").readOnly`,
    ),
  );
  await set("#admin-audience", "restricted");
  check(
    "the statuses and the people appear for restricted",
    (await js(`!document.querySelector("#admin-restricted").hidden`)) === true,
  );
  await js(
    `document.querySelector('input[name="statuses"][value="student"]').click()`,
  );
  await set("#admin-user-query", "student");
  await click("#admin-user-find");
  check(
    "a person is found by name",
    await until(
      `document.querySelectorAll("#admin-user-results li button").length >= 1`,
    ),
  );
  await js(`document.querySelector("#admin-user-results li button").click()`);
  check(
    "the number is put into the field",
    (await js(`document.querySelector("#admin-user-ids").value`)).includes(
      String(student.id),
    ),
  );
  await submit();
  check(
    "the restricted save is reported",
    await until(
      `/only those it is open to/i.test(document.querySelector("#admin-status").innerText)`,
    ),
    await status(),
  );
  const saved = (await api(`/api/admin/posts?q=${slug}`)).body.items[0];
  const full = (await api(`/api/admin/posts/${saved.id}`)).body.post;
  check(
    "the server holds audience, statuses and people",
    full.audience === "restricted" &&
      full.statuses.includes("student") &&
      full.userIds.includes(student.id),
    JSON.stringify([full.audience, full.statuses, full.userIds]),
  );

  console.log("Conflict");
  await click("#admin-posts [data-edit]");
  await until(`!document.querySelector("#admin-editor").hidden`);
  await api(`/api/admin/posts/${saved.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "If-Match": full.updatedAt },
    body: JSON.stringify({ title: "Изменено другим редактором" }),
  });
  await set("#admin-title", "Мой вариант");
  await submit();
  check(
    "a stale save is refused with the explanation",
    await until(
      `/changed or deleted since you opened it/i.test(document.querySelector("#admin-status").innerText)`,
    ),
    await status(),
  );
  check(
    "the form keeps the editor's text",
    (await js(`document.querySelector("#admin-title").value`)) ===
      "Мой вариант" &&
      (await js(`!document.querySelector("#admin-editor").hidden`)) === true,
  );
  check(
    "and the other editor's title is what the server has",
    (await api(`/api/admin/posts/${saved.id}`)).body.post.title ===
      "Изменено другим редактором",
  );
  await click("#admin-cancel");

  console.log("An address already taken");
  await click("#admin-new");
  await set("#admin-title", "Двойник");
  await set("#admin-slug", slug);
  await set("#admin-date", "2026-01-01T10:00");
  await set("#admin-body", "Текст.");
  await submit();
  check(
    "the next free address is proposed",
    await until(`document.querySelector("#admin-slug").value === "${slug}-2"`),
    await js(`document.querySelector("#admin-slug").value`),
  );
  await click("#admin-cancel");

  console.log("Delete and restore");
  await js(`window.confirm = () => true`);
  await set("#admin-query", slug);
  await js(`document.querySelector("#admin-search").requestSubmit()`);
  await until(`document.querySelectorAll("#admin-posts > li").length === 1`);
  await click("#admin-posts [data-delete]");
  check(
    "a deleted post leaves the list",
    await until(`document.querySelectorAll("#admin-posts > li").length === 0`),
  );
  check(
    "and the public route",
    (await api(`/api/posts/${slug}`)).status === 404,
  );
  await js(
    `(()=>{const c=document.querySelector("#admin-deleted");c.checked=true;c.dispatchEvent(new Event("change",{bubbles:true}))})()`,
  );
  check(
    "it is in the list of deleted ones with a restore button",
    await until(
      `document.querySelectorAll("#admin-posts > li").length === 1 && !document.querySelector("#admin-posts [data-restore]").hidden && document.querySelector("#admin-posts [data-edit]").hidden`,
    ),
  );
  await click("#admin-posts [data-restore]");
  check(
    "restoring brings it back",
    await until(
      `/restored/i.test(document.querySelector("#admin-status").innerText)`,
    ),
    await status(),
  );

  console.log("Who the post is open to");
  await open(admin.cookie);
  await click("#admin-new");
  check(
    "the block of the chosen is on the page and greyed out until they are chosen",
    (await js(
      `(()=>{const f=document.querySelector("#admin-restricted");return !f.hidden && f.disabled && f.getBoundingClientRect().height > 0})()`,
    )) === true,
  );
  await set("#admin-audience", "restricted");
  check(
    "choosing 'only the chosen' makes it work",
    (await js(
      `document.querySelector("#admin-restricted").disabled === false`,
    )) === true,
  );
  await click("#admin-cancel");

  console.log("Pictures");
  await click("#admin-new");
  await js(`document.querySelector("#admin-images").open = true`);
  const chooseImage = async (path) => {
    const doc = await cdp("DOM.getDocument", { depth: 0 });
    const found = await cdp("DOM.querySelector", {
      nodeId: doc.result.root.nodeId,
      selector: "#admin-image-file",
    });
    await cdp("DOM.setFileInputFiles", {
      files: [path],
      nodeId: found.result.nodeId,
    });
  };
  await chooseImage(textFile);
  await click("#admin-image-upload");
  check(
    "a file that is not a picture is refused with a reason",
    await until(
      `/not a PNG, JPEG, WebP or GIF/i.test(document.querySelector("#admin-image-status").innerText)`,
    ),
    await text("#admin-image-status"),
  );
  await js(
    `(()=>{const a=document.querySelector("#admin-body");a.value="Before.";a.focus();a.setSelectionRange(7,7)})()`,
  );
  await chooseImage(pngFile);
  await click("#admin-image-upload");
  check(
    "a picture is uploaded and put into the text where the cursor was",
    await until(
      `document.querySelector("#admin-body").value.includes("](/images/u/") && document.querySelector("#admin-body").value.startsWith("Before.")`,
    ),
    await js(`document.querySelector("#admin-body").value`),
  );
  const address = await js(
    `(()=>{const v=document.querySelector("#admin-body").value;const i=v.indexOf("](/images/u/");return i<0?"":v.slice(i+2,v.indexOf(")",i))})()`,
  );
  const served = await api(address, {});
  check(
    "the address is served to anyone",
    served.status === 200,
    String(served.status),
  );
  check(
    "the list shows it with its thumbnail and the buttons",
    await until(
      `document.querySelectorAll("#admin-image-list > li").length === 1 && !!document.querySelector("#admin-image-list [data-insert]")`,
    ),
  );
  await set("#admin-image-url", "http://insecure.example/pic.png");
  await click("#admin-image-url-insert");
  check(
    "an address that is not https is refused",
    await until(`!document.querySelector("#admin-image-url-error").hidden`),
  );
  await set("#admin-image-url", "https://example.com/pic.jpg");
  await click("#admin-image-url-insert");
  check(
    "an https address from the internet is put into the text",
    (await js(
      `document.querySelector("#admin-body").value.includes("(https://example.com/pic.jpg)")`,
    )) === true,
  );
  await set("#admin-title", "Запись с картинкой");
  await set("#admin-slug", "post-with-picture");
  await set("#admin-description", "d");
  await submit();
  check(
    "the post with the picture is saved, and its page carries the image",
    await until(
      `/on the site/i.test(document.querySelector("#admin-status").innerText)`,
    ),
    await status(),
  );
  let pagehtml = "";
  for (let i = 0; i < 25 && !pagehtml.includes(address); i += 1) {
    pagehtml = await (await fetch(`${BASE}/posts/post-with-picture/`)).text();
    if (!pagehtml.includes(address)) await sleep(200);
  }
  check("the public page has the picture", pagehtml.includes(address), "");
  await click("#admin-cancel");

  console.log("Russian");
  check("the page opens in Russian", await open(admin.cookie, "ru"));
  await click("#admin-new");
  const ruHelp = await js(
    `document.body.innerText.includes("Все вошедшие участники") && document.body.innerText.includes("Черновик и запись с будущей датой")`,
  );
  check("the explanation reads in Russian", ruHelp === true);
  check(
    "the options are Russian",
    (
      await js(
        `[...document.querySelectorAll("#admin-audience option")].map(o=>o.textContent).join("|")`,
      )
    ).includes("Все посетители"),
  );
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
  rmSync(volume, { recursive: true, force: true });
  rmSync(pngFile, { force: true });
  rmSync(textFile, { force: true });
  rmSync(profile, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 300,
  });
}
console.log(
  `\ncheck:admin-posts: ${passed} passed, ${failures.length} failed${failures.length ? ": " + failures.join("; ") : ""}`,
);
process.exit(failures.length ? 1 : 0);
