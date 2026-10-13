---
# Added 2026-09-28 at the owner's request: a second paid video, hidden until the visitor is signed
# in and the administrator has granted access, like paid-demo.md. A draft for the same reason: the
# access service does not exist on the published site yet. No videoId, videoUrl or thumbnail -
# src/content/config.ts refuses them on a paid entry; the id is in the access service's VIDEOS map
# under this file's slug, `paid-demo-2` (locally the ignored file
# workers/video-access/videos.local.json, where it points at a public Blender Foundation film until
# the owner uploads the real lecture as Unlisted and puts its id there instead; PAID-VIDEO.md,
# section 3).
#
# Changed 2026-09-28 at the owner's request: no longer a draft. It is listed under Video like every
# other lecture, on the published site as well. There, until the access service is deployed
# (CLOUDFLARE.md, section 6) and VIDEOS carries this slug, a guest gets the sign-in box and a
# signed-in visitor "Видео сейчас недоступно"; the id is still in no file of the repository.
#
# Added 2026-09-28, the colleague's "block 2": the part of the text inside the div carrying
# data-members-only is shown only after the player (lib/video.ts has the rules). Hidden, not
# secret: this text and the picture in public/images/video/paid-demo-2/ are public files.
title: "Закрытая лекция: второй пример"
description: "Второй пример лекции, которую видят только участники клуба."
date: "2026-09-28"
access: paid
tags: ["video"]
categories: ["обучающие видео"]
---

Этот текст видят все: и гости, и участники. Видео над ним открывается только после входа на сайт и только тому, кому администратор выдал доступ.

<div data-members-only>

## Материалы к лекции

Этот блок видят только участники, которым администратор выдал доступ, и только после того, как появился плеер. Здесь могут быть пояснения к лекции, схемы и рисунки.

![Схема: вопрос, маятник, ответ](/images/video/paid-demo-2/diagram.svg)

</div>
