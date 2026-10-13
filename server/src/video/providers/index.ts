// The adapters by provider code (T137). A provider with a row in `video_providers` and no adapter here cannot play:
// the table says it exists, the adapter says how. A new place a video can come from is one row and one file.
// Changed 2026-10-12 (T175): vimeo and ok joined the list (vimeo had a row since migration 011 and no adapter), and
// `normalizeReference` is the one place that turns a pasted address into the reference that is stored.
import { ok } from "./ok.js";
import { rutube } from "./rutube.js";
import { ProviderUnavailable, type ResolvedSource } from "./types.js";
import { vimeo } from "./vimeo.js";
import { vk } from "./vk.js";
import { yandexDisk } from "./yandex-disk.js";
import { youtube } from "./youtube.js";

const adapters = new Map(
  [youtube, vk, rutube, yandexDisk, vimeo, ok].map((adapter) => [
    adapter.code,
    adapter,
  ]),
);

export { ProviderUnavailable, type ResolvedSource };

/** The provider codes that have an adapter, i.e. that can really play. */
export const playableProviders: readonly string[] = [...adapters.keys()];

/** The canonical reference of what an editor pasted, or null (no such provider, or not an address of it). */
export function normalizeReference(
  provider: string,
  text: string,
): string | null {
  return adapters.get(provider)?.parse(text) ?? null;
}

export async function resolveSource(
  provider: string,
  reference: string,
): Promise<ResolvedSource> {
  const adapter = adapters.get(provider);
  if (adapter === undefined) {
    throw new ProviderUnavailable(`${provider}: no adapter for this provider`);
  }
  return adapter.resolve(reference);
}
