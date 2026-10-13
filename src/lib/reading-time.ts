// The reading time of a post, in a module of its own with no imports (T034 of specs/001-self-hosted-club-site). It was
// readingTime() in src/lib/posts.ts, which imports astro:content; the backend has to compute the same number from the
// stored text, so the rule moved here and posts.ts re-exports it, as it does postUrl().
//
// Hugo: math.Round (div (countwords .Content) 200.0). The count is taken over the Markdown source, as the site always
// did (a one-sentence body is "0 min read", which is Hugo's behaviour too; CLAUDE.md names it as a visible quirk that
// stays).

export function readingTime(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.round(words / 200);
}
