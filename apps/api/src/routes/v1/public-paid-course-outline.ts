import { Hono } from "hono";
import { getCourseMetadata, getCourseOutline } from "@gafus/core/services/course";

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
    const metadata = await getCourseMetadata(type);
    if (!metadata || metadata.isPrivate || !metadata.isPaid) {
      return c.json({ success: false, error: "Курс не найден" }, 404);
    }
    const outline = await getCourseOutline(type);
    if (!Array.isArray(outline)) throw Error("INVALID_COURSE_OUTLINE");
    const rows = outline.map(item => {
      if (!item || !/^[A-Za-z0-9_-]{1,128}$/.test(item.id) ||
          typeof item.title !== "string" || !item.title.trim() ||
          !Number.isSafeInteger(item.order) || item.order < 0) {
        throw Error("INVALID_COURSE_OUTLINE");
      }
      return { id: item.id, title: item.title, order: item.order,
        type: item.type, equipment: item.equipment,
        estimatedDuration: item.estimatedDuration, theoryMinutes: item.theoryMinutes };
    });
    if (new Set(rows.map(item => item.id)).size !== rows.length) {
      throw Error("DUPLICATE_OUTLINE_DAY");
    }
    return c.json({ success: true, data: {
      courseId: metadata.id,
      courseType: type,
      name: metadata.name,
      description: metadata.description ?? metadata.shortDesc ?? null,
      equipment: metadata.equipment ?? null,
      trainingLevel: metadata.trainingLevel ?? null,
      outline: rows,
    } });
  } catch {
    return c.json({ success: false, error: "Не удалось загрузить программу курса" }, 500);
  }
});
