import { Hono, type TypedResponse } from "hono";
import type { StudentNotesRead } from "../../../../../packages/types/src/data/notes";
import { readStudentNotesApplication } from "../../modules/student-notes/composition/read-student-notes.js";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-notes");
export const notesRoutes = new Hono();

// Trainer notes belong to the authenticated student and must never be shared
// by browser caches, including after a service failure.
notesRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
  c.header("Cache-Control", "private, no-store");
});

notesRoutes.get("/student", async (c) => {
  try {
    const user = c.get("user");
    const notes = await readStudentNotesApplication.execute(user.id);
    return c.json({ success: true, data: notes }) satisfies Response &
      TypedResponse<StudentNotesRead>;
  } catch {
    // A provider exception can embed sensitive trainer/student note content.
    logger.error("GET notes/student error");
    return c.json({ success: false, error: "Внутренняя ошибка" }, 500);
  }
});
