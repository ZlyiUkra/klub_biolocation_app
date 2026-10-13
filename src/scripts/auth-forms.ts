// What the three account pages (sign-in, sign-up, account) share in the browser (T053 of
// specs/001-self-hosted-club-site; research.md section 5). Plain TypeScript and the page's own markup: no framework and
// nothing from the previous sign-in provider, which these pages replace.
//
// Decisions that would otherwise look like mistakes:
// - Every request is JSON to the site's own origin with the cookie the browser already holds; the pages never read or
//   write the session cookie (it is HttpOnly) and never keep a password anywhere but in the field it was typed into.
// - The text of a refusal is written here, in the site's language, from the server's stable code and field. The
//   server's own `message` is English and meant for logs and other clients; a page never shows it.
// - A wait is shown as a countdown on the form and the submit button stays off until it ends. It is a courtesy, not the
//   rule: the server refuses an early attempt all the same, so a page that skips the countdown gains nothing.
// - The show/hide control toggles `type` between password and text and swaps two icons with the `hidden` class: the
//   `hidden` attribute does nothing on an inline SVG (CLAUDE.md, "Decisions and pitfalls").

// Added 2026-10-12 (T178) with the two interface languages (src/i18n/lang.ts): every sentence this module writes is a
// Phrase now, and the message area is written through setPhrase(), so a switch of language changes a message that is
// already on the screen. A wait is built in both languages at once (describeWait).
import { ui } from "../i18n/strings";
import { refusalOf } from "../i18n/errors";
import { isErrorCode } from "../lib/error-codes";
import { format, type Phrase, type Words } from "../i18n/lang";
import { setLangAttr, setPhrase } from "./lang";

export type ApiAnswer = {
  status: number;
  /** The parsed JSON body, or an empty object when the answer had none. */
  body: Record<string, unknown>;
  /** Seconds from the Retry-After header, 0 when absent. */
  retryAfter: number;
};

// Added 2026-10-12 (T099): the server's clock, learned from the Date header of every answer (whole seconds, rounded
// down) and carried forward by the browser's own timer. A date the panel proposes - "published now" - comes from this
// and not from the browser's clock: a visitor's computer may run minutes ahead, and a post dated in the future by the
// server's clock is not shown until then. The header is the server's own time of the answer, so a post dated with it
// is never in the future for the server.
let serverOffset = 0;
/** The server's time now, in milliseconds; the browser's own time until an answer has been seen. */
export function serverNow(): number {
  return Date.now() + serverOffset;
}

/** One JSON request to the backend; a network failure comes back as status 0, never as an exception. */
export async function sendJson(
  // Changed 2026-10-11 (T146): PATCH for the profile route.
  // Changed 2026-10-12 (T175): PUT for the link of a video in the admin panel.
  method: "POST" | "DELETE" | "GET" | "PATCH" | "PUT",
  path: string,
  body?: unknown,
  // Added 2026-10-12 (T099): extra request headers, for the `If-Match` of a save in the admin panel.
  extra: Record<string, string> = {},
): Promise<ApiAnswer> {
  try {
    const response = await fetch(path, {
      method,
      // Changed 2026-10-11 (T153): the content type is sent on every write, with a body or without. The cross-site
      // guard of the backend (server/src/http/guards.ts) refuses a write that is not `application/json`, so a body-less
      // DELETE (ending a device) came back 403 `cross_site` and did nothing; check:auth found it.
      headers: {
        ...(method === "GET"
          ? { Accept: "application/json" }
          : {
              "Content-Type": "application/json",
              Accept: "application/json",
            }),
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
    const stamp = Date.parse(response.headers.get("date") ?? "");
    if (!Number.isNaN(stamp)) serverOffset = stamp - Date.now();
    let parsed: Record<string, unknown> = {};
    try {
      const value: unknown = await response.json();
      if (value !== null && typeof value === "object") {
        parsed = value as Record<string, unknown>;
      }
    } catch {
      // An answer with no JSON body is an empty object; the status says what happened.
    }
    return {
      status: response.status,
      body: parsed,
      retryAfter: Number(response.headers.get("retry-after") ?? 0) || 0,
    };
  } catch {
    return { status: 0, body: {}, retryAfter: 0 };
  }
}

/**
 * "4 мин 20 с" / "4 min 20 s", "35 с" / "35 s", "1 ч 5 мин" / "1 h 5 min": how long is left, in words a visitor reads at
 * a glance. Changed 2026-10-12 (T178): a Phrase, the units of each language from the dictionary.
 */
export function describeWait(seconds: number): Phrase {
  const total = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const write = (lang: "ru" | "en"): string => {
    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours} ${ui.form_unit_hour[lang]}`);
    if (minutes > 0) parts.push(`${minutes} ${ui.form_unit_minute[lang]}`);
    // Seconds are shown only below an hour: "1 ч 5 мин 20 с" is more than anyone reads.
    if (hours === 0 && (rest > 0 || parts.length === 0)) {
      parts.push(`${rest} ${ui.form_unit_second[lang]}`);
    }
    return parts.join(" ");
  };
  return { ru: write("ru"), en: write("en") };
}

/** Two sentences as one Phrase, with a space between them; `null` (nothing to add) leaves the first alone. */
export function joinPhrases(first: Phrase, second: Phrase | null): Phrase {
  if (second === null) return first;
  return {
    ru: `${first.ru} ${second.ru}`,
    en: `${first.en} ${second.en}`,
  };
}

export type FormMessage = {
  // Changed 2026-10-12 (T178): Words, so a sentence of the dictionary follows a language switch.
  show(text: Words, tone?: "error" | "info"): void;
  clear(): void;
  /** Shows a live countdown and calls `done` when it ends; a new countdown or `clear` stops the old one. */
  countdown(seconds: number, lead: Phrase, done: () => void): void;
};

/** The message area of a form: an element with `role="alert"`, hidden while empty. */
export function messageArea(element: HTMLElement): FormMessage {
  let timer: number | undefined;
  const stop = () => {
    if (timer !== undefined) window.clearInterval(timer);
    timer = undefined;
  };
  const paint = (text: Words, tone: "error" | "info") => {
    setPhrase(element, text);
    element.classList.remove("hidden");
    element.classList.toggle("text-red-600", tone === "error");
    element.classList.toggle("dark:text-red-400", tone === "error");
  };
  return {
    show(text, tone = "error") {
      stop();
      paint(text, tone);
    },
    clear() {
      stop();
      element.textContent = "";
      element.classList.add("hidden");
    },
    countdown(seconds, lead, done) {
      stop();
      let left = Math.max(1, Math.ceil(seconds));
      paint(joinPhrases(lead, describeWait(left)), "error");
      timer = window.setInterval(() => {
        left -= 1;
        if (left <= 0) {
          stop();
          element.textContent = "";
          element.classList.add("hidden");
          done();
          return;
        }
        setPhrase(element, joinPhrases(lead, describeWait(left)));
      }, 1000);
    },
  };
}

/** Wires every show/hide button inside `root` to the password field it names with `data-password-toggle`. */
export function bindPasswordToggles(root: ParentNode = document): void {
  for (const button of root.querySelectorAll<HTMLButtonElement>(
    "[data-password-toggle]",
  )) {
    const input = document.getElementById(
      button.dataset["passwordToggle"] ?? "",
    );
    if (!(input instanceof HTMLInputElement)) continue;
    const shown = button.querySelector("[data-icon-shown]");
    const hidden = button.querySelector("[data-icon-hidden]");
    button.addEventListener("click", () => {
      const reveal = input.type === "password";
      input.type = reveal ? "text" : "password";
      button.setAttribute("aria-pressed", String(reveal));
      // Changed 2026-10-12 (T178): both languages; the label is written again by setLangAttr on a switch.
      setLangAttr(
        button,
        "aria-label",
        reveal ? ui.form_password_hide : ui.form_password_show,
      );
      // The open eye means "the password is visible now"; the crossed one is what a click would hide.
      shown?.classList.toggle("hidden", !reveal);
      hidden?.classList.toggle("hidden", reveal);
    });
  }
}

/** What to say when a request to a sign-in route is refused for a reason the page cannot fix by itself. */
// Changed 2026-10-12 (T179): the texts are those of src/i18n/errors.ts, by the answer's `error` code, so that every
// page says the same thing for the same code and a code nobody listed gets the general sentence.
export function commonRefusal(answer: ApiAnswer): Phrase | null {
  if (answer.status === 0) return ui.form_network_failed;
  if (answer.status === 403 && answer.body["error"] === "cross_site") {
    return refusalOf("cross_site");
  }
  if (answer.status >= 500) {
    return refusalOf(
      isErrorCode(answer.body["error"]) ? answer.body["error"] : "internal",
    );
  }
  return null;
}

export const waitLead = ui.form_wait_lead;

/** The tries-left warning of a failed sign-in or password change, or null when there is none to give. */
export function attemptsLeftNote(attemptsLeft: unknown): Phrase | null {
  if (typeof attemptsLeft !== "number" || attemptsLeft <= 0) return null;
  return format(ui.form_tries_left, {
    n: attemptsLeft,
    word: ui.form_tries_word(attemptsLeft),
  });
}
