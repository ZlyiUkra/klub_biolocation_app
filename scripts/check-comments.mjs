// Browser check of the comments block under a post and a video, driven through the DevTools protocol of headless Edge
// (T106 of specs/001-self-hosted-club-site; FR-032, T151, the owner's decisions of 2026-10-13). The sister of
// check-admin-videos.mjs, which says how this kind of script works.
//
// Run: npm run check:comments (builds the site and the backend first, then runs this with `--env-file=.env` and Node's
// --experimental-websocket flag). Needs the development database (compose.dev.yml) and Microsoft Edge at the path
// below. Both ports are chosen at run time (check-lang.mjs says why). With KB_SHOT_DIR set to a folder it also writes
// screenshots of the block there, for the owner's comparison with the previous service's look.
//
// What it does: starts its OWN server (the built site behind the real backend) with a throwaway database holding the
// repository's content, plants the sessions of a student, a guest account and a metr, and drives the page: a signed-out
// visitor sees the block and a sign-in prompt; a student writes, the comment appears first with markup shown as text,
// is changed and deleted; a metr hides and restores another's comment and a reader never sees it; a paid lecture shown
// as a card carries the block for a guest; the count is written in Russian when the page is; nothing of the previous
// service is on the page. Everything it made - the database, the server, the browser and its profile - is removed when
// it ends, also when it fails.
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
const PORT = await freePort(),
  BASE = `http://127.0.0.1:${PORT}`,
  CDP = await freePort();
const SHOTS = process.env.KB_SHOT_DIR ?? "";

const work = mkdtempSync(join(tmpdir(), "edge-comments-"));
const profile = join(work, "profile");
mkdirSync(profile);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const db = await createTestDatabase();
await importContent(db.pool, {
  postsDir: join(root, "src/content/posts/"),
  videoDir: join(root, "src/content/video/"),
});
const accounts = {};
for (const [key, status, name, until] of [
  ["student", "student", "Anna Student", "(now() + interval '30 days')::date"],
  ["guest", "guest", "Gary Guest", null],
  ["metr", "metr", "Mark Maitre", null],
]) {
  const r = await db.pool.query(
    `insert into users (email, display_name, status, access_until)
     values ($1, $2, $3, ${until ?? "null"}) returning id`,
    [`${key}@example.test`, name, status],
  );
  const { id: cookie } = await createSession(db.pool, {
    userId: Number(r.rows[0].id),
    status,
    limited: false,
  });
  accounts[key] = { id: Number(r.rows[0].id), cookie };
}
// A paid lecture shown to a signed-out visitor as a card only: the audience "members" with a teaser.
await db.pool.query(
  `select store_video('comments-check-lecture', 'Closed lecture', '', false, '2026-01-01T00:00:00Z'::timestamptz,
                      false, 'd', '<p>d</p>', '[]'::jsonb, null, null, 'youtube', null, true, null, '{}', '{}', 1)`,
);
await db.pool.query(
  `update entries set audience = 'members', teaser = true where kind = 'video' and slug = 'comments-check-lecture'`,
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
  // A public post found through the API, as a visitor would: this script reads no content table (the access boundary).
  const postSlug = (await (await fetch(BASE + "/api/posts")).json()).items[0]
    .slug;
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
    const ok = await until(
      `(() => { const s = document.querySelector('#comments [data-role="status"]'); return !!s && !/Loading|Загружаем/i.test(s.innerText) || (s && s.hidden); })()`,
    );
    await js(`window.confirm = () => true`);
    return ok;
  };
  const text = (sel) =>
    js(`document.querySelector(${JSON.stringify(sel)})?.innerText ?? ""`);
  const count = () => text('#comments [data-role="count"]');
  const bodies = () =>
    js(
      `[...document.querySelectorAll("#comments .comment-body")].map((e) => e.innerText)`,
    );
  const shot = async (name) => {
    if (!SHOTS) return;
    const box = await js(
      `(() => { const r = document.querySelector("#comments").getBoundingClientRect(); return { x: 0, y: r.top + scrollY - 20, width: innerWidth, height: Math.min(r.height + 40, 1200) }; })()`,
    );
    const r = await cdp("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      clip: { ...box, scale: 1 },
    });
    writeFileSync(
      join(SHOTS, name + ".png"),
      Buffer.from(r.result.data, "base64"),
    );
  };
  const api = (path, init) =>
    js(
      `fetch(${JSON.stringify(path)}, ${JSON.stringify({ credentials: "same-origin", ...init })}).then(async r => ({status: r.status, body: await r.json().catch(()=>null)}))`,
    );

  const typed =
    '<img src=x onerror="window.__pwned=1"> <b>bold</b>\nsecond line';

  console.log("A signed-out visitor");
  await as(null);
  check(
    "the post opens with the comments block",
    await open(`/posts/${postSlug}/`),
  );
  check(
    "the block is there with a count and no previous service",
    (await js(`!!document.querySelector("#comments")`)) === true &&
      /^0 Comments$/.test(await count()) &&
      (await js(
        `!document.documentElement.outerHTML.toLowerCase().includes("disqus")`,
      )) === true,
    await count(),
  );
  check(
    "the field is closed and a sign-in link is offered",
    (await js(
      `document.querySelector('#comments [data-role="field"]').readOnly`,
    )) === true &&
      (await js(
        `!!document.querySelector('#comments [data-role="account"] a[href^="/auth/signin/"]')`,
      )) === true &&
      /Sign in/i.test(await text('#comments [data-role="note"]')),
  );
  await shot("1-signed-out");

  // Added 2026-10-13 (T106, the owner's word): the button above the block.
  const panelHidden = () =>
    js(`document.querySelector('#comments [data-role="panel"]').hidden`);
  const toggleLabel = () => text('#comments [data-role="toggle"]');
  const toggleState = () =>
    js(
      `document.querySelector('#comments [data-role="toggle"]').getAttribute("aria-expanded")`,
    );
  check(
    "the hide button is shown above the block, and the thread is shown",
    (await js(
      `document.querySelector('#comments [data-role="toggle-row"]').hidden === false`,
    )) === true &&
      /^Hide comments$/.test(await toggleLabel()) &&
      (await panelHidden()) === false &&
      (await toggleState()) === "true",
    await toggleLabel(),
  );
  await js(`document.querySelector('#comments [data-role="toggle"]').click()`);
  check(
    "pressed, it hides the thread and the count and offers to show them",
    (await panelHidden()) === true &&
      /^Show comments$/.test(await toggleLabel()) &&
      (await toggleState()) === "false" &&
      (await js(
        `document.querySelector('#comments [data-role="count"]').offsetParent === null`,
      )) === true,
    await toggleLabel(),
  );
  await js(`document.querySelector('#comments [data-role="toggle"]').click()`);
  check(
    "pressed again, it brings them back",
    (await panelHidden()) === false &&
      /^Hide comments$/.test(await toggleLabel()) &&
      (await toggleState()) === "true",
  );

  // Added 2026-10-13 (T187): the six reactions above the count.
  const reactionsNow = () =>
    js(`(() => {
      const root = document.querySelector('#comments [data-role="reactions"]');
      const note = root.querySelector('[data-role="reactions-note"]');
      return {
        title: root.querySelector(".reactions-title").innerText,
        total: root.querySelector('[data-role="reactions-total"]').innerText,
        labels: [...root.querySelectorAll(".reaction-label")].map((e) => e.innerText).join(","),
        counts: Object.fromEntries([...root.querySelectorAll("button[data-reaction]")].map((b) => [b.dataset.reaction, Number(b.querySelector('[data-role="reaction-count"]').textContent)])),
        pressed: [...root.querySelectorAll('button[aria-pressed="true"]')].map((b) => b.dataset.reaction).join(","),
        closed: root.querySelector("button").getAttribute("aria-disabled"),
        note: note.hidden ? "" : note.innerText,
        pictures: [...root.querySelectorAll("img")].every((i) => i.complete && i.naturalWidth > 0),
      };
    })()`);
  const press = (name) =>
    js(
      `document.querySelector('#comments button[data-reaction="${name}"]').click()`,
    );
  // The script marks the row `ready` once the counts and the viewer are read.
  const reactionsReady = () =>
    until(
      `document.querySelector('#comments [data-role="reactions"]')?.dataset.state === "ready"`,
    );
  await reactionsReady();
  const first = await reactionsNow();
  check(
    "the reactions row: the question, no responses yet, six named pictures that loaded",
    first.title === "What do you think?" &&
      first.total === "0 Responses" &&
      first.labels === "Upvote,Funny,Love,Surprised,Angry,Sad" &&
      first.pictures === true,
    JSON.stringify(first),
  );
  await press("love");
  await sleep(400);
  const afterPress = await reactionsNow();
  check(
    "a signed-out visitor is told to sign in to react, and a press changes nothing",
    /Sign in to react/.test(afterPress.note) &&
      afterPress.pressed === "" &&
      afterPress.counts.love === 0 &&
      afterPress.closed === "true",
    JSON.stringify(afterPress),
  );

  console.log("A student writes, changes and deletes");
  await as("student");
  await open(`/posts/${postSlug}/`);
  check(
    "the field is open and the name is in the head",
    (await js(
      `document.querySelector('#comments [data-role="field"]').readOnly === false`,
    )) === true &&
      (await text('#comments [data-role="account"]')) === "Anna Student",
  );
  // The reactions of a student, before the comments: pick, change, take back, pick again, and keep it for the guest.
  await reactionsReady();
  await press("love");
  check(
    "a student presses a picture: it is marked and the count and the total follow",
    await until(
      `document.querySelector('#comments button[data-reaction="love"]').getAttribute("aria-pressed") === "true"`,
    ),
    JSON.stringify(await reactionsNow()),
  );
  const marked = await reactionsNow();
  check(
    "the marked one has its count and the total says one response",
    marked.counts.love === 1 &&
      marked.total === "1 Response" &&
      marked.closed === "false",
    JSON.stringify(marked),
  );
  await press("funny");
  await until(
    `document.querySelector('#comments button[data-reaction="funny"]').getAttribute("aria-pressed") === "true"`,
  );
  const changed = await reactionsNow();
  check(
    "another picture replaces it: one reaction per account",
    changed.pressed === "funny" &&
      changed.counts.love === 0 &&
      changed.counts.funny === 1 &&
      changed.total === "1 Response",
    JSON.stringify(changed),
  );
  await press("funny");
  await until(
    `document.querySelector('#comments button[aria-pressed="true"]') === null`,
  );
  const taken = await reactionsNow();
  check(
    "pressing the marked one takes it back",
    taken.pressed === "" && taken.total === "0 Responses",
    JSON.stringify(taken),
  );
  await press("love");
  await until(
    `document.querySelector('#comments button[data-reaction="love"]').getAttribute("aria-pressed") === "true"`,
  );
  await open(`/posts/${postSlug}/`);
  await reactionsReady();
  await until(
    `document.querySelector('#comments button[data-reaction="love"]').getAttribute("aria-pressed") === "true"`,
  );
  check(
    "the choice is still there after a reload",
    (await reactionsNow()).pressed === "love",
    JSON.stringify(await reactionsNow()),
  );
  await shot("6-reactions-student");
  await js(`(() => {
    const f = document.querySelector('#comments [data-role="field"]');
    f.focus(); f.value = ${JSON.stringify(typed)};
    f.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#comments form").requestSubmit();
  })()`);
  check(
    "the comment appears first and the count follows",
    (await until(
      `document.querySelectorAll("#comments .comment").length === 1`,
    )) && /^1 Comment$/.test(await count()),
    await count(),
  );
  check(
    "markup is shown as text: no tag was made, nothing ran, the line break stays",
    (await js(
      `document.querySelector("#comments .comment-body").innerText`,
    )) === typed &&
      (await js(
        `document.querySelector("#comments .comment-body img, #comments .comment-body b") === null && window.__pwned === undefined`,
      )) === true,
  );
  await shot("2-one-comment");
  check(
    "the field is empty again",
    (await js(
      `document.querySelector('#comments [data-role="field"]').value`,
    )) === "",
  );

  await open(`/posts/${postSlug}/`);
  check(
    "a reload still has it, with the author's name",
    (await bodies()).length === 1 &&
      /Anna Student/.test(await text("#comments .comment-author")),
  );
  await js(
    `[...document.querySelectorAll("#comments .comment-action")].find((b) => /Edit/.test(b.innerText)).click()`,
  );
  await until(`!!document.querySelector("#comments .comment-editor textarea")`);
  await js(`(() => {
    const t = document.querySelector("#comments .comment-editor textarea");
    t.value = "Changed text";
    document.querySelector("#comments .comment-editor .comments-button:not(.comments-button-quiet)").click();
  })()`);
  check(
    "a change shows at once with the mark",
    (await until(
      `document.querySelector("#comments .comment-body")?.innerText === "Changed text"`,
    )) && /edited/i.test(await text("#comments .comment-head")),
    JSON.stringify(await bodies()),
  );
  await js(
    `[...document.querySelectorAll("#comments .comment-action")].find((b) => /Delete/.test(b.innerText)).click()`,
  );
  check(
    "a deletion removes it and the count goes back to zero",
    (await until(
      `document.querySelectorAll("#comments .comment").length === 0`,
    )) && /^0 Comments$/.test(await count()),
  );

  console.log("A guest account, and a metr who hides");
  await as("student");
  await open(`/posts/${postSlug}/`);
  await api(`/api/entries/post/${postSlug}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: "Worth hiding" }),
  });
  await as("guest");
  await open(`/posts/${postSlug}/`);
  check(
    "a guest account reads the thread and is told why the field is closed",
    (await bodies()).length === 1 &&
      (await js(
        `document.querySelector('#comments [data-role="field"]').readOnly`,
      )) === true &&
      /club members who have access/i.test(
        await text('#comments [data-role="note"]'),
      ),
    await text('#comments [data-role="note"]'),
  );
  // Added 2026-10-13 (T187): the guest account reads the student's reaction in the counts and cannot add its own.
  await until(
    `document.querySelector('#comments button[data-reaction="love"] [data-role="reaction-count"]')?.textContent === "1"`,
  );
  await press("upvote");
  await sleep(400);
  const guestRow = await reactionsNow();
  check(
    "a guest account sees the counts, is told why the row is closed, and a press changes nothing",
    guestRow.counts.love === 1 &&
      guestRow.counts.upvote === 0 &&
      guestRow.closed === "true" &&
      /club members who have access/i.test(guestRow.note),
    JSON.stringify(guestRow),
  );
  await as("metr");
  await open(`/posts/${postSlug}/`);
  await js(
    `[...document.querySelectorAll("#comments .comment-action")].find((b) => /^Hide$/.test(b.innerText)).click()`,
  );
  check(
    "a metr hides it: it stays in their list, marked, and the count drops",
    (await until(
      `document.querySelector("#comments .comment")?.dataset.hidden === "true"`,
    )) && /^0 Comments$/.test(await count()),
    await count(),
  );
  await shot("3-hidden-for-metr");
  await as("guest");
  await open(`/posts/${postSlug}/`);
  check(
    "a reader no longer sees it",
    (await bodies()).length === 0 && /^0 Comments$/.test(await count()),
  );
  await as("metr");
  await open(`/posts/${postSlug}/`);
  await js(
    `[...document.querySelectorAll("#comments .comment-action")].find((b) => /Restore/.test(b.innerText)).click()`,
  );
  check(
    "restoring brings it back",
    (await until(
      `document.querySelector("#comments .comment")?.dataset.hidden === "false"`,
    )) && /^1 Comment$/.test(await count()),
  );

  console.log("A paid lecture shown as a card");
  await api(`/api/entries/video/comments-check-lecture/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: "From the metr" }),
  });
  await as(null);
  check(
    "the locked page opens with the comments block",
    await open(`/video/comments-check-lecture/`),
  );
  check(
    "a signed-out visitor reads the comments under the card and cannot write",
    (await bodies()).length === 1 &&
      (await js(
        `document.querySelector('#comments [data-role="field"]').readOnly`,
      )) === true,
    JSON.stringify(await bodies()),
  );
  await shot("4-locked-lecture");

  console.log("Russian");
  await as("metr", "ru");
  await open(`/posts/${postSlug}/`);
  check(
    "the count and the labels read in Russian",
    /^1 Комментарий$/.test(await count()) &&
      (await js(
        `document.querySelector('#comments [data-role="field"]').placeholder`,
      )) === "Начать обсуждение..." &&
      // Added 2026-10-13 (T106): the hide button's label too.
      /^Скрыть комментарии$/.test(await toggleLabel()),
    await count(),
  );
  // Added 2026-10-13 (T187): the reactions row in Russian, with the Russian plural of the total.
  await reactionsReady();
  const ru = await reactionsNow();
  check(
    "the reactions row reads in Russian",
    ru.title === "Что вы думаете?" &&
      ru.labels === "Нравится,Смешно,Обожаю,Удивление,Злость,Грусть" &&
      /^1 Ответ$/.test(ru.total),
    JSON.stringify(ru),
  );
  await shot("5-russian");

  // Added 2026-10-13 (T187): the block at the widths and themes the owner compares it in, with the student's reaction
  // marked. Only when KB_SHOT_DIR is set; nothing here is checked, the pictures are for the eyes.
  if (SHOTS) {
    console.log("Screenshots for the look comparison");
    await as("student");
    for (const [width, theme] of [
      [1280, "dark"],
      [1280, "light"],
      [400, "dark"],
      [400, "light"],
    ]) {
      await cdp("Emulation.setDeviceMetricsOverride", {
        width,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: width < 600,
      });
      await js(`localStorage.setItem("theme", "${theme}")`);
      await open(`/posts/${postSlug}/`);
      await reactionsReady();
      await sleep(300);
      await shot(`look-${width}-${theme}`);
    }
    await cdp("Emulation.clearDeviceMetricsOverride");
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
  `\ncheck:comments: ${passed} passed, ${failures.length} failed${failures.length ? ": " + failures.join("; ") : ""}`,
);
process.exit(failures.length ? 1 : 0);
