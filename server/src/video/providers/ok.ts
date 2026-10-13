// Odnoklassniki, ok.ru (added 2026-10-12, T175, the owner's list of hosts): the player page is
// https://ok.ru/videoembed/<id>, the id being the number in the video's address (ok.ru/video/<id>).
import { addressOf, bareHost } from "./parse.js";
import { ProviderUnavailable, type ProviderAdapter } from "./types.js";

const idShape = /^\d{6,20}$/;

export const ok: ProviderAdapter = {
  code: "ok",
  parse(text) {
    if (idShape.test(text.trim())) return text.trim();
    const url = addressOf(text);
    if (url === null || bareHost(url) !== "ok.ru") return null;
    const m = /^\/(?:video|videoembed)\/(\d{6,20})(?:\/|$)/.exec(url.pathname);
    return m?.[1] ?? null;
  },
  async resolve(reference) {
    if (!idShape.test(reference)) {
      throw new ProviderUnavailable("ok: the stored reference is not an id");
    }
    return { embedUrl: `https://ok.ru/videoembed/${reference}` };
  },
};
