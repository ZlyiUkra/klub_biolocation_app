// What an editor pastes into the "identifier or address" field, reduced to the one canonical reference an adapter
// stores (added 2026-10-12, T175, the owner's order: every provider must be guaranteed to work, and a pasted address of
// the kind each host shows is what an editor has at hand). Every adapter owns its `parse`; this file holds only the
// pieces they share.
//
// Decisions that would otherwise look like mistakes:
// - Only https (or http) addresses are read, and only on the hosts an adapter names. Anything else is `null`, never a
//   guess: a reference that does not play is found when the editor saves, not when the first visitor presses play.
// - A pasted iframe snippet is accepted, because "share -> embed" on VK, Rutube, Vimeo and OK gives exactly that; its
//   `src` is what is read.
// - The text is never echoed into an error: a paid lecture's link is a key to a file.

/** The address inside what was pasted: the `src` of an iframe snippet, or the text itself with an https scheme. */
export function addressOf(text: string): URL | null {
  const trimmed = text.trim();
  const snippet = /<iframe[^>]*\ssrc\s*=\s*["']([^"']+)["']/i.exec(trimmed);
  let candidate = snippet?.[1] ?? trimmed;
  if (/\s/.test(candidate)) return null;
  // A scheme-less paste ("youtu.be/abc", "//vk.com/...") is read as https.
  if (candidate.startsWith("//")) candidate = `https:${candidate}`;
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/** The hostname in lower case without a leading `www.` or `m.`. */
export function bareHost(url: URL): string {
  return url.hostname.toLowerCase().replace(/^(?:www|m)\./, "");
}
