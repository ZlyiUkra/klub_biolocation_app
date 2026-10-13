// Passwords (T042 of specs/001-self-hosted-club-site; data-model "users", research.md section on passwords). Written
// before the module (T047); they were `todo` until it was written (2026-10-11) and now run.
//
// Specified here: the stored string carries its own parameters (OWASP's first scrypt setting, N=2^17, r=8, p=1, so a
// later raise of the cost still verifies old hashes and `needsRehash` says which to replace); two hashes of one
// password differ (a salt per password); a wrong password and a damaged string both answer "no" and never throw; the
// counting semaphore never lets more than two computations run at once, because each holds 128 MiB; and the length
// rule is a minimum of 8 and a maximum of 128 characters, counted in characters a person sees and not in bytes.

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkPasswordRules,
  hashPassword,
  hashingLimit,
  needsRehash,
  passwordRules,
  spendHashingTime,
  verifyPassword,
} from "../src/auth/password.js";
import { Semaphore } from "../src/auth/semaphore.js";

test(
  "the stored string records the scrypt parameters, and a password verifies against it",
  {},
  async () => {
    const stored = await hashPassword("correct horse battery staple");
    // The parameters are part of the string, in a form a reader can check: N=2^17 is 131072.
    assert.match(
      stored,
      /^scrypt\$N=131072,r=8,p=1\$[A-Za-z0-9+/=_-]+\$[A-Za-z0-9+/=_-]+$/,
    );
    assert.equal(
      await verifyPassword("correct horse battery staple", stored),
      true,
    );
    assert.equal(
      await verifyPassword("correct horse battery stapl", stored),
      false,
    );
    assert.equal(needsRehash(stored), false, "today's parameters are current");
  },
);

test(
  "a salt per password: the same password hashes to two different strings that both verify",
  {},
  async () => {
    const [a, b] = await Promise.all([
      hashPassword("same password here"),
      hashPassword("same password here"),
    ]);
    assert.notEqual(a, b);
    assert.equal(await verifyPassword("same password here", a), true);
    assert.equal(await verifyPassword("same password here", b), true);
  },
);

test(
  "a stored string of other parameters is verified by its own parameters and reported as needing a rehash",
  {},
  async () => {
    // The module verifies by the parameters in the string, not by today's constants. A weaker string is made here with
    // the same format and the cheap setting N=2^10; the salt and hash are not those of any password, so it is a no.
    const weak =
      "scrypt$N=1024,r=8,p=1$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==";
    assert.equal(needsRehash(weak), true);
    assert.equal(await verifyPassword("anything", weak), false);
  },
);

test(
  "a damaged or foreign stored string is a plain no, and an empty one too",
  {},
  async () => {
    for (const bad of [
      "",
      "plaintext",
      "scrypt$",
      "scrypt$N=abc,r=8,p=1$salt$hash",
      "scrypt$N=131072,r=8,p=1$only-two-parts",
      "$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234",
    ]) {
      assert.equal(await verifyPassword("whatever1", bad), false, bad);
      assert.equal(needsRehash(bad), true, bad);
    }
  },
);

test("the length rule: 8 to 128 characters, counted as characters", {}, () => {
  assert.equal(passwordRules.minLength, 8);
  assert.equal(passwordRules.maxLength, 128);
  assert.deepEqual(checkPasswordRules("1234567"), {
    ok: false,
    problem: "too_short",
  });
  assert.deepEqual(checkPasswordRules("12345678"), { ok: true });
  assert.deepEqual(checkPasswordRules("a".repeat(128)), { ok: true });
  assert.deepEqual(checkPasswordRules("a".repeat(129)), {
    ok: false,
    problem: "too_long",
  });
  // Eight Cyrillic letters are 16 bytes and 8 characters: the rule is about characters.
  assert.deepEqual(checkPasswordRules("абвгґдеє"), { ok: true });
  // A character outside the basic plane is one character, not two.
  assert.deepEqual(checkPasswordRules("😀".repeat(8)), { ok: true });
  assert.deepEqual(checkPasswordRules("😀".repeat(7)), {
    ok: false,
    problem: "too_short",
  });
});

test(
  "the semaphore never lets more tasks run than its limit, and starts the waiting ones in order",
  {},
  async () => {
    const semaphore = new Semaphore(2);
    let running = 0;
    let peak = 0;
    const started: number[] = [];
    const task = (id: number) =>
      semaphore.run(async () => {
        started.push(id);
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 15));
        running -= 1;
        return id;
      });
    const results = await Promise.all([1, 2, 3, 4, 5, 6].map(task));
    assert.deepEqual(results, [1, 2, 3, 4, 5, 6]);
    assert.equal(peak, 2, "two at once and never three");
    assert.deepEqual(started, [1, 2, 3, 4, 5, 6], "first come, first served");
  },
);

test("a place is given back when a task throws", {}, async () => {
  const semaphore = new Semaphore(1);
  await assert.rejects(
    semaphore.run(async () => {
      throw new Error("boom");
    }),
    /boom/,
  );
  // The place is free again: this would wait forever otherwise (the test runner's timeout would fail it).
  assert.equal(await semaphore.run(async () => "after"), "after");
});

test("hashing is limited to two computations at once", {}, () => {
  assert.equal(hashingLimit, 2);
});

test(
  "an unknown identifier can spend one hashing time and gets false",
  {},
  async () => {
    // What a sign-in for an identifier that does not exist calls, so the time of the answer does not tell it apart.
    assert.equal(await spendHashingTime("anything at all"), false);
  },
);

test(
  "a crafted stored string cannot ask for absurd cost, and never throws",
  {},
  async () => {
    for (const bad of [
      "scrypt$N=2147483648,r=8,p=1$AAAAAAAAAAAAAAAAAAAAAA==$" +
        "A".repeat(86) +
        "==",
      "scrypt$N=131072,r=1000,p=1$AAAAAAAAAAAAAAAAAAAAAA==$" +
        "A".repeat(86) +
        "==",
      "scrypt$N=131073,r=8,p=1$AAAAAAAAAAAAAAAAAAAAAA==$" +
        "A".repeat(86) +
        "==",
    ]) {
      assert.equal(await verifyPassword("whatever1", bad), false, bad);
    }
  },
);

test(
  "the password is compared normalised: the same letters composed two ways are one password",
  {},
  async () => {
    const composed = "café au lait 42";
    const decomposed = "café au lait 42";
    const stored = await hashPassword(composed);
    assert.equal(await verifyPassword(decomposed, stored), true);
  },
);
