// The address of a video's own page, in a module of its own, the way post-url.ts is for posts. Added 2026-10-12 (T175):
// the admin panel's video script builds the address in the browser, and importing video.ts there would pull
// astro:content into the panel's bundle (the pitfall CLAUDE.md records for post-url.ts). This file imports nothing;
// video.ts re-exports it, so it is still the one place that knows the shape of the address.

/** A video's own page, /video/<slug>/. */
export function videoUrl(video: { slug: string }): string {
  return `/video/${video.slug}/`;
}
