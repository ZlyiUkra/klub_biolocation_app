// Vimeo (added 2026-10-12, T175: migration 011 made Vimeo a row of `video_providers` and nothing played it, so a Vimeo
// video saved in the panel never showed). The player page is https://player.vimeo.com/video/<id>; an unlisted video
// also needs the hash of its address, kept as `<id>/<hash>` (migration 011 foresaw exactly this).
import { addressOf, bareHost } from "./parse.js";
import { ProviderUnavailable, type ProviderAdapter } from "./types.js";

const referenceShape = /^(\d{5,12})(?:\/([0-9a-f]{6,40}))?$/;

export const vimeo: ProviderAdapter = {
  code: "vimeo",
  parse(text) {
    if (referenceShape.test(text.trim())) return text.trim();
    const url = addressOf(text);
    if (url === null) return null;
    const host = bareHost(url);
    if (host !== "vimeo.com" && host !== "player.vimeo.com") return null;
    // vimeo.com/<id>, vimeo.com/<id>/<hash>, vimeo.com/channels/<name>/<id>, player.vimeo.com/video/<id>?h=<hash>
    const m = /(?:^|\/)(\d{5,12})(?:\/([0-9a-f]{6,40}))?(?:\/|$)/.exec(
      url.pathname,
    );
    if (m === null || m[1] === undefined) return null;
    const hash = m[2] ?? url.searchParams.get("h");
    const reference = hash === null ? m[1] : `${m[1]}/${hash}`;
    return referenceShape.test(reference) ? reference : null;
  },
  async resolve(reference) {
    const parts = referenceShape.exec(reference);
    if (parts === null) {
      throw new ProviderUnavailable("vimeo: the stored reference is not an id");
    }
    const hash = parts[2] === undefined ? "" : `?h=${parts[2]}`;
    return {
      embedUrl: `https://player.vimeo.com/video/${parts[1]}${hash}`,
    };
  },
};
