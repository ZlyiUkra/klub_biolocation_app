// The video page's player states, on the REAL built site behind the REAL backend on a throwaway database (T082 and
// T149 of specs/001-self-hosted-club-site). Skipped when there is no database or the site has not been built
// (npm run build), like auth-pages.test.ts.
//
// What is pinned: one component for every video; the state a visitor is in is in the first byte of the page, chosen by
// the backend's lecture rule; a public YouTube video has its frame printed at once and a public video on another
// provider does not get a YouTube frame; the paid lecture's page carries neither the stored reference nor, under the
// default `locked`, the members-only block for a visitor who may not play, and carries the block already shown for one
// who may; an ended video says so and keeps the text.

import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { createSession } from "../src/auth/session.js";
import { createApp } from "../src/http/app.js";
import { loadSite, type Site } from "../src/http/site.js";
import {
  createTestDatabase,
  skipWithoutDatabase,
  type TestDatabase,
} from "./helpers/db.js";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
let db: TestDatabase;
let site: Site | null = null;
let base = "";
let close: () => Promise<void>;
const cookies: Record<string, string> = {};
let previousOrigin: string | undefined;

const MARKER = "zqxjvpagemarker";
const SECRET = "paidSecret_77";

const skip = (): string | false =>
  skipWithoutDatabase ||
  (site === null ? "the site is not built (npm run build)" : false);

const day = (offset: number) =>
  `((now() at time zone 'utc')::date + (${offset})::int)`;

async function lecture(
  slug: string,
  over: {
    paid: boolean;
    platform?: string;
    reference?: string;
    until?: number;
    block?: boolean;
  },
): Promise<void> {
  await db.pool.query(
    `select store_video($1, $1, 'd', false, '2026-01-01T00:00:00Z'::timestamptz, false, 'the public part',
                        '<p>the public part</p>', '[]'::jsonb,
                        $2, $3, $4, $5, $6, null, '{}', '{}', 1,
                        ${over.until === undefined ? "null::date" : day(over.until)})`,
    [
      slug,
      over.block ? "x" : null,
      over.block ? `<p>${MARKER}</p>` : null,
      over.platform ?? "youtube",
      over.paid ? null : (over.reference ?? "abc123def45"),
      over.paid,
    ],
  );
  if (over.paid) {
    await db.pool.query("select store_video_source($1, 'youtube', $2)", [
      slug,
      SECRET,
    ]);
  }
}

before(async () => {
  if (skipWithoutDatabase) return;
  site = await loadSite(root);
  if (site === null) return;
  db = await createTestDatabase();
  const make = async (key: string, status: string, until: number | null) => {
    const row = await db.pool.query(
      `insert into users (email, status, access_until, blocked_at)
       values ($1, $2, ${until === null ? "null" : day(until)},
               case when $2 = 'blocked' then now() end)
       returning id`,
      [`${key}@example.test`, status],
    );
    const { id } = await createSession(db.pool, {
      userId: Number(row.rows[0].id),
      status: status as "guest",
    });
    cookies[key] = id;
  };
  await make("student", "student", 30);
  await make("noDate", "student", null);
  await make("blocked", "blocked", 30);
  await make("metr", "metr", null);
  await lecture("public-yt", { paid: false });
  await lecture("public-vk", {
    paid: false,
    platform: "vk",
    reference: "-12345_67890",
  });
  await lecture("paid-one", { paid: true, block: true });
  await lecture("paid-ended", { paid: true, until: -1 });
  const server = createApp({
    pool: db.pool,
    siteOrigin: "http://localhost:4321",
    site,
  }).listen(0);
  await once(server, "listening");
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  previousOrigin = process.env["BACKEND_ORIGIN"];
  process.env["BACKEND_ORIGIN"] = base;
  close = () => new Promise((resolve) => server.close(() => resolve()));
});

after(async () => {
  if (previousOrigin === undefined) delete process.env["BACKEND_ORIGIN"];
  else process.env["BACKEND_ORIGIN"] = previousOrigin;
  if (site !== null && !skipWithoutDatabase) {
    await close();
    await db.drop();
  }
});

async function page(slug: string, who: string | null): Promise<string> {
  const headers: Record<string, string> = {};
  if (who) headers["cookie"] = `__Host-session=${cookies[who]}`;
  const res = await fetch(`${base}/video/${slug}/`, { headers });
  assert.equal(res.status, 200, `${slug} for ${String(who)}`);
  return res.text();
}

/** The `data-state` names of the player's elements that carry no `hidden` attribute. */
function visibleStates(html: string): string[] {
  const states: string[] = [];
  for (const tag of html.matchAll(
    /<[a-z]+[^>]*\bdata-state="([a-z_]+)"[^>]*>/g,
  )) {
    if (!/\shidden(?=[\s>=])/.test(tag[0])) states.push(tag[1] as string);
  }
  return states;
}

const initialOf = (html: string) =>
  /data-initial="([a-z_]+)"/.exec(html)?.[1] ?? null;

test(
  "a public YouTube video has its frame printed at once and no player stub",
  {},
  async (t) => {
    if (skip()) return t.skip(String(skip()));
    const html = await page("public-yt", null);
    assert.ok(html.includes("youtube-nocookie.com/embed/abc123def45"));
    assert.equal(html.includes("data-paid-video"), false);
  },
);

test(
  "a public video on another provider gets no YouTube frame: the stub asks the backend",
  {},
  async (t) => {
    if (skip()) return t.skip(String(skip()));
    const html = await page("public-vk", null);
    assert.equal(html.includes("youtube-nocookie.com/embed"), false);
    assert.equal(initialOf(html), "open");
    assert.deepEqual(visibleStates(html), ["loading"]);
  },
);

test(
  "a paid lecture: the state is chosen at render by the lecture rule, one visible state each",
  {},
  async (t) => {
    if (skip()) return t.skip(String(skip()));
    const cases: [string | null, string, string][] = [
      [null, "guest", "guest"],
      ["student", "open", "loading"],
      ["noDate", "no_access", "no_access"],
      ["blocked", "blocked", "blocked"],
      ["metr", "open", "loading"],
    ];
    for (const [who, initial, visible] of cases) {
      const html = await page("paid-one", who);
      assert.equal(initialOf(html), initial, String(who));
      assert.deepEqual(visibleStates(html), [visible], String(who));
    }
  },
);

test(
  "a paid lecture's page never carries the stored reference; the block is in it only for a viewer who may play, already shown",
  {},
  async (t) => {
    if (skip()) return t.skip(String(skip()));
    for (const who of [null, "student", "noDate", "blocked", "metr"]) {
      assert.equal(
        (await page("paid-one", who)).includes(SECRET),
        false,
        String(who),
      );
    }
    for (const who of [null, "noDate", "blocked"]) {
      assert.equal(
        (await page("paid-one", who)).includes(MARKER),
        false,
        String(who),
      );
    }
    for (const who of ["student", "metr"]) {
      const html = await page("paid-one", who);
      assert.ok(html.includes(MARKER), who);
      assert.match(html, /data-members-only=""\s+class="members-open"/);
    }
  },
);

test(
  "an ended video keeps its page and text and says the period ended; an editor still gets the player",
  {},
  async (t) => {
    if (skip()) return t.skip(String(skip()));
    const html = await page("paid-ended", "student");
    assert.equal(initialOf(html), "expired");
    assert.deepEqual(visibleStates(html), ["expired"]);
    assert.ok(html.includes("the public part"));
    const editor = await page("paid-ended", "metr");
    assert.deepEqual(visibleStates(editor), ["loading"]);
  },
);
