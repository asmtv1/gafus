/**
 * TR014 exact frozen GET daily-course bundles for trainer panel.
 * Delegates solely to EXISTING Core getDailyCourseBundles policy:
 * TRAINER author-owned; ADMIN/MODERATOR all authors.
 * No import/confirm/cleanup/schedule/step candidates or write endpoint.
 */
import { Hono } from "hono";
import type {
  TrainerDailyBundlesRead,
  TrainerDailyBundleStepCandidatesRead,
  TrainerDailyScheduleRangeRead,
  TrainerDailyCandidatesRead,
} from "../../../../../packages/types/src/data/trainer-read-contracts";
import { dailyCourseRangeSchema } from "@gafus/core/services/dailyCourse";
import { readTrainerDailyApplication } from "../../modules/trainer-daily/composition/read-trainer-daily.js";

export const trainerDailyBundlesRoutes = new Hono();

trainerDailyBundlesRoutes.get("/bundles", async (c) => {
  // Exactly one read operation; no client owner/admin selector or other query.
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
    const data = await readTrainerDailyApplication.bundles({
      id: actor.id, role: actor.role,
    });
    return c.json({ success: true, data } satisfies TrainerDailyBundlesRead);
  } catch {
    // No private Prisma/actor/error text. A fault must NOT masquerade as [].
    return c.json({
      success: false, code: "INTERNAL_SERVER_ERROR",
      error: "Внутренняя ошибка сервера",
    }, 500);
  }
});


// AG1 continuation130 TR014 sibling READ needed by the same legacy Next page.
// Keep Core role and eligible-step WHERE logic as the sole source of truth.
// This route is NOT a schedule, import, cleanup or bundle mutation.
trainerDailyBundlesRoutes.get("/bundle-step-candidates", async (c) => {
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
    const data = await readTrainerDailyApplication.bundleStepCandidates({
      id: actor.id, role: actor.role,
    });
    return c.json({ success: true, data } satisfies TrainerDailyBundleStepCandidatesRead);
  } catch {
    return c.json({
      success: false, code: "INTERNAL_SERVER_ERROR",
      error: "Внутренняя ошибка сервера",
    }, 500);
  }
});


// Continuation131: existing Next dailyCoursePageData schedule range read.
// Exact Core date schema and role/owner query are the sole policy source.
trainerDailyBundlesRoutes.get("/schedule-range", async (c) => {
  const query = c.req.queries();
  const fields = Object.keys(query);
  if (fields.length !== 2 || !fields.includes("from") || !fields.includes("to") ||
      query.from?.length !== 1 || query.to?.length !== 1 ||
      c.req.raw.body !== null) {
    return c.json({
      success: false, code: "BAD_QUERY", error: "Некорректный запрос",
    }, 400);
  }
  const parsed = dailyCourseRangeSchema.safeParse({
    from: query.from[0], to: query.to[0],
  });
  if (!parsed.success) {
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
    const data = await readTrainerDailyApplication.scheduleRange({
      id: actor.id, role: actor.role,
    }, parsed.data);
    return c.json({ success: true, data } satisfies TrainerDailyScheduleRangeRead);
  } catch {
    return c.json({
      success: false, code: "INTERNAL_SERVER_ERROR",
      error: "Внутренняя ошибка сервера",
    }, 500);
  }
});


// AG1 cont132: the SECOND read of existing calendar Next getDailyCoursePageData.
// Leave all bundle step eligibility and updatedAt sorting inside ACTUAL Core.
trainerDailyBundlesRoutes.get("/candidates", async c => {
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
    const data = await readTrainerDailyApplication.candidates({
      id: actor.id, role: actor.role,
    });
    return c.json({ success: true, data } satisfies TrainerDailyCandidatesRead);
  } catch {
    return c.json({
      success: false, code: "INTERNAL_SERVER_ERROR",
      error: "Внутренняя ошибка сервера",
    }, 500);
  }
});
