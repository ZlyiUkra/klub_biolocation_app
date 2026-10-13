// The admin panel's strings in both interface languages, added 2026-10-12 at the owner's request
// (the interface in two languages; site.i18n in src/config.ts, the mechanism in src/i18n/lang.ts).
// The panel - /admin/posts/, /admin/users/, AdminNav.astro, AdminPager.astro and their scripts -
// was written in Russian; every Russian text that stood there is the ru half of an entry here, and
// the English half is new. A file of its own beside src/i18n/strings.ts, so that the public pages'
// scripts, which import that one, do not carry the panel's sentences.
//
// {name} marks a value the script fills in with format() from src/i18n/lang.ts. The names of the
// two panel pages are in strings.ts (admin_posts_title, admin_users_title), because the account page
// links to them too.
import type { Phrase } from "./lang";

export const adminUi = {
  // Shared by both pages (AdminNav.astro, AdminPager.astro, the two scripts).
  nav_label: { ru: "Панель управления", en: "Control panel" },
  saving: { ru: "Сохранение...", en: "Saving..." },

  // /admin/posts/ - the markup.
  posts_noscript: {
    ru: "Для работы с публикациями нужен включённый JavaScript.",
    en: "Working with posts needs JavaScript turned on.",
  },
  posts_new: { ru: "Новая публикация", en: "New post" },
  posts_pages: {
    ru: "Страницы списка публикаций",
    en: "Pages of the list of posts",
  },
  posts_edit: { ru: "Изменить", en: "Edit" },
  posts_copy: { ru: "Копировать", en: "Copy" },
  posts_delete: { ru: "Удалить", en: "Delete" },
  field_title: { ru: "Заголовок", en: "Title" },
  field_slug: {
    ru: "Адрес: латинские буквы, цифры и дефисы, например poisk-vody. После сохранения не меняется.",
    en: "Address: Latin letters, digits and hyphens, for example poisk-vody. It does not change after saving.",
  },
  field_date: {
    ru: "Дата публикации (время клуба, UTC+3). Запись с будущей датой появится на сайте в назначенное время.",
    en: "Publication date (the club's time, UTC+3). A post with a future date appears on the site at that time.",
  },
  field_description: { ru: "Краткое описание", en: "Short description" },
  field_tags: { ru: "Теги, через запятую", en: "Tags, separated by commas" },
  field_categories: {
    ru: "Категории, через запятую",
    en: "Categories, separated by commas",
  },
  field_draft: {
    ru: "Черновик: сохранить, но не показывать никому, кроме панели",
    en: "Draft: save, but show it to nobody except the panel",
  },
  field_body: {
    ru: "Текст в Markdown. HTML-теги не принимаются; код - в обратных кавычках.",
    en: "The text in Markdown. HTML tags are not accepted; code goes in backticks.",
  },
  posts_save: { ru: "Сохранить", en: "Save" },
  posts_cancel: { ru: "Отмена", en: "Cancel" },

  // /admin/posts/ - the script (admin-posts.ts). The service's problem codes first.
  problem_required: { ru: "Заполните это поле.", en: "Fill in this field." },
  problem_too_long: { ru: "Слишком длинно.", en: "Too long." },
  problem_too_many: { ru: "Слишком много.", en: "Too many." },
  problem_format: {
    ru: "Не подходит по форме: смотрите подсказку над полем.",
    en: "Does not fit the format: see the hint above the field.",
  },
  problem_reserved: {
    ru: "Такой адрес занят страницами сайта: выберите другой.",
    en: "This address is taken by the site's own pages: choose another.",
  },
  problem_line_break: {
    ru: "Здесь не может быть переносов строк.",
    en: "Line breaks are not allowed here.",
  },
  problem_duplicate: { ru: "Есть повторы.", en: "There are repeats." },
  problem_html: {
    ru: "В тексте есть HTML-тег. Уберите его или поставьте в обратные кавычки как код.",
    en: "The text has an HTML tag. Remove it or put it in backticks as code.",
  },
  problem_link: {
    ru: "Ссылка ведёт не на страницу и не на почту. Разрешены адреса http(s), mailto и пути на сайте.",
    en: "The link leads neither to a page nor to an email. Allowed are http(s) and mailto addresses and paths on the site.",
  },
  problem_type: { ru: "Неверное значение.", en: "Wrong value." },
  problem_unknown: { ru: "Неизвестное поле.", en: "Unknown field." },
  posts_no_rights: {
    ru: "У этой учётной записи нет прав на публикации.",
    en: "This account has no rights to publish.",
  },
  post_exists: {
    ru: "Публикация с таким адресом уже есть.",
    en: "A post with this address already exists.",
  },
  post_conflict: {
    ru: "Публикацию изменили или удалили с тех пор, как вы её открыли. Ничего не записано: скопируйте свой текст, обновите страницу и откройте публикацию заново.",
    en: "The post was changed or deleted since you opened it. Nothing was written: copy your text, reload the page and open the post again.",
  },
  post_not_found: {
    ru: "Такой публикации нет: её удалили?",
    en: "There is no such post: was it deleted?",
  },
  post_too_large: {
    ru: "Текст слишком большой.",
    en: "The text is too large.",
  },
  posts_unavailable: {
    ru: "Сервис публикаций недоступен. Попробуйте позже.",
    en: "The publishing service is unavailable. Please try later.",
  },
  posts_count: { ru: "Публикаций: {n}.", en: "Posts: {n}." },
  state_draft: { ru: "черновик", en: "draft" },
  state_live: { ru: "на сайте", en: "on the site" },
  state_scheduled: { ru: "запланирована", en: "scheduled" },
  post_loading: { ru: "Загрузка публикации...", en: "Loading the post..." },
  form_edit: { ru: "Изменить публикацию", en: "Edit the post" },
  form_copy: {
    ru: "Новая публикация: копия «{title}»",
    en: "New post: a copy of '{title}'",
  },
  fix_marked: {
    ru: "Исправьте отмеченные поля.",
    en: "Correct the marked fields.",
  },
  slug_taken: {
    ru: "Адрес «{slug}» уже занят другой публикацией. Предложен свободный «{next}»: проверьте его и сохраните ещё раз.",
    en: "The address '{slug}' is taken by another post. A free one is proposed, '{next}': check it and save again.",
  },
  saved_draft: {
    ru: "Сохранено как черновик: на сайте не показывается.",
    en: "Saved as a draft: not shown on the site.",
  },
  saved_future: {
    ru: "Сохранено. Публикация появится на сайте в назначенное время.",
    en: "Saved. The post will appear on the site at its date.",
  },
  confirm_delete: {
    ru: "Удалить публикацию «{title}»? Она исчезнет с сайта, но останется в списке удалённых, и её можно будет восстановить.",
    en: "Delete the post '{title}'? It leaves the site but stays in the list of deleted posts, from where it can be restored.",
  },
  deleting: { ru: "Удаление...", en: "Deleting..." },
  deleted: {
    ru: "Публикация удалена: её можно восстановить из списка удалённых.",
    en: "The post is deleted: it can be restored from the list of deleted posts.",
  },
  // Added 2026-10-12 (T099): the rewritten page - the audience, the named people, the preview, the deleted ones.
  posts_search: { ru: "Заголовок или адрес", en: "Title or address" },
  posts_find: { ru: "Найти", en: "Find" },
  posts_show_deleted: { ru: "Показать удалённые", en: "Show deleted" },
  posts_restore: { ru: "Восстановить", en: "Restore" },
  posts_none: { ru: "Публикаций не найдено.", en: "No posts found." },
  posts_shown: {
    ru: "Показано {from}-{to} из {total}.",
    en: "Showing {from}-{to} of {total}.",
  },
  posts_session_ended: {
    ru: "Не удалось открыть список: сессия закончилась или нет прав. Обновите страницу или войдите заново.",
    en: "The list could not be opened: the session ended or you have no rights. Reload the page or sign in again.",
  },
  state_deleted: { ru: "удалена", en: "deleted" },
  state_members: { ru: "для участников", en: "members only" },
  state_restricted: { ru: "для избранных", en: "restricted" },
  field_audience: { ru: "Кто видит публикацию", en: "Who sees the post" },
  audience_everyone: { ru: "Все посетители", en: "Every visitor" },
  audience_members: {
    ru: "Все вошедшие участники",
    en: "Every signed-in member",
  },
  audience_restricted: {
    ru: "Только выбранные (отметьте ниже, кому)",
    en: "Only the chosen (tick below who)",
  },
  field_statuses: {
    ru: "Статусы, которым открыта публикация. Статус участнику выдают мэтр или администратор на странице «Пользователи».",
    en: "Statuses the post is open to. A member's status is given by a maitre or an administrator on the Users page.",
  },
  choose_who: {
    ru: "Кому открыта публикация. Этот блок действует, когда выше выбрано «Только выбранные»; иначе он серый.",
    en: "Who the post is open to. This block works when 'Only the chosen' is selected above; otherwise it is greyed out.",
  },
  field_user_ids: {
    ru: "Отдельные люди: номера учётных записей через запятую. Найдите человека ниже, и номер подставится сам.",
    en: "Named people: account numbers separated by commas. Find the person below and the number is filled in.",
  },
  user_find: { ru: "Найти человека", en: "Find a person" },
  user_pick: { ru: "Добавить", en: "Add" },
  user_none: { ru: "Никого не найдено.", en: "Nobody found." },
  field_teaser: {
    ru: "Показывать тем, кому публикация закрыта, карточку и начало текста",
    en: "Show the card and the start of the text to those the post is closed to",
  },
  posts_preview: { ru: "Предпросмотр", en: "Preview" },
  preview_title: {
    ru: "Так публикация выглядит на сайте",
    en: "This is how the post looks on the site",
  },
  preview_failed: {
    ru: "Предпросмотр недоступен. Попробуйте позже.",
    en: "The preview is unavailable. Please try later.",
  },
  saved_live: {
    ru: "Готово: публикация сохранена и уже на сайте.",
    en: "Done: the post is saved and already on the site.",
  },
  saved_hidden_to_some: {
    ru: "Готово: публикация сохранена; её видят только те, кому она открыта.",
    en: "Done: the post is saved; only those it is open to can see it.",
  },
  // Added 2026-10-12 (T099, the owner's remark): examples in the empty fields, and a short explanation of the audience.
  ph_title: {
    ru: "Например: Как найти воду лозой",
    en: "For example: How to find water with a dowsing rod",
  },
  ph_slug: { ru: "poisk-vody", en: "poisk-vody" },
  ph_description: {
    ru: "Одно-два предложения: они видны на карточке в списке",
    en: "One or two sentences: they show on the card in the list",
  },
  ph_tags: { ru: "лоза, вода, практика", en: "rod, water, practice" },
  ph_categories: { ru: "статьи, практика", en: "articles, practice" },
  ph_body: {
    ru: "Начните писать здесь. Заголовок: ## Раздел. Выделение: *курсив* и **жирный**. Ссылка: [текст](https://адрес).",
    en: "Start writing here. Heading: ## Section. Emphasis: *italic* and **bold**. Link: [text](https://address).",
  },
  ph_user_ids: { ru: "Например: 12, 47", en: "For example: 12, 47" },
  audience_help: {
    ru: "«Все посетители»: запись видна всем, даже без входа в аккаунт. «Все вошедшие участники»: любому, кто вошёл в аккаунт, кроме заблокированных. «Только выбранные»: участникам с одним из отмеченных статусов и названным людям. Если включить показ превью, остальные видят карточку и начало текста. Мэтры и администраторы читают любую запись здесь, в панели, а на сайте видят её по тем же правилам, что и все. Черновик и запись с будущей датой на сайте не видит никто.",
    en: "'Every visitor': anyone can read the post, even without signing in. 'Every signed-in member': anyone who is signed in, except blocked accounts. 'Only the chosen': members with one of the ticked statuses and the named people. With the teaser on, everyone else sees the card and the start of the text. Maitres and administrators read any post here, in the panel, and on the site by the same rules as everybody. A draft and a post with a future date are seen on the site by nobody.",
  },
  // Added 2026-10-12 (T175): the videos page of the panel.
  videos_noscript: {
    ru: "Для работы с видео нужен включённый JavaScript.",
    en: "Working with videos needs JavaScript turned on.",
  },
  videos_new: { ru: "Новое видео", en: "New video" },
  videos_pages: {
    ru: "Страницы списка видео",
    en: "Pages of the list of videos",
  },
  videos_none: { ru: "Видео не найдено.", en: "No videos found." },
  videos_edit_title: { ru: "Изменить видео", en: "Edit the video" },
  state_paid: { ru: "платное", en: "paid" },
  field_paid: {
    ru: "Платная лекция: плеер открывается только участникам с доступом к лекциям (статус студент, эксперт, мастер, мэтр или администратор).",
    en: "A paid lecture: the player opens only for members with access to lectures (status student, expert, master, maitre or administrator).",
  },
  field_available_until: {
    ru: "Доступно до (дата включительно, ГГГГ-ММ-ДД). Пусто: без ограничения.",
    en: "Available until (a date, inclusive, YYYY-MM-DD). Empty: no limit.",
  },
  field_members_only: {
    ru: "Текст только для участников: появляется вместе с плеером. Бывает только в платной лекции.",
    en: "Text for members only: it appears with the player. Only a paid lecture has it.",
  },
  field_video_body: {
    ru: "Текст под плеером, в Markdown. HTML-теги не принимаются. В платной лекции здесь нельзя давать адреса YouTube и Яндекс.Диска.",
    en: "The text under the player, in Markdown. HTML tags are not accepted. A paid lecture's text must not carry YouTube or Yandex Disk addresses.",
  },
  ph_members_only: {
    ru: "Например: Материалы к занятию и ссылка на чат.",
    en: "For example: Materials for the lesson and a link to the chat.",
  },
  source_heading: { ru: "Источник видео", en: "Where the video comes from" },
  source_none: { ru: "Источника пока нет.", en: "There is no source yet." },
  // Added 2026-10-12 (T175): the source in a row of the list, and the note after a copy.
  list_source_file: { ru: "файл на сервере", en: "file on the server" },
  list_source_none: { ru: "без источника", en: "no source" },
  video_copied: {
    ru: "Копия создана как черновик, с тем же источником. Проверьте её и опубликуйте.",
    en: "The copy is made as a draft with the same source. Check it and publish it.",
  },
  source_file: {
    ru: "Файл на сервере, {size}.",
    en: "A file on the server, {size}.",
  },
  source_link: {
    ru: "Ссылка: {provider} (задана, повторно не показывается).",
    en: "A link: {provider} (set, not shown again).",
  },
  source_link_public: {
    ru: "Ссылка: {provider}, {reference}.",
    en: "A link: {provider}, {reference}.",
  },
  source_provider: { ru: "Где лежит видео", en: "Where the video is" },
  source_reference: {
    ru: "Идентификатор видео или его адрес",
    en: "The video's identifier or address",
  },
  ph_reference: { ru: "Например: dQw4w9WgXcQ", en: "For example: dQw4w9WgXcQ" },
  // Added 2026-10-12 (T143): pictures for the text of a post or of a lecture.
  img_heading: { ru: "Картинки", en: "Pictures" },
  img_help: {
    ru: "Загрузите картинку (PNG, JPEG, WebP или GIF, до {limit}) и вставьте её в текст там, где стоит курсор, либо вставьте адрес картинки из интернета. Загруженные картинки остаются на сайте и в списке ниже.",
    en: "Upload a picture (PNG, JPEG, WebP or GIF, up to {limit}) and put it into the text where the cursor is, or paste the address of a picture from the internet. Uploaded pictures stay on the site and in the list below.",
  },
  img_file: { ru: "Файл картинки", en: "Picture file" },
  img_upload: { ru: "Загрузить картинку", en: "Upload the picture" },
  img_pick: { ru: "Выберите файл картинки.", en: "Choose a picture file." },
  img_uploading: { ru: "Загрузка: {percent}%", en: "Uploading: {percent}%" },
  img_done: {
    ru: "Картинка загружена и вставлена в текст.",
    en: "The picture is uploaded and put into the text.",
  },
  img_existing: {
    ru: "Такая картинка уже есть на сайте; вставлена она же.",
    en: "This picture is already on the site; the same one is inserted.",
  },
  img_not_image: {
    ru: "Это не картинка PNG, JPEG, WebP или GIF (SVG не принимается).",
    en: "This is not a PNG, JPEG, WebP or GIF picture (SVG is not accepted).",
  },
  img_too_big: {
    ru: "Файл {size} больше предела в {limit}.",
    en: "The file of {size} is over the limit of {limit}.",
  },
  img_no_space: {
    ru: "На сервере не хватает места для этой картинки.",
    en: "The server has not enough room for this picture.",
  },
  img_url_label: {
    ru: "Или адрес картинки в интернете",
    en: "Or the address of a picture on the internet",
  },
  img_url_ph: {
    ru: "https://example.com/picture.jpg",
    en: "https://example.com/picture.jpg",
  },
  img_url_insert: { ru: "Вставить по адресу", en: "Insert by address" },
  img_url_help: {
    ru: "Такая картинка остаётся на чужом сайте: если её там удалят, в тексте она пропадёт. Надёжнее загрузить файл.",
    en: "Such a picture stays on the other site: if it is removed there, it disappears from the text. Uploading the file is safer.",
  },
  img_url_bad: {
    ru: "Нужен адрес, который начинается с https://",
    en: "The address must start with https://",
  },
  img_list: { ru: "Загруженные картинки", en: "Uploaded pictures" },
  img_none: {
    ru: "Пока нет загруженных картинок.",
    en: "No pictures uploaded yet.",
  },
  img_insert: { ru: "Вставить в текст", en: "Put into the text" },
  img_copy: { ru: "Копировать адрес", en: "Copy the address" },
  img_copied: { ru: "Адрес скопирован.", en: "The address is copied." },
  img_more: { ru: "Показать ещё", en: "Show more" },
  // Added 2026-10-12 (T175): what to paste, per host - the example in the field and one line on where to get it.
  provider_ok: { ru: "Одноклассники", en: "Odnoklassniki" },
  problem_reference_shape: {
    ru: "Это не похоже на адрес или код видео выбранного хоста. Посмотрите подсказку под полем.",
    en: "This does not look like an address or id of a video on the chosen host. See the hint under the field.",
  },
  ph_ref_youtube: {
    ru: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    en: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  },
  help_youtube: {
    ru: "Откройте видео на YouTube и скопируйте адрес из строки браузера (или «Поделиться» - «Копировать ссылку»). Подойдёт и адрес, и 11-значный код.",
    en: "Open the video on YouTube and copy the address from the browser bar (or Share - Copy link). The address or the 11-character id both work.",
  },
  ph_ref_vk: {
    ru: "https://vk.com/video-12345_67890 или код вставки",
    en: "https://vk.com/video-12345_67890 or the embed code",
  },
  help_vk: {
    ru: "В VK Видео откройте видео и скопируйте адрес страницы. Для закрытого или «по ссылке» видео: «Поделиться» - «Экспортировать» и вставьте код вставки целиком, в нём есть нужный hash.",
    en: "On VK Video open the video and copy the page address. For a private or link-only video: Share - Export, and paste the whole embed code, which carries the hash that is needed.",
  },
  ph_ref_rutube: {
    ru: "https://rutube.ru/video/0123456789abcdef0123456789abcdef/",
    en: "https://rutube.ru/video/0123456789abcdef0123456789abcdef/",
  },
  help_rutube: {
    ru: "На Rutube откройте видео и скопируйте адрес страницы. Для закрытого видео адрес содержит ключ «?p=...»: копируйте его целиком.",
    en: "On Rutube open the video and copy the page address. A private video's address has a key '?p=...': copy it whole.",
  },
  ph_ref_vimeo: {
    ru: "https://vimeo.com/123456789",
    en: "https://vimeo.com/123456789",
  },
  help_vimeo: {
    ru: "Адрес страницы видео на vimeo.com. Для видео «по ссылке» нужен полный адрес с кодом после номера (vimeo.com/123456789/abcdef1234) или код вставки.",
    en: "The video's page address on vimeo.com. An unlisted video needs the full address with the code after the number (vimeo.com/123456789/abcdef1234) or the embed code.",
  },
  ph_ref_ok: {
    ru: "https://ok.ru/video/9876543210",
    en: "https://ok.ru/video/9876543210",
  },
  help_ok: {
    ru: "Адрес страницы видео на ok.ru (ok.ru/video/номер). Видео должно открываться без входа в Одноклассники.",
    en: "The video's page address on ok.ru (ok.ru/video/number). The video must open without signing in to Odnoklassniki.",
  },
  ph_ref_yandex_disk: {
    ru: "https://disk.yandex.ru/i/AbCdEfGh",
    en: "https://disk.yandex.ru/i/AbCdEfGh",
  },
  help_yandex_disk: {
    ru: "На Яндекс.Диске: файл - «Поделиться» - «Доступ по ссылке» - скопируйте ссылку вида disk.yandex.ru/i/... Ссылка на папку не подходит, нужен один файл MP4.",
    en: "On Yandex Disk: the file - Share - Access by link - copy the link of the form disk.yandex.ru/i/... A folder link does not work: it must be one MP4 file.",
  },
  source_set: { ru: "Задать ссылку", en: "Set the link" },
  source_set_hint: {
    ru: "Бесплатному видео ссылка нужна сразу. Платной лекции её можно задать позже или загрузить файл.",
    en: "A free video needs its link at once. A paid lecture may get it later, or a file.",
  },
  source_secret_note: {
    ru: "Ссылку платной лекции видите только вы, в этой форме: в списках, на страницах и в ответах для посетителей её нет. Чтобы изменить, поправьте поле и нажмите «Задать ссылку».",
    en: "Only you see a paid lecture's link, in this form: it is in no list, page or visitor answer. To change it, edit the field and press 'Set the link'.",
  },
  source_after_save: {
    ru: "Файл можно загрузить и ссылку заменить после первого сохранения видео.",
    en: "A file can be uploaded and the link replaced after the video is first saved.",
  },
  source_link_set: { ru: "Ссылка задана.", en: "The link is set." },
  source_needs_reference: {
    ru: "Укажите идентификатор или адрес видео.",
    en: "Enter the video's identifier or address.",
  },
  provider_youtube: { ru: "YouTube", en: "YouTube" },
  provider_vk: { ru: "VK", en: "VK" },
  provider_rutube: { ru: "Rutube", en: "Rutube" },
  provider_yandex_disk: { ru: "Яндекс.Диск", en: "Yandex Disk" },
  provider_vimeo: { ru: "Vimeo", en: "Vimeo" },
  file_heading: { ru: "Файл на сервере", en: "A file on the server" },
  file_help: {
    ru: "MP4, индекс в начале файла (faststart): иначе видео не начнёт играть, пока не загрузится целиком. Сервер проверит это сам.",
    en: "MP4 with its index at the start (faststart): otherwise the video cannot play before it is fully downloaded. The server checks it.",
  },
  file_upload: { ru: "Загрузить файл", en: "Upload the file" },
  file_pick: { ru: "Выберите файл MP4.", en: "Choose an MP4 file." },
  file_space: {
    ru: "Свободно на сервере: {free}. Можно загрузить файл до {room}.",
    en: "Free on the server: {free}. A file of up to {room} can be uploaded.",
  },
  file_no_room: {
    ru: "На сервере сейчас нет места для нового файла (свободно {free}, резерв {reserve}).",
    en: "There is no room on the server for a new file now (free {free}, reserve {reserve}).",
  },
  file_too_big_here: {
    ru: "Файл больше допустимого ({size} при допустимых {room}).",
    en: "The file is larger than allowed ({size} against {room}).",
  },
  file_uploading: { ru: "Загрузка: {percent}%", en: "Uploading: {percent}%" },
  file_done: {
    ru: "Файл загружен и проверен.",
    en: "The file is uploaded and checked.",
  },
  file_over_cap: {
    ru: "Файл больше лимита сервера ({limit}).",
    en: "The file is larger than the server's limit ({limit}).",
  },
  file_no_space: {
    ru: "На сервере не хватает свободного места для этого файла: часть диска сервер держит в резерве.",
    en: "There is not enough free space on the server for this file: part of the disk is kept in reserve.",
  },
  file_not_faststart: {
    ru: "Индекс файла стоит после самого видео, поэтому он не начнёт играть до полной загрузки. Исправьте файл командой: ffmpeg -i вход.mp4 -c copy -movflags +faststart выход.mp4",
    en: "The file's index is after the video itself, so it cannot play before it is fully downloaded. Repair it with: ffmpeg -i in.mp4 -c copy -movflags +faststart out.mp4",
  },
  file_not_mp4: {
    ru: "Это не файл MP4 или он повреждён.",
    en: "This is not an MP4 file, or it is damaged.",
  },
  confirm_replace_with_file: {
    ru: "У этого видео уже есть источник (файл или ссылка). Заменить его новым файлом? Старая ссылка будет удалена, и платную ссылку потом придётся вводить заново; старый файл останется на диске сервера, но видео перестанет его использовать.",
    en: "This video already has a source (a file or a link). Replace it with the new file? The old link is deleted, and a paid link would have to be entered again; the old file stays on the server's disk, but the video stops using it.",
  },
  confirm_replace_with_link: {
    ru: "У этого видео уже есть файл на сервере. Заменить его ссылкой? Файл останется на диске сервера, но видео перестанет его использовать.",
    en: "This video already has a file on the server. Replace it with the link? The file stays on the server's disk, but the video stops using it.",
  },
  problem_youtube_in_paid: {
    ru: "В тексте платной лекции есть адрес YouTube: он откроет лекцию всем. Уберите его.",
    en: "A paid lecture's text has a YouTube address: it would open the lecture to everyone. Remove it.",
  },
  problem_yandex_in_paid: {
    ru: "В тексте платной лекции есть адрес Яндекс.Диска: он откроет лекцию всем. Уберите его.",
    en: "A paid lecture's text has a Yandex Disk address: it would open the lecture to everyone. Remove it.",
  },
  problem_block_in_public: {
    ru: "Текст только для участников бывает только в платной лекции.",
    en: "Text for members only belongs only in a paid lecture.",
  },
  confirm_delete_video: {
    ru: "Удалить видео «{title}»? Оно исчезнет с сайта, но останется в списке удалённых, и его можно будет восстановить.",
    en: "Delete the video '{title}'? It leaves the site but stays in the list of deleted ones, from where it can be restored.",
  },
  deleted_video: {
    ru: "Видео удалено: его можно восстановить из списка удалённых.",
    en: "The video is deleted: it can be restored from the list of deleted ones.",
  },
  restored_video: { ru: "Видео восстановлено.", en: "The video is restored." },
  video_saved_live: {
    ru: "Готово: видео сохранено и уже на сайте.",
    en: "Done: the video is saved and already on the site.",
  },
  restoring: { ru: "Восстановление...", en: "Restoring..." },
  restored: {
    ru: "Публикация восстановлена.",
    en: "The post is restored.",
  },

  // /admin/users/ - the markup.
  users_noscript: {
    ru: "Для работы со статусами нужен включённый JavaScript.",
    en: "Working with statuses needs JavaScript turned on.",
  },
  users_forbidden: {
    ru: "Статусы назначают мэтр и администратор.",
    en: "Statuses are given by a maitre and an administrator.",
  },
  users_query: { ru: "Имя или адрес почты", en: "Name or email" },
  users_find: { ru: "Найти", en: "Find" },
  users_pages: {
    ru: "Страницы списка пользователей",
    en: "Pages of the list of users",
  },
  users_apply: { ru: "Применить", en: "Apply" },
  users_footnote: {
    ru: "Новый статус действует с ближайшего запроса участника. Публикации:",
    en: "A new status takes effect with the member's next request. Posts:",
  },

  // /admin/users/ - the script (admin-users.ts).
  users_not_connected: {
    ru: "Сервис статусов ещё не подключён (site.admin.statusesEndpoint, ADMIN.md).",
    en: "The status service is not connected yet (site.admin.statusesEndpoint, ADMIN.md).",
  },
  refusal_self: {
    ru: "Свой статус менять нельзя.",
    en: "You cannot change your own status.",
  },
  refusal_protected: {
    ru: "Эта учётная запись защищена: её роль меняется только передачей.",
    en: "This account is protected: its role changes only by a hand-over.",
  },
  refusal_rank: {
    ru: "Мэтр не может менять статус мэтра или администратора и снимать блокировку, поставленную администратором.",
    en: "A maitre cannot change the status of a maitre or an administrator, nor lift a block an administrator set.",
  },
  refusal_not_found: {
    ru: "Такого пользователя нет.",
    en: "There is no such user.",
  },
  refusal_guest: {
    ru: "Статус «гость» не назначается: его получает только новая учётная запись.",
    en: "The status 'guest' is not given: only a new account gets it.",
  },
  users_loading: { ru: "Загрузка...", en: "Loading..." },
  users_unavailable: {
    ru: "Сервер недоступен. Попробуйте позже.",
    en: "The server is unavailable. Please try later.",
  },
  users_none: { ru: "Никого не найдено.", en: "Nobody found." },
  users_shown: {
    ru: "Показаны {from}-{to} из {total}.",
    en: "Showing {from}-{to} of {total}.",
  },
  note_self: { ru: "Это вы.", en: "This is you." },
  note_protected: { ru: "Суперпользователь.", en: "Superuser." },
  note_blocked_by_admin: {
    ru: "Заблокирован администратором.",
    en: "Blocked by an administrator.",
  },
  note_blocked_by_metr: {
    ru: "Заблокирован мэтром.",
    en: "Blocked by a maitre.",
  },
  no_name: { ru: "Без имени", en: "No name" },
  registered: { ru: "Регистрация: {date}", en: "Registered: {date}" },
  confirm_block: {
    ru: "Закрыть {who} доступ к материалам сайта?",
    en: "Close the site's materials to {who}?",
  },
  confirm_panel: {
    ru: "Дать {who} статус «{status}»? Он сможет менять публикации и статусы других.",
    en: "Give {who} the status '{status}'? They will be able to change posts and other members' statuses.",
  },
  confirm_status: {
    ru: "Дать {who} статус «{status}»?",
    en: "Give {who} the status '{status}'?",
  },
  status_set: {
    ru: "Статус {who}: «{status}».",
    en: "Status of {who}: '{status}'.",
  },
  // Added 2026-10-12 (T178): the users page as it is now (temporary passwords, the lecture date, the session note).
  users_no_rights: {
    ru: "У вас нет прав на это действие.",
    en: "You have no right to do this.",
  },
  users_session_ended: {
    ru: "Не удалось открыть список: сессия закончилась или нет прав. Обновите страницу или войдите заново.",
    en: "The list could not be opened: the session ended or you have no rights. Reload the page or sign in again.",
  },
  users_gone: {
    ru: "Такого пользователя нет или сессия закончилась. Обновите страницу.",
    en: "There is no such user, or the session ended. Reload the page.",
  },
  users_must_change: {
    ru: "Должен сменить пароль при входе.",
    en: "Has to change the password at the next sign-in.",
  },
  users_access_not_open: {
    ru: "Доступ к лекциям: не открыт.",
    en: "Access to the lectures: not open.",
  },
  users_date_removed: {
    ru: "Дата доступа {who} снята.",
    en: "The access date of {who} was removed.",
  },
  users_date_set: {
    ru: "Доступ {who} к лекциям до {day}.",
    en: "{who} has access to the lectures until {day}.",
  },
  users_date_incomplete: {
    ru: "Укажите дату целиком: число, месяц, год.",
    en: "Enter the whole date: day, month, year.",
  },
  users_issue_confirm: {
    ru: "Выдать {who} временный пароль? Старый пароль перестанет работать, а все входы этого участника будут закрыты.",
    en: "Give {who} a temporary password? The old password stops working and every sign-in of this member is ended.",
  },
  users_issuing: {
    ru: "Выдаётся временный пароль...",
    en: "Issuing a temporary password...",
  },
  users_temp_until: { ru: "Действует до {date}.", en: "Valid until {date}." },
  users_temp_copied: {
    ru: "Пароль скопирован.",
    en: "The password was copied.",
  },
  users_temp_copy_failed: {
    ru: "Скопируйте пароль вручную.",
    en: "Copy the password by hand.",
  },
  users_temp_issued: {
    ru: "Временный пароль для {who} выдан. Он показан один раз: передайте его участнику.",
    en: "A temporary password for {who} was issued. It is shown once: pass it to the member.",
  },
  users_temp_button: { ru: "Временный пароль", en: "Temporary password" },
  users_access_label: {
    ru: "Доступ к лекциям до",
    en: "Access to the lectures until",
  },
  users_save_date: { ru: "Сохранить дату", en: "Save the date" },
  users_temp_shown: {
    ru: "Временный пароль (показан один раз):",
    en: "Temporary password (shown once):",
  },

  // /admin/feedback/ (T107, 2026-10-13): the markup and the script (admin-feedback.ts). The messages are visitors' text
  // and are shown as typed, never translated; only the labels around them are phrases.
  feedback_noscript: {
    ru: "Для просмотра обращений нужен включённый JavaScript.",
    en: "Reading the messages needs JavaScript turned on.",
  },
  feedback_forbidden: {
    ru: "Обращения видят мэтр и администратор.",
    en: "The messages are read by a maitre and an administrator.",
  },
  feedback_pages: {
    ru: "Страницы списка обращений",
    en: "Pages of the list of messages",
  },
  feedback_none: { ru: "Обращений пока нет.", en: "No messages yet." },
  // Added 2026-10-13 (the owner's order after T107): the search of the list, the words of the posts' search and count.
  feedback_search: {
    ru: "Текст, имя или контакт",
    en: "Text, name or contact",
  },
  feedback_find: { ru: "Найти", en: "Find" },
  feedback_none_found: { ru: "Ничего не найдено.", en: "Nothing found." },
  feedback_found: {
    ru: "Найдено: {total}. Показаны {from}-{to}, новые сверху.",
    en: "Found: {total}. Showing {from}-{to}, newest first.",
  },
  feedback_shown: {
    ru: "Показаны {from}-{to} из {total}, новые сверху.",
    en: "Showing {from}-{to} of {total}, newest first.",
  },
  feedback_unavailable: {
    ru: "Сервер недоступен. Попробуйте позже.",
    en: "The server is unavailable. Please try later.",
  },
  feedback_session_ended: {
    ru: "Не удалось открыть список: сессия закончилась или нет прав. Обновите страницу или войдите заново.",
    en: "The list could not be opened: the session ended or you have no rights. Reload the page or sign in again.",
  },
  feedback_no_name: { ru: "Без имени", en: "No name" },
  feedback_no_contact: { ru: "Контакт не указан", en: "No contact given" },
  feedback_topic_signin_problem: {
    ru: "Не получается войти",
    en: "Cannot sign in",
  },
  feedback_received: { ru: "Получено: {date}", en: "Received: {date}" },
  feedback_network: { ru: "Сеть: {prefix}", en: "Network: {prefix}" },
  feedback_mail_sent: {
    ru: "Письмо отправлено: {date}",
    en: "Mail sent: {date}",
  },
  feedback_mail_waiting: {
    ru: "Письмо ещё не отправлено",
    en: "Mail not sent yet",
  },
  feedback_mail_failed: {
    ru: "Письмо не ушло: {error}",
    en: "Mail failed: {error}",
  },
  feedback_footnote: {
    ru: "Письмо клубу уходит отдельной очередью: обращение сохраняется сразу, даже если почта недоступна.",
    en: "The mail to the club goes through a queue of its own: a message is saved at once, even when the mail is down.",
  },

  // /admin/settings/ (T110, 2026-10-13): the markup and the script (admin-settings.ts). The superuser's page: the
  // address the feedback form's messages are mailed to (changed with a code mailed to the new address) and the switch of
  // the members-only block. The sentences about a wrong password and the pause are the account forms' own (ui.form_*).
  settings_noscript: {
    ru: "Для работы с настройками нужен включённый JavaScript.",
    en: "The settings need JavaScript turned on.",
  },
  settings_unavailable: {
    ru: "Сервер недоступен. Попробуйте позже.",
    en: "The server is unavailable. Please try later.",
  },
  settings_session_ended: {
    ru: "Не удалось открыть настройки: сессия закончилась или нет прав. Обновите страницу или войдите заново.",
    en: "The settings could not be opened: the session ended or you have no rights. Reload the page or sign in again.",
  },
  settings_recipient_title: {
    ru: "Адрес для сообщений формы",
    en: "Address for the form's messages",
  },
  settings_recipient_now: {
    ru: "Сообщения формы обратной связи отправляются на адрес: {address}",
    en: "The messages of the feedback form are mailed to: {address}",
  },
  settings_recipient_none: {
    ru: "Адрес не задан. Сообщения сохраняются и видны в панели, но письма не отправляются.",
    en: "No address is set. Messages are stored and shown in the panel, but no mail is sent.",
  },
  settings_recipient_new: { ru: "Новый адрес", en: "New address" },
  settings_recipient_send: { ru: "Отправить код", en: "Send a code" },
  settings_recipient_hint: {
    ru: "На новый адрес придёт код из восьми цифр, а прежний адрес получит предупреждение. Пока код не введён, письма идут на прежний адрес.",
    en: "A code of eight digits is mailed to the new address and the old address is warned. Until the code is entered, mail keeps going to the old address.",
  },
  settings_pending: {
    ru: "Код отправлен на {address} и действует до {time}. Введите его ниже.",
    en: "A code was sent to {address} and is valid until {time}. Enter it below.",
  },
  settings_code_label: {
    ru: "Код из письма (8 цифр)",
    en: "Code from the mail (8 digits)",
  },
  settings_code_confirm: { ru: "Подтвердить", en: "Confirm" },
  settings_code_asked: {
    ru: "Код отправлен. Он действует 30 минут.",
    en: "The code was sent. It is valid for 30 minutes.",
  },
  settings_code_wrong: {
    ru: "Код не подошёл.",
    en: "That code is not right.",
  },
  settings_code_void: {
    ru: "Попытки закончились, запрос отменён. Запросите новый код.",
    en: "No tries are left and the request is void. Ask for a new code.",
  },
  settings_code_none: {
    ru: "Нет запроса, который ждёт код (возможно, он истёк). Запросите код заново.",
    en: "No request is waiting for a code (it may have expired). Ask for a code again.",
  },
  settings_code_shape: {
    ru: "Код состоит из восьми цифр.",
    en: "The code is eight digits.",
  },
  settings_recipient_changed: {
    ru: "Адрес изменён. Прежний адрес получил уведомление.",
    en: "The address was changed. The old address was told.",
  },
  settings_address_bad: {
    ru: "Нужен один адрес электронной почты: без имени, без списка, без пробелов.",
    en: "One mail address is needed: no name, no list, no spaces.",
  },
  settings_address_same: {
    ru: "Этот адрес уже стоит.",
    en: "That address is already the recipient.",
  },
  settings_password_wrong: {
    ru: "Пароль не подошёл.",
    en: "The password is not right.",
  },
  settings_password_missing: {
    ru: "Введите свой пароль: изменение настроек требует его каждый раз.",
    en: "Type your password: a change of the settings asks for it every time.",
  },
  settings_mode_title: {
    ru: "Закрытая часть платной лекции",
    en: "The members-only part of a paid lecture",
  },
  settings_mode_intro: {
    ru: "У платной лекции может быть закрытый блок для участников. «Закрыт»: сервер не отдаёт его тем, у кого нет доступа. «Скрыт»: блок отдаётся вместе со страницей и спрятан на ней до появления плеера, как на прежнем сайте; его можно увидеть в исходном коде страницы.",
    en: 'A paid lecture can carry a block for participants. "Locked": the server does not send it to anyone without access. "Hidden": the block is sent with the page and hidden on it until the player appears, as on the previous site; it can be read in the page\'s source.',
  },
  settings_mode_locked: {
    ru: "Закрыт (рекомендуется)",
    en: "Locked (recommended)",
  },
  settings_mode_hidden: {
    ru: "Скрыт (как на прежнем сайте)",
    en: "Hidden (as on the previous site)",
  },
  settings_mode_save: { ru: "Сохранить", en: "Save" },
  settings_mode_saved: { ru: "Сохранено.", en: "Saved." },
  settings_mode_bad: {
    ru: "Выберите одно из двух значений.",
    en: "Choose one of the two values.",
  },
  settings_footnote: {
    ru: "Почтовый ящик, с которого отправляются письма, и его пароль хранятся только в окружении сервера и отсюда не меняются. Каждое изменение записывается в журнал настроек: кто, когда, что было и что стало.",
    en: "The mailbox the mail is sent from and its password live in the server's environment only and cannot be changed here. Every change is written to the settings log: who, when, from what and to what.",
  },
} satisfies Record<string, Phrase>;
