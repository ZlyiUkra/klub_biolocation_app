/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

// Removed 2026-10-13 (T106): `DisqusPageConfig` and `Window.disqus_config`, the shape of the previous comment
// service's embed, which nothing loads any more.

// Checked 2026-09-26 with the move to Clerk (CLERK.md step 3): Clerk needs no global declared here.
// Its UI comes from the installed @clerk/ui package and is imported in src/scripts/auth.ts, so no
// runtime script defines a global for the compiler to be told about (the owner's decision of that
// day; the step in CLERK.md was written for the hosted UI bundle).

// Removed 2026-09-25: the declarations of two environment variables that the colleague added on
// 2026-09-24 for the previous auth provider. Nothing reads import.meta.env for sign-in settings,
// and a declaration for an environment variable that no build supplies would only tell the next
// reader to go looking for an .env file that is not there.
// (Reworded 2026-09-26: the note named the previous provider and its variables, which CLERK.md
// section 0 orders out of this branch; its lesson is unchanged.)

// Added 2026-09-22, when src/scripts/site.js became site.ts and came under astro check. KaTeX's
// auto-render extension publishes renderMathInElement as a global; it is loaded from a CDN tag in
// src/components/Head.astro, so nothing in the module graph declares it and TypeScript would
// otherwise report "Cannot find name 'renderMathInElement'".
//
// Declared as possibly undefined on purpose, rather than as a plain function. The CDN may fail to
// answer, and then the global is simply not there - that is not a hypothetical, it is what any
// blocked or slow third-party host does. Typing it as `| undefined` makes the compiler insist on
// the guard in site.ts instead of leaving it to a reviewer to remember why it is there.
//
// The options type is our own description of KaTeX 0.16.9's documented contract, like
// DisqusPageConfig above: auto-render ships no type definitions with the CDN build, so nothing
// here is verified against the real thing.
// Removed later the same day, together with the call it was written for: the math is typeset at
// build time by rehype-katex now, KaTeX is no longer loaded in the browser, and a declaration for a
// global that nothing can reference is worse than none - it would tell the next reader that the
// CDN tags are still there. The reasoning for the move is in astro.config.mjs. The note above is
// kept as the worked example of how a third party's global is declared here, should another one
// ever arrive: name it, type it from the vendor's documentation, and mark it `| undefined` when it
// comes from a tag that can fail to load.

// Added 2026-09-30 for the Yandex Metrika counter that commit e019697 put into
// src/layouts/Base.astro: the vendor's snippet (an inline block in the head) publishes `ym` as a
// global, and the bundled block at the end of the body calls it, so astro check reported "Cannot
// find name 'ym'" twice. Following the note above: marked `| undefined`, because it comes from a
// tag on mc.yandex.ru that a blocker or a slow network can stop, and the call there already checks
// `typeof ym`. The arguments are left loose - the counter takes an id, a method name and arguments
// that depend on the method, and the tag ships no type definitions.
declare const ym:
  ((counterId: number, method: string, ...args: unknown[]) => void) | undefined;

// Added 2026-10-10 (T033 of specs/001-self-hosted-club-site): what src/middleware.ts puts into Astro.locals. Declared
// through `import()` because this file is a global script and a top-level import would turn it into a module, which
// would drop every declaration above it from the global scope.
declare namespace App {
  interface Locals {
    viewer: import("./lib/viewer").Viewer;
    /**
     * Added 2026-10-11 (T056): true when the request carries a session that must change its password. Such a visitor is
     * a guest for `viewer` (they have proved nothing yet) and is sent to the account page from the other /auth/ pages.
     */
    passwordChangePending?: boolean;
    /**
     * Added 2026-10-13 (T110, T147): true when the request's session belongs to the superuser. Drawn from the same
     * answer as `viewer`; the superuser's pages answer 404 to everyone else on it, and the backend checks it again.
     */
    superuser?: boolean;
    /** Set by src/middleware.ts when /posts/<year>/ or /video/<year>/ was passed to the list route (T034). */
    yearList?: boolean;
  }
}
