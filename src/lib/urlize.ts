// Hugo's `urlize`, as used for /tags/<slug>/ and /categories/<slug>/:
// lower-case, trim, whitespace -> "-", keep Unicode letters and digits.
//   "Энергетика человека" -> "энергетика-человека"
//   "Hugo"                -> "hugo"
// See MIGRATION-PLAN.md §5.4. Compare the result against reference/hugo-routes.txt.
export function urlize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}\-_.~]/gu, "")
    .replace(/-+/g, "-");
}

// Hugo percent-encodes non-ASCII characters in every URL it prints, so the tag
// "биолокация" is linked as `/tags/%D0%B1%D0%B8%D0%BE%D0%BB%D0%BE%D0%BA%D0%B0%D1%86%D0%B8%D1%8F/`.
// A browser encodes the raw form the same way before requesting it, so both work - this
// exists so the built HTML matches Hugo's byte for byte. Apply it to the slug SEGMENT only,
// never to a whole path: it encodes "/" as well.
export function encodeSlug(slug: string): string {
  return encodeURIComponent(slug);
}
