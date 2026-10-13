---
# Template modelled on src/content/posts/draft.md: a draft, with only the fields a post cannot
# do without - a title and a date - plus tags and draft: true. Added 2026-09-18.
#
# How to use it: copy this file into src/content/posts/ and rename it. On the GitHub website,
# open that folder, choose "Add file" -> "Create new file" and paste the contents of this file
# there. The file name becomes the address of the post: "next-meeting.md" is published at
# /posts/next-meeting/. Use lower-case Latin letters, digits and hyphens in the file name.
# The step-by-step guide is in CONTENT.md, section "Create a post".
#
# What draft: true does:
#   - "npm run dev" shows the draft like any other post: at its own address, in the list of
#     posts and on its tag pages;
#   - the published site leaves it out entirely: it has no page and is in no list, and a tag
#     that only drafts use gets no page either.
#
# To publish it: set date to the moment of publication, because the lists are sorted by it,
# newest first - a time that has already passed, since a later hour of today still counts as
# the future and keeps the post hidden; change draft to false; commit the change to the main
# branch.
#
# The full rules for every field and for headings are in templates/post.md.
title: "Draft title"
date: "2026-09-18T12:00:00+03:00"
tags: ["first tag"]
draft: true
---

What the post will be about, in a sentence or two.

## First section

Notes for the first section.

### A subsection

Notes for a subsection.

## Second section

Notes for the second section.

## Still to do

- What is missing.
- What has to be checked before publishing.
