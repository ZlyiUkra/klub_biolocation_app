// The superuser's settings page API (T105 of specs/001-self-hosted-club-site writes the tests, T110 builds it; contracts/
// http-api.md "Administration", data-model.md "settings", FR-035, FR-036, security-review-superuser.md).
//
// This file is a stub with the numbers the tests of server/test/settings.test.ts are written against, as
// server/src/content/rules.ts was for T094: `GET` and `PUT /api/admin/settings` and `POST /api/admin/settings/recipient/
// confirm` are added by T110 and mounted in `http/app.ts` then. Until they are, the tests that call them are red on
// purpose.
//
// Decisions that would otherwise look like mistakes:
// - The code that confirms a new recipient is 8 digits, valid 30 minutes and 5 tries, and a new request replaces the
//   old one. Eight digits alone would be guessable in a long run, so the tries and the lifetime are what hold it; it
//   is kept as a hash and is in no table, log or audit row in the clear.
// - The address must be one bare address: the same string goes into the mail module as a recipient, and a list, a
//   display name or a line break would be another recipient or a header (FR-034, FR-036).
//
// Built 2026-10-13 (T110): the three routes and `settingsRouter`. The stub's paragraph above describes the state before;
// what is true now (tests: server/test/settings.test.ts; the page is src/pages/admin/settings/index.astro):
// - Only the superuser reaches them: anyone else, an administrator included, a visitor with no session included, gets
//   the 404 of an unknown route on every verb, decided from the account on every request (users/actor.ts). Every
//   answer is no-store.
// - A change is asked for with the password typed again in the same request: the check of users/reauth.ts, so a wrong
//   one is held against the account like a wrong sign-in and a pause in force is a 429 whatever the password. The
//   password is looked at BEFORE the values, so a wrong password reveals nothing about the values it came with.
// - The members-only block's switch is written here and read by the entry query (access/entries.ts) and by nothing
//   else: the first test of the file reads the sources to prove it, which is why the key's name appears in this file
//   and in that one only. Setting the value it already has is a 200 and no new row of the log (the trigger of
//   migration 015 writes a row only for a changed value).
// - A new recipient is a REQUEST: the pending value (`feedback_recipient_pending`: the address, the hash of the code,
//   the time it expires, the tries left) is stored, the code goes by mail to the NEW address and a warning without the
//   code to the OLD one, and the active recipient does not move. The request and its two mail rows are written in one
//   transaction, so no code is mailed for a request that was not stored. The hash is the one the passwords use
//   (scrypt, a salt of its own): eight digits are guessable from a plain hash by anyone who can read the table, and the
//   tries and the lifetime are what hold the code against a person who cannot.
// - Confirming takes the pending row for update, so two confirmations at once cannot both pass; a wrong code costs a
//   try, the fifth voids the request, an expired request is removed when it is met, and a malformed code (not eight
//   digits) is a 400 that costs nothing. A right code makes the address active, removes the request, logs the change
//   (the trigger: who, from, to) and queues the notice to the old address.
// - The pending value is never given back whole: the state shows the address and the time, never the hash.
// - The routes read the mail module's `isBareAddress` for "one address", so the settings and the mailer cannot
//   disagree about what an address is.

import { randomInt } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { hashPassword, verifyPassword } from "../auth/password.js";
import type { Pool } from "../db/pool.js";
import { withTransaction } from "../db/pool.js";
import { sendError } from "../http/errors.js";
import { isBareAddress, maxAddressChars } from "../mail/address.js";
import {
  recipientChangedNotice,
  recipientChangeRequestedNotice,
  recipientCodeNotice,
} from "../mail/messages.js";
import { checkPasswordAgain } from "../users/reauth.js";
import { adminActorOf } from "../users/actor.js";
import { reauthRefusal } from "../users/superuser-routes.js";

/** The numbers of the recipient change, in one block. */
export const settingsLimits = {
  codeDigits: 8,
  codeLifetimeMs: 30 * 60_000,
  codeTries: 5,
  /** The longest address (RFC 5321 path length). */
  maxAddressChars,
} as const;

const modes = ["locked", "hidden"] as const;
type Mode = (typeof modes)[number];

/** What the pending value holds, as stored; the hash never leaves this module. */
type Pending = {
  address: string;
  codeHash: string;
  expiresAt: string;
  attemptsLeft: number;
};

type Db = Pick<Pool, "query">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The pending value of a row, or null for anything that is not exactly the shape written below. */
function asPending(value: unknown): Pending | null {
  if (!isRecord(value)) return null;
  const { address, codeHash, expiresAt, attemptsLeft } = value;
  if (
    typeof address !== "string" ||
    typeof codeHash !== "string" ||
    typeof expiresAt !== "string" ||
    typeof attemptsLeft !== "number" ||
    !Number.isFinite(Date.parse(expiresAt))
  ) {
    return null;
  }
  return { address, codeHash, expiresAt, attemptsLeft };
}

const pendingKey = "feedback_recipient_pending";

async function readValue(db: Db, key: string): Promise<unknown> {
  const result = await db.query<{ value: unknown }>(
    "select value from settings where key = $1",
    [key],
  );
  return result.rows[0]?.value ?? null;
}

async function currentRecipient(db: Db): Promise<string | null> {
  const value = await readValue(db, "feedback_recipient");
  return typeof value === "string" && value !== "" ? value : null;
}

/** The state the page shows: the active recipient, the open request (no hash), the switch. */
async function stateOf(db: Db, now: Date) {
  const pending = asPending(await readValue(db, pendingKey));
  const mode = await readValue(db, "members_block_mode");
  return {
    feedbackRecipient: await currentRecipient(db),
    recipientPending:
      pending !== null && Date.parse(pending.expiresAt) > now.getTime()
        ? { address: pending.address, expiresAt: pending.expiresAt }
        : null,
    // Anything the reader does not know is the safe one (migration 015).
    membersBlockMode: modes.includes(mode as Mode) ? (mode as Mode) : "locked",
  };
}

/** Writes (or replaces) one setting, naming who wrote it so that the trigger's log row has a name. */
async function writeValue(
  db: Db,
  key: string,
  value: unknown,
  by: number,
): Promise<void> {
  await db.query(
    `insert into settings (key, value, updated_by, updated_at)
     values ($1, $2::jsonb, $3, clock_timestamp())
     on conflict (key) do update
        set value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    [key, JSON.stringify(value), by],
  );
}

const invalid = (res: Response, message: string, field?: string): void =>
  sendError(res, 400, "invalid_input", message, field);

const notFound = (res: Response): void =>
  sendError(res, 404, "not_found", "No such API route.");

export function settingsRouter({ pool }: { pool: Pool }): Router {
  const router = Router();

  router.use("/admin/settings", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  /** The superuser's id, or null: every other caller is answered 404 by the route. */
  async function superuserOf(req: Request): Promise<number | null> {
    const actor = await adminActorOf(pool, req);
    return actor?.superuser === true ? actor.id : null;
  }

  router.get("/admin/settings", async (req, res) => {
    if ((await superuserOf(req)) === null) return notFound(res);
    res.status(200).json(await stateOf(pool, new Date()));
  });

  router.put("/admin/settings", async (req, res) => {
    const by = await superuserOf(req);
    if (by === null) return notFound(res);
    const body = isRecord(req.body) ? req.body : {};

    const password = body["password"];
    if (typeof password !== "string" || password === "") {
      return invalid(
        res,
        "Type your password to change a setting.",
        "password",
      );
    }
    const wantsMode = "membersBlockMode" in body;
    const wantsRecipient = "feedbackRecipient" in body;
    if (!wantsMode && !wantsRecipient) {
      return invalid(res, "Nothing to change.");
    }
    const again = await checkPasswordAgain(pool, by, password);
    if (!again.ok) return reauthRefusal(res, again);

    // Every value is looked at before anything is written, so a request is applied whole or not at all.
    const mode = body["membersBlockMode"];
    if (wantsMode && !modes.includes(mode as Mode)) {
      return invalid(
        res,
        'The switch is "locked" or "hidden".',
        "membersBlockMode",
      );
    }
    let address: string | null = null;
    if (wantsRecipient) {
      const asked = body["feedbackRecipient"];
      const trimmed = typeof asked === "string" ? asked.trim() : null;
      if (trimmed === null || !isBareAddress(trimmed)) {
        return invalid(
          res,
          "The recipient must be one bare mail address.",
          "feedbackRecipient",
        );
      }
      const current = await currentRecipient(pool);
      if (current !== null && current.toLowerCase() === trimmed.toLowerCase()) {
        return invalid(
          res,
          "That address is already the recipient.",
          "feedbackRecipient",
        );
      }
      address = trimmed;
    }

    // The code and its hash are made before the transaction: scrypt is slow and no lock should wait for it.
    const now = new Date();
    let code = "";
    let codeHash = "";
    if (address !== null) {
      code = String(randomInt(0, 10 ** settingsLimits.codeDigits)).padStart(
        settingsLimits.codeDigits,
        "0",
      );
      codeHash = await hashPassword(code);
    }
    await withTransaction(pool, async (client) => {
      if (wantsMode) {
        await writeValue(client, "members_block_mode", mode, by);
      }
      if (address !== null) {
        const pending: Pending = {
          address,
          codeHash,
          expiresAt: new Date(
            now.getTime() + settingsLimits.codeLifetimeMs,
          ).toISOString(),
          attemptsLeft: settingsLimits.codeTries,
        };
        await writeValue(client, pendingKey, pending, by);
        const minutes = settingsLimits.codeLifetimeMs / 60_000;
        const toNew = recipientCodeNotice({ code, lifetimeMinutes: minutes });
        await client.query(
          `insert into mail_queue (kind, to_address, subject, body)
           values ('recipient_code', $1, $2, $3)`,
          [address, toNew.subject, toNew.body],
        );
        // Nobody to warn when no recipient was ever set.
        const old = await currentRecipient(client);
        if (old !== null) {
          const warning = recipientChangeRequestedNotice({
            newAddress: address,
            requestedAt: now,
            lifetimeMinutes: minutes,
          });
          await client.query(
            `insert into mail_queue (kind, to_address, subject, body)
             values ('recipient_change_requested', $1, $2, $3)`,
            [old, warning.subject, warning.body],
          );
        }
      }
    });
    res.status(address !== null ? 202 : 200).json(await stateOf(pool, now));
  });

  router.post("/admin/settings/recipient/confirm", async (req, res) => {
    const by = await superuserOf(req);
    if (by === null) return notFound(res);
    const asked = isRecord(req.body) ? req.body["code"] : null;
    const code = typeof asked === "string" ? asked.trim() : "";
    // A code that is not eight digits is a typing mistake, not a guess: it costs no try.
    if (!new RegExp(`^[0-9]{${settingsLimits.codeDigits}}$`).test(code)) {
      return invalid(
        res,
        `The code is ${settingsLimits.codeDigits} digits.`,
        "code",
      );
    }

    const now = new Date();
    type Outcome =
      { kind: "none" } | { kind: "wrong"; left: number } | { kind: "ok" };
    const outcome = await withTransaction(
      pool,
      async (client): Promise<Outcome> => {
        const stored = await client.query<{ value: unknown }>(
          "select value from settings where key = $1 for update",
          [pendingKey],
        );
        const row = stored.rows[0];
        if (row === undefined) return { kind: "none" };
        const pending = asPending(row.value);
        const drop = () =>
          client.query("delete from settings where key = $1", [pendingKey]);
        // A value that is not ours, or that has expired, is removed when it is met and counts as no request.
        if (
          pending === null ||
          Date.parse(pending.expiresAt) <= now.getTime()
        ) {
          await drop();
          return { kind: "none" };
        }
        if (!(await verifyPassword(code, pending.codeHash))) {
          const left = pending.attemptsLeft - 1;
          if (left <= 0) {
            await drop();
          } else {
            await writeValue(
              client,
              pendingKey,
              { ...pending, attemptsLeft: left },
              by,
            );
          }
          return { kind: "wrong", left: Math.max(0, left) };
        }
        const old = await currentRecipient(client);
        await writeValue(client, "feedback_recipient", pending.address, by);
        await drop();
        if (
          old !== null &&
          old.toLowerCase() !== pending.address.toLowerCase()
        ) {
          const told = recipientChangedNotice({
            newAddress: pending.address,
            changedAt: now,
          });
          await client.query(
            `insert into mail_queue (kind, to_address, subject, body)
           values ('recipient_changed', $1, $2, $3)`,
            [old, told.subject, told.body],
          );
        }
        return { kind: "ok" };
      },
    );

    if (outcome.kind === "ok") {
      return void res.status(200).json(await stateOf(pool, now));
    }
    if (outcome.kind === "wrong") {
      return void res.status(400).json({
        error: "invalid_input",
        message: "The code is not right.",
        field: "code",
        attemptsLeft: outcome.left,
      });
    }
    return invalid(
      res,
      "No change of the recipient is waiting for a code.",
      "code",
    );
  });

  return router;
}
