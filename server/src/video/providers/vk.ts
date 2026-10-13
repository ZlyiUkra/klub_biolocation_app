// VK Video (T137): the player page is https://vk.com/video_ext.php?oid=<owner>&id=<video>, the reference written as
// `<owner>_<video>` (the owner id may be negative, for a community). A private or link-only video also needs the
// `hash` of its embed address; it is kept as a third part, `<owner>_<video>_<hash>`, so no column changes.
// Changed 2026-10-12 (T175): `parse` reads the addresses VK shows (the video page on vk.com or vkvideo.ru, the embed
// address, an iframe snippet) and the adapter takes the optional hash. The embed shape is VK's own embed code:
// video_ext.php with oid, id and hash.
import { addressOf, bareHost } from "./parse.js";
import { ProviderUnavailable, type ProviderAdapter } from "./types.js";

const referenceShape = /^(-?\d+)_(\d+)(?:_([0-9a-f]+))?$/;
const hosts = new Set(["vk.com", "vk.ru", "vkvideo.ru"]);

export const vk: ProviderAdapter = {
  code: "vk",
  parse(text) {
    if (referenceShape.test(text.trim())) return text.trim();
    const url = addressOf(text);
    if (url === null || !hosts.has(bareHost(url))) return null;
    let owner: string | null = null;
    let video: string | null = null;
    const hash = url.searchParams.get("hash");
    if (url.pathname === "/video_ext.php") {
      owner = url.searchParams.get("oid");
      video = url.searchParams.get("id");
    } else {
      // /video-123_456 and /video123_456, or the same inside ?z=video-123_456%2Fpl_...
      const place = url.searchParams.get("z") ?? url.pathname;
      const m = /video(-?\d+)_(\d+)/.exec(place);
      owner = m?.[1] ?? null;
      video = m?.[2] ?? null;
    }
    if (owner === null || video === null) return null;
    const base = `${owner}_${video}`;
    const reference =
      hash !== null && /^[0-9a-f]+$/.test(hash) ? `${base}_${hash}` : base;
    return referenceShape.test(reference) ? reference : null;
  },
  async resolve(reference) {
    const parts = referenceShape.exec(reference);
    if (parts === null) {
      throw new ProviderUnavailable("vk: the stored reference is not an id");
    }
    const hash = parts[3] === undefined ? "" : `&hash=${parts[3]}`;
    return {
      embedUrl: `https://vk.com/video_ext.php?oid=${parts[1]}&id=${parts[2]}${hash}`,
    };
  },
};
