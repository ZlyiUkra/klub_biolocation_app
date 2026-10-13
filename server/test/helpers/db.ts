// Throwaway database for integration tests (T014 of specs/001-self-hosted-club-site).
//
// Each call creates a database with a random name on the server DATABASE_URL points at, applies every migration to
// it, and returns a pool plus a `drop` that removes it again. Tests therefore never touch the development data and
// never see each other's rows.
//
// Decisions that would otherwise look like mistakes:
// - The role in DATABASE_URL must be allowed to create databases (the development compose file creates the owner
//   role as the image's superuser). A role without that right fails with a clear PostgreSQL error, which is better
//   than silently using the shared database.
// - `drop` uses WITH (FORCE), available from PostgreSQL 13, so a test that leaked a connection cannot leave the
//   database behind; the compose file pins PostgreSQL 16.
// - This file lives in test/ and is compiled with the tests; `node --test` runs it as a (test-less) file, which is
//   harmless because importing it only defines functions.

import { randomBytes } from "node:crypto";
import pg from "pg";
import { migrate } from "../../src/db/migrate.js";
import { createPool, type Pool } from "../../src/db/pool.js";

export type TestDatabase = {
  url: string;
  pool: Pool;
  drop(): Promise<void>;
};

export const hasDatabase = Boolean(process.env["DATABASE_URL"]);
export const skipWithoutDatabase = hasDatabase
  ? false
  : "DATABASE_URL is not set";

export async function createTestDatabase(
  options: { migrations?: boolean } = {},
): Promise<TestDatabase> {
  const adminUrl = process.env["DATABASE_URL"];
  if (!adminUrl) throw new Error("DATABASE_URL is not set");
  const name = "kb_test_" + randomBytes(6).toString("hex");

  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`create database "${name}"`);
  } finally {
    await admin.end();
  }

  const url = new URL(adminUrl);
  url.pathname = "/" + name;
  const testUrl = url.toString();

  if (options.migrations !== false) {
    const client = new pg.Client({ connectionString: testUrl });
    await client.connect();
    try {
      await migrate(client);
    } finally {
      await client.end();
    }
  }

  const pool = createPool(testUrl);
  return {
    url: testUrl,
    pool,
    async drop() {
      await pool.end();
      const dropper = new pg.Client({ connectionString: adminUrl });
      await dropper.connect();
      try {
        await dropper.query(`drop database if exists "${name}" with (force)`);
      } finally {
        await dropper.end();
      }
    },
  };
}
