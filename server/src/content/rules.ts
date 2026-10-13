// The content rules as one plain module (task T096 of specs/001-self-hosted-club-site; tests: server/test/
// content-rules.test.ts, written first by T094).
//
// One home for what a post or a video may contain (constitution III). It takes the place of three copies: the content
// Worker's `saveProblems` and `bodyProblem` (workers/content-admin/worker.mjs, deleted by T100), the front matter
// validator that stood in server/src/content/validate.ts (T027; gone), and the video text guards' address patterns
// (src/content/video-guards.ts, which this module uses and re-exports `videoTextProblems` from, unchanged).
//
// What a request looks like here is the contract's (contracts/http-api.md, "Posts and videos in the panel"): flat
// fields, `publishedAt`, an `audience`. The Worker's nesting (`fields`) and its `sha` have no successor: an entry is
// addressed by its id and a stale save is the route's `If-Match`. The codes are the Worker's, so a panel written
// against either reads the same answers: `required`, `type`, `too_long`, `too_many`, `format`, `reserved`,
// `duplicate`, `line_break`, `unknown`, and for a body `html` and `link`.
//
// Decisions that would otherwise look like mistakes:
// - The body gate does not read Markdown with regular expressions. The Worker's did, and three inputs of RISKS.md
//   section 2 passed it (a code span across a blank line, a fence with a backtick in its info string, a reference label
//   with an escaped bracket) and rendered as script or as a javascript: link. This gate parses the text with the
//   renderer's own parser (`createMarkdownProcessor`, the same unified pipeline and remark-math) and asks the one
//   sanitizer, `remarkNoRawHtml`, whether it would change the tree. If it would, the text is refused: there is no
//   second definition of "raw HTML" or "an unsafe address" to drift from the first. Code, inline code and math are
//   text in the tree, so a tag written there is accepted, as before.
// - The code of a refusal says what was found: `html` for raw HTML and for an autolink to a script (written `<...>`,
//   as the Worker did), `link` for a link, an image or a reference definition with an unsafe address.
// - The pipeline is loaded on first use, so a page script that imports only the limits does not pull Shiki and KaTeX.
// - Dates are checked part by part; Date.parse turns 2026-02-31 into a day of March without a word.
// - This is the first gate. The sanitizer in the renderer does not depend on it (research.md section 3).

import type { Link, Nodes, Root } from "mdast";
import type { VFile } from "vfile";
import { normalizeReference } from "../video/providers/index.js";
import {
  yandexDiskAddress,
  youtubeAddress,
} from "../../../src/content/video-guards.js";

export type ContentProblem = { field: string; code: string };

/** The codes of a body that is refused. */
export type BodyProblem = "type" | "too_long" | "html" | "link";

/** The limits of a save, in characters unless noted; `request` is in bytes. */
export const contentLimits = {
  slug: 80,
  title: 200,
  description: 300,
  term: 60,
  tags: 20,
  categories: 10,
  body: 200_000,
  request: 512 * 1024,
  userIds: 100,
  reference: 500,
} as const;

/** The fields of a post's save, in the order a new entry lists them (`slug` is for a creation only). */
export const ownedFields = [
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
] as const;

/** The fields a video adds. */
export const videoFields = [
  "paid",
  "availableUntil",
  "membersOnly",
  "source",
] as const;

export const audiences = [
  "everyone",
  "members",
  "restricted",
  "hidden",
] as const;
export const namedStatuses = [
  "guest",
  "student",
  "expert",
  "master",
  "metr",
  "admin",
  "blocked",
] as const;
export const sourceProviders = [
  "youtube",
  "vk",
  "rutube",
  "yandex-disk",
  "vimeo",
  // Added 2026-10-12 (T175): Odnoklassniki; its adapter is server/src/video/providers/ok.ts.
  "ok",
] as const;

const slugShape = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// /posts/<year>/ and /posts/<year>/page/<n>/ are list pages, so a slug of digits alone could take the place of one;
// "page" is kept free for the same family of addresses (CLAUDE.md: a post must never be named after a year).
const reservedSlugs = new Set(["page"]);
// A character that would end a line of YAML or hide in one: control characters and the two Unicode separators.
const control = new RegExp("[\u0000-\u001f\u007f  ]");
const dateShape =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})([+-])(\d{2}):(\d{2})$/;

function slugProblem(slug: unknown): string | undefined {
  if (typeof slug !== "string" || slug === "") return "required";
  if (slug.length > contentLimits.slug) return "too_long";
  if (!slugShape.test(slug)) return "format";
  if (/^\d+$/.test(slug) || reservedSlugs.has(slug)) return "reserved";
  return undefined;
}

function lineProblem(
  value: unknown,
  limit: number,
  required: boolean,
): string | undefined {
  if (typeof value !== "string") return "type";
  if (required && value.trim() === "") return "required";
  if (value.length > limit) return "too_long";
  if (control.test(value)) return "line_break";
  return undefined;
}

function dateProblem(value: unknown): string | undefined {
  if (typeof value !== "string") return "type";
  const match = dateShape.exec(value);
  if (match === null) return "format";
  const [year, month, day, hour, minute, second, , offsetHour, offsetMinute] =
    match.slice(1).map(Number) as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) return "format";
  if (
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 14 ||
    offsetMinute > 59
  ) {
    return "format";
  }
  return undefined;
}

/** A calendar day, `YYYY-MM-DD`, that exists. */
function dayProblem(value: unknown): string | undefined {
  if (typeof value !== "string") return "type";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return "format";
  const [year, month, day] = match.slice(1).map(Number) as [
    number,
    number,
    number,
  ];
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return month < 1 || month > 12 || day < 1 || day > daysInMonth
    ? "format"
    : undefined;
}

// `lowerCase`: the tags, which are stored lower-cased, so "Лоза" and "лоза" are the same tag.
function termsProblem(
  value: unknown,
  max: number,
  lowerCase: boolean,
): string | undefined {
  if (!Array.isArray(value)) return "type";
  if (value.length > max) return "too_many";
  for (const term of value) {
    const problem = lineProblem(term, contentLimits.term, true);
    if (problem !== undefined) return problem;
    if (term !== term.trim() || term.includes(",")) return "format";
  }
  const seen = new Set(
    value.map((t: string) => (lowerCase ? t.toLowerCase() : t)),
  );
  if (seen.size !== value.length) return "duplicate";
  return undefined;
}

// ---- the body gate ------------------------------------------------------------------------------------------------

type Finding = BodyProblem | "none";
type Gate = (markdown: string) => Promise<Finding>;
let gate: Gate | undefined;

// What a tree holds that the sanitizer looks at, counted from the nodes themselves.
function nodesOf(node: Nodes, type: Nodes["type"], out: Nodes[] = []): Nodes[] {
  if (node.type === type) out.push(node);
  if ("children" in node) {
    for (const child of node.children as Nodes[]) nodesOf(child, type, out);
  }
  return out;
}
const addressed = (node: Nodes): Nodes[] => [
  ...nodesOf(node, "link"),
  ...nodesOf(node, "image"),
  ...nodesOf(node, "definition"),
];

async function loadGate(): Promise<Gate> {
  const [
    { createMarkdownProcessor },
    { remarkNoRawHtml },
    { markdownOptions },
  ] = await Promise.all([
    import("@astrojs/markdown-remark"),
    import("../../../src/markdown/remark-no-raw-html.js"),
    import("../../../src/markdown/options.js"),
  ]);
  // A remark plugin that runs where the sanitizer would: it applies the sanitizer to a copy of the tree and writes what
  // changed into the document's frontmatter, which `render` returns (Astro's documented way for a plugin to hand
  // data out). Nothing is kept between calls: the finding travels with the file.
  const report = () => (tree: Root, file: VFile) => {
    const copy = structuredClone(tree);
    remarkNoRawHtml()(copy);
    let finding: Finding = "none";
    if (nodesOf(tree, "html").length > nodesOf(copy, "html").length) {
      finding = "html";
    } else if (addressed(tree).length !== addressed(copy).length) {
      // An autolink is written `<...>`; the Worker called a refused one raw HTML, and so does this.
      const kept = new Set(nodesOf(copy, "link").map((n) => (n as Link).url));
      const source = String(file.value);
      const autolinkRemoved = (nodesOf(tree, "link") as Link[]).some(
        (n) =>
          !kept.has(n.url) &&
          n.position?.start.offset !== undefined &&
          source[n.position.start.offset] === "<",
      );
      finding = autolinkRemoved ? "html" : "link";
    }
    const data = file.data as {
      astro?: { frontmatter?: Record<string, unknown> };
    };
    const astro = (data.astro ??= {});
    (astro.frontmatter ??= {})["contentGate"] = finding;
  };
  const processor = await createMarkdownProcessor({
    remarkPlugins: [report, ...markdownOptions.remarkPlugins],
    syntaxHighlight: false,
  });
  return async (markdown) => {
    const { metadata } = await processor.render(markdown);
    const value = metadata.frontmatter["contentGate"];
    return value === "html" || value === "link" ? value : "none";
  };
}

/**
 * What a text may not hold, or `undefined`: raw HTML outside code and math (`html`; also an autolink to a script,
 * written `<...>`), a link, an image or a reference whose address is a script scheme (`link`), a length over
 * `contentLimits.body` (`too_long`), a value that is not a string (`type`).
 */
export async function bodyProblem(
  body: unknown,
): Promise<BodyProblem | undefined> {
  if (typeof body !== "string") return "type";
  if (body.length > contentLimits.body) return "too_long";
  gate ??= await loadGate();
  const finding = await gate(body);
  return finding === "none" ? undefined : finding;
}

// ---- a save --------------------------------------------------------------------------------------------------------

type Options = {
  /** An update: only the keys present are checked, and `slug` is refused (an address never changes). */
  partial?: boolean;
};

function collect(): {
  problems: ContentProblem[];
  add: (field: string, code: string | undefined) => void;
} {
  const problems: ContentProblem[] = [];
  return {
    problems,
    add(field, code) {
      if (code !== undefined) problems.push({ field, code });
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The rules both kinds share, for the keys of `known` that are present (all of them on a creation).
async function sharedProblems(
  input: Record<string, unknown>,
  partial: boolean,
  add: (field: string, code: string | undefined) => void,
): Promise<void> {
  const has = (key: string) => !partial || Object.hasOwn(input, key);
  // On a creation a missing required key is `required`, not `type`.
  const need = (key: string, check: (value: unknown) => string | undefined) => {
    if (!has(key)) return undefined;
    return input[key] === undefined ? "required" : check(input[key]);
  };
  if (!partial) add("slug", slugProblem(input["slug"]));
  if (has("title"))
    add("title", lineProblem(input["title"], contentLimits.title, true));
  if (
    has("description") &&
    (!partial || Object.hasOwn(input, "description")) &&
    input["description"] !== undefined
  ) {
    add(
      "description",
      lineProblem(input["description"], contentLimits.description, false),
    );
  }
  add("publishedAt", need("publishedAt", dateProblem));
  if (input["tags"] !== undefined)
    add("tags", termsProblem(input["tags"], contentLimits.tags, true));
  if (input["categories"] !== undefined) {
    add(
      "categories",
      termsProblem(input["categories"], contentLimits.categories, false),
    );
  }
  if (input["audience"] !== undefined) {
    const audience = input["audience"];
    if (typeof audience !== "string") add("audience", "type");
    else if (!(audiences as readonly string[]).includes(audience))
      add("audience", "format");
  }
  if (input["statuses"] !== undefined) {
    const statuses = input["statuses"];
    if (!Array.isArray(statuses)) add("statuses", "type");
    else if (
      statuses.some(
        (s) =>
          typeof s !== "string" ||
          !(namedStatuses as readonly string[]).includes(s),
      )
    ) {
      add("statuses", "format");
    } else if (new Set(statuses).size !== statuses.length)
      add("statuses", "duplicate");
  }
  if (input["userIds"] !== undefined) {
    const userIds = input["userIds"];
    if (!Array.isArray(userIds)) add("userIds", "type");
    else if (userIds.length > contentLimits.userIds) add("userIds", "too_many");
    else if (userIds.some((id) => !Number.isInteger(id) || (id as number) < 1))
      add("userIds", "format");
    else if (new Set(userIds).size !== userIds.length)
      add("userIds", "duplicate");
  }
  if (input["teaser"] !== undefined && typeof input["teaser"] !== "boolean")
    add("teaser", "type");
  if (has("body")) {
    add(
      "body",
      input["body"] === undefined
        ? "required"
        : await bodyProblem(input["body"]),
    );
  }
}

/**
 * Every rule a save of a post breaks, in a fixed order; an empty list means it breaks none. `input` is the request's
 * JSON: `slug` (a creation only), `title`, `publishedAt` and `body` are required on a creation and the rest take
 * their defaults; with `partial` any subset is accepted. A key outside the known ones is `unknown`; anything that is
 * not an object is one `{field: "request", code: "type"}`.
 */
export async function postSaveProblems(
  input: unknown,
  { partial = false }: Options = {},
): Promise<ContentProblem[]> {
  if (!isRecord(input)) return [{ field: "request", code: "type" }];
  const { problems, add } = collect();
  const known = new Set<string>(
    partial ? ownedFields : ["slug", ...ownedFields],
  );
  for (const key of Object.keys(input))
    if (!known.has(key)) add(key, "unknown");
  await sharedProblems(input, partial, add);
  return problems;
}

/**
 * The same for a video. `current` is what the stored row says when `partial` (a paid lecture stays paid unless the
 * request says otherwise). A public video needs its link on creation: a file is the replacement of a link, never the
 * first source. The text of a paid lecture carries no YouTube or Yandex Disk address, its members-only block
 * included; a members-only block belongs in a paid lecture only.
 */
export async function videoSaveProblems(
  input: unknown,
  { partial = false, current }: Options & { current?: { paid: boolean } } = {},
): Promise<ContentProblem[]> {
  if (!isRecord(input)) return [{ field: "request", code: "type" }];
  const { problems, add } = collect();
  const known = new Set<string>([
    ...(partial ? [] : ["slug"]),
    ...ownedFields,
    ...videoFields,
  ]);
  for (const key of Object.keys(input))
    if (!known.has(key)) add(key, "unknown");
  await sharedProblems(input, partial, add);

  const paid =
    typeof input["paid"] === "boolean"
      ? input["paid"]
      : (current?.paid ?? false);
  if (input["paid"] !== undefined && typeof input["paid"] !== "boolean")
    add("paid", "type");
  if (
    input["availableUntil"] !== undefined &&
    input["availableUntil"] !== null
  ) {
    add("availableUntil", dayProblem(input["availableUntil"]));
  }
  const membersOnly = input["membersOnly"];
  if (membersOnly !== undefined && membersOnly !== null) {
    add("membersOnly", await bodyProblem(membersOnly));
    if (!paid && typeof membersOnly === "string" && membersOnly.trim() !== "") {
      add("membersOnly", "block_in_public");
    }
  }
  const source = input["source"];
  if (source !== undefined) {
    if (!isRecord(source)) add("source", "type");
    else {
      const provider = source["provider"];
      if (
        typeof provider !== "string" ||
        !(sourceProviders as readonly string[]).includes(provider)
      ) {
        add("source", "format");
      }
      const referenceProblem = lineProblem(
        source["reference"],
        contentLimits.reference,
        true,
      );
      add("source", referenceProblem);
      // Added 2026-10-12 (T175, the owner's order that every provider is guaranteed to play): what is pasted must be an
      // id or an address this provider's adapter understands, so a video that cannot play is refused at the save and
      // not found by the first visitor. The routes store the canonical form (`normalizeReference`).
      if (
        referenceProblem === undefined &&
        typeof provider === "string" &&
        typeof source["reference"] === "string" &&
        normalizeReference(provider, source["reference"]) === null &&
        (sourceProviders as readonly string[]).includes(provider)
      ) {
        add("source", "reference_shape");
      }
    }
  } else if (!partial && !paid) {
    add("source", "required");
  }
  if (paid) {
    for (const [field, text] of [
      ["description", input["description"]],
      ["body", input["body"]],
      ["membersOnly", membersOnly],
    ] as const) {
      if (typeof text !== "string") continue;
      if (youtubeAddress.test(text)) add(field, "youtube_in_paid");
      if (yandexDiskAddress.test(text)) add(field, "yandex_in_paid");
    }
  }
  return problems;
}

export { videoTextProblems } from "../../../src/content/video-guards.js";
