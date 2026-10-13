// Passwords (T047 of specs/001-self-hosted-club-site; research.md section 5; tests: server/test/password.test.ts).
//
// scrypt from Node's own `crypto`, at the first setting of OWASP's Password Storage Cheat Sheet: N=2^17 (128 MiB),
// r=8, p=1. No native package and no new dependency (the consilium of 2026-10-09 and the owner's rule on dependencies).
//
// Decisions that would otherwise look like mistakes:
// - The stored string is `scrypt$N=<n>,r=<r>,p=<p>$<salt>$<hash>`, base64 for the two binary parts. The parameters
//   are in the string, so a later raise of the cost still verifies every old hash, and `needsRehash` says which to
//   replace at the account's next successful sign-in. verifyPassword reads the parameters from the string and never
//   from today's constants.
// - Every computation goes through one counting semaphore of two (`hashingLimit`): each holds 128 MiB for about a
//   quarter of a second, so the limit bounds the memory a burst of sign-ins can claim at 256 MiB whatever its size.
//   The owner chose two on 2026-10-11 for a machine of about 2 GB.
// - The password is normalised to NFKC before hashing and before the length rule, as NIST SP 800-63B asks, so one
//   password typed on two keyboards that compose a letter differently is one password. The rule counts characters a
//   person sees (code points), not bytes: eight Cyrillic letters are eight characters.
// - A stored string that is not ours - damaged, empty, another algorithm, absurd parameters - is a plain `false`
//   and never an exception, and costs no hashing: a caller must not learn anything from the way it fails, and a
//   crafted value must not be able to ask the machine for gigabytes (the parameters are capped).
// - `spendHashingTime` runs one computation at today's cost and answers false. A sign-in for an identifier that does
//   not exist calls it so that the time of the answer does not tell an unknown account from a wrong password.

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { Semaphore } from "./semaphore.js";

/** Why a password was refused before hashing; the text a visitor sees belongs to the page, not to this module. */
export type PasswordProblem = "too_short" | "too_long";

export const passwordRules = { minLength: 8, maxLength: 128 } as const;

/** The number of scrypt computations that may run at once; each holds about 128 MiB while it runs. */
export const hashingLimit = 2;

// OWASP's first setting. Changing these is what `needsRehash` is for.
const current = { N: 131072, r: 8, p: 1 } as const;
const saltBytes = 16;
const hashBytes = 64;
// What a stored string may ask for before it is refused unread: far above today's cost, far below a danger.
const caps = { N: 1 << 20, r: 32, p: 16 } as const;

const hashing = new Semaphore(hashingLimit);

function normalise(password: string): string {
  return password.normalize("NFKC");
}

/** The length rule, in characters (code points) of the normalised password. */
export function checkPasswordRules(
  password: string,
): { ok: true } | { ok: false; problem: PasswordProblem } {
  const length = [...normalise(password)].length;
  if (length < passwordRules.minLength)
    return { ok: false, problem: "too_short" };
  if (length > passwordRules.maxLength)
    return { ok: false, problem: "too_long" };
  return { ok: true };
}

function derive(
  password: string,
  salt: Buffer,
  length: number,
  params: { N: number; r: number; p: number },
): Promise<Buffer> {
  // Node refuses a computation that wants more than `maxmem`; 128 * N * r is what scrypt needs, so twice that is
  // room, and the limit is a ceiling for this call only (the semaphore bounds how many calls run).
  const maxmem = 256 * params.N * params.r;
  return hashing.run(
    () =>
      new Promise<Buffer>((resolve, reject) => {
        scrypt(
          normalise(password),
          salt,
          length,
          { N: params.N, r: params.r, p: params.p, maxmem },
          (error, key) => (error ? reject(error) : resolve(key)),
        );
      }),
  );
}

/** The stored string: the algorithm, its parameters, the salt and the hash, so a later change of cost still verifies. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(saltBytes);
  const key = await derive(password, salt, hashBytes, current);
  return `scrypt$N=${current.N},r=${current.r},p=${current.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

type Parsed = { N: number; r: number; p: number; salt: Buffer; hash: Buffer };

// A string of ours, or null. Strict on purpose: one shape, whole numbers, N a power of two within the caps.
function parse(stored: string): Parsed | null {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "scrypt") return null;
  const match = /^N=([0-9]{1,8}),r=([0-9]{1,3}),p=([0-9]{1,3})$/.exec(
    parts[1] ?? "",
  );
  if (match === null) return null;
  const N = Number(match[1]);
  const r = Number(match[2]);
  const p = Number(match[3]);
  if (N < 2 || (N & (N - 1)) !== 0 || N > caps.N) return null;
  if (r < 1 || r > caps.r || p < 1 || p > caps.p) return null;
  const encoded = /^[A-Za-z0-9+/]+={0,2}$/;
  if (!encoded.test(parts[2] ?? "") || !encoded.test(parts[3] ?? ""))
    return null;
  const salt = Buffer.from(parts[2] ?? "", "base64");
  const hash = Buffer.from(parts[3] ?? "", "base64");
  if (salt.length < 8 || salt.length > 64) return null;
  if (hash.length < 16 || hash.length > 128) return null;
  return { N, r, p, salt, hash };
}

/** False for a wrong password and for a stored string that is not one of ours; never throws on a bad string. */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parsed = parse(stored);
  if (parsed === null) return false;
  try {
    const key = await derive(password, parsed.salt, parsed.hash.length, parsed);
    return (
      key.length === parsed.hash.length && timingSafeEqual(key, parsed.hash)
    );
  } catch {
    // A computation that could not run (out of memory for an odd string) is not a match, and not a crash.
    return false;
  }
}

/** True when the stored string was made with other parameters than today's, or is not ours: replace it at next sign-in. */
export function needsRehash(stored: string): boolean {
  const parsed = parse(stored);
  if (parsed === null) return true;
  return (
    parsed.N !== current.N || parsed.r !== current.r || parsed.p !== current.p
  );
}

/**
 * One computation at today's cost, answering false: what a sign-in for an unknown identifier does so that the answer
 * takes as long as one for a wrong password. The salt is fixed, so nothing is stored and nothing can match.
 */
export async function spendHashingTime(password: string): Promise<false> {
  await derive(password, Buffer.alloc(saltBytes, 7), hashBytes, current);
  return false;
}
