// Browser check of the videos page of the admin panel, /admin/videos/, driven through the DevTools protocol of headless
// Edge (T175 of specs/001-self-hosted-club-site). The sister of check-admin-posts.mjs, which says how it works.
//
// Run: npm run check:admin-videos (builds the site and the backend first, then runs this with `--env-file=.env` and
// Node's --experimental-websocket flag). Needs the development database (compose.dev.yml) and Microsoft Edge at the
// path below. Both ports are chosen at run time (check-lang.mjs says why).
//
// What it does: starts its OWN server (the built site behind the real backend) with a throwaway database holding the
// repository's content and a throwaway video volume, with the upload cap set to 1 MiB and the free-space reserve to 0,
// signs in an administrator by planting a session, and drives the form: the way to the page from the account page, a
// free video that needs its link, a paid lecture whose text carries a YouTube address, a paid lecture with no source
// yet, the upload of a file (faststart, not faststart, over the room), the replacement of a file by a link and back
// (confirmed), a paid link that is shown to the editor only (changed 2026-10-12), the list of deleted ones, and the Russian page. Everything it
// made - the throwaway database, the volume, the server, the browser and its profile folder - is removed when it ends,
// also when it fails.
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
const MiB = 1024 * 1024;

// An MP4 built box by box, as the server's own tests do: the index before the media data or after it.
function box(type, payload = Buffer.alloc(8)) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + payload.length, 0);
  head.write(type, 4, "latin1");
  return Buffer.concat([head, payload]);
}
const fastMp4 = (media = 64) =>
  Buffer.concat([box("ftyp"), box("moov"), box("mdat", Buffer.alloc(media))]);
const slowMp4 = () =>
  Buffer.concat([box("ftyp"), box("mdat", Buffer.alloc(64)), box("moov")]);

const work = mkdtempSync(join(tmpdir(), "edge-admin-videos-"));
const volume = join(work, "volume");
const files = join(work, "files");
const profile = join(work, "profile");
mkdirSync(volume);
mkdirSync(files);
writeFileSync(join(files, "fast.mp4"), fastMp4());
writeFileSync(join(files, "slow.mp4"), slowMp4());
writeFileSync(
  join(files, "big.mp4"),
  Buffer.concat([fastMp4(), Buffer.alloc(2 * MiB)]),
);

const db = await createTestDatabase();
await importContent(db.pool, {
  postsDir: join(root, "src/content/posts/"),
  videoDir: join(root, "src/content/video/"),
});
const admin = await (async () => {
  const r = await db.pool.query(
    `insert into users (email, display_name, status) values ('admin@example.test', 'admin', 'admin') returning id`,
  );
  const { id: cookie } = await createSession(db.pool, {
    userId: Number(r.rows[0].id),
    status: "admin",
    limited: false,
  });
  return { id: Number(r.rows[0].id), cookie };
})();
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
      VIDEO_UPLOAD_CAP_MB: "1",
      VIDEO_FREE_RESERVE_MB: "0",
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
    "--window-size=1100,1100",
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
  await cdp("DOM.enable");
  const until = async (expr, ms = 10000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await js(expr)) return true;
      await sleep(100);
    }
    return false;
  };
  const signIn = async (lang = "en") => {
    await cdp("Network.clearBrowserCookies");
    await cdp("Network.setCookie", {
      name: "__Host-session",
      value: admin.cookie,
      url: BASE + "/",
      path: "/",
      secure: true,
      httpOnly: true,
    });
    await cdp("Page.navigate", { url: BASE + "/robots.txt" });
    await sleep(300);
    await js(`localStorage.setItem("kb-lang", "${lang}")`);
  };
  const openVideos = async () => {
    await cdp("Page.navigate", { url: BASE + "/admin/videos/" });
    const ok = await until(
      `document.readyState === "complete" && document.querySelector("#admin-list") && !document.querySelector("#admin-list").hidden`,
    );
    await js(`window.confirm = () => true`);
    return ok;
  };
  const text = (sel) =>
    js(`document.querySelector(${JSON.stringify(sel)})?.innerText ?? ""`);
  const set = (sel, v) =>
    js(
      `(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.value=${JSON.stringify(v)};e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}))})()`,
    );
  const tick = (sel, on) =>
    js(
      `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(e.checked!==${on}){e.click()}})()`,
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
  const chooseFile = async (path) => {
    const doc = await cdp("DOM.getDocument", { depth: 0 });
    const found = await cdp("DOM.querySelector", {
      nodeId: doc.result.root.nodeId,
      selector: "#admin-file",
    });
    await cdp("DOM.setFileInputFiles", {
      files: [path],
      nodeId: found.result.nodeId,
    });
  };
  const uploadStatus = () => text("#admin-upload-status");

  console.log("The way to the page");
  await signIn();
  await cdp("Page.navigate", { url: BASE + "/auth/account/" });
  await until(`document.readyState === "complete"`);
  await sleep(500);
  check(
    "the account page of an administrator links to the videos page",
    (await js(`!!document.querySelector('a[href="/admin/videos/"]')`)) === true,
  );
  check("the page opens and lists videos", await openVideos());
  check(
    "the navigation of the panel names the page",
    (await js(
      `document.querySelector('nav [aria-current="page"]')?.innerText.trim()`,
    )) === "Videos",
  );
  check(
    "the rows are drawn",
    (await js(`document.querySelectorAll("#admin-videos > li").length`)) > 0,
  );

  console.log("A free video needs its link");
  await click("#admin-new");
  check(
    "the form opens and the file box is not offered before the first save",
    (await js(
      `!document.querySelector("#admin-editor").hidden && document.querySelector("#admin-file-box").hidden`,
    )) === true,
  );
  const freeSlug = "video-check-free";
  await set("#admin-title", "Бесплатное видео");
  await set("#admin-slug", freeSlug);
  await set("#admin-description", "Описание");
  await set("#admin-body", "Текст под плеером.");
  await submit();
  check(
    "saving without a link is refused on the source",
    await until(`!document.querySelector('[data-error-for="source"]').hidden`),
    await status(),
  );
  await set("#admin-provider", "youtube");
  // Added 2026-10-12 (T175): a text that is not an address of the chosen host is refused with a hint, and the
  // hint under the field follows the host.
  await set("#admin-reference", "not an address at all");
  await submit();
  check(
    "a reference that is no address of the host is refused at the save",
    await until(
      `!document.querySelector('[data-error-for="source"]').hidden && /does not look like an address/i.test(document.querySelector('[data-error-for="source"]').innerText)`,
    ),
    await status(),
  );
  check(
    "the hint under the field names where to get the address",
    (await js(
      `/YouTube/.test(document.querySelector("#admin-reference-help").innerText)`,
    )) === true,
  );
  // A pasted watch address is reduced to the id.
  await set(
    "#admin-reference",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5",
  );
  await submit();
  check(
    "with the link it is saved and reported as on the site",
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
  let publicAnswer = await api(`/api/videos/${freeSlug}`);
  while (publicAnswer.status !== 200 && Date.now() - startedWaiting < 5000) {
    await sleep(200);
    publicAnswer = await api(`/api/videos/${freeSlug}`);
  }
  if (publicAnswer.status === 200 && Date.now() - startedWaiting > 500) {
    console.log(
      `  note   it took ${Date.now() - startedWaiting} ms to be public`,
    );
  }
  check(
    "the video is public at once",
    publicAnswer.status === 200,
    JSON.stringify(publicAnswer).slice(0, 300),
  );

  console.log("A paid lecture: the text, then no source yet");
  await click("#admin-new");
  await tick("#admin-paid", true);
  check(
    "the members-only block is offered for a paid lecture",
    (await js(`!document.querySelector("#admin-members-box").hidden`)) === true,
  );
  const paidSlug = "video-check-paid";
  await set("#admin-title", "Платная лекция");
  await set("#admin-slug", paidSlug);
  await set(
    "#admin-body",
    "Смотрите https://www.youtube.com/watch?v=dQw4w9WgXcQ здесь.",
  );
  await submit();
  check(
    "a YouTube address in a paid lecture's text is refused with a reason",
    (await until(
      `!document.querySelector('[data-error-for="body"]').hidden`,
    )) && /YouTube/.test(await text('[data-error-for="body"]')),
    await text('[data-error-for="body"]'),
  );
  await set("#admin-body", "Текст платной лекции.");
  await set("#admin-members-only", "Материалы только для участников.");
  await submit();
  check(
    "without the address it is saved and the form stays open as a saved video",
    await until(
      `!document.querySelector("#admin-file-box").hidden && document.querySelector("#admin-slug").readOnly`,
    ),
    await status(),
  );
  check(
    "the source is said to be absent",
    /no source yet/i.test(await text("#admin-source-state")),
    await text("#admin-source-state"),
  );
  check(
    "the free space of the server is shown",
    await until(
      `/Free on the server/i.test(document.querySelector("#admin-space").innerText)`,
    ),
    await text("#admin-space"),
  );

  console.log("The file");
  await chooseFile(join(files, "slow.mp4"));
  await click("#admin-upload");
  check(
    "a file that cannot start before it is downloaded is explained, with the repair command",
    await until(
      `/ffmpeg/.test(document.querySelector("#admin-upload-status").innerText)`,
    ),
    await uploadStatus(),
  );
  await chooseFile(join(files, "big.mp4"));
  await click("#admin-upload");
  check(
    "a file over the room is refused before it is sent",
    await until(
      `/larger than allowed/i.test(document.querySelector("#admin-upload-status").innerText)`,
    ),
    await uploadStatus(),
  );
  await chooseFile(join(files, "fast.mp4"));
  await click("#admin-upload");
  check(
    "a good file is uploaded and checked",
    await until(
      `/uploaded and checked/i.test(document.querySelector("#admin-upload-status").innerText)`,
    ),
    await uploadStatus(),
  );
  check(
    "the source now says a file on the server",
    /file on the server/i.test(await text("#admin-source-state")),
    await text("#admin-source-state"),
  );
  const paid = (await api(`/api/admin/videos?q=${paidSlug}`)).body.items[0];
  const paidFull = (await api(`/api/admin/videos/${paid.id}`)).body.video;
  check(
    "the server holds a file source and a members-only block",
    paidFull.source.kind === "file" &&
      paidFull.membersOnly === "Материалы только для участников.",
    JSON.stringify(paidFull.source),
  );

  console.log("File to link, and the saved link is shown to the editor only");
  await set("#admin-provider", "vimeo");
  await set("#admin-reference", "https://vimeo.com/123456789/abcdef1234");
  await click("#admin-set-link");
  check(
    "a link replaces the file after the confirmation",
    await until(
      `/link: Vimeo/i.test(document.querySelector("#admin-source-state").innerText)`,
    ),
    await text("#admin-source-state"),
  );
  // Changed 2026-10-12 (the owner's order): the editor sees the saved link of a paid lecture and can change it; the
  // list the page is built from, and everything public, still never carry it.
  check(
    "the paid link is shown in the field of the editor",
    (await js(
      `document.querySelector("#admin-reference").value === "123456789/abcdef1234"`,
    )) === true,
  );
  const after = (await api(`/api/admin/videos/${paid.id}`)).body.video;
  const listed = JSON.stringify((await api(`/api/admin/videos?limit=50`)).body);
  check(
    "the editor's answer has it, the list and the public route have not",
    after.source.kind === "link" &&
      after.source.reference === "123456789/abcdef1234" &&
      !listed.includes("123456789/abcdef1234") &&
      !JSON.stringify((await api(`/api/videos/${paidSlug}`)).body).includes(
        "123456789/abcdef1234",
      ),
    JSON.stringify(after.source),
  );
  // Added 2026-10-12: reopened, the provider list names the saved provider (it used to fall back to YouTube, which
  // made a lecture on another host look like a YouTube one).
  await click("#admin-cancel");
  // The list is put back to YouTube first, so only a real reopen can make it say Vimeo again.
  await set("#admin-provider", "youtube");
  await set("#admin-query", paidSlug);
  await js(`document.querySelector("#admin-search").requestSubmit()`);
  await until(`document.querySelectorAll("#admin-videos > li").length === 1`);
  await click("#admin-videos [data-edit]");
  check(
    "a reopened video shows its saved provider in the list",
    await until(
      `!document.querySelector("#admin-editor").hidden && document.querySelector("#admin-provider").value === "vimeo" && document.querySelector("#admin-reference").value === "123456789/abcdef1234" && /link: Vimeo/i.test(document.querySelector("#admin-source-state").innerText)`,
    ),
    await js(`document.querySelector("#admin-provider").value`),
  );
  await chooseFile(join(files, "fast.mp4"));
  await click("#admin-upload");
  check(
    "a file replaces the link after the confirmation",
    await until(
      `/uploaded and checked/i.test(document.querySelector("#admin-upload-status").innerText)`,
    ),
    await uploadStatus(),
  );

  console.log("A free video's link is shown, and a stale save is refused");
  await click("#admin-cancel");
  await set("#admin-query", freeSlug);
  await js(`document.querySelector("#admin-search").requestSubmit()`);
  // The row must be the free video's: the list before the search held one row too (the lecture just reopened).
  await until(
    `document.querySelectorAll("#admin-videos > li").length === 1 && document.querySelector("#admin-videos [data-slug]").innerText === ${JSON.stringify(freeSlug)}`,
  );
  await click("#admin-videos [data-edit]");
  check(
    "the free video's link is shown to the editor",
    await until(
      `/dQw4w9WgXcQ/.test(document.querySelector("#admin-source-state").innerText)`,
    ),
    await text("#admin-source-state"),
  );
  const free = (await api(`/api/admin/videos?q=${freeSlug}`)).body.items[0];
  const freeFull = (await api(`/api/admin/videos/${free.id}`)).body.video;
  await api(`/api/admin/videos/${free.id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "If-Match": freeFull.updatedAt,
    },
    body: JSON.stringify({ title: "Изменено другим редактором" }),
  });
  await set("#admin-title", "Мой вариант");
  await submit();
  check(
    "a stale save is refused and the form keeps the text",
    (await until(
      `/changed or deleted since you opened it/i.test(document.querySelector("#admin-status").innerText)`,
    )) &&
      (await js(`document.querySelector("#admin-title").value`)) ===
        "Мой вариант",
    await status(),
  );
  await click("#admin-cancel");

  console.log("A copy, and the source in the list");
  await click("#admin-videos [data-copy]");
  check(
    "a copy is made as a draft with the same link",
    await until(
      `/copy is made as a draft/i.test(document.querySelector("#admin-status").innerText)`,
    ),
    await status(),
  );
  const copies = (await api(`/api/admin/videos?q=${freeSlug}-copy`)).body.items;
  check(
    "the list names the source of each video",
    copies.length === 1 &&
      copies[0].audience === "hidden" &&
      copies[0].source.kind === "link" &&
      (await js(
        `document.querySelector("#admin-videos").innerText.includes("YouTube")`,
      )) === true,
    JSON.stringify(copies[0]?.source),
  );
  if (copies[0] !== undefined) {
    await api(`/api/admin/videos/${copies[0].id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log("Delete and restore");
  await set("#admin-query", freeSlug);
  await js(`document.querySelector("#admin-search").requestSubmit()`);
  await until(`document.querySelectorAll("#admin-videos > li").length === 1`);
  await click("#admin-videos [data-delete]");
  check(
    "a deleted video leaves the list and the public route",
    (await until(
      `document.querySelectorAll("#admin-videos > li").length === 0`,
    )) && (await api(`/api/videos/${freeSlug}`)).status === 404,
  );
  await js(
    `(()=>{const c=document.querySelector("#admin-deleted");c.checked=true;c.dispatchEvent(new Event("change",{bubbles:true}))})()`,
  );
  await until(
    `document.querySelectorAll("#admin-videos > li").length === 1 && !document.querySelector("#admin-videos [data-restore]").hidden`,
  );
  await click("#admin-videos [data-restore]");
  check(
    "restoring brings it back",
    await until(
      `/restored/i.test(document.querySelector("#admin-status").innerText)`,
    ),
    await status(),
  );

  console.log("Russian");
  await signIn("ru");
  check("the page opens in Russian", await openVideos());
  await click("#admin-new");
  check(
    "the labels and the explanations read in Russian",
    (await js(
      `document.body.innerText.includes("Платная лекция") && document.body.innerText.includes("Источник видео") && document.body.innerText.includes("Все вошедшие участники")`,
    )) === true,
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
  // The browser holds its files for a moment after it is told to stop, so the removal retries.
  rmSync(work, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 300,
  });
}
console.log(
  `\ncheck:admin-videos: ${passed} passed, ${failures.length} failed${failures.length ? ": " + failures.join("; ") : ""}`,
);
process.exit(failures.length ? 1 : 0);
