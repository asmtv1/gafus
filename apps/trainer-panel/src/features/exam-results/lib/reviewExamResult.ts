"use server";

import { createTrainerPanelLogger } from "@gafus/logger";
import { prisma } from "@gafus/prisma";
import { reportErrorToDashboard } from "@shared/lib/actions/reportError";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";

import type { ActionResult } from "@gafus/types";

// Создаем логгер
const logger = createTrainerPanelLogger('trainer-panel-review-exam');

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

    const userStepId = formData.get("userStepId")?.toString();
    const action = formData.get("action")?.toString(); // "approve" или "reject"
    const trainerComment = formData.get("trainerComment")?.toString();

    if (!userStepId) {
      return { error: "ID шага обязателен" };
    }

    if (!action || !["approve", "reject"].includes(action)) {
      return { error: "Некорректное действие" };
    }

    // Получаем userStep с информацией о курсе
    const userStep = await prisma.userStep.findUnique({
      where: { id: userStepId },
      include: {
        userTraining: {
          include: {
            dayOnCourse: {
              include: {
                course: true
              }
            }
          }
        },
        examResult: true
      }
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

    // Обновляем статус шага
    await prisma.userStep.update({
      where: { id: userStepId },
      data: {
        status: action === "approve" ? "COMPLETED" : "IN_PROGRESS"
      }
    });

    // Обновляем результат экзамена с комментарием тренера
    await prisma.examResult.update({
      where: { id: userStep.examResult.id },
      data: {
        isPassed: action === "approve",
        overallScore: action === "approve" ? 100 : 0,
        // Добавляем поле для комментария тренера (нужно будет добавить в схему)
        updatedAt: new Date()
      }
    });

    // Логируем действие
    logger.info(`Тренер ${session.user.username} ${action === "approve" ? "утвердил" : "отклонил"} экзамен для userStep ${userStepId}`);

    revalidatePath("/main-panel/exam-results");
    
    return { 
      success: true
    };
  } catch (error) {
    logger.error("Ошибка при проверке экзамена:", error as Error, { operation: 'error' });
    await reportErrorToDashboard({
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      appName: "trainer-panel",
      environment: process.env.NODE_ENV || "development",
      additionalContext: { action: "reviewExamResult" },
      tags: ["exam", "review"],
    });
    return { error: "Не удалось проверить экзамен" };
  }
}

