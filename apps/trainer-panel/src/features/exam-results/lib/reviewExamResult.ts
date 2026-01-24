"use server";

import { z } from "zod";
import { createTrainerPanelLogger } from "@gafus/logger";
import { prisma } from "@gafus/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { sendImmediatePushNotification } from "@gafus/webpush";

import type { ActionResult } from "@gafus/types";

// Создаем логгер
const logger = createTrainerPanelLogger("trainer-panel-review-exam");

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
 * Проверка и утверждение/отклонение результата экзамена тренером
 */
export async function reviewExamResult(
  prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return { error: "Вы не авторизованы" };
    }

    // Проверяем роль пользователя
    if (!["TRAINER", "ADMIN", "MODERATOR"].includes(session.user.role)) {
      return { error: "Недостаточно прав доступа" };
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
        error: parseResult.error.errors[0]?.message ?? "Некорректные данные запроса",
      };
    }

    const { userStepId, action, trainerComment } = parseResult.data;

    // Получаем userStep с информацией о курсе и шаге
    const userStep = await prisma.userStep.findUnique({
      where: { id: userStepId },
      include: {
        userTraining: {
          include: {
            user: true, // Для получения userId
            dayOnCourse: {
              include: {
                course: true, // Для типа курса и order дня
              },
            },
          },
        },
        stepOnDay: {
          include: {
            step: true, // Для названия шага
          },
        },
        examResult: true,
      },
    });

    if (!userStep) {
      return { error: "Шаг не найден" };
    }

    // Проверяем, что курс принадлежит тренеру
    const courseAuthorId = userStep.userTraining.dayOnCourse.course.authorId;
    if (courseAuthorId !== session.user.id && session.user.role !== "ADMIN") {
      return { error: "Вы не можете проверять экзамены для чужих курсов" };
    }

    if (!userStep.examResult) {
      return { error: "Результат экзамена не найден" };
    }

    const finalComment = trainerComment ?? null;

    // Обновляем статус шага
    await prisma.userStep.update({
      where: { id: userStepId },
      data: {
        status: action === "approve" ? "COMPLETED" : "IN_PROGRESS",
      },
    });

    // Обновляем результат экзамена с комментарием тренера
    await prisma.examResult.update({
      where: { id: userStep.examResult.id },
      data: {
        isPassed: action === "approve",
        overallScore: action === "approve" ? 100 : 0,
        trainerComment: finalComment,
        reviewedAt: new Date(),
        reviewedById: session.user.id,
        updatedAt: new Date(),
      },
    });

    // Логируем действие
    logger.info(
      `Тренер ${session.user.username} ${
        action === "approve" ? "утвердил" : "отклонил"
      } экзамен для userStep ${userStepId}`,
      {
        commentProvided: Boolean(finalComment),
      },
    );

    const stepTitle = userStep.stepOnDay.step.title;
    const courseType = userStep.userTraining.dayOnCourse.course.type;
    const dayOrder = userStep.userTraining.dayOnCourse.order; // Используем order вместо dayNumber
    const userId = userStep.userTraining.userId;

    const defaultRejectBody =
      "Тренер вернул экзамен на доработку. Ознакомьтесь с комментарием и отправьте отчёт ещё раз.";

    const trimmedComment = finalComment
      ? finalComment.length > 180
        ? `${finalComment.slice(0, 177)}...`
        : finalComment
      : null;

    const pushPayload =
      action === "approve"
        ? {
            title: `"${stepTitle}" зачтён! ✅`,
            body: "Тренер проверил ваш экзамен. Можете переходить к следующему шагу.",
          }
        : {
            title: `"${stepTitle}" требует доработки ❗️`,
            body: trimmedComment ? `Комментарий тренера: ${trimmedComment}` : defaultRejectBody,
          };

    try {
      const pushResult = await sendImmediatePushNotification({
        userId,
        title: pushPayload.title,
        body: pushPayload.body,
        url: `/trainings/${courseType}/${dayOrder}`,
        icon: "/icons/icon192.png",
        badge: "/icons/badge-72.png",
      });

      if (pushResult.success) {
        logger.success(`Пуш-уведомление отправлено пользователю ${userId}`, {
          notificationId: pushResult.notificationId,
          action,
        });
      } else {
        logger.warn(`Не удалось отправить пуш-уведомление: ${pushResult.error}`, {
          userId,
          action,
        });
      }
    } catch (pushError) {
      // Ошибка отправки пуша не должна блокировать основную логику
      logger.error("Ошибка при отправке пуш-уведомления (не критично)", pushError as Error, {
        userStepId,
        action,
      });
    }

    revalidatePath("/main-panel/exam-results");

    return {
      success: true,
    };
  } catch (error) {
    logger.error("Ошибка при проверке экзамена:", error as Error, { operation: "error" });
    logger.error(
      error instanceof Error ? error.message : "Unknown error",
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: "action",
        action: "action",
        tags: [],
      },
    );
    return { error: "Не удалось проверить экзамен" };
  }
}
