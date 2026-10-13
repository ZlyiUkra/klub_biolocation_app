// The one PostgreSQL pool and the transaction helper (T009 of specs/001-self-hosted-club-site).
//
// Source: node-postgres 8.x documentation, "Pool" and "Transactions".
//
// Decisions that would otherwise look like mistakes:
// - A pool-level 'error' listener is attached on purpose: an idle client that loses its connection emits 'error',
//   and an event emitter with no listener turns that into an uncaught exception that ends the process.
// - Every timeout is finite. A query that waits for a connection fails after 5 seconds instead of hanging a request.
// - withTransaction releases the client in `finally` and rolls back on any throw, which is the pattern the
//   documentation shows; a handler never holds a client across an await it does not own.

import pg from "pg";

export type Pool = pg.Pool;

export function createPool(connectionString: string): Pool {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  pool.on("error", (error) => {
    console.error("PostgreSQL pool: idle client error:", error.message);
  });
  return pool;
}

export async function withTransaction<T>(
  pool: Pool,
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
