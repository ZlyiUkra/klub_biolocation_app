// The pictures block of the panel's forms, in the browser (T143 of specs/001-self-hosted-club-site, 2026-10-12): the
// markup is src/components/AdminImages.astro, the server side is server/src/content/images.ts (`PUT /api/admin/images`
// and `GET /api/admin/images`).
//
// What it does: uploads the picked file with a progress bar and puts `![name](address)` into the text area the editor
// last had the cursor in; puts an https address of a picture from the internet into the text the same way; lists the
// uploaded pictures a page at a time with "put into the text" and "copy the address".
//
// Decisions that would otherwise look like mistakes:
// - The file is sent as it is, with its own image type, and the name goes in the query string as text. The server
//   decides the type from the content; the check here (size against the cap, the type word) only saves a pointless send.
// - An address pasted from the internet is accepted only when it starts with https:// and has no whitespace; the server's
//   Markdown pass keeps or drops the image by its own rule when the text is saved.
// - Alt text is the file's name without its extension (or "picture"): the editor can change it in the text.
import { sendJson } from "./auth-forms";
import { adminUi } from "../i18n/admin";
import { ui } from "../i18n/strings";
import { format, type Phrase } from "../i18n/lang";
import { setPhrase } from "./lang";

const root = document.getElementById("admin-images");
if (root !== null) start(root);

type Item = {
  url: string;
  name: string;
  sizeBytes: number;
  uploadedAt: string;
};

function start(box: HTMLElement): void {
  const byId = <T extends HTMLElement>(id: string, kind: new () => T) => {
    const element = document.getElementById(id);
    return element instanceof kind ? element : null;
  };
  const help = byId("admin-images-help", HTMLParagraphElement);
  const file = byId("admin-image-file", HTMLInputElement);
  const upload = byId("admin-image-upload", HTMLButtonElement);
  const progress = byId("admin-image-progress", HTMLProgressElement);
  const status = byId("admin-image-status", HTMLParagraphElement);
  const urlInput = byId("admin-image-url", HTMLInputElement);
  const urlInsert = byId("admin-image-url-insert", HTMLButtonElement);
  const urlError = byId("admin-image-url-error", HTMLParagraphElement);
  const none = byId("admin-image-none", HTMLParagraphElement);
  const list = byId("admin-image-list", HTMLUListElement);
  const more = byId("admin-image-more", HTMLButtonElement);
  const template = byId("admin-image-item", HTMLTemplateElement);

  let capBytes = 5 * 1024 * 1024;
  let page = 1;
  let total = 0;
  let shown = 0;

  const sizeText = (bytes: number): string =>
    bytes < 1024 * 1024
      ? `${Math.max(1, Math.round(bytes / 1024))} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  const say = (words: Phrase | string, isError = false): void => {
    if (status === null) return;
    setPhrase(status, words);
    status.classList.toggle("text-red-600", isError);
  };
  const drawHelp = (): void => {
    if (help !== null) {
      setPhrase(help, format(adminUi.img_help, { limit: sizeText(capBytes) }));
    }
  };

  // The text area the cursor was last in: the body of the post, or the members-only block of a lecture.
  let target: HTMLTextAreaElement | null = null;
  for (const id of ["admin-body", "admin-members-only"]) {
    const area = document.getElementById(id);
    if (area instanceof HTMLTextAreaElement) {
      target ??= area;
      area.addEventListener("focus", () => {
        target = area;
      });
    }
  }
  const insert = (markdown: string): void => {
    if (target === null) return;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const before = target.value.slice(0, start);
    const after = target.value.slice(end);
    // A picture stands on a line of its own.
    const lead =
      before === "" || before.endsWith("\n\n")
        ? ""
        : before.endsWith("\n")
          ? "\n"
          : "\n\n";
    const tail = after.startsWith("\n") || after === "" ? "" : "\n\n";
    target.value = `${before}${lead}${markdown}${tail}${after}`;
    const caret = before.length + lead.length + markdown.length;
    target.setSelectionRange(caret, caret);
    target.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const altOf = (name: string): string => {
    const base = name
      .replace(/\.[A-Za-z0-9]{2,5}$/, "")
      .replace(/[[\]()]/g, " ")
      .trim();
    return base === "" ? "" : base;
  };
  const markdownOf = (url: string, name: string): string =>
    `![${altOf(name)}](${url})`;

  const draw = (items: Item[]): void => {
    if (list === null || template === null) return;
    for (const item of items) {
      const row = template.content.firstElementChild?.cloneNode(true);
      if (!(row instanceof HTMLLIElement)) continue;
      const thumb = row.querySelector<HTMLImageElement>("[data-thumb]");
      if (thumb !== null) thumb.src = item.url;
      const name = row.querySelector("[data-name]");
      if (name !== null) name.textContent = item.name || item.url;
      const size = row.querySelector("[data-size]");
      if (size !== null)
        size.textContent = `${sizeText(item.sizeBytes)} - ${item.url}`;
      row.querySelector("[data-insert]")?.addEventListener("click", () => {
        insert(markdownOf(item.url, item.name));
      });
      row.querySelector("[data-copy]")?.addEventListener("click", async () => {
        const address = new URL(item.url, location.origin).href;
        try {
          await navigator.clipboard.writeText(address);
          say(adminUi.img_copied);
        } catch {
          // No clipboard permission: the address is in the line above, ready to be selected by hand.
          say(address);
        }
      });
      list.append(row);
    }
  };

  const load = async (next: number, replace: boolean): Promise<void> => {
    const answer = await sendJson(
      "GET",
      `/api/admin/images?page=${next}&limit=12`,
    );
    if (answer.status !== 200) return;
    const body = answer.body as unknown as {
      total: number;
      capBytes: number;
      items: Item[];
    };
    capBytes = body.capBytes;
    drawHelp();
    total = body.total;
    if (replace && list !== null) {
      list.replaceChildren();
      shown = 0;
    }
    page = next;
    draw(body.items);
    shown += body.items.length;
    if (none !== null) none.hidden = total > 0;
    if (more !== null) more.hidden = shown >= total;
  };

  // A request with a progress bar: fetch has no upload progress, so XMLHttpRequest, as the video upload does.
  const put = (
    address: string,
    body: File,
    type: string,
    onProgress: (percent: number) => void,
  ): Promise<{ status: number; body: Record<string, unknown> }> =>
    new Promise((resolve) => {
      const request = new XMLHttpRequest();
      request.open("PUT", address);
      request.setRequestHeader("Content-Type", type);
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
      request.onload = () => {
        let parsed: Record<string, unknown> = {};
        try {
          const value: unknown = JSON.parse(request.responseText);
          if (value !== null && typeof value === "object") {
            parsed = value as Record<string, unknown>;
          }
        } catch {
          // An answer with no JSON body is an empty object; the status says what happened.
        }
        resolve({ status: request.status, body: parsed });
      };
      request.onerror = () => resolve({ status: 0, body: {} });
      request.send(body);
    });

  upload?.addEventListener("click", async () => {
    const picked = file?.files?.[0];
    if (picked === undefined) {
      say(adminUi.img_pick, true);
      return;
    }
    if (picked.size > capBytes) {
      say(
        format(adminUi.img_too_big, {
          size: sizeText(picked.size),
          limit: sizeText(capBytes),
        }),
        true,
      );
      return;
    }
    if (progress !== null) {
      progress.value = 0;
      progress.hidden = false;
    }
    if (upload !== null) upload.disabled = true;
    say(format(adminUi.img_uploading, { percent: 0 }));
    const answer = await put(
      `/api/admin/images?name=${encodeURIComponent(picked.name)}`,
      picked,
      picked.type,
      (percent) => {
        if (progress !== null) progress.value = percent;
        say(format(adminUi.img_uploading, { percent }));
      },
    );
    if (progress !== null) progress.hidden = true;
    if (upload !== null) upload.disabled = false;
    if (answer.status === 200 || answer.status === 201) {
      const image = answer.body["image"] as Item | undefined;
      if (image !== undefined) {
        insert(markdownOf(image.url, image.name || picked.name));
        say(answer.status === 200 ? adminUi.img_existing : adminUi.img_done);
        if (file !== null) file.value = "";
        await load(1, true);
        return;
      }
    }
    const reason = answer.body["reason"];
    say(
      answer.status === 413 && reason === "no_space"
        ? adminUi.img_no_space
        : answer.status === 413
          ? format(adminUi.img_too_big, {
              size: sizeText(picked.size),
              limit: sizeText(capBytes),
            })
          : answer.status === 422 || answer.status === 400
            ? adminUi.img_not_image
            : ui.form_network_failed,
      true,
    );
  });

  const insertByAddress = (): void => {
    if (urlInput === null || urlError === null) return;
    const value = urlInput.value.trim();
    let ok = false;
    try {
      const url = new URL(value);
      ok = url.protocol === "https:" && !/\s/.test(value);
    } catch {
      ok = false;
    }
    if (!ok) {
      setPhrase(urlError, adminUi.img_url_bad);
      urlError.hidden = false;
      return;
    }
    urlError.hidden = true;
    // The alt text is content, not interface: it goes into the post's Markdown, written in the club's own language.
    insert(`![картинка](${value})`);
    urlInput.value = "";
  };
  urlInsert?.addEventListener("click", insertByAddress);
  // Enter here would save the post form this block stands in.
  urlInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      insertByAddress();
    }
  });

  more?.addEventListener("click", () => void load(page + 1, false));

  // The list is asked for when the block is first opened, not on every page load.
  let loaded = false;
  box.addEventListener("toggle", () => {
    if (box instanceof HTMLDetailsElement && box.open && !loaded) {
      loaded = true;
      void load(1, true);
    }
  });
  drawHelp();
}
