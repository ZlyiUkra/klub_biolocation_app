// Database liveness for GET /healthz (T009 of specs/001-self-hosted-club-site).
//
// Decision that would otherwise look like a mistake: the check returns a boolean and never the error. The health
// route is public (nginx and Compose call it) and must reveal nothing about the database, so the reason a query
// failed is logged on the server and never reaches the response.

import type { Pool } from "./pool.js";

export async function checkDatabase(pool: Pool): Promise<boolean> {
  try {
    await pool.query("select 1");
    return true;
  } catch (error) {
    console.error(
      "Health check: the database did not answer:",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}
