/**
 * Refactor trainer authoring bridge. No Next server actions and no client-supplied
 * authorId. Reuses existing validated Core writes, never writes to Main.
 */
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod/v3";
import { prisma } from "@gafus/prisma";
import { createArticle as createArticleCore, createArticleSchema } from
  "@gafus/core/services/article";
import {
  createCourse as createCourseCore, createTrainerCourseSchema,
  type CreateTrainerCourseInput,
} from "@gafus/core/services/trainerCourse";
import {
  createStep as createStepCore,
  createStepSchema,
  type CreateStepInput,
} from "@gafus/core/services/trainerStep";
import {
  createTrainingDay as createTrainingDayCore,
  createTrainingDaySchema,
  type CreateTrainingDayInput,
} from "@gafus/core/services/trainingDay";

const staffRoles = new Set(["TRAINER", "ADMIN"]);
const jsonContent = (type: string | undefined) =>
  type?.split(";")[0]?.trim().toLowerCase() === "application/json";
const plain = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const noUnknown = (v: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(v).every(k => keys.includes(k));
const stepKeys = [
  "title", "description", "type", "durationSec", "estimatedDurationSec", "videoUrl",
  "imageUrls", "pdfUrls", "checklist", "requiresVideoReport", "requiresWrittenFeedback",
  "hasTestQuestions", "surveySlug", "isDailyCourse",
] as const;
const courseKeys = [
  "name", "guideContent", "shortDesc", "description", "duration", "videoUrl",
  "logoImg", "isPublic", "isPaid", "showInProfile", "isPersonalized",
  "trainingDays", "allowedUsers", "equipment", "trainingLevel",
] as const;
const articleKeys = [
  "title", "contentType", "content", "visibility", "videoUrl", "logoImg",
  "imageUrls", "slug", "description",
] as const;
const dayKeys = [
  "title", "description", "type", "equipment", "showCoursePathExport",
  "shareProgressAcrossCourses", "stepIds",
] as const;

// Prevent cross-owner linking of trainer-owned steps, before Core creates joins.
const createDayBodySchema = createTrainingDaySchema.omit({ authorId: true }).strict()
  .extend({ stepIds: z.array(z.string().min(1)).max(250) })
  .refine(value => new Set(value.stepIds).size === value.stepIds.length, {
    message: "Повторяющиеся шаги", path: ["stepIds"],
  });

type WriteResult = { success?: boolean; error?: string; dayId?: string };
export type TrainerAuthoringPorts = {
  createCourse: (input: CreateTrainerCourseInput, actorId: string) =>
    Promise<{ success?: boolean; id?: string }>;
  countOwnedDays: (ids: string[], actorId: string, elevated: boolean) => Promise<number>;
  createArticle: (body: Record<string, unknown>, actorId: string) =>
    Promise<{ success?: boolean; data?: { id: string; slug: string } }>;
  createStep: (input: CreateStepInput, actorId: string) => Promise<WriteResult>;
  createDay: (input: CreateTrainingDayInput) => Promise<WriteResult>;
  countOwnedSteps: (ids: string[], actorId: string, elevated: boolean) => Promise<number>;
};

export const productionAuthoringPorts: TrainerAuthoringPorts = {
  createCourse: (input, actorId) => createCourseCore(input, actorId),
  countOwnedDays: (ids, ownerId, elevated) => prisma.trainingDay.count({
    where: { id: { in: ids }, ...(elevated ? {} : { authorId: ownerId }) },
  }),
  createArticle: (body, userId) => createArticleCore(body, userId),
  createStep: (input, ownerId) => createStepCore(input, ownerId),
  createDay: input => createTrainingDayCore(input),
  countOwnedSteps: (ids, ownerId, elevated) => prisma.step.count({
    where: { id: { in: ids }, ...(elevated ? {} : { authorId: ownerId }) },
  }),
};

const bad = { success: false, code: "BAD_INPUT", error: "Некорректные данные" } as const;
const denied = { success: false, code: "FORBIDDEN", error: "Недостаточно прав" } as const;
const unavailable = {
  success: false, code: "INTERNAL_SERVER_ERROR", error: "Не удалось сохранить данные",
} as const;

export function createTrainerAuthoringRoutes(
  ports: TrainerAuthoringPorts = productionAuthoringPorts,
) {
  const app = new Hono();
  app.post("/steps", async c => {
    const user = c.get("user") as { id: string; role: string } | undefined;
    if (!user?.id || !staffRoles.has(user.role)) return c.json(denied, 403);
    if (Object.keys(c.req.queries()).length || !jsonContent(c.req.header("content-type")))
      return c.json(bad, 400);
    const body: unknown = await c.req.json().catch(() => null);
    if (!plain(body) || !noUnknown(body, stepKeys)) return c.json(bad, 400);
    const id = randomUUID();
    const parsed = createStepSchema.safeParse({ ...body, id });
    if (!parsed.success) return c.json(bad, 400);
    try {
      const result = await ports.createStep(parsed.data, user.id);
      if (!result.success) return c.json(unavailable, 500);
      return c.json({ success: true, data: { id } }, 201);
    } catch { return c.json(unavailable, 500); }
  });

  app.post("/courses", async c => {
    const user = c.get("user") as { id: string; role: string } | undefined;
    if (!user?.id || !staffRoles.has(user.role)) return c.json(denied, 403);
    if (Object.keys(c.req.queries()).length || !jsonContent(c.req.header("content-type")))
      return c.json(bad, 400);
    const body: unknown = await c.req.json().catch(() => null);
    if (!plain(body) || !noUnknown(body, courseKeys)) return c.json(bad, 400);
    // The Vite writer is intentionally restricted to safe free/public courses.
    // Full paid/private audience and media wiring need an explicit, audited contract.
    if (body.isPublic !== true || body.isPaid !== false || body.logoImg !== "" ||
        body.videoUrl !== null || !Array.isArray(body.allowedUsers) ||
        body.allowedUsers.length !== 0) return c.json(bad, 400);
    const id = randomUUID();
    const parsed = createTrainerCourseSchema.strict().safeParse({ ...body, id });
    if (!parsed.success) return c.json(bad, 400);
    const days = parsed.data.trainingDays;
    if (new Set(days).size !== days.length) return c.json(bad, 400);
    try {
      const found = days.length === 0 ? 0 :
        await ports.countOwnedDays(days, user.id, user.role === "ADMIN");
      if (found !== days.length)
        return c.json({ success: false, code: "NOT_FOUND" }, 404);
      const result = await ports.createCourse(parsed.data, user.id);
      if (!result.success || result.id !== id) return c.json(unavailable, 500);
      return c.json({ success: true, data: { id } }, 201);
    } catch { return c.json(unavailable, 500); }
  });

  app.post("/articles", async c => {
    const user = c.get("user") as { id: string; role: string } | undefined;
    if (!user?.id || !staffRoles.has(user.role)) return c.json(denied, 403);
    if (Object.keys(c.req.queries()).length || !jsonContent(c.req.header("content-type")))
      return c.json(bad, 400);
    const body: unknown = await c.req.json().catch(() => null);
    if (!plain(body) || !noUnknown(body, articleKeys) || body.visibility !== "PAID")
      return c.json(bad, 400);
    const checked = createArticleSchema.safeParse(body);
    if (!checked.success) return c.json(bad, 400);
    try {
      const result = await ports.createArticle(checked.data, user.id);
      if (!result.success || !result.data?.id || !result.data.slug)
        return c.json(unavailable, 500);
      return c.json({ success: true, data: result.data }, 201);
    } catch { return c.json(unavailable, 500); }
  });

  app.post("/days", async c => {
    const user = c.get("user") as { id: string; role: string } | undefined;
    if (!user?.id || !staffRoles.has(user.role)) return c.json(denied, 403);
    if (Object.keys(c.req.queries()).length || !jsonContent(c.req.header("content-type")))
      return c.json(bad, 400);
    const body: unknown = await c.req.json().catch(() => null);
    if (!plain(body) || !noUnknown(body, dayKeys)) return c.json(bad, 400);
    const parsed = createDayBodySchema.safeParse(body);
    if (!parsed.success) return c.json(bad, 400);
    const ids = parsed.data.stepIds;
    try {
      const owned = ids.length === 0 ? 0 :
        await ports.countOwnedSteps(ids, user.id, user.role === "ADMIN");
      if (owned !== ids.length)
        return c.json({ success: false, code: "NOT_FOUND", error: "Шаги не найдены" }, 404);
      const result = await ports.createDay({ ...parsed.data, authorId: user.id });
      if (!result.success || !result.dayId) return c.json(unavailable, 500);
      return c.json({ success: true, data: { id: result.dayId } }, 201);
    } catch { return c.json(unavailable, 500); }
  });
  return app;
}

export const trainerAuthoringRoutes = createTrainerAuthoringRoutes();
