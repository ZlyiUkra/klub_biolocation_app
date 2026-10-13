---
# Template for a video entry. Copy it to src/content/video/<name>.md and edit.
# The file name becomes the address: my-lecture.md -> /video/my-lecture/
# Use lower-case Latin letters, digits and hyphens, and never a bare year (2025.md).
#
# Required: title and date. Everything else below may be left out, except videoId -
# without it the page is built with an empty player, so treat it as required in practice.
# Corrected 2026-10-02: since 2026-09-28 the build stops on a public video without videoId
# ("a public video needs its videoId"), so it is required outright.
# For a PAID lecture this template is not enough: add `access: paid` and delete videoId,
# videoUrl and thumbnail - see CONTENT.md, "A paid lecture", and PAID-VIDEO.md section 4.
title: "Video title"
description: "One sentence about the video. Shown on the card and in the feed."
# The YouTube id, not the whole address: the part after watch?v=
# https://www.youtube.com/watch?v=dQw4w9WgXcQ  ->  dQw4w9WgXcQ
videoId: "dQw4w9WgXcQ"
# The moment it is published. Keep +03:00 at the end, and remember that an entry dated
# in the future is left out of the published site until then (npm run dev shows it).
date: "2026-09-18T12:00:00+03:00"
# What the card prints next to the title. Free text; "12:34" is the usual shape.
duration: "12:34"
# Lower-cased by the build. Each one gets its own page at /tags/<name>/, shared with the posts.
tags: ["video", "биолокация"]
# The lectures use "обучающее видео", which is the category page at /categories/обучающее-видео/.
# Corrected 2026-10-02: the category was renamed on 2026-09-22 and is "обучающие видео", at
# /categories/обучающие-видео/; the old spelling here would have started a second category.
categories: ["обучающие видео"]
# true keeps the entry out of the published site while it is being written.
draft: true
# Optional and unused by the page today, kept because the schema accepts them:
# videoUrl, thumbnail, heroImage, videoPlatform (only "youtube" is rendered).
---

The text under the player. Optional - a lecture may have none - and it is what the
site's search matches on, so a few sentences about the subject are worth writing.
