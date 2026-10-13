// The admin panel for posts, in the browser: src/pages/admin/posts/index.astro is the markup, and the club's own
// backend (server/src/content/admin-routes.ts, mounted at /api/admin) is what it asks. Added 2026-10-02; the design is
// the consilium verdict .specify/consilium/2026-10-02-admin-posts.md, and ADMIN.md is the how-to.
//
// Rewritten 2026-10-12 (T099 of specs/001-self-hosted-club-site): the page used to load Clerk and ask a content
// service that committed to GitHub, then wait minutes for a rebuild. It now sends the cookie the browser already holds
// to the site's own API, through the helper the account pages use (auth-forms.ts), and a saved post is on the site at
// once (the server renders it at save time). What went with the old code: the provider load, the token hints, the
// publication wait and the page-by-page fetch that checked it, the `sha`, the address-list guessing for free slugs.
//
// Steps:
// 1. Ask for the list (a page at a time, with a search and a switch for the deleted ones). The page itself answers 404
//    to anyone who is neither metr nor admin (the frontmatter of the page), and so does the API; a 404 here therefore
//    means the session ended while the page was open, and the script says so instead of navigating (the redirect loop
//    the users page once had).
// 2. Open the form to add a post or to edit one. A save is a POST (new) or a PATCH with `If-Match: <updatedAt>` (edit):
//    a 409 `stale` means somebody saved the post after it was opened, nothing is written, and the editor keeps their
//    text in the form. A 409 `exists` means the address is taken; the next free one is proposed.
// 3. The audience form: everyone, signed-in members, or the chosen statuses and named people; a draft is the audience
//    `hidden` on the server and its own checkbox here, as it was. The preview is the server's render of the text.
// Changed 2026-10-12 (T099, found by check:admin-posts failing now and then): dates the page proposes come from the
// server's clock (serverNow), not the browser's.
import { sendJson, serverNow, type ApiAnswer } from "./auth-forms";
import { site } from "../config";
// From post-url.ts, not posts.ts: posts.ts would bring astro:content and every post into the
// browser (post-url.ts says what that cost on the first build).
import { postUrl } from "../lib/post-url";
import { formatDateTime } from "../lib/date";
// Added later on 2026-10-02 at the owner's request: 20 posts to a page (AdminPager.astro).
import { bindPager, pageCount } from "./admin-pager";
// Added 2026-10-12 with the two interface languages (src/i18n/lang.ts): every message of the panel
// in both languages, from src/i18n/admin.ts, written with setPhrase() and setLangAttr() so that a
// language switch shows them in the new language at once - the page does not reload, because the
// form may hold unsaved text. A confirm() dialog takes plain text, so it gets the language shown.
// What goes into a post (the " (копия)" mark of a copy's title) stays Russian: it is content.
import { adminUi } from "../i18n/admin";
// Added 2026-10-12 (T179): the text of an API error code, in both languages.
import { refusalOf } from "../i18n/errors";
import { format, type Phrase, type Words } from "../i18n/lang";
import { phrase, setPhrase } from "./lang";

type Listed = {
  id: number;
  slug: string;
  title: string;
  publishedAt: string;
  updatedAt: string;
  audience: string;
  deleted: boolean;
};
type Fields = {
  title: string;
  description: string;
  publishedAt: string;
  tags: string[];
  categories: string[];
  audience: string;
  statuses: string[];
  userIds: number[];
  teaser: boolean;
  body: string;
};
type Full = Listed & Fields;
type Problem = { field: string; code: string };
type Opened = { id: number; updatedAt: string; slug: string } | undefined;

// An element of the page by id, or null when it is missing or of another kind.
function byId<T extends HTMLElement>(id: string, kind: new () => T): T | null {
  const element = document.getElementById(id);
  return element instanceof kind ? element : null;
}
const status = byId("admin-status", HTMLParagraphElement);
const listBox = byId("admin-list", HTMLDivElement);
const list = byId("admin-posts", HTMLUListElement);
const count = byId("admin-count", HTMLParagraphElement);
const rowTemplate = byId("admin-post-row", HTMLTemplateElement);
const termTemplate = byId("admin-term", HTMLTemplateElement);
const searchForm = byId("admin-search", HTMLFormElement);
const queryInput = byId("admin-query", HTMLInputElement);
const deletedBox = byId("admin-deleted", HTMLInputElement);
const form = byId("admin-editor", HTMLFormElement);
const heading = byId("admin-editor-heading", HTMLHeadingElement);
const formError = byId("admin-form-error", HTMLParagraphElement);
const newButton = byId("admin-new", HTMLButtonElement);
const cancelButton = byId("admin-cancel", HTMLButtonElement);
const previewButton = byId("admin-preview-button", HTMLButtonElement);
const previewBox = byId("admin-preview-box", HTMLDivElement);
const preview = byId("admin-preview", HTMLDivElement);
const restricted = byId("admin-restricted", HTMLFieldSetElement);
const userFind = byId("admin-user-find", HTMLButtonElement);
const userQuery = byId("admin-user-query", HTMLInputElement);
const userResults = byId("admin-user-results", HTMLUListElement);
const input = {
  title: byId("admin-title", HTMLInputElement),
  slug: byId("admin-slug", HTMLInputElement),
  date: byId("admin-date", HTMLInputElement),
  description: byId("admin-description", HTMLInputElement),
  tags: byId("admin-tags", HTMLInputElement),
  categories: byId("admin-categories", HTMLInputElement),
  audience: byId("admin-audience", HTMLSelectElement),
  userIds: byId("admin-user-ids", HTMLInputElement),
  teaser: byId("admin-teaser", HTMLInputElement),
  draft: byId("admin-draft", HTMLInputElement),
  body: byId("admin-body", HTMLTextAreaElement),
};

// What the server's problem codes mean, in the site's language (rules.ts has the codes).
const problemText: Record<string, Phrase> = {
  required: adminUi.problem_required,
  too_long: adminUi.problem_too_long,
  too_many: adminUi.problem_too_many,
  format: adminUi.problem_format,
  reserved: adminUi.problem_reserved,
  line_break: adminUi.problem_line_break,
  duplicate: adminUi.problem_duplicate,
  html: adminUi.problem_html,
  link: adminUi.problem_link,
  type: adminUi.problem_type,
  unknown: adminUi.problem_unknown,
};
// A field of the server's request is a different name from the form's: only the date differs.
const formField = (field: string): string =>
  field === "publishedAt" ? "date" : field;

let opened: Opened;
let busy = false;
let page = 1;
let query = "";
let total = 0;
const size = site.admin.pageSize;

function say(text: Words, isError = false): void {
  if (status === null) return;
  setPhrase(status, text);
  status.classList.toggle("text-red-600", isError);
}

// The offset the posts write their dates in: the club's time, +03:00 (src/lib/date.ts).
const clubOffset = formatDateTime(new Date()).slice(19);

// A post's date for the form's datetime-local field, in the club's time.
function toLocalInput(date: string): string {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime())
    ? ""
    : formatDateTime(parsed).slice(0, 19);
}

function fromLocalInput(value: string): string {
  const full = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
    ? `${value}:00`
    : value;
  return `${full}${clubOffset}`;
}

function terms(value: string, lower: boolean): string[] {
  const all = value
    .split(",")
    .map((t) => (lower ? t.trim().toLowerCase() : t.trim()))
    .filter((t) => t !== "");
  return [...new Set(all)];
}

// Whole numbers only; a piece that is not one is left in so that the server's `format` problem names the field.
function numbers(value: string): number[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t !== "")
        .map(Number),
    ),
  ];
}

function setBusy(value: boolean): void {
  busy = value;
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "#admin-list button, #admin-editor button",
  )) {
    button.disabled = value;
  }
}

// What the page says about one entry of the list.
function stateOf(post: Listed): Phrase {
  if (post.deleted) return adminUi.state_deleted;
  if (post.audience === "hidden") return adminUi.state_draft;
  if (new Date(post.publishedAt).getTime() > serverNow()) {
    return adminUi.state_scheduled;
  }
  if (post.audience === "members") return adminUi.state_members;
  if (post.audience === "restricted") return adminUi.state_restricted;
  return adminUi.state_live;
}

// The options hold plain text and so cannot carry a span per language: written here, and again on a switch.
function fillAudience(): void {
  const select = input.audience;
  if (select === null) return;
  const chosen = select.value || "everyone";
  select.replaceChildren(
    ...(
      [
        ["everyone", adminUi.audience_everyone],
        ["members", adminUi.audience_members],
        ["restricted", adminUi.audience_restricted],
      ] as const
    ).map(([value, words]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = phrase(words);
      return option;
    }),
  );
  select.value = chosen;
}
fillAudience();
document.addEventListener(site.i18n.changeEvent, fillAudience);

function showRestricted(): void {
  if (restricted !== null) {
    // Changed 2026-10-12: greyed and disabled instead of hidden, so an editor sees where the chosen are chosen.
    const on = input.audience?.value === "restricted";
    restricted.disabled = !on;
    restricted.classList.toggle("opacity-50", !on);
  }
}
input.audience?.addEventListener("change", showRestricted);

// The sentence for an answer the page has no reason of its own for: the text of its `error` code.
function failure(answer: ApiAnswer): Phrase {
  const reason = answer.body["reason"];
  if (answer.status === 409 && reason === "stale") return adminUi.post_conflict;
  if (answer.status === 409 && reason === "exists") return adminUi.post_exists;
  if (answer.status === 404) return adminUi.post_not_found;
  if (answer.status === 413) return adminUi.post_too_large;
  if (answer.status === 0) return adminUi.posts_unavailable;
  return refusalOf(answer.body["error"]);
}

// The page of the list on show, with the search and the switch applied; replaces the list.
const drawPager = bindPager("admin-pager", (target) => {
  void load(target).then(() => listBox?.scrollIntoView({ block: "start" }));
});

async function load(target = page): Promise<void> {
  page = Math.max(1, target);
  const params = new URLSearchParams({
    page: String(page),
    limit: String(size),
  });
  if (query !== "") params.set("q", query);
  if (deletedBox?.checked === true) params.set("deleted", "1");
  const answer = await sendJson("GET", `/api/admin/posts?${params}`);
  if (answer.status === 404) {
    if (listBox !== null) listBox.hidden = true;
    say(adminUi.posts_session_ended, true);
    return;
  }
  if (answer.status !== 200) {
    console.error("Admin: the posts list answered", answer.status);
    say(adminUi.posts_unavailable, true);
    return;
  }
  const data = answer.body as unknown as { items: Listed[]; total: number };
  total = data.total;
  // A page past the end (posts removed since, or a stale number) falls back to the last one.
  const last = pageCount(data.total);
  if (data.items.length === 0 && page > last) {
    await load(last);
    return;
  }
  render(data.items, last);
  if (listBox !== null) listBox.hidden = false;
  say("");
}

function render(items: Listed[], last: number): void {
  if (list === null || rowTemplate === null) return;
  list.replaceChildren();
  for (const post of items) {
    const row = rowTemplate.content.firstElementChild?.cloneNode(true);
    if (!(row instanceof HTMLLIElement)) continue;
    const link = row.querySelector<HTMLAnchorElement>("[data-title]");
    if (link !== null) {
      link.textContent = post.title || post.slug;
      link.href = postUrl(post);
    }
    const set = (selector: string, text: string) => {
      const element = row.querySelector(selector);
      if (element !== null) element.textContent = text;
    };
    set(
      "[data-date]",
      toLocalInput(post.publishedAt).replace("T", " ").slice(0, 16),
    );
    const state = row.querySelector("[data-state]");
    if (state !== null) setPhrase(state, stateOf(post));
    set("[data-slug]", post.slug);
    const button = (selector: string) =>
      row.querySelector<HTMLButtonElement>(selector);
    // A deleted post offers only its restoration: it is not on the site, and an edit of it would be a surprise.
    for (const selector of ["[data-edit]", "[data-copy]", "[data-delete]"]) {
      const element = button(selector);
      if (element !== null) element.hidden = post.deleted;
    }
    const restore = button("[data-restore]");
    if (restore !== null) restore.hidden = !post.deleted;
    button("[data-edit]")?.addEventListener(
      "click",
      () => void openPost(post, "edit"),
    );
    button("[data-copy]")?.addEventListener(
      "click",
      () => void openPost(post, "copy"),
    );
    button("[data-delete]")?.addEventListener("click", () => void remove(post));
    restore?.addEventListener("click", () => void restorePost(post));
    list.append(row);
  }
  if (count !== null) {
    setPhrase(
      count,
      total === 0
        ? adminUi.posts_none
        : format(adminUi.posts_shown, {
            from: (page - 1) * size + 1,
            to: (page - 1) * size + items.length,
            total,
          }),
    );
  }
  drawPager?.(page, last);
}

// The tags and categories the site already uses, most used first, as buttons under their fields: a click adds one,
// so that a new post joins the existing tags instead of starting a near-duplicate. One request at start; a failure
// leaves the buttons out, the form works without them.
async function suggest(): Promise<void> {
  const answer = await sendJson("GET", "/api/terms");
  const found = answer.body["terms"];
  if (answer.status !== 200 || !Array.isArray(found)) return;
  const all = found as { kind: string; name: string; count: number }[];
  const fill = (inputId: string, kind: string) => {
    const box = document.querySelector(`[data-terms-for="${inputId}"]`);
    const target = byId(inputId, HTMLInputElement);
    if (box === null || target === null || termTemplate === null) return;
    box.replaceChildren();
    for (const term of all
      .filter((t) => t.kind === kind)
      .sort((a, b) => b.count - a.count)) {
      const chip = termTemplate.content.firstElementChild?.cloneNode(true);
      if (!(chip instanceof HTMLButtonElement)) continue;
      chip.textContent = term.name;
      chip.addEventListener("click", () => {
        const current = terms(target.value, false);
        if (!current.includes(term.name)) {
          target.value = [...current, term.name].join(", ");
        }
      });
      box.append(chip);
    }
  };
  fill("admin-tags", "tag");
  fill("admin-categories", "category");
}

function clearErrors(): void {
  for (const element of document.querySelectorAll<HTMLElement>(
    "[data-error-for]",
  )) {
    element.hidden = true;
  }
  if (formError !== null) formError.hidden = true;
}

function showError(field: string | null, text: Phrase): void {
  const target =
    field === null
      ? null
      : document.querySelector<HTMLElement>(`[data-error-for="${field}"]`);
  const place = target ?? formError;
  if (place === null) return;
  setPhrase(place, text);
  place.hidden = false;
}

type Shown = Fields & { slug?: string };

function showForm(title: Words, values: Shown, existing: boolean): void {
  if (form === null || heading === null) return;
  clearErrors();
  setPhrase(heading, title);
  if (input.title) input.title.value = values.title;
  if (input.slug) {
    input.slug.value = values.slug ?? "";
    // An address never changes after the entry exists (its comments and links hang on it).
    input.slug.readOnly = existing;
  }
  if (input.date) input.date.value = toLocalInput(values.publishedAt);
  if (input.description) input.description.value = values.description;
  if (input.tags) input.tags.value = values.tags.join(", ");
  if (input.categories) input.categories.value = values.categories.join(", ");
  const hidden = values.audience === "hidden";
  if (input.draft) input.draft.checked = hidden;
  if (input.audience) {
    input.audience.value = hidden ? "everyone" : values.audience;
  }
  for (const box of document.querySelectorAll<HTMLInputElement>(
    'input[name="statuses"]',
  )) {
    box.checked = values.statuses.includes(box.value);
  }
  if (input.userIds) input.userIds.value = values.userIds.join(", ");
  if (input.teaser) input.teaser.checked = values.teaser;
  if (input.body) input.body.value = values.body;
  if (userResults !== null) userResults.replaceChildren();
  if (previewBox !== null) previewBox.hidden = true;
  showRestricted();
  if (listBox !== null) listBox.hidden = true;
  form.hidden = false;
  input.title?.focus();
}

function closeForm(): void {
  if (form !== null) form.hidden = true;
  if (listBox !== null) listBox.hidden = false;
  opened = undefined;
}

// The form's fields as the request carries them. A draft is the audience `hidden`; the statuses and the people matter
// only for `restricted` and are sent empty otherwise, so a changed audience leaves no stale names behind.
function fieldsOfForm(): Fields {
  const audience = input.draft?.checked
    ? "hidden"
    : (input.audience?.value ?? "everyone");
  const named = audience !== "hidden" && input.audience?.value === "restricted";
  return {
    title: input.title?.value.trim() ?? "",
    description: input.description?.value.trim() ?? "",
    publishedAt: fromLocalInput(input.date?.value ?? ""),
    tags: terms(input.tags?.value ?? "", true),
    categories: terms(input.categories?.value ?? "", false),
    audience,
    statuses: named
      ? [
          ...document.querySelectorAll<HTMLInputElement>(
            'input[name="statuses"]:checked',
          ),
        ].map((box) => box.value)
      : [],
    userIds: named ? numbers(input.userIds?.value ?? "") : [],
    teaser: input.teaser?.checked ?? false,
    body: input.body?.value ?? "",
  };
}

// Opens a post in the form, to edit it or as the base of a new one (the copy). The copy keeps every field and the text
// of the original except two (added 2026-10-02 at the owner's request, "a copy button: Markdown is not for everyone"):
// - the address, which must be unique (two posts cannot share /posts/<slug>/ and the comments thread hangs on the
//   address too): the form proposes "<slug>-copy", and a taken one is answered by the server with 409 `exists`, which
//   proposes "-copy-2", "-copy-3" (nextFreeSlug);
// - the date, which is now: a copy is a new post, and the original's date would file it among the old ones.
// The title is marked as well, within 200 characters: two equal titles in the list would invite editing or deleting
// the wrong post. Nothing is saved until the editor presses save.
async function openPost(post: Listed, how: "edit" | "copy"): Promise<void> {
  if (busy) return;
  setBusy(true);
  say(adminUi.post_loading);
  try {
    const answer = await sendJson("GET", `/api/admin/posts/${post.id}`);
    const full = answer.body["post"] as Full | undefined;
    if (answer.status !== 200 || full === undefined) {
      say(failure(answer), true);
      return;
    }
    say("");
    if (how === "edit") {
      opened = { id: full.id, updatedAt: full.updatedAt, slug: full.slug };
      showForm(adminUi.form_edit, full, true);
      return;
    }
    opened = undefined;
    const suffix = " (копия)";
    showForm(
      format(adminUi.form_copy, { title: full.title || full.slug }),
      {
        ...full,
        title: full.title.slice(0, 200 - suffix.length) + suffix,
        publishedAt: new Date(serverNow()).toISOString(),
        slug: nextFreeSlug(full.slug),
      },
      false,
    );
  } finally {
    setBusy(false);
  }
}

// The address to propose next. For a copy: "<slug>" gives "<slug>-copy", and a "-copy" or "-copy-N" gives the next number.
// For a new post whose address is taken: "<slug>" gives "<slug>-2", and "<slug>-N" gives "<slug>-N+1". All cut to the
// server's 80 characters.
function nextFreeSlug(slug: string, copy = true): string {
  const m = copy
    ? /^(.+?)-copy(?:-(\d+))?$/.exec(slug)
    : /^(.+?)-(\d+)$/.exec(slug);
  const base = m?.[1] ?? slug;
  const n = m === null ? (copy ? 1 : 2) : Number(m[2] ?? 1) + 1;
  const suffix = copy ? (n === 1 ? "-copy" : `-copy-${n}`) : `-${n}`;
  return base.slice(0, 80 - suffix.length).replace(/-+$/, "") + suffix;
}

async function save(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  if (busy) return;
  clearErrors();
  const fields = fieldsOfForm();
  const editing = opened;
  const slug = editing?.slug ?? input.slug?.value.trim() ?? "";
  setBusy(true);
  say(adminUi.saving);
  try {
    const answer =
      editing === undefined
        ? await sendJson("POST", "/api/admin/posts", { slug, ...fields })
        : await sendJson("PATCH", `/api/admin/posts/${editing.id}`, fields, {
            "If-Match": editing.updatedAt,
          });
    if (answer.status === 400) {
      const problems = answer.body["problems"];
      for (const problem of Array.isArray(problems)
        ? (problems as Problem[])
        : []) {
        showError(
          formField(problem.field),
          problemText[problem.code] ?? adminUi.problem_type,
        );
      }
      say(adminUi.fix_marked, true);
      return;
    }
    // A new post whose address was taken after the form opened (by another editor, or a copy saved twice) is never
    // written over - the server refuses it - and the next free address is put into the field, for the editor to check
    // and save again.
    if (
      answer.status === 409 &&
      answer.body["reason"] === "exists" &&
      editing === undefined
    ) {
      const next = nextFreeSlug(slug, /-copy(?:-\d+)?$/.test(slug));
      if (input.slug) input.slug.value = next;
      const text = format(adminUi.slug_taken, { slug, next });
      showError("slug", text);
      say(text, true);
      return;
    }
    if (answer.status !== 200 && answer.status !== 201) {
      const text = failure(answer);
      showError(null, text);
      say(text, true);
      return;
    }
    closeForm();
    await load();
    const future = new Date(fields.publishedAt).getTime() > serverNow();
    say(
      fields.audience === "hidden"
        ? adminUi.saved_draft
        : future
          ? adminUi.saved_future
          : fields.audience === "everyone"
            ? adminUi.saved_live
            : adminUi.saved_hidden_to_some,
    );
  } finally {
    setBusy(false);
  }
}

async function remove(post: Listed): Promise<void> {
  if (busy) return;
  // The language shown, because a dialog holds plain text (the note at the top).
  const ok = confirm(
    phrase(format(adminUi.confirm_delete, { title: post.title || post.slug })),
  );
  if (!ok) return;
  setBusy(true);
  say(adminUi.deleting);
  try {
    const answer = await sendJson("DELETE", `/api/admin/posts/${post.id}`);
    if (answer.status !== 200) {
      say(failure(answer), true);
      return;
    }
    await load();
    say(adminUi.deleted);
  } finally {
    setBusy(false);
  }
}

async function restorePost(post: Listed): Promise<void> {
  if (busy) return;
  setBusy(true);
  say(adminUi.restoring);
  try {
    const answer = await sendJson(
      "POST",
      `/api/admin/posts/${post.id}/restore`,
      {},
    );
    if (answer.status !== 200) {
      say(failure(answer), true);
      return;
    }
    await load();
    say(adminUi.restored);
  } finally {
    setBusy(false);
  }
}

// The preview is the server's render of the text, through the same pipeline and the same sanitizer as a save
// (POST /api/admin/preview), so what is shown is what the site will show. The HTML that comes back is that sanitized
// render, which the site itself puts on its pages.
async function showPreview(): Promise<void> {
  if (busy || preview === null || previewBox === null) return;
  setBusy(true);
  try {
    const answer = await sendJson("POST", "/api/admin/preview", {
      markdown: input.body?.value ?? "",
    });
    const html = answer.body["html"];
    if (answer.status !== 200 || typeof html !== "string") {
      showError(
        "body",
        answer.status === 413 ? adminUi.post_too_large : adminUi.preview_failed,
      );
      return;
    }
    preview.innerHTML = html;
    previewBox.hidden = false;
    previewBox.scrollIntoView({ block: "nearest" });
  } finally {
    setBusy(false);
  }
}

// Finds a person by name or address, so that a post can be opened to named people without anyone reading account
// numbers out of a table; a click puts the number into the field. The list is the users route's, which only a metr or
// an admin may ask - the same people who see this page.
async function findPeople(): Promise<void> {
  if (userResults === null || input.userIds === null) return;
  const q = userQuery?.value.trim() ?? "";
  if (q === "") return;
  const answer = await sendJson(
    "GET",
    `/api/admin/users?${new URLSearchParams({ q, limit: "5" })}`,
  );
  userResults.replaceChildren();
  const users = answer.body["users"];
  if (answer.status !== 200 || !Array.isArray(users) || users.length === 0) {
    const none = document.createElement("li");
    setPhrase(none, adminUi.user_none);
    userResults.append(none);
    return;
  }
  for (const user of users as {
    id: number;
    displayName: string;
    email: string;
  }[]) {
    const item = document.createElement("li");
    item.className = "flex flex-wrap items-center gap-2";
    const name = document.createElement("span");
    name.textContent = `${user.displayName || phrase(adminUi.no_name)} <${user.email}> #${user.id}`;
    const add = document.createElement("button");
    add.type = "button";
    add.className =
      "rounded border border-gray-300 px-2 py-0.5 text-xs hover:opacity-80 dark:border-slate-600";
    setPhrase(add, adminUi.user_pick);
    add.addEventListener("click", () => {
      const current = numbers(input.userIds?.value ?? "");
      if (!current.includes(user.id) && input.userIds !== null) {
        input.userIds.value = [...current, user.id].join(", ");
      }
    });
    item.append(name, add);
    userResults.append(item);
  }
}

newButton?.addEventListener("click", () => {
  if (busy) return;
  opened = undefined;
  showForm(
    adminUi.posts_new,
    {
      title: "",
      description: "",
      publishedAt: new Date(serverNow()).toISOString(),
      tags: [],
      categories: [],
      audience: "everyone",
      statuses: [],
      userIds: [],
      teaser: false,
      body: "",
    },
    false,
  );
});
cancelButton?.addEventListener("click", () => {
  closeForm();
  say("");
});
form?.addEventListener("submit", (event) => void save(event));
previewButton?.addEventListener("click", () => void showPreview());
userFind?.addEventListener("click", () => void findPeople());
userQuery?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    void findPeople();
  }
});
searchForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  query = queryInput?.value.trim() ?? "";
  void load(1);
});
deletedBox?.addEventListener("change", () => void load(1));

// Start.
await load(1);
void suggest();
