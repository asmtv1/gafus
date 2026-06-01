/**
 * Articles Routes — endpoints для mobile.
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import {
  getArticles,
  getArticleBySlugForMonetizedAccess,
  toggleArticleLikeWithMonetizedAccess,
  incrementArticleView,
  unlockArticleBySlug,
} from "@gafus/core/services/article";
import {
  RewardedCreditsRequiredError,
  SubscriptionOrCreditsRequiredError,
} from "@gafus/core/services/rewardedCredits";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-articles");

export const articlesRoutes = new Hono();
const platformQuerySchema = z.object({ platform: z.enum(["ANDROID", "IOS"]).optional() });

function getArticlePlatform(c: {
  req: { query(name: string): string | undefined; header(name: string): string | undefined };
}): "ANDROID" | "IOS" {
  const parsed = platformQuerySchema.safeParse({
    platform: c.req.query("platform") ?? c.req.header("x-client-platform"),
  });
  return parsed.success ? (parsed.data.platform ?? "ANDROID") : "ANDROID";
}

articlesRoutes.get("/", async (c) => {
  try {
    const user = c.get("user");
    const result = await getArticles(user.id);
    return c.json(result, {
      headers: { "Cache-Control": "private, max-age=0, must-revalidate" },
    });
  } catch (error) {
    logger.error("Error in articles GET", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
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
    if (
      error instanceof SubscriptionOrCreditsRequiredError ||
      error instanceof RewardedCreditsRequiredError
    ) {
      return c.json(
        {
          success: false,
          error: "Для действия нужна подписка или rewarded credits",
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
      return c.json(result, 404);
    }
    return c.json(result);
  } catch (error) {
    logger.error("Error in article detail GET", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

articlesRoutes.post("/:slug/unlock", zValidator("param", slugParamSchema), async (c) => {
  try {
    const user = c.get("user");
    const { slug } = c.req.valid("param");
    const result = await unlockArticleBySlug({
      slug,
      userId: user.id,
      platform: getArticlePlatform(c),
    });
    return c.json(result, result.success ? 200 : 404);
  } catch (error) {
    if (
      error instanceof SubscriptionOrCreditsRequiredError ||
      error instanceof RewardedCreditsRequiredError
    ) {
      return c.json(
        {
          success: false,
          error: "Для действия нужна подписка или rewarded credits",
          code: "SUBSCRIPTION_OR_CREDITS_REQUIRED",
        },
        402,
      );
    }
    logger.error("Error in article unlock POST", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});
