import { defineCollection, z } from "astro:content";
// Added 2026-10-02 with the admin panel: the fields of a post live in their own file, so that the
// panel's check can load them under plain Node (post-fields.ts says why). Same rules as before.
import { postFields } from "./post-fields";
import { videoFields } from "./video-fields";

const posts = defineCollection({
  type: "content",
  schema: postFields,
});

const pages = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
  }),
});

// Changed 2026-10-10 (T028): the video schema, with the notes that went with it, is in src/content/video-fields.ts
// now, unchanged, so that the backend's import can run the same rules without `astro:content`.
const video = defineCollection({
  type: "content",
  schema: videoFields,
});

export const collections = { posts, pages, video };
