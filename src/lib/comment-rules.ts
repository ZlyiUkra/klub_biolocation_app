// The two numbers of a comment that the page and the backend both need (T106 of specs/001-self-hosted-club-site; the
// owner's decisions of 2026-10-13, FR-032). A module of its own with no imports, for the reason src/lib/lecture-rules.ts
// is one: the backend reads these values and cannot compile src/config.ts, which reads `import.meta.env`; the page's
// script takes them from here, so each value has one home. The numbers only the backend needs (how many in a window,
// how many under one entry) stay in `commentLimits` in server/src/comments/routes.ts, which also re-exports these.

export const commentRules = {
  /** The longest comment, in characters, after the ends are trimmed; the field's `maxlength` is the same number. */
  maxChars: 2000,
  /** How long after writing the author may change or delete the comment: one day. */
  editWindowMs: 24 * 60 * 60_000,
} as const;
