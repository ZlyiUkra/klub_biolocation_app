// Server entry point (T013 of specs/001-self-hosted-club-site).
//
// Starts the HTTP server on the configured port and shuts it down cleanly on SIGTERM and SIGINT (Compose and
// `docker stop` send SIGTERM): stop accepting connections, let the open ones finish, then end the pool.
//
// Decisions that would otherwise look like mistakes:
// - It listens on all interfaces inside its container because Node's port is never published; only nginx (and the
//   compose network) can reach it. On a development machine it is reachable on the loopback port only through
//   what the developer chooses to publish.
// - A configuration error exits with code 1 and one line, not a stack trace: the message already names what to fix.
// - Shutdown has its own 10 second limit, after which the process exits anyway, so a hung connection cannot make a
//   deploy wait forever.

import {
  ConfigError,
  loadConfig,
  loadFreeReserveBytes,
  loadImageCapBytes,
  loadUploadCapBytes,
  originWarnings,
} from "./config.js";
import { createPool } from "./db/pool.js";
import { createApp } from "./http/app.js";
// Added 2026-10-13 (T108): the mail module (the nodemailer wrapper and the queue's worker loop).
import { createTransportFor, loadMailConfig } from "./mail/mailer.js";
import { startMailWorker, type MailWorker } from "./mail/queue.js";
// Added 2026-10-13 (T110): the first value of the feedback recipient, from the environment.
import { loadRecipientSeed, seedFeedbackRecipient } from "./settings/seed.js";
// Added 2026-10-10 (T036): the built site, when `npm run build` has made one.
import { loadSite } from "./http/site.js";
import { fileURLToPath } from "node:url";
// Added 2026-10-11 (T068): the timer that completes a handover when its cooling period ends.
import { completeDueHandovers } from "./users/handover.js";
// Added 2026-10-11 (T169): the setup door for the first superuser (SETUP_CODE, ALLOW_SUPERUSER_SETUP).
import {
  SetupConfigError,
  SetupGate,
  loadSetupOptions,
} from "./users/setup.js";

let config;
try {
  config = loadConfig();
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

// Added 2026-10-11 (T169): a SETUP_CODE that is too short or a switch that is not 1 stops the start with the reason.
let setupGate;
try {
  setupGate = new SetupGate(loadSetupOptions());
} catch (error) {
  if (error instanceof SetupConfigError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

// Added 2026-10-12 (T098, T138): the cap of one video upload, from VIDEO_UPLOAD_CAP_MB (default 500 MiB), and the room
// that must stay free on the volume, from VIDEO_FREE_RESERVE_MB (default 2 GiB).
let uploadCapBytes;
let freeReserveBytes;
let imageCapBytes;
try {
  uploadCapBytes = loadUploadCapBytes();
  freeReserveBytes = loadFreeReserveBytes();
  // Added 2026-10-12 (T143): the cap of one picture, from IMAGE_UPLOAD_CAP_MB (default 5 MiB).
  imageCapBytes = loadImageCapBytes();
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

// Added 2026-10-13 (T108): the mail variables (SMTP_HOST and the rest, or MAIL_OUTBOX_DIR for development). None set is
// allowed - the queue then waits - but a half-written set stops the start with the names that are missing.
let mailConfig;
try {
  mailConfig = loadMailConfig();
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

// Added 2026-10-13 (T110): the feedback recipient's first value, FEEDBACK_RECIPIENT_SEED; a value that is not one bare
// address stops the start with the name, as the mail variables do.
let recipientSeed;
try {
  recipientSeed = loadRecipientSeed();
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

const pool = createPool(config.databaseUrl);
// Added 2026-10-13 (T110): inserted only when no recipient is set (first start); the value is never printed.
if (recipientSeed !== null) {
  try {
    if (await seedFeedbackRecipient(pool, recipientSeed)) {
      console.log(
        "Feedback recipient: set from FEEDBACK_RECIPIENT_SEED (first start); change it on the settings page.",
      );
    }
  } catch (error) {
    console.error(
      "feedback recipient seed:",
      error instanceof Error ? error.message : error,
    );
  }
}
// This file is server/dist/server/src/main.js once compiled, four levels below the repository root, which holds dist/.
const root = fileURLToPath(new URL("../../../../", import.meta.url));
const site = await loadSite(root);
if (site === null) {
  console.log(
    "The site is not built (dist/server/entry.mjs is missing): serving the API only. Run npm run build to serve the pages.",
  );
}
// Added 2026-10-11: say it at start when a loopback origin names another port than this server's.
for (const warning of originWarnings(config)) console.warn(warning);
const app = createApp({
  pool,
  siteOrigin: config.siteOrigin,
  siteOrigins: config.siteOrigins,
  site,
  setup: setupGate,
  // Added 2026-10-11 (T080): the video volume and, behind nginx, the internal location (both optional).
  ...(process.env["VIDEO_ROOT"]
    ? { videoRoot: process.env["VIDEO_ROOT"] }
    : {}),
  ...(process.env["VIDEO_ACCEL"]
    ? { videoAccel: process.env["VIDEO_ACCEL"] }
    : {}),
  uploadCapBytes,
  freeReserveBytes,
  imageCapBytes,
});
const server = app.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}`);
});

// Added 2026-10-11 (T068, the owner's choice A of 2026-10-11): once a minute, and at start, the handovers whose time has
// come are completed. A server that was down over the end of the period completes them at its next start. The timer
// does not keep the process alive, and an error is logged, never thrown.
const handoverTimer = setInterval(() => {
  completeDueHandovers(pool).catch((error: unknown) => {
    console.error(
      "handover timer:",
      error instanceof Error ? error.message : error,
    );
  });
}, 60_000);
handoverTimer.unref();
completeDueHandovers(pool).catch((error: unknown) => {
  console.error(
    "handover at start:",
    error instanceof Error ? error.message : error,
  );
});

// Added 2026-10-11 (T169): while no superuser exists (or the emergency switch is on) the setup door has a code; this
// makes the generated one at start and renews it every hour, printing it to the log. Once a minute, an error is logged.
const setupTimer = setInterval(() => {
  setupGate.tick(pool).catch((error: unknown) => {
    console.error(
      "setup timer:",
      error instanceof Error ? error.message : error,
    );
  });
}, 60_000);
setupTimer.unref();
setupGate.tick(pool).catch((error: unknown) => {
  console.error(
    "setup at start:",
    error instanceof Error ? error.message : error,
  );
});

// Added 2026-10-13 (T108): the loop that sends the queue, outside any request. With no mail configured nothing is
// started and the rows wait; the start line says which it is, and never prints the password.
let mailWorker: MailWorker | null = null;
if (mailConfig === null) {
  console.log(
    "Mail: neither SMTP_HOST nor MAIL_OUTBOX_DIR is set, so queued mail waits until one is (see .env.example).",
  );
} else {
  mailWorker = startMailWorker({
    pool,
    transport: createTransportFor(mailConfig),
    onError: (error: unknown) => {
      console.error(
        "mail worker:",
        error instanceof Error ? error.message : error,
      );
    },
  });
  console.log(
    mailConfig.kind === "smtp"
      ? `Mail: sending through ${mailConfig.host}:${mailConfig.port} as ${mailConfig.from}`
      : `Mail: development outbox, each message is written to ${mailConfig.dir}`,
  );
}

let closing = false;
function shutdown(signal: string): void {
  if (closing) return;
  closing = true;
  console.log(`${signal} received, shutting down`);
  const limit = setTimeout(() => process.exit(1), 10_000);
  limit.unref();
  // Changed 2026-10-13 (T108): the mail loop finishes the row in hand before the pool is ended.
  server.close(() => {
    (mailWorker?.stop() ?? Promise.resolve())
      .then(() => pool.end())
      .then(
        () => process.exit(0),
        () => process.exit(1),
      );
  });
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
