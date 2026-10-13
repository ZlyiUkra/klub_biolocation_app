// YouTube (T137): the privacy-enhanced host youtube-nocookie.com and `rel=0`, the address the old access Worker built
// (workers/video-access/worker.mjs, VERSION 2026-09-28.2) and that VideoLayout.astro uses for public videos; change the
// two together. The reference is the eleven-character id of a watch address.
import { addressOf, bareHost } from "./parse.js";
import { ProviderUnavailable, type ProviderAdapter } from "./types.js";

const idShape = /^[A-Za-z0-9_-]{11}$/;
const hosts = new Set([
  "youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "youtu.be",
]);

export const youtube: ProviderAdapter = {
  code: "youtube",
  // Added 2026-10-12 (T175): the id, or a watch, short, embed, shorts or live address, or an iframe snippet.
  parse(text) {
    if (idShape.test(text.trim())) return text.trim();
    const url = addressOf(text);
    if (url === null) return null;
    const host = bareHost(url);
    if (!hosts.has(host)) return null;
    let id: string | null | undefined;
    if (host === "youtu.be") id = url.pathname.split("/")[1];
    else if (url.pathname === "/watch") id = url.searchParams.get("v");
    else {
      const m = /^\/(?:embed|shorts|live|v)\/([^/]+)/.exec(url.pathname);
      id = m?.[1];
    }
    return id !== undefined && id !== null && idShape.test(id) ? id : null;
  },
  async resolve(reference) {
    if (!idShape.test(reference)) {
      throw new ProviderUnavailable(
        "youtube: the stored reference is not an id",
      );
    }
    return {
      embedUrl: `https://www.youtube-nocookie.com/embed/${reference}?rel=0`,
    };
  },
};
