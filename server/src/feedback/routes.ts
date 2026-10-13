// The feedback form's API (T104 of specs/001-self-hosted-club-site writes the tests, T107 builds the route; contracts/
// http-api.md "Feedback", data-model.md "feedback", FR-033 to FR-036, T144).
//
// This file is a stub with the numbers and the list the tests of server/test/feedback.test.ts are written against, as
// server/src/content/rules.ts was for T094: `POST /api/feedback` and `GET /api/admin/feedback` are added by T107 and
// mounted in `http/app.ts` then. Until they are, the tests that call them are red on purpose.
//
// Decisions that would otherwise look like mistakes:
// - The numbers are one block, like `signinLimits`: "limit C" of the contract, the public-form limit, per address and
//   counting stored messages only (a bot's refused attempts store nothing, so they cost the club nothing, and a
//   visitor's own mistake is not held against them). They are the tests' choice for the owner to change.
// - `subject` is a code from a fixed list, never text: the mail's subject line is built by the mail module from the
//   code, so nothing a visitor types can reach a header (FR-034). The first code is the sign-in page's help link
//   (T053, T144); a code is added here, with its subject line in the mail module, and nowhere else.
// - `name` and `contact` are one line (no line break, no NUL); the body is free text without NUL.
//
// Built 2026-10-13 (T107): the two routes. The stub's paragraph above describes the state before; what is true now:
// - The order of the checks is: the window of limit C (429), then the honeypot and the fill time (a plain 400 that does
//   not name the check), then the fields (400 with `field`), then the store. The window is taken before the form is
//   looked at and given back when the form is refused or the store fails, so a burst of parallel posts cannot all
//   pass before any is counted and a refusal is not held against the address (the pattern of the comment route and
//   the sign-up route, T172).
// - The message and its `feedback_notice` mail row are written in ONE transaction and nothing is sent in the request
//   (FR-033). The recipient is the setting `feedback_recipient`; when none is set the message is still stored, with
//   `mail_error` saying so and no mail row, so a club that has not set its mailbox yet loses nothing and sees the
//   message in the admin list.
// - The text is kept as typed with its ends trimmed. A line break is allowed in the body and refused in `name` and
//   `contact`, which the mail module may one day use in a header; NUL is refused everywhere because a PostgreSQL text
//   value cannot hold it and the answer must be a 400, not a 500.
// - Only the network part of the address is stored (`addressPrefixOf`), never the full address.
// - The admin list answers 404 to anyone who is not a metr or an admin, a visitor with no session included, as every
//   route of the panel does, and carries the mail state of each message.
// - Every answer is no-store: the list is personal data of the visitors and the post is a write.
//
// Changed later on 2026-10-13, at the owner's order: the admin list is paged and searched on the server. It answers
// `{items, total}` for `?page=&limit=&q=` (twenty to a page, fifty at most; newest first, as the posts' list), where it
// answered the newest hundred as a bare array and left everything older out of reach. The search is a case-blind
// substring of the text, the name or the contact, one field at a time.

import { Router, type Request } from "express";
import type { Pool } from "../db/pool.js";
import { withTransaction } from "../db/pool.js";
import { AddressLimiter } from "../auth/limits.js";
import { limiterKeyOf } from "../auth/routes.js";
import { addressPrefixOf } from "../auth/session.js";
import { viewerOfRequest } from "../auth/viewer.js";
import { sendError } from "../http/errors.js";
// Added 2026-10-13: the panel's page numbers, shared with the posts' and the people's lists.
import { defaultPageSize, maxPageSize, positiveInt } from "../http/paging.js";
import { feedbackNotice } from "../mail/messages.js";
// Added 2026-10-13 (T109): the topics and the lengths, shared with the site's form.
import {
  feedbackSubjects,
  feedbackTextLimits,
} from "../../../src/lib/feedback-rules.js";
// Added 2026-10-13 (T188): the fill-time rule is one module shared with sign-up and the sign-up page.
import { fillTime, fillTimeAccepted } from "../../../src/lib/fill-time.js";

/** The numbers of the feedback route, in one block. */
export const feedbackLimits = {
  /**
   * The longest message, in characters, after the ends are trimmed.
   * Changed 2026-10-13 (T109): the three lengths are src/lib/feedback-rules.ts now, which the form's `maxlength` reads.
   */
  maxBodyChars: feedbackTextLimits.maxBodyChars,
  maxNameChars: feedbackTextLimits.maxNameChars,
  maxContactChars: feedbackTextLimits.maxContactChars,
  /** The form must have been open this long before it is sent; a bot posts at once. */
  // Changed 2026-10-13 (T188): the two numbers are src/lib/fill-time.ts now (the sign-up route and page read them
  // too); the names stay, so the tests and this route are unchanged.
  minFillMs: fillTime.minMs,
  /** ... and no longer than this, so that a made-up old `startedAt` does not pass for a long fill. */
  maxFillAgeMs: fillTime.maxAgeMs,
  /** Messages one address may store inside the window; the next one is answered 429 with `Retry-After`. */
  maxPerWindow: 5,
  windowMs: 60 * 60_000,
} as const;

/**
 * The subjects a visitor may name, as codes (T144); anything else is a 400 on `subject`.
 * Moved 2026-10-13 (T109): the list is src/lib/feedback-rules.ts, which the site's form and the sign-in page's help link
 * read, and is re-exported here so the tests and the route keep one import.
 */
export { feedbackSubjects };

// Removed 2026-10-13: `adminListMax` (200) and `adminListDefault` (100) stood here, for a list that answered with the
// newest messages and nothing older. The list is paged now with the panel's own numbers (http/paging.ts), so no
// message is out of reach; the longest search text is cut at the same 100 characters the posts' search uses.
const searchMaxChars = 100;

type Fields = {
  body: string;
  name: string | null;
  contact: string | null;
  subject: string | null;
};

type FormProblem = { field: string | null; message: string };

/** A one-line optional field: absent or null is `null`; text is trimmed; empty after trimming is `null` too. */
function oneLine(
  value: unknown,
  field: string,
  max: number,
): { value: string | null } | FormProblem {
  if (value === undefined || value === null) return { value: null };
  if (typeof value !== "string") {
    return { field, message: `The ${field} must be text.` };
  }
  if (/[\r\n\u0000]/.test(value)) {
    return { field, message: `The ${field} must be one line.` };
  }
  const text = value.trim();
  // Characters, not UTF-16 units: the database counts the same way.
  if ([...text].length > max) {
    return { field, message: `The ${field} is longer than ${max} characters.` };
  }
  return { value: text === "" ? null : text };
}

/**
 * Reads the posted form. A problem with no `field` is the honeypot or the fill time: it must not say which check
 * failed, so the answer is the same plain 400 for both (and for a missing `startedAt`).
 */
function readForm(raw: unknown, nowMs: number): Fields | FormProblem {
  const form =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  const plain: FormProblem = { field: null, message: "The form is not valid." };

  const honeypot = form["website"];
  if (honeypot !== undefined && honeypot !== null && honeypot !== "") {
    return plain;
  }
  // Changed 2026-10-13 (T188): the yes-or-no is `fillTimeAccepted` of src/lib/fill-time.ts, the same rule sign-up asks;
  // it refuses a missing or non-numeric `startedAt`, one under the minimum, from the future, and one over a day old.
  if (!fillTimeAccepted(form["startedAt"], nowMs)) {
    return plain;
  }

  const body = form["body"];
  if (typeof body !== "string") {
    return { field: "body", message: "The message must be text." };
  }
  if (body.includes("\u0000")) {
    return {
      field: "body",
      message: "The message holds a character that cannot be stored.",
    };
  }
  const text = body.trim();
  if (text === "") return { field: "body", message: "The message is empty." };
  if ([...text].length > feedbackLimits.maxBodyChars) {
    return {
      field: "body",
      message: `The message is longer than ${feedbackLimits.maxBodyChars} characters.`,
    };
  }

  const name = oneLine(form["name"], "name", feedbackLimits.maxNameChars);
  if ("message" in name) return name;
  const contact = oneLine(
    form["contact"],
    "contact",
    feedbackLimits.maxContactChars,
  );
  if ("message" in contact) return contact;

  const subject = form["subject"];
  if (subject !== undefined && subject !== null) {
    if (
      typeof subject !== "string" ||
      !(feedbackSubjects as readonly string[]).includes(subject)
    ) {
      return { field: "subject", message: "The subject is not one we know." };
    }
  }
  return {
    body: text,
    name: name.value,
    contact: contact.value,
    subject: typeof subject === "string" ? subject : null,
  };
}

type StoredRow = {
  id: string | number;
  body: string;
  name: string | null;
  contact: string | null;
  subject: string | null;
  received_at: Date;
  address_prefix: string;
  mailed_at: Date | null;
  mail_error: string | null;
};

export function feedbackRouter({ pool }: { pool: Pool }): Router {
  const router = Router();
  const addressWindow = new AddressLimiter({
    maxFailures: feedbackLimits.maxPerWindow,
    windowMs: feedbackLimits.windowMs,
  });
  router.use(["/feedback", "/admin/feedback"], (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  /** The active recipient, or null when none is set (a club that has not configured its mailbox). */
  async function recipient(db: Pick<Pool, "query">): Promise<string | null> {
    const result = await db.query<{ value: unknown }>(
      "select value from settings where key = 'feedback_recipient'",
    );
    const value = result.rows[0]?.value;
    return typeof value === "string" && value !== "" ? value : null;
  }

  router.post("/feedback", async (req: Request, res) => {
    const key = limiterKeyOf(req.ip);
    const now = new Date();
    const verdict = addressWindow.check(key, now);
    if (!verdict.allowed) {
      res.setHeader("Retry-After", String(verdict.retryAfterSeconds));
      return sendError(
        res,
        429,
        "rate_limited",
        "Too many messages. Try again later.",
      );
    }
    // Reserved before the work, given back when nothing was stored.
    addressWindow.recordFailure(key, now);

    const form = readForm(req.body, now.getTime());
    if ("message" in form) {
      addressWindow.forgive(key, now);
      return form.field === null
        ? sendError(res, 400, "invalid_input", form.message)
        : sendError(res, 400, "invalid_input", form.message, form.field);
    }

    try {
      const prefix = addressPrefixOf(req.ip);
      await withTransaction(pool, async (client) => {
        const to = await recipient(client);
        const stored = await client.query<{ id: string | number; r: Date }>(
          `insert into feedback (body, name, contact, subject, address_prefix, mail_error)
           values ($1, $2, $3, $4, $5, $6)
           returning id, received_at as r`,
          [
            form.body,
            form.name,
            form.contact,
            form.subject,
            prefix,
            to === null ? "no recipient is set" : null,
          ],
        );
        const row = stored.rows[0]!;
        if (to === null) return;
        const notice = feedbackNotice({
          ...form,
          receivedAt: row.r,
          addressPrefix: prefix,
        });
        await client.query(
          `insert into mail_queue (kind, to_address, subject, body, feedback_id)
           values ('feedback_notice', $1, $2, $3, $4)`,
          [to, notice.subject, notice.body, Number(row.id)],
        );
      });
    } catch (error) {
      addressWindow.forgive(key, now);
      throw error;
    }
    res.status(201).json({ received: true });
  });

  router.get("/admin/feedback", async (req, res) => {
    const viewer = await viewerOfRequest(pool, req);
    if (viewer.status !== "metr" && viewer.status !== "admin") {
      return sendError(res, 404, "not_found", "No such route.");
    }
    // Changed 2026-10-13 (the owner's order after T107): one page of the list and the count of the whole of it, with
    // a search, as the posts' list answers: `?page=&limit=&q=` -> `{items, total}`, newest first.
    const size = positiveInt(req.query["limit"], defaultPageSize, maxPageSize);
    const page = positiveInt(req.query["page"], 1, 1_000_000);
    // A query that is not one text (given twice, say) is no search at all, as in the posts' list.
    const needle =
      typeof req.query["q"] === "string"
        ? req.query["q"].trim().slice(0, searchMaxChars).toLowerCase()
        : "";
    // What the visitor wrote, a field at a time (so the end of the text and the start of the name never join into a
    // match), as a plain substring that ignores case. `strpos` and not LIKE: `%`, `_` and a backslash are ordinary
    // characters there, so nothing the searcher types is a pattern. The network part of the address and the subject
    // code are not searched; the list shows them, and an address is not something a person is looked up by.
    const where = `($1 = ''
        or strpos(lower(body), $1) > 0
        or strpos(lower(coalesce(name, '')), $1) > 0
        or strpos(lower(coalesce(contact, '')), $1) > 0)`;
    const total = await pool.query<{ n: number }>(
      `select count(*)::int as n from feedback where ${where}`,
      [needle],
    );
    const result = await pool.query<StoredRow>(
      `select id, body, name, contact, subject, received_at, address_prefix, mailed_at, mail_error
         from feedback
        where ${where}
        order by received_at desc, id desc
        limit $2 offset $3`,
      [needle, size, (page - 1) * size],
    );
    res.json({
      total: total.rows[0]?.n ?? 0,
      items: result.rows.map((row) => ({
        id: Number(row.id),
        body: row.body,
        name: row.name,
        contact: row.contact,
        subject: row.subject,
        receivedAt: row.received_at.toISOString(),
        addressPrefix: row.address_prefix,
        mailedAt: row.mailed_at === null ? null : row.mailed_at.toISOString(),
        mailError: row.mail_error,
      })),
    });
  });

  return router;
}
