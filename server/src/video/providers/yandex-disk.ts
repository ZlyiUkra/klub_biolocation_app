// Yandex Disk (T137): the old access Worker's rule, ported (workers/video-access/worker.mjs, VERSION 2026-09-30.1).
//
// - The reference is the public link of ONE file, https://disk.yandex.ru/i/<key> (disk.yandex.com too). A folder link
//   (/d/...) or anything else is refused: a folder would hand a visitor a listing, not one video.
// - Yandex's public API is asked only here, and only after the access rule said yes, so a visitor with no right never
//   makes the server ask.
// - The answer is accepted only when its address is https on the download host `downloader.disk.yandex.ru`; anything
//   else is "unavailable", so a changed or spoofed answer cannot send the page to another host.
// - Eight seconds to answer. A failure names the provider and the reason (the HTTP status, a timeout), never the
//   public link: it is the key to the file.
import { ProviderUnavailable, type ProviderAdapter } from "./types.js";

const linkShape = /^https:\/\/disk\.yandex\.(ru|com)\/i\/[\w-]+$/;
const apiAddress =
  "https://cloud-api.yandex.net/v1/disk/public/resources/download";
const downloadHost = "downloader.disk.yandex.ru";

export const yandexDisk: ProviderAdapter = {
  code: "yandex-disk",
  // Added 2026-10-12 (T175): the public link of one file as Yandex shows it; the short yadi.sk form is written out as
  // disk.yandex.ru, the query and a trailing slash are dropped. A folder link (/d/...) is not a reference.
  parse(text) {
    const trimmed = text.trim();
    const m =
      /^(?:https?:\/\/)?(?:disk\.yandex\.(ru|com)|yadi\.sk)\/i\/([\w-]+)\/?(?:\?.*)?$/.exec(
        trimmed,
      );
    if (m === null || m[2] === undefined) return null;
    return `https://disk.yandex.${m[1] ?? "ru"}/i/${m[2]}`;
  },
  async resolve(reference) {
    if (!linkShape.test(reference)) {
      throw new ProviderUnavailable(
        "yandex-disk: the stored reference is not the link of one file",
      );
    }
    let response: Response;
    try {
      response = await fetch(
        `${apiAddress}?public_key=${encodeURIComponent(reference)}`,
        { signal: AbortSignal.timeout(8000) },
      );
    } catch {
      throw new ProviderUnavailable("yandex-disk: no answer in time");
    }
    if (!response.ok) {
      throw new ProviderUnavailable(
        `yandex-disk: the API answered ${response.status}`,
      );
    }
    let href: unknown;
    try {
      href = ((await response.json()) as { href?: unknown }).href;
    } catch {
      throw new ProviderUnavailable("yandex-disk: the answer was not JSON");
    }
    let address: URL | undefined;
    try {
      address = typeof href === "string" ? new URL(href) : undefined;
    } catch {
      address = undefined;
    }
    if (
      address === undefined ||
      address.protocol !== "https:" ||
      address.hostname !== downloadHost
    ) {
      throw new ProviderUnavailable(
        "yandex-disk: the download address is not on Yandex's host",
      );
    }
    return { videoUrl: address.href };
  },
};
