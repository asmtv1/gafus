/**
 * Articles Routes — endpoints для mobile.
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import {
  getArticles,
  getArticleBySlug,
  toggleArticleLike,
  incrementArticleView,
} from "@gafus/core/services/article";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-articles");

export const articlesRoutes = new Hono();

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
    const isLiked = await toggleArticleLike(user.id, id);
    return c.json({ success: true, data: { isLiked } });
  } catch (error) {
    logger.error("Error in article like POST", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

const slugParamSchema = z.object({ slug: z.string().min(1) });

const viewParamSchema = z.object({ slug: z.string().min(1) });

articlesRoutes.post("/:slug/view", zValidator("param", viewParamSchema), async (c) => {
  try {
    const { slug } = c.req.valid("param");
    const result = await incrementArticleView(slug);
    return c.json(result.success ? { success: true } : { success: false, error: result.error }, 200);
  } catch (error) {
    logger.error("Error in article view POST", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

articlesRoutes.get("/:slug", zValidator("param", slugParamSchema), async (c) => {
  try {
    const user = c.get("user");
    const { slug } = c.req.valid("param");
    const result = await getArticleBySlug(slug, user.id);
    if (!result.success) {
      return c.json(result, 404);
    }
    return c.json(result);
  } catch (error) {
    logger.error("Error in article detail GET", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});
