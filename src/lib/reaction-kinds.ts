// The six reactions an entry can carry (T187 of specs/001-self-hosted-club-site; FR-047), in the order the page shows
// them. A module of its own with no imports, for the reason src/lib/comment-rules.ts is one: the backend
// (server/src/comments/routes.ts, which re-exports this list, and the route and table built on it) cannot compile
// src/config.ts, and the component and its script (src/components/Reactions.astro, src/scripts/reactions.ts) take the
// same list from here, so the six names have one home on the code side. The other copy is the check constraint of
// migration 022; server/test/reactions.test.ts stores each kind through the route, so a name missing there fails.
// The order is the previous comment service's: upvote, funny, love, surprised, angry, sad.

export const reactionKinds = [
  "upvote",
  "funny",
  "love",
  "surprised",
  "angry",
  "sad",
] as const;

export type ReactionKind = (typeof reactionKinds)[number];

/** True when the value is one of the six names; the page and the route use the same test. */
export function isReactionKind(value: unknown): value is ReactionKind {
  return (
    typeof value === "string" &&
    (reactionKinds as readonly string[]).includes(value)
  );
}
