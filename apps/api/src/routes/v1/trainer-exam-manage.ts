/** Full trainer exam review read/write API; owner checks remain in Core. */
import { Hono } from "hono";
import { z } from "zod/v3";
import {
  getExamResults,
  reviewExamResult,
  type ExamResultWithDetails,
  type ReviewExamResultData,
} from "@gafus/core/services/exam";

type Reviewer = { id: string; role: string };
export interface TrainerExamManagePorts {
  list: (
    userId: string,
    options: { hideCompleted: boolean },
    isAdmin: boolean,
  ) => Promise<ExamResultWithDetails[]>;
  review: (
    reviewerId: string,
    reviewerRole: string,
    data: ReviewExamResultData,
  ) => Promise<{ success?: boolean; error?: string }>;
}
const production: TrainerExamManagePorts = { list: getExamResults, review: reviewExamResult };
const bad = { success: false, code: "BAD_INPUT", error: "Некорректный запрос" } as const;
const denied = { success: false, code: "FORBIDDEN", error: "Недостаточно прав" } as const;
const failed = {
  success: false,
  code: "INTERNAL_SERVER_ERROR",
  error: "Не удалось выполнить операцию",
} as const;
const reviewerRoles = new Set(["TRAINER", "ADMIN", "MODERATOR"]);
const actionSchema = z
  .object({
    userStepId: z.string().min(1).max(120),
    action: z.enum(["approve", "reject"]),
    trainerComment: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();

function actorFrom(c: { get: (key: "user") => unknown }): Reviewer | null {
  const value = c.get("user");
  if (
    !value ||
    typeof value !== "object" ||
    !("id" in value) ||
    !("role" in value) ||
    typeof value.id !== "string" ||
    typeof value.role !== "string" ||
    !value.id ||
    !reviewerRoles.has(value.role)
  )
    return null;
  return { id: value.id, role: value.role };
}
const jsonContent = (value?: string) => /^application\/json(?:\s*;|\s*$)/i.test(value ?? "");

/** Deliberately whitelist detail fields; never serialize nested Prisma user/profile. */
export function examToTrainerDto(result: ExamResultWithDetails) {
  const step = result.userStep.stepOnDay.step;
  const user = result.userStep.userTraining.user;
  const course = result.userStep.userTraining.dayOnCourse.course;
  return {
    id: result.id,
    userStepId: result.userStep.id,
    status: result.userStep.status,
    createdAt: result.createdAt.toISOString(),
    reviewedAt: result.reviewedAt?.toISOString() ?? null,
    courseName: course.name,
    courseType: course.type,
    stepTitle: step.title,
    hasTestQuestions: step.hasTestQuestions,
    requiresWrittenFeedback: step.requiresWrittenFeedback,
    requiresVideoReport: step.requiresVideoReport,
    userName: user.profile?.fullName ?? user.username,
    testScore: result.testScore,
    testMaxScore: result.testMaxScore,
    testAnswers: result.testAnswers,
    writtenFeedback: result.writtenFeedback,
    videoReportUrl: result.videoReportUrl,
    trainerComment: result.trainerComment,
    overallScore: result.overallScore,
    isPassed: result.isPassed,
    reviewedBy: result.reviewedBy?.profile?.fullName ?? result.reviewedBy?.username ?? null,
  };
}
export function createTrainerExamManageRoutes(ports: TrainerExamManagePorts = production) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    c.header("Referrer-Policy", "no-referrer");
    c.header("Vary", "Cookie");
    await next();
    c.header("Cache-Control", "private, no-store");
  });
  app.get("/", async (c) => {
    const actor = actorFrom(c);
    if (!actor) return c.json(denied, 403);
    if (Object.keys(c.req.queries()).length || c.req.raw.body !== null) return c.json(bad, 400);
    try {
      const rows = await ports.list(actor.id, { hideCompleted: false }, actor.role === "ADMIN");
      return c.json({ success: true, data: rows.map(examToTrainerDto) }, 200);
    } catch {
      return c.json(failed, 500);
    }
  });
  app.post("/review", async (c) => {
    const actor = actorFrom(c);
    if (!actor) return c.json(denied, 403);
    const length = c.req.header("content-length");
    if (
      Object.keys(c.req.queries()).length ||
      !jsonContent(c.req.header("content-type")) ||
      (length && (!/^\d+$/.test(length) || Number(length) > 4000))
    )
      return c.json(bad, 400);
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) return c.json(bad, 400);
    try {
      const result = await ports.review(actor.id, actor.role, {
        userStepId: parsed.data.userStepId,
        action: parsed.data.action,
        trainerComment: parsed.data.trainerComment || null,
      });
      if (!result.success) return c.json(failed, 409);
      return c.json({ success: true }, 200);
    } catch {
      return c.json(failed, 500);
    }
  });
  return app;
}
export const trainerExamManageRoutes = createTrainerExamManageRoutes();
