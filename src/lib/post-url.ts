// The address of a post's own page, in a module of its own. Moved here from src/lib/posts.ts on
// 2026-10-02 with the admin panel: its script (src/scripts/admin-posts.ts) builds the address in
// the browser, and importing posts.ts there pulled astro:content into the panel's bundle with a
// client copy of every post, drafts included, as files under dist/_astro (measured on the first
// build of the panel). This file imports nothing, so the browser gets the one line it needs.
// posts.ts re-exports it, and every other caller still imports it from there: it is still the one
// place that knows the shape of the address (CLAUDE.md, "An entry's address is built by its lib/
// file and nowhere else").

/** A post's own page, /posts/<slug>/. Takes a Post, or anything else with a slug. */
export function postUrl(post: { slug: string }): string {
  return `/posts/${post.slug}/`;
}
