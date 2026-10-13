// The temporary password an administrator hands to a member (T065 of specs/001-self-hosted-club-site; research.md
// section 6; tests: server/test/temp-password.test.ts).
//
// 80 random bits written as 16 characters of Crockford's base32 in four groups of four (`7M2K-9QXD-04VT-HE5R`).
// Changed 2026-10-11 from the 128 bits research.md first wrote, at the owner's choice (variant B of the sketch of
// plan phase 3): the password is spoken or typed by a person, it is single-use (it must be changed at the first
// sign-in), it expires in 30 days, and every wrong guess is counted and paused like a wrong sign-in, so 80 bits is far
// beyond what a guess can reach, and it is the strength of the recovery codes the owner already accepted.
//
// - The alphabet has no I, L, O or U (Crockford), so a password read aloud or from a screen is not mistaken for another;
//   it is upper case and the hyphens are part of the text that was shown, so the person copies it whole.
// - Exactly 16 characters of 5 bits each is 80 bits with no modulo bias: every character is five bits taken straight
//   from the random bytes.

import { randomBytes } from "node:crypto";

const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** A new temporary password, for example `7M2K-9QXD-04VT-HE5R`. */
export function generateTemporaryPassword(): string {
  const bytes = randomBytes(10); // 80 bits
  let bits = 0;
  let buffer = 0;
  let out = "";
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += alphabet[(buffer >> bits) & 31];
    }
    buffer &= (1 << bits) - 1;
  }
  return [0, 4, 8, 12].map((i) => out.slice(i, i + 4)).join("-");
}

/** How long a temporary password lives, from the issue, in milliseconds (spec: 30 days). */
export const temporaryPasswordLifetimeMs = 30 * 24 * 60 * 60 * 1000;
