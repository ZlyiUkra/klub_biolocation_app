// Rehearsal of the superuser's three ways of changing hands, on a throwaway copy of the data (T072 of
// specs/001-self-hosted-club-site; SC-010; security-review-superuser.md section 6). Added 2026-10-11.
//
// Run: npm run rehearse:superuser (builds the backend first, then runs this with --env-file=.env). Needs the development
// database (compose.dev.yml), like every check that makes a throwaway database. Port 4391 must be free.
//
// What it does, and the decisions that would otherwise look like mistakes:
// - It makes its OWN database (migrated, with the site's content imported and members of every status), starts the real
//   backend on port 4391 and drops the database at the end. The owner's running application and its data are never
//   touched.
// - Each path ends in a sign-in as the new holder over HTTP, and then uses the same step a second time and expects it
//   to be refused (SC-010: "each completing successfully once and failing safely on a second use").
// - The server command is exercised through the functions the command calls (createSuperuser, setSuperuserPassword,
//   handOverNow) and its `status` through the built command itself. The command asks for a password at a terminal
//   with the echo off and refuses without one, so the prompt cannot be driven from here: that half is for the owner to
//   try by hand once (`npm run superuser -- create <address>`).
// - The cooling period is not waited out: the timer's own function (completeDueHandovers) is called with a moment 25
//   hours ahead, the way main.ts calls it with the real clock.
// - The members are fixtures: the real members file of T055 does not exist yet, so the rehearsal of the production
//   data waits for the switch-day rehearsal (T135).
//
// Added 2026-10-11 (T169, path D: the setup door). The title above says three ways; there are four now. Path D needs a
// database with no superuser, which the first one no longer is after path A, so it makes a SECOND throwaway database
// and starts two more real backends on it: port 4392 with no SETUP_CODE (the door's code is read from the server's log,
// the fallback the owner asked for) and port 4393 with SETUP_CODE and ALLOW_SUPERUSER_SETUP=1 (the emergency switch).
// Ports 4392, 4393 and 4394 must be free as well (4394: the switch with no SETUP_CODE, which is ignored). The first server is started with both variables empty on purpose: a value
// in the owner's .env must not open its door.
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PORT = 4391;
const BASE = `http://127.0.0.1:${PORT}`;
const root = fileURLToPath(new URL("../", import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const imports = (path) => import(pathToFileURL(join(root, path)).href);

const { createTestDatabase } = await imports(
  "server/dist/server/test/helpers/db.js",
);
const { importContent } = await imports(
  "server/dist/server/src/cli/import-content.js",
);
const { createSuperuser, setSuperuserPassword, handOverNow } = await imports(
  "server/dist/server/src/users/superuser.js",
);
const { completeDueHandovers } = await imports(
  "server/dist/server/src/users/handover.js",
);
const { unspentCodeCount } = await imports(
  "server/dist/server/src/users/recovery.js",
);

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(
    `  ${ok ? "ok  " : "FAIL"}  ${name}${ok || !detail ? "" : " - " + detail}`,
  );
}

let counter = 0;
// Changed 2026-10-11 (path D): `base` lets the same helper talk to the extra servers of the setup door rehearsal.
async function api(method, path, body, cookie, base = BASE) {
  const res = await fetch(base + path, {
    method,
    headers: {
      "content-type": "application/json",
      origin: base,
      "x-forwarded-for": `198.51.100.${(counter++ % 240) + 1}`,
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
const signIn = (identifier, password) =>
  api("POST", "/api/auth/signin", { identifier, password });
const viewerOf = async (cookie) =>
  (await api("GET", "/api/auth/me", undefined, cookie)).body.viewer;

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
      // Added 2026-10-11 (path D): empty, so nothing in the owner's .env opens the door of this server.
      SETUP_CODE: "",
      ALLOW_SUPERUSER_SETUP: "",
    },
    stdio: "ignore",
  },
);

// Added 2026-10-11 (path D): one more real backend on a given database, with its output kept so the log line that
// carries the generated setup code can be read.
function startServer(port, databaseUrl, extraEnv) {
  const child = spawn(
    process.execPath,
    [join(root, "server/dist/server/src/main.js")],
    {
      cwd: root,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        PORT: String(port),
        SITE_ORIGIN: `http://127.0.0.1:${port}`,
        ...extraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  return {
    child,
    base: `http://127.0.0.1:${port}`,
    output: () => output,
  };
}
async function waitHealthy(base) {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base + "/healthz")).ok) return;
    } catch {}
    await sleep(500);
  }
  throw new Error(`no answer from ${base}`);
}
const extraServers = [];
let db2 = null;

try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE + "/healthz")).ok) break;
    } catch {}
    await sleep(500);
  }

  const P = {
    first: "rehearsal first password",
    second: "rehearsal second password",
    third: "rehearsal third password",
    fourth: "rehearsal fourth password",
    fifth: "rehearsal fifth password",
    member: "an ordinary member password",
  };
  // Members of every status, the way the site will hold them.
  for (const [key, status] of [
    ["guest", "guest"],
    ["student", "student"],
    ["metr", "metr"],
    ["deputy", "admin"],
    ["second", "admin"],
  ]) {
    const made = await api("POST", "/api/auth/signup", {
      email: `${key}@example.test`,
      password: P.member,
      displayName: `Member ${key}`,
      // Added 2026-10-13 (T188): sign-up wants the time its form was opened; ten seconds ago is a person at a keyboard.
      startedAt: Date.now() - 10_000,
    });
    if (made.status !== 201)
      throw new Error(`sign-up of ${key}: ${made.status}`);
    await db.pool.query("update users set status = $2 where email = $1", [
      `${key}@example.test`,
      status,
    ]);
  }

  // ---- Path A: the server command ----
  console.log("Path A: the server command");
  const made = await createSuperuser(db.pool, {
    email: "owner@example.test",
    password: P.first,
  });
  check(
    "create makes the superuser and ten recovery codes",
    made.ok === true && made.codes?.length === 10,
  );
  const holder1 = await signIn("owner@example.test", P.first);
  check(
    "sign-in as the new superuser: the viewer is a superuser and an admin",
    holder1.status === 200 &&
      holder1.body.viewer?.superuser === true &&
      holder1.body.viewer?.status === "admin",
  );
  const again = await createSuperuser(db.pool, {
    email: "someone@example.test",
    password: P.first,
  });
  check(
    "second use: create is refused while a superuser exists",
    again.ok === false && again.reason === "exists",
  );
  const statusRun = spawnSync(
    process.execPath,
    [join(root, "server/dist/server/src/cli/superuser-cli.js"), "status"],
    {
      env: { ...process.env, DATABASE_URL: db.url },
      encoding: "utf8",
      input: "",
    },
  );
  const statusText = statusRun.stdout + statusRun.stderr;
  check(
    "the status command names the holder and prints no code and no hash",
    statusRun.status === 0 &&
      statusText.includes("owner@example.test") &&
      !/[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}/.test(statusText) &&
      !statusText.includes("$argon2"),
    statusText.slice(0, 160),
  );
  const changed = await setSuperuserPassword(db.pool, P.second);
  check("set-password succeeds", changed.ok === true);
  check(
    "set-password ended the old session and the old password no longer signs in",
    (await viewerOf(holder1.cookie)) === null &&
      (await signIn("owner@example.test", P.first)).status === 401,
  );
  const holder2 = await signIn("owner@example.test", P.second);
  check(
    "the new password signs in as the superuser",
    holder2.body.viewer?.superuser === true,
  );
  check(
    "set-password leaves the recovery codes alone",
    (await unspentCodeCount(db.pool, made.userId)) === 10,
  );
  const handed = await handOverNow(db.pool, "deputy@example.test");
  check("hand-over by the command moves the role at once", handed.ok === true);
  const deputy1 = await signIn("deputy@example.test", P.member);
  const former1 = await signIn("owner@example.test", P.second);
  check(
    "sign-in as the new holder: a superuser; the former holder is an admin only and had no session left",
    deputy1.body.viewer?.superuser === true &&
      former1.body.viewer?.superuser === false &&
      former1.body.viewer?.status === "admin" &&
      (await viewerOf(holder2.cookie)) === null,
  );
  const second1 = await handOverNow(db.pool, "deputy@example.test");
  const missing = await handOverNow(db.pool, "nobody@example.test");
  check(
    "second use: the command refuses a hand-over to the holder and to an unknown address",
    second1.ok === false &&
      second1.reason === "same" &&
      missing.ok === false &&
      missing.reason === "missing",
  );

  // ---- Path B: the hand-over from the pages, with the cooling period ----
  console.log("Path B: the hand-over from the pages");
  let holder = (await signIn("deputy@example.test", P.member)).cookie;
  const target = (await signIn("second@example.test", P.member)).cookie;
  const targetId = (await viewerOf(target)).userId;
  const started = await api(
    "POST",
    "/api/admin/superuser/handover",
    { password: P.member, toUserId: targetId },
    holder,
  );
  check(
    "the holder starts a hand-over with their own password",
    started.status === 200,
  );
  const accepted = await api(
    "POST",
    "/api/account/handover/accept",
    { password: P.member },
    target,
  );
  const hours =
    (new Date(accepted.body.effectiveAt).getTime() - Date.now()) / 3_600_000;
  check(
    "the asked admin accepts with their own password: 24 hours of waiting, not yet moved",
    accepted.status === 200 &&
      accepted.body.completed === false &&
      hours > 23.9 &&
      hours <= 24 &&
      (await viewerOf(target)).superuser === false,
  );
  check(
    "the timer does nothing before the end of the period",
    (await completeDueHandovers(
      db.pool,
      new Date(Date.now() + 23 * 3_600_000),
    )) === 0 && (await viewerOf(holder)).superuser === true,
  );
  const moved = await completeDueHandovers(
    db.pool,
    new Date(Date.now() + 25 * 3_600_000),
  );
  const holder3 = await signIn("second@example.test", P.member);
  check(
    "after the period the timer moves the role; sign-in as the new holder is a superuser",
    moved === 1 && holder3.body.viewer?.superuser === true,
  );
  check(
    "the former holder lost the role and every session of both sides was ended",
    (await viewerOf(holder)) === null && (await viewerOf(target)) === null,
  );
  const formerSignIn = await signIn("deputy@example.test", P.member);
  check(
    "the former holder signs in again as an admin only",
    formerSignIn.body.viewer?.superuser === false &&
      formerSignIn.body.viewer?.status === "admin",
  );
  const replayAccept = await api(
    "POST",
    "/api/account/handover/accept",
    { password: P.member },
    holder3.cookie,
  );
  const replayCancel = await api(
    "POST",
    "/api/account/handover/cancel",
    {},
    formerSignIn.cookie,
  );
  const replayStart = await api(
    "POST",
    "/api/admin/superuser/handover",
    { password: P.member, toUserId: targetId },
    formerSignIn.cookie,
  );
  check(
    "second use: nothing is left to accept or cancel, and the former holder can no longer start one",
    replayAccept.status === 404 &&
      replayCancel.status === 404 &&
      replayStart.status === 404,
    `${replayAccept.status} ${replayCancel.status} ${replayStart.status}`,
  );

  // ---- Path C: a recovery code ----
  console.log("Path C: a recovery code");
  holder = holder3.cookie;
  const regenerated = await api(
    "POST",
    "/api/admin/superuser/recovery-codes",
    { password: P.member },
    holder,
  );
  const codes = regenerated.body.codes ?? [];
  check(
    "the new holder makes a set of ten recovery codes",
    codes.length === 10,
  );
  const recovered = await api("POST", "/api/superuser/recover", {
    identifier: "second@example.test",
    code: codes[0],
    newPassword: P.third,
  });
  check(
    "a code sets a new password and returns a fresh set of ten, shown once",
    recovered.status === 200 &&
      recovered.body.codes?.length === 10 &&
      recovered.body.codes.every((c) => !codes.includes(c)),
  );
  check(
    "the old session is gone and the new password signs in as the superuser",
    (await viewerOf(holder)) === null &&
      (await signIn("second@example.test", P.third)).body.viewer?.superuser ===
        true,
  );
  const reused = await api("POST", "/api/superuser/recover", {
    identifier: "second@example.test",
    code: codes[0],
    newPassword: P.fourth,
  });
  const voided = await api("POST", "/api/superuser/recover", {
    identifier: "second@example.test",
    code: codes[1],
    newPassword: P.fourth,
  });
  const invented = await api("POST", "/api/superuser/recover", {
    identifier: "second@example.test",
    code: "ZZZZ-ZZZZ-ZZZZ-ZZZZ",
    newPassword: P.fourth,
  });
  check(
    "second use: the spent code, a voided code and an invented one get the same refusal",
    reused.status === 400 &&
      voided.status === 400 &&
      invented.status === 400 &&
      JSON.stringify(reused.body) === JSON.stringify(voided.body) &&
      JSON.stringify(reused.body) === JSON.stringify(invented.body),
  );
  const fresh = recovered.body.codes[0];
  const second = await api("POST", "/api/superuser/recover", {
    identifier: "second@example.test",
    code: fresh,
    newPassword: P.fifth,
  });
  const secondAgain = await api("POST", "/api/superuser/recover", {
    identifier: "second@example.test",
    code: fresh,
    newPassword: P.fourth,
  });
  check(
    "a code of the fresh set works once and fails the second time",
    second.status === 200 && secondAgain.status === 400,
  );
  check(
    "the last password signs in, the one before it does not",
    (await signIn("second@example.test", P.fifth)).status === 200 &&
      (await signIn("second@example.test", P.third)).status === 401,
  );

  // ---- Path D: the setup door (T169) ----
  console.log("Path D: the setup door");
  const shutState = await api("GET", "/api/setup/state");
  const shutPost = await api("POST", "/api/setup", {
    code: "anything at all, however long it is",
    email: "late@example.test",
    password: P.member,
  });
  check(
    "a superuser exists: the door of the first server says closed and the route is a plain 404",
    shutState.status === 200 &&
      shutState.body.open === false &&
      shutPost.status === 404,
    `${shutState.status} ${JSON.stringify(shutState.body)} ${shutPost.status}`,
  );

  // D1: an empty database, the code is the one the server prints in its log (no SETUP_CODE).
  db2 = await createTestDatabase();
  const door = startServer(4392, db2.url, {
    SETUP_CODE: "",
    ALLOW_SUPERUSER_SETUP: "",
  });
  extraServers.push(door);
  await waitHealthy(door.base);
  const openState = await api(
    "GET",
    "/api/setup/state",
    undefined,
    undefined,
    door.base,
  );
  check(
    "an empty database: the door is open",
    openState.status === 200 && openState.body.open === true,
  );
  let logged = null;
  for (let i = 0; i < 40 && logged === null; i++) {
    logged =
      /Code \([^)]*\): ([0-9a-f]{8}(?:-[0-9a-f]{8}){3})/.exec(
        door.output(),
      )?.[1] ?? null;
    if (logged === null) await sleep(250);
  }
  check("the server printed a setup code in its log at start", logged !== null);
  const doorPassword = "rehearsal door password";
  const wrongCode = await api(
    "POST",
    "/api/setup",
    {
      code: "0000000-wrong-code-0000000",
      email: "keeper@example.test",
      password: doorPassword,
    },
    undefined,
    door.base,
  );
  check(
    "a wrong code is refused with a 400 that does not carry the right one",
    wrongCode.status === 400 &&
      !JSON.stringify(wrongCode.body).includes(logged ?? "-"),
  );
  const made2 = await api(
    "POST",
    "/api/setup",
    { code: logged, email: "keeper@example.test", password: doorPassword },
    undefined,
    door.base,
  );
  const doorCodes = made2.body.codes ?? [];
  check(
    "the code from the log makes the superuser and returns ten recovery codes",
    made2.status === 200 && doorCodes.length === 10,
    String(made2.status),
  );
  const keeper = await api(
    "POST",
    "/api/auth/signin",
    { identifier: "keeper@example.test", password: doorPassword },
    undefined,
    door.base,
  );
  check(
    "sign-in as the account the door made: the viewer is a superuser and an admin",
    keeper.status === 200 &&
      keeper.body.viewer?.superuser === true &&
      keeper.body.viewer?.status === "admin",
  );
  const doorAgain = await api(
    "POST",
    "/api/setup",
    { code: logged, email: "other@example.test", password: doorPassword },
    undefined,
    door.base,
  );
  const doorState = await api(
    "GET",
    "/api/setup/state",
    undefined,
    undefined,
    door.base,
  );
  check(
    "second use: the same code is refused with a 404 and the state says closed",
    doorAgain.status === 404 && doorState.body.open === false,
    `${doorAgain.status} ${JSON.stringify(doorState.body)}`,
  );
  const viaCodes = await api(
    "POST",
    "/api/superuser/recover",
    {
      identifier: "keeper@example.test",
      code: doorCodes[0],
      newPassword: "rehearsal door password two",
    },
    undefined,
    door.base,
  );
  check(
    "a recovery code the door issued works on path C: a new password and a fresh set of ten",
    viaCodes.status === 200 && viaCodes.body.codes?.length === 10,
  );

  // D2: the emergency switch, on the same database, with a code from the settings. A hand-over is left open first, to
  // see that taking the role closes it.
  door.child.kill();
  const keeperPassword = "rehearsal door password two";
  // An admin to hand the role to (a hand-over needs one); made in the database directly, as the members file will.
  // The hash is read first and passed as a value: the source test that guards the role's flag reads any statement that
  // inserts into users and names the flag as a write, and this one only borrows a password.
  const borrowed = await db2.pool.query(
    "select password_hash from users where email = 'keeper@example.test'",
  );
  const deputyInserted = await db2.pool.query(
    `insert into users (email, display_name, status, password_hash, password_changed_at)
     values ('deputy@example.test', 'Deputy', 'admin', $1, now()) returning id`,
    [borrowed.rows[0].password_hash],
  );
  const settingsCode = "rehearsal-setup-code-from-the-settings-0001";
  const emergency = startServer(4393, db2.url, {
    SETUP_CODE: settingsCode,
    ALLOW_SUPERUSER_SETUP: "1",
  });
  extraServers.push(emergency);
  await waitHealthy(emergency.base);
  const keeperSignedIn = await api(
    "POST",
    "/api/auth/signin",
    { identifier: "keeper@example.test", password: keeperPassword },
    undefined,
    emergency.base,
  );
  const deputyRow = deputyInserted.rows[0];
  const started2 = await api(
    "POST",
    "/api/admin/superuser/handover",
    { password: keeperPassword, toUserId: Number(deputyRow.id) },
    keeperSignedIn.cookie,
    emergency.base,
  );
  check(
    "a hand-over from the page is left open before the switch is used",
    started2.status === 200,
    String(started2.status),
  );
  const emState = await api(
    "GET",
    "/api/setup/state",
    undefined,
    undefined,
    emergency.base,
  );
  check(
    "the switch is on: the door is open although a superuser exists",
    emState.body.open === true,
  );
  const emWrong = await api(
    "POST",
    "/api/setup",
    {
      code: "not the code from the settings, but long",
      email: "heir@example.test",
      password: P.member,
    },
    undefined,
    emergency.base,
  );
  check(
    "a wrong code is refused (400) while the switch is on",
    emWrong.status === 400,
  );
  const heir = await api(
    "POST",
    "/api/setup",
    {
      code: settingsCode,
      email: "heir@example.test",
      password: "rehearsal heir password",
    },
    undefined,
    emergency.base,
  );
  const heirCodes = heir.body.codes ?? [];
  check(
    "the code from the settings makes a new holder with ten recovery codes",
    heir.status === 200 && heirCodes.length === 10,
    String(heir.status),
  );
  const roles = await db2.pool.query(
    "select email, status, is_superuser from users where email in ('keeper@example.test','heir@example.test') order by email",
  );
  const openRequests = await db2.pool.query(
    "select 1 from handover_requests where completed_at is null and cancelled_at is null",
  );
  check(
    "the role moved: the new account is the superuser, the old holder stays an admin, no hand-over is left open",
    roles.rows.length === 2 &&
      roles.rows.find((r) => r.email === "heir@example.test")?.is_superuser ===
        true &&
      roles.rows.find((r) => r.email === "keeper@example.test")
        ?.is_superuser === false &&
      roles.rows.find((r) => r.email === "keeper@example.test")?.status ===
        "admin" &&
      openRequests.rowCount === 0,
    JSON.stringify(roles.rows),
  );
  check(
    "the old holder's session ended and the new holder signs in as the superuser",
    (
      await api(
        "GET",
        "/api/auth/me",
        undefined,
        keeperSignedIn.cookie,
        emergency.base,
      )
    ).body.viewer === null &&
      (
        await api(
          "POST",
          "/api/auth/signin",
          {
            identifier: "heir@example.test",
            password: "rehearsal heir password",
          },
          undefined,
          emergency.base,
        )
      ).body.viewer?.superuser === true,
  );
  const oldCode = await api(
    "POST",
    "/api/superuser/recover",
    {
      identifier: "keeper@example.test",
      code: viaCodes.body.codes[0],
      newPassword: P.member,
    },
    undefined,
    emergency.base,
  );
  check(
    "the former holder's recovery codes are void: the same refusal as an invented code",
    oldCode.status === 400,
  );
  const heirRecover = await api(
    "POST",
    "/api/superuser/recover",
    {
      identifier: "heir@example.test",
      code: heirCodes[0],
      newPassword: "rehearsal heir password two",
    },
    undefined,
    emergency.base,
  );
  const heirRecoverAgain = await api(
    "POST",
    "/api/superuser/recover",
    {
      identifier: "heir@example.test",
      code: heirCodes[0],
      newPassword: P.member,
    },
    undefined,
    emergency.base,
  );
  check(
    "a code of the new holder's set works once on path C and fails the second time",
    heirRecover.status === 200 && heirRecoverAgain.status === 400,
  );
  // Added 2026-10-11 (T170): the limits the consilium put on the switch.
  const spentSwitch = await api(
    "POST",
    "/api/setup",
    { code: settingsCode, email: "another@example.test", password: P.member },
    undefined,
    emergency.base,
  );
  const spentState = await api(
    "GET",
    "/api/setup/state",
    undefined,
    undefined,
    emergency.base,
  );
  check(
    "the switch is one use: the same code is refused with a 404 and the state says closed",
    spentSwitch.status === 404 && spentState.body.open === false,
    `${spentSwitch.status} ${JSON.stringify(spentState.body)}`,
  );
  const heirSignIn = await api(
    "POST",
    "/api/auth/signin",
    {
      identifier: "heir@example.test",
      password: "rehearsal heir password two",
    },
    undefined,
    emergency.base,
  );
  const started3 = await api(
    "POST",
    "/api/admin/superuser/handover",
    { password: "rehearsal heir password two", toUserId: Number(deputyRow.id) },
    heirSignIn.cookie,
    emergency.base,
  );
  const recovered2 = await api(
    "POST",
    "/api/superuser/recover",
    {
      identifier: "heir@example.test",
      code: heirRecover.body.codes?.[0],
      newPassword: "rehearsal heir password three",
    },
    undefined,
    emergency.base,
  );
  const openAfter = await db2.pool.query(
    "select 1 from handover_requests where completed_at is null and cancelled_at is null",
  );
  check(
    "a recovery code used while a hand-over is open closes it (the stolen-session case)",
    started3.status === 200 &&
      recovered2.status === 200 &&
      openAfter.rowCount === 0,
    `${started3.status} ${recovered2.status} ${openAfter.rowCount}`,
  );
  emergency.child.kill();
  const ignored = startServer(4394, db2.url, {
    SETUP_CODE: "",
    ALLOW_SUPERUSER_SETUP: "1",
  });
  extraServers.push(ignored);
  await waitHealthy(ignored.base);
  const ignoredState = await api(
    "GET",
    "/api/setup/state",
    undefined,
    undefined,
    ignored.base,
  );
  let ignoredLine = false;
  for (let i = 0; i < 20 && !ignoredLine; i++) {
    ignoredLine = /ALLOW_SUPERUSER_SETUP=1 is ignored/.test(ignored.output());
    if (!ignoredLine) await sleep(250);
  }
  check(
    "the switch with no SETUP_CODE is ignored: the door stays shut and the log says so",
    ignoredState.body.open === false && ignoredLine,
  );
  const one = await db2.pool.query(
    "select email from users where is_superuser",
  );
  const audit2 = await db2.pool.query("select distinct action from audit_log");
  const actions2 = audit2.rows.map((r) => r.action);
  check(
    "exactly one superuser on the second database, and the door left its audit rows",
    one.rowCount === 1 &&
      one.rows[0].email === "heir@example.test" &&
      actions2.includes("superuser_created") &&
      actions2.includes("superuser_setup_replaced") &&
      actions2.includes("superuser_setup_used"),
    JSON.stringify({ holders: one.rows, actions2 }),
  );

  // ---- the state at the end ----
  console.log("The state at the end");
  const holders = await db.pool.query(
    "select email from users where is_superuser",
  );
  check(
    "exactly one superuser at the end",
    holders.rowCount === 1 && holders.rows[0].email === "second@example.test",
    JSON.stringify(holders.rows),
  );
  const audit = await db.pool.query(
    "select action, count(*)::int as n from audit_log group by action order by action",
  );
  const byAction = Object.fromEntries(audit.rows.map((r) => [r.action, r.n]));
  console.log("  audit log:", JSON.stringify(byAction));
  check(
    "every path left audit rows (hand-overs by command and by page, code recovery)",
    (byAction["superuser_handed_over"] ?? 0) >= 2 &&
      Object.keys(byAction).some((a) => /recover/.test(a)),
    JSON.stringify(byAction),
  );
} finally {
  server.kill();
  for (const extra of extraServers) extra.child.kill();
  await sleep(800);
  await db.drop();
  if (db2 !== null) await db2.drop();
}

const failed = results.filter((r) => !r.ok);
console.log(
  `\nrehearse:superuser: ${results.length - failed.length} passed, ${failed.length} failed${
    failed.length ? ": " + failed.map((f) => f.name).join("; ") : ""
  }`,
);
process.exit(failed.length === 0 ? 0 : 1);
