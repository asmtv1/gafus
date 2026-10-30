/**
 * AG1 cont137: existing Trainer ExamResult LIST, summary-only.
 * Core owns ordinary/daily course author visibility. No writes and no
 * learner /exam/result/notes/staff notes review or provider route reuse.
 */
import { Hono } from "hono";
import { readTrainerExamMetadataApplication } from "../../modules/trainer-exam/composition/read-trainer-exam-metadata.js";
import type {TrainerExamSummaryRead,TrainerPendingExamSummaryRead} from
  "../../../../../packages/types/src/data/trainer-read-contracts";

export const trainerExamSummaryRoutes = new Hono();

trainerExamSummaryRoutes.get("/summary", async (c) => {
  if (Object.keys(c.req.queries()).length !== 0 || c.req.raw.body !== null) {
    return c.json({
      success: false, code: "BAD_QUERY", error: "Некорректный запрос",
    }, 400);
  }
  const actor = c.get("user");
  if (actor.role !== "TRAINER" && actor.role !== "ADMIN") {
    return c.json({
      success: false, code: "FORBIDDEN", error: "Недостаточно прав",
    }, 403);
  }
  try {
    const rows = await readTrainerExamMetadataApplication.summary({
      actorUserId: actor.id,
      isAdmin: actor.role === "ADMIN",
    });
    const data = { success: true, data: rows } satisfies TrainerExamSummaryRead;
    return c.json(data, 200);
  } catch {
    return c.json({
      success: false, code: "INTERNAL_SERVER_ERROR",
      error: "Внутренняя ошибка сервера",
    }, 500);
  }
});

// AG1 cont138: ordinary pending exam LIST only, bound to existing Next/Core
// TRAINER/MODERATOR own authored courses, ADMIN all. No review links or PII.
trainerExamSummaryRoutes.get("/pending-summary", async (c) => {
  if (Object.keys(c.req.queries()).length !== 0 || c.req.raw.body !== null) {
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
  try {
    const rows = await readTrainerExamMetadataApplication.pendingSummary({
      actorUserId: actor.id,
      isAdmin: actor.role === "ADMIN",
    });
    const data: TrainerPendingExamSummaryRead = {
      success: true, data: rows,
    };
    return c.json(data, 200);
  } catch {
    return c.json({
      success: false, code: "INTERNAL_SERVER_ERROR",
      error: "Внутренняя ошибка сервера",
    }, 500);
  }
});
