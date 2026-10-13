// Added while porting the Categories page (MIGRATION-PLAN.md §4.1); the Tags page will
// need it too. Applied in lib/posts.ts, so every consumer of getTerms() gets `term.title`
// already cased and no page has to remember this rule.
//
// Hugo title-cases taxonomy term titles: the front matter says `categories: ["blog"]` and
// `tags: ["энергетика человека"]`, but the term pages render "Blog" and
// "Энергетика Человека". This reproduces that for the display name; the slug keeps coming
// from urlize(), which lower-cases.
//
// Hugo's default `titleCaseStyle` is "AP", which additionally leaves small words ("a",
// "of", "the", ...) lower-case when they are not first or last. That rule is deliberately
// NOT implemented: no term on this site is affected, and guessing Hugo's exact word list
// would risk a silent divergence. Verified against every term the Hugo build renders
// (Blog, Education, Hugo, Void, Биолокация, Радиэстезия, Энергетика Человека, Энергополе).
// If a multi-word English term ever appears, check it against the Hugo output first.
export function titleize(s: string): string {
  return s.replace(/\S+/gu, (word) => word[0].toUpperCase() + word.slice(1));
}
