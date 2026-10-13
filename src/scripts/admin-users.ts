// The admin panel for the members' statuses, in the browser: src/pages/admin/users/index.astro is
// the markup, and the club's own backend (server/src/users/routes.ts, mounted at /api/admin) is what
// it asks. Added 2026-10-02 with the owner's status model (src/config.ts, site.admin; ADMIN.md).
//
// Rewritten 2026-10-11 (T070 of specs/001-self-hosted-club-site, step 3 of plan phase 3): the page
// used to load the previous sign-in provider and ask a separate status service with a bearer token.
// It now sends the cookie the browser already holds to the site's own API, through the helper the
// account pages use (auth-forms.ts). What went with the old code: the provider load, the token hints
// and the settings hints - there is no service to configure any more.
//
// Steps:
// 1. Ask for the list. The page itself answers 404 to anyone who is neither metr nor admin (the
//    frontmatter of the page), and so does the API; a 404 here therefore means the session ended
//    while the page was open, and the visitor is sent to sign-in, which brings them back.
//    (Changed later the same day: the script no longer redirects, it says so; see sessionEnded below.)
// 2. Each member gets a list of the statuses the server says the visitor may give, and only for
//    members the visitor may change at all; the server checks every change again anyway.
// 3. A temporary password is issued by the server and shown once, in the row, with its end date.
import { sendJson } from "./auth-forms";
import { site } from "../config";
// Added 2026-10-11 (T152): a module with no imports, so the browser bundle carries nothing from Astro.
import { dateOpens, utcDay } from "../lib/lecture-rules";
// Added later on 2026-10-02 at the owner's request: pages of 20 (AdminPager.astro). The
// "Показать ещё" button and its element lookup went with it.
import { bindPager, pageCount } from "./admin-pager";
// Added 2026-10-12 with the two interface languages (src/i18n/lang.ts): every message in both
// languages, from src/i18n/admin.ts, written with setPhrase() so that a language switch shows it in
// the new language at once, as on /admin/posts/ (admin-posts.ts says why the panel does not reload).
// What cannot hold a span - the options of a status list, a confirm() dialog - gets the language
// shown, and the options are written again after a switch.
import { adminUi } from "../i18n/admin";
import { format, type Phrase, type Words } from "../i18n/lang";
import { phrase, setPhrase } from "./lang";
import { ui } from "../i18n/strings";
import { refusalOf } from "../i18n/errors";

type Status = (typeof site.admin.statuses)[number];
type User = {
  id: number;
  displayName: string;
  email: string;
  login: string | null;
  status: Status;
  // Who set a block, as a status; null when the account is not blocked.
  statusBy: "admin" | "metr" | null;
  // ISO time of registration.
  createdAt: string;
  protected: boolean;
  self: boolean;
  mustChange: boolean;
  // Added 2026-10-11 (T152): the last UTC day the paid lectures are open to the member, `YYYY-MM-DD`, or null.
  accessUntil: string | null;
};
type ListAnswer = {
  users: User[];
  total: number;
  you: { id: number; status: Status; assignable: Status[] };
};

// What a metr may change and change to; the server's rules (server/src/users/status-rules.ts) say
// the same and decide. Guest is never given, so what may be given comes from the server alone
// (`you.assignable`, which holds no guest).
const metrScope: readonly string[] = [
  "guest",
  "student",
  "expert",
  "master",
  "blocked",
];

function byId<T extends HTMLElement>(id: string, kind: new () => T): T | null {
  const element = document.getElementById(id);
  return element instanceof kind ? element : null;
}
const status = byId("users-status", HTMLParagraphElement);
const forbidden = byId("users-forbidden", HTMLParagraphElement);
const box = byId("users-box", HTMLDivElement);
const searchForm = byId("users-search", HTMLFormElement);
const queryInput = byId("users-query", HTMLInputElement);
const count = byId("users-count", HTMLParagraphElement);
const list = byId("users-list", HTMLUListElement);
const rowTemplate = byId("users-row", HTMLTemplateElement);

// Changed 2026-10-12: Phrase, each name in both languages (it was Record<string, string>).
const names: Record<string, Phrase> = site.admin.statusNames;
// Added 2026-10-12: a status name as text in the language shown, for the places that cannot hold a span (an option,
// a confirm() dialog). `nameWords` is the Phrase itself, for the messages that follow a switch.
const nameWords = (status: string): Words => names[status] ?? status;
const nameOf = (status: string): string => phrase(nameWords(status));

// Changed 2026-10-12: Words, written with setPhrase (both languages); it took a string.
function say(text: Words, isError = false): void {
  if (status === null) return;
  setPhrase(status, text);
  status.classList.toggle("text-red-600", isError);
}

// The text of a refusal, written here from the server's stable `reason`; the server's own message is
// English and is never shown.
// Changed 2026-10-12 (T178): Phrases of the dictionary (src/i18n/admin.ts), so a message on the screen follows a switch.
const refusals: Record<string, Phrase> = {
  self: adminUi.refusal_self,
  protected: adminUi.refusal_protected,
  // Changed 2026-10-11 (the owner's spelling of the status): "мэтр", with the Russian э.
  rank: adminUi.refusal_rank,
  // The server's 403 "guest" (the owner's rule).
  guest: adminUi.refusal_guest,
  forbidden: adminUi.users_no_rights,
};
const unavailable = adminUi.users_unavailable;

function reasonOf(body: Record<string, unknown>): Phrase | null {
  const reason = body["reason"];
  return typeof reason === "string" ? (refusals[reason] ?? null) : null;
}

// Added 2026-10-12 (T179): the sentence for an answer the page has no reason of its own for - the text of its `error`
// code (src/i18n/errors.ts), the general one for a code nobody listed.
function failure(body: Record<string, unknown>): Phrase {
  return reasonOf(body) ?? refusalOf(body["error"]);
}

let query = "";
let offset = 0;
let you: ListAnswer["you"] | undefined;
// Added later on 2026-10-02 at the owner's request: numbered pages of site.admin.pageSize members
// in place of "Показать ещё". The server is asked for one page at a time, so `offset` is the first
// member of the page on show, and `page` its number.
let page = 1;
const size = site.admin.pageSize;
const drawPager = bindPager("users-pager", (target) => {
  void load(target).then(() => box?.scrollIntoView({ block: "start" }));
});

// Changed 2026-10-11 (the owner reported the page blinking for the superuser): a 404 from the API used to send
// the visitor to sign-in with `next` set to this page, and the sign-in page sends a signed-in member straight back
// to `next`, so any 404 the page could not explain (a session the API refused while the page had still been served)
// made a redirect loop that looked like blinking. The script no longer navigates by itself: it says what happened and
// leaves the way out to the visitor.
function sessionEnded(): void {
  if (box !== null) box.hidden = true;
    say(adminUi.users_session_ended, true);
}

// Takes the page to show, which replaces the list.
async function load(target: number): Promise<void> {
  page = Math.max(1, target);
  offset = (page - 1) * size;
    say(ui.auth_loading);
  const params = new URLSearchParams({
    page: String(page),
    limit: String(size),
  });
  if (query !== "") params.set("q", query);
  const answer = await sendJson("GET", `/api/admin/users?${params}`);
  if (answer.status === 404) {
    sessionEnded();
    return;
  }
  if (answer.status !== 200) {
    console.error("Admin: the users list answered", answer.status);
    say(unavailable, true);
    return;
  }
  const data = answer.body as unknown as ListAnswer;
  you = data.you;
  // A page past the end (members removed since, or a stale number) falls back to the last one.
  const last = pageCount(data.total);
  if (data.users.length === 0 && page > last) {
    await load(last);
    return;
  }
  list?.replaceChildren(...data.users.map(row));
  if (count !== null) {
        setPhrase(
      count,
      data.total === 0
        ? adminUi.users_none
        : format(adminUi.users_shown, {
            from: offset + 1,
            to: offset + data.users.length,
            total: data.total,
          }),
    );
  }
  drawPager?.(page, last);
  if (box !== null) box.hidden = false;
  say("");
}

// Whether the visitor may change this member's status at all: the server's rules, read the same way.
function changeable(user: User): boolean {
  if (you === undefined || user.self || user.protected) return false;
  if (you.status === "admin") return true;
  return (
    metrScope.includes(user.status) &&
    !(user.status === "blocked" && user.statusBy === "admin")
  );
}

// Whether a temporary password may be issued: an admin for anyone but the superuser and themselves,
// a metr for the same list of statuses they may change (refusalOfTemporaryPassword, same file).
function mayIssuePassword(user: User): boolean {
  if (you === undefined || user.self || user.protected) return false;
  return you.status === "admin" || metrScope.includes(user.status);
}

function note(user: User): Words {
  if (user.self) return adminUi.note_self;
  if (user.protected) return adminUi.note_protected;
  if (user.status === "blocked") {
    // Changed 2026-10-11 (the owner's spelling of the status): "мэтром", with the Russian э.
    return user.statusBy === "admin"
      ? adminUi.note_blocked_by_admin
      : adminUi.note_blocked_by_metr;
  }
  if (user.mustChange) return adminUi.users_must_change;
  return "";
}

// Added 2026-10-11 (T152): the lecture date of a member. The comparison is `dateOpens`, the one definition of the
// rule (src/lib/lecture-rules.ts, no imports); the editors have no end and a blocked account is shown by its note.
const dayText = (day: string): string => day.split("-").reverse().join(".");
function accessText(user: User): Phrase {
  if (user.status === "metr" || user.status === "admin") {
    return ui.acct_lectures_unlimited;
  }
  if (user.accessUntil === null) return adminUi.users_access_not_open;
  const day = dayText(user.accessUntil);
  return format(
    dateOpens(user.accessUntil, utcDay())
      ? ui.acct_lectures_until
      : ui.acct_lectures_ended,
    { day },
  );
}

// Whether the visitor may set this member's date: the server's rule is the temporary password's
// (refusalOfAccessDate in status-rules.ts), and an editor has no date to set.
function mayEditDate(user: User): boolean {
  return (
    mayIssuePassword(user) && user.status !== "metr" && user.status !== "admin"
  );
}

function bindAccessEditor(user: User, item: HTMLLIElement): void {
  const editor = item.querySelector<HTMLElement>("[data-access-editor]");
  if (editor === null) return;
  if (!mayEditDate(user)) {
    editor.remove();
    return;
  }
  const input = editor.querySelector<HTMLInputElement>("[data-access-input]");
  const save = editor.querySelector<HTMLButtonElement>("[data-access-save]");
  if (input === null || save === null) return;
  input.value = user.accessUntil ?? "";
  save.addEventListener("click", () => void saveDate(user, input, save, item));
}

async function saveDate(
  user: User,
  input: HTMLInputElement,
  save: HTMLButtonElement,
  item: HTMLLIElement,
): Promise<void> {
  const who = user.email || user.displayName || String(user.id);
  const wanted = input.value === "" ? null : input.value;
  save.disabled = true;
    say(adminUi.saving);
  const answer = await sendJson("PATCH", `/api/admin/users/${user.id}/access`, {
    accessUntil: wanted,
  });
  const updated = answer.body["user"];
  if (
    answer.status === 200 &&
    typeof updated === "object" &&
    updated !== null
  ) {
    item.replaceWith(row(updated as User));
        say(
      wanted === null
        ? format(adminUi.users_date_removed, { who })
        : format(adminUi.users_date_set, { who, day: dayText(wanted) }),
    );
    return;
  }
  save.disabled = false;
  if (answer.status === 404) {
        say(adminUi.users_gone, true);
    return;
  }
  if (answer.status === 400) {
    say(adminUi.users_date_incomplete, true);
    return;
  }
  if (reasonOf(answer.body) === null) {
    console.error("Admin: the date answered", answer.status);
  }
  say(failure(answer.body), true);
}

function row(user: User): HTMLLIElement {
  const item = rowTemplate?.content.firstElementChild?.cloneNode(true);
  if (!(item instanceof HTMLLIElement)) return document.createElement("li");
    // Changed 2026-10-12 (T178): Words, written with setPhrase, so a row follows a switch of language.
  const set = (selector: string, text: Words) => {
    const element = item.querySelector(selector);
    if (element !== null) setPhrase(element, text);
  };
  set("[data-name]", user.displayName || user.login || adminUi.no_name);
  set("[data-email]", user.email);
  // The status badge and the registration date.
  set("[data-status]", nameWords(user.status));
  const created = new Date(user.createdAt);
  set(
    "[data-created]",
    Number.isNaN(created.getTime())
      ? ""
      : format(adminUi.registered, {
          date: {
            ru: created.toLocaleDateString("ru-RU"),
            en: created.toLocaleDateString("en-GB"),
          },
        }),
  );
  set("[data-note]", note(user));
  set("[data-access]", accessText(user));
  bindAccessEditor(user, item);
  const choice = item.querySelector<HTMLSelectElement>("[data-choice]");
  const apply = item.querySelector<HTMLButtonElement>("[data-apply]");
  if (choice === null || apply === null) return item;
  const allowed: readonly string[] = changeable(user)
    ? (you?.assignable ?? [])
    : [];
  for (const value of site.admin.statuses) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = nameOf(value);
    option.selected = value === user.status;
    option.disabled = value !== user.status && !allowed.includes(value);
    choice.append(option);
  }
  choice.disabled = allowed.length === 0;
  apply.disabled = true;
  choice.addEventListener("change", () => {
    apply.disabled = choice.value === user.status;
  });
  apply.addEventListener("click", () => void change(user, choice, apply, item));

  const issue = item.querySelector<HTMLButtonElement>("[data-temp-button]");
  if (issue !== null) {
    if (mayIssuePassword(user)) {
      issue.addEventListener("click", () => void issuePassword(user, item));
    } else {
      issue.remove();
    }
  }
  return item;
}

async function change(
  user: User,
  choice: HTMLSelectElement,
  apply: HTMLButtonElement,
  item: HTMLLIElement,
): Promise<void> {
  const wanted = choice.value;
  const who = user.email || user.displayName || String(user.id);
    // Changed 2026-10-12 (T178): confirm() takes the language shown (a dialog holds no span).
  const status = nameWords(wanted);
  const question =
    wanted === "blocked"
      ? format(adminUi.confirm_block, { who })
      : wanted === "admin" || wanted === "metr"
        ? format(adminUi.confirm_panel, { who, status: status as Phrase })
        : format(adminUi.confirm_status, { who, status: status as Phrase });
  if (!confirm(phrase(question))) return;
  apply.disabled = true;
  choice.disabled = true;
    say(adminUi.saving);
  const answer = await sendJson("PATCH", `/api/admin/users/${user.id}/status`, {
    status: wanted,
  });
  const updated = answer.body["user"];
  if (
    answer.status === 200 &&
    typeof updated === "object" &&
    updated !== null
  ) {
    const fresh = updated as User;
    item.replaceWith(row(fresh));
        say(
      format(adminUi.status_set, {
        who,
        status: names[fresh.status] ?? fresh.status,
      }),
    );
    return;
  }
  if (answer.status === 404) {
    // Either the account is gone or the session ended; a reload tells which.
        say(adminUi.users_gone, true);
  } else {
    if (reasonOf(answer.body) === null) {
      console.error("Admin: the change answered", answer.status);
    }
    say(failure(answer.body), true);
  }
  choice.disabled = false;
  apply.disabled = false;
}

// Added 2026-10-11 (T070): the temporary password of the status model (ADMIN.md section 2). The
// server makes it, shows it in this one answer and keeps only its hash; the row shows it with the
// date it stops working and a button to copy it, and a second press makes a new one.
async function issuePassword(user: User, item: HTMLLIElement): Promise<void> {
  const who = user.email || user.displayName || String(user.id);
    if (!confirm(phrase(format(adminUi.users_issue_confirm, { who })))) {
    return;
  }
  say(adminUi.users_issuing);
  const answer = await sendJson(
    "POST",
    `/api/admin/users/${user.id}/temp-password`,
    {},
  );
  const password = answer.body["password"];
  const expiresAt = answer.body["expiresAt"];
  if (answer.status === 200 && typeof password === "string") {
    const panel = item.querySelector<HTMLElement>("[data-temp]");
    const value = item.querySelector("[data-temp-value]");
    const until = item.querySelector("[data-temp-until]");
    const copy = item.querySelector<HTMLButtonElement>("[data-temp-copy]");
    if (panel !== null && value !== null) {
      value.textContent = password;
      if (until !== null) {
        const end = new Date(String(expiresAt));
                if (Number.isNaN(end.getTime())) until.textContent = "";
        else {
          setPhrase(
            until,
            format(adminUi.users_temp_until, {
              date: {
                ru: end.toLocaleDateString("ru-RU"),
                en: end.toLocaleDateString("en-GB"),
              },
            }),
          );
        }
      }
      panel.hidden = false;
      copy?.addEventListener("click", () => {
        void navigator.clipboard
          .writeText(password)
                    .then(() => say(adminUi.users_temp_copied))
          .catch(() => say(adminUi.users_temp_copy_failed, true));
      });
    }
        say(format(adminUi.users_temp_issued, { who }));
    return;
  }
  if (answer.status === 404) {
    say(adminUi.users_gone, true);
    return;
  }
  if (reasonOf(answer.body) === null) {
    console.error("Admin: the password answered", answer.status);
  }
  say(failure(answer.body), true);
}

searchForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  query = queryInput?.value.trim() ?? "";
  // A new search starts on its first page.
  void load(1);
});

if (forbidden !== null) forbidden.hidden = true;
await load(1);
