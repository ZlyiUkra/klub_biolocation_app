// The first value of the feedback recipient, from the environment (T110 of specs/001-self-hosted-club-site; FR-035,
// FR-036; research.md section 11: "the recipient is a setting, seeded from the environment on first start").
//
// Decisions that would otherwise look like mistakes:
// - Only the FIRST start seeds: the row is inserted when there is none and never touched when there is one. From then
//   on the recipient is changed from the superuser's page with its code (routes.ts), and a value left in the
//   environment is not read again, so an old line in a `.env` can never undo a change made on the page.
// - The address is not written anywhere in the repository: the variable is in the git-ignored `.env` or the
//   environment of the host (`.env.example` has the name only), and the log of the setting (migration 015) is the only
//   place the value is kept besides the row.
// - An address that is not one bare address stops the start with the variable's name, as every other variable of this
//   server does (config.ts), because a seed that is silently dropped leaves a club that believes its mail is going
//   somewhere. A seed with no value is simply no seed.
// - The insert is made with no `updated_by`: the system made it, not an account (the log row says so by a null).

import type { Pool } from "../db/pool.js";
import { ConfigError } from "../config.js";
import { isBareAddress } from "../mail/address.js";

/** The seed address, or null when the variable is empty or absent; a value that is not one bare address is an error. */
export function loadRecipientSeed(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const raw = (env["FEEDBACK_RECIPIENT_SEED"] ?? "").trim();
  if (raw === "") return null;
  if (!isBareAddress(raw)) {
    throw new ConfigError(
      "FEEDBACK_RECIPIENT_SEED must be one bare address, such as club@example.org",
    );
  }
  return raw;
}

/** Inserts the recipient when there is none; true when it did, false when a recipient was already set. */
export async function seedFeedbackRecipient(
  pool: Pool,
  address: string,
): Promise<boolean> {
  const result = await pool.query(
    `insert into settings (key, value) values ('feedback_recipient', $1::jsonb)
     on conflict (key) do nothing
     returning key`,
    [JSON.stringify(address)],
  );
  return (result.rowCount ?? 0) > 0;
}
