// The first value of the feedback recipient, from the environment (T110 of specs/001-self-hosted-club-site; FR-035,
// FR-036; research.md section 11). The settings routes themselves are tested in settings.test.ts; this file is the
// start-up half: what is read, what is refused, and that only the first start writes.

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ConfigError } from "../src/config.js";
import {
  loadRecipientSeed,
  seedFeedbackRecipient,
} from "../src/settings/seed.js";
import {
  createTestDatabase,
  skipWithoutDatabase,
  type TestDatabase,
} from "./helpers/db.js";

const opts = { skip: skipWithoutDatabase };

test("the seed: empty or absent is no seed, one bare address is read trimmed, anything else stops the start", () => {
  assert.equal(loadRecipientSeed({}), null);
  assert.equal(loadRecipientSeed({ FEEDBACK_RECIPIENT_SEED: "" }), null);
  assert.equal(loadRecipientSeed({ FEEDBACK_RECIPIENT_SEED: "   " }), null);
  assert.equal(
    loadRecipientSeed({ FEEDBACK_RECIPIENT_SEED: "  desk@example.test " }),
    "desk@example.test",
  );
  for (const bad of [
    "not-an-address",
    "Club <desk@example.test>",
    "a@b.test, c@d.test",
    "a@b.test\r\nBcc: x@y.test",
  ]) {
    assert.throws(
      () => loadRecipientSeed({ FEEDBACK_RECIPIENT_SEED: bad }),
      (error: unknown) =>
        error instanceof ConfigError &&
        /FEEDBACK_RECIPIENT_SEED/.test(error.message) &&
        !error.message.includes(bad),
      JSON.stringify(bad),
    );
  }
});

let db: TestDatabase;
before(async () => {
  if (skipWithoutDatabase) return;
  db = await createTestDatabase();
});
after(async () => {
  if (skipWithoutDatabase) return;
  await db.drop();
});

test(
  "only the first start seeds: the second finds a recipient and leaves it alone",
  opts,
  async () => {
    assert.equal(
      await seedFeedbackRecipient(db.pool, "first@example.test"),
      true,
    );
    const row = (
      await db.pool.query(
        "select value, updated_by from settings where key = 'feedback_recipient'",
      )
    ).rows[0];
    assert.equal(row.value, "first@example.test");
    assert.equal(row.updated_by, null, "the system made it, not an account");

    assert.equal(
      await seedFeedbackRecipient(db.pool, "second@example.test"),
      false,
    );
    const after = (
      await db.pool.query(
        "select value from settings where key = 'feedback_recipient'",
      )
    ).rows[0];
    assert.equal(after.value, "first@example.test");
    const log = (
      await db.pool.query(
        "select old_value, new_value, changed_by from settings_log where key = 'feedback_recipient'",
      )
    ).rows;
    assert.equal(log.length, 1, "one row of the log, for the seed");
    assert.equal(log[0].old_value, null);
    assert.equal(log[0].new_value, "first@example.test");
    assert.equal(log[0].changed_by, null);
  },
);
