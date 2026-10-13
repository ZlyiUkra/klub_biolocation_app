// The fields of a video entry, the schema of the `video` collection. Moved here from src/content/config.ts on
// 2026-10-10 (T028 of specs/001-self-hosted-club-site), the way post-fields.ts was split off on 2026-10-02: the
// backend's content import has to check the same rules, and it cannot import `astro:content`. "astro/zod" is the
// same zod that `astro:content` re-exports as `z`. The rules themselves, and the notes that explain them, are
// unchanged; config.ts hands this object to defineCollection as the collection's schema.
import { z } from "astro/zod";

// Fields of a video entry that can carry the YouTube id of the video: `videoId` itself, and
// `videoUrl` and `thumbnail`, which hold youtu.be/<id> and i.ytimg.com/vi/<id>/ addresses in the
// usual YouTube embed markup. Added 2026-09-28 with paid videos (the consilium verdict in
// .specify/consilium/2026-09-28-paid-video-access.md): a paid entry must carry none of them.
const idFields = ["videoId", "videoUrl", "thumbnail"] as const;

// Changed 2026-09-28 (the verdict named above): the object is wrapped in superRefine so that
// the schema, which every getCollection("video") call passes through, refuses two mistakes at
// build time. A paid entry that names its video would put the id into the built HTML, the
// search index and the public repository - the one thing the paid mechanism exists to prevent
// (VIDEO-PAGE.md 6.1, step 1). A public entry without videoId used to build a page with an
// empty player block (CLAUDE.md, "Next steps" 7); it now fails the build instead. All eighteen
// entries of 2026-09-28 carry one. A discriminated union was the other way; it needs `access`
// written into every file, since zod cannot default a discriminator.
export const videoFields = z
  .object({
    title: z.string(),
    date: z.coerce.date(),
    draft: z.boolean().default(false),
    description: z.string().default(""),
    tags: z
      .array(z.string())
      .default([])
      .transform((tags) => tags.map((t) => t.toLowerCase())),
    categories: z.array(z.string()).default([]),
    videoId: z.string().optional(),
    videoUrl: z.string().optional(),
    thumbnail: z.string().optional(),
    duration: z.string().optional(),
    // Added 2026-10-11 (T152, the owner's rule): the last day the video is available on the site. Optional: a video with
    // no value is available for 100 years from the day it is first imported (migration 014's column default). A YAML
    // date written without quotes is a date, so it is read like `date` above; the import turns it into a UTC day.
    availableUntil: z.coerce.date().optional(),
    heroImage: z.string().optional(),
    videoPlatform: z.string().default("youtube"), // youtube, vk, rutube и т.д.
    // For one day (2026-09-22) the four post-only fields - lastmod, summary, share_title,
    // share_description - were here too, because ArticleLayout.astro read them from a video
    // through Post.astro's `Post | Video` prop. The layout takes plain props now and
    // VideoLayout.astro maps a video onto them, so the video schema is its own again.
    // VIDEO-PAGE.md, section 4.
    // Added 2026-09-28: who may watch. "public" is the default, so the eighteen existing
    // entries need no new line. "paid" shows a stub in the player's place, and the player
    // address comes from the access service only for a member (VIDEO-PAGE.md 6.1).
    access: z.enum(["public", "paid"]).default("public"),
  })
  .superRefine((data, ctx) => {
    if (data.access === "paid") {
      for (const field of idFields) {
        if (data[field] !== undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: `a paid video must not carry ${field}: its id lives only at the access service`,
          });
        }
      }
    } else if (data.videoId === undefined || data.videoId === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["videoId"],
        message: "a public video needs its videoId",
      });
    }
  });
