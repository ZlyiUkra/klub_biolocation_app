// Types and helpers behind src/components/SEO.astro: they resolve the social title, description,
// share image and locale for a page. Added with SEO.astro, which duplicates the head tags that
// Head.astro already renders; ARTICLE-PAGE-FIX.md section 7.1 tracks that.
//
// Changed 2026-09-16: an unused `CollectionEntry` import was removed from the top of this file,
// which was the last astro check warning here.

export interface SiteConfig {
  title: string;
  baseUrl: string;
  language?: string;
  share?: {
    defaultImage?: string;
  };
  avatar?: {
    url?: string;
  };
}

export interface PageLike {
  title?: string;
  description?: string;
  summary?: string;
  content?: string;
  permalink: string;
  isHome: boolean;
  isPage: boolean;
  /**
   * The page shows a video as its subject, so Open Graph calls it `video.other` rather than
   * `article`. Added 2026-09-22: `Base.astro` had accepted an `isVideo` prop since the video
   * section was built, but nothing carried it any further, and it was the one warning
   * `astro check` reported (`isVideo is declared but its value is never read`). A plain flag
   * rather than the entry itself, so that nothing here learns what a collection is.
   */
  isVideo?: boolean;
  publishDate?: Date;
  updatedDate?: Date;
  tags?: string[];
  params: {
    share_title?: string;
    share_description?: string;
    share_image?: string;
    cover?: string;
    image?: string;
    featured_image?: string;
    images?: string | string[];
  };
}

/** Убирает HTML-теги и декодирует сущности, схлопывает пробелы, обрезает до 160 символов. */
export function plainify(input: string): string {
  return input
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncate(input: string, length: number): string {
  if (input.length <= length) return input;
  return input.slice(0, length - 1).trimEnd() + "…";
}

export function resolveSocialTitle(page: PageLike, site: SiteConfig): string {
  if (page.params.share_title) return page.params.share_title;
  if (!page.isHome && page.title) return page.title;
  return site.title;
}

export function resolveDescription(page: PageLike, site: SiteConfig): string {
  let description = page.params.share_description ?? "";
  if (!description && page.description) description = page.description;
  if (!description && page.summary) description = plainify(page.summary);
  if (!description && page.content) description = plainify(page.content);
  if (!description) description = site.title;
  return truncate(plainify(description), 160);
}

export function resolveShareImage(page: PageLike, site: SiteConfig): string {
  const candidate =
    page.params.share_image ??
    page.params.cover ??
    page.params.image ??
    page.params.featured_image ??
    (Array.isArray(page.params.images)
      ? page.params.images[0]
      : page.params.images);

  if (candidate) {
    if (/^https?:\/\//.test(candidate)) return candidate;
    return new URL(candidate, site.baseUrl).toString();
  }

  if (page.isPage) {
    // В Hugo .Resources.ByType "image" — в Astro это обычно коллекция
    // или известный путь; при необходимости передайте сюда первый image из ресурсов.
  }

  if (site.share?.defaultImage) {
    return new URL(site.share.defaultImage, site.baseUrl).toString();
  }
  if (site.avatar?.url) {
    return new URL(site.avatar.url, site.baseUrl).toString();
  }
  return "";
}

export function resolveLocale(site: SiteConfig): string {
  if (site.language === "ru") return "ru_RU";
  return "en_US";
}

export function toIso(date?: Date): string | undefined {
  return date ? date.toISOString() : undefined;
}
