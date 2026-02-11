import { Hono } from "hono";
import { getStudentNotes } from "@gafus/core/services/notes";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-notes");
export const notesRoutes = new Hono();

notesRoutes.get("/student", async (c) => {
  try {
    const user = c.get("user");
    const notes = await getStudentNotes(user.id);
    return c.json({ success: true, data: notes });
  } catch (error) {
    logger.error("GET notes/student error", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка" }, 500);
  }
});

