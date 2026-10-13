// The superuser's one-time recovery codes (T069 of specs/001-self-hosted-club-site; security-review-superuser.md
// sections 3 and 4; tests: server/test/recovery.test.ts).
//
// Ten codes of 80 random bits each, written like the temporary password (`7M2K-9QXD-04VT-HE5R`). Only the SHA-256 of
// a code is stored, each is used once, using one voids the rest of its set, and a new set voids the old. A code is
// the superuser's way back in when the password is lost and the server is out of reach, so using one is an
// unauthenticated route: it is limited, and it answers every kind of failure with the same words.
//
// Decisions that would otherwise look like mistakes:
// - The fresh set that replaces a spent one is returned in the answer of the request that spent the code, and shown
//   once. The data model said "at the next sign-in", which would need the plaintext kept until then; handing it over at
//   once holds nothing, and the person who just proved they hold a code is the one the set is for.
// - The answer to a bad code, an unknown identifier, a spent code, a voided code and a code of an account that is not
//   the superuser is one and the same, and it spends the time a hash would, so the route cannot be used to find out
//   who the superuser is (T4 and T5 of the review).
// - Two limits stand in front of the lookup: failures per network address, and a global ceiling. Neither is per
//   account, so a stranger cannot lock the owner out of the one route that may be the only way back (T5).
// - The new password is checked against the password rules BEFORE the code is looked at, so the "password too short"
//   answer says nothing about the code.

import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "../db/pool.js";
import { withTransaction } from "../db/pool.js";
import { CodeAttemptLimits } from "../auth/limits.js";
import {
  checkPasswordRules,
  hashPassword,
  spendHashingTime,
  type PasswordProblem,
} from "../auth/password.js";
import { handoverRules } from "../../../src/lib/handover-rules.js";
import { writeAudit, type Queryable } from "./audit.js";
import { credentialsChanged } from "./credentials.js";
import { generateTemporaryPassword } from "./temp-password.js";

/** A code as it is compared: upper case, no hyphens or blanks, and Crockford's look-alikes read as their digits. */
export function canonicalCode(text: string): string {
  return text
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

export function hashCode(text: string): Buffer {
  return createHash("sha256").update(canonicalCode(text)).digest();
}

const codeShape = /^[0-9A-HJKMNP-TV-Z]{16}$/;

/**
 * Voids the account's unspent codes and stores a new set. Takes any queryable so it can run inside the transaction of
 * the change that needs it. Returns the plaintext codes, which exist nowhere else.
 */
export async function issueRecoverySet(
  db: Queryable,
  userId: number,
): Promise<string[]> {
  await db.query(
    `update recovery_codes set voided_at = now()
      where user_id = $1 and used_at is null and voided_at is null`,
    [userId],
  );
  const setId = randomUUID();
  const codes = new Set<string>();
  while (codes.size < handoverRules.recoveryCodeCount) {
    codes.add(generateTemporaryPassword());
  }
  for (const code of codes) {
    await db.query(
      `insert into recovery_codes (user_id, code_hash, set_id) values ($1, $2, $3)`,
      [userId, hashCode(code), setId],
    );
  }
  return [...codes];
}

/** How many unspent, unvoided codes the account has, for the status command and the account page. */
export async function unspentCodeCount(
  db: Queryable,
  userId: number,
): Promise<number> {
  const result = await db.query<{ n: string }>(
    `select count(*) as n from recovery_codes
      where user_id = $1 and used_at is null and voided_at is null`,
    [userId],
  );
  return Number(result.rows[0]?.n ?? 0);
}

export type RedeemInput = {
  identifier: string;
  code: string;
  newPassword: string;
  address: string;
  addressPrefix: string;
};

export type RedeemResult =
  | { ok: true; userId: number; codes: string[] }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "password"; problem: PasswordProblem }
  | { ok: false; reason: "limited"; retryAfterSeconds: number };

/**
 * The windows of the route, in memory like the sign-in's: five failures an address in fifteen minutes, and a global
 * ceiling of thirty in an hour. A deployment with more than one process would need them in the database; this one is a
 * single process (research.md section 7).
 */
// Changed 2026-10-11 (T174): the numbers are `CodeAttemptLimits`'s, shared with the setup door; the class stays so the
// recovery route keeps its own counters.
export class RecoveryLimits extends CodeAttemptLimits {}

export async function redeemRecoveryCode(
  pool: Pool,
  input: RedeemInput,
  limits: RecoveryLimits,
  now: Date = new Date(),
): Promise<RedeemResult> {
  // Changed 2026-10-11 (T171, T172 of the consilium of that day). Two changes to the order of things:
  // - The attempt is counted as a failure BEFORE the lookup awaits anything, and given back when it turns out right
  //   (`reserved`). Counted after, a burst of parallel wrong codes all passed the check before any was counted and
  //   every one of them spent the hashing time.
  // - The global ceiling does not stop a RIGHT code: a code of 80 bits cannot be guessed online, so letting it through
  //   gives an attacker nothing, and the ceiling exhausted from a few addresses must not lock the owner out of the one
  //   route that may be the only way back. The per-address pause stays for everybody. A wrong code is limited as before.
  const perAddress = limits.perAddress.check(input.address, now);
  const global = limits.global.check("global", now);
  if (!perAddress.allowed) {
    const wait = Math.max(
      perAddress.retryAfterSeconds,
      global.allowed ? 0 : global.retryAfterSeconds,
    );
    return { ok: false, reason: "limited", retryAfterSeconds: wait };
  }
  const rules = checkPasswordRules(input.newPassword);
  if (!rules.ok)
    return { ok: false, reason: "password", problem: rules.problem };

  const canonical = canonicalCode(input.code);
  const identifier = input.identifier.trim().toLowerCase();
  const lookup = async (): Promise<{ id: string; user_id: string } | null> => {
    if (!codeShape.test(canonical) || identifier === "") return null;
    const found = await pool.query<{ id: string; user_id: string }>(
      `select c.id, c.user_id
         from recovery_codes c join users u on u.id = c.user_id
        where c.code_hash = $1 and c.used_at is null and c.voided_at is null
          and u.is_superuser
          and (lower(u.email) = $2 or lower(u.login) = $2)`,
      [hashCode(canonical), identifier],
    );
    return found.rows[0] ?? null;
  };

  let reserved = false;
  let row: { id: string; user_id: string } | null = null;
  if (!global.allowed) {
    row = await lookup();
    if (row === null) {
      return {
        ok: false,
        reason: "limited",
        retryAfterSeconds: global.retryAfterSeconds,
      };
    }
  } else {
    limits.perAddress.recordFailure(input.address, now);
    limits.global.recordFailure("global", now);
    reserved = true;
  }

  const fail = async (): Promise<RedeemResult> => {
    // The failure is already counted (reserved above). The time a hash would have taken is spent so a success and a
    // failure are not told apart by the clock.
    await spendHashingTime(input.newPassword);
    return { ok: false, reason: "invalid" };
  };
  if (row === null) row = await lookup();
  if (!row) return fail();

  const userId = Number(row.user_id);
  const hash = await hashPassword(input.newPassword);
  const outcome = await withTransaction(pool, async (client) => {
    // The code is spent under a lock, so two requests with the same code cannot both succeed.
    const spent = await client.query(
      `update recovery_codes set used_at = $2
        where id = $1 and used_at is null and voided_at is null`,
      [row.id, now],
    );
    if ((spent.rowCount ?? 0) !== 1) return null;
    // Changed 2026-10-11 (T170): the password, the sessions and the closing of an open hand-over (the holder may be
    // recovering exactly because somebody else started one) are credentials.ts's.
    const { closedHandovers } = await credentialsChanged(client, userId, {
      hash,
      now,
    });
    // The rest of the spent code's set is void, and a fresh set takes its place.
    const codes = await issueRecoverySet(client, userId);
    await writeAudit(client, {
      actorId: userId,
      action: "recovery_code_used",
      targetKind: "account",
      targetId: userId,
      detail: { freshSetIssued: true, closedHandovers },
      addressPrefix: input.addressPrefix,
    });
    return codes;
  });
  if (outcome === null) return fail();
  // The attempt was right: the reservation is given back, so a right code never counts against anybody.
  if (reserved) {
    limits.perAddress.forgive(input.address, now);
    limits.global.forgive("global", now);
  }
  return { ok: true, userId, codes: outcome };
}
