// The six reactions above the comments, in the browser (T187 of specs/001-self-hosted-club-site; FR-047;
// contracts/http-api.md "Comments"; the markup is src/components/Reactions.astro, the look src/styles/reactions.css).
//
// Decisions that would otherwise look like mistakes:
// - What a visitor may do is decided by the server and only shown here. The page asks who the visitor is (the one
//   request that ./comment-viewer shares with the comments block) and applies the display half of the writer rule, so
//   a signed-out visitor is told to sign in and a guest account is told why the row is closed, instead of finding
//   out by a refusal; the server's refusal is still shown, in the site's own words, for the moment the page and the
//   server differ (an account blocked since the page loaded).
// - What is shown is what is stored: after a press the page paints the answer of the server (the counts, the total and
//   the viewer's own kind), not what it expected to happen. A press on the marked picture takes the reaction back
//   (DELETE), a press on another one changes it (PUT with the new kind): one reaction per account.
// - The pictures are in the markup already; this file writes numbers and states only, with `textContent` and
//   attributes, never markup. A press while another is in flight is ignored, so a double click is one request.
// - The counts are read for every viewer, a signed-out visitor too; only the viewer's own `mine` needs the session.

import { refusalOf } from "../i18n/errors";
import { ui } from "../i18n/strings";
import { isErrorCode } from "../lib/error-codes";
import { isReactionKind } from "../lib/reaction-kinds";
import { sendJson, type ApiAnswer } from "./auth-forms";
import { canWrite, loadMe, signInHref, type Me } from "./comment-viewer";
import { phraseElement, setPhrase } from "./lang";

type Reactions = {
  counts: Record<string, number>;
  total: number;
  mine: string | null;
};

/** An answer's body as the reactions of an entry, or null when it is not one. */
function asReactions(value: unknown): Reactions | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const counts = v["counts"];
  if (counts === null || typeof counts !== "object") return null;
  if (typeof v["total"] !== "number") return null;
  const mine = v["mine"];
  if (mine !== null && !isReactionKind(mine)) return null;
  const out: Record<string, number> = {};
  for (const [name, n] of Object.entries(counts as Record<string, unknown>)) {
    if (isReactionKind(name) && typeof n === "number") out[name] = n;
  }
  return { counts: out, total: v["total"], mine };
}

const root = document.querySelector<HTMLElement>('[data-role="reactions"]');

if (root !== null) {
  // `root` is narrowed here, but not inside the function declarations below; this constant is.
  const host: HTMLElement = root;
  const kind = root.dataset["kind"] ?? "";
  const slug = root.dataset["slug"] ?? "";
  const base = `/api/entries/${encodeURIComponent(kind)}/${encodeURIComponent(slug)}/reactions`;

  const buttons = [
    ...root.querySelectorAll<HTMLButtonElement>("button[data-reaction]"),
  ];
  const totalEl = root.querySelector<HTMLElement>(
    '[data-role="reactions-total"]',
  );
  const note = root.querySelector<HTMLElement>('[data-role="reactions-note"]');
  const message = root.querySelector<HTMLElement>(
    '[data-role="reactions-message"]',
  );

  let me: Me | null = null;
  let state: Reactions | null = null;
  let loaded = false;
  let busy = false;

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

  /** The words for a refusal: the sentence of its code. */
  function refusal(answer: ApiAnswer): Parameters<typeof setPhrase>[1] {
    const code = answer.body["error"];
    return refusalOf(isErrorCode(code) ? code : "internal");
  }

  function paint(): void {
    const writes = loaded && canWrite(me);
    if (totalEl !== null) {
      setPhrase(totalEl, ui.reactions_total(state?.total ?? 0));
    }
    for (const button of buttons) {
      const name = button.dataset["reaction"] ?? "";
      const n = state?.counts[name] ?? 0;
      const picked = state?.mine === name;
      // `reaction-count`, not `count`: the comments block's own count is `[data-role="count"]` in the same section.
      const count = button.querySelector<HTMLElement>(
        '[data-role="reaction-count"]',
      );
      if (count !== null) {
        count.textContent = String(n);
        count.dataset["empty"] = n === 0 ? "true" : "false";
      }
      button.setAttribute("aria-pressed", String(picked));
      button.dataset["picked"] = picked ? "true" : "false";
      // A button that cannot be used says so to a screen reader and by its cursor; it is not `disabled`, so the
      // numbers it carries stay readable and it can still be focused.
      button.setAttribute("aria-disabled", String(!writes));
    }
    if (note === null) return;
    note.replaceChildren();
    note.hidden = !loaded || writes;
    if (!loaded || writes) return;
    if (me === null) {
      note.append(phraseElement("span", ui.reactions_need_signin));
      note.append(" ");
      const link = document.createElement("a");
      link.href = signInHref();
      setPhrase(link, ui.comments_signin);
      note.append(link);
    } else {
      setPhrase(note, ui.reactions_need_access);
    }
  }

  async function choose(name: string): Promise<void> {
    if (busy || !canWrite(me)) return;
    busy = true;
    showMessage(null);
    const answer =
      state?.mine === name
        ? await sendJson("DELETE", base)
        : await sendJson("PUT", base, { kind: name });
    busy = false;
    const next = asReactions(answer.body);
    if (answer.status === 200 && next !== null) {
      state = next;
      paint();
      return;
    }
    showMessage(refusal(answer));
  }

  for (const button of buttons) {
    button.addEventListener("click", () => {
      const name = button.dataset["reaction"] ?? "";
      if (isReactionKind(name)) void choose(name);
    });
  }

  // The counts and the visitor are asked for together; the row is useful with either one missing.
  async function load(): Promise<void> {
    const [answer, who] = await Promise.all([sendJson("GET", base), loadMe()]);
    me = who;
    state = answer.status === 200 ? asReactions(answer.body) : null;
    loaded = true;
    paint();
    // A marker for the browser check, which must not press before the viewer is known.
    host.dataset["state"] = "ready";
  }

  void load();
}
