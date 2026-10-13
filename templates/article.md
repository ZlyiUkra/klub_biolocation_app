---
# Template modelled on src/content/posts/article.md: a note in the "blog" category, with
# sections, subsections and the formatting a post can use - lists, a quote, a code block and a
# table. Added 2026-09-18.
#
# How to use it: copy this file into src/content/posts/ and rename it. On the GitHub website,
# open that folder, choose "Add file" -> "Create new file" and paste the contents of this file
# there. The file name becomes the address of the post: "first-meeting.md" is published at
# /posts/first-meeting/. Use lower-case Latin letters, digits and hyphens in the file name.
# The step-by-step guide is in CONTENT.md, section "Create a post".
#
# The full rules for every field and for headings are in templates/post.md. In short: title and
# date are required, and the lists of posts are sorted by date, newest first; "##" starts a
# section and "###" a subsection, and both become entries in the table of contents; draft: true
# keeps the post off the published site.
#
# Not rendered in a post yet, so leave them out for now: formulas between dollar signs, which
# appear as code, and callout blocks, which appear as raw text.
title: "Post title"
description: "One sentence about the post."
date: "2026-09-18T12:00:00+03:00"
tags: ["first tag", "second tag"]
categories: ["blog"]
draft: true
---

An opening paragraph: what the note is about. The lists of posts show the first 140 or so
characters of the text under the title, so this paragraph is what readers see there.

## First section

The text of the first section.

### A subsection

The text of a subsection. It is listed under "First section" in the table of contents.

### Another subsection

The text of another subsection.

## Formatting

### Lists and quotes

- A bulleted item.
- Another bulleted item.

1. A numbered step.
2. The next step.

> A quotation.

### Code

A code block is marked with three backticks and the name of the language:

```md
## A heading inside a code block is not a heading of the post
```

### Tables

| Column       | Another column |
| ------------ | -------------- |
| A value      | Another value  |
| A second row | Its value      |

## Closing section

The last words of the note.
