---
# Added 2026-09-28 at the owner's request: a paid video, to show the members-only mechanism end to
# end (PAID-VIDEO.md). It is a draft, so it exists in `npm run dev` only and never reaches the
# published site, where the access service does not exist yet. It carries no videoId, videoUrl or
# thumbnail - src/content/config.ts refuses them on a paid entry; the id is in the access
# service's VIDEOS map under this file's slug, `paid-demo` (locally the ignored file
# workers/video-access/videos.local.json). To publish a real paid lecture, follow PAID-VIDEO.md
# section 4 rather than removing `draft` here.
title: "Закрытая лекция: пример"
description: "Пример лекции, которую видят только участники клуба."
date: "2026-09-28"
draft: true
access: paid
tags: ["video"]
categories: ["обучающие видео"]
---

Этот текст видят все: и гости, и участники. Плеер над ним открывается только участнику клуба, которому администратор выдал доступ.
