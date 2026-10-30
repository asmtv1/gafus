/** Anonymous Next-parity article teasers. The protected /articles endpoints
 * remain unchanged: no owner, like, purchase or private content mutation here.
 */
import { Hono } from "hono";
import { getArticles, getArticleBySlugForMonetizedAccess, incrementArticleView } from "@gafus/core/services/article";

export const publicArticlesRoutes = new Hono();
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const validSlug = (value: string) => /^[\p{L}\p{N}_-]{1,120}$/u.test(value);

publicArticlesRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
});

publicArticlesRoutes.get("/", async (c) => {
  try {
    const result = await getArticles();
    if (!result.success) return c.json({ success: false, error: "Не удалось загрузить статьи" }, 500, headers);
    // No authorId, avatar, content, paid image arrays or video URLs.
    return c.json({ success: true, data: result.data.map((article) => ({
      id: article.id, slug: article.slug, title: article.title,
      description: article.description, visibility: article.visibility,
      hasAccess: false, likeCount: article.likeCount,
      isLiked: false, authorUsername: article.authorUsername,
      logoImg: article.logoImg, viewCount: article.viewCount,
    })) }, 200, headers);
  } catch {
    return c.json({ success: false, error: "Не удалось загрузить статьи" }, 500, headers);
  }
});

publicArticlesRoutes.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  if (!validSlug(slug)) return c.json({ success: false, error: "Некорректный адрес" }, 400, headers);
  try {
    const result = await getArticleBySlugForMonetizedAccess({ slug, platform: "WEB_DESKTOP" });
    if (!result.success) return c.json({ success: false,
      error: result.error === "Статья не найдена" ? "Статья не найдена" : "Не удалось открыть статью" },
      result.error === "Статья не найдена" ? 404 : 500, headers);
    const article = result.data;
    // Fail closed even when a misconfigured Core feature flag would grant
    // entitlement to a guest: anonymous responses are ALWAYS teaser-only.
    return c.json({ success: true, data: {
      id: article.id, slug: article.slug, title: article.title,
      description: article.description, visibility: article.visibility,
      hasAccess: false, likeCount: article.likeCount,
      isLiked: false, authorUsername: article.authorUsername,
      contentType: article.contentType, content: null,
      createdAt: article.createdAt, imageUrls: [], videoUrl: null,
    } }, 200, headers);
  } catch {
    return c.json({ success: false, error: "Не удалось открыть статью" }, 500, headers);
  }
});

/** Guest view counter parity with Next; Core validates/deduplicates the key.
 * No caller-provided userId/entitlement accepted, rate-limited at app boundary.
 */
publicArticlesRoutes.post("/:slug/view", async (c) => {
  const slug = c.req.param("slug");
  if (!validSlug(slug)) return c.json({ success: false, error: "Некорректный адрес" }, 400, headers);
  const body = await c.req.json().catch(() => null) as { visitorKey?: unknown } | null;
  const visitorKey = body?.visitorKey;
  if (typeof visitorKey !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(visitorKey)) {
    return c.json({ success: false, error: "Некорректный посетитель" }, 400, headers);
  }
  try {
    const result = await incrementArticleView(slug, { guestVisitorKey: visitorKey });
    return result.success
      ? c.json({ success: true }, 200, headers)
      : c.json({ success: false, error: "Не удалось учесть просмотр" }, 500, headers);
  } catch {
    return c.json({ success: false, error: "Не удалось учесть просмотр" }, 500, headers);
  }
});
