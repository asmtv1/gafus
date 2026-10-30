/**
 * AG4 frozen existing getVisibleDays READ — registered trainer panel GET only.
 * Delegates author/elevated visibility to actual existing Core. All ORM
 * INCLUDE relation extras are dropped by an explicit output whitelist.
 */
import { Hono } from "hono";
import type { TrainerVisibleDaysRead } from
  "../../../../../packages/types/src/data/trainer-read-contracts";
import { readVisibleDaysApplication } from "../../modules/trainer-days/composition/read-visible-days.js";
export type { VisibleDayDto } from "../../modules/trainer-days/application/read-visible-days.js";

export const trainerDaysRoutes = new Hono();

trainerDaysRoutes.get("/", async c => {
  if (Object.keys(c.req.queries()).length !== 0 || c.req.raw.body !== null) {
    return c.json({
      success: false, code: "BAD_QUERY", error: "Некорректный запрос",
    }, 400);
  }
  const actor = c.get("user");
  if (actor.role !== "TRAINER" && actor.role !== "ADMIN" && actor.role !== "MODERATOR") {
    return c.json({
      success: false, code: "FORBIDDEN", error: "Недостаточно прав",
    }, 403);
  }
  try {
    const elevated = actor.role === "ADMIN" || actor.role === "MODERATOR";
    const data = await readVisibleDaysApplication.execute({
      actorUserId: actor.id,
      elevated,
    });
    return c.json({ success: true, data } satisfies TrainerVisibleDaysRead);
  } catch {
    // The legacy Next reader throws on DB failures; do not turn this into [].
    return c.json({
      success: false, code: "INTERNAL_SERVER_ERROR",
      error: "Внутренняя ошибка сервера",
    }, 500);
  }
});
