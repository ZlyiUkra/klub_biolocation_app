---
# Added 2026-09-30 at the owner's request: the first paid lecture stored on Yandex Disk rather than
# YouTube, first in the Video list by its date (2026-09-29, the owner's choice; 2026-09-18 made it
# third). Like every paid entry it carries no address of the
# video - src/content/config.ts refuses one; the access service maps this file's slug,
# `lecture-part-3`, to the file's public link on Yandex Disk ({"yandexDisk": "..."} in its VIDEOS
# setting; locally the ignored workers/video-access/videos.local.json), and hands a member a
# short-lived direct address of the file (PAID-VIDEO.md, section 10, which also lists the limits of
# hosting a lecture this way). The file is a lecture of 1 h 58 min, 478 MB, MP4.
#
# The title, the description and the text of block 2 were written for the owner as placeholders;
# replace them with the lecture's own words. Block 2 is hidden, not secret, like the one in
# paid-demo-2.md: the part inside the div carrying data-members-only is shown only after the
# player, and it stays out of the card, the feed, the search index and the table of contents.
title: "Закрытая лекция: часть 3"
description: "Третья лекция клуба. Смотреть её могут участники, которым администратор открыл доступ."
date: "2026-09-29"
access: paid
tags: ["video"]
categories: ["обучающие видео"]
---

Эта лекция длится около двух часов. Её описание видят все: и гости, и участники. Само видео открывается только после входа на сайт и только тому, кому администратор выдал доступ.

<div data-members-only>

## Материалы к лекции

Этот блок видят только участники с доступом, и только после того, как появился плеер. Здесь будут конспект лекции, вопросы для самопроверки и упражнения к следующей встрече.

</div>
