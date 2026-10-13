// The temporary password generator (T065 of specs/001-self-hosted-club-site). No database.

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  generateTemporaryPassword,
  temporaryPasswordLifetimeMs,
} from "../src/users/temp-password.js";

test("shape: four groups of four from Crockford's alphabet, no I, L, O or U", () => {
  for (let i = 0; i < 200; i++) {
    const password = generateTemporaryPassword();
    assert.match(
      password,
      /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/,
    );
  }
});

test("it is random: 1000 passwords are all different and every character of the alphabet shows up", () => {
  const seen = new Set<string>();
  const chars = new Set<string>();
  for (let i = 0; i < 1000; i++) {
    const password = generateTemporaryPassword();
    seen.add(password);
    for (const c of password.replace(/-/g, "")) chars.add(c);
  }
  assert.equal(seen.size, 1000);
  assert.equal(chars.size, 32);
});

test("it lives thirty days", () => {
  assert.equal(temporaryPasswordLifetimeMs, 30 * 24 * 60 * 60 * 1000);
});
