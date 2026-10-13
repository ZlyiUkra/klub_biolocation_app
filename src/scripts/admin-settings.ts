// The superuser's settings page, in the browser (T110 of specs/001-self-hosted-club-site; FR-035, FR-036). The markup
// is src/pages/admin/settings/index.astro, the routes are `GET` and `PUT /api/admin/settings` and `POST
// /api/admin/settings/recipient/confirm` (server/src/settings/routes.ts). Added 2026-10-13.
//
// Decisions that would otherwise look like mistakes:
// - The page decides nothing. Who may change what, the password typed again, the code, its five tries and its thirty
//   minutes are the backend's; this script sends what was typed and says what the answer was. A request for a new
//   address is answered with the state, and the state is all that is drawn: the address in force, the open request (its
//   address and its time, never a code), the switch.
// - The password is cleared from its field after every answer, whatever the answer, so it is not left in the page
//   while the superuser reads the result. The code is not secret in the page's own sense (it was mailed), but it is
//   cleared after a try for the same reason.
// - Nothing the server says in words is shown: a refusal is read by its `field` and its numbers (`attemptsLeft`,
//   Retry-After) and said in the page's own sentences, in both languages, from src/i18n/admin.ts; the server's `message`
//   is English and meant for logs. The text of the 429 is the account forms' countdown (auth-forms.ts).
// - The same address as the one in force is told here before it is sent (the answer would be a 400 on the same field
//   and the superuser would be told a wrong thing: "not an address"); the server checks it again.
// - A 404 means the session ended or the account lost the role while the page was open (the page itself is a 404 for
//   anyone else); the script says so and does not navigate, for the reason admin-users.ts gives.

import { adminUi } from "../i18n/admin";
import { format, type Phrase, type Words } from "../i18n/lang";
import { ui } from "../i18n/strings";
import {
  attemptsLeftNote,
  bindPasswordToggles,
  commonRefusal,
  joinPhrases,
  messageArea,
  sendJson,
  waitLead,
  type ApiAnswer,
  type FormMessage,
} from "./auth-forms";
import { setPhrase } from "./lang";

type Mode = "locked" | "hidden";
type State = {
  feedbackRecipient: string | null;
  recipientPending: { address: string; expiresAt: string } | null;
  membersBlockMode: Mode;
};

function byId<T extends HTMLElement>(id: string, kind: new () => T): T | null {
  const element = document.getElementById(id);
  return element instanceof kind ? element : null;
}
const statusLine = byId("settings-status", HTMLParagraphElement);
const box = byId("settings-box", HTMLDivElement);
const recipientNow = byId("settings-recipient-now", HTMLParagraphElement);
const recipientForm = byId("settings-recipient-form", HTMLFormElement);
const addressInput = byId("settings-recipient-address", HTMLInputElement);
const recipientPassword = byId("settings-recipient-password", HTMLInputElement);
const recipientSubmit = byId("settings-recipient-submit", HTMLButtonElement);
const recipientMessageEl = byId(
  "settings-recipient-message",
  HTMLParagraphElement,
);
const pendingBox = byId("settings-pending", HTMLDivElement);
const pendingText = byId("settings-pending-text", HTMLParagraphElement);
const codeForm = byId("settings-code-form", HTMLFormElement);
const codeInput = byId("settings-code", HTMLInputElement);
const codeSubmit = byId("settings-code-submit", HTMLButtonElement);
const codeMessageEl = byId("settings-code-message", HTMLParagraphElement);
const modeForm = byId("settings-mode-form", HTMLFormElement);
const modePassword = byId("settings-mode-password", HTMLInputElement);
const modeSubmit = byId("settings-mode-submit", HTMLButtonElement);
const modeMessageEl = byId("settings-mode-message", HTMLParagraphElement);

const recipientMessage: FormMessage | null =
  recipientMessageEl === null ? null : messageArea(recipientMessageEl);
const codeMessage: FormMessage | null =
  codeMessageEl === null ? null : messageArea(codeMessageEl);
const modeMessage: FormMessage | null =
  modeMessageEl === null ? null : messageArea(modeMessageEl);

let state: State | null = null;

function say(text: Words, isError = false): void {
  if (statusLine === null) return;
  setPhrase(statusLine, text);
  statusLine.classList.toggle("text-red-600", isError);
}

/** The date of a moment in both languages (the time zone is the visitor's own), as the feedback page writes it. */
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

function asState(body: Record<string, unknown>): State | null {
  const recipient = body["feedbackRecipient"];
  const pending = body["recipientPending"];
  const mode = body["membersBlockMode"];
  if (recipient !== null && typeof recipient !== "string") return null;
  if (mode !== "locked" && mode !== "hidden") return null;
  let open: State["recipientPending"] = null;
  if (pending !== null && typeof pending === "object") {
    const p = pending as Record<string, unknown>;
    if (
      typeof p["address"] === "string" &&
      typeof p["expiresAt"] === "string"
    ) {
      open = { address: p["address"], expiresAt: p["expiresAt"] };
    }
  }
  return {
    feedbackRecipient: recipient,
    recipientPending: open,
    membersBlockMode: mode,
  };
}

function render(next: State): void {
  state = next;
  if (recipientNow !== null) {
    setPhrase(
      recipientNow,
      next.feedbackRecipient === null
        ? adminUi.settings_recipient_none
        : format(adminUi.settings_recipient_now, {
            address: { ru: next.feedbackRecipient, en: next.feedbackRecipient },
          }),
    );
  }
  if (pendingBox !== null) pendingBox.hidden = next.recipientPending === null;
  if (pendingText !== null && next.recipientPending !== null) {
    const { address, expiresAt } = next.recipientPending;
    setPhrase(
      pendingText,
      format(adminUi.settings_pending, {
        address: { ru: address, en: address },
        time: whenWords(expiresAt),
      }),
    );
  }
  for (const radio of document.querySelectorAll<HTMLInputElement>(
    'input[name="membersBlockMode"]',
  )) {
    radio.checked = radio.value === next.membersBlockMode;
  }
}

/** What to say when the refusal is not one of the form's own fields: no network, a pause, a server fault. */
function generalRefusal(
  answer: ApiAnswer,
  message: FormMessage | null,
): boolean {
  if (answer.status === 404) {
    if (box !== null) box.hidden = true;
    say(adminUi.settings_session_ended, true);
    return true;
  }
  if (answer.status === 429) {
    message?.countdown(answer.retryAfter || 60, waitLead, () => undefined);
    return true;
  }
  const common = commonRefusal(answer);
  if (common !== null) {
    message?.show(common);
    return true;
  }
  return false;
}

/** The wrong-password sentence, with the tries left when the server counted them. */
function passwordRefusal(answer: ApiAnswer): Phrase {
  return joinPhrases(
    adminUi.settings_password_wrong,
    attemptsLeftNote(answer.body["attemptsLeft"]),
  );
}

function busy(button: HTMLButtonElement | null, on: boolean): void {
  if (button !== null) button.disabled = on;
}

async function load(): Promise<void> {
  say(ui.auth_loading);
  const answer = await sendJson("GET", "/api/admin/settings");
  if (answer.status === 404) {
    if (box !== null) box.hidden = true;
    say(adminUi.settings_session_ended, true);
    return;
  }
  const next = answer.status === 200 ? asState(answer.body) : null;
  if (next === null) {
    console.error("Admin: the settings answered", answer.status);
    say(adminUi.settings_unavailable, true);
    return;
  }
  render(next);
  if (box !== null) box.hidden = false;
  say("");
}

/** Takes the state out of a successful answer, or reloads it when the answer had none; returns whether it drew. */
async function adopt(answer: ApiAnswer): Promise<void> {
  const next = asState(answer.body);
  if (next !== null) render(next);
  else await load();
}

recipientForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (addressInput === null || recipientPassword === null) return;
  recipientMessage?.clear();
  const address = addressInput.value.trim();
  const password = recipientPassword.value;
  if (address === "") {
    recipientMessage?.show(adminUi.settings_address_bad);
    return;
  }
  if (
    state?.feedbackRecipient != null &&
    state.feedbackRecipient.toLowerCase() === address.toLowerCase()
  ) {
    recipientMessage?.show(adminUi.settings_address_same);
    return;
  }
  if (password === "") {
    recipientMessage?.show(adminUi.settings_password_missing);
    return;
  }
  busy(recipientSubmit, true);
  const answer = await sendJson("PUT", "/api/admin/settings", {
    password,
    feedbackRecipient: address,
  });
  recipientPassword.value = "";
  busy(recipientSubmit, false);
  if (answer.status === 202) {
    addressInput.value = "";
    await adopt(answer);
    recipientMessage?.show(adminUi.settings_code_asked, "info");
    codeInput?.focus();
    return;
  }
  if (generalRefusal(answer, recipientMessage)) return;
  const field = answer.body["field"];
  if (field === "password") {
    recipientMessage?.show(passwordRefusal(answer));
  } else if (field === "feedbackRecipient") {
    recipientMessage?.show(adminUi.settings_address_bad);
  } else {
    recipientMessage?.show(adminUi.settings_unavailable);
  }
});

codeForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (codeInput === null) return;
  codeMessage?.clear();
  const code = codeInput.value.trim();
  if (!/^[0-9]{8}$/.test(code)) {
    codeMessage?.show(adminUi.settings_code_shape);
    return;
  }
  busy(codeSubmit, true);
  const answer = await sendJson(
    "POST",
    "/api/admin/settings/recipient/confirm",
    {
      code,
    },
  );
  codeInput.value = "";
  busy(codeSubmit, false);
  if (answer.status === 200) {
    await adopt(answer);
    recipientMessage?.show(adminUi.settings_recipient_changed, "info");
    return;
  }
  if (generalRefusal(answer, codeMessage)) return;
  const left = answer.body["attemptsLeft"];
  if (typeof left === "number") {
    // A wrong code costs a try; the last try voids the request, and the state is read again so the box goes away.
    if (left > 0) {
      codeMessage?.show(
        joinPhrases(adminUi.settings_code_wrong, attemptsLeftNote(left)),
      );
    } else {
      await load();
      recipientMessage?.show(adminUi.settings_code_void);
    }
    return;
  }
  // No request is waiting (it expired, or another tab replaced it): read the state, which no longer shows the box.
  await load();
  recipientMessage?.show(adminUi.settings_code_none);
});

modeForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (modePassword === null) return;
  modeMessage?.clear();
  const chosen = document.querySelector<HTMLInputElement>(
    'input[name="membersBlockMode"]:checked',
  );
  if (chosen === null) {
    modeMessage?.show(adminUi.settings_mode_bad);
    return;
  }
  const password = modePassword.value;
  if (password === "") {
    modeMessage?.show(adminUi.settings_password_missing);
    return;
  }
  busy(modeSubmit, true);
  const answer = await sendJson("PUT", "/api/admin/settings", {
    password,
    membersBlockMode: chosen.value,
  });
  modePassword.value = "";
  busy(modeSubmit, false);
  if (answer.status === 200) {
    await adopt(answer);
    modeMessage?.show(adminUi.settings_mode_saved, "info");
    return;
  }
  if (generalRefusal(answer, modeMessage)) return;
  const field = answer.body["field"];
  if (field === "password") modeMessage?.show(passwordRefusal(answer));
  else if (field === "membersBlockMode") {
    modeMessage?.show(adminUi.settings_mode_bad);
  } else modeMessage?.show(adminUi.settings_unavailable);
});

bindPasswordToggles();
void load();
