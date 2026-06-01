/**
 * Exam Routes
 * Endpoints для работы с экзаменами
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import { getExamResult, submitExamResult, uploadExamVideoFile } from "@gafus/core/services/exam";
import {
  requirePremiumOrRewardedAccessForUserStep,
  SubscriptionOrCreditsRequiredError,
} from "@gafus/core/services/rewardedCredits";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-exam");

export const examRoutes = new Hono();

const rewardedPlatformSchema = z.enum(["ANDROID", "IOS"]);

function getRewardedPlatform(c: { req: { query(name: string): string | undefined; header(name: string): string | undefined } }): "ANDROID" | "IOS" {
  const candidate = c.req.query("platform") ?? c.req.header("x-rewarded-platform") ?? c.req.header("x-platform");
  const parsed = rewardedPlatformSchema.safeParse(candidate);
  return parsed.success ? parsed.data : "ANDROID";
}

function isSubscriptionOrCreditsRequiredError(error: unknown): boolean {
  return (
    error instanceof SubscriptionOrCreditsRequiredError ||
    (error instanceof Error && error.name === "SubscriptionOrCreditsRequiredError")
  );
}

function subscriptionOrCreditsResponse(c: { json: (body: unknown, status: 402) => Response }): Response {
  return c.json(
    {
      success: false,
      error: "Для действия нужна подписка или rewarded credits",
      code: "SUBSCRIPTION_OR_CREDITS_REQUIRED",
    },
    402,
  );
}

// ==================== GET /exam/result ====================
// Получить результат экзамена
const resultQuerySchema = z.object({
  userStepId: z.string().cuid("userStepId должен быть CUID"),
});

examRoutes.get("/result", zValidator("query", resultQuerySchema), async (c) => {
  try {
    const user = c.get("user");
    const { userStepId } = c.req.valid("query");

    await requirePremiumOrRewardedAccessForUserStep({
      userId: user.id,
      platform: getRewardedPlatform(c),
      userStepId,
    });

    const result = await getExamResult(user.id, userStepId);

    if (!result) {
      return c.json(
        { success: false, error: "Шаг не найден или нет доступа", code: "NOT_FOUND" },
        404,
      );
    }

    return c.json({ success: true, data: result });
  } catch (error) {
    if (isSubscriptionOrCreditsRequiredError(error)) {
      return subscriptionOrCreditsResponse(c);
    }
    logger.error("Error getting exam result", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// ==================== POST /exam/submit ====================
// Отправить результат экзамена
const submitExamSchema = z.object({
  userStepId: z.string().cuid("userStepId должен быть CUID"),
  stepId: z.string().cuid("stepId должен быть CUID"),
  testAnswers: z.record(z.string(), z.number()).optional(),
  testScore: z.number().optional(),
  testMaxScore: z.number().optional(),
  videoReportUrl: z.string().nullable().optional(),
  writtenFeedback: z.string().optional(),
  overallScore: z.number().optional(),
  isPassed: z.boolean().optional(),
});

examRoutes.post("/submit", zValidator("json", submitExamSchema), async (c) => {
  try {
    const user = c.get("user");
    const data = c.req.valid("json");

    await requirePremiumOrRewardedAccessForUserStep({
      userId: user.id,
      platform: getRewardedPlatform(c),
      userStepId: data.userStepId,
    });

    const result = await submitExamResult(user.id, data);

    return c.json({ success: true, data: result });
  } catch (error) {
    if (isSubscriptionOrCreditsRequiredError(error)) {
      return subscriptionOrCreditsResponse(c);
    }
    if (error instanceof Error && error.message.includes("не найден")) {
      return c.json({ success: false, error: error.message, code: "NOT_FOUND" }, 404);
    }
    if (error instanceof Error && error.message.includes("не является экзаменационным")) {
      return c.json({ success: false, error: error.message, code: "VALIDATION_ERROR" }, 400);
    }
    logger.error("Error submitting exam result", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка сервера" }, 500);
  }
});

// POST /exam/upload-video — multipart: video (файл), userStepId (строка)
examRoutes.post("/upload-video", async (c) => {
  try {
    const user = c.get("user");
    const body = await c.req.parseBody();
    const userStepIdRaw = body["userStepId"];
    const file = body["video"];

    if (!userStepIdRaw || typeof userStepIdRaw !== "string") {
      return c.json(
        { success: false, error: "userStepId обязателен для загрузки видео экзамена" },
        400,
      );
    }

    const userStepId = userStepIdRaw.trim();
    const cuidParse = z.string().cuid().safeParse(userStepId);
    if (!cuidParse.success) {
      return c.json({ success: false, error: "userStepId должен быть CUID" }, 400);
    }

    if (!file || typeof file === "string") {
      return c.json({ success: false, error: "Видео файл не предоставлен" }, 400);
    }

    await requirePremiumOrRewardedAccessForUserStep({
      userId: user.id,
      platform: getRewardedPlatform(c),
      userStepId,
    });

    const uploadResult = await uploadExamVideoFile(user.id, userStepId, file as File);
    if (!uploadResult.success) {
      return c.json({ success: false, error: uploadResult.error }, 400);
    }

    return c.json({ success: true, data: { videoUrl: uploadResult.videoUrl } });
  } catch (error) {
    if (isSubscriptionOrCreditsRequiredError(error)) {
      return subscriptionOrCreditsResponse(c);
    }
    logger.error("Error uploading exam video", error as Error);
    return c.json({ success: false, error: "Ошибка при загрузке видео" }, 500);
  }
});
