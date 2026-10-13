// The members-only block of a paid video's body (the colleague's "block 2", 2026-09-28; PAID-VIDEO.md section 4),
// in a module of its own with no imports. Moved here from src/lib/video.ts on 2026-10-10 (T028 of
// specs/001-self-hosted-club-site): the content import of the backend has to take the block out of a video's
// text before anything is rendered, and it must use the very same pattern the site uses - a second copy would be a
// second definition of what the block is. video.ts imports the two constants from here and is otherwise unchanged.
//
// The author wraps the part in <div data-members-only>, with blank lines inside so the Markdown in it still
// renders. Hidden, not secret, on today's site (owner's choice of 2026-09-28, option A); from plan phase 4 the
// backend keeps it in its own column and sends it only to a viewer with full access.

export const membersOnlyBlock = /<div data-members-only>[\s\S]*?<\/div>/g;
export const membersOnlyMarker = "data-members-only";

const openTag = "<div data-members-only>";
const closeTag = "</div>";

/**
 * Splits a body into what everyone may see and the text of its members-only blocks (without the wrapping div, joined
 * by a blank line). A body with no block returns itself and an empty second part.
 */
export function splitMembersOnly(body: string): {
  publicBody: string;
  membersOnlyBody: string;
} {
  const blocks = body.match(membersOnlyBlock) ?? [];
  return {
    publicBody: body.replace(membersOnlyBlock, ""),
    membersOnlyBody: blocks
      .map((block) => block.slice(openTag.length, -closeTag.length).trim())
      .join("\n\n"),
  };
}
