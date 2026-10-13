// The visibility matrix (T086 of specs/001-self-hosted-club-site; spec FR-007 to FR-011, user story 2, SC-003; written
// first for plan phase 5). Needs the development database; the site-level cases also need `npm run build`.
//
// One question, asked of every surface: for this viewer and this entry, is the entry there? The rule in data-model.md
// ("The visibility function") gives the expected answer once, in `expected` below, and every surface is compared with
// it, so a surface that disagrees with another one shows as a failure with the viewer and the entry in its message.
//
//   viewers   anonymous (no session), guest (signed in, no status), student, expert, master, metr, admin, blocked,
//             named (a signed-in guest who is named on the restricted entries)
//   audiences everyone, members, restricted (statuses student and master, plus the named person), hidden
//   teaser    false and true, on both kinds (a post and a video)
//
// "There" means the same on every surface (SC-003): an entry whose view is `full` or `teaser` is present - as its page,
// as a card, in its tag and category, in the search by its title, in the feed and the sitemap - and an entry whose view
// is `none` is absent everywhere, its page answers 404, and not one of its words is in anything the viewer received.
// What a teaser withholds is its content: the text of a post, the description and the members-only block of a video;
// they are in no response of a viewer whose view is `teaser`.
//
// Which tests are live: every API surface, for every audience, since T087 (migration 016 gave `entry_view` its
// `members`, `restricted` and teaser branches). The site's own surfaces for `members`, `restricted` and teaser - the
// entry page of a teaser and its head (T090) - carry `todo` until then; remove the `todo` in T090. Since T089 the
// feeds, the sitemap and the site's search are live too. Comments are in the database since 2026-10-13 (T106; migration 021), and their
// row of the matrix is the last test of this file.
//
// What a rule of the matrix would look like if it were wrong, so the next reader can judge it (decisions recorded in
// data-model.md): a blocked viewer counts as a guest for entry rules, so it does not get `members`; a named person is
// let in by name, whatever the status; metr and admin are not let into `restricted` by their status alone (the editor's
// preview is a separate route) and never see `hidden`.

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
const ORIGIN = "http://localhost:4321";

type View = "full" | "teaser" | "none";
type Audience = "everyone" | "members" | "restricted" | "hidden";
type Who =
  | "anonymous"
  | "guest"
  | "student"
  | "expert"
  | "master"
  | "metr"
  | "admin"
  | "blocked"
  | "named";

const viewers: Who[] = [
  "anonymous",
  "guest",
  "student",
  "expert",
  "master",
  "metr",
  "admin",
  "blocked",
  "named",
];
const audiences: Audience[] = ["everyone", "members", "restricted", "hidden"];
// The statuses listed on every restricted entry; `expert` is a member who is not listed.
const listed = ["student", "master"];
// What migration 003 decides today; the rest waits for T087.
const builtAudiences: Audience[] = ["everyone", "hidden"];
// Changed 2026-10-12 (T087 and T089): the API surfaces, the feeds, the sitemap and the site's search pass for every
// audience, so they are live; what waits is the entry page of a teaser and its head (T090, the locked card).
const waiting =
  "T090 (plan phase 5): the locked card and the head of a teaser's entry page";

type Entry = {
  kind: "post" | "video";
  slug: string;
  audience: Audience;
  teaser: boolean;
  title: string;
  intro: string;
  body: string;
  block: string;
  tag: string;
  category: string;
};

const entries: Entry[] = [];
let n = 0;
for (const kind of ["post", "video"] as const) {
  for (const audience of audiences) {
    for (const teaser of [false, true]) {
      n += 1;
      const id = String(n).padStart(2, "0");
      entries.push({
        kind,
        slug: `${kind}-${audience}-${teaser ? "teaser" : "plain"}`,
        audience,
        teaser,
        // Fixed-width words made of letters, so that no marker is a substring of another one: the search matches
        // substrings.
        title: `zqtitle${id}x`,
        intro: `zqintro${id}x`,
        body: `zqbody${id}x`,
        block: `zqblock${id}x`,
        tag: `tagzq${id}x`,
        category: `catzq${id}x`,
      });
    }
  }
}

/** The one statement of the rule, as data-model.md writes it. */
function expected(who: Who, e: Entry): View {
  if (e.audience === "hidden") return "none";
  if (e.audience === "everyone") return "full";
  const signedIn = who !== "anonymous";
  const lockedOut: View = e.teaser ? "teaser" : "none";
  if (e.audience === "members") {
    return signedIn && who !== "blocked" ? "full" : lockedOut;
  }
  return who === "named" || (signedIn && listed.includes(who))
    ? "full"
    : lockedOut;
}

let db: TestDatabase;
let site: Site | null = null;
let base = "";
let close: () => Promise<void>;
let previousOrigin: string | undefined;
const cookies: Partial<Record<Who, string>> = {};

before(async () => {
  if (skipWithoutDatabase) return;
  site = await loadSite(root);
  db = await createTestDatabase();
  const ids: Partial<Record<Who, number>> = {};
  for (const who of viewers) {
    if (who === "anonymous") continue;
    const status = who === "named" ? "guest" : who;
    const row = await db.pool.query(
      `insert into users (email, display_name, status, blocked_at)
       values ($1, $1, $2, case when $2 = 'blocked' then now() end) returning id`,
      [`${who}@example.test`, status],
    );
    ids[who] = Number(row.rows[0].id);
    cookies[who] = (
      await createSession(db.pool, {
        userId: ids[who] as number,
        status: status as "guest",
      })
    ).id;
  }
  const filler = Array.from({ length: 110 }, () => "filler").join(" ");
  let minute = 0;
  for (const e of entries) {
    minute += 1;
    const published = new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString();
    const text = `${e.intro} ${filler} ${e.body}`;
    if (e.kind === "post") {
      await db.pool.query(
        `select store_post($1, $2, 'd', false, $3::timestamptz, null, null, null, $4, $5, '[]'::jsonb, $4, $6,
                           array[$7]::text[], array[$8]::text[], 1)`,
        [
          e.slug,
          `Title ${e.title}`,
          published,
          text,
          `<p>${e.intro}</p><p>${filler}</p><p>${e.body}</p>`,
          `The ${e.intro} opening.`,
          e.tag,
          e.category,
        ],
      );
    } else {
      await db.pool.query(
        `select store_video($1, $2, 'd', false, $3::timestamptz, false, $4, $5, '[]'::jsonb, $6, $7,
                            'youtube', 'abc123def45', false, null, array[$8]::text[], array[$9]::text[], 1, null::date)`,
        [
          e.slug,
          `Title ${e.title}`,
          published,
          text,
          `<p>${e.intro}</p><p>${filler}</p><p>${e.body}</p>`,
          e.block,
          `<p>${e.block}</p>`,
          e.tag,
          e.category,
        ],
      );
    }
    await db.pool.query(
      "update entries set audience = $1, teaser = $2 where kind = $3 and slug = $4",
      [e.audience, e.teaser, e.kind, e.slug],
    );
    if (e.audience === "restricted") {
      const entry = await db.pool.query(
        "select id from entries where kind = $1 and slug = $2",
        [e.kind, e.slug],
      );
      const entryId = Number(entry.rows[0].id);
      for (const status of listed) {
        await db.pool.query(
          "insert into entry_audience_statuses (entry_id, status) values ($1, $2)",
          [entryId, status],
        );
      }
      await db.pool.query(
        "insert into entry_audience_users (entry_id, user_id) values ($1, $2)",
        [entryId, ids.named],
      );
    }
  }
  const server = createApp({
    pool: db.pool,
    siteOrigin: ORIGIN,
    ...(site !== null ? { site } : {}),
  }).listen(0);
  await once(server, "listening");
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  previousOrigin = process.env["BACKEND_ORIGIN"];
  process.env["BACKEND_ORIGIN"] = base;
  close = () => new Promise((resolve) => server.close(() => resolve()));
});

after(async () => {
  if (skipWithoutDatabase) return;
  if (previousOrigin === undefined) delete process.env["BACKEND_ORIGIN"];
  else process.env["BACKEND_ORIGIN"] = previousOrigin;
  await close();
  await db.drop();
});

type Answer = { status: number; text: string };
const answers = new Map<string, Promise<Answer>>();

/** One GET as a viewer, kept for the run: a surface is asked once per viewer however many tests read it. */
function get(path: string, who: Who): Promise<Answer> {
  const key = `${who} ${path}`;
  let found = answers.get(key);
  if (found === undefined) {
    found = (async () => {
      const headers: Record<string, string> = {};
      const cookie = cookies[who];
      if (cookie !== undefined) headers["cookie"] = `__Host-session=${cookie}`;
      const res = await fetch(base + path, { headers });
      return { status: res.status, text: await res.text() };
    })();
    answers.set(key, found);
  }
  return found;
}

const json = (a: Answer) => JSON.parse(a.text);
const path = (e: Entry) => (e.kind === "post" ? "posts" : "videos");
const slugSet = (items: { slug: string }[]) =>
  new Set(items.map((item) => item.slug));
const sorted = (set: Set<string>) => [...set].sort();

/** The slugs the rule says are present for the viewer, among the entries of the given audiences. */
function present(who: Who, among: Entry[]): Set<string> {
  return new Set(
    among.filter((e) => expected(who, e) !== "none").map((e) => e.slug),
  );
}

/** Every page of the combined list, newest year first, as one set of cards. */
async function listPages(who: Who): Promise<{ slug: string; view: View }[]> {
  const cards: { slug: string; view: View }[] = [];
  for (let page = 1; page < 20; page += 1) {
    const res = await get(`/api/list?kind=both&year=2026&page=${page}`, who);
    if (res.status === 404) break;
    assert.equal(res.status, 200);
    cards.push(...json(res).items);
  }
  return cards;
}

const among = (set: Audience[]) =>
  entries.filter((e) => set.includes(e.audience));

/** The checks of every API surface for the entries of the given audiences. */
async function checkApi(who: Who, set: Audience[]): Promise<void> {
  const subject = among(set);
  const want = present(who, subject);
  const label = (surface: string) => `${surface} for ${who}`;

  // 1. The entry's own page.
  const pages = new Set<string>();
  for (const e of subject) {
    const res = await get(`/api/${path(e)}/${e.slug}`, who);
    const view = expected(who, e);
    if (view === "none") {
      assert.equal(res.status, 404, `${label("page")}: ${e.slug}`);
      assert.equal(json(res).error, "not_found");
      continue;
    }
    assert.equal(res.status, 200, `${label("page")}: ${e.slug}`);
    pages.add(e.slug);
    const entry = json(res).entry;
    assert.equal(entry.view, view, `${label("page view")}: ${e.slug}`);
    if (view === "teaser") {
      assert.equal(entry.content, null, `${label("teaser")}: ${e.slug}`);
    } else {
      assert.notEqual(entry.content, null, `${label("full")}: ${e.slug}`);
    }
  }
  assert.deepEqual(sorted(pages), sorted(want), label("page"));

  // 2. The lists of posts and of videos, with the view of each card (the card preview).
  const listed1 = [
    ...json(await get("/api/posts", who)).items,
    ...json(await get("/api/videos", who)).items,
  ] as { slug: string; view: View; summary: string }[];
  const inSubject = listed1.filter((c) =>
    subject.some((e) => e.slug === c.slug),
  );
  assert.deepEqual(sorted(slugSet(inSubject)), sorted(want), label("lists"));
  for (const card of inSubject) {
    const e = subject.find((x) => x.slug === card.slug) as Entry;
    assert.equal(card.view, expected(who, e), label(`card view ${e.slug}`));
    assert.equal(
      card.summary.includes(e.body),
      false,
      label(`card preview of ${e.slug} carries no text past the introduction`),
    );
  }

  // 3. The list page, and the counts that must not betray an entry (FR-010).
  const pagesOfList = (await listPages(who)).filter((c) =>
    subject.some((e) => e.slug === c.slug),
  );
  assert.deepEqual(
    sorted(slugSet(pagesOfList)),
    sorted(want),
    label("list pages"),
  );

  // 4. Tags and categories: the page of the term, the term list with its count.
  const terms = json(await get("/api/terms", who)).terms as {
    kind: string;
    name: string;
    count: number;
  }[];
  const viaTags = new Set<string>();
  const viaCategories = new Set<string>();
  for (const e of subject) {
    const view = expected(who, e);
    const tag = terms.find((t) => t.kind === "tag" && t.name === e.tag);
    const category = terms.find(
      (t) => t.kind === "category" && t.name === e.category,
    );
    assert.equal(tag !== undefined, view !== "none", label(`tag ${e.tag}`));
    assert.equal(
      category !== undefined,
      view !== "none",
      label(`category ${e.category}`),
    );
    if (tag !== undefined) {
      assert.equal(tag.count, 1, label(`the count of ${e.tag}`));
      viaTags.add(e.slug);
    }
    if (category !== undefined) viaCategories.add(e.slug);
    const tagPage = json(
      await get(`/api/list?kind=both&tag=${encodeURIComponent(e.tag)}`, who),
    );
    assert.equal(
      tagPage.items.length,
      view === "none" ? 0 : 1,
      label(`tag page ${e.tag}`),
    );
  }
  assert.deepEqual(sorted(viaTags), sorted(want), label("tags"));
  assert.deepEqual(sorted(viaCategories), sorted(want), label("categories"));

  // 5. The year switcher counts only what the viewer sees.
  const years = json(await get("/api/list?kind=both", who)).years as {
    count: number;
  }[];
  const total = years.reduce((sum, y) => sum + y.count, 0);
  const everyInSubject = entries.filter((e) => set.includes(e.audience));
  if (set.length === audiences.length) {
    assert.equal(total, present(who, everyInSubject).size, label("years"));
  }

  // 6. The search: a title is found when the entry is present, the text only when the viewer sees all of it.
  const byTitle = new Set<string>();
  const byText = new Set<string>();
  for (const e of subject) {
    const title = json(await get(`/api/search?q=${e.title}`, who)).results;
    const text = json(await get(`/api/search?q=${e.body}`, who)).results;
    for (const r of title) if (r.slug === e.slug) byTitle.add(e.slug);
    for (const r of text) if (r.slug === e.slug) byText.add(e.slug);
  }
  assert.deepEqual(sorted(byTitle), sorted(want), label("search by title"));
  assert.deepEqual(
    sorted(byText),
    sorted(
      new Set(
        subject.filter((e) => expected(who, e) === "full").map((e) => e.slug),
      ),
    ),
    label("search by text"),
  );

  // 7. Neighbours point only at entries the viewer sees.
  for (const slug of want) {
    const e = subject.find((x) => x.slug === slug) as Entry;
    const res = json(await get(`/api/${path(e)}/${slug}`, who));
    for (const side of [res.next, res.prev]) {
      if (side === null) continue;
      const other = entries.find((x) => x.slug === side.slug) as Entry;
      assert.notEqual(
        expected(who, other),
        "none",
        label(`neighbour ${side.slug} of ${slug}`),
      );
    }
  }
}

/** Nothing of an absent entry, and nothing of the locked part of a teaser, is in any response the viewer got. */
async function checkNoLeak(who: Who, set: Audience[]): Promise<void> {
  const subject = among(set);
  const seen: string[] = [];
  for (const [key, answer] of answers) {
    if (key.startsWith(`${who} `)) seen.push((await answer).text);
  }
  assert.ok(seen.length > 0, `responses were collected for ${who}`);
  const all = seen.join("\n");
  for (const e of subject) {
    const view = expected(who, e);
    if (view === "none") {
      for (const word of [
        e.slug,
        e.title,
        e.intro,
        e.body,
        e.block,
        e.tag,
        e.category,
      ]) {
        // The slug of an entry is also the path a 404 was asked for; the request path is not in a response body.
        assert.equal(
          all.includes(word),
          false,
          `${word} of the absent ${e.slug} is in a response for ${who}`,
        );
      }
    } else if (view === "teaser") {
      for (const word of [e.body, e.block]) {
        assert.equal(
          all.includes(word),
          false,
          `${word} of the locked part of ${e.slug} is in a response for ${who}`,
        );
      }
    }
  }
}

const opts = skipWithoutDatabase ? { skip: skipWithoutDatabase } : {};

for (const who of viewers) {
  test(
    `matrix, ${who}: every API surface agrees for the audiences built so far`,
    opts,
    async () => {
      await checkApi(who, builtAudiences);
      await checkNoLeak(who, builtAudiences);
    },
  );

  test(
    `matrix, ${who}: every API surface agrees for members, restricted and teaser`,
    opts,
    async () => {
      await checkApi(who, audiences);
      await checkNoLeak(who, audiences);
    },
  );
}

// The site's own surfaces: the two feeds, the sitemap, the entry pages and their head. They are rendered on demand
// from the answers above, so they are checked on the real built site behind the real backend; skipped without a build,
// like video-page.test.ts.
const siteSkip = (): string | false =>
  skipWithoutDatabase ||
  (site === null ? "the site is not built (npm run build)" : false);

// `pages` false checks the feeds, the sitemap and the site's search only; true adds the entry pages and their head, which
// for a teaser are T090's (the locked card and the head metadata).
async function checkSite(
  who: Who,
  set: Audience[],
  pages = true,
): Promise<void> {
  const subject = among(set);
  const feeds = [await get("/rss.xml", who), await get("/video/rss.xml", who)];
  for (const f of feeds) assert.equal(f.status, 200);
  const sitemap = await get("/sitemap-0.xml", who);
  assert.equal(sitemap.status, 200);
  for (const e of subject) {
    const view = expected(who, e);
    const here = e.kind === "post" ? `/posts/${e.slug}/` : `/video/${e.slug}/`;
    const feed = (e.kind === "post" ? feeds[0] : feeds[1]) as Answer;
    assert.equal(
      feed.text.includes(here),
      view !== "none",
      `feed of ${e.slug} for ${who}`,
    );
    assert.equal(
      sitemap.text.includes(here),
      view !== "none",
      `sitemap of ${e.slug} for ${who}`,
    );
    assert.equal(
      sitemap.text.includes(`/tags/${e.tag}/`),
      view !== "none",
      `sitemap tag of ${e.slug} for ${who}`,
    );
    // The site's own search endpoint, which asks the backend with the visitor's cookie: a title is found when the entry
    // is present and the text only when the viewer sees all of it.
    for (const [word, found] of [
      [e.title, view !== "none"],
      [e.body, view === "full"],
    ] as const) {
      const res = await get(`/search/query.json?q=${word}`, who);
      assert.equal(res.status, 200);
      const urls = (json(res).results as { url: string }[]).map((r) => r.url);
      assert.equal(
        urls.some((u) => u.endsWith(here)),
        found,
        `site search for ${word} (${e.slug}) for ${who}`,
      );
    }
    if (!pages) continue;
    const page = await get(here, who);
    if (view === "none") {
      assert.equal(page.status, 404, `page of ${e.slug} for ${who}`);
      continue;
    }
    assert.equal(page.status, 200, `page of ${e.slug} for ${who}`);
    // The head and the body of a page: the locked part is nowhere, and no absent entry is named by a link or a meta.
    assert.equal(
      page.text.includes("data-locked-notice"),
      view === "teaser",
      `the lock notice on the page of ${e.slug} for ${who}`,
    );
    if (view === "teaser") {
      for (const word of [e.body, e.block]) {
        assert.equal(
          page.text.includes(word),
          false,
          `${word} in the page of the teaser ${e.slug} for ${who}`,
        );
      }
      // Head metadata of an entry the viewer cannot read: no description, no share tags, no article tags, no
      // canonical address, and the robots told not to index it (T090).
      for (const marker of [
        'name="description"',
        'property="og:',
        'name="twitter:',
        'property="article:',
        'property="video:',
        'rel="canonical"',
      ]) {
        assert.equal(
          page.text.includes(marker),
          false,
          `${marker} in the head of the teaser ${e.slug} for ${who}`,
        );
      }
      assert.match(page.text, /name="robots" content="noindex/);
      assert.equal(
        page.text.includes(e.intro),
        true,
        `the introduction on the page of the teaser ${e.slug} for ${who}`,
      );
    }
    for (const other of entries) {
      if (expected(who, other) !== "none") continue;
      for (const word of [other.title, other.slug]) {
        assert.equal(
          page.text.includes(word),
          false,
          `${word} of an absent entry in the page of ${e.slug} for ${who}`,
        );
      }
    }
  }
  for (const f of [...feeds, sitemap]) {
    for (const e of subject) {
      if (expected(who, e) === "teaser") {
        assert.equal(
          f.text.includes(e.body),
          false,
          `${e.body} in a feed or the sitemap for ${who}`,
        );
      }
    }
  }
}

for (const who of viewers) {
  test(
    `matrix, ${who}: feeds, sitemap and pages agree for the audiences built so far`,
    {},
    async (t) => {
      if (siteSkip()) return t.skip(String(siteSkip()));
      await checkSite(who, builtAudiences);
    },
  );
  // Changed 2026-10-12 (T089): the feeds, the sitemap and the site's search are live for every audience.
  test(
    `matrix, ${who}: feeds, sitemap and the site's search agree for members, restricted and teaser`,
    {},
    async (t) => {
      if (siteSkip()) return t.skip(String(siteSkip()));
      await checkSite(who, audiences, false);
    },
  );
  test(
    `matrix, ${who}: entry pages and their head agree for members, restricted and teaser`,
    {},
    async (t) => {
      if (siteSkip()) return t.skip(String(siteSkip()));
      await checkSite(who, audiences);
    },
  );
}

// Added 2026-10-12 (T088): the list pages of the site - posts, video, a tag, a category, the term indexes - hold exactly
// the entries the viewer's view says, the year switcher offers only years that have one, and an entry's previous and
// next links name only entries the viewer sees. These are the HTML pages, not the API answers checked above: the site
// builds every one of them from the backend's answer for the request's cookie, and this is what proves it did.
function slugsIn(html: string, base: string): Set<string> {
  const found = new Set<string>();
  for (const m of html.matchAll(
    new RegExp(`href="${base}([a-z0-9-]+)/"`, "g"),
  )) {
    if (entries.some((e) => e.slug === m[1])) found.add(m[1] as string);
  }
  return found;
}

/** Every page of a list address (the first, then /<year>/page/<n>/ until a 404), as the set of entries it links. */
async function entriesLinked(
  who: Who,
  first: string,
  pageBase: string,
  base: string,
) {
  const seen = new Set<string>();
  const firstPage = await get(first, who);
  if (firstPage.status !== 200) return { status: firstPage.status, seen };
  for (const s of slugsIn(firstPage.text, base)) seen.add(s);
  for (let n = 2; n < 20; n += 1) {
    const page = await get(`${pageBase}page/${n}/`, who);
    if (page.status !== 200) break;
    for (const s of slugsIn(page.text, base)) seen.add(s);
  }
  return { status: firstPage.status, seen };
}

async function checkSiteLists(who: Who): Promise<void> {
  for (const kind of ["post", "video"] as const) {
    const base = kind === "post" ? "/posts/" : "/video/";
    const here = entries.filter((e) => e.kind === kind);
    const want = present(who, here);
    const { seen } = await entriesLinked(who, base, `${base}2026/`, base);
    assert.deepEqual(sorted(seen), sorted(want), `list ${base} for ${who}`);
  }
  const tags = await get("/tags/", who);
  const categories = await get("/categories/", who);
  assert.equal(tags.status, 200);
  assert.equal(categories.status, 200);
  for (const e of entries) {
    const view = expected(who, e);
    assert.equal(
      tags.text.includes(`/tags/${e.tag}/`),
      view !== "none",
      `tag index: ${e.tag} for ${who}`,
    );
    for (const [path, term] of [
      [`/tags/${e.tag}/`, e.tag],
      [`/categories/${e.category}/`, e.category],
    ] as const) {
      const page = await get(path, who);
      if (view === "none") {
        assert.equal(page.status, 404, `${path} for ${who}`);
        continue;
      }
      assert.equal(page.status, 200, `${path} for ${who}`);
      assert.equal(
        page.text.includes('data-locked=""'),
        view === "teaser",
        `the lock on the card in ${path} for ${who}`,
      );
      const links = new Set([
        ...slugsIn(page.text, "/posts/"),
        ...slugsIn(page.text, "/video/"),
      ]);
      assert.deepEqual(
        sorted(links),
        [e.slug],
        `${term}'s page lists only its own entry for ${who}`,
      );
    }
  }
  // The categories index is an accordion of entries under their category, not a list of links to category pages, so
  // it is checked by the entries it links: exactly the ones the viewer sees.
  assert.deepEqual(
    sorted(
      new Set([
        ...slugsIn(categories.text, "/posts/"),
        ...slugsIn(categories.text, "/video/"),
      ]),
    ),
    sorted(present(who, entries)),
    `category index for ${who}`,
  );
  // Previous and next: the links of an entry's page point only at entries the viewer sees.
  for (const e of entries) {
    if (expected(who, e) !== "full") continue;
    const page = await get(
      e.kind === "post" ? `/posts/${e.slug}/` : `/video/${e.slug}/`,
      who,
    );
    assert.equal(page.status, 200);
    for (const other of entries) {
      if (other.slug === e.slug || expected(who, other) !== "none") continue;
      assert.equal(
        page.text.includes(
          `/${other.kind === "post" ? "posts" : "video"}/${other.slug}/`,
        ),
        false,
        `a link to the absent ${other.slug} on the page of ${e.slug} for ${who}`,
      );
    }
  }
}

for (const who of viewers) {
  test(
    `matrix, ${who}: the site's list, tag, category and term pages agree`,
    {},
    async (t) => {
      if (siteSkip()) return t.skip(String(siteSkip()));
      await checkSiteLists(who);
    },
  );
}

// Added 2026-10-12 (T089): the answers that depend on the audience are cacheable for guests only. A visitor with no
// session gets a copy that may be shared for a few seconds with an ETag; a signed-in account's is private and never
// stored; both vary on the cookie, and a conditional request from a guest answers 304.
test(
  "matrix: feeds, sitemap and search answers are shared for a guest and private for an account",
  {},
  async (t) => {
    if (siteSkip()) return t.skip(String(siteSkip()));
    const paths = [
      "/rss.xml",
      "/video/rss.xml",
      "/sitemap-0.xml",
      "/search/query.json?q=filler",
    ];
    for (const path of paths) {
      const guest = await fetch(base + path);
      assert.equal(guest.status, 200, path);
      assert.equal(
        guest.headers.get("cache-control"),
        "public, max-age=10",
        path,
      );
      assert.match(guest.headers.get("vary") ?? "", /cookie/i, path);
      const etag = guest.headers.get("etag");
      assert.ok(etag, `${path} carries an ETag`);
      await guest.text();
      const again = await fetch(base + path, {
        headers: { "if-none-match": etag },
      });
      assert.equal(again.status, 304, `${path} answers 304 to a matching ETag`);
      const other = await fetch(base + path, {
        headers: { "if-none-match": '"nope"' },
      });
      assert.equal(other.status, 200, path);
      await other.text();
      for (const who of ["student", "named", "blocked"] as const) {
        const res = await fetch(base + path, {
          headers: { cookie: `__Host-session=${cookies[who]}` },
        });
        assert.equal(res.status, 200, `${path} for ${who}`);
        assert.equal(
          res.headers.get("cache-control"),
          "private, no-store",
          `${path} for ${who}`,
        );
        assert.equal(res.headers.get("etag"), null, `${path} for ${who}`);
        assert.match(res.headers.get("vary") ?? "", /cookie/i);
        await res.text();
      }
    }
  },
);

// Changed 2026-10-13 (T106, T151): the todo of this row is a test now. Every entry carries one comment, and the
// comments of an entry are there for a viewer exactly when the entry is: a viewer whose view is `full` or `teaser` reads
// them (a guest reads the comments of a lecture shown as a card, T151), a viewer whose view is `none` gets the 404 of an
// unknown route, and not one comment of an absent entry is in anything that viewer received.
test(
  "matrix: the comments of an entry are there for a viewer exactly when the entry is, a teaser's included (T106, T151)",
  opts,
  async () => {
    const author = await db.pool.query(
      "select id from users where email = 'student@example.test'",
    );
    const authorId = Number(author.rows[0].id);
    const marker = (e: Entry) => `zqcomment-${e.slug}-x`;
    for (const e of entries) {
      await db.pool.query(
        `insert into comments (entry_id, author_id, body)
         select id, $3, $4 from entries where kind = $1 and slug = $2`,
        [e.kind, e.slug, authorId, marker(e)],
      );
    }
    for (const who of viewers) {
      for (const e of entries) {
        const res = await get(`/api/entries/${e.kind}/${e.slug}/comments`, who);
        const view = expected(who, e);
        if (view === "none") {
          assert.equal(res.status, 404, `${e.slug} for ${who}`);
          for (const other of entries) {
            assert.equal(
              res.text.includes(marker(other)),
              false,
              `a comment in the 404 of ${e.slug} for ${who}`,
            );
          }
        } else {
          assert.equal(res.status, 200, `${e.slug} for ${who}`);
          assert.deepEqual(
            json(res).map((c: { body: string }) => c.body),
            [marker(e)],
            `the thread of ${e.slug} for ${who}`,
          );
        }
      }
    }
  },
);
