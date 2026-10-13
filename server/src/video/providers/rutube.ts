// Rutube (T137): the player page of a video is https://rutube.ru/play/embed/<id>, the id being the 32 hexadecimal
// characters of the video's address. A private video also carries a key, `?p=<key>`, kept after the id.
// Changed 2026-10-12 (T175): `parse` reads the video page, the embed address and an iframe snippet.
import { addressOf, bareHost } from "./parse.js";
import { ProviderUnavailable, type ProviderAdapter } from "./types.js";

const referenceShape = /^[0-9a-f]{32}(?:\?p=[A-Za-z0-9_-]+)?$/;
const pagePath =
  /^\/(?:video(?:\/private)?|play\/embed)\/([0-9a-f]{32})(?:\/|$)/;

export const rutube: ProviderAdapter = {
  code: "rutube",
  parse(text) {
    if (referenceShape.test(text.trim())) return text.trim();
    const url = addressOf(text);
    if (url === null || bareHost(url) !== "rutube.ru") return null;
    const m = pagePath.exec(url.pathname);
    if (m === null || m[1] === undefined) return null;
    const key = url.searchParams.get("p");
    const reference =
      key !== null && /^[A-Za-z0-9_-]+$/.test(key) ? `${m[1]}?p=${key}` : m[1];
    return referenceShape.test(reference) ? reference : null;
  },
  async resolve(reference) {
    if (!referenceShape.test(reference)) {
      throw new ProviderUnavailable(
        "rutube: the stored reference is not an id",
      );
    }
    return { embedUrl: `https://rutube.ru/play/embed/${reference}` };
  },
};
