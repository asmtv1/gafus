import type { ArticleListDto } from "@gafus/types";
import { apiRequest } from "../../shared/api/client";

/** Only catalog teasers, NEVER article content, video URLs or paid galleries. */
export type ArticleCard = Pick<
  ArticleListDto,
  | "id"
  | "slug"
  | "title"
  | "description"
  | "visibility"
  | "hasAccess"
  | "likeCount"
  | "authorUsername"
> & { logoImg?: string; viewCount?: number; isLiked?: boolean };

function isArticle(row: unknown): row is ArticleCard {
  if (!row || typeof row !== "object") return false;
  const article = row as Record<string, unknown>;
  return (
    typeof article.id === "string" &&
    /^[A-Za-z0-9_-]{1,128}$/.test(article.id) &&
    typeof article.slug === "string" &&
    /^[\p{L}\p{N}_-]{1,120}$/u.test(article.slug) &&
    typeof article.title === "string" &&
    typeof article.description === "string" &&
    ["PUBLIC", "PAID"].includes(String(article.visibility)) &&
    typeof article.hasAccess === "boolean" &&
    Number.isSafeInteger(article.likeCount) &&
    Number(article.likeCount) >= 0 &&
    typeof article.authorUsername === "string"
  );
}

/** Original Next catalog cover is a public image; paid article images/videos
 * are NOT part of this projection. Accept only the established CDN public
 * article cover namespace, with no signed query, traversal or credentials.
 */
export function safeArticleCover(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim() || raw.length > 2048 ||
      raw.includes("%") || raw.includes("\\") || raw.includes("..") ||
      Array.from(raw).some(char => char.charCodeAt(0) < 32)) return null;
  const prefix = "https://storage.yandexcloud.net/gafus-media/";
  const relative = raw.replace(/^\/+/, "");
  const path = new RegExp(
    "^uploads/trainers/[A-Za-z0-9_-]+/articles/[A-Za-z0-9_-]+/" +
    "[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*$",
  );
  if (path.test(relative)) return prefix + relative;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password ||
        url.search || url.hash || url.port) return null;
    if (url.hostname === "storage.yandexcloud.net" &&
        path.test(url.pathname.replace(/^\/gafus-media\//, ""))) return url.href;
    if (url.hostname === "gafus-media.storage.yandexcloud.net" &&
        path.test(url.pathname.replace(/^\//, ""))) return url.href;
  } catch { return null; }
  return null;
}

/** Next cover precedence with the Core-owned first-image teaser fallback.
 * Do not expose any private gallery arrays through this catalog DTO. */
export function resolveArticleCatalogCover(
  raw: ArticleCard & { imageUrls?: unknown; logoImg?: unknown },
): string | null {
  const logo = safeArticleCover(raw.logoImg);
  if (logo) return logo;
  const imageUrls = raw.imageUrls;
  return Array.isArray(imageUrls) ? safeArticleCover(imageUrls[0]) : null;
}

export async function listMyArticles(): Promise<ArticleCard[]> {
  const data = await apiRequest<unknown>("/api/v1/articles");
  if (!Array.isArray(data) || !data.every(isArticle)) {
    throw new Error("Сервер вернул некорректный список статей");
  }
  // Duplicate IDs corrupt React card identity; duplicate slugs create
  // ambiguous deep links. Reject the entire malformed API page.
  const ids = new Set(data.map((article) => article.id));
  const slugs = new Set(data.map((article) => article.slug));
  if (ids.size !== data.length || slugs.size !== data.length) {
    throw new Error("Сервер вернул некорректный список статей");
  }
  return data.map((article) => {
    const cover = resolveArticleCatalogCover(article);
    return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    description: article.description,
    visibility: article.visibility,
    hasAccess: article.hasAccess,
    likeCount: article.likeCount,
    authorUsername: article.authorUsername,
    // Original Next: logoImg || imageUrls[0]. The registered Core article
    // catalog intentionally publishes only the FIRST image as a cover when
    // access is locked. Never cache the gallery or reveal a second image.
    // Both sources must pass the existing public article-cover allowlist.
    ...(cover ? { logoImg: cover } : {}),
    ...(typeof (article as ArticleListDto).viewCount === "number" &&
      Number.isSafeInteger((article as ArticleListDto).viewCount) &&
      (article as ArticleListDto).viewCount >= 0 ?
      { viewCount: (article as ArticleListDto).viewCount } : {}),
    ...(typeof (article as ArticleListDto).isLiked === "boolean" ?
      { isLiked: (article as ArticleListDto).isLiked } : {}),
    };
  });
}

export type ArticleDetails = ArticleCard & {
  contentType: "TEXT" | "HTML";
  content: string | null;
  isLiked: boolean;
  createdAt: string | null;
  imageUrls: string[];
  videoUrl: string | null;
};

/** Render only concrete HTTPS URLs emitted by Core, never infer an S3/CDN
 * host from a provider object key or expose media for locked articles. */
function safeArticleMediaUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 4096) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.hash)
      return null;
    return url.href;
  } catch { return null; }
}

/** Original registered Hono per-owner article view POST. The backend
 * deduplicates by article/user; never retry an unknown POST acknowledgement.
 * This is only called AFTER successful fresh detail GET by the UI. */
export async function registerMyArticleView(slug: string): Promise<void> {
  if (!/^[\p{L}\p{N}_-]{1,120}$/u.test(slug))
    throw new Error("Некорректный адрес статьи");
  await apiRequest<void>("/api/v1/articles/" + encodeURIComponent(slug) + "/view", {
    method: "POST", json: {}, browserAuth: true, expectedStatus: 200,
  });
}

export type ArticleLikeAck = { isLiked: boolean };
export async function toggleMyArticleLike(id: string): Promise<ArticleLikeAck> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw Error("INVALID_ARTICLE_ID");
  const data = await apiRequest<unknown>("/api/v1/articles/" + id + "/like", {
    method: "POST", browserAuth: true, expectedStatus: 200,
  });
  if (!data || typeof data !== "object" ||
      typeof (data as Record<string, unknown>).isLiked !== "boolean")
    throw Error("INVALID_ARTICLE_LIKE_ACK");
  return { isLiked: (data as { isLiked: boolean }).isLiked };
}


export async function getMyArticle(slug: string): Promise<ArticleDetails> {
  if (!/^[\p{L}\p{N}_-]{1,120}$/u.test(slug)) {
    throw new Error("Некорректный адрес статьи");
  }
  const raw = await apiRequest<unknown>("/api/v1/articles/" + encodeURIComponent(slug));
  if (!isArticle(raw) || !raw || typeof raw !== "object") {
    throw new Error("Сервер вернул некорректную статью");
  }
  const article = raw as Record<string, unknown>;
  if (
    !["TEXT", "HTML"].includes(String(article.contentType)) ||
    !(article.content === null || typeof article.content === "string") ||
    (raw.hasAccess === false && article.content !== null) ||
    (raw.hasAccess && article.content === null)
  ) {
    throw new Error("Некорректные данные о доступе к статье");
  }
  return {
    id: raw.id,
    slug: raw.slug,
    title: raw.title,
    description: raw.description,
    visibility: raw.visibility,
    hasAccess: raw.hasAccess,
    likeCount: raw.likeCount,
    authorUsername: raw.authorUsername,
    contentType: article.contentType as "TEXT" | "HTML",
    content: article.content as string | null,
    isLiked: typeof article.isLiked === "boolean" ? article.isLiked : false,
    createdAt: typeof article.createdAt === "string" &&
      Number.isFinite(Date.parse(article.createdAt)) ? article.createdAt : null,
    imageUrls: raw.hasAccess && Array.isArray(article.imageUrls)
      ? [...new Set(article.imageUrls.map(safeArticleMediaUrl).filter(
        (url): url is string => url !== null,
      ))].slice(0, 20) : [],
    videoUrl: raw.hasAccess ? safeArticleMediaUrl(article.videoUrl) : null,
  };
}
