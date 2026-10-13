// The one interface of a video provider's adapter (T137 of specs/001-self-hosted-club-site; data-model.md,
// `video_providers`). An adapter turns the secret `reference` stored in `video_sources` into what the page may play: an
// address of a player page to put in a frame (`embedUrl`) or the address of one file to play in a video element
// (`videoUrl`). It is called only after the access rule said yes, and the reference never leaves the server.
//
// A provider that cannot answer throws `ProviderUnavailable`; its message names the provider and the reason, never the
// reference or the address that was asked.

export type ResolvedSource = { embedUrl: string } | { videoUrl: string };

export type ProviderAdapter = {
  /** The `code` of the provider's row in `video_providers`. */
  code: string;
  /**
   * Added 2026-10-12 (T175): the canonical reference for what an editor pasted (an id, an address, an embed snippet),
   * or null when it cannot be a reference of this provider. What is stored is always the canonical form.
   */
  parse(text: string): string | null;
  resolve(reference: string): Promise<ResolvedSource>;
};

export class ProviderUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderUnavailable";
  }
}
