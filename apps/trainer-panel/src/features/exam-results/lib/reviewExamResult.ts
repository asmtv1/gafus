"use server";

import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { CACHE_TAGS } from "@gafus/core/services/cache";
import {
  reviewExamResult as reviewExamResultCore,
  type ReviewExamResultData,
} from "@gafus/core/services/exam";
import { createTrainerPanelLogger } from "@gafus/logger";
import { unstable_rethrow } from "next/navigation";

import type { ActionResult } from "@gafus/types";

const logger = createTrainerPanelLogger("trainer-review-exam-result");

const reviewSchema = z.object({
  userStepId: z.string().min(1, "ID шага обязателен"),
  action: z.enum(["approve", "reject"]),
  trainerComment: z
    .string()
    .trim()
    .max(1000, "Комментарий не должен превышать 1000 символов")
    .transform((value) => (value.length ? value : null))
    .optional(),
});

/**
 * Проверка и утверждение/отклонение результата экзамена тренером.
 * Валидирует ввод, проверяет сессию и роль, делегирует в core, инвалидирует кэш при успехе.
 */
export async function reviewExamResult(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { success: false, error: "Вы не авторизованы" };
  }

  if (!["TRAINER", "ADMIN", "MODERATOR"].includes(session.user.role)) {
    return { success: false, error: "Недостаточно прав доступа" };
  }

  const rawUserStepId = formData.get("userStepId");
  const rawAction = formData.get("action");
  const rawTrainerComment = formData.get("trainerComment");

  const parseResult = reviewSchema.safeParse({
    userStepId: typeof rawUserStepId === "string" ? rawUserStepId : undefined,
    action: typeof rawAction === "string" ? rawAction : undefined,
    trainerComment: typeof rawTrainerComment === "string" ? rawTrainerComment : undefined,
  });

  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.errors[0]?.message ?? "Некорректные данные запроса",
    };
  }

  const data: ReviewExamResultData = {
    userStepId: parseResult.data.userStepId,
    action: parseResult.data.action,
    trainerComment: parseResult.data.trainerComment ?? null,
  };

  try {
    const result = await reviewExamResultCore(session.user.id, session.user.role, data);

    if (result.success) {
      revalidatePath("/main-panel/exam-results");
      revalidateTag(CACHE_TAGS.EXAM_RESULTS);
      return { success: true };
    }

    return { success: false, error: result.error ?? "Не удалось проверить экзамен" };
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "reviewExamResult failed",
      error instanceof Error ? error : new Error(String(error)),
      { userStepId: data.userStepId },
    );
    return { success: false, error: "Не удалось проверить экзамен" };
  }
}
