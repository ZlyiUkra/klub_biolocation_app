// The status rules (T059 of specs/001-self-hosted-club-site; ADMIN.md sections 1 and 2). Ported from the cases of
// scripts/check-statuses.mjs, which tested the statuses Worker these rules replace (T071), plus the temporary-password
// matrix and the superuser's "protected" answer. Needs no database.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  assignable,
  givenByAdmin,
  givenByMetr,
  isStatus,
  mayAdminister,
  refusalOfChange,
  refusalOfTemporaryPassword,
  statuses,
  type Actor,
  type Status,
  type Target,
} from "../src/users/status-rules.js";

const actor = (status: Status, id = 1, superuser = false): Actor => ({
  id,
  status,
  superuser,
});
const target = (status: Status, over: Partial<Target> = {}): Target => ({
  id: 2,
  status,
  superuser: false,
  blockedBy: null,
  ...over,
});

test("the list of statuses is the one the database accepts", () => {
  const migration = readFileSync(
    fileURLToPath(
      new URL("../../../migrations/012.do.users-sessions.sql", import.meta.url),
    ),
    "utf8",
  );
  const check =
    /status\s+text\s+not null default 'guest'\s+check \(status in \(([^)]*)\)\)/.exec(
      migration,
    );
  assert.ok(check, "the check constraint is found");
  const listed = [...(check[1] ?? "").matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
  assert.deepEqual([...statuses], listed);
  for (const status of statuses) assert.ok(isStatus(status));
  assert.equal(isStatus("owner"), false);
  assert.equal(isStatus(undefined), false);
});

test("who may administer, and what each may give", () => {
  assert.equal(mayAdminister(actor("metr")), true);
  assert.equal(mayAdminister(actor("admin")), true);
  for (const s of [
    "guest",
    "student",
    "expert",
    "master",
    "blocked",
  ] as const) {
    assert.equal(mayAdminister(actor(s)), false, s);
    assert.deepEqual(assignable(actor(s)), [], s);
  }
  assert.deepEqual(assignable(actor("metr")), [
    "student",
    "expert",
    "master",
    "blocked",
  ]);
  assert.deepEqual(assignable(actor("admin")), [
    "student",
    "expert",
    "master",
    "metr",
    "admin",
    "blocked",
  ]);
  assert.ok(!givenByAdmin.includes("guest") && !givenByMetr.includes("guest"));
});

test("nobody changes their own status, and the superuser is protected", () => {
  for (const status of ["metr", "admin"] as const) {
    assert.equal(
      refusalOfChange(actor(status, 7), target("student", { id: 7 }), "master"),
      "self",
    );
    assert.equal(
      refusalOfChange(
        actor(status),
        target("admin", { superuser: true }),
        "student",
      ),
      "protected",
    );
    assert.equal(
      refusalOfChange(
        actor(status),
        target("admin", { superuser: true }),
        "blocked",
      ),
      "protected",
    );
  }
  // The order is the Worker's: one's own account is "self" before the protected check.
  assert.equal(
    refusalOfChange(
      actor("admin", 3, true),
      target("admin", { id: 3, superuser: true }),
      "student",
    ),
    "self",
  );
});

test("guest is never given, by anyone", () => {
  for (const status of ["metr", "admin"] as const) {
    assert.equal(
      refusalOfChange(actor(status), target("student"), "guest"),
      "guest",
    );
  }
});

test("a metr gives the three member statuses and blocked to the members below the editors, and nothing else", () => {
  for (const current of [
    "guest",
    "student",
    "expert",
    "master",
    "blocked",
  ] as const) {
    for (const wanted of givenByMetr) {
      assert.equal(
        refusalOfChange(actor("metr"), target(current), wanted),
        null,
        `${current} to ${wanted}`,
      );
    }
    assert.equal(
      refusalOfChange(actor("metr"), target(current), "metr"),
      "rank",
      `${current} to metr`,
    );
    assert.equal(
      refusalOfChange(actor("metr"), target(current), "admin"),
      "rank",
      `${current} to admin`,
    );
  }
  for (const current of ["metr", "admin"] as const) {
    assert.equal(
      refusalOfChange(actor("metr"), target(current), "student"),
      "rank",
      `touching a ${current}`,
    );
    assert.equal(
      refusalOfChange(actor("metr"), target(current), "blocked"),
      "rank",
      `blocking a ${current}`,
    );
  }
});

test("a metr cannot lift a block an admin set, and can lift one a metr or nobody set", () => {
  assert.equal(
    refusalOfChange(
      actor("metr"),
      target("blocked", { blockedBy: "admin" }),
      "student",
    ),
    "rank",
  );
  assert.equal(
    refusalOfChange(
      actor("metr"),
      target("blocked", { blockedBy: "metr" }),
      "student",
    ),
    null,
  );
  assert.equal(
    refusalOfChange(
      actor("metr"),
      target("blocked", { blockedBy: null }),
      "student",
    ),
    null,
  );
  // An admin lifts any block.
  assert.equal(
    refusalOfChange(
      actor("admin"),
      target("blocked", { blockedBy: "admin" }),
      "student",
    ),
    null,
  );
});

test("an admin gives every status but guest to anyone but themselves and the superuser", () => {
  for (const current of statuses) {
    for (const wanted of givenByAdmin) {
      assert.equal(
        refusalOfChange(actor("admin"), target(current), wanted),
        null,
        `${current} to ${wanted}`,
      );
    }
  }
});

test("those who may not administer are refused first, whatever the target", () => {
  for (const status of [
    "guest",
    "student",
    "expert",
    "master",
    "blocked",
  ] as const) {
    assert.equal(
      refusalOfChange(actor(status), target("student"), "master"),
      "forbidden",
      status,
    );
    assert.equal(
      refusalOfTemporaryPassword(actor(status), target("student")),
      "forbidden",
      status,
    );
  }
});

test("the temporary-password matrix", () => {
  // A metr: the members below the editors and blocked ones, never a metr or an admin.
  for (const current of [
    "guest",
    "student",
    "expert",
    "master",
    "blocked",
  ] as const) {
    assert.equal(
      refusalOfTemporaryPassword(actor("metr"), target(current)),
      null,
      `metr for ${current}`,
    );
  }
  for (const current of ["metr", "admin"] as const) {
    assert.equal(
      refusalOfTemporaryPassword(actor("metr"), target(current)),
      "rank",
      `metr for ${current}`,
    );
  }
  // An admin: anyone, but not the superuser and not themselves.
  for (const current of statuses) {
    assert.equal(
      refusalOfTemporaryPassword(actor("admin"), target(current)),
      null,
      `admin for ${current}`,
    );
  }
  assert.equal(
    refusalOfTemporaryPassword(
      actor("admin"),
      target("admin", { superuser: true }),
    ),
    "protected",
  );
  assert.equal(
    refusalOfTemporaryPassword(
      actor("metr"),
      target("admin", { superuser: true }),
    ),
    "protected",
  );
  assert.equal(
    refusalOfTemporaryPassword(actor("admin", 9), target("student", { id: 9 })),
    "self",
  );
});
