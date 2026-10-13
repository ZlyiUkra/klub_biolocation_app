// Migration runner (T014 of specs/001-self-hosted-club-site). Needs the development database.

import assert from "node:assert/strict";
import { test } from "node:test";
import pg from "pg";
import { migrate } from "../src/db/migrate.js";
import { createTestDatabase, skipWithoutDatabase } from "./helpers/db.js";

test(
  "migrations apply once, are recorded with a checksum, and a second run applies nothing",
  { skip: skipWithoutDatabase },
  async () => {
    const db = await createTestDatabase({ migrations: false });
    const client = new pg.Client({ connectionString: db.url });
    try {
      await client.connect();
      const first = await migrate(client);
      assert.ok(first.length >= 1, "the baseline migration applies");
      assert.equal(first[0]?.version, 1);

      // postgrator also keeps a row for version 0 (the empty database), so the baseline is looked up by its number.
      const rows = await client.query(
        "select version, name, md5 from schema_version where version = 1",
      );
      assert.equal(rows.rows.length, 1);
      assert.equal(rows.rows[0].name, "baseline");
      assert.match(rows.rows[0].md5, /^[0-9a-f]{32}$/);

      const second = await migrate(client);
      assert.deepEqual(second, [], "nothing pending the second time");
    } finally {
      await client.end();
      await db.drop();
    }
  },
);
