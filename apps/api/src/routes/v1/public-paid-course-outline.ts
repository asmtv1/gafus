import { Hono } from "hono";
import { publicPaidCourseOutlineApplication } from "../../modules/courses/composition/read-public-outline.js";

/** Next paid-course landing: only public course marketing data and day titles.
 * No private courses, user progress, step text/media, monetization targets or
 * user identities. Actual /training/day and /gafus/unlock stay owner-protected.
 */
export const publicPaidCourseOutlineRoutes = new Hono();
publicPaidCourseOutlineRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
});
publicPaidCourseOutlineRoutes.get("/:courseType", async c => {
  const type = c.req.param("courseType");
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(type)) {
    return c.json({ success: false, error: "Некорректный адрес" }, 400);
  }
  try {
    const outcome = await publicPaidCourseOutlineApplication.execute({ courseType: type });
    if (outcome.kind === "not_found") {
      return c.json({ success: false, error: "Курс не найден" }, 404);
    }
    return c.json({ success: true, data: outcome.data });
  } catch {
    return c.json({ success: false, error: "Не удалось загрузить программу курса" }, 500);
  }
});
