// The comments block of a post or a video, in the browser (T106 of specs/001-self-hosted-club-site; contracts/http-api.md
// "Comments"; FR-032; the look is src/styles/comments.css and the markup is src/components/Comments.astro).
//
// Decisions that would otherwise look like mistakes:
// - A comment is text. Every piece of it goes into the page with `textContent`, never as markup, and the stylesheet keeps
//   the line breaks the author typed (`white-space: pre-wrap`); there is no `innerHTML` in this file, and a test
//   (server/test/comments.test.ts) fails if one appears.
// - What a visitor may do is decided by the server and only shown here. The page asks `/api/auth/me` who the visitor is
//   and shows the composer when the lecture rule of src/lib/lecture-rules.ts says the account writes, so a guest is told
//   why the field is closed instead of finding out by a refusal; the server's refusal is still shown, in the site's own
//   words, for the case where the page and the server differ for a moment (an account blocked since the page loaded).
// - A page that is restored from the back-forward cache is not asked again here: the thread is read once per load.
//   The visitor's own comment is added to the list from the server's answer, so what is shown is what is stored.
// - The day to change or delete one's own comment is counted from the server's clock (`serverNow()`), the same clock the
//   server uses, so a visitor's computer that runs ahead does not offer a button the server will refuse.
// - The dates are written by `toLocaleString` in the language the document shows and written again when the language
//   is switched (`site.i18n.changeEvent`), so a switch changes them like every other text of the page.

import { site } from "../config";
import { refusalOf } from "../i18n/errors";
import { ui } from "../i18n/strings";
import { isErrorCode } from "../lib/error-codes";
import { commentRules } from "../lib/comment-rules";
// Changed 2026-10-13 (T187): the lecture rule's helpers are used by ./comment-viewer now, where the viewer and the
// display half of the writer rule moved so that the reactions block asks the same function.
import {
  canWrite as viewerCanWrite,
  loadMe,
  signInHref as signInAddress,
  type Me,
} from "./comment-viewer";
import { sendJson, serverNow, type ApiAnswer } from "./auth-forms";
import {
  currentLang,
  localize,
  phrase,
  phraseElement,
  setLangAttr,
  setPhrase,
} from "./lang";

type CommentJson = {
  id: number;
  author: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  mine: boolean;
  hidden?: boolean;
};

// `Me`, the viewer, is ./comment-viewer's since 2026-10-13 (T187); the reactions block uses it too.

const root = document.getElementById("comments");

function part<T extends HTMLElement>(name: string): T | null {
  return root?.querySelector<T>(`[data-role="${name}"]`) ?? null;
}

/** An answer's body as a comment, or null when it is not one. */
function asComment(value: unknown): CommentJson | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v["id"] !== "number" ||
    typeof v["author"] !== "string" ||
    typeof v["body"] !== "string" ||
    typeof v["createdAt"] !== "string"
  ) {
    return null;
  }
  const out: CommentJson = {
    id: v["id"],
    author: v["author"],
    body: v["body"],
    createdAt: v["createdAt"],
    editedAt: typeof v["editedAt"] === "string" ? v["editedAt"] : null,
    mine: v["mine"] === true,
  };
  if (typeof v["hidden"] === "boolean") out.hidden = v["hidden"];
  return out;
}

/** The tint of an avatar, 1 to 5, from the name, so a person keeps one colour; 0 (the guest's blue) is for nobody. */
function tintOf(name: string): number {
  let sum = 0;
  for (const char of name) sum = (sum * 31 + (char.codePointAt(0) ?? 0)) % 997;
  return (sum % 5) + 1;
}

/** Writes the letter and the tint of a person into an avatar; `null` is the guest's letter in the guest's blue. */
function paintAvatar(element: HTMLElement, name: string | null): void {
  if (name === null) {
    setPhrase(element, ui.comments_guest_letter);
    delete element.dataset["tint"];
    return;
  }
  const first = [...name.trim()][0] ?? "?";
  element.textContent = first.toLocaleUpperCase();
  element.dataset["tint"] = String(tintOf(name));
}

function avatar(name: string | null): HTMLElement {
  const element = document.createElement("span");
  element.className = "comments-avatar";
  element.setAttribute("aria-hidden", "true");
  paintAvatar(element, name);
  return element;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString(currentLang(), {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

if (root !== null) {
  const kind = root.dataset["kind"] ?? "";
  const slug = root.dataset["slug"] ?? "";
  const base = `/api/entries/${encodeURIComponent(kind)}/${encodeURIComponent(slug)}/comments`;

  const countEl = part<HTMLElement>("count");
  const accountEl = part<HTMLElement>("account");
  const composer = part<HTMLFormElement>("composer");
  const avatarSlot = part<HTMLElement>("composer-avatar");
  const field = part<HTMLTextAreaElement>("field");
  const actions = part<HTMLElement>("composer-actions");
  const submit = part<HTMLButtonElement>("submit");
  const note = part<HTMLElement>("note");
  const message = part<HTMLElement>("message");
  const status = part<HTMLElement>("status");
  const list = part<HTMLOListElement>("list");
  // Added 2026-10-13 (T106, the owner's word): the button above the block hides the thread and shows it again.
  const toggleRow = part<HTMLElement>("toggle-row");
  const toggle = part<HTMLButtonElement>("toggle");
  const panel = part<HTMLElement>("panel");

  let me: Me | null = null;
  let items: CommentJson[] = [];
  let loaded = false;
  let failed = false;

  // Both moved to ./comment-viewer on 2026-10-13 (T187), where the display half of the writer rule of the server
  // (person_lecture_access) now lives for the comments and the reactions alike; these two lines keep the call sites.
  const signInHref = (): string => signInAddress();

  const isEditor = (): boolean =>
    me !== null && (me.status === "metr" || me.status === "admin");

  function canWrite(): boolean {
    return viewerCanWrite(me);
  }

  function showMessage(words: Parameters<typeof setPhrase>[1] | null): void {
    if (message === null) return;
    if (words === null) {
      message.hidden = true;
      message.replaceChildren();
      return;
    }
    setPhrase(message, words);
    message.hidden = false;
  }

  /** The words for a refusal: the sentence of its code, with the one answer this block knows better. */
  function refusal(answer: ApiAnswer): Parameters<typeof setPhrase>[1] {
    if (answer.status === 409 && answer.body["problem"] === "entry_cap") {
      return ui.comments_cap;
    }
    const code = answer.body["error"];
    return refusalOf(isErrorCode(code) ? code : "internal");
  }

  function paintHead(): void {
    if (countEl !== null) {
      const shown = items.filter((item) => item.hidden !== true).length;
      setPhrase(countEl, ui.comments_count(shown));
    }
    if (accountEl === null) return;
    accountEl.replaceChildren();
    if (me === null) {
      const link = document.createElement("a");
      link.href = signInHref();
      setPhrase(link, ui.comments_signin);
      accountEl.append(link);
    } else {
      accountEl.textContent = me.displayName;
    }
  }

  function paintComposer(): void {
    if (field === null || actions === null || note === null) return;
    if (avatarSlot !== null) {
      paintAvatar(avatarSlot, me === null ? null : me.displayName);
    }
    const writes = canWrite();
    field.readOnly = !writes;
    note.replaceChildren();
    note.hidden = writes;
    if (writes) return;
    if (me === null) {
      note.append(phraseElement("span", ui.comments_need_signin));
      note.append(" ");
      const link = document.createElement("a");
      link.href = signInHref();
      setPhrase(link, ui.comments_signin);
      note.append(link);
    } else {
      setPhrase(note, ui.comments_need_access);
    }
  }

  function dayLeft(item: CommentJson): boolean {
    return Date.parse(item.createdAt) + commentRules.editWindowMs > serverNow();
  }

  function action(label: Parameters<typeof setPhrase>[1], run: () => void) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "comment-action";
    setPhrase(button, label);
    button.addEventListener("click", run);
    return button;
  }

  function render(item: CommentJson): HTMLLIElement {
    const li = document.createElement("li");
    li.className = "comment";
    li.dataset["id"] = String(item.id);
    li.dataset["hidden"] = item.hidden === true ? "true" : "false";
    li.append(avatar(item.author));

    const main = document.createElement("div");
    main.className = "comment-main";
    const head = document.createElement("div");
    head.className = "comment-head";
    const author = document.createElement("span");
    author.className = "comment-author";
    author.textContent = item.author;
    const time = document.createElement("time");
    time.className = "comment-time";
    time.dateTime = item.createdAt;
    time.dataset["role"] = "time";
    time.textContent = when(item.createdAt);
    head.append(author, time);
    if (item.editedAt !== null) {
      const edited = document.createElement("span");
      edited.className = "comment-flag";
      setPhrase(edited, ui.comments_edited);
      head.append(edited);
    }
    if (item.hidden === true) {
      const flag = document.createElement("span");
      flag.className = "comment-flag comment-flag-hidden";
      setPhrase(flag, ui.comments_hidden);
      head.append(flag);
    }
    const body = document.createElement("p");
    body.className = "comment-body";
    // Text only: never markup, whatever the comment holds.
    body.textContent = item.body;
    main.append(head, body);

    const buttons = document.createElement("div");
    buttons.className = "comment-actions";
    if (item.mine && item.hidden !== true && dayLeft(item)) {
      buttons.append(
        action(ui.comments_edit, () => edit(item, body, buttons)),
        action(ui.comments_delete, () => remove(item)),
      );
    }
    if (isEditor()) {
      buttons.append(
        item.hidden === true
          ? action(ui.comments_restore, () => moderate(item, "restore"))
          : action(ui.comments_hide, () => moderate(item, "hide")),
      );
    }
    if (buttons.childElementCount > 0) main.append(buttons);
    li.append(main);
    localize(li);
    return li;
  }

  function paintList(): void {
    if (list === null || status === null) return;
    list.replaceChildren(...items.map(render));
    status.hidden = loaded && !failed && items.length > 0;
    if (!loaded) setPhrase(status, ui.comments_loading);
    else if (failed) setPhrase(status, ui.comments_load_failed);
    else if (items.length === 0) setPhrase(status, ui.comments_empty);
    paintHead();
  }

  async function remove(item: CommentJson): Promise<void> {
    if (!window.confirm(phrase(ui.comments_delete_confirm))) return;
    showMessage(null);
    const answer = await sendJson("DELETE", `/api/comments/${item.id}`);
    if (answer.status === 200) {
      items = items.filter((other) => other.id !== item.id);
      paintList();
      return;
    }
    showMessage(refusal(answer));
  }

  async function moderate(
    item: CommentJson,
    verb: "hide" | "restore",
  ): Promise<void> {
    showMessage(null);
    const answer = await sendJson(
      "POST",
      `/api/comments/${item.id}/${verb}`,
      {},
    );
    const changed = asComment(answer.body);
    if (answer.status === 200 && changed !== null) {
      items = items.map((other) => (other.id === item.id ? changed : other));
      paintList();
      return;
    }
    showMessage(refusal(answer));
  }

  function edit(
    item: CommentJson,
    body: HTMLElement,
    buttons: HTMLElement,
  ): void {
    const editor = document.createElement("div");
    editor.className = "comment-editor";
    const input = document.createElement("textarea");
    input.className = "comments-field";
    input.rows = 3;
    input.maxLength = commentRules.maxChars;
    input.value = item.body;
    const row = document.createElement("div");
    row.className = "comments-composer-actions";
    const save = document.createElement("button");
    save.type = "button";
    save.className = "comments-button";
    setPhrase(save, ui.comments_save);
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "comments-button comments-button-quiet";
    setPhrase(cancel, ui.comments_cancel);
    row.append(cancel, save);
    editor.append(input, row);
    body.replaceWith(editor);
    buttons.hidden = true;
    input.focus();

    cancel.addEventListener("click", () => paintList());
    save.addEventListener("click", async () => {
      showMessage(null);
      save.disabled = true;
      const answer = await sendJson("PATCH", `/api/comments/${item.id}`, {
        body: input.value,
      });
      const changed = asComment(answer.body);
      if (answer.status === 200 && changed !== null) {
        items = items.map((other) => (other.id === item.id ? changed : other));
        paintList();
        return;
      }
      save.disabled = false;
      showMessage(refusal(answer));
      if (answer.status === 403) paintList();
    });
  }

  async function post(): Promise<void> {
    if (field === null || submit === null) return;
    const text = field.value.trim();
    if (text === "") return;
    showMessage(null);
    submit.disabled = true;
    const answer = await sendJson("POST", base, { body: text });
    submit.disabled = false;
    const created = asComment(answer.body);
    if (answer.status === 201 && created !== null) {
      items = [created, ...items];
      field.value = "";
      if (actions !== null) actions.hidden = true;
      paintList();
      return;
    }
    showMessage(refusal(answer));
  }

  if (field !== null) {
    field.maxLength = commentRules.maxChars;
    setLangAttr(field, "placeholder", ui.comments_placeholder);
    field.addEventListener("focus", () => {
      if (!field.readOnly && actions !== null) actions.hidden = false;
    });
  }
  composer?.addEventListener("submit", (event) => {
    event.preventDefault();
    void post();
  });

  // The panel is everything under the button. The label is swapped through the dictionary, so a language switch while
  // the thread is hidden still reads in the new language; the page's own markup is shown on every load.
  if (toggle !== null && panel !== null) {
    if (toggleRow !== null) toggleRow.hidden = false;
    toggle.addEventListener("click", () => {
      const hide = !panel.hidden;
      panel.hidden = hide;
      toggle.setAttribute("aria-expanded", String(!hide));
      setPhrase(toggle, hide ? ui.comments_expand : ui.comments_collapse);
    });
  }

  // The thread and the visitor are asked for together; the page is useful with either one missing.
  async function load(): Promise<void> {
    paintList();
    // Changed 2026-10-13 (T187): the viewer comes from ./comment-viewer, asked once for this block and the reactions.
    const [thread, who] = await Promise.all([sendJson("GET", base), loadMe()]);
    me = who;
    loaded = true;
    failed = thread.status !== 200;
    items = [];
    // `sendJson` types its body as a record, but a list answer is an array at run time.
    const raw: unknown = thread.body;
    if (Array.isArray(raw)) {
      for (const value of raw) {
        const one = asComment(value);
        if (one !== null) items.push(one);
      }
    }
    paintComposer();
    paintList();
  }

  document.addEventListener(site.i18n.changeEvent, () => {
    // Dates are plain text, so they are written again in the new language; the rest follows by itself.
    for (const time of root.querySelectorAll<HTMLTimeElement>(
      'time[data-role="time"]',
    )) {
      time.textContent = when(time.dateTime);
    }
  });

  void load();
}
