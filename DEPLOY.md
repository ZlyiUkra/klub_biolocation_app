# Deploying to GitHub Pages

Written on 2026-09-13 from the state of `git@github.com:Debi7/klub_biolocation_astro.git` on that day. This is an
analysis of why the first deployment attempt does not work and a step-by-step plan to fix it. Nothing described
here has been applied to the repository yet.

The public address of the site is not decided yet. Section 2 defines the placeholders every step is written
against, and section 5 lists the three possible shapes of the address. Fill in the decision record in section 2
when the choice is made and substitute the values in the steps.

**Read section 0 first: most of what follows describes a state the repository has left.** The address was chosen,
the repository was renamed and the site has been live since before 2026-09-22. Sections 1, 3 and 4 are kept as the
record of why the first attempt failed, and section 6 is still the procedure that was followed, but neither
describes the repository as it is today.

## 0. Current state, verified 2026-09-22

Everything in this section was measured, not assumed: the remote was read with `git`, the addresses with `curl`.

- **Option B was taken.** The repository is `git@github.com:Debi7/Debi7.github.io.git`; `origin` points there, and
  `https://github.com/Debi7/klub_biolocation_astro` answers 301 to the new name, which is GitHub's redirect for a
  renamed repository. So the project owns the account's user site, exactly as section 5 describes Option B.
- **The site is live.** `https://debi7.github.io/` answers 200 and serves this project's build - the canonical link,
  `og:site_name` and the Russian `lang` are ours - and so do `/video/` and `/video/video-1/`, the section added on
  2026-09-20 to 2026-09-22. `https://debi7.github.io/klub_biolocation_astro/` answers 404, which is right: under a
  user site that path never existed.
- **GitHub Actions does the building.** `.github/workflows/deploy.yml` is on `origin/main` (and on the working
  branches). It runs `withastro/action@v3`, which does `npm ci` and `astro build` and uploads `dist/` as the Pages
  artifact, then `actions/deploy-pages@v4` publishes it. So problem 3 of section 1 - "nothing builds the site on
  GitHub" - is solved.
- **`astro.config.mjs` is correct for this address.** `site: "https://debi7.github.io/"` and no `base`, which is
  what Option B needs. The link sweep of section 7 is not needed and should not be done.
- **The published site is behind the branch.** A live post still carries `og:type="website"`, the fault fixed on
  2026-09-22; that fix and the ones after it are on `video-page-v1` and reach the site when it is merged into
  `main`, since only a push to `main` triggers the workflow.

What is still open, and all of it is the owner's to do, because nothing here changes anything on GitHub by itself:

- **The two leftover branches from the first attempt are still on the remote**: `gh-pages`, which holds the source
  tree rather than a built site, and `gh-pages"` with the literal double quote in its name. Neither is used by the
  Pages deployment any more, and both are confusing to anyone reading the branch list. Step 1 of section 6 has the
  commands; the quoted one needs its name quoted on the command line.
- **Check Settings > Pages once**: the source has to be "GitHub Actions", not "Deploy from a branch". The site being
  live from a workflow run says it already is, but it is worth seeing.
- **Merge `video-page-v1` into `main`** when the work on it is done, which is what publishes it.

Changed here on 2026-09-22: the workflow gained a `concurrency` group, so two pushes to `main` in quick succession
cannot start two deployments that race each other; a run that is already publishing is left to finish. The Russian
comment in it has an English note beside it now, as the house rule asks, and the original was left in place.

## 1. Summary

The site does not appear on GitHub Pages (`https://debi7.github.io/klub_biolocation_astro/` answers HTTP 404)
because nothing has been built and published. Five separate things are wrong, and they have to be fixed in order:

1. The wrong npm package was installed. `github-pages` is an abandoned package (last release June 2022, built on a
   dead GitHub API client). The tool the tutorials mean is `gh-pages`. The `homepage` field that was added to
   `package.json` is a Create React App convention; Astro ignores it.
2. The remote branch is called `gh-pages"` - with a literal double quote at the end - and it contains the source
   tree, not the built site. GitHub Pages has nothing it can serve from it.
3. There is no build step on GitHub. There is no workflow under `.github/workflows/`, and `dist/` is git-ignored,
   so the generated HTML never reaches GitHub in any form.
4. `astro.config.mjs` still says `site: "http://localhost:1313/"` and sets no `base`. Every canonical and Open Graph
   URL in the built pages points at localhost.
5. The address the site will live at has not been decided, and it changes the amount of work. A project site
   (`debi7.github.io/klub_biolocation_astro/`) needs a `base` path, and every internal link in the source is written
   root-relative (`/posts/...`, `/tags/...`, `/images/...`) on purpose, because the URLs must match the Hugo site.
   Under a base path all of those links break. A user site (`debi7.github.io/`) or a custom domain does not have
   this problem.

Recommendation: decide the address first (section 5), then deploy with GitHub Actions (section 6). The path that
changes no page source at all is a user site or a custom domain; a project site costs a sweep over thirteen source
files (section 7).

## 2. Parameters used in this document

- `SITE_URL`: the public address of the site, with a trailing slash. It is what visitors type and what the
  verification in step 6 checks against.
- `BASE_PATH`: the path under which the site is mounted. `/` for a user site or a custom domain;
  `/klub_biolocation_astro` for a project site. Only a project site sets `base` in `astro.config.mjs`.
- `GITHUB_USER`: the account that owns the repository the site is published from. Today that is `Debi7`, so the
  Pages host is `debi7.github.io`. If the site is published from another account, replace it throughout.

Decision record:

- Option chosen (A, B or C from section 5): **B, the user site.** The repository was renamed to
  `Debi7/Debi7.github.io`, which is what serves `debi7.github.io`.
- `SITE_URL`: `https://debi7.github.io/` - the value already in `astro.config.mjs`, and the canonical link the
  live pages carry.
- `BASE_PATH`: `/`. No `base` in `astro.config.mjs`, and section 7's link sweep is not needed. Astro's own
  deployment guide only asks for `base` when the site is served from `github.io/<repo>`, which this one is not.
- Decided by, on: the owner, before 2026-09-22; recorded here on 2026-09-22 from the state of the remote and of
  the live site, since the record had been left blank. Section 0 lists what was measured.

## 3. What is on GitHub right now (observed 2026-09-13)

- Remote: `git@github.com:Debi7/Debi7.github.io.git` (corrected 2026-09-25: this line said `klub_biolocation_astro.git`, the name observed on 2026-09-13, and the repository has been `Debi7.github.io` since at least 2026-09-22, the name the merge commits carry). Public repository, default branch `main`.
- Branches on the remote: `main` and `gh-pages"` (the quote is part of the name). Both point at the same commit,
  `04b5631`.
- Commit `04b5631` ("github-pages") changed only `package.json` and `package-lock.json`. It added
  `"homepage": "https://debi7.github.io/klub_biolocation_astro/"` and the devDependency `github-pages@^3.0.2`, which
  brought 589 lines into the lockfile.
- There is no `.github/` directory in the repository. No workflow has ever run.
- `dist/` and `node_modules/` are in `.gitignore`, which is correct. It also means no build output exists on any
  branch.
- The repository API reports `has_pages: true`, so Pages was switched on in the settings, most likely as "Deploy
  from a branch" pointing at `gh-pages"` or `main`. Neither branch contains an `index.html`, hence the 404.
- `https://debi7.github.io/klub_biolocation_astro/` answers 404. `https://debi7.github.io/` answers 404 as well, so
  the account has no user site yet and that address is free.

## 4. The problems in detail

### 4.1 `github-pages` is not `gh-pages`

Two packages with similar names exist on npm:

- `gh-pages` (author tschaub, version 6.x, maintained). Builds nothing; it takes a directory and force-pushes its
  contents to a branch, by default `gh-pages`. This is what the guides on the web refer to.
- `github-pages` (author cantidio, version 3.0.2, last published 2022-06-18). Depends on `github@0.2.4`, an API
  client that stopped working years ago, plus `meow@3` and `pkg-conf@1`. It cannot publish anything today.

`package.json` and `package-lock.json` currently carry the second one. It does no harm to the build, but it is dead
weight, and it will confuse the next person who reads `package.json`. The `homepage` field was added because Create
React App uses it to derive the public path; Astro reads `site` and `base` from `astro.config.mjs` instead and never
looks at `homepage`.

### 4.2 The `gh-pages"` branch

- The name ends with a double quote. That is almost certainly a shell quoting slip, for example
  `git push origin main:gh-pages"` typed into cmd.exe, which passes the quote through literally.
- Its content is identical to `main`: the source tree. GitHub Pages needs a tree with `index.html` at the top, which
  is what `astro build` writes into `dist/`.
- Even with the correct name and the correct content there is a second trap. "Deploy from a branch" runs the
  published tree through Jekyll, and Jekyll ignores every directory whose name starts with an underscore. Astro puts
  all CSS and JavaScript under `_astro/`. The result is a site with no styles and no scripts. A file named
  `.nojekyll` at the root of the published tree switches Jekyll off. The GitHub Actions path in section 6 does not
  run Jekyll at all, which is one reason to prefer it.

### 4.3 Nothing builds the site on GitHub

Astro is a static site generator. Somebody has to run `npm ci` and `npm run build` and put the resulting `dist/`
where Pages can see it. Today nothing does that: no workflow exists, and `dist/` is (correctly) never committed. The
two ways to close the gap are a GitHub Actions workflow that builds on every push to `main` (section 6) or a manual
local build pushed to a branch with the real `gh-pages` package (section 8).

### 4.4 `site` and `base` in `astro.config.mjs`

Current value:

```js
site: "http://localhost:1313/",
```

`Astro.site` feeds `src/layouts/Base.astro` (`baseUrl`, `permalink`), `src/layouts/ArticleLayout.astro` (the share
widget URL) and `src/lib/seo.ts` (share image URLs). With the current value the built pages carry
`http://localhost:1313/...` in the canonical link, the Open Graph tags and the share buttons. `site` has to be the
public origin before the first real deploy. Whether `base` is needed depends on the decision in section 2.

### 4.5 Root-relative links versus a project-site base path

Astro's `base` option tells Astro where the site is mounted. Astro then prefixes the URLs it generates itself: the
`_astro/` asset links and the dev-server routes. It does not rewrite links written by hand in templates. This
project writes every internal link root-relative on purpose, because the URLs have to be the same as on the Hugo
site (`reference/hugo-routes.txt` is the contract, and `CLAUDE.md` explains why `/images/carousel/01.jpg` must stay
verbatim). Under `base: "/klub_biolocation_astro"` those links resolve to `https://debi7.github.io/posts/...`, which
is a different, non-existent site.

Files that carry such literals (found with grep on 2026-09-13):

- `src/config.ts`: the five menu URLs and the avatar path.
- `src/components/Head.astro`: five favicon and manifest links.
- `src/components/Carousel.astro`: the slide `src`, built as `/images/carousel/<name>`.
- `src/components/PostList.astro`, `src/components/PostNav.astro`, `src/components/Terms.astro`,
  `src/layouts/ArticleLayout.astro`, `src/pages/categories/index.astro`, `src/pages/tags/index.astro`,
  `src/pages/tags/[slug]/[...page].astro`: post, tag and category links. (That last route was
  `src/pages/tags/[slug].astro` until the lists got pagination on 2026-09-19.)
- `src/lib/posts.ts` (`pageUrl`, `yearLinks`, `paginateByYear`), with the bases given by
  `src/pages/posts/[...page].astro`, `src/pages/tags/[slug]/[...page].astro` and
  `src/pages/categories/[slug]/[...page].astro`, and rendered by `src/components/Pagination.astro` and
  `src/components/YearSwitcher.astro` inside `ListByYear.astro`: the Previous, Next and page-number links of the
  paginated lists and the year switcher's links, built from `/posts/`, `/tags/` and `/categories/` (added 2026-09-19,
  every list by year since that evening; see PAGINATION.md).
- `src/layouts/Base.astro`: `share.defaultImage`, `avatar.url`, and `isHome`, which tests
  `Astro.url.pathname === "/"`.
- `src/components/Menu.astro`: the active-item check compares `Astro.url.pathname` with the menu URLs. Under a base
  path the pathname is `/klub_biolocation_astro/posts/`, so no item is ever marked current.
- `public/favicon/site.webmanifest`: icon paths in a static file that Astro does not process.

Thirteen source files plus one static file. Beyond the edit itself, the markup-parity check described in `CLAUDE.md`
(diffing `<main>` against the Hugo output) would report every `href` as changed, so the deviation would have to be
recorded in `MIGRATION-PLAN.md` section 9. `CLAUDE.md` also parks every "idiomatic Astro" change until the port is
finished, and a base-path sweep sits squarely in that area. This is why the address decision is not a detail.

### 4.6 Node 20 is pinned

`.npmrc` contains `engine-strict=true` and `package.json` requires Node `>=20.0.0 <21`. On a build runner with Node
22, `npm ci` refuses to install and the workflow fails before Astro even starts. The workflow must pin Node 20.

## 5. The address: three possible shapes

### Option A: project site

- `SITE_URL` = `https://debi7.github.io/klub_biolocation_astro/`, `BASE_PATH` = `/klub_biolocation_astro`.
- No changes to the repository on GitHub.
- Requires `base` in `astro.config.mjs` and the link sweep from section 4.5 (thirteen source files, the manifest,
  and a note in `MIGRATION-PLAN.md` section 9).
- The Hugo-parity checks stop being byte-comparable for links.

### Option B: user site

- `SITE_URL` = `https://debi7.github.io/`, `BASE_PATH` = `/`.
- Rename the repository to `Debi7.github.io` (Settings > General > Repository name). GitHub redirects the old name
  for git operations, but the `origin` URL should be updated on every machine anyway.
- No page source changes at all; only `site` changes.
- Cost: the account's one and only user site is taken by this project, and the repository name no longer says what
  the project is. Both are reversible: rename back when the site moves to its real domain.
- Variant B2: keep this repository as it is and let the workflow push the built `dist/` into a separate
  `Debi7.github.io` repository (for example `peaceiris/actions-gh-pages` with `external_repository` and a deploy
  key). It works, but it adds a secret to manage and a second repository to keep in sync. Not worth it for a
  preview.

### Option C: custom domain

- `SITE_URL` = `https://<club-domain>/`, `BASE_PATH` = `/`.
- Settings > Pages > Custom domain: enter the domain. With a GitHub Actions deployment no `CNAME` file is needed in
  the repository; GitHub keeps the domain in the Pages settings.
- DNS at the registrar: a `CNAME` record `www -> debi7.github.io`, or the four GitHub Pages `A` records for the bare
  domain. Propagation can take up to a day. Tick "Enforce HTTPS" once the certificate has been issued.
- No page source changes; only `site` changes. This is what Hugo's `baseURL` was going to become anyway.
- Needs access to DNS, which may not be available right now.

### Which one

Options B and C change nothing in `src/` and keep the Hugo parity intact. Option A works too, but only after the
sweep in section 7 and after the owner agrees to amend the parity constraint. Whichever is chosen, write it into the
decision record in section 2; every step below reads the values from there.

## 6. Steps for the recommended path (GitHub Actions)

The steps are written for `BASE_PATH` = `/` (Options B and C). Where Option A differs it is marked.

### Step 1: clean up the earlier attempt

On any machine, inside the working copy on `main`:

```
npm uninstall github-pages
```

This removes the package from `package.json` and from the lockfile. Then delete the `homepage` line from
`package.json` by hand; `npm uninstall` does not touch it. Run `npm run check` to confirm nothing else moved, and
commit, for example as "Remove the github-pages package and the homepage field".

Delete the mis-named branch. The quote is part of the branch name, so the shell must not eat it. The most reliable
way is the GitHub web UI: repository page > "Branches" > the trash icon next to `gh-pages"`. From the command line,
use Git Bash (PowerShell 5.1 does not pass embedded double quotes to native programs reliably):

```
git push origin --delete 'gh-pages"'
```

Afterwards, on every machine that has fetched the branch:

```
git fetch --prune
```

`git branch -r` should then list only `origin/main` (and `origin/HEAD`).

### Step 2: set the public address in `astro.config.mjs`

Before:

```js
  // Mirrors baseURL in ../klub_biolocation/hugo.toml. Set the public URL before deploying.
  site: "http://localhost:1313/",
```

After, Options B and C (`site` is `SITE_URL`):

```js
  // Public address of the GitHub Pages deployment (no base path). Replaces the localhost
  // baseURL from ../klub_biolocation/hugo.toml. See DEPLOY.md.
  site: "<SITE_URL>",
```

After, Option A (`site` is the origin only, `base` is `BASE_PATH`; together they form `SITE_URL`):

```js
  // Project site on GitHub Pages: origin in `site`, repository name in `base`. See DEPLOY.md.
  site: "https://debi7.github.io",
  base: "/klub_biolocation_astro",
```

plus the sweep in section 7.

### Step 3: repository settings on GitHub

- Settings > Pages > "Build and deployment" > Source: **GitHub Actions**. Not "Deploy from a branch". This is the
  setting that currently points at a branch without content, and it is what makes Jekyll irrelevant.
- Option B only: Settings > General > Repository name: `Debi7.github.io`. Then on each machine:

  ```
  git remote set-url origin git@github.com:Debi7/Debi7.github.io.git
  ```

- Option C only: Settings > Pages > Custom domain, then the DNS records from section 5.
- Settings > Actions > General: "Allow all actions and reusable workflows" is the default for a public repository
  and is enough. The workflow uses `actions/checkout`, `withastro/action` and `actions/deploy-pages`.

### Step 4: add the workflow

Create `.github/workflows/deploy.yml` with the workflow below. It is the one from the Astro documentation with Node
pinned to 20. It is the same for all three options.

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Install, build and upload
        uses: withastro/action@v3
        with:
          # .npmrc has engine-strict=true and package.json requires Node 20.
          node-version: 20

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy
        id: deployment
        uses: actions/deploy-pages@v4
```

What each part does:

- `permissions`: `pages: write` and `id-token: write` let the deploy job publish through GitHub's OIDC token. No
  personal access token and no secret are needed.
- `withastro/action@v3` detects npm from `package-lock.json`, runs `npm ci` and then `npm run build`, and uploads
  `dist/` as the Pages artifact. Because it runs `npm ci`, the lockfile must match `package.json`; step 1 keeps it
  that way. If detection ever misfires, add `package-manager: npm@10` under `with:`.
- `actions/deploy-pages@v4` takes that artifact and publishes it. No `gh-pages` branch, no Jekyll, no `.nojekyll`.
- `workflow_dispatch` adds a "Run workflow" button in the Actions tab for manual redeploys.

Prettier formats YAML, and `.prettierignore` does not exclude `.github/`, so run `npm run fix` after saving the
file; otherwise `npm run check` reports it.

### Step 5: commit, push, watch

- Commit the workflow together with the `astro.config.mjs` change to `main` and push.
- Actions tab: a run named "Deploy to GitHub Pages" appears with two jobs. `build` takes about a minute on a cold
  cache; `deploy` a few seconds.
- The `deploy` job prints the public URL in its summary. It must equal `SITE_URL`.
- If `deploy` fails with "Not Found" or "Ensure GitHub Pages has been enabled", the source in step 3 is still set to
  a branch.

### Step 6: verify

- Open `SITE_URL`. The carousel, the header and the menu must render exactly as they do locally under
  `npm run preview`.
- Every route in `reference/hugo-routes.txt`, except the Hugo-only `/page/1/` aliases, must answer 200. From
  PowerShell in the working copy, with `SITE_URL` filled in (the routes in the file start with `/`, so the trailing
  slash is trimmed first; this works for all three options):

  ```
  $site = "<SITE_URL>".TrimEnd("/")
  Get-Content -Encoding UTF8 reference/hugo-routes.txt |
    Where-Object { $_ -notmatch '/page/1/$' } |
    ForEach-Object {
      $u = "$site$_"
      try { $r = Invoke-WebRequest -Uri $u -Method Head -UseBasicParsing; "$($r.StatusCode) $u" }
      catch { "FAIL $u" }
    }
  ```

- View the page source: `<link rel="canonical">` and `og:url` must start with `SITE_URL`, not with
  `http://localhost:1313/`.
- Browser network tab: the `_astro/*.css` and `_astro/*.js` requests must be 200. A 404 there means Jekyll
  processed the tree, which means the source is still "Deploy from a branch".
- `src/content/posts/draft.md` must not appear in the post list. The production build filters `draft: true` (see
  `src/lib/posts.ts`), so a visible draft means the build ran in dev mode.

### Step 7: bookkeeping in the repository

- `README.md`: replace the "Deployment" note with the address, the fact that every push to `main` deploys, and
  where the workflow lives.
- `MIGRATION-PLAN.md` section 9: record the address decision. For Option A, also record the base-path deviation.
- `CLAUDE.md`, "Git" section: it still says the directory is not a git repository. It has been one since
  2026-09-13.
- The `astro.config.mjs` comment "Set the public URL before deploying" can go once the URL is set.
- This file: fill in the decision record in section 2 and remove the "nothing applied yet" sentence at the top.

## 7. Option A only: the base-path sweep

Skip this section for Options B and C.

- Add a small helper, for example `src/lib/base.ts` exporting `withBase(path: string): string`, that prefixes
  `import.meta.env.BASE_URL`. Check the exact value first: put `console.log(import.meta.env.BASE_URL)` into any
  frontmatter and run `npm run build`. In Astro 4 the trailing slash of `BASE_URL` follows the `trailingSlash`
  option (`"always"` here), so the helper must not produce a double slash.
- Replace every literal listed in section 4.5 with a call to the helper, keeping the class attributes and the rest
  of the markup untouched.
- `src/components/Menu.astro` and `src/layouts/Base.astro`: strip `import.meta.env.BASE_URL` from
  `Astro.url.pathname` before comparing with `/`, `/posts/` and the menu URLs.
- `public/favicon/site.webmanifest`: prefix the icon paths by hand; it is a static file. (The paths there currently
  point at the site root, while the PNG files live under `/favicon/`. That is a pre-existing inconsistency, not a
  Pages problem.)
- The route-parity check is unchanged: `dist/` keeps the same layout regardless of `base`; only the URLs inside the
  pages change.
- The markup-parity diff will show the prefix on every link. Record it in `MIGRATION-PLAN.md` section 9 as an
  accepted deviation.
- Local development: `npm run dev` then serves the site under `http://localhost:4321/klub_biolocation_astro/`; the
  bare root shows Astro's own "not found" page. That is expected behaviour with `base` set.

## 8. Alternative: branch deployment with the real `gh-pages` package

Only if a GitHub Actions workflow is unwanted. This is the manual route that the earlier attempt was aiming at.

- Install the right package: `npm install --save-dev gh-pages`. Per `CLAUDE.md` a new dependency needs the owner's
  agreement: it is `gh-pages` by tschaub, about 40 packages including its own dependencies, used only from the
  command line.
- Create an empty file `public/.nojekyll`. Astro copies `public/` into `dist/` verbatim, so the marker lands at the
  root of the published tree and keeps `_astro/` alive.
- Add a script to `package.json`:

  ```json
  "deploy": "astro build && gh-pages -d dist --dotfiles"
  ```

  `--dotfiles` matters: without it `gh-pages` skips `.nojekyll`.

- Settings > Pages > Source: "Deploy from a branch", branch `gh-pages`, folder `/ (root)`.
- Run `npm run deploy` from a machine with Node 20 and push rights.

Drawbacks compared with section 6: the deploy is a manual step that somebody has to remember; whoever deploys needs
a working local build; the `gh-pages` branch history grows with every deploy; and two people can silently overwrite
each other's deployment. Section 6 removes all four.

## 9. Checklist

1. Fill in the decision record in section 2 (Option A, B or C; `SITE_URL`; `BASE_PATH`).
2. `npm uninstall github-pages`, remove `homepage`, commit.
3. Delete the `gh-pages"` branch, `git fetch --prune` everywhere.
4. Set `site` (and `base` for Option A) in `astro.config.mjs`.
5. Settings > Pages > Source: GitHub Actions. Option B: rename the repository and update `origin`. Option C: custom
   domain and DNS.
6. Add `.github/workflows/deploy.yml`, run `npm run fix`, `npm run check`, `npm run build` locally.
7. Commit, push, watch the Actions run.
8. Verify the routes, the canonical URLs and the `_astro/` assets against `SITE_URL`.
9. Update `README.md`, `MIGRATION-PLAN.md`, `CLAUDE.md` and this file.
