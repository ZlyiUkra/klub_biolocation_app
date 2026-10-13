// The audit writer (T064 of specs/001-self-hosted-club-site; data-model.md "audit_log"; migration 012).
//
// The table is append-only by a trigger in the database, so a bug elsewhere cannot rewrite history; this module is the
// one place the application writes to it, and it has exactly one statement, an INSERT. There is no function here that
// updates or deletes a row, and a test greps the server source for such a statement.
//
// What is written: who (null when the server command acted), what, which account or setting it concerned, and the from
// and to values as data. Never a secret: the caller passes names and statuses, not passwords, codes or hashes. The
// address prefix is the network part only (session.ts `addressPrefixOf`), never the full address.

import type { Pool } from "../db/pool.js";

export type AuditEvent = {
  actorId: number | null;
  action: string;
  targetKind: "account" | "entry" | "setting" | "system";
  targetId: number | null;
  detail?: Record<string, unknown>;
  addressPrefix?: string;
};

/** Anything with `query`: a pool, or the client of a transaction, so an audit row commits with the change it records. */
export type Queryable = Pick<Pool, "query">;

export async function writeAudit(
  db: Queryable,
  event: AuditEvent,
): Promise<void> {
  await db.query(
    `insert into audit_log (actor_id, action, target_kind, target_id, detail, address_prefix)
     values ($1, $2, $3, $4, $5::jsonb, $6)`,
    [
      event.actorId,
      event.action,
      event.targetKind,
      event.targetId,
      JSON.stringify(event.detail ?? {}),
      (event.addressPrefix ?? "").slice(0, 64),
    ],
  );
}
