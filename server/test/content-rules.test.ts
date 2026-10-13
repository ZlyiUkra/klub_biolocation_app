// The content rules (T094 of specs/001-self-hosted-club-site, written first; the module is T096,
// `server/src/content/rules.ts`, which makes these pass).
//
// Where the 129 cases of the content Worker went (`scripts/check-content-admin.mjs`, 128 today: T083 removed the one
// that compared its session check with the video service's). Nothing is dropped; each group has a home:
//   - the rules, ported below: the refused saves (slug, title, description, date, tags, categories, unknown keys, raw
//     HTML, links, body length), the accepted bodies, a full valid save, every real post's text, and the boundary
//     cases of the front matter validator that T096 retired (server/test/validate.test.ts);
//   - the transport and the shape of a request, which are the routes' (T095, T097): foreign origin, GET, unknown
//     path, content type, not JSON, a request over the size limit (the constant is here: `contentLimits.request`),
//     409 on a stale or taken address, 404, a bad address in a path, and nothing written by a refused save;
//   - who may edit: the status rules and `site.admin.postEditors` (status-rules.test.ts, users-routes.test.ts); the
//     twelve token cases and the nine role cases were Clerk's session check, which sessions in the database replace;
//   - files and GitHub (the YAML a post file is written as, the lastmod line, block lists, the commit, GitHub down,
//     the token never in an answer): gone with the GitHub write path (T100); an entry is a row now.
// What changed with the move, as the contract has it (contracts/http-api.md, "Posts and videos in the panel"): the
// request is flat (no `fields` nesting), the date is `publishedAt`, a draft is the audience `hidden` (there is no
// `draft`), and there is no `sha` (an entry is addressed by id and a stale save is the route's `If-Match`). The audience
// form (`audience`, `statuses`, `userIds`, `teaser`) and a video's own fields are new here.
// Added, not in the Worker: the three bypasses of RISKS.md section 2 as refusals, and every refused HTML or link case
// also sent through the real renderer, because the first gate is not the only one (research.md section 3).

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { renderMarkdown } from "../src/content/render.js";
import {
  bodyProblem,
  contentLimits,
  postSaveProblems,
  videoSaveProblems,
  videoTextProblems,
} from "../src/content/rules.js";
import { videoTextProblems as videoTextProblemsOfGuards } from "../../src/content/video-guards.js";

const save = (over: Record<string, unknown> = {}) => ({
  slug: "admin-check",
  title: "Проверка панели",
  description: "Описание",
  publishedAt: "2026-10-01T12:00:00+03:00",
  tags: ["Биолокация", "проверка"],
  categories: ["education"],
  audience: "everyone",
  body: "Текст.",
  ...over,
});
const lineSeparator = String.fromCharCode(0x2028);

// [name, request, field, code]: the Worker's `invalidCases`, in its order and with its names, in the flat shape.
const refused: [string, Record<string, unknown>, string, string][] = [
  ["empty slug", save({ slug: "" }), "slug", "required"],
  ["slug ../evil", save({ slug: "../evil" }), "slug", "format"],
  ["slug with a capital", save({ slug: "Bad" }), "slug", "format"],
  ["slug a--b", save({ slug: "a--b" }), "slug", "format"],
  ["slug with a slash", save({ slug: "a/b" }), "slug", "format"],
  ["slug with a dot", save({ slug: "a.b" }), "slug", "format"],
  ["slug with a backslash", save({ slug: "a\\b" }), "slug", "format"],
  ["slug with an encoded slash", save({ slug: "a%2fb" }), "slug", "format"],
  ["slug ending with a hyphen", save({ slug: "a-" }), "slug", "format"],
  ["slug in Cyrillic", save({ slug: "пост" }), "slug", "format"],
  ["slug a bare year", save({ slug: "2025" }), "slug", "reserved"],
  ["slug page", save({ slug: "page" }), "slug", "reserved"],
  ["slug too long", save({ slug: "a".repeat(81) }), "slug", "too_long"],
  ["empty title", save({ title: " " }), "title", "required"],
  [
    "title with a line break",
    save({ title: "a\n---\naccess: paid" }),
    "title",
    "line_break",
  ],
  [
    "title with a line separator",
    save({ title: `a${lineSeparator}b` }),
    "title",
    "line_break",
  ],
  ["title too long", save({ title: "a".repeat(201) }), "title", "too_long"],
  ["title a number", save({ title: 5 }), "title", "type"],
  [
    "description with a line break",
    save({ description: "a\nb" }),
    "description",
    "line_break",
  ],
  [
    "date 31 February",
    save({ publishedAt: "2026-02-31T10:00:00+03:00" }),
    "publishedAt",
    "format",
  ],
  [
    "date without an offset",
    save({ publishedAt: "2026-10-01T10:00:00" }),
    "publishedAt",
    "format",
  ],
  [
    "date with a space",
    save({ publishedAt: "2026-10-01 10:00:00+03:00" }),
    "publishedAt",
    "format",
  ],
  [
    "date 25 o'clock",
    save({ publishedAt: "2026-10-01T25:00:00+03:00" }),
    "publishedAt",
    "format",
  ],
  ["tags not a list", save({ tags: "a, b" }), "tags", "type"],
  [
    "21 tags",
    save({ tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }),
    "tags",
    "too_many",
  ],
  ["a tag with a comma", save({ tags: ["a,b"] }), "tags", "format"],
  ["a tag with spaces around", save({ tags: [" a"] }), "tags", "format"],
  [
    "the same tag twice in two cases",
    save({ tags: ["Лоза", "лоза"] }),
    "tags",
    "duplicate",
  ],
  ["an empty tag", save({ tags: [""] }), "tags", "required"],
  ["a field outside the schema", save({ access: "paid" }), "access", "unknown"],
  ["layout slipped in", save({ layout: "x" }), "layout", "unknown"],
  [
    "an unknown request key",
    save({ path: ".github/workflows/x.yml" }),
    "path",
    "unknown",
  ],
  ["a draft flag is gone", save({ draft: true }), "draft", "unknown"],
  [
    "an audience that is not one",
    save({ audience: "draft" }),
    "audience",
    "format",
  ],
  ["an audience as a number", save({ audience: 5 }), "audience", "type"],
  [
    "a status that does not exist",
    save({ audience: "restricted", statuses: ["emperor"] }),
    "statuses",
    "format",
  ],
  ["statuses not a list", save({ statuses: "expert" }), "statuses", "type"],
  [
    "the same status twice",
    save({ statuses: ["expert", "expert"] }),
    "statuses",
    "duplicate",
  ],
  [
    "a named person that is not a number",
    save({ userIds: ["a"] }),
    "userIds",
    "format",
  ],
  ["named people not a list", save({ userIds: 3 }), "userIds", "type"],
  ["a teaser as text", save({ teaser: "yes" }), "teaser", "type"],
  ["a script tag", save({ body: "<script>alert(1)</script>" }), "body", "html"],
  [
    "an img with onerror",
    save({ body: "Текст <img src=x onerror=alert(1)>" }),
    "body",
    "html",
  ],
  [
    "an iframe",
    save({ body: "<iframe src=https://evil.example></iframe>" }),
    "body",
    "html",
  ],
  ["an HTML comment", save({ body: "<!-- x -->" }), "body", "html"],
  [
    "a members-only block",
    save({ body: "<div data-members-only>\n\nx\n\n</div>" }),
    "body",
    "html",
  ],
  ["a closing tag", save({ body: "x </p>" }), "body", "html"],
  [
    "a javascript: link",
    save({ body: "[x](javascript:alert(1))" }),
    "body",
    "link",
  ],
  [
    "a JAVASCRIPT: link with spaces",
    save({ body: "[x](  JAVASCRIPT:alert(1))" }),
    "body",
    "link",
  ],
  [
    "a link through an entity",
    save({ body: "[x](&#106;avascript:alert(1))" }),
    "body",
    "link",
  ],
  ["a data: link", save({ body: "[x](data:text/html,hi)" }), "body", "link"],
  ["a vbscript: image", save({ body: "![x](vbscript:x)" }), "body", "link"],
  [
    "a javascript: reference",
    save({ body: "[x][r]\n\n[r]: javascript:alert(1)" }),
    "body",
    "link",
  ],
  [
    "a javascript: autolink",
    save({ body: "<javascript:alert(1)>" }),
    "body",
    "html",
  ],
  ["a body too long", save({ body: "a".repeat(200_001) }), "body", "too_long"],
];

const accepted: [string, string][] = [
  ["a tag inside inline code", "Тег `<b>` пишется так."],
  [
    "a tag inside fenced code",
    "```html\n<div>\n  <script>x</script>\n</div>\n```",
  ],
  ["a tag inside a tilde fence", "~~~\n<iframe>\n~~~"],
  ["a comparison in math", "Формула $a<b$ и $$x<y$$."],
  ["a web autolink", "<https://example.com/a?b=1>"],
  ["a mail autolink", "<mailto:club@example.com>"],
  [
    "links of every allowed kind",
    "[a](https://e.com) [b](http://e.com) [c](/posts/x/) [d](#top) [e](mailto:a@b.c) [f](./x) [g](../y) [h](relative/path)",
  ],
  ["a less-than sign in prose", "3 < 5 и 5 > 3"],
];

// The three inputs of RISKS.md section 2, found 2026-10-09 and reproduced on 2026-10-12 against the real pipeline: each
// passed the Worker's regular expressions and, rendered without the sanitizer, gave a script, an image with a handler
// or a link with a javascript: address.
const bypasses: [string, string, "html" | "link"][] = [
  [
    "a code span that runs across a blank line",
    "`\n\n<script>alert(1)</script>\n\n`",
    "html",
  ],
  [
    "a code fence whose info string contains a backtick",
    "```js`x\n<script>alert(1)</script>\n```",
    "html",
  ],
  [
    "a reference link whose label contains an escaped bracket",
    String.raw`[a\]b]` + "\n\n" + String.raw`[a\]b]: javascript:alert(1)`,
    "link",
  ],
];

test("a complete, well-formed save has no problems", async () => {
  assert.deepEqual(await postSaveProblems(save()), []);
  assert.deepEqual(
    await postSaveProblems(save({ description: "", tags: [], categories: [] })),
    [],
  );
  assert.deepEqual(
    await postSaveProblems(
      save({
        audience: "restricted",
        statuses: ["expert", "master"],
        userIds: [3, 4],
        teaser: true,
      }),
    ),
    [],
  );
  // Only the four required fields: the rest take their defaults.
  assert.deepEqual(
    await postSaveProblems({
      slug: "a",
      title: "T",
      publishedAt: "2028-02-29T23:59:59-05:30",
      body: "x",
    }),
    [],
    "a leap day and a negative half-hour offset",
  );
});

for (const [name, request, field, code] of refused) {
  test(`refused: ${name}`, async () => {
    const problems = await postSaveProblems(request);
    assert.ok(
      problems.some((p) => p.field === field && p.code === code),
      `${field}/${code} among ${JSON.stringify(problems)}`,
    );
  });
}

test("a slug of exactly the limit is fine, and every broken rule is reported together, in a fixed order", async () => {
  assert.deepEqual(
    await postSaveProblems(save({ slug: "a".repeat(contentLimits.slug) })),
    [],
  );
  const all = await postSaveProblems({
    slug: "Bad Slug",
    extra: true,
    title: "",
    description: 1,
    publishedAt: "yesterday",
    tags: "x",
    categories: "y",
    audience: null,
    statuses: "z",
    userIds: "w",
    teaser: "t",
    body: 5,
  });
  assert.deepEqual(
    all.map((p) => p.field),
    [
      "extra",
      "slug",
      "title",
      "description",
      "publishedAt",
      "tags",
      "categories",
      "audience",
      "statuses",
      "userIds",
      "teaser",
      "body",
    ],
  );
});

test("categories keep their case, tags are folded, the limits are the limits", async () => {
  assert.deepEqual(
    await postSaveProblems(save({ categories: ["Blog", "blog"] })),
    [],
  );
  assert.ok(
    (await postSaveProblems(save({ categories: ["blog", "blog"] }))).some(
      (p) => p.field === "categories" && p.code === "duplicate",
    ),
  );
  assert.ok(
    (
      await postSaveProblems(
        save({
          categories: Array.from(
            { length: contentLimits.categories + 1 },
            (_, i) => `c${i}`,
          ),
        }),
      )
    ).some((p) => p.field === "categories" && p.code === "too_many"),
  );
  assert.ok(
    (
      await postSaveProblems(
        save({ tags: ["x".repeat(contentLimits.term + 1)] }),
      )
    ).some((p) => p.field === "tags" && p.code === "too_long"),
  );
  assert.ok(
    (await postSaveProblems(save({ tags: [5] }))).some(
      (p) => p.field === "tags" && p.code === "type",
    ),
  );
  for (const bad of [
    "2026-07-13",
    "2026-07-13T10:00:00Z",
    "2026-07-13T24:00:00+03:00",
    "2026-07-13T10:60:00+03:00",
    "2026-07-13T10:00:00+15:00",
    "2026-13-01T10:00:00+03:00",
  ]) {
    assert.ok(
      (await postSaveProblems(save({ publishedAt: bad }))).some(
        (p) => p.field === "publishedAt" && p.code === "format",
      ),
      bad,
    );
  }
  assert.ok(
    (await postSaveProblems(save({ publishedAt: new Date() }))).some(
      (p) => p.field === "publishedAt" && p.code === "type",
    ),
  );
});

test("a partial save checks the keys it has, refuses the address, and an empty one is fine", async () => {
  assert.deepEqual(await postSaveProblems({}, { partial: true }), []);
  assert.deepEqual(
    await postSaveProblems({ title: "Новый" }, { partial: true }),
    [],
  );
  assert.deepEqual(
    await postSaveProblems({ body: "<b>x</b>" }, { partial: true }),
    [{ field: "body", code: "html" }],
  );
  assert.deepEqual(await postSaveProblems({ title: "" }, { partial: true }), [
    { field: "title", code: "required" },
  ]);
  assert.deepEqual(
    await postSaveProblems({ slug: "other" }, { partial: true }),
    [{ field: "slug", code: "unknown" }],
  );
  // On a creation the required ones are required.
  const missing = await postSaveProblems({ slug: "a" });
  assert.deepEqual(
    missing.map((p) => p.field),
    ["title", "publishedAt", "body"],
  );
});

test("a request that is not an object is one problem, not a crash", async () => {
  for (const request of [null, [1], "text", 5, undefined]) {
    assert.deepEqual(await postSaveProblems(request), [
      { field: "request", code: "type" },
    ]);
    assert.deepEqual(await videoSaveProblems(request), [
      { field: "request", code: "type" },
    ]);
  }
});

test("the size of a request is a limit of this module, 512 KiB", () => {
  assert.equal(contentLimits.request, 512 * 1024);
  assert.equal(contentLimits.body, 200_000);
});

for (const [name, body] of accepted) {
  test(`accepted: ${name}`, async () => {
    assert.equal(await bodyProblem(body), undefined);
    assert.deepEqual(
      await postSaveProblems(save({ audience: "hidden", body })),
      [],
    );
  });
}

test("every published post's text passes the body gate", async () => {
  const dir = new URL("../../../../src/content/posts/", import.meta.url);
  const files = readdirSync(fileURLToPath(dir)).filter((f) =>
    f.endsWith(".md"),
  );
  assert.ok(files.length >= 20, `${files.length} posts`);
  for (const file of files) {
    const text = readFileSync(fileURLToPath(new URL(file, dir)), "utf8");
    const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
    assert.equal(await bodyProblem(body), undefined, file);
  }
});

for (const [name, body, code] of bypasses) {
  test(`bypass of RISKS.md section 2 is refused: ${name}`, async () => {
    assert.equal(await bodyProblem(body), code);
    assert.ok(
      (await postSaveProblems(save({ body }))).some(
        (p) => p.field === "body" && p.code === code,
      ),
    );
  });
}

// ---- videos -------------------------------------------------------------------------------------------------------

const videoSave = (over: Record<string, unknown> = {}) =>
  save({
    slug: "lecture-1",
    paid: false,
    availableUntil: null,
    membersOnly: null,
    source: { provider: "youtube", reference: "dQw4w9WgXcQ" },
    ...over,
  });

test("a video: a public one carries its link, a paid one need not, and the link's shape is checked", async () => {
  assert.deepEqual(await videoSaveProblems(videoSave()), []);
  const paid = videoSave({ paid: true });
  delete (paid as Record<string, unknown>)["source"];
  assert.deepEqual(await videoSaveProblems(paid), []);
  const noSource = videoSave();
  delete (noSource as Record<string, unknown>)["source"];
  assert.deepEqual(await videoSaveProblems(noSource), [
    { field: "source", code: "required" },
  ]);
  assert.ok(
    (
      await videoSaveProblems(
        videoSave({ source: { provider: "tiktok", reference: "x" } }),
      )
    ).some((p) => p.field === "source" && p.code === "format"),
  );
  assert.ok(
    (
      await videoSaveProblems(
        videoSave({ source: { provider: "vk", reference: "" } }),
      )
    ).some((p) => p.field === "source" && p.code === "required"),
  );
  assert.ok(
    (await videoSaveProblems(videoSave({ source: "dQw4w9WgXcQ" }))).some(
      (p) => p.field === "source" && p.code === "type",
    ),
  );
});

test("a video: the end date is a real day or null, the flag a boolean, the block Markdown without raw HTML", async () => {
  assert.deepEqual(
    await videoSaveProblems(videoSave({ availableUntil: "2031-12-31" })),
    [],
  );
  assert.ok(
    (await videoSaveProblems(videoSave({ availableUntil: "2031-02-30" }))).some(
      (p) => p.field === "availableUntil" && p.code === "format",
    ),
  );
  assert.ok(
    (await videoSaveProblems(videoSave({ availableUntil: 5 }))).some(
      (p) => p.field === "availableUntil" && p.code === "type",
    ),
  );
  assert.ok(
    (await videoSaveProblems(videoSave({ paid: "yes" }))).some(
      (p) => p.field === "paid" && p.code === "type",
    ),
  );
  assert.ok(
    (
      await videoSaveProblems(
        videoSave({ paid: true, membersOnly: "<script>x</script>" }),
      )
    ).some((p) => p.field === "membersOnly" && p.code === "html"),
  );
});

test("a paid lecture's text holds no YouTube and no Yandex Disk address, its block included; a public one has no block", async () => {
  const youtube = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  const disk = "https://disk.yandex.ru/d/abc";
  for (const field of ["description", "body", "membersOnly"]) {
    const found = await videoSaveProblems(
      videoSave({ paid: true, [field]: `Смотреть: ${youtube}` }),
    );
    assert.ok(
      found.some((p) => p.field === field && p.code === "youtube_in_paid"),
      `${field}: ${JSON.stringify(found)}`,
    );
  }
  assert.ok(
    (await videoSaveProblems(videoSave({ paid: true, body: disk }))).some(
      (p) => p.code === "yandex_in_paid",
    ),
  );
  assert.deepEqual(
    await videoSaveProblems(videoSave({ body: `Ссылка: ${youtube}` })),
    [],
    "a public lecture may link to YouTube",
  );
  assert.ok(
    (
      await videoSaveProblems(videoSave({ membersOnly: "Закрытый блок." }))
    ).some((p) => p.field === "membersOnly" && p.code === "block_in_public"),
  );
  assert.deepEqual(
    await videoSaveProblems(
      videoSave({ paid: true, membersOnly: "Материалы." }),
    ),
    [],
  );
});

test("a partial video save judges the text by the stored paid flag", async () => {
  const youtube = "https://youtu.be/dQw4w9WgXcQ";
  assert.deepEqual(
    await videoSaveProblems(
      { body: youtube },
      { partial: true, current: { paid: false } },
    ),
    [],
  );
  assert.deepEqual(
    await videoSaveProblems(
      { body: youtube },
      { partial: true, current: { paid: true } },
    ),
    [{ field: "body", code: "youtube_in_paid" }],
  );
  assert.deepEqual(
    await videoSaveProblems(
      { paid: true, body: youtube },
      { partial: true, current: { paid: false } },
    ),
    [{ field: "body", code: "youtube_in_paid" }],
    "the request's own flag wins",
  );
  assert.deepEqual(
    await videoSaveProblems(
      { title: "Новое" },
      { partial: true, current: { paid: false } },
    ),
    [],
    "no source is needed on an update",
  );
});

// The second gate does not depend on the first (research.md section 3): a text that reached the renderer by any other
// road still comes out without script, a handler, a frame or a script-scheme address.
const dangerous =
  /<script|<iframe|<img|<div|<!--|\son[a-z]+=|href="(?:javascript|data|vbscript):|src="(?:javascript|data|vbscript):/i;
const everyHostile = [
  ...refused
    .filter(([, , field, code]) => field === "body" && code !== "too_long")
    .map(([name, request]) => [name, request["body"] as string]),
  ...bypasses.map(([name, body]) => [name, body]),
] as [string, string][];

for (const [name, body] of everyHostile) {
  test(`the renderer neutralises it too: ${name}`, async () => {
    const { html } = await renderMarkdown(body);
    assert.doesNotMatch(html, dangerous);
  });
}

test("the video text rules are the ones of the guards module, unchanged", () => {
  assert.equal(videoTextProblems, videoTextProblemsOfGuards);
});
