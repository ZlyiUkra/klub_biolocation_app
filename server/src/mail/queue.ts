// The mail queue's worker step (T104 of specs/001-self-hosted-club-site writes the tests, T108 builds it; research.md
// section 11, data-model.md "mail_queue", FR-033).
//
// This file is a stub with the interface the tests of server/test/feedback.test.ts are written against, as
// server/src/content/rules.ts was for T094: the real one reads the due rows of `mail_queue`, hands each to a transport
// and records the result. It is called from a worker loop, never from a request, so the tests call it directly with a
// transport of their own and a clock they choose.
//
// Decisions that would otherwise look like mistakes:
// - A message handed to the transport has exactly three members, `to`, `subject` and `text`. There is no member for
//   headers, a reply address or an attachment, so nothing a visitor typed can become one; the module that wraps
//   nodemailer adds the sender from the environment, and nothing else.
// - The transport is a parameter, so the tests need no mail server and the production loop passes the nodemailer one.
//
// Built 2026-10-13 (T108): the stub's paragraph above describes the state before; what is true now (tests:
// server/test/feedback.test.ts and server/test/mailer.test.ts; the nodemailer wrapper is mailer.ts, the loop is
// `startMailWorker` below, started by main.ts):
// - The loop is the server's own and never a request, so a provider that is down costs a delayed mail and never a
//   request that waits or a message that is lost.
// - One row at a time, each in a transaction of its own that takes the row with `for update skip locked`. A second pass
//   (a second process, or a pass that started while another was still waiting for a provider) skips the row instead of
//   sending it twice, and a crash costs at most the one row in hand, which is then due again. A pass is "take a row,
//   send it, record it, repeat", and a batch bound keeps one pass from running for ever when a burst of rows arrives.
// - Time is a parameter. `sent_at`, `mailed_at` and the next attempt are written from `now`, the pass's own clock, so a
//   test can move a day ahead and see the retry go out, and the production value is the process's clock.
// - A failure is recorded and the row is tried again, for ever: after a minute, five, fifteen, an hour, three hours,
//   and then every six hours (`mailBackoffMs`). No row is given up on, because the owner who fixes a wrong password in
//   the morning wants the notices of the night, and a stuck row costs one failed connection every six hours. The
//   admin list shows `mail_error` on the message, so a stuck row is seen, not silent.
// - The error text kept is one short line (control characters folded, 300 characters at most): it is shown to the
//   panel's readers and kept in a column, and a provider's reply can be long and can carry a line break.
// - The recipient is checked as one bare address (address.ts) again here, on the way out, although the route that wrote
//   the row already did: a row is data, and the last check belongs next to the library, not three modules away.
// - A row of any kind is sent the same way. Only a `feedback_notice` has a message to report back to
//   (`feedback_id`); the settings kinds of T110 (`recipient_code` and the two notices) have none.

import type { Pool } from "../db/pool.js";
import { withTransaction } from "../db/pool.js";
import { isBareAddress } from "./address.js";

/** What the worker hands to a transport for one queue row. */
export type MailMessage = { to: string; subject: string; text: string };

/** One way of sending: it resolves when the provider accepted the message and throws when it did not. */
export type MailTransport = { send(message: MailMessage): Promise<void> };

/** What one pass did. */
export type DeliveryResult = { sent: number; failed: number };

const minute = 60_000;
const hour = 60 * minute;
/** The wait after the n-th failure, from the first to the last that grows; every later failure waits the last. */
const retrySchedule = [
  minute,
  5 * minute,
  15 * minute,
  hour,
  3 * hour,
  6 * hour,
] as const;

/** How long a row waits after its `attempts`-th failed attempt (counting that one); never zero, never over six hours. */
export function mailBackoffMs(attempts: number): number {
  const n = Number.isFinite(attempts) ? Math.max(1, Math.floor(attempts)) : 1;
  return retrySchedule[Math.min(n, retrySchedule.length) - 1] ?? 6 * hour;
}

/** The most rows one pass takes; the rest wait for the next pass. */
const defaultBatch = 20;
/** The longest error text kept on a row and on its message. */
const maxErrorChars = 300;

type DueRow = {
  id: string | number;
  to_address: string;
  subject: string;
  body: string;
  feedback_id: string | number | null;
  attempts: number;
};

/** One short line from whatever a transport threw. */
function describeFailure(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "a value that is not an Error was thrown";
  const line = raw
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxErrorChars);
  return line === "" ? "unknown error" : line;
}

/** Takes the soonest due row, sends it, records the result. "none" when nothing is due. */
async function deliverOne(
  client: Parameters<Parameters<typeof withTransaction>[1]>[0],
  transport: MailTransport,
  now: Date,
): Promise<"none" | "sent" | "failed"> {
  const due = await client.query<DueRow>(
    `select id, to_address, subject, body, feedback_id, attempts
       from mail_queue
      where sent_at is null and next_attempt_at <= $1
      order by next_attempt_at, id
      limit 1
        for update skip locked`,
    [now],
  );
  const row = due.rows[0];
  if (row === undefined) return "none";

  let failure: string | null = null;
  try {
    if (!isBareAddress(row.to_address)) {
      throw new Error("the recipient is not one bare address");
    }
    await transport.send({
      to: row.to_address,
      subject: row.subject,
      text: row.body,
    });
  } catch (error) {
    failure = describeFailure(error);
  }

  if (failure === null) {
    await client.query("update mail_queue set sent_at = $2 where id = $1", [
      row.id,
      now,
    ]);
    if (row.feedback_id !== null) {
      // A mailed message carries no error (the table's check), so the two are written together.
      await client.query(
        "update feedback set mailed_at = $2, mail_error = null where id = $1",
        [row.feedback_id, now],
      );
    }
    return "sent";
  }

  const attempts = Number(row.attempts) + 1;
  await client.query(
    `update mail_queue
        set attempts = $2, last_error = $3, next_attempt_at = $4
      where id = $1`,
    [
      row.id,
      attempts,
      failure,
      new Date(now.getTime() + mailBackoffMs(attempts)),
    ],
  );
  if (row.feedback_id !== null) {
    await client.query(
      "update feedback set mail_error = $2 where id = $1 and mailed_at is null",
      [row.feedback_id, failure],
    );
  }
  return "failed";
}

/**
 * One pass over the queue at `now`: every row that is not sent and whose `next_attempt_at` has come is tried once. A
 * success sets `sent_at`; a failure counts an attempt, records `last_error` and moves `next_attempt_at` later. The
 * row of a feedback notice also updates its message: `mailed_at` on success, `mail_error` on failure.
 *
 * Built 2026-10-13 (T108): the rows are taken soonest due first, one at a time, up to `batch` of them; the rest wait
 * for the next pass. The result counts the rows this pass sent and the rows it failed.
 */
export async function deliverDue(
  pool: Pool,
  transport: MailTransport,
  now: Date = new Date(),
  batch: number = defaultBatch,
): Promise<DeliveryResult> {
  const result: DeliveryResult = { sent: 0, failed: 0 };
  for (let handled = 0; handled < batch; handled += 1) {
    const outcome = await withTransaction(pool, (client) =>
      deliverOne(client, transport, now),
    );
    if (outcome === "none") break;
    if (outcome === "sent") result.sent += 1;
    else result.failed += 1;
  }
  return result;
}

/** A running loop; `stop` ends it and resolves once the pass in hand has finished. */
export type MailWorker = { stop(): Promise<void> };

/** How often the loop looks at the queue; a notice of the feedback form waits for half a minute at most. */
const defaultIntervalMs = 30_000;

/**
 * Starts the loop: one pass now and one every `intervalMs`, never two at once. A pass that throws (the database is
 * away, say) goes to `onError` and the loop goes on. The timer does not keep the process alive.
 */
export function startMailWorker(options: {
  pool: Pool;
  transport: MailTransport;
  intervalMs?: number;
  onError: (error: unknown) => void;
}): MailWorker {
  let stopped = false;
  let running: Promise<void> | null = null;
  const pass = (): void => {
    if (stopped || running !== null) return;
    running = deliverDue(options.pool, options.transport)
      .then(
        () => undefined,
        (error: unknown) => options.onError(error),
      )
      .finally(() => {
        running = null;
      });
  };
  const timer = setInterval(pass, options.intervalMs ?? defaultIntervalMs);
  timer.unref();
  pass();
  return {
    async stop(): Promise<void> {
      stopped = true;
      clearInterval(timer);
      if (running !== null) await running;
    },
  };
}
