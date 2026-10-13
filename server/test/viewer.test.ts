// Who is asking, from the session cookie (T052 of specs/001-self-hosted-club-site; FR-016). Needs the development
// database. `viewerOfRequest` is the one function that turns a Cookie header into the Viewer the access module takes;
// this file pins its answers. What a viewer may see is the visibility function's business (entry_view, T023 and the
// migration that adds the members and restricted branches); until those branches exist a member sees what a guest
// sees, so the effect is tested here on the viewer and not on a page.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession } from "../src/auth/session.js";
import { viewerOfRequest } from "../src/auth/viewer.js";
import { createTestDatabase, skipWithoutDatabase } from "./helpers/db.js";

const guest = { userId: null, status: "guest" };
const cookieOf = (id: string) => ({
  headers: { cookie: `theme=dark; __Host-session=${id}; _ym_uid=1` },
});

let counter = 0;
async function account(
  pool: import("../src/db/pool.js").Pool,
  status: string,
): Promise<number> {
  counter += 1;
  const result = await pool.query(
    `insert into users (email, status, blocked_at)
     values ($1, $2, case when $2 = 'blocked' then now() end) returning id`,
    [`viewer${counter}@example.test`, status],
  );
  return Number(result.rows[0].id);
}

test(
  "a live session is the account's viewer, with the status the account has now",
  { skip: skipWithoutDatabase },
  async () => {
    const db = await createTestDatabase();
    try {
      const user = await account(db.pool, "student");
      const { id } = await createSession(db.pool, {
        userId: user,
        status: "student",
      });
      assert.deepEqual(await viewerOfRequest(db.pool, cookieOf(id)), {
        userId: user,
        status: "student",
      });
      // A promotion is seen at the next request, not at the next sign-in.
      await db.pool.query("update users set status = 'master' where id = $1", [
        user,
      ]);
      assert.deepEqual(await viewerOfRequest(db.pool, cookieOf(id)), {
        userId: user,
        status: "master",
      });
    } finally {
      await db.drop();
    }
  },
);

test(
  "no cookie, a made-up id, an expired session and a session that must change its password are a guest",
  { skip: skipWithoutDatabase },
  async () => {
    const db = await createTestDatabase();
    try {
      const user = await account(db.pool, "student");
      const limited = await createSession(db.pool, {
        userId: user,
        status: "student",
        limited: true,
      });
      const expired = await createSession(
        db.pool,
        { userId: user, status: "student" },
        new Date("2020-01-01T00:00:00Z"),
      );
      assert.deepEqual(await viewerOfRequest(db.pool, { headers: {} }), guest);
      assert.deepEqual(
        await viewerOfRequest(db.pool, cookieOf("not-an-id")),
        guest,
      );
      assert.deepEqual(
        await viewerOfRequest(db.pool, cookieOf(expired.id)),
        guest,
      );
      assert.deepEqual(
        await viewerOfRequest(db.pool, cookieOf(limited.id)),
        guest,
      );
    } finally {
      await db.drop();
    }
  },
);

test(
  "a blocked account is a viewer with its own status, and ending its sessions makes it a guest at once",
  { skip: skipWithoutDatabase },
  async () => {
    const db = await createTestDatabase();
    try {
      const user = await account(db.pool, "blocked");
      const { id } = await createSession(db.pool, {
        userId: user,
        status: "blocked",
      });
      assert.deepEqual(await viewerOfRequest(db.pool, cookieOf(id)), {
        userId: user,
        status: "blocked",
      });
      await db.pool.query("delete from sessions where user_id = $1", [user]);
      assert.deepEqual(await viewerOfRequest(db.pool, cookieOf(id)), guest);
    } finally {
      await db.drop();
    }
  },
);
