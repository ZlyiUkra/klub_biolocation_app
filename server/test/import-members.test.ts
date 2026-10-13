// Importing the club's members (T055 of specs/001-self-hosted-club-site). The parser needs no database; the import does.
// The rules pinned here are the owner's of 2026-10-11: the file is accepted whole or refused whole, everyone is a guest
// with no password, an existing account is never touched, and nothing personal reaches the audit log or a refusal.

import assert from "node:assert/strict";
import { test } from "node:test";
import { importMembers, parseMembers } from "../src/cli/import-members.js";
import { createTestDatabase, skipWithoutDatabase } from "./helpers/db.js";

test("a plain list: one address a line, comments and empty lines ignored, BOM and CRLF tolerated", () => {
  const parsed = parseMembers(
    "﻿# the club\r\n\r\nAnna@Example.Test\r\n  boris@example.test  \r\n# end\r\n",
  );
  assert.deepEqual(parsed.problems, []);
  assert.deepEqual(
    parsed.members.map((m) => [m.line, m.email, m.displayName, m.login]),
    [
      [3, "Anna@Example.Test", "", null],
      [4, "boris@example.test", "", null],
    ],
  );
});

test("the previous provider's CSV: quoted fields, name and login read, every other column only named", () => {
  const csv = [
    "id,first_name,last_name,username,primary_email_address,password_digest,password_hasher,totp_secret,public_metadata",
    'user_1,Анна,"Петрова, мл.",Anna.P,anna@example.test,$2a$10$abcdef,bcrypt,SECRETVALUE,"{""status"":""student""}"',
    "user_2,,,,boris@example.test,,,,",
  ].join("\n");
  const parsed = parseMembers(csv);
  assert.deepEqual(parsed.problems, []);
  assert.deepEqual(
    parsed.members.map((m) => [m.email, m.displayName, m.login]),
    [
      ["anna@example.test", "Анна Петрова, мл.", "anna.p"],
      ["boris@example.test", "", null],
    ],
  );
  // The names of the unused columns are reported, and none of their values appears anywhere in the result.
  assert.deepEqual(parsed.ignoredColumns, [
    "id",
    "password_digest",
    "password_hasher",
    "totp_secret",
    "public_metadata",
  ]);
  const dump = JSON.stringify(parsed);
  for (const secret of ["$2a$10$abcdef", "bcrypt", "SECRETVALUE", "student"]) {
    assert.ok(!dump.includes(secret), `${secret} is not in the parse result`);
  }
});

test("one bad line refuses the file: line numbers and reason codes only, never the text", () => {
  const parsed = parseMembers(
    [
      "ok@example.test",
      "not an address",
      "Ok@Example.Test",
      "two@@example.test",
      "# a comment",
      "fine@example.test",
    ].join("\n"),
  );
  assert.deepEqual(parsed.problems, [
    { line: 2, reason: "not_an_address" },
    { line: 3, reason: "duplicate_address" },
    { line: 4, reason: "not_an_address" },
  ]);
  const dump = JSON.stringify(parsed.problems);
  assert.ok(!dump.includes("example.test"));
});

test("a CSV row with the wrong number of fields, an unterminated quote and a headerless row are problems", () => {
  const wrong = parseMembers(
    "email,first_name\na@example.test,A\nb@example.test,B,extra\n",
  );
  assert.deepEqual(wrong.problems, [
    { line: 3, reason: "wrong_number_of_fields" },
  ]);
  const open = parseMembers('email,first_name\na@example.test,"A\n');
  assert.deepEqual(open.problems, [{ line: 2, reason: "unterminated_quote" }]);
  const headerless = parseMembers(
    "a@example.test,Anna\nb@example.test,Boris\n",
  );
  assert.ok(headerless.problems.every((p) => p.reason === "no_address_column"));
  assert.ok(headerless.problems.length > 0);
});

test("a comment that holds a quote above the header does not swallow the file", () => {
  const parsed = parseMembers(
    '# exported from "the old place\nemail,first_name\na@example.test,Anna\n',
  );
  assert.deepEqual(parsed.problems, []);
  assert.equal(parsed.members[0]?.line, 3);
});

test(
  "the import creates guests with no password, once, and leaves an existing account exactly as it is",
  { skip: skipWithoutDatabase },
  async () => {
    const db = await createTestDatabase();
    try {
      // An account that exists already, with a password, a status and a name of its own.
      await db.pool.query(
        `insert into users (email, display_name, status, password_hash)
         values ('Anna@Example.Test', 'Own Name', 'student', repeat('x', 30))`,
      );
      const parsed = parseMembers(
        [
          "id,first_name,last_name,username,primary_email_address,status",
          "1,Анна,Петрова,anna.p,anna@example.test,admin",
          "2,Борис,,boris,boris@example.test,admin",
          "3,,,,clara@example.test,metr",
          "4,Дмитро,,boris,dmitro@example.test,",
          "5,Еліна,,Bad Login!,elina@example.test,",
        ].join("\n"),
      );
      assert.deepEqual(parsed.problems, []);

      const first = await importMembers(db.pool, parsed);
      assert.deepEqual(
        { ...first, ignoredColumns: undefined },
        {
          created: 4,
          existed: 1,
          withoutName: 1,
          loginsSet: 1,
          // Added 2026-10-11 (T152): the count of dates that came with the file.
          withAccessDate: 0,
          loginsLeftOut: 2,
          ignoredColumns: undefined,
          dryRun: false,
        },
      );
      assert.deepEqual(first.ignoredColumns, ["id", "status"]);

      const rows = await db.pool.query(
        `select email, display_name, login, status, password_hash is not null as has_password, must_change, is_superuser
           from users order by email`,
      );
      const byEmail = Object.fromEntries(rows.rows.map((r) => [r.email, r]));
      // The old account is untouched: its own name, status and password.
      assert.equal(byEmail["Anna@Example.Test"].display_name, "Own Name");
      assert.equal(byEmail["Anna@Example.Test"].status, "student");
      assert.equal(byEmail["Anna@Example.Test"].has_password, true);
      // Everyone new is a guest with no password, whatever a column of the file said.
      for (const email of [
        "boris@example.test",
        "clara@example.test",
        "dmitro@example.test",
        "elina@example.test",
      ]) {
        assert.equal(byEmail[email].status, "guest", email);
        assert.equal(byEmail[email].has_password, false, email);
        assert.equal(byEmail[email].is_superuser, false, email);
        assert.equal(byEmail[email].must_change, false, email);
      }
      assert.equal(byEmail["boris@example.test"].login, "boris");
      // The second row to claim "boris" and the invalid login are left out, the accounts are still created.
      assert.equal(byEmail["dmitro@example.test"].login, null);
      assert.equal(byEmail["elina@example.test"].login, null);

      // A second run creates nothing.
      const again = await importMembers(db.pool, parsed);
      assert.equal(again.created, 0);
      assert.equal(again.existed, 5);

      // The audit log has one row per real run, with counts and column names and no address, name or login.
      const audit = await db.pool.query(
        "select action, actor_id, detail from audit_log where action = 'members_imported' order by id",
      );
      assert.equal(audit.rowCount, 2);
      assert.equal(audit.rows[0].actor_id, null);
      const dump = JSON.stringify(audit.rows);
      for (const personal of ["example.test", "Анна", "boris", "anna.p"]) {
        assert.ok(!dump.includes(personal), `${personal} is not in the audit`);
      }
    } finally {
      await db.drop();
    }
  },
);

test(
  "a dry run reports what a run would do and writes nothing, the audit log included",
  { skip: skipWithoutDatabase },
  async () => {
    const db = await createTestDatabase();
    try {
      const parsed = parseMembers("a@example.test\nb@example.test\n");
      const report = await importMembers(db.pool, parsed, { dryRun: true });
      assert.equal(report.created, 2);
      assert.equal(report.dryRun, true);
      const users = await db.pool.query("select count(*)::int as n from users");
      const audit = await db.pool.query(
        "select count(*)::int as n from audit_log",
      );
      assert.equal(users.rows[0].n, 0);
      assert.equal(audit.rows[0].n, 0);
    } finally {
      await db.drop();
    }
  },
);

test(
  "a thousand addresses go in as one transaction, quickly",
  { skip: skipWithoutDatabase },
  async () => {
    const db = await createTestDatabase();
    try {
      const text = Array.from(
        { length: 1000 },
        (_, i) => `member${i}@example.test`,
      ).join("\n");
      const parsed = parseMembers(text);
      assert.deepEqual(parsed.problems, []);
      const started = Date.now();
      const report = await importMembers(db.pool, parsed);
      assert.equal(report.created, 1000);
      assert.ok(Date.now() - started < 5000, "under five seconds");
    } finally {
      await db.drop();
    }
  },
);
