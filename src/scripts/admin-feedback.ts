// The messages of the feedback form, in the panel's browser script (T107 of specs/001-self-hosted-club-site;
// src/pages/admin/feedback/index.astro is the markup, `GET /api/admin/feedback` of server/src/feedback/routes.ts is what
// it asks). Added 2026-10-13.
//
// Decisions that would otherwise look like mistakes:
// - A message is the visitor's own text. Every piece of it goes in with `textContent` (through setPhrase for the
//   labels around it), never as markup, and the page's classes keep the line breaks; there is no `innerHTML` here.
// - The server returns the newest messages in one answer (up to its own cap); this script cuts them into pages of
//   site.admin.pageSize in the browser, with the panel's pager, so a page change asks nothing.
//   Changed 2026-10-13 (the owner's order after T107): that is no longer so. The server cuts the pages and does the
//   search (`?page=&limit=&q=`, the answer `{items, total}`), so a message of any age can be reached, and a page
//   change or a search asks the server again, as the posts' page does. The search text is the visitor's own words or
//   an address: it goes in the query string of one request and nowhere else, and the field is ym-disable-keys.
// - The mail's error text is the provider's own (English, technical); it is shown as it came, inside the sentence the
//   dictionary gives, and not translated. The topic is a code of the fixed list; a code this page has no label for is
//   shown as the code, so a new code on the server never makes a message unreadable.
// - A 404 means the session ended while the page was open (the page itself is a 404 for anyone who may not read it); the
//   script says so and does not navigate, for the reason admin-users.ts gives.

import { site } from "../config";
import { adminUi } from "../i18n/admin";
import { format, type Phrase, type Words } from "../i18n/lang";
import { ui } from "../i18n/strings";
import { sendJson } from "./auth-forms";
import { bindPager, pageCount } from "./admin-pager";
import { setPhrase } from "./lang";

type Message = {
  id: number;
  body: string;
  name: string | null;
  contact: string | null;
  subject: string | null;
  receivedAt: string;
  addressPrefix: string;
  mailedAt: string | null;
  mailError: string | null;
};

function byId<T extends HTMLElement>(id: string, kind: new () => T): T | null {
  const element = document.getElementById(id);
  return element instanceof kind ? element : null;
}
const statusLine = byId("feedback-status", HTMLParagraphElement);
const box = byId("feedback-box", HTMLDivElement);
const count = byId("feedback-count", HTMLParagraphElement);
const list = byId("feedback-list", HTMLUListElement);
const rowTemplate = byId("feedback-row", HTMLTemplateElement);
// Added 2026-10-13: the search form (index.astro).
const searchForm = byId("feedback-search", HTMLFormElement);
const queryInput = byId("feedback-query", HTMLInputElement);

/** The label of each topic code the form may send; src/i18n/admin.ts holds the phrases. */
const topics: Record<string, Phrase> = {
  signin_problem: adminUi.feedback_topic_signin_problem,
};

// Changed 2026-10-13: the page on show, the search text and the count of the whole list (`all`, the array of every
// message the browser held, is gone with the paging in the browser).
let page = 1;
let query = "";
let total = 0;
const size = site.admin.pageSize;
// A press on the pager scrolls to the top of the list; the first drawing does not move the page.
const drawPager = bindPager("feedback-pager", (target) => {
  void load(target, true);
});

function say(text: Words, isError = false): void {
  if (statusLine === null) return;
  setPhrase(statusLine, text);
  statusLine.classList.toggle("text-red-600", isError);
}

/** The date of a moment, written in both languages (the time zone is the visitor's own). */
function whenWords(iso: string): Phrase {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return { ru: iso, en: iso };
  const options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  };
  return {
    ru: at.toLocaleString("ru-RU", options),
    en: at.toLocaleString("en-GB", options),
  };
}

function asMessage(value: unknown): Message | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v["id"] !== "number" ||
    typeof v["body"] !== "string" ||
    typeof v["receivedAt"] !== "string"
  ) {
    return null;
  }
  const text = (x: unknown): string | null =>
    typeof x === "string" && x !== "" ? x : null;
  return {
    id: v["id"],
    body: v["body"],
    name: text(v["name"]),
    contact: text(v["contact"]),
    subject: text(v["subject"]),
    receivedAt: v["receivedAt"],
    addressPrefix:
      typeof v["addressPrefix"] === "string" ? v["addressPrefix"] : "",
    mailedAt: text(v["mailedAt"]),
    mailError: text(v["mailError"]),
  };
}

function row(message: Message): HTMLLIElement {
  const item = rowTemplate?.content.firstElementChild?.cloneNode(true);
  if (!(item instanceof HTMLLIElement)) return document.createElement("li");
  const set = (selector: string, text: Words) => {
    const element = item.querySelector(selector);
    if (element !== null) setPhrase(element, text);
  };
  set("[data-name]", message.name ?? adminUi.feedback_no_name);
  const topic = item.querySelector<HTMLElement>("[data-topic]");
  if (topic !== null && message.subject !== null) {
    setPhrase(topic, topics[message.subject] ?? message.subject);
    topic.hidden = false;
  }
  set("[data-contact]", message.contact ?? adminUi.feedback_no_contact);
  set(
    "[data-received]",
    format(adminUi.feedback_received, { date: whenWords(message.receivedAt) }),
  );
  // The message itself: text, with its line breaks (the class does that), never markup.
  const body = item.querySelector("[data-body]");
  if (body !== null) body.textContent = message.body;
  set(
    "[data-mail]",
    message.mailedAt !== null
      ? format(adminUi.feedback_mail_sent, {
          date: whenWords(message.mailedAt),
        })
      : message.mailError !== null
        ? format(adminUi.feedback_mail_failed, {
            error: { ru: message.mailError, en: message.mailError },
          })
        : adminUi.feedback_mail_waiting,
  );
  set(
    "[data-network]",
    message.addressPrefix === ""
      ? ""
      : format(adminUi.feedback_network, { prefix: message.addressPrefix }),
  );
  return item;
}

// Changed 2026-10-13: draws the page the server answered with (it was the slice of the list the browser held).
function show(items: Message[], last: number, scroll = false): void {
  const from = (page - 1) * size;
  list?.replaceChildren(...items.map(row));
  if (count !== null) {
    // The count line says which list it counts: every message, or the ones the search found.
    setPhrase(
      count,
      total === 0
        ? query === ""
          ? adminUi.feedback_none
          : adminUi.feedback_none_found
        : format(
            query === "" ? adminUi.feedback_shown : adminUi.feedback_found,
            {
              from: from + 1,
              to: from + items.length,
              total,
            },
          ),
    );
  }
  drawPager?.(page, last);
  if (scroll && box !== null) box.scrollIntoView({ block: "start" });
}

// Changed 2026-10-13: asks the server for one page of the list, with the search applied; `target` is the page.
async function load(target = page, scroll = false): Promise<void> {
  page = Math.max(1, target);
  const params = new URLSearchParams({
    page: String(page),
    limit: String(size),
  });
  if (query !== "") params.set("q", query);
  const answer = await sendJson("GET", `/api/admin/feedback?${params}`);
  if (answer.status === 404) {
    if (box !== null) box.hidden = true;
    say(adminUi.feedback_session_ended, true);
    return;
  }
  if (answer.status !== 200) {
    console.error("Admin: the feedback list answered", answer.status);
    say(adminUi.feedback_unavailable, true);
    return;
  }
  const found = answer.body["items"];
  const items: Message[] = [];
  if (Array.isArray(found)) {
    for (const value of found) {
      const one = asMessage(value);
      if (one !== null) items.push(one);
    }
  }
  const counted = answer.body["total"];
  total = typeof counted === "number" ? counted : items.length;
  // A page past the end (messages removed since, or a stale number) falls back to the last one.
  const last = pageCount(total);
  if (items.length === 0 && page > last) {
    await load(last, scroll);
    return;
  }
  if (box !== null) box.hidden = false;
  say("");
  show(items, last, scroll);
}

// Added 2026-10-13: the search form; a search starts again from the first page.
searchForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  query = queryInput?.value.trim() ?? "";
  void load(1);
});

say(ui.auth_loading);
void load(1);
