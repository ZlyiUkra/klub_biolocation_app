---
# Template for a new post. Added 2026-09-18.
#
# Updated 2026-10-13 (T158): a post is written in the admin panel now (/admin/posts/) and saved by the
# backend; copying this file into src/content/posts/ is only the input of the one-off content import
# (npm run import:content). The list of fields and the notes on headings below are still the reference for
# what a post may hold; where the panel's rules differ, server/src/content/ decides.
#
# How to use it: copy this file into src/content/posts/ and rename it. On the GitHub website,
# open that folder, choose "Add file" -> "Create new file" and paste the contents of this file
# there. The file name becomes the address of the post: "energy-fields.md" is published at
# /posts/energy-fields/. Use lower-case Latin letters, digits and hyphens in the file name, and
# do not name it after a year, like "2025.md": /posts/2025/ lists the posts of 2025. The
# post itself can be written in any language; the site's posts are in Russian. The step-by-step
# guide, and the other templates, are in CONTENT.md, section "Create a post".
#
# Every line that starts with "#" inside this block, between the two "---" lines, is a comment.
# Comments here are never published, so they can stay in the copy; delete them if they are in
# the way.
#
# Required fields:
#   title - the title of the post, shown above the text and in every list of posts.
#   date  - when the post was published, in the form below, with the time and "+03:00", the
#           time zone the site shows every date in. The lists of posts are sorted by it,
#           newest first, so it decides where the post appears. A post dated in the future
#           stays off the published site until that moment, and appears with the first build
#           after it - and a later hour of today counts as the future too. To publish at
#           once, use a time that has already passed. "npm run dev" shows the post at once.
#
# Images: put the file into public/images/, named after the post ("energy-fields-1.jpg"),
# and write ![what it shows](/images/energy-fields-1.jpg) on a line of its own. Details are
# in CONTENT.md, section "Images in a post".
#
# Optional fields:
#   description       - one sentence about the post, for search engines and link previews.
#   tags              - keywords; written in lower case on the site, and each gets its own page.
#   categories        - usually one, such as "education" or "blog".
#   draft             - true keeps the post off the published site while it is being written;
#                       it is still visible with "npm run dev". Set it to false to publish.
#   lastmod           - when the post was last changed, shown as "Last updated on". It does
#                       not change the order of the lists.
#   summary           - the text the Share button on the post uses when share_description and
#                       description are both empty. The lists of posts do not use it: they
#                       always show the beginning of the text.
#   share_title       - the title the Share button on the post uses, if it should differ
#                       from title.
#   share_description - the text the Share button on the post uses; without it, description.
#
# Headings and the table of contents:
#   - "## Heading" starts a section and "### Heading" a subsection. Both become entries in the
#     table of contents: the sidebar to the right of the article on a wide screen, and the
#     collapsible list at the top of the article on a narrow one. Subsections are listed under
#     their section.
#   - Do not use a single "#" heading in the text: the title of the post comes from the title
#     field above and is already the top heading of the page.
#   - Do not add anchors or ids to headings by hand. They are made from the heading text, and
#     Cyrillic is fine. Two headings with the same text in one post get "-1", "-2" added to the
#     second and third, and the table of contents follows that.
#   - Keep to "##" and "###". A "####" heading is listed too, but at the same level as "###".
#   - A post without any "##" heading simply has no table of contents. That is fine for a
#     short note.
title: "Post title"
description: "One sentence about the post."
date: "2026-09-18T12:00:00+03:00"
tags: ["first tag", "second tag"]
categories: ["education"]
draft: true
---

An opening paragraph: what the post is about and who it is for. Text before the first heading
is not listed in the table of contents. The lists of posts show the first 140 or so characters
of the text under the title, so this paragraph is what readers see there.

## First section

The text of the first section.

### A subsection

The text of a subsection. It is listed under "First section" in the table of contents.

## Second section

The text of the second section.
