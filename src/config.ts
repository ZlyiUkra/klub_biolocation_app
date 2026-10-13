// The address of the member's page, spelled once: site.auth.dashboard below is the scripts' home
// for it, and since the evening of 2026-09-25 the menu has an item that opens it (the owner's
// word). A literal in both places would be the second spelling of one setting (CLAUDE.md, "One
// site-wide setting has one home"); the object cannot read its own field while it is being built,
// hence the constant.

// Added 2026-10-10 (T162): the pagination numbers have their home in a plain module the backend can read.
import { paginationRules } from "./lib/pagination";
// Added 2026-10-11 (T043): the session lifetimes have their home in a plain module the backend can read.
import { sessionLifetimes } from "./lib/session-lifetimes";
// Added 2026-10-11 (T067): the superuser handover and recovery numbers have their home in a plain module the backend can
// read, for the same reason.
import { handoverRules } from "./lib/handover-rules";
// Added 2026-10-13 (T109): the type of the sign-in help link's topic code.
import type { FeedbackSubject } from "./lib/feedback-rules";
// Renamed 2026-09-26 with the move to Clerk (CLERK.md step 2): the member's page is /auth/account/
// now, where Clerk's profile component is mounted, and the constant is accountPath to match. The
// note above still applies; read "site.auth.account" for "site.auth.dashboard".
const accountPath = "/auth/account/";

// Added 2026-10-12 with the two interface languages (site.i18n below): the name of every section of
// the site in both languages, written once. The menu, the search filters and the titles of the
// list pages read it (site.sections), so a renamed section is one edit. A constant for the reason
// given above for accountPath: the object cannot read its own fields while it is being built.
const sectionNames = {
  home: { ru: "Главная", en: "Home" },
  posts: { ru: "Статьи", en: "Posts" },
  video: { ru: "Видео", en: "Video" },
  categories: { ru: "Категории", en: "Categories" },
  tags: { ru: "Теги", en: "Tags" },
  account: { ru: "Кабинет", en: "Account" },
  about: { ru: "О нас", en: "About" },
};

export const site = {
  title: "Radiesthesia Club",
  language: "ru",
  social: {
    github: "https://debi7.github.io/",
    email: " ",
    telegram: "@name",
  },

  avatar: "/images/avatar.png",
  carousel: { interval: 3000 },

  // Removed 2026-10-13 (T106): `disqus: { shortname }`, the previous comment service's site. The comments are the
  // club's own now (src/components/Comments.astro; contracts/http-api.md "Comments").

  // Added 2026-09-19, asked for by the owner: how many posts one page of a list shows - on
  // /posts/, /tags/<tag>/ and /categories/<category>/. Hugo's default is 10; the owner chose 5.
  // Lowering it is also the quickest way to see several pages with only a few posts. See
  // PAGINATION.md.
  //
  // everyNumberUpTo - added later on 2026-09-19, the owner's rule for the page numbers between
  // Previous and Next: a list with at most this many pages shows every page number; a longer one
  // shows only the first, the current and the last page, with an ellipsis between them. See
  // pageNumbers() in src/lib/posts.ts.
  //
  // everyYearUpTo - the same day, for the year switcher above the Posts list, which the owner
  // asked to keep separate from the page numbers: up to this many years every year is shown;
  // beyond it the newest, the oldest and the year being shown with its neighbours. See
  // yearSwitcher() in src/lib/posts.ts. scripts/check-pagination.mjs reads all three values.
  // Added 2026-09-22 with the Section filter on /search/. The search index labels every entry
  // with the section it belongs to, and the search page prints one checkbox per label; both read
  // this, so the two cannot drift apart and a translated menu is one edit rather than two. The
  // words match the menu items below on purpose - a visitor filtering by "Video" is thinking of
  // the menu item of that name.
  // Changed 2026-10-12 (site.i18n): both languages, the menu items' own names (sectionNames at the
  // top of this file), as the note says.
  searchSections: { posts: sectionNames.posts, video: sectionNames.video },

  // Added 2026-10-12: the section names (sectionNames at the top of this file).
  sections: sectionNames,

  // Added 2026-09-22 after the reviewer asked for it: how many characters have to be typed before
  // /search/ looks anything up. One or two letters match almost every entry on the site, so the
  // page used to redraw the whole list on the first keystroke and show a result count that meant
  // nothing. Below this length the text is ignored - the filters on the left still work, and the
  // status line says what is missing. Both the script and the wording of that line read this, so
  // the number is written once.
  search: { minQuery: 3 },

  // Added 2026-09-22 with the tag cloud under the carousel (src/components/TagCloud.astro): the
  // tags that cloud leaves out. These three are leftovers from the skeleton's test posts and say
  // nothing to a reader. "video" is deliberately not among them - the owner keeps it in the cloud
  // for now and may replace it with something else later. A name here is matched against the
  // front-matter name, which the schema lower-cases, not against the title-cased label, and it
  // hides a tag from the cloud alone: its page, the Tags page and the search filters are
  // untouched.
  tagCloud: { hidden: ["hugo", "void", "draft"] },

  // Added 2026-09-22 at the owner's request, with the tag cloud: the word a tag or a category is
  // SHOWN by, where that should differ from the word the front matter writes. Empty on purpose -
  // every term reads well title-cased today - and it is here for the day one does not.
  //
  //   termLabels: { "маятник": "Маятник и рамки", "video": "Лекции" },
  //
  // The key is the front-matter name in lower case (the schema lower-cases every tag; write a
  // category key in lower case too, the lookup does the same to it). The value is printed as it
  // stands, so it decides its own capitals.
  //
  // This renames nothing else. The address stays /tags/<the front-matter name>/, the filters on
  // /search/ keep matching on that name, and an entry still declares the tag by that name in its
  // front matter - which is what makes this safe to change at any time: no link anywhere breaks.
  // To change the address as well, rename the tag in the front matter of every entry that carries
  // it; CONTENT.md, "Renaming a tag", has both procedures side by side.
  termLabels: {},

  // Removed 2026-10-12 (T167): `clerk.publishableKey`, the public key of the previous sign-in provider's application,
  // with its notes. The provider's packages, its scripts and its pages are gone; the sign-in is the club's own.

  // Added 2026-09-28 (paid videos; .specify/consilium/2026-09-28-paid-video-access.md): the
  // access service that gives a member the player address of a paid video. GitHub Pages runs no
  // code, so it is a Cloudflare Worker, workers/video-access/. `endpoint` is its address, empty
  // until the owner creates the Worker (its README says how); while it is empty a paid page says
  // the video is unavailable. `devEndpoint` is the same code run on this machine by
  // `npm run video-access:dev`, which `npm run dev` asks instead: import.meta.env.DEV picks one at
  // build time, so a bundle carries one address. `playerHosts` are the only hosts a player
  // address may point to; the page refuses anything else the service returns, so a broken or
  // taken-over service cannot put another page, or a script address, into the player frame.
  // grantedEvent added 2026-09-28, the owner's choice for comments on a paid video (hide the block
  // until the access service has answered 200): src/scripts/paid-video.ts dispatches this event on
  // the document once the player is in place, and Disqus.astro shows its button when it hears it.
  // The name is spelled here once, so the two scripts cannot drift apart.
  // Changed later on 2026-09-28, the owner's decision: grantedEvent now shows the members-only
  // block (block 2, lib/video.ts; the listener is in VideoLayout.astro), and the comments show on
  // signedInEvent instead, which paid-video.ts sends as soon as it has confirmed a session - so a
  // signed-in visitor without access sees them too and can be instructed there, and a guest does
  // not.
  // Changed 2026-10-11 (T083): the access service is gone (workers/video-access/ was deleted); `endpoint` and
  // `devEndpoint` went with it. What is left is the player's own settings, read by src/components/VideoPlayer.astro, by
  // src/scripts/video-player.ts (the script that was paid-video.ts) and by Disqus.astro; the name stays because those
  // files already say `site.videoAccess`.
  videoAccess: {
    // Changed 2026-10-11 (T137): vk.com and rutube.ru for the two adapters of the backend (server/src/video/providers).
    playerHosts: [
      "www.youtube.com",
      "www.youtube-nocookie.com",
      "vk.com",
      "rutube.ru",
      // Added 2026-10-12 (T175): the adapters of Vimeo and Odnoklassniki (server/src/video/providers). Every host an
      // adapter can answer with must be here, or the page refuses the address and shows "failed".
      "player.vimeo.com",
      "ok.ru",
    ],
    // Added 2026-09-30, with lectures on Yandex Disk: the only hosts a video file's address may
    // point to - the service answers such a slug with {"videoUrl"}, a direct address of the file
    // that the page plays in a video element instead of a frame. The address redirects on to
    // Yandex's storage hosts; the check is on the address the service gives, as for playerHosts.
    fileHosts: ["downloader.disk.yandex.ru"],
    grantedEvent: "paid-video:granted",
    signedInEvent: "paid-video:signed-in",
  },

  // Added 2026-10-02 with the admin panel (.specify/consilium/2026-10-02-admin-posts.md, ADMIN.md):
  // the content service that adds, edits and deletes posts for an editor who has no GitHub account,
  // workers/content-admin/. As with videoAccess, `endpoint` is the deployed Worker, empty until the
  // owner creates it, and `devEndpoint` is the same code run on this machine by
  // `npm run content-admin:dev` (and by `npm run dev:all`); import.meta.env.DEV picks one at build
  // time. `postsPage` is the panel's address, with its slash (trailingSlash "always").
  //
  // The statuses, the owner's model of 2026-10-02: every member has exactly one, kept as the key
  // `status` of the user's Clerk public metadata and carried into the session token as the claim
  // `status` (CLERK-DASHBOARD.md 7.2). A new account has none, which counts as "guest"; a metr or an
  // admin assigns the others, and nobody changes their own. "blocked" is a guest who may open no
  // material of the site, and is told who closed it. `statusNames` are what the site shows.
  // `postEditors` may add, edit and delete posts; the content Worker carries a copy of that list,
  // which scripts/check-content-admin.mjs compares with this one.
  // Added later on 2026-10-02: the status service, workers/statuses/, which /admin/users/ asks, with
  // its two addresses on the same pattern; it is a Worker of its own because it holds the Clerk
  // secret key (its header says why).
  admin: {
    // Removed 2026-10-12 (T100): `endpoint` and `devEndpoint`, the addresses of the content service
    // (workers/content-admin/), which no longer exists; the panel saves through the club's own backend.
    postsPage: "/admin/posts/",
    // Removed 2026-10-11 (T071): statusesEndpoint and statusesDevEndpoint, the addresses of the status service
    // (workers/statuses/), which no longer exists; /admin/users/ asks the club's own backend.
    usersPage: "/admin/users/",
    // Added 2026-10-12 (T175): the panel's page for videos.
    videosPage: "/admin/videos/",
    // Added 2026-10-13 (T107): the panel's page for the messages of the feedback form.
    feedbackPage: "/admin/feedback/",
    // Added 2026-10-13 (T110): the superuser's settings page; the backend answers 404 to everyone else.
    settingsPage: "/admin/settings/",
    statuses: [
      "guest",
      "student",
      "expert",
      "master",
      "metr",
      "admin",
      "blocked",
    ],
    // Changed 2026-10-12 (site.i18n): each name in both languages of the interface. The Russian "мэтр" is the
    // owner's spelling of 2026-10-11 (not "метр", the unit of length); the key stays `metr`.
    statusNames: {
      guest: { ru: "гость", en: "guest" },
      student: { ru: "студент", en: "student" },
      expert: { ru: "эксперт", en: "expert" },
      master: { ru: "мастер", en: "master" },
      // Changed 2026-10-12, the owner's word: in English the status is written "maitre", the French word without the
      // accent and the ligature, not "metr". The key stays `metr`.
      metr: { ru: "мэтр", en: "maitre" },
      admin: { ru: "администратор", en: "administrator" },
      blocked: { ru: "заблокирован", en: "blocked" },
    },
    postEditors: ["admin", "metr"],
    // Added later on 2026-10-02, the owner's rule: any status a metr or an admin gives - every one
    // but guest and blocked - opens the paid lectures. workers/video-access/worker.mjs carries a
    // copy (VIEWERS), which scripts/check-video-access.mjs compares with this one. The paid access
    // of CLERK-DASHBOARD.md 7.3 (member, memberUntil) still opens them too; blocked closes both.
    lectureViewers: ["student", "expert", "master", "metr", "admin"],
    // Added later on 2026-10-02, the owner's number: the panel's lists show 20 posts or members to
    // a page (AdminPager.astro). The status service is asked for that many at a time and accepts
    // at most 50 (workers/statuses/worker.mjs).
    pageSize: 20,
    // Added 2026-10-11 (T067): hours between a handover being accepted and the superuser role moving (zero is instant;
    // the server command is always instant). The value lives in src/lib/handover-rules.ts, the one home the backend
    // can read; security-review-superuser.md section 4, mitigation 2.
    handoverCoolingHours: handoverRules.coolingHours,
  },

  // Changed 2026-09-26 with the move to Clerk (CLERK.md step 2): the pages are three - sign-in,
  // sign-up and the account page. callback, forgot and reset went, because Clerk confirms an email
  // address and resets a password by a code typed into its own form, so no mail lands on the site;
  // dashboard became account; demoTable went with the service it named. The reasons below about
  // one home and the trailing slash still hold.
  // The addresses of the sign-in pages and the two names the scripts share. One home for the
  // addresses because six files used to spell them out, and because every one of them has to end
  // with a slash: under trailingSlash "always" the dev server answers 404 to /auth/signin without
  // it (measured 2026-09-25). The dashboard sits under /auth/ at the owner's request, so that one
  // sitemap rule and one redirect allow-list entry cover the four. flagKey is the localStorage key
  // the auth pages write and the header reads (src/scripts/auth-flag.ts).
  // (Changed 2026-09-28: a clause about demoTable, the previous provider's demo table, stood here and
  // left with that provider, at the owner's order.)
  auth: {
    signIn: "/auth/signin/",
    signUp: "/auth/signup/",
    // Added 2026-10-11 (T168, step 3c of plan phase 3): the superuser's recovery by a code, reached from the sign-in page.
    recover: "/auth/recover/",
    // Added 2026-10-11 (T169): the page that makes the first superuser (or, with the emergency switch, a new one) on a
    // hosting with no command line; it answers 404 whenever the backend says the door is shut.
    setup: "/auth/setup/",
    account: accountPath,
    // Removed 2026-10-12 (T167): `flagKey` ("kb-auth-expires"), the localStorage flag of the previous provider's pages.
    // Added 2026-10-11 (T043, the owner's variant A): how long a session lives by the rights behind it, one constant
    // each, in src/lib/session-lifetimes.ts, where the backend reads them too.
    sessionLifetimes,
    // Removed 2026-10-12 (T167): `contactKey`, the localStorage key under which the previous provider's pages kept the
    // member's name and email for the feedback form. ContactModal.astro asks `/api/auth/me` now.
  },

  // Added 2026-10-01 at the owner's request (AUTH.md section 12.6): the event that opens the
  // feedback form, ContactModal.astro, from any script, besides the envelope button in the footer.
  // The sign-in page sends it when a visitor presses "Помощь" or "Написать в поддержку" in Clerk's
  // form. Sent on the document; its detail may carry `email` and `subject` to fill in. Spelled here
  // once, as videoAccess.grantedEvent is, so the sender and the form cannot drift apart.
  contact: {
    openEvent: "contact:open",
    // Added 2026-10-12 (T178): the subject the sign-in page's help puts on the letter. Content, not interface: whoever
    // receives the letter reads it, and the club's mail is in Russian (I18N.md, "Left in Russian on purpose").
    // Changed 2026-10-13 (T109): the value is a CODE of the fixed list in src/lib/feedback-rules.ts and no longer the
    // Russian text it was (the words "a problem with signing in"). The form posts to the club's own route, which takes
    // a code and builds the notice's subject line from fixed texts; the sign-in page's help link puts this one in the
    // open event's detail.
    signInSubject: "signin_problem" satisfies FeedbackSubject,
  },

  // Changed 2026-10-10 (T162): the three numbers moved to src/lib/pagination.ts (paginationRules), where the backend
  // reads them too; this config cannot be compiled by the backend. The comment above explains each value.
  pagination: paginationRules,

  // Added 2026-10-12 at the owner's request: the interface in two languages, English by default and
  // Russian on the visitor's choice, switched by the button beside the menu (LangToggle.astro). Only
  // the interface: the articles and the video descriptions stay in Russian and are not translated,
  // so there are no /en/ addresses, and the choice is the visitor's setting, kept in localStorage
  // under storageKey, like the theme. How the strings are written and switched is in
  // src/i18n/lang.ts and I18N.md. changeEvent is sent on the document after a switch, for the
  // scripts that build text themselves.
  i18n: {
    languages: ["ru", "en"],
    defaultLanguage: "en",
    storageKey: "kb-lang",
    changeEvent: "lang:change",
  },

  // Changed 2026-10-12 (the i18n block above): every name is a pair of languages now, from
  // sectionNames at the top of this file.
  menu: [
    { name: sectionNames.home, url: "/" },
    { name: sectionNames.posts, url: "/posts/" },
    { name: sectionNames.video, url: "/video/" },
    { name: sectionNames.categories, url: "/categories/" },
    { name: sectionNames.tags, url: "/tags/" },
    // Added the evening of 2026-09-25 at the owner's word: the member's page as a menu item, which
    // is where a visitor lands after a sign-in or a confirmed registration. English and short, like
    // the other names (the owner corrected a first Russian spelling the same evening: the menu keeps
    // one language, the page it opens keeps its Russian title). Before About, where the owner put it;
    // the Hugo items keep their order among themselves. Menu.astro marks every item but Home
    // members-only (AUTH.md section 10), so a guest never sees it.
    // Changed 2026-09-26 (CLERK.md step 2): the item keeps its name and place and opens
    // /auth/account/, the page that replaced the dashboard.
    { name: sectionNames.account, url: accountPath },
    { name: sectionNames.about, url: "/about/" },
  ],
} as const;
