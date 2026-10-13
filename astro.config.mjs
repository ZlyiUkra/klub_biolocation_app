import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import mdx from "@astrojs/mdx";
// Changed 2026-10-10 (T025): remark-math, rehype-katex and the Shiki themes are read from src/markdown/options.ts,
// which the backend's renderer reads too, so the two Markdown pipelines cannot drift apart.
import { markdownOptions } from "./src/markdown/options.ts";
import alpinejs from "@astrojs/alpinejs";
// Removed 2026-10-10 (T035 of specs/001-self-hosted-club-site), with the owner's word: the import below and the
// sitemap() entry of `integrations` are commented out, and the package is gone from package.json. The sitemap is two
// routes of the site now, src/pages/sitemap-index.xml.ts and src/pages/sitemap-0.xml.ts, built by src/lib/sitemap.ts
// from the backend's answers, because the package only saw the pages that exist as files at build time. Its filter,
// described in the comments inside the commented entry, is kept by that builder.
// import sitemap from "@astrojs/sitemap";
// Disabled 2026-09-25, together with the output and adapter lines below; the reason is there.
// import node from "@astrojs/node";
// Changed 2026-10-10 (T032 of specs/001-self-hosted-club-site): the import is active again, see the note at the
// `output` line below.
import node from "@astrojs/node";

export default defineConfig({
  // Disabled 2026-09-25. The colleague switched the project to
  // on-demand rendering on 2026-09-24 for the previous provider's sign-in, but the site is hosted on GitHub
  // Pages, which serves files and runs no Node process: the build then wrote dist/client/ and
  // dist/server/ instead of dist/index.html, the Pages artifact had no page at its root, and the
  // live site answered 404 from the merge of 2026-09-25 while the workflow reported success. With
  // the lines below commented out, output falls back to Astro's default, "static", which is what
  // the workflow uploads and what every check script expects of dist/. The sign-in runs in the
  // browser now (src/scripts/auth.ts), so nothing needs a server. Her lines are kept as written,
  // with her note, so the history reads in place; @astrojs/node itself left package.json the same
  // day.
  // (Reworded 2026-09-26 for the move to Clerk: the note named the previous auth provider and its
  // verdict file, which CLERK.md section 0 orders out of this branch. The lesson stands, and Clerk
  // keeps it: the sign-in runs in the browser, @clerk/astro is not used because it needs server
  // output, and the Clerk verdict in .specify/consilium/2026-09-25-clerk-static.md says so.)
  // output: "server", // Переводит проект в режим SSR
  // adapter: node({
  //   mode: "standalone",
  // }),
  //
  // Changed 2026-10-10 (T032 of specs/001-self-hosted-club-site; the 2026-09-24 lesson above still stands for the
  // site that is live on GitHub Pages, which is the OLD repository - this one has no remote and is not deployed there).
  // The rewrite renders pages on demand from the database, in the same Node process as the Express backend:
  // `output: "server"` makes on-demand the default and `export const prerender = true` the exception; every page of
  // src/pages carries that line today, so the built pages are the same files as before until T034/T035 convert them
  // one by one. `middleware` mode builds ./dist/server/entry.mjs, which exports a `handler` that Express mounts
  // (T036); the prerendered pages and the assets go to ./dist/client (astro-docs 4.16, @astrojs/node, "Mode" and
  // "Middleware"). `npm run build` therefore writes dist/client and dist/server, not dist/index.html: scripts that
  // read the built pages read dist/client.
  output: "server",
  adapter: node({ mode: "middleware" }),

  // Публичный адрес деплоя на GitHub Pages (без базового пути)
  // (English, added 2026-09-22 next to the original note: the public GitHub Pages address, with no
  // base path. DEPLOY.md section 2 holds the placeholders and says a project site would need
  // `base` set here, which would break every root-relative link in the source.)
  site: "https://debi7.github.io/",

  // Hugo emits /path/index.html for every page; keep the same URLs.
  trailingSlash: "always",
  build: { format: "directory" },

  // applyBaseStyles: false - the Tailwind base layer is imported by src/styles/main.css so
  // that the order (base, theme rules, custom.css) stays under our control.
  // sitemap() goes last; the order of integrations does not matter here, and putting it at the end
  // keeps the three that affect how pages are built together at the front.
  integrations: [
    tailwind({ applyBaseStyles: false }),
    mdx(),
    alpinejs(),
    // sitemap({
    // Extended 2026-09-25: the four pages under /auth/ (sign-up, sign-in, the mail callback and
    // the member's page) are for a visitor with a reason to be there, not for a search engine;
    // a crawler that indexed the callback would only ever see "the link is invalid".
    // Changed 2026-09-25, late evening, the owner's decision (AUTH.md section 10): the site is closed
    // to guests, so the sitemap lists the home page alone - the one page a guest may see and a search
    // engine may index. The filter it replaces:
    //   filter: (page) => !/\/page\/\d+\/$/.test(page) && !/\/auth\//.test(page),
    // Reopened on 2026-09-25 after the colleague's review (AUTH.md section 11): the site is open again, so the filter
    // it replaced is back.
    // Checked 2026-09-26 with the move to Clerk (CLERK.md step 6): the pages under /auth/ are
    // three now - sign-in, sign-up and the account page - and the rule keeps all three out.
    // Extended 2026-10-02 with the admin panel (ADMIN.md): its pages under /admin/ are left out too.
    // filter: (page) =>
    // !/\/page\/\d+\/$/.test(page) &&
    // !/\/auth\//.test(page) &&
    // !/\/admin\//.test(page),
    // }),
    // Removed 2026-10-12 (T167): the integration "clerk-prebundle-dev-only", which made `astro dev` pre-bundle
    // @clerk/clerk-js, @clerk/ui, @clerk/localizations, react and react-dom. None of them is a dependency any more; the
    // sign-in is the club's own (src/pages/auth/, the backend), so there is nothing here to pre-bundle.
    // Added 2026-09-30, after a dev server on a spare port broke the owner's. Every `astro dev` keeps
    // Vite's pre-bundled dependencies in node_modules/.vite, so two servers of this project share
    // one cache: the second one re-optimised it, was stopped half-way, and left no deps folder
    // behind, while the owner's server on 4321 still handed out the old hash - the sign-in page then
    // failed with "504 (Outdated Optimize Dep)" on the three Clerk bundles. With KB_VITE_CACHE_DIR
    // set, a server keeps its cache there instead; unset, nothing changes. CLAUDE.md, "Workflow",
    // asks every server started beside the owner's to set it.
    // Changed later on 2026-09-30, when the owner's sign-in page failed the same way again: the
    // culprit that time was `npm run check`. astro check runs astro sync first, which starts a Vite
    // of its own, and it rewrote node_modules/.vite/deps with three of Astro's internal
    // dependencies at 23:12:19 while the owner's server, started at 22:59:36, still handed out the
    // hash of its Clerk bundles. So every command but `astro dev` - build, preview, sync, and check
    // through sync (Astro 4.16, `astro:config:setup`, the `command` option) - now keeps its cache
    // in node_modules/.vite-tools, and the dev servers are the only users of node_modules/.vite.
    // KB_VITE_CACHE_DIR, when set, still wins.
    {
      name: "separate-vite-cache",
      hooks: {
        "astro:config:setup": ({ command, updateConfig }) => {
          const cacheDir =
            process.env.KB_VITE_CACHE_DIR ??
            (command === "dev" ? undefined : "node_modules/.vite-tools");
          if (cacheDir) updateConfig({ vite: { cacheDir } });
        },
      },
    },
  ],

  markdown: {
    // remark-math only keeps $...$ / $$...$$ intact in Markdown. Rendering stays client-side
    // (KaTeX auto-render from CDN, as in the Hugo theme). Do not add rehype-katex.
    //
    // Superseded 2026-09-22, by the owner's decision. The note above describes behaviour
    // remark-math does not have: it does not keep the dollars, it consumes them. Measured in a
    // headless browser on a post with an inline and a display formula - `$E = mc^2$` reached the
    // page as `<code class="language-math math-inline">E = mc^2</code>`, with the dollars gone,
    // and KaTeX's auto-render scans text nodes for dollars, so it found nothing and typeset
    // nothing. Every formula on the site rendered as source text inside a code element, and had
    // done since the day remark-math was added.
    //
    // Both halves of the pair are configured now: remark-math parses the math out of the
    // Markdown, rehype-katex turns those nodes into KaTeX markup while the page is built. That
    // choice, over the other repair (drop remark-math and let the dollars through to the
    // client-side auto-render, which is what Hugo does), was made for three reasons: the page
    // arrives typeset instead of flashing its source until a CDN answers, the CDN is no longer a
    // dependency of the page rendering correctly, and no visitor-side JavaScript runs for it at
    // all. The stylesheet that KaTeX's markup needs is imported in src/layouts/Base.astro from
    // the npm package, so nothing about the math is fetched from a third-party host any more.
    // Changed 2026-10-10 (T025): the three entries that stood here (remarkPlugins [remarkMath], rehypePlugins
    // [rehypeKatex] and the Shiki themes github-light / github-dark, the closest match to the theme's Chroma
    // styles, MIGRATION-PLAN.md section 6) are in src/markdown/options.ts now, unchanged.
    ...markdownOptions,
  },

  devToolbar: {
    // (English, added 2026-09-22 next to the note on the line below: this switches off Astro's dev
    // toolbar, the overlay that would otherwise sit at the bottom of every page of `npm run dev`.)
    enabled: false, // это отключает панель devToolbar-Astro
  },

  // Added 2026-09-26 at the owner's request, after the sign-up form rendered nothing on a dev server
  // that had been running since before @clerk/ui was installed: the browser asked for Clerk's SignUp
  // chunk from node_modules/.vite/deps, Vite answered "504 (Outdated Optimize Dep)" because it had
  // just discovered the package and re-bundled its dependencies mid-session, and the dynamic import
  // failed. Listing the Clerk packages and React here makes Vite pre-bundle them when the dev server
  // starts instead of on the first visit to an auth page. It affects `astro dev` only; `astro build`
  // does not use the dependency optimizer. If the error still appears after a package change,
  // `npm run dev:clean` empties the cache (package.json says how).
  //
  // Corrected 2026-09-28, at the owner's request after "X [ERROR] The build was canceled" showed at
  // the top of every `npm run build`: the sentence above about `astro build` is wrong. The build
  // starts with the content sync, which runs a temporary Vite dev server
  // (syncContentCollections in node_modules/astro/dist/core/sync/index.js), and that server began
  // pre-bundling this list; the sync closed it about two seconds later, esbuild's bundling was cut
  // off, and esbuild printed that error. The built site was never affected. The list therefore left
  // `vite` for the integration "clerk-prebundle-dev-only" in `integrations` above, which adds it
  // through `updateConfig` only when the hook's `command` is "dev" (astro:config:setup, Astro 4
  // Integration API; 4.16 passes "dev", "build", "preview" or "sync").
  // Checked the same night: the build prints no such line, still builds every page, and its
  // `[types]` step fell from about 2 s to under 1 s; `astro dev` still pre-bundles the five
  // packages. One side effect, accepted: the sync's server now finishes, and writes Astro's own
  // three small dependencies into node_modules/.vite/deps, so the first `astro dev` after a build
  // bundles the list again, a few seconds once. Before, the cut-off run left that folder alone.
});
