// Port of ../klub_biolocation/themes/void/i18n/en.toml (MIGRATION-PLAN.md §4). Ported in
// full while doing the Categories page, which needed `back_to_home`: the file is pure data,
// so translating it once is cheaper than growing it key by key.
//
// Hugo renders the ENGLISH strings today, because hugo.toml sets no
// `defaultContentLanguage`, so `en.toml` is what the live site shows. This file is
// therefore a copy of `en.toml`, not of `ru.toml`. Switching the site to Russian is a
// separate decision: change the values here, not the keys.
//
// Keys are exactly the TOML table names, so a template that reads `i18n "back_to_home"`
// becomes `t.back_to_home`. The two entries that take a value in Hugo (`{{ .Count }}`,
// `{{ .PageNumber }}`) are functions here.
//
// A Hugo template may also ask for a key that does NOT exist in en.toml and supply a
// fallback: `{{ i18n "categories_help_text" | default "..." }}`. Hugo then renders the
// fallback. Do not invent such keys here - keep the literal in the component, the way the
// theme does, so this file stays a faithful copy of the TOML.
//
// Changed 2026-10-12 at the owner's request: the interface is in two languages, English by default
// and Russian on the visitor's choice (site.i18n in src/config.ts, the mechanism in
// src/i18n/lang.ts). Three things above no longer hold, and the rest does:
// - Every entry is a Phrase, the string in both languages side by side; the English values are the
//   en.toml values as they were, the Russian ones are new. The object is `ui` (it was `t`), and a
//   template prints an entry with <T s={ui.back_to_home} />.
// - The file is no longer a faithful copy of the TOML, and the rule about not inventing keys is
//   withdrawn: every interface string of the public site has its home here now, the theme's keys
//   first, the site's own below them (the colleague's labels that stood in the components). The
//   admin panel's strings are in src/i18n/admin.ts, so the public pages' scripts do not carry them.
// - The entries that take a value return a Phrase.
// The articles and the video descriptions are content and are not translated; nor are the tags and
// the categories, which their front matter names.
import type { Phrase } from "./lang";
// Added 2026-10-13 (T187): the names of the six reactions are keys of `reactionLabels`.
import type { ReactionKind } from "../lib/reaction-kinds";

export const ui = {
  // Footer
  footer_share_knowledge: {
    ru: "Делимся знаниями, опытом и идеями",
    en: "Sharing knowledge, experience, and ideas",
  },
  footer_navigation: { ru: "Навигация", en: "Navigation" },
  footer_stay_connected: { ru: "Оставайтесь на связи", en: "Stay Connected" },
  footer_subscribe_contact: {
    ru: "Подпишитесь или напишите нам",
    en: "Subscribe to my content or contact me",
  },
  footer_contact_me: { ru: "Написать нам", en: "Contact Me" },
  footer_github: { ru: "GitHub", en: "GitHub" },
  footer_zhihu: { ru: "Zhihu", en: "Zhihu" },
  footer_email: { ru: "Почта", en: "Email" },
  footer_rights_reserved: {
    ru: "Все права защищены",
    en: "All Rights Reserved",
  },
  footer_built_with: { ru: "Сделано на", en: "Built with" },
  footer_built: { ru: "Собрано", en: "Built" },
  footer_theme: { ru: "Тема", en: "Theme" },

  // Homepage
  home_recent_posts: { ru: "Последние статьи", en: "Recent Posts" },
  home_view_all_posts: { ru: "Все статьи", en: "View All Posts" },
  home_welcome: { ru: "Добро пожаловать", en: "Welcome to my blog" },

  // List page
  list_read_more: { ru: "Читать далее", en: "Read more" },
  year_indicator: { ru: "Год", en: "Year indicator" },
  decorative_halo: { ru: "Декоративный ореол", en: "Decorative halo" },
  article_list: { ru: "Список статей", en: "Article list" },
  list_view_by_year: { ru: "По годам", en: "View by year" },
  list_view_by_category: { ru: "По категориям", en: "View by category" },
  list_article_count: (count: number): Phrase => ({
    ru: `Всего статей: ${count}`,
    en: `${count} articles in total`,
  }),

  // Video page
  list_watch_video: { ru: "Смотреть видео", en: "Watch the video" },

  // About page
  about_skills: { ru: "Навыки", en: "Skills" },
  about_experience: { ru: "Опыт", en: "Experience" },
  about_education: { ru: "Образование", en: "Education" },
  about_projects: { ru: "Проекты", en: "Projects" },
  about_interests: { ru: "Интересы", en: "Interests" },
  about_contact: { ru: "Контакты", en: "Contact" },

  // Article page
  reading_time: { ru: "мин чтения", en: "min read" },
  page_views: { ru: "Просмотры", en: "Page Views" },
  back_to_home: { ru: "На главную", en: "Back to Home" },

  // Article date format. Hugo layout strings; see src/lib/date.ts for the formatter.
  // (2026-10-12: nothing reads these two; the formatter in src/lib/date.ts holds both languages.)
  date_month_day_format: { ru: "02 Jan", en: "Jan 02" },
  date_year: { ru: "", en: "" },

  // Tags
  tag_icon_title: { ru: "Тег", en: "Tag" },
  all_tags: { ru: "Все теги", en: "All Tags" },
  tags_help_text: {
    ru: "Нажмите на тег, чтобы увидеть статьи с ним",
    en: "Click on any tag to view related articles",
  },
  articles: { ru: "статей", en: "articles" },

  // Common buttons and tips
  back_to_top: { ru: "Наверх", en: "Back to top" },
  search_placeholder: { ru: "Поиск...", en: "Search..." },
  pagination_next: { ru: "Далее", en: "Next" },
  pagination_previous: { ru: "Назад", en: "Previous" },
  pagination_page: (pageNumber: number): Phrase => ({
    ru: `Страница ${pageNumber}`,
    en: `Page ${pageNumber}`,
  }),
  related_posts: { ru: "Похожие статьи", en: "Related Posts" },
  table_of_contents: { ru: "Содержание", en: "Table of Contents" },
  comments: { ru: "Комментарии", en: "Comments" },
  share: { ru: "Поделиться", en: "Share" },
  share_copy_link: { ru: "Копировать ссылку", en: "Copy link" },
  share_copy_summary: { ru: "Копировать описание", en: "Copy summary" },
  share_copied: { ru: "Скопировано", en: "Copied" },
  share_native: { ru: "Поделиться...", en: "Share..." },
  share_copy_link_success: { ru: "Ссылка скопирована.", en: "Link copied." },
  share_copy_summary_success: {
    ru: "Текст скопирован.",
    en: "Share text copied.",
  },
  share_copy_failed: { ru: "Не удалось скопировать.", en: "Copy failed." },
  share_native_failed: {
    ru: "Системная кнопка «Поделиться» недоступна.",
    en: "Native sharing is unavailable.",
  },
  last_updated: { ru: "Обновлено", en: "Last updated on" },
  load_comments: { ru: "Загрузить комментарии", en: "Load Comments" },

  // ---------------------------------------------------------------------------------------------
  // The site's own strings, added 2026-10-12 (the note at the top). Where a component held the text
  // as a literal, the old literal is the half of its language here: the Russian ones were the
  // colleague's, the English ones the theme's or ours.

  // The header and the menu (Header.astro, Menu.astro, ThemeToggle.astro, LangToggle.astro,
  // site.ts). The menu items' own names are site.sections in src/config.ts.
  menu_label: { ru: "Меню сайта", en: "Site" },
  menu_open: { ru: "Открыть меню", en: "Open menu" },
  menu_close: { ru: "Закрыть меню", en: "Close menu" },
  search_label: { ru: "Поиск", en: "Search" },
  theme_toggle: { ru: "Переключить тему", en: "Toggle dark mode" },
  theme_to_light: { ru: "Включить светлую тему", en: "Switch to light mode" },
  theme_to_dark: { ru: "Включить тёмную тему", en: "Switch to dark mode" },
  // What the switch shows: the language the page is in.
  lang_current: { ru: "RU", en: "EN" },
  // What a press does, in the language the visitor is reading.
  lang_switch: {
    ru: "Переключить на английский (English)",
    en: "Switch to Russian (Русский)",
  },
  auth_signin: { ru: "Войти на сайт", en: "Sign in" },
  auth_account: { ru: "Личный кабинет", en: "Account" },

  // The footer (Footer.astro) and the button back to the top (ScrollToTop.astro uses back_to_top).
  footer_powered_by: { ru: "Работает на", en: "Powered by" },
  footer_total_visits: { ru: "Всего посещений:", en: "Total visits:" },

  // The feedback form (ContactModal.astro).
  contact_title: { ru: "Обратная связь", en: "Feedback" },
  contact_name: { ru: "Ваше имя", en: "Your name" },
  contact_email: { ru: "Email для связи", en: "Email for the reply" },
  contact_message: { ru: "Сообщение", en: "Message" },
  contact_send: { ru: "Отправить письмо", en: "Send" },
  contact_sent: { ru: "Сообщение отправлено!", en: "Message sent!" },
  contact_failed: {
    ru: "Ошибка отправки. Попробуйте ещё раз.",
    en: "Sending failed. Please try again.",
  },
  // Added 2026-10-13 (T109): the route's 429, five messages an hour from one address.
  contact_limit: {
    ru: "Слишком много сообщений. Попробуйте позже.",
    en: "Too many messages. Please try again later.",
  },

  // Lists and articles (YearSwitcher.astro, Terms.astro, the tag and category pages).
  years_label: { ru: "Годы", en: "Years" },
  terms_label: { ru: "Теги:", en: "Tags:" },
  categories_help_text: {
    ru: "Нажмите на категорию, чтобы раскрыть или свернуть её статьи",
    en: "Click any category to expand or collapse articles",
  },
  // The count on a tag's page: the theme's "articles" after the number, with the Russian plural.
  articles_count: (count: number): Phrase => ({
    ru: `${count} ${ruPlural(count, "статья", "статьи", "статей")}`,
    en: `${count} articles`,
  }),

  // Comments (Comments.astro, src/scripts/comments.ts). Changed 2026-10-13 (T106): the previous service's three
  // strings (show, hide, "powered by") are gone with it; the block is the club's own and always shown.
  // The count under the title: "0 комментариев", "1 комментарий", "2 комментария", as the previous service wrote it.
  comments_count: (count: number): Phrase => ({
    // Changed 2026-10-13 (T187, the owner's word "as in Disqus"): a capital letter, as his screenshot of the previous
    // service shows it ("0 Комментариев"); it read "0 комментариев" until then.
    ru: `${count} ${ruPlural(count, "Комментарий", "Комментария", "Комментариев")}`,
    en: `${count} ${count === 1 ? "Comment" : "Comments"}`,
  }),
  // Added 2026-10-13 (T106, the owner's word the same day): the button above the block that hides the thread and shows
  // it again, as the previous service's block had one (the labels it used to carry are the old ones, "Показать/Скрыть
  // комментарии"). The block starts shown; the button is written by the page's script only when there is one to press.
  comments_collapse: { ru: "Скрыть комментарии", en: "Hide comments" },
  comments_expand: { ru: "Показать комментарии", en: "Show comments" },
  comments_signin: { ru: "Войти", en: "Sign in" },
  comments_placeholder: {
    ru: "Начать обсуждение...",
    en: "Start the discussion...",
  },
  comments_post: { ru: "Отправить", en: "Post" },
  comments_save: { ru: "Сохранить", en: "Save" },
  comments_cancel: { ru: "Отмена", en: "Cancel" },
  comments_edit: { ru: "Изменить", en: "Edit" },
  comments_delete: { ru: "Удалить", en: "Delete" },
  comments_delete_confirm: {
    ru: "Удалить комментарий?",
    en: "Delete the comment?",
  },
  comments_hide: { ru: "Скрыть", en: "Hide" },
  comments_restore: { ru: "Вернуть", en: "Restore" },
  comments_edited: { ru: "изменено", en: "edited" },
  comments_hidden: { ru: "скрыт", en: "hidden" },
  comments_guest_letter: { ru: "Г", en: "G" },
  comments_empty: {
    ru: "Комментариев пока нет. Будьте первым.",
    en: "No comments yet. Be the first.",
  },
  comments_loading: {
    ru: "Загружаем комментарии...",
    en: "Loading comments...",
  },
  comments_load_failed: {
    ru: "Не удалось загрузить комментарии.",
    en: "The comments could not be loaded.",
  },
  comments_need_signin: {
    ru: "Войдите, чтобы участвовать в обсуждении.",
    en: "Sign in to join the discussion.",
  },
  comments_need_access: {
    ru: "Писать комментарии могут участники клуба с доступом к лекциям.",
    en: "Comments can be written by club members who have access to the lectures.",
  },
  // The 409 `entry_cap` of the comment route: the most one account may leave under one entry.
  comments_cap: {
    ru: "Вы достигли предела комментариев под этой записью. Удалите один из своих, чтобы написать новый.",
    en: "You have reached the limit of comments under this entry. Delete one of yours to write a new one.",
  },
  comments_noscript: {
    ru: "Чтобы увидеть комментарии, включите JavaScript.",
    en: "Please enable JavaScript to see the comments.",
  },

  // The six reactions above the comments (Reactions.astro, src/scripts/reactions.ts; T187, 2026-10-13). The question and
  // the count under it are the previous service's ("What do you think?", "1 Response"); its Russian page kept the
  // question in English, the club's block does not. The count is of reactions, with the Russian plural.
  reactions_title: { ru: "Что вы думаете?", en: "What do you think?" },
  reactions_total: (count: number): Phrase => ({
    // Changed 2026-10-13 (T187, the owner's word): "1 Ответ" / "1 Response" with a capital, as the previous service
    // wrote it, and not "реакция" as first written.
    ru: `${count} ${ruPlural(count, "Ответ", "Ответа", "Ответов")}`,
    en: `${count} ${count === 1 ? "Response" : "Responses"}`,
  }),
  // The name under each picture is `reactionLabels` below `ui`: it is keyed by the kind the API uses, which `ui`'s
  // type (a phrase or a function) does not allow.
  reactions_need_signin: {
    ru: "Войдите, чтобы оставить реакцию.",
    en: "Sign in to react.",
  },
  reactions_need_access: {
    ru: "Реакции могут оставлять участники клуба с доступом к лекциям.",
    en: "Reactions can be given by club members who have access to the lectures.",
  },
  // A reaction that is picked is marked for a screen reader too: the label of a picked button.
  reactions_picked: { ru: "ваша реакция", en: "your reaction" },

  // A paid lecture's player (PaidVideo.astro).
  paid_noscript: {
    ru: "Для просмотра лекции нужен включённый JavaScript.",
    en: "Watching the lecture needs JavaScript turned on.",
  },
  paid_loading: { ru: "Проверяем доступ...", en: "Checking access..." },
  paid_guest: {
    ru: "Эта лекция доступна участникам клуба.",
    en: "This lecture is open to club members.",
  },
  paid_sign_in: { ru: "Войти", en: "Sign in" },
  paid_denied: {
    ru: "Лекция откроется после оплаты участия в клубе. Написать нам можно через значок письма внизу страницы.",
    en: "The lecture opens once club membership is paid. You can write to us with the envelope icon at the bottom of the page.",
  },
  paid_recheck: { ru: "Проверить ещё раз", en: "Check again" },
  paid_missing: {
    ru: "Лекция ещё не подключена. Загляните позже.",
    en: "The lecture is not connected yet. Please come back later.",
  },
  paid_blocked: {
    ru: "Доступ к материалам сайта для этой учётной записи закрыт.",
    en: "Access to the site's materials is closed for this account.",
  },
  paid_failed: {
    ru: "Видео сейчас недоступно. Обновите страницу позже.",
    en: "The video is unavailable right now. Please reload the page later.",
  },

  // The carousel on the home page (Carousel.astro, carousel.ts). The photos' own descriptions are
  // in Carousel.astro, next to their file names.
  carousel_label: { ru: "Фотографии природы", en: "Nature photos" },
  carousel_slide: (number: number, total: number): Phrase => ({
    ru: `${number} из ${total}`,
    en: `${number} of ${total}`,
  }),
  carousel_photo_alt: (number: number): Phrase => ({
    ru: `Природа, фото ${number}`,
    en: `Nature, photo ${number}`,
  }),
  carousel_prev: { ru: "Предыдущее фото", en: "Previous photo" },
  carousel_next: { ru: "Следующее фото", en: "Next photo" },
  carousel_pause: { ru: "Остановить прокрутку", en: "Pause autoplay" },
  carousel_resume: { ru: "Продолжить прокрутку", en: "Resume autoplay" },
  carousel_choose: { ru: "Выбор фото", en: "Choose a photo" },
  carousel_dot: (number: number): Phrase => ({
    ru: `Фото ${number}`,
    en: `Photo ${number}`,
  }),

  // The search page (src/pages/search/index.astro, src/scripts/search.ts). {n}, {q} and {total}
  // are filled in by the script.
  search_description: {
    ru: "Поиск по статьям и видеолекциям.",
    en: "Search the articles and the video lectures.",
  },
  search_clear: {
    ru: "Очистить поиск и фильтры",
    en: "Clear the search and the filters",
  },
  search_filters: { ru: "Фильтры", en: "Filters" },
  search_section: { ru: "Раздел", en: "Section" },
  search_category: { ru: "Категория", en: "Category" },
  search_tag: { ru: "Тег", en: "Tag" },
  search_searching: { ru: "Ищем...", en: "Searching..." },
  search_too_short: (minimum: number): Phrase => ({
    ru: `Для поиска введите не меньше ${minimum} символов`,
    en: `Type at least ${minimum} characters to search`,
  }),
  search_found: {
    ru: "Найдено: {n}. Запрос: {q}",
    en: "{n} result(s) for {q}",
  },
  search_empty: {
    ru: "По запросу {q} ничего не найдено",
    en: "No results for {q}",
  },
  search_filtered: {
    ru: "Найдено: {n} из {total}. Запрос: {q}",
    en: "{n} of {total} result(s) for {q}",
  },
  search_listing: {
    ru: "Найдено с этими фильтрами: {n}",
    en: "{n} result(s) with these filters",
  },
  search_empty_filter: {
    ru: "С этими фильтрами ничего не найдено",
    en: "No results with these filters",
  },
  search_failed: {
    ru: "Не удалось загрузить поиск. Попробуйте ещё раз.",
    en: "The search index could not be loaded. Please try again.",
  },
  search_noscript: {
    ru: "Поиску нужен JavaScript: сайт статический, и спросить некого. Всё, что он находит, доступно и без него: статьи, видео, категории и теги.",
    en: "Search needs JavaScript, because this site is static and there is no server to ask. Everything it finds is reachable without it: Posts, Video, Categories and Tags.",
  },
  search_tag_prefix: { ru: "Найдено в тегах:", en: "Found in tags:" },

  // The sign-in, sign-up and account pages (src/pages/auth/, src/scripts/auth.ts and the account
  // scripts). auth_account above names the account page as well.
  auth_title_signin: { ru: "Вход", en: "Sign in" },
  auth_title_signup: { ru: "Регистрация", en: "Sign up" },
  auth_loading: { ru: "Загрузка...", en: "Loading..." },
  auth_noscript_signin: {
    ru: "Для входа нужен включённый JavaScript.",
    en: "Signing in needs JavaScript turned on.",
  },
  auth_noscript_signup: {
    ru: "Для регистрации нужен включённый JavaScript.",
    en: "Signing up needs JavaScript turned on.",
  },
  auth_not_set_up: {
    ru: "Вход на сайт ещё не подключён.",
    en: "Signing in is not set up yet.",
  },
  auth_load_failed: {
    ru: "Не удалось загрузить форму. Обновите страницу.",
    en: "The form could not be loaded. Please reload the page.",
  },
  account_noscript: {
    ru: "Для личного кабинета нужен включённый JavaScript.",
    en: "The account page needs JavaScript turned on.",
  },
  account_demo: {
    ru: "Демо: доступ участника клуба подтверждён.",
    en: "Demo: club membership confirmed.",
  },
  account_sign_out: { ru: "Выйти", en: "Sign out" },
  account_signing_out: { ru: "Выходим...", en: "Signing out..." },
  account_your_status: { ru: "Ваш статус:", en: "Your status:" },
  account_status_title: { ru: "Статус", en: "Status" },
  account_blocked_by_admin: {
    ru: "Доступ к материалам сайта закрыт администратором.",
    en: "Access to the site's materials was closed by an administrator.",
  },
  account_blocked_by_metr: {
    ru: "Доступ к материалам сайта закрыт метром.",
    en: "Access to the site's materials was closed by a maitre.",
  },
  // The account card's "Devices" page (account.astro, account-devices.ts).
  devices_tab: { ru: "Устройства", en: "Devices" },
  devices_title: { ru: "Активные устройства", en: "Active devices" },
  devices_pages: {
    ru: "Страницы списка устройств",
    en: "Pages of the list of devices",
  },
  devices_this: { ru: "Это устройство", en: "This device" },
  devices_revoke: { ru: "Выйти из устройства", en: "Sign out of the device" },
  devices_failed: {
    ru: "Не удалось загрузить список. Обновите страницу.",
    en: "The list could not be loaded. Please reload the page.",
  },
  devices_phone: { ru: "Телефон", en: "Phone" },
  devices_computer: { ru: "Компьютер", en: "Computer" },
  devices_today: { ru: "Сегодня в {time}", en: "Today at {time}" },
  devices_yesterday: { ru: "Вчера в {time}", en: "Yesterday at {time}" },
  devices_on_day: { ru: "{day} в {time}", en: "{day} at {time}" },
  // The names of the two admin panel pages, here and not in src/i18n/admin.ts because the account
  // page links to them too.
  admin_posts_title: { ru: "Публикации", en: "Publications" },
  admin_users_title: { ru: "Пользователи", en: "Users" },
  // Added 2026-10-12 (T175): the third page of the panel.
  admin_videos_title: { ru: "Видео", en: "Videos" },
  // Added 2026-10-13 (T107): the fourth page of the panel, the messages of the feedback form.
  admin_feedback_title: { ru: "Обратная связь", en: "Feedback" },
  // Added 2026-10-13 (T110): the fifth page of the panel, the superuser's settings.
  admin_settings_title: { ru: "Настройки", en: "Settings" },
  // Added 2026-10-12 (T178): the club's own account forms - the pieces they share, then sign-in, sign-up, the
  // superuser's setup and recovery pages. The wording is the Russian of src/pages/auth/ as it stood; the English is new.
  // Shared by every form (src/scripts/auth-forms.ts).
  form_password_show: { ru: "Показать пароль", en: "Show password" },
  form_password_hide: { ru: "Скрыть пароль", en: "Hide password" },
  form_network_failed: {
    ru: "Не удалось связаться с сервером. Проверьте соединение и попробуйте ещё раз.",
    en: "Could not reach the server. Check your connection and try again.",
  },
  form_wait_lead: {
    ru: "Слишком много попыток. Повторите через",
    en: "Too many attempts. Try again in",
  },
  form_tries_left: {
    ru: "Осталось {n} {word} до паузы.",
    en: "{n} {word} left before a pause.",
  },
  // The word counted in form_tries_left: 1 попытка, 2 попытки, 5 попыток / 1 try, 2 tries.
  form_tries_word: (count: number): Phrase => ({
    ru: ruPlural(count, "попытка", "попытки", "попыток"),
    en: count === 1 ? "try" : "tries",
  }),
  form_unit_hour: { ru: "ч", en: "h" },
  form_unit_minute: { ru: "мин", en: "min" },
  form_unit_second: { ru: "с", en: "s" },
  form_passwords_differ: {
    ru: "Пароли не совпадают.",
    en: "The passwords do not match.",
  },
  form_password_min: {
    ru: "Не короче 8 символов.",
    en: "At least 8 characters.",
  },
  form_password_short: {
    ru: "Пароль не короче 8 символов.",
    en: "The password has to be at least 8 characters.",
  },
  form_password_long: {
    ru: "Пароль не длиннее 128 символов.",
    en: "The password cannot be longer than 128 characters.",
  },
  form_new_password_short: {
    ru: "Новый пароль не короче 8 символов.",
    en: "The new password has to be at least 8 characters.",
  },
  form_new_password_long: {
    ru: "Новый пароль не длиннее 128 символов.",
    en: "The new password cannot be longer than 128 characters.",
  },
  form_repeat_password: {
    ru: "Повторите пароль",
    en: "Repeat the password",
  },
  form_copy: { ru: "Скопировать", en: "Copy" },
  form_codes_copied: { ru: "Коды скопированы.", en: "The codes were copied." },
  form_codes_copy_failed: {
    ru: "Скопируйте коды вручную.",
    en: "Copy the codes by hand.",
  },
  form_email: { ru: "Адрес почты", en: "Email address" },
  form_password: { ru: "Пароль", en: "Password" },
  form_identifier: {
    ru: "Адрес почты или логин",
    en: "Email address or login",
  },
  // Sign-in (src/pages/auth/signin.astro).
  signin_title: { ru: "Вход", en: "Sign in" },
  signin_submit: { ru: "Войти", en: "Sign in" },
  signin_no_account: { ru: "Нет аккаунта?", en: "No account?" },
  signin_register: { ru: "Зарегистрироваться", en: "Sign up" },
  signin_recover: { ru: "Восстановить по коду", en: "Recover with a code" },
  signin_help: { ru: "Помощь", en: "Help" },
  signin_noscript: {
    ru: "Для входа нужен включённый JavaScript.",
    en: "Signing in needs JavaScript.",
  },
  signin_missing: {
    ru: "Введите адрес почты или логин и пароль.",
    en: "Enter your email address or login, and your password.",
  },
  signin_refused: {
    ru: "Адрес, логин или пароль неверны.",
    en: "The address, login or password is wrong.",
  },
  // Sign-up (src/pages/auth/signup.astro).
  signup_title: { ru: "Регистрация", en: "Sign up" },
  signup_name: { ru: "Имя", en: "Name" },
  signup_email_hint: {
    ru: "Почта не проверяется: новый аккаунт получает права гостя.",
    en: "The address is not verified: a new account starts as a guest.",
  },
  signup_login: { ru: "Логин (необязательно)", en: "Login (optional)" },
  signup_login_hint: {
    ru: "3–32 символа: строчные латинские буквы, цифры, точка, дефис, подчёркивание. Можно входить и по нему.",
    en: "3 to 32 characters: lower-case Latin letters, digits, dot, hyphen, underscore. You can sign in with it too.",
  },
  signup_honeypot: { ru: "Сайт", en: "Website" },
  signup_submit: { ru: "Зарегистрироваться", en: "Sign up" },
  signup_have_account: {
    ru: "Уже есть аккаунт?",
    en: "Already have an account?",
  },
  signup_noscript: {
    ru: "Для регистрации нужен включённый JavaScript.",
    en: "Signing up needs JavaScript.",
  },
  signup_email_invalid: {
    ru: "Проверьте адрес почты: он должен быть вида имя@сайт.",
    en: "Check the email address: it has to look like name@site.",
  },
  signup_email_taken: {
    ru: "Эта почта уже зарегистрирована. Войдите или напишите в помощь.",
    en: "This address is already registered. Sign in, or write to us through the help button.",
  },
  signup_name_required: { ru: "Укажите имя.", en: "Enter your name." },
  signup_name_long: {
    ru: "Имя не длиннее 80 символов.",
    en: "The name cannot be longer than 80 characters.",
  },
  signup_login_invalid: {
    ru: "Логин: 3–32 символа, строчные латинские буквы, цифры, точка, дефис, подчёркивание.",
    en: "Login: 3 to 32 characters, lower-case Latin letters, digits, dot, hyphen, underscore.",
  },
  signup_login_taken: {
    ru: "Этот логин уже занят.",
    en: "This login is already taken.",
  },
  signup_failed: {
    ru: "Не удалось создать аккаунт. Проверьте поля формы.",
    en: "The account could not be created. Check the fields of the form.",
  },
  // Setup of the superuser (src/pages/auth/setup.astro).
  setup_title: { ru: "Первый запуск", en: "First start" },
  setup_intro: {
    ru: "Эта форма создаёт суперпользователя сайта. Введите код настройки (его вы задали в настройках сервера как SETUP_CODE или нашли в журнале сервера), адрес почты и пароль. Как только суперпользователь есть, страница закрывается сама.",
    en: "This form creates the site's superuser. Enter the setup code (the one you set in the server's settings as SETUP_CODE, or found in the server's log), an email address and a password. As soon as a superuser exists, the page closes by itself.",
  },
  setup_code: { ru: "Код настройки", en: "Setup code" },
  setup_submit: { ru: "Создать суперпользователя", en: "Create the superuser" },
  setup_done: {
    ru: "Суперпользователь создан. Ниже десять кодов восстановления: они показаны один раз. Сохраните их отдельно от компьютера, на котором работаете с сайтом.",
    en: "The superuser was created. Below are ten recovery codes: they are shown once. Keep them apart from the computer you use for the site.",
  },
  setup_noscript: {
    ru: "Для настройки нужен включённый JavaScript.",
    en: "Setup needs JavaScript.",
  },
  setup_fill_all: {
    ru: "Заполните код настройки, адрес почты и пароль.",
    en: "Fill in the setup code, the email address and the password.",
  },
  setup_closed: {
    ru: "Эта страница больше не доступна: суперпользователь уже создан. Обновите страницу.",
    en: "This page is no longer available: the superuser already exists. Reload the page.",
  },
  setup_email_check: {
    ru: "Проверьте адрес почты.",
    en: "Check the email address.",
  },
  setup_password_bad: {
    ru: "Пароль не подходит.",
    en: "The password is not acceptable.",
  },
  setup_code_wrong: {
    ru: "Код настройки неверен.",
    en: "The setup code is wrong.",
  },
  // Recovery with a code (src/pages/auth/recover.astro).
  recover_title: { ru: "Восстановление доступа", en: "Recover access" },
  recover_intro: {
    ru: "Эта форма для суперпользователя сайта. Введите адрес почты или логин, один из десяти кодов восстановления и новый пароль. Код действует один раз; после восстановления вы получите новый комплект кодов.",
    en: "This form is for the site's superuser. Enter the email address or login, one of the ten recovery codes and a new password. A code works once; after the recovery you get a new set of codes.",
  },
  recover_code: { ru: "Код восстановления", en: "Recovery code" },
  recover_code_hint: {
    ru: "Вида XXXX-XXXX-XXXX-XXXX.",
    en: "In the form XXXX-XXXX-XXXX-XXXX.",
  },
  recover_new_password: { ru: "Новый пароль", en: "New password" },
  recover_repeat_new: {
    ru: "Повторите новый пароль",
    en: "Repeat the new password",
  },
  recover_submit: { ru: "Восстановить доступ", en: "Recover access" },
  recover_back: { ru: "Вернуться ко входу", en: "Back to sign-in" },
  recover_done: {
    ru: "Пароль изменён. Все прежние входы закрыты. Ниже новый комплект кодов восстановления: он показан один раз, прежние коды больше не действуют. Сохраните его отдельно от компьютера, на котором работаете с сайтом.",
    en: "The password was changed. Every earlier sign-in was ended. Below is the new set of recovery codes: it is shown once, and the earlier codes no longer work. Keep it apart from the computer you use for the site.",
  },
  recover_noscript: {
    ru: "Для восстановления нужен включённый JavaScript.",
    en: "Recovery needs JavaScript.",
  },
  recover_fill_all: {
    ru: "Заполните адрес или логин, код восстановления и новый пароль.",
    en: "Fill in the address or login, the recovery code and the new password.",
  },
  recover_new_password_bad: {
    ru: "Новый пароль не подходит.",
    en: "The new password is not acceptable.",
  },
  recover_refused: {
    ru: "Адрес, логин или код неверны. Код действует один раз и только для суперпользователя.",
    en: "The address, login or code is wrong. A code works once, and only for the superuser.",
  },
  // The account page (src/pages/auth/account.astro), added 2026-10-12 (T178). Words it shares with the forms above
  // are taken from there (the password fields, the copy button, sign in).
  acct_not_signed_in: {
    ru: "Вы не вошли на сайт.",
    en: "You are not signed in.",
  },
  acct_temp_notice: {
    ru: "Вам выдан временный пароль. Чтобы пользоваться сайтом, задайте свой пароль: пока он не сменён, больше ничего недоступно.",
    en: "You were given a temporary password. To use the site, set your own: until it is changed, nothing else is available.",
  },
  acct_password_title: { ru: "Смена пароля", en: "Change of password" },
  acct_temp_password: { ru: "Временный пароль", en: "Temporary password" },
  acct_current_password: { ru: "Текущий пароль", en: "Current password" },
  acct_password_hint: {
    ru: "Не короче 8 символов. После смены остальные устройства выйдут.",
    en: "At least 8 characters. After the change the other devices are signed out.",
  },
  acct_password_submit: { ru: "Сменить пароль", en: "Change password" },
  acct_sign_out: { ru: "Выйти", en: "Sign out" },
  acct_your_password: { ru: "Ваш пароль", en: "Your password" },
  acct_accept: { ru: "Принять", en: "Accept" },
  acct_decline: { ru: "Отказаться", en: "Decline" },
  acct_cancel_handover: { ru: "Отменить передачу", en: "Cancel the hand-over" },
  acct_menu_label: { ru: "Разделы личного кабинета", en: "Account sections" },
  acct_profile: { ru: "Профиль", en: "Profile" },
  acct_security: { ru: "Безопасность", en: "Security" },
  acct_devices: { ru: "Устройства", en: "Devices" },
  acct_superuser: { ru: "Суперпользователь", en: "Superuser" },
  acct_manage: { ru: "Управление", en: "Administration" },
  acct_email: { ru: "Почта", en: "Email" },
  acct_email_note: {
    ru: "Сменить адрес почты пока нельзя: эта возможность появится позже.",
    en: "The email address cannot be changed yet: this will be added later.",
  },
  acct_status: { ru: "Ваш статус", en: "Your status" },
  acct_save: { ru: "Сохранить", en: "Save" },
  acct_devices_title: { ru: "Активные устройства", en: "Active devices" },
  acct_end_others: {
    ru: "Завершить все остальные",
    en: "Sign out all the others",
  },
  acct_end: { ru: "Завершить", en: "End" },
  acct_this_device: {
    ru: "{device} (это устройство)",
    en: "{device} (this device)",
  },
  acct_device_detail: {
    ru: "Вход: {created}. Активность: {seen}.",
    en: "Signed in: {created}. Last active: {seen}.",
  },
  acct_devices_failed: {
    ru: "Не удалось загрузить список устройств.",
    en: "Could not load the list of devices.",
  },
  acct_noscript: {
    ru: "Для личного кабинета нужен включённый JavaScript.",
    en: "The account page needs JavaScript.",
  },
  acct_blocked: {
    ru: "Доступ к материалам сайта закрыт{by}.",
    en: "Access to the site's material is closed{by}.",
  },
  acct_by_admin: { ru: " администратором", en: " by an administrator" },
  acct_by_metr: { ru: " мэтром", en: " by a maitre" },
  acct_lectures_unlimited: {
    ru: "Доступ к лекциям: без ограничения срока.",
    en: "Access to the lectures: with no end date.",
  },
  acct_lectures_closed: {
    ru: "Доступ к платным лекциям не открыт: его даёт мэтр или администратор.",
    en: "Access to the paid lectures is not open: a maitre or an administrator gives it.",
  },
  acct_lectures_until: {
    ru: "Доступ к лекциям до {day}.",
    en: "Access to the lectures until {day}.",
  },
  acct_lectures_ended: {
    ru: "Доступ к лекциям закончился {day}.",
    en: "Access to the lectures ended {day}.",
  },
  acct_saved: { ru: "Сохранено.", en: "Saved." },
  acct_save_failed: {
    ru: "Не удалось сохранить. Проверьте поля и повторите.",
    en: "Could not save. Check the fields and try again.",
  },
  acct_password_changed: {
    ru: "Пароль изменён. Остальные устройства вышли.",
    en: "The password was changed. The other devices were signed out.",
  },
  acct_current_wrong: {
    ru: "Текущий пароль неверен.",
    en: "The current password is wrong.",
  },
  acct_password_same: {
    ru: "Новый пароль должен отличаться от текущего.",
    en: "The new password has to differ from the current one.",
  },
  acct_password_wrong: { ru: "Пароль неверен.", en: "The password is wrong." },
  // The hand-over of the superuser's role and the recovery codes (T070).
  acct_handover_title: {
    ru: "Передача роли суперпользователя",
    en: "Hand-over of the superuser's role",
  },
  acct_handover_intro: {
    ru: "Роль суперпользователя одна. Передать её можно только администратору: он принимает её своим паролем, и роль переходит к нему через {hours} ч. До этого любая из сторон может отменить передачу.",
    en: "There is one superuser. The role can only be handed to an administrator: they accept it with their own password, and the role passes to them after {hours} h. Until then either side can cancel the hand-over.",
  },
  acct_handover_to: { ru: "Кому передать", en: "Hand over to" },
  acct_handover_submit: { ru: "Передать", en: "Hand over" },
  acct_handover_accepted_to: {
    ru: "Вы приняли передачу роли суперпользователя от {who}. Роль перейдёт к вам {when}. До этого момента передачу можно отменить.",
    en: "You accepted the hand-over of the superuser's role from {who}. The role passes to you {when}. Until then the hand-over can be cancelled.",
  },
  acct_handover_accepted_from: {
    ru: "{who} принял передачу. Роль перейдёт {when}. До этого момента передачу можно отменить.",
    en: "{who} accepted the hand-over. The role passes {when}. Until then the hand-over can be cancelled.",
  },
  acct_handover_offered_to: {
    ru: "{who} предлагает передать вам роль суперпользователя. Введите свой пароль, чтобы принять; после этого роль перейдёт к вам через {hours} ч, и до этого момента передачу можно отменить. Предложение действует до {when}.",
    en: "{who} offers to hand the superuser's role to you. Enter your password to accept; the role then passes to you after {hours} h, and until then the hand-over can be cancelled. The offer is valid until {when}.",
  },
  acct_handover_offered_from: {
    ru: "Вы предложили передать роль суперпользователя: {who}. Предложение действует до {when}, пока оно не принято.",
    en: "You offered to hand the superuser's role to {who}. The offer is valid until {when}, as long as it is not accepted.",
  },
  acct_no_other_admins: {
    ru: "Других администраторов нет: сначала назначьте администратора на странице «Пользователи»",
    en: "There are no other administrators: first make someone an administrator on the Users page",
  },
  acct_cancel_failed: {
    ru: "Не удалось отменить передачу.",
    en: "Could not cancel the hand-over.",
  },
  acct_accept_failed: {
    ru: "Не удалось принять передачу. Повторите позже.",
    en: "Could not accept the hand-over. Try again later.",
  },
  acct_pick_admin: {
    ru: "Выберите администратора, которому передаётся роль.",
    en: "Choose the administrator the role is handed to.",
  },
  acct_handover_confirm: {
    ru: "Передать роль суперпользователя? После принятия и ожидания она перейдёт к выбранному администратору, а вы станете обычным администратором.",
    en: "Hand over the superuser's role? After it is accepted and the waiting time has passed, the role goes to the chosen administrator and you become an ordinary administrator.",
  },
  acct_target_not_admin: {
    ru: "Роль можно передать только администратору. Назначьте его на странице «Пользователи».",
    en: "The role can only be handed to an administrator. Make them an administrator on the Users page.",
  },
  acct_start_failed: {
    ru: "Не удалось начать передачу. Повторите позже.",
    en: "Could not start the hand-over. Try again later.",
  },
  acct_codes_title: { ru: "Коды восстановления", en: "Recovery codes" },
  acct_codes_intro: {
    ru: "Десять одноразовых кодов позволяют задать новый пароль, если пароль забыт. Храните их отдельно от компьютера, на котором работаете с сайтом. Новый комплект делает прежние коды недействительными.",
    en: "Ten one-time codes let you set a new password if the password is forgotten. Keep them apart from the computer you use for the site. A new set makes the earlier codes invalid.",
  },
  acct_codes_make: { ru: "Создать новые коды", en: "Create new codes" },
  acct_codes_new: {
    ru: "Новые коды. Они показаны один раз.",
    en: "The new codes. They are shown once.",
  },
  acct_codes_none: {
    ru: "Неиспользованных кодов не осталось. Без них, если пароль будет забыт, вернуться можно только командой на сервере или страницей настройки. Создайте новый комплект ниже.",
    en: "No unused codes are left. Without them, if the password is forgotten, the only way back is a command on the server or the setup page. Create a new set below.",
  },
  acct_codes_left: {
    ru: "Неиспользованных кодов: {n} из 10.",
    en: "Unused codes: {n} of 10.",
  },
  acct_codes_confirm: {
    ru: "Создать новый комплект кодов? Прежние коды перестанут действовать.",
    en: "Create a new set of codes? The earlier codes stop working.",
  },
  acct_codes_failed: {
    ru: "Не удалось создать коды. Повторите позже.",
    en: "Could not create the codes. Try again later.",
  },
  // Added 2026-10-12 (T178): the video player's "period ended" line (the other states are the paid_* entries above),
  // the notice of a locked entry (LockedNotice.astro) and the lock label of a card (CardList.astro).
  paid_ended: {
    ru: "Срок доступа к этому видео закончился{on}.",
    en: "The access period of this video has ended{on}.",
  },
  paid_ended_on: { ru: " {day}", en: " on {day}" },
  locked_rest: { ru: "Остальная часть закрыта", en: "The rest is closed" },
  locked_not_for_you: {
    ru: "Этот материал недоступен для вашей учётной записи.",
    en: "This material is not available to your account.",
  },
  locked_members: {
    ru: "Этот материал доступен участникам клуба. Войдите, чтобы читать его полностью.",
    en: "This material is for club members. Sign in to read it in full.",
  },
  locked_card: { ru: "Закрыто для вас", en: "Closed for you" },
} satisfies Record<string, Phrase | ((...values: number[]) => Phrase)>;

// Added 2026-10-13 (T187): the name printed under each of the six reaction pictures, keyed by the kind the API uses
// (src/lib/reaction-kinds.ts), so a kind without a label does not compile. It stands beside `ui` and not in it
// because `ui` holds phrases and functions only. The English labels are the previous comment service's own.
export const reactionLabels = {
  upvote: { ru: "Нравится", en: "Upvote" },
  funny: { ru: "Смешно", en: "Funny" },
  love: { ru: "Обожаю", en: "Love" },
  surprised: { ru: "Удивление", en: "Surprised" },
  angry: { ru: "Злость", en: "Angry" },
  sad: { ru: "Грусть", en: "Sad" },
} satisfies Record<ReactionKind, Phrase>;

// Added 2026-10-12 for articles_count: the Russian plural of a count - one (1, 21, 101), few (2-4,
// 22-24) and many (0, 5-20, 25-30). Written out rather than through Intl.PluralRules so that the
// result does not depend on the build machine's ICU data, the reason src/lib/date.ts gives for its
// month names.
export function ruPlural(
  count: number,
  one: string,
  few: string,
  many: string,
): string {
  const tens = count % 100;
  const units = count % 10;
  if (tens >= 11 && tens <= 14) return many;
  if (units === 1) return one;
  if (units >= 2 && units <= 4) return few;
  return many;
}
