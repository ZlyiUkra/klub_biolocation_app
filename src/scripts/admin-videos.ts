// The admin panel for videos, in the browser: src/pages/admin/videos/index.astro is the markup, and the club's own
// backend (server/src/content/admin-routes.ts, mounted at /api/admin) is what it asks. Added 2026-10-12 (T175 of
// specs/001-self-hosted-club-site) at the owner's request: a video is worked out like a post (admin-posts.ts is the
// pattern, and its header says how a save, a conflict and a taken address behave; they are the same here).
//
// What is different from a post:
// - A free video needs its link at creation; a paid lecture may have none yet. At creation the form sends `source`
//   with the post-like fields; a file is never the first source (the server's rule).
// - The source of a saved video is managed by two buttons of its own that act at once and do not touch the text:
//   "set the link" (PUT .../source) and "upload the file" (PUT .../file, with a progress bar). Replacing a link by a
//   file or a file by a link is asked for in a dialog first, because the old link row is deleted (a paid link is not
//   recoverable) and the old file stops being used. The old bytes stay on the server's disk.
// - A paid lecture's link was write-only; since 2026-10-12 (the owner's order) it is shown in the field to the editor,
//   who cannot change what he cannot see. The older lines of this note that say "never shown" are superseded.
// - Before an upload the page asks the server how much room there is (GET /api/admin/videos/space) and refuses a file
//   that would not fit, with the reason; the server decides again from Content-Length, so this is a courtesy, not a
//   lock. An upload uses XMLHttpRequest because fetch has no upload progress.
// - The members-only block belongs in a paid lecture only; its field is shown when "paid" is ticked.
import { sendJson, serverNow, type ApiAnswer } from "./auth-forms";
import { site } from "../config";
// From video-url.ts, not video.ts: video.ts would bring astro:content into the browser (post-url.ts says what that
// cost for posts).
import { videoUrl } from "../lib/video-url";
import { formatDateTime } from "../lib/date";
import { bindPager, pageCount } from "./admin-pager";
import { adminUi } from "../i18n/admin";
import { refusalOf } from "../i18n/errors";
import { format, type Phrase, type Words } from "../i18n/lang";
import { phrase, setLangAttr, setPhrase } from "./lang";

type Listed = {
  id: number;
  slug: string;
  title: string;
  publishedAt: string;
  updatedAt: string;
  audience: string;
  deleted: boolean;
  paid?: boolean;
  // Added 2026-10-12 (T175): where the video lives, as the list answers it (no reference, ever).
  source?:
    { kind: "none" } | { kind: "file" } | { kind: "link"; provider: string };
};
type Source =
  | { kind: "none" }
  | { kind: "file"; sizeBytes: number }
  | { kind: "link"; provider: string; referenceSet: true; reference?: string };
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
  paid: boolean;
  availableUntil: string | null;
  membersOnly: string | null;
};
type Full = Listed & Fields & { source: Source };
type Problem = { field: string; code: string };
type Opened =
  { id: number; updatedAt: string; slug: string; paid: boolean } | undefined;
type Space = {
  freeBytes: number;
  totalBytes: number;
  reserveBytes: number;
  capBytes: number;
  roomBytes: number;
};

function byId<T extends HTMLElement>(id: string, kind: new () => T): T | null {
  const element = document.getElementById(id);
  return element instanceof kind ? element : null;
}
const status = byId("admin-status", HTMLParagraphElement);
const listBox = byId("admin-list", HTMLDivElement);
const list = byId("admin-videos", HTMLUListElement);
const count = byId("admin-count", HTMLParagraphElement);
const rowTemplate = byId("admin-video-row", HTMLTemplateElement);
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
const membersBox = byId("admin-members-box", HTMLDivElement);
const userFind = byId("admin-user-find", HTMLButtonElement);
const userQuery = byId("admin-user-query", HTMLInputElement);
const userResults = byId("admin-user-results", HTMLUListElement);
const sourceState = byId("admin-source-state", HTMLParagraphElement);
const secretNote = byId("admin-secret-note", HTMLParagraphElement);
const afterSave = byId("admin-after-save", HTMLParagraphElement);
const setLinkButton = byId("admin-set-link", HTMLButtonElement);
const fileBox = byId("admin-file-box", HTMLDivElement);
const spaceLine = byId("admin-space", HTMLParagraphElement);
const fileInput = byId("admin-file", HTMLInputElement);
const uploadButton = byId("admin-upload", HTMLButtonElement);
const progress = byId("admin-progress", HTMLProgressElement);
const uploadStatus = byId("admin-upload-status", HTMLParagraphElement);
const input = {
  title: byId("admin-title", HTMLInputElement),
  slug: byId("admin-slug", HTMLInputElement),
  date: byId("admin-date", HTMLInputElement),
  description: byId("admin-description", HTMLInputElement),
  tags: byId("admin-tags", HTMLInputElement),
  categories: byId("admin-categories", HTMLInputElement),
  paid: byId("admin-paid", HTMLInputElement),
  until: byId("admin-available-until", HTMLInputElement),
  audience: byId("admin-audience", HTMLSelectElement),
  userIds: byId("admin-user-ids", HTMLInputElement),
  teaser: byId("admin-teaser", HTMLInputElement),
  draft: byId("admin-draft", HTMLInputElement),
  body: byId("admin-body", HTMLTextAreaElement),
  membersOnly: byId("admin-members-only", HTMLTextAreaElement),
  provider: byId("admin-provider", HTMLSelectElement),
  reference: byId("admin-reference", HTMLInputElement),
};

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
  reference_shape: adminUi.problem_reference_shape,
  youtube_in_paid: adminUi.problem_youtube_in_paid,
  yandex_in_paid: adminUi.problem_yandex_in_paid,
  block_in_public: adminUi.problem_block_in_public,
};
const formField = (field: string): string =>
  field === "publishedAt" ? "date" : field;

// The providers the server accepts (rules.ts, sourceProviders), with the names the editor sees.
const providers: [string, Phrase][] = [
  ["youtube", adminUi.provider_youtube],
  ["vk", adminUi.provider_vk],
  ["rutube", adminUi.provider_rutube],
  ["yandex-disk", adminUi.provider_yandex_disk],
  ["vimeo", adminUi.provider_vimeo],
  // Added 2026-10-12 (T175): Odnoklassniki.
  ["ok", adminUi.provider_ok],
];
// Added 2026-10-12 (T175): the example in the field and the line "where to get it", per host (the field and the hint
// follow the chosen host, see showReferenceHelp).
const referenceHelp: Record<string, { example: Phrase; help: Phrase }> = {
  youtube: { example: adminUi.ph_ref_youtube, help: adminUi.help_youtube },
  vk: { example: adminUi.ph_ref_vk, help: adminUi.help_vk },
  rutube: { example: adminUi.ph_ref_rutube, help: adminUi.help_rutube },
  vimeo: { example: adminUi.ph_ref_vimeo, help: adminUi.help_vimeo },
  ok: { example: adminUi.ph_ref_ok, help: adminUi.help_ok },
  "yandex-disk": {
    example: adminUi.ph_ref_yandex_disk,
    help: adminUi.help_yandex_disk,
  },
};
const providerName = (id: string): Phrase =>
  providers.find(([value]) => value === id)?.[1] ?? { ru: id, en: id };

let opened: Opened;
let current: Source = { kind: "none" };
let busy = false;
let page = 1;
let query = "";
let total = 0;
let room: Space | undefined;
const size = site.admin.pageSize;

function say(text: Words, isError = false): void {
  if (status === null) return;
  setPhrase(status, text);
  status.classList.toggle("text-red-600", isError);
}

const clubOffset = formatDateTime(new Date()).slice(19);

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

// "No limit" is stored as a date a hundred years ahead (the database's default), which the form shows as empty.
function untilForForm(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const year = Number(value.slice(0, 4));
  return year - new Date().getFullYear() > 50 ? "" : value;
}

// A size for people: MB below a gigabyte, GB above.
function sizeText(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb < 1024 ? `${mb.toFixed(1)} MB` : `${(mb / 1024).toFixed(1)} GB`;
}

function setBusy(value: boolean): void {
  busy = value;
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "#admin-list button, #admin-editor button",
  )) {
    button.disabled = value;
  }
}

function stateOf(video: Listed): Phrase {
  if (video.deleted) return adminUi.state_deleted;
  if (video.audience === "hidden") return adminUi.state_draft;
  if (new Date(video.publishedAt).getTime() > serverNow()) {
    return adminUi.state_scheduled;
  }
  if (video.paid === true) return adminUi.state_paid;
  if (video.audience === "members") return adminUi.state_members;
  if (video.audience === "restricted") return adminUi.state_restricted;
  return adminUi.state_live;
}

// The plain-text parts that cannot hold a span: the options of the two lists, written here and again on a switch.
function fillOptions(): void {
  const audience = input.audience;
  if (audience !== null) {
    const chosen = audience.value || "everyone";
    audience.replaceChildren(
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
    audience.value = chosen;
  }
  const provider = input.provider;
  if (provider !== null) {
    const chosen = provider.value || "youtube";
    provider.replaceChildren(
      ...providers.map(([value, words]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = phrase(words);
        return option;
      }),
    );
    provider.value = chosen;
  }
}
// The example in the reference field and the hint under it follow the chosen host.
const referenceHint = byId("admin-reference-help", HTMLParagraphElement);
function showReferenceHelp(): void {
  const chosen = referenceHelp[input.provider?.value ?? "youtube"];
  if (chosen === undefined) return;
  if (input.reference) {
    setLangAttr(input.reference, "placeholder", chosen.example);
  }
  if (referenceHint !== null) setPhrase(referenceHint, chosen.help);
}
input.provider?.addEventListener("change", showReferenceHelp);
fillOptions();
showReferenceHelp();
document.addEventListener(site.i18n.changeEvent, fillOptions);

function showRestricted(): void {
  if (restricted === null) return;
  const on = input.audience?.value === "restricted";
  restricted.disabled = !on;
  restricted.classList.toggle("opacity-50", !on);
}
input.audience?.addEventListener("change", showRestricted);

// The members-only block belongs to a paid lecture; the note about the write-only link too.
function showPaid(): void {
  const paid = input.paid?.checked === true;
  if (membersBox !== null) membersBox.hidden = !paid;
  if (secretNote !== null) secretNote.hidden = !paid;
}
input.paid?.addEventListener("change", showPaid);

function failure(answer: ApiAnswer): Phrase {
  const reason = answer.body["reason"];
  if (answer.status === 409 && reason === "stale") return adminUi.post_conflict;
  if (answer.status === 409 && reason === "exists") return adminUi.post_exists;
  if (answer.status === 404) return adminUi.post_not_found;
  if (answer.status === 413) return adminUi.post_too_large;
  if (answer.status === 0) return adminUi.posts_unavailable;
  return refusalOf(answer.body["error"]);
}

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
  const answer = await sendJson("GET", `/api/admin/videos?${params}`);
  if (answer.status === 404) {
    if (listBox !== null) listBox.hidden = true;
    say(adminUi.posts_session_ended, true);
    return;
  }
  if (answer.status !== 200) {
    console.error("Admin: the videos list answered", answer.status);
    say(adminUi.posts_unavailable, true);
    return;
  }
  const data = answer.body as unknown as { items: Listed[]; total: number };
  total = data.total;
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
  for (const video of items) {
    const row = rowTemplate.content.firstElementChild?.cloneNode(true);
    if (!(row instanceof HTMLLIElement)) continue;
    const link = row.querySelector<HTMLAnchorElement>("[data-title]");
    if (link !== null) {
      link.textContent = video.title || video.slug;
      link.href = videoUrl(video);
    }
    const set = (selector: string, text: string) => {
      const element = row.querySelector(selector);
      if (element !== null) element.textContent = text;
    };
    set(
      "[data-date]",
      toLocalInput(video.publishedAt).replace("T", " ").slice(0, 16),
    );
    const state = row.querySelector("[data-state]");
    if (state !== null) setPhrase(state, stateOf(video));
    set("[data-slug]", video.slug);
    const where = row.querySelector("[data-source]");
    if (where !== null) {
      const source = video.source;
      setPhrase(
        where,
        source === undefined || source.kind === "none"
          ? adminUi.list_source_none
          : source.kind === "file"
            ? adminUi.list_source_file
            : providerName(source.provider),
      );
    }
    const button = (selector: string) =>
      row.querySelector<HTMLButtonElement>(selector);
    button("[data-copy]")?.addEventListener(
      "click",
      () => void copyVideo(video),
    );
    for (const selector of ["[data-edit]", "[data-copy]", "[data-delete]"]) {
      const element = button(selector);
      if (element !== null) element.hidden = video.deleted;
    }
    const restore = button("[data-restore]");
    if (restore !== null) restore.hidden = !video.deleted;
    button("[data-edit]")?.addEventListener(
      "click",
      () => void openVideo(video),
    );
    button("[data-delete]")?.addEventListener(
      "click",
      () => void remove(video),
    );
    restore?.addEventListener("click", () => void restoreVideo(video));
    list.append(row);
  }
  if (count !== null) {
    setPhrase(
      count,
      total === 0
        ? adminUi.videos_none
        : format(adminUi.posts_shown, {
            from: (page - 1) * size + 1,
            to: (page - 1) * size + items.length,
            total,
          }),
    );
  }
  drawPager?.(page, last);
}

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
        const present = terms(target.value, false);
        if (!present.includes(term.name)) {
          target.value = [...present, term.name].join(", ");
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

// What the source section shows for the video on screen, and which of its controls apply.
function drawSource(): void {
  const editing = opened !== undefined;
  if (sourceState !== null) {
    sourceState.hidden = !editing;
    if (editing) {
      if (current.kind === "none") setPhrase(sourceState, adminUi.source_none);
      else if (current.kind === "file") {
        setPhrase(
          sourceState,
          format(adminUi.source_file, { size: sizeText(current.sizeBytes) }),
        );
      } else if (current.reference !== undefined) {
        setPhrase(
          sourceState,
          format(adminUi.source_link_public, {
            provider: providerName(current.provider),
            reference: current.reference,
          }),
        );
      } else {
        setPhrase(
          sourceState,
          format(adminUi.source_link, {
            provider: providerName(current.provider),
          }),
        );
      }
    }
  }
  // Added 2026-10-12: the provider list shows where the saved video really is. It used to be reset to YouTube on every
  // open, so a lecture kept on Yandex Disk looked like a YouTube one and nothing on the form said otherwise.
  if (editing && current.kind === "link" && input.provider !== null) {
    input.provider.value = current.provider;
    showReferenceHelp();
  }
  // Added 2026-10-12 (the owner's order): the saved identifier or address is in the field, to read and to change; the
  // field is emptied only when there is no link (a file, nothing, or a new video).
  if (input.reference !== null) {
    input.reference.value =
      editing && current.kind === "link" ? (current.reference ?? "") : "";
  }
  if (setLinkButton !== null) setLinkButton.hidden = !editing;
  if (afterSave !== null) afterSave.hidden = editing;
  if (fileBox !== null) fileBox.hidden = !editing;
}

async function loadSpace(): Promise<void> {
  room = undefined;
  if (spaceLine === null) return;
  setPhrase(spaceLine, "");
  const answer = await sendJson("GET", "/api/admin/videos/space");
  if (answer.status !== 200) return;
  room = answer.body as unknown as Space;
  setPhrase(
    spaceLine,
    room.roomBytes > 0
      ? format(adminUi.file_space, {
          free: sizeText(room.freeBytes),
          room: sizeText(room.roomBytes),
        })
      : format(adminUi.file_no_room, {
          free: sizeText(room.freeBytes),
          reserve: sizeText(room.reserveBytes),
        }),
  );
}

type Shown = Partial<Fields> & { slug?: string; source?: Source };

function showForm(title: Words, values: Shown, existing: boolean): void {
  if (form === null || heading === null) return;
  clearErrors();
  setPhrase(heading, title);
  if (input.title) input.title.value = values.title ?? "";
  if (input.slug) {
    input.slug.value = values.slug ?? "";
    input.slug.readOnly = existing;
  }
  if (input.date) {
    input.date.value = toLocalInput(
      values.publishedAt ?? new Date(serverNow()).toISOString(),
    );
  }
  if (input.description) input.description.value = values.description ?? "";
  if (input.tags) input.tags.value = (values.tags ?? []).join(", ");
  if (input.categories) {
    input.categories.value = (values.categories ?? []).join(", ");
  }
  if (input.paid) input.paid.checked = values.paid === true;
  if (input.until) input.until.value = untilForForm(values.availableUntil);
  const hidden = values.audience === "hidden";
  if (input.draft) input.draft.checked = hidden;
  if (input.audience) {
    input.audience.value = hidden
      ? "everyone"
      : (values.audience ?? "everyone");
  }
  for (const box of document.querySelectorAll<HTMLInputElement>(
    'input[name="statuses"]',
  )) {
    box.checked = (values.statuses ?? []).includes(box.value);
  }
  if (input.userIds) input.userIds.value = (values.userIds ?? []).join(", ");
  if (input.teaser) input.teaser.checked = values.teaser === true;
  if (input.body) input.body.value = values.body ?? "";
  if (input.membersOnly) input.membersOnly.value = values.membersOnly ?? "";
  if (input.reference) input.reference.value = "";
  if (input.provider) input.provider.value = "youtube";
  showReferenceHelp();
  if (fileInput) fileInput.value = "";
  if (progress) progress.hidden = true;
  if (uploadStatus) setPhrase(uploadStatus, "");
  if (userResults !== null) userResults.replaceChildren();
  if (previewBox !== null) previewBox.hidden = true;
  current = values.source ?? { kind: "none" };
  showRestricted();
  showPaid();
  drawSource();
  if (listBox !== null) listBox.hidden = true;
  form.hidden = false;
  input.title?.focus();
  if (existing) void loadSpace();
}

function closeForm(): void {
  if (form !== null) form.hidden = true;
  if (listBox !== null) listBox.hidden = false;
  opened = undefined;
}

// The form's fields as the request carries them (see admin-posts.ts for the draft and the named people).
function fieldsOfForm(): Fields {
  const audience = input.draft?.checked
    ? "hidden"
    : (input.audience?.value ?? "everyone");
  const named = audience !== "hidden" && input.audience?.value === "restricted";
  const paid = input.paid?.checked === true;
  const members = input.membersOnly?.value.trim() ?? "";
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
    paid,
    availableUntil:
      input.until?.value === undefined || input.until.value === ""
        ? null
        : input.until.value,
    // A public video has no members-only block (the server refuses one), whatever the hidden field still holds.
    membersOnly: paid && members !== "" ? members : null,
  };
}

async function openVideo(video: Listed): Promise<void> {
  if (busy) return;
  setBusy(true);
  say(adminUi.post_loading);
  try {
    const answer = await sendJson("GET", `/api/admin/videos/${video.id}`);
    const full = answer.body["video"] as Full | undefined;
    if (answer.status !== 200 || full === undefined) {
      say(failure(answer), true);
      return;
    }
    say("");
    opened = {
      id: full.id,
      updatedAt: full.updatedAt,
      slug: full.slug,
      paid: full.paid === true,
    };
    showForm(adminUi.videos_edit_title, full, true);
  } finally {
    setBusy(false);
  }
}

// "<slug>" gives "<slug>-2", and "<slug>-N" gives "<slug>-N+1", cut to the server's 80 characters.
function nextFreeSlug(slug: string): string {
  const m = /^(.+?)-(\d+)$/.exec(slug);
  const base = m?.[1] ?? slug;
  const suffix = `-${m === null ? 2 : Number(m[2]) + 1}`;
  return base.slice(0, 80 - suffix.length).replace(/-+$/, "") + suffix;
}

async function save(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  if (busy) return;
  clearErrors();
  const fields = fieldsOfForm();
  const editing = opened;
  const slug = editing?.slug ?? input.slug?.value.trim() ?? "";
  const reference = input.reference?.value.trim() ?? "";
  setBusy(true);
  say(adminUi.saving);
  try {
    const answer =
      editing === undefined
        ? await sendJson("POST", "/api/admin/videos", {
            slug,
            ...fields,
            // At creation only: a free video needs its link now, a paid lecture may leave it for later.
            ...(reference === ""
              ? {}
              : {
                  source: {
                    provider: input.provider?.value ?? "youtube",
                    reference,
                  },
                }),
          })
        : await sendJson("PATCH", `/api/admin/videos/${editing.id}`, fields, {
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
    if (
      answer.status === 409 &&
      answer.body["reason"] === "exists" &&
      editing === undefined
    ) {
      const next = nextFreeSlug(slug);
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
    const savedVideo = answer.body["video"] as Full | undefined;
    // After a first save the form stays open as a saved video, so that its file can be uploaded at once.
    if (editing === undefined && savedVideo !== undefined && fields.paid) {
      opened = {
        id: savedVideo.id,
        updatedAt: savedVideo.updatedAt,
        slug: savedVideo.slug,
        paid: true,
      };
      current = savedVideo.source;
      if (input.slug) input.slug.readOnly = true;
      if (heading !== null) setPhrase(heading, adminUi.videos_edit_title);
      drawSource();
      void loadSpace();
      await load();
      say(adminUi.video_saved_live);
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
          : fields.audience === "everyone" && !fields.paid
            ? adminUi.video_saved_live
            : adminUi.saved_hidden_to_some,
    );
  } finally {
    setBusy(false);
  }
}

async function remove(video: Listed): Promise<void> {
  if (busy) return;
  const ok = confirm(
    phrase(
      format(adminUi.confirm_delete_video, {
        title: video.title || video.slug,
      }),
    ),
  );
  if (!ok) return;
  setBusy(true);
  say(adminUi.deleting);
  try {
    const answer = await sendJson("DELETE", `/api/admin/videos/${video.id}`);
    if (answer.status !== 200) {
      say(failure(answer), true);
      return;
    }
    await load();
    say(adminUi.deleted_video);
  } finally {
    setBusy(false);
  }
}

async function restoreVideo(video: Listed): Promise<void> {
  if (busy) return;
  setBusy(true);
  say(adminUi.restoring);
  try {
    const answer = await sendJson(
      "POST",
      `/api/admin/videos/${video.id}/restore`,
      {},
    );
    if (answer.status !== 200) {
      say(failure(answer), true);
      return;
    }
    await load();
    say(adminUi.restored_video);
  } finally {
    setBusy(false);
  }
}

// Added 2026-10-12 (T175, the owner's request: "a mechanism for copying lectures"). The copy is made by the server,
// which takes the link or the file of the original itself, so a paid lecture's link never passes through the page. The
// address proposed is "<slug>-copy"; a taken one is answered 409 `exists` and the next number is tried, as for posts.
// The copy is a draft: the editor opens it from the list, looks, and publishes.
function copySlug(slug: string, n: number): string {
  const base = slug.replace(/-copy(?:-\d+)?$/, "");
  const suffix = n === 1 ? "-copy" : `-copy-${n}`;
  return base.slice(0, 80 - suffix.length).replace(/-+$/, "") + suffix;
}

async function copyVideo(video: Listed): Promise<void> {
  if (busy) return;
  setBusy(true);
  say(adminUi.saving);
  try {
    for (let n = 1; n <= 20; n += 1) {
      const answer = await sendJson(
        "POST",
        `/api/admin/videos/${video.id}/copy`,
        { slug: copySlug(video.slug, n) },
      );
      if (answer.status === 201) {
        await load();
        say(adminUi.video_copied);
        return;
      }
      if (answer.status === 409 && answer.body["reason"] === "exists") continue;
      say(failure(answer), true);
      return;
    }
    say(adminUi.posts_unavailable, true);
  } finally {
    setBusy(false);
  }
}

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
    // The server's render, cleaned by the same sanitizer as a save; the site itself puts it on its pages.
    preview.innerHTML = html;
    previewBox.hidden = false;
    previewBox.scrollIntoView({ block: "nearest" });
  } finally {
    setBusy(false);
  }
}

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
      const present = numbers(input.userIds?.value ?? "");
      if (!present.includes(user.id) && input.userIds !== null) {
        input.userIds.value = [...present, user.id].join(", ");
      }
    });
    item.append(name, add);
    userResults.append(item);
  }
}

// ---- the source of a saved video ----

// The link: one request, acting at once. A registered file is replaced only after the editor confirmed it.
async function setLink(): Promise<void> {
  if (busy || opened === undefined) return;
  const reference = input.reference?.value.trim() ?? "";
  if (reference === "") {
    showError("source", adminUi.source_needs_reference);
    return;
  }
  clearErrors();
  let replace = false;
  if (current.kind === "file") {
    if (!confirm(phrase(adminUi.confirm_replace_with_link))) return;
    replace = true;
  }
  setBusy(true);
  say(adminUi.saving);
  try {
    const answer = await sendJson(
      "PUT",
      `/api/admin/videos/${opened.id}/source`,
      {
        provider: input.provider?.value ?? "youtube",
        reference,
        ...(replace ? { replace: true } : {}),
      },
    );
    if (answer.status === 400) {
      const problems = answer.body["problems"];
      for (const problem of Array.isArray(problems)
        ? (problems as Problem[])
        : []) {
        showError(
          "source",
          problemText[problem.code] ?? adminUi.problem_format,
        );
      }
      say(adminUi.fix_marked, true);
      return;
    }
    const video = answer.body["video"] as Full | undefined;
    if (answer.status !== 200 || video === undefined) {
      const text = failure(answer);
      showError("source", text);
      say(text, true);
      return;
    }
    current = video.source;
    // Changed 2026-10-12 (the owner's order): the saved link stays in the field, so it can be seen and changed.
    drawSource();
    say(adminUi.source_link_set);
  } finally {
    setBusy(false);
  }
}

// An upload with progress; resolves with the status and the parsed body, or status 0 when the network failed.
function putFile(
  url: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", "video/mp4");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.floor((100 * event.loaded) / event.total));
      }
    };
    xhr.onerror = () => resolve({ status: 0, body: {} });
    xhr.onload = () => {
      let body: Record<string, unknown> = {};
      try {
        const parsed: unknown = JSON.parse(xhr.responseText);
        if (parsed !== null && typeof parsed === "object") {
          body = parsed as Record<string, unknown>;
        }
      } catch {
        // No JSON body: the status says what happened.
      }
      resolve({ status: xhr.status, body });
    };
    xhr.send(file);
  });
}

function uploadFailure(answer: ApiAnswer): Phrase {
  const reason = answer.body["reason"];
  if (answer.status === 413 && reason === "over_cap") {
    const limit = answer.body["limitBytes"];
    return format(adminUi.file_over_cap, {
      limit: typeof limit === "number" ? sizeText(limit) : "",
    });
  }
  if (answer.status === 413 && reason === "no_space") {
    return adminUi.file_no_space;
  }
  if (answer.status === 422) {
    const check = answer.body["check"];
    return check === "moov_after_mdat" || check === "no_moov"
      ? adminUi.file_not_faststart
      : adminUi.file_not_mp4;
  }
  return failure(answer);
}

async function upload(): Promise<void> {
  if (busy || opened === undefined || uploadStatus === null) return;
  const file = fileInput?.files?.[0];
  if (file === undefined) {
    setPhrase(uploadStatus, adminUi.file_pick);
    return;
  }
  // A courtesy before the bytes leave: the server decides again from the announced length.
  if (room !== undefined && file.size > room.roomBytes) {
    setPhrase(
      uploadStatus,
      room.roomBytes === 0
        ? format(adminUi.file_no_room, {
            free: sizeText(room.freeBytes),
            reserve: sizeText(room.reserveBytes),
          })
        : format(adminUi.file_too_big_here, {
            size: sizeText(file.size),
            room: sizeText(room.roomBytes),
          }),
    );
    return;
  }
  let replace = false;
  if (current.kind !== "none") {
    if (!confirm(phrase(adminUi.confirm_replace_with_file))) return;
    replace = true;
  }
  setBusy(true);
  if (progress !== null) {
    progress.value = 0;
    progress.hidden = false;
  }
  setPhrase(uploadStatus, format(adminUi.file_uploading, { percent: 0 }));
  try {
    const answer = await putFile(
      `/api/admin/videos/${opened.id}/file${replace ? "?replace=1" : ""}`,
      file,
      (percent) => {
        if (progress !== null) progress.value = percent;
        setPhrase(uploadStatus, format(adminUi.file_uploading, { percent }));
      },
    );
    if (answer.status !== 200) {
      setPhrase(uploadStatus, uploadFailure({ ...answer, retryAfter: 0 }));
      uploadStatus.classList.add("text-red-600");
      return;
    }
    uploadStatus.classList.remove("text-red-600");
    const video = answer.body["video"] as Full | undefined;
    if (video !== undefined) current = video.source;
    if (fileInput) fileInput.value = "";
    drawSource();
    setPhrase(uploadStatus, adminUi.file_done);
    void loadSpace();
  } finally {
    if (progress !== null) progress.hidden = true;
    setBusy(false);
  }
}

newButton?.addEventListener("click", () => {
  if (busy) return;
  opened = undefined;
  showForm(adminUi.videos_new, { slug: "" }, false);
});
cancelButton?.addEventListener("click", () => {
  closeForm();
  say("");
});
form?.addEventListener("submit", (event) => void save(event));
previewButton?.addEventListener("click", () => void showPreview());
userFind?.addEventListener("click", () => void findPeople());
setLinkButton?.addEventListener("click", () => void setLink());
uploadButton?.addEventListener("click", () => void upload());
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
