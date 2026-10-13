// The rules a video's text must satisfy before it is stored (task T150 of specs/001-self-hosted-club-site), in a module
// of its own that imports nothing from Astro, so the backend's importer, the editors' save path (T097) and the old
// build guard in src/lib/video.ts all apply the very same ones.
//
// They are the build guards of `getVideos()` in src/lib/video.ts (2026-09-28 and 2026-10-02), which had no successor
// once the content moved into the database: a build no longer reads the files, so a guard there would never run.
//
//   - A paid lecture's text carries no YouTube address and no Yandex Disk address, its members-only block included.
//     The text of every video is printed on its page, in the feed and in the search index, so a timestamped link in it
//     would hand the lecture to anyone, which is the one thing the paid mechanism exists to prevent.
//   - A members-only block belongs in a paid lecture. On a public one nobody would ever see it.
//   - A block that cannot be recognised is refused: one that does not open with exactly `<div data-members-only>` and
//     close with `</div>`, or that holds another div, would not be cut out of the card, the feed and the search index.
//   - A public lecture needs its embed id, and a paid one carries none: that pair of rules is the schema's
//     (src/content/video-fields.ts, `superRefine`), checked first by every caller, and is not repeated here.
//
// A refused entry is never stored: the importer runs in one transaction, and the save path answers with the code.

// The .js extension is what the backend's compiler requires of a relative import; the site's bundler maps it back to the .ts file.
import { membersOnlyBlock, membersOnlyMarker } from "../lib/members-only.js";

// A YouTube address in any of its forms: the watch and embed pages, the short youtu.be links and the thumbnail host.
export const youtubeAddress =
  /youtu\.be\/|youtube(?:-nocookie)?\.com\/|ytimg\.com\//i;

// A Yandex Disk address in any of its forms: disk.yandex.<domain> (ru, com, com.tr and the rest, and the download host
// downloader.disk.yandex.ru), Yandex 360's disk.360.yandex.ru and the old short yadi.sk. A lecture stored there is
// reached by the file's public link, which plays and downloads the file for anyone who has it.
export const yandexDiskAddress =
  /disk\.(?:360\.)?yandex\.[a-z.]+\/|yadi\.sk\//i;

export type VideoTextProblem = {
  /** Stable name of the rule, for a panel to show next to the field. */
  code:
    | "youtube_in_paid"
    | "yandex_in_paid"
    | "block_in_public"
    | "block_unrecognised";
  message: string;
};

/**
 * Every rule that the text of one video breaks, in a fixed order; an empty list means it breaks none.
 *
 * `body` is the whole Markdown text after the front matter, members-only blocks included; `description` is the front
 * matter description, which is printed in the page's meta and on the cards and so is held to the address rules too.
 */
export function videoTextProblems(input: {
  paid: boolean;
  body: string;
  description?: string;
}): VideoTextProblem[] {
  const problems: VideoTextProblem[] = [];
  const text = `${input.description ?? ""}\n${input.body}`;
  if (input.paid && youtubeAddress.test(text)) {
    problems.push({
      code: "youtube_in_paid",
      message:
        "a paid video must not link to YouTube in its text; its id lives only at the access service",
    });
  }
  if (input.paid && yandexDiskAddress.test(text)) {
    problems.push({
      code: "yandex_in_paid",
      message:
        "a paid video must not link to Yandex Disk in its text; its file link lives only at the access service",
    });
  }
  if (input.body.includes(membersOnlyMarker)) {
    if (!input.paid) {
      problems.push({
        code: "block_in_public",
        message:
          "a data-members-only block belongs in a paid video (access: paid); on a public one nobody would ever see it",
      });
    } else if (
      input.body.replace(membersOnlyBlock, "").includes(membersOnlyMarker) ||
      // A div inside a block ends it early: the pattern stops at the first closing tag, so the text after that tag
      // would be left among the public text, which is the leak the block exists to prevent. The old build guard
      // promised "no other div inside" in its message but only looked for a left-over marker, so it missed this.
      (input.body.match(membersOnlyBlock) ?? []).some((block) =>
        block.slice("<div data-members-only>".length).includes("<div"),
      )
    ) {
      problems.push({
        code: "block_unrecognised",
        message:
          "a members-only block must open with exactly <div data-members-only> and close with </div>, with no other div inside",
      });
    }
  }
  return problems;
}
