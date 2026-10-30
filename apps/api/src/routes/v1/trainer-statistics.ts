/**
 * G1 scoped Trainer Statistics — AG4-approved aggregate, read-only boundary.
 *
 * JWT actor and rate-limit/private headers are wired by apps/api/src/app.ts.
 * Never trust client-supplied isElevated/userId; validate a trainer target
 * against the actual current DB role before invoking the Core statistics engine.
 */
import { Hono } from "hono";
import type {TrainerCourseStatisticsRead,TrainerStepStatisticsRead} from
  "../../../../../packages/types/src/data/trainer-read-contracts";
import { prisma } from "@gafus/prisma";
import { readTrainerStatisticsApplication } from "../../modules/trainer-statistics/composition/read-trainer-statistics.js";
import { resolveTrainerStatisticsScope } from "../../lib/trainer-statistics-g1-proposal.js";

export const trainerStatisticsRoutes = new Hono();

const isExistingTrainer = async (userId: string): Promise<boolean> => {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return target?.role === "TRAINER";
};

trainerStatisticsRoutes.get("/courses", async (c) => {
  try {
    const access = await resolveTrainerStatisticsScope(
      c.get("user"),
      c.req.queries(),
      isExistingTrainer,
    );
    if (!access.ok) {
      return c.json(
        { success: false, code: access.code, error: access.error },
        access.status,
      );
    }
    const { userId, isElevated } = access.scope;
    const data = await readTrainerStatisticsApplication.courses({ userId, isElevated });
    return c.json({ success: true, data } satisfies TrainerCourseStatisticsRead);
  } catch {
    return c.json({
      success: false,
      code: "INTERNAL_SERVER_ERROR",
      error: "Внутренняя ошибка сервера",
    }, 500);
  }
});

trainerStatisticsRoutes.get("/steps", async (c) => {
  try {
    const access = await resolveTrainerStatisticsScope(
      c.get("user"),
      c.req.queries(),
      isExistingTrainer,
    );
    if (!access.ok) {
      return c.json(
        { success: false, code: access.code, error: access.error },
        access.status,
      );
    }
    const { userId, isElevated } = access.scope;
    const data = await readTrainerStatisticsApplication.steps({ userId, isElevated });
    return c.json({ success: true, data } satisfies TrainerStepStatisticsRead);
  } catch {
    return c.json({
      success: false,
      code: "INTERNAL_SERVER_ERROR",
      error: "Внутренняя ошибка сервера",
    }, 500);
  }
});
