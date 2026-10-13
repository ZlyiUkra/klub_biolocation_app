// The fields of a post's front matter, the schema of the `posts` collection. Moved here from
// src/content/config.ts on 2026-10-02 with the admin panel, at the owner's word
// (.specify/consilium/2026-10-02-admin-posts.md): the content service of the panel
// (workers/content-admin/worker.mjs; deleted 2026-10-12, T100 - the backend's `server/src/content/rules.ts` is the one
// copy of the save rules now) cannot import an Astro module, so it carries its own copy of
// these rules, and scripts/check-content-admin.mjs proves the copy against this file. That test
// runs under plain Node, where "astro:content" does not resolve; "astro/zod" does, and it is the
// same zod that "astro:content" re-exports as `z`. The rules themselves are unchanged.
import { z } from "astro/zod";

export const postFields = z.object({
  title: z.string(),
  date: z.coerce.date(),
  draft: z.boolean().default(false),
  description: z.string().default(""),
  tags: z
    .array(z.string())
    .default([])
    .transform((tags) => tags.map((t) => t.toLowerCase())),
  categories: z.array(z.string()).default([]),
  lastmod: z.coerce.date().optional(),
  summary: z.string().optional(),
  share_title: z.string().optional(),
  share_description: z.string().optional(),
});
