// Lists the HTML routes the running server answers (task T039 of specs/001-self-hosted-club-site).
//
// Until T032 the list of routes was `find dist -name index.html`; with the posts, lists, tags and categories rendered
// on demand there is no file to find, so the routes are discovered the way a visitor or a crawler finds them: from
// the home page and the sitemap, following every internal link whose address ends in a slash, plus a short list of
// pages that nothing links to (the sign-in pages, the admin shells, search). A route counts when it answers 200 with
// HTML. The output is one address per line, sorted, in the format of reference/hugo-routes.txt.
//
// Usage:  node scripts/list-routes.mjs [origin]  > reference/astro-routes.txt
//         (origin defaults to CHECK_ORIGIN, then http://127.0.0.1:3000; the server must be running, npm run dev:site)

const origin = (
  process.argv[2] ??
  process.env.CHECK_ORIGIN ??
  "http://127.0.0.1:3000"
).replace(/\/$/, "");

// Not linked from anywhere a crawler would start; see the header.
const seeds = [
  "/",
  "/search/",
  "/auth/signin/",
  "/auth/signup/",
  "/auth/account/",
  "/admin/posts/",
  "/admin/users/",
];

const found = new Set();
const queue = [...seeds];
const seen = new Set(queue);

function enqueue(address) {
  if (seen.has(address)) return;
  seen.add(address);
  queue.push(address);
}

// The addresses of the sitemap are absolute and carry the site's public origin; only the path matters here.
async function sitemapPaths() {
  const paths = [];
  const index = await fetch(`${origin}/sitemap-index.xml`);
  if (!index.ok) return paths;
  const sitemaps = [
    ...(await index.text()).matchAll(/<loc>([^<]+)<\/loc>/g),
  ].map((m) => new URL(m[1]).pathname);
  for (const sitemap of sitemaps) {
    const response = await fetch(origin + sitemap);
    if (!response.ok) continue;
    for (const m of (await response.text()).matchAll(/<loc>([^<]+)<\/loc>/g))
      paths.push(new URL(m[1]).pathname);
  }
  return paths;
}

for (const address of await sitemapPaths()) enqueue(address);

while (queue.length > 0) {
  const address = queue.shift();
  const response = await fetch(origin + address, { redirect: "manual" });
  const type = response.headers.get("content-type") ?? "";
  if (response.status !== 200 || !type.includes("text/html")) continue;
  found.add(decodeURIComponent(address));
  const html = await response.text();
  for (const m of html.matchAll(/<a\b[^>]*?\shref="([^"#?]+)"/g)) {
    const href = m[1];
    if (!href.startsWith("/") || href.startsWith("//")) continue;
    if (!href.endsWith("/")) continue;
    enqueue(href);
  }
}

console.log([...found].sort().join("\n"));
