// The `npm run superuser` command (T066 of specs/001-self-hosted-club-site; security-review-superuser.md, way A of
// section 2). The authority is access to the server: whoever can run this holds the role.
//
//   npm run superuser -- create <address>      make the account the superuser, creating it when there is none
//   npm run superuser -- set-password          a new password for the superuser; ends its sessions
//   npm run superuser -- hand-over <address>   move the role to another account at once
//   npm run superuser -- status                who holds the role and whether a handover is open
//
// Decisions that would otherwise look like mistakes:
// - A password is typed at the terminal with the echo off and never read from an argument or the environment, so it
//   cannot land in the shell's history or in a process list. With no terminal (a pipe, a script) the command refuses
//   to ask for one: there is no safe way to take it.
// - `create` prints the ten recovery codes ONCE and nothing else secret; the output is meant to be written down
//   offline. The command never prints a password.
// - The usage lines and the messages are in English: this is a tool of the person who runs the server.

import { loadDatabaseUrl } from "../config.js";
import { createPool } from "../db/pool.js";
import {
  createSuperuser,
  handOverNow,
  setSuperuserPassword,
  superuserStatus,
} from "../users/superuser.js";

/** Reads a line with no echo. Resolves with the text; rejects on Ctrl+C. */
function promptHidden(label: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
      reject(
        new Error(
          "A password is typed at a terminal; there is none here, so nothing was asked.",
        ),
      );
      return;
    }
    process.stdout.write(label);
    let text = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const finish = (): void => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      process.stdout.write("\n");
    };
    const onData = (chunk: string): void => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          finish();
          resolve(text);
          return;
        }
        if (ch === "\u0003") {
          finish();
          reject(new Error("Cancelled."));
          return;
        }
        if (ch === "\u007f" || ch === "\b") text = text.slice(0, -1);
        else if (ch >= " ") text += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function askNewPassword(): Promise<string> {
  const first = await promptHidden("New password (8 to 128 characters): ");
  const second = await promptHidden("Again: ");
  if (first !== second)
    throw new Error("The two passwords differ; nothing was done.");
  return first;
}

const usage = `Usage:
  npm run superuser -- create <address>
  npm run superuser -- set-password
  npm run superuser -- hand-over <address>
  npm run superuser -- status`;

const [command, argument] = process.argv.slice(2);
if (
  command === undefined ||
  !["create", "set-password", "hand-over", "status"].includes(command) ||
  ((command === "create" || command === "hand-over") && !argument)
) {
  console.error(usage);
  process.exit(1);
}

const pool = createPool(loadDatabaseUrl());
try {
  if (command === "create") {
    const password = await askNewPassword();
    const result = await createSuperuser(pool, {
      email: argument as string,
      password,
    });
    if (!result.ok) {
      const why = {
        exists:
          "There is a superuser already. Use hand-over to move the role, or set-password for its password.",
        email: "That is not an email address.",
        password: `The password is not acceptable (${result.reason === "password" ? result.problem : ""}).`,
      }[result.reason];
      console.error(why);
      process.exitCode = 1;
    } else {
      console.log(
        `${result.promoted ? "Account promoted" : "Account created"}: it is the superuser and an administrator now.`,
      );
      console.log(
        "\nRecovery codes. Each works once, replaces the password at /auth/recover/, and the rest\nare void after one is used. They are shown NOW and never again; write them down and keep\nthem off this machine:\n",
      );
      for (const code of result.codes) console.log(`  ${code}`);
    }
  } else if (command === "set-password") {
    const password = await askNewPassword();
    const result = await setSuperuserPassword(pool, password);
    if (!result.ok) {
      console.error(
        result.reason === "none"
          ? "There is no superuser yet. Use create."
          : `The password is not acceptable (${result.problem}).`,
      );
      process.exitCode = 1;
    } else {
      console.log(
        "The superuser's password is set and every session of that account is ended. The recovery codes are as they were.",
      );
    }
  } else if (command === "hand-over") {
    const result = await handOverNow(pool, argument as string);
    if (!result.ok) {
      console.error(
        {
          none: "There is no superuser to hand over from. Use create.",
          missing: "No account has that address.",
          same: "That account is the superuser already.",
        }[result.reason],
      );
      process.exitCode = 1;
    } else {
      console.log(
        "The role moved. The old holder is an administrator now, every session of both accounts is ended, and the old holder's recovery codes are void.",
      );
      console.log(
        "The new holder makes a set of recovery codes from the account page after signing in.",
      );
    }
  } else {
    const status = await superuserStatus(pool);
    if (!status.superuser) {
      console.log("There is no superuser. Use create.");
    } else {
      console.log(
        `Superuser: ${status.superuser.displayName || "(no name)"} <${status.superuser.email}>`,
      );
      console.log(`Unspent recovery codes: ${status.unspentCodes}`);
      // Added 2026-10-11 (T173): a holder with no codes is told what to do about it.
      if (status.unspentCodes === 0) {
        console.log(
          "There are no unspent recovery codes: the superuser should sign in and make a set on the account page (the password is typed again).",
        );
      }
      console.log(
        status.openRequest
          ? `Open handover to ${status.openRequest.toEmail}: started ${status.openRequest.createdAt}, ` +
              (status.openRequest.acceptedAt
                ? `accepted ${status.openRequest.acceptedAt}, moves ${status.openRequest.effectiveAt}`
                : `not accepted yet, lapses ${status.openRequest.expiresAt}`)
          : "No handover is open.",
      );
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await pool.end();
}
