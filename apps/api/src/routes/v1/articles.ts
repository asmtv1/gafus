/**
 * Articles Routes — endpoints для mobile.
 */
import { Hono, type Context } from "hono";
import { z } from "zod/v3";
import { zValidator } from "@hono/zod-validator";

import {
  getArticles,
  getArticleBySlugForMonetizedAccess,
  toggleArticleLikeWithMonetizedAccess,
  incrementArticleView,
} from "@gafus/core/services/article";
import { SubscriptionOrCreditsRequiredError } from "@gafus/core/services/rewardedCredits";
import { createWebLogger } from "@gafus/logger";
import { getBrowserAccessToken } from "../../lib/browser-auth.js";

const logger = createWebLogger("api-articles");

export const articlesRoutes = new Hono();
// Authenticated articles and their mutations must not enter shared browser caches,
// including validation failures and Core error responses.
articlesRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  await next();
});
const platformQuerySchema = z.object({ platform: z.enum(["ANDROID", "IOS"]).optional() });

function getArticlePlatform(c: Context): "ANDROID" | "IOS" | "WEB_DESKTOP" {
  // AuthMiddleware accepts a browser's HttpOnly access cookie only if no
  // Bearer header was sent. Such requests must NEVER be classified as Android
  // merely because the caller omits the platform parameter (or spoofs one).
  if (!c.req.header("Authorization") && getBrowserAccessToken(c)) {
    return "WEB_DESKTOP";
  }
  const parsed = platformQuerySchema.safeParse({
    platform: c.req.query("platform") ?? c.req.header("x-client-platform"),
  });
  return parsed.success ? (parsed.data.platform ?? "ANDROID") : "ANDROID";
}

articlesRoutes.get("/", async (c) => {
  try {
    const user = c.get("user");
    const result = await getArticles(user.id);
    if (!result.success) {
      return c.json(result, 500, {
        "Cache-Control": "no-store",
      });
    }
    return c.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    logger.error("Error in articles GET", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500, {
      "Cache-Control": "private, no-store",
    });
  }
});

const likeParamSchema = z.object({ id: z.string().min(1) });

articlesRoutes.post("/:id/like", zValidator("param", likeParamSchema), async (c) => {
  try {
    const user = c.get("user");
    const { id } = c.req.valid("param");
    const isLiked = await toggleArticleLikeWithMonetizedAccess({
      userId: user.id,
      articleId: id,
      platform: getArticlePlatform(c),
    });
    return c.json({ success: true, data: { isLiked } });
  } catch (error) {
    // Built Core and API source may load different class constructors.
    // Match the explicit stable denied-access code; never map unknown failures to 402.
    if (
      error instanceof SubscriptionOrCreditsRequiredError ||
      (error instanceof Error &&
        "code" in error &&
        error.code === "SUBSCRIPTION_OR_CREDITS_REQUIRED")
    ) {
      return c.json(
        {
          success: false,
          error: "Для действия нужна подписка или доступ к статье за просмотр рекламы",
          code: "SUBSCRIPTION_OR_CREDITS_REQUIRED",
        },
        402,
      );
    }
    if (error instanceof Error && error.message === "ARTICLE_NOT_FOUND") {
      return c.json({ success: false, error: "Статья не найдена", code: "NOT_FOUND" }, 404);
    }
    logger.error("Error in article like POST", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

const slugParamSchema = z.object({ slug: z.string().min(1) });

const viewParamSchema = z.object({ slug: z.string().min(1) });

articlesRoutes.post("/:slug/view", zValidator("param", viewParamSchema), async (c) => {
  try {
    const { slug } = c.req.valid("param");
    const user = c.get("user");
    let guestVisitorKey: string | null = null;
    try {
      const body = (await c.req.json()) as { visitorKey?: unknown };
      if (typeof body?.visitorKey === "string") {
        guestVisitorKey = body.visitorKey;
      }
    } catch {
      // без JSON-тела
    }
    const result = await incrementArticleView(slug, {
      viewerUserId: user?.id,
      guestVisitorKey,
    });
    return c.json(
      result.success ? { success: true } : { success: false, error: result.error },
      200,
    );
  } catch (error) {
    logger.error("Error in article view POST", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

articlesRoutes.get("/:slug", zValidator("param", slugParamSchema), async (c) => {
  try {
    const user = c.get("user");
    const { slug } = c.req.valid("param");
    const result = await getArticleBySlugForMonetizedAccess({
      slug,
      userId: user.id,
      platform: getArticlePlatform(c),
    });
    if (!result.success) {
      // Core distinguishes a genuinely absent slug from a storage/entitlement
      // failure. Never present an upstream error as a successful empty record
      // or a permanent 404, which could be negatively cached by clients.
      return c.json(result, result.error === "Статья не найдена" ? 404 : 500, {
        "Cache-Control": "private, no-store",
      });
    }
    return c.json(result, 200, {
      "Cache-Control": "private, no-store",
    });
  } catch (error) {
    logger.error("Error in article detail GET", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500, {
      "Cache-Control": "private, no-store",
    });
  }
});
