/** Staff-owned article metadata and author-authorized viewer details. */
import { Hono } from "hono";
import { getArticleViewersForAuthor } from "@gafus/core/services/article";
import { z } from "zod/v3";
import { readTrainerOwnArticleMetadataApplication } from "../../modules/trainer-articles/composition/read-own-article-metadata.js";
import type { TrainerArticleOwnMetadataRead } from "../../../../../packages/types/src/data/trainer-read-contracts";

const idPattern = /^[a-zA-Z0-9_-]{1,128}$/;
const validViewer = z.object({
  userId: z.string().min(1), username: z.string(), fullName: z.string().nullable(),
  lastViewedAt: z.string().datetime(),
}).strict();
type ViewerReader = typeof getArticleViewersForAuthor;
const staffUser = (user: unknown): user is { id: string; role: string } =>
  !!user && typeof user === "object" && "id" in user && "role" in user &&
  typeof user.id === "string" && !!user.id && typeof user.role === "string" &&
  ["TRAINER", "ADMIN"].includes(user.role);

export function createTrainerArticlesOwnSummaryRoutes(
  viewerRead: ViewerReader = getArticleViewersForAuthor,
) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    c.header("Referrer-Policy", "no-referrer");
    c.header("Vary", "Cookie");
    await next();
    c.header("Cache-Control", "private, no-store");
  });
  app.get("/own-summary", async c => {
    const actor: unknown = c.get("user");
    if (!staffUser(actor))
      return c.json({ success: false, code: "FORBIDDEN", error: "Недостаточно прав" }, 403);
    if (new URL(c.req.url).search !== "" || c.req.raw.body !== null)
      return c.json({ success: false, code: "BAD_QUERY", error: "Некорректный запрос" }, 400);
    try {
      const { articles } = await readTrainerOwnArticleMetadataApplication.execute({
        actorUserId: actor.id,
      });
      const payload: TrainerArticleOwnMetadataRead = { success: true, data: { articles } };
      return c.json(payload, 200);
    } catch {
      return c.json({ success: false, code: "INTERNAL_SERVER_ERROR", error: "Внутренняя ошибка сервера" }, 500);
    }
  });
  // Guest views are included in aggregated viewCount but have no viewer record.
  // Even ADMIN can read only viewers of their OWN articles, as in Next.
  app.get("/own-summary/:id/viewers", async c => {
    const actor: unknown = c.get("user");
    if (!staffUser(actor)) return c.json({ success: false, code: "FORBIDDEN" }, 403);
    const id = c.req.param("id");
    if (!idPattern.test(id) || new URL(c.req.url).search !== "" || c.req.raw.body !== null)
      return c.json({ success: false, code: "BAD_QUERY" }, 400);
    try {
      const result = await viewerRead(id, actor.id);
      if (!result.success) return c.json({ success: false, code: "NOT_FOUND" }, 404);
      const checked = z.array(validViewer).max(10000).safeParse(result.data);
      if (!checked.success) throw Error("INVALID_VIEWER_PROJECTION");
      return c.json({ success: true, data: { viewers: checked.data } }, 200);
    } catch {
      return c.json({ success: false, code: "INTERNAL_SERVER_ERROR" }, 500);
    }
  });
  return app;
}
export const trainerArticlesOwnSummaryRoutes = createTrainerArticlesOwnSummaryRoutes();
