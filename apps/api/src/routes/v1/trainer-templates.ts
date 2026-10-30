/**
 * AG4(v5) TR013 frozen read-only public template list for authenticated panel.
 * Existing Core owns isPublic/category filtering and DB order; this route
 * verifies the query/actor and explicitly projects the frozen HTTP DTO.
 */
import { Hono } from "hono";
import type { TrainerPublicStepTemplatesRead } from
  "../../../../../packages/types/src/data/trainer-read-contracts";
import { readPublicTemplatesApplication } from "../../modules/trainer-templates/composition/read-public-templates.js";

export const trainerTemplatesRoutes = new Hono();

trainerTemplatesRoutes.get("/", async c => {
  const query = c.req.queries();
  if (Object.keys(query).some(key => key !== "categoryId") ||
      (query.categoryId !== undefined && query.categoryId.length !== 1) ||
      c.req.raw.body !== null) {
    return c.json({
      success: false, code: "BAD_QUERY", error: "Некорректный запрос",
    }, 400);
  }
  const actor = c.get("user");
  if (!["TRAINER", "ADMIN", "MODERATOR"].includes(actor.role)) {
    return c.json({
      success: false, code: "FORBIDDEN", error: "Недостаточно прав",
    }, 403);
  }
  const categoryId = query.categoryId?.[0] || undefined;
  try {
    // Core always includes isPublic:true and applies the category when truthy.
    const data = await readPublicTemplatesApplication.execute({ categoryId });
    return c.json({ success: true, data } satisfies TrainerPublicStepTemplatesRead);
  } catch {
    // Do not leak Prisma errors, private template rows, identities or stacks.
    return c.json({
      success: false, code: "INTERNAL_SERVER_ERROR",
      error: "Внутренняя ошибка сервера",
    }, 500);
  }
});
