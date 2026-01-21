/**
 * Exam Service
 * Сервис для работы с экзаменами
 */
import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("core-exam");

export interface ExamResultData {
  id: string;
  testAnswers: Record<string, number> | null;
  testScore: number | null;
  testMaxScore: number | null;
  videoReportUrl: string | null;
  writtenFeedback: string | null;
  overallScore: number | null;
  isPassed: boolean | null;
  trainerComment: string | null;
  reviewedAt: Date | null;
  reviewedById: string | null;
  reviewedBy: {
    username: string;
    profile: {
      fullName: string | null;
    } | null;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExamSubmissionData {
  userStepId: string;
  stepId: string;
  testAnswers?: Record<string, number>;
  testScore?: number;
  testMaxScore?: number;
  videoReportUrl?: string;
  writtenFeedback?: string;
  overallScore?: number;
  isPassed?: boolean;
}

/**
 * Получает результат экзамена для конкретного userStepId
 */
export async function getExamResult(
  userId: string,
  userStepId: string,
): Promise<ExamResultData | null> {
  try {
    // Проверяем, что userStep принадлежит пользователю
    const userStep = await prisma.userStep.findFirst({
      where: {
        id: userStepId,
        userTraining: {
          userId,
        },
      },
    });

    if (!userStep) {
      return null;
    }

    // Получаем результат экзамена
    const examResult = await prisma.examResult.findUnique({
      where: {
        userStepId,
      },
      select: {
        id: true,
        testAnswers: true,
        testScore: true,
        testMaxScore: true,
        videoReportUrl: true,
        writtenFeedback: true,
        overallScore: true,
        isPassed: true,
        trainerComment: true,
        reviewedAt: true,
        reviewedById: true,
        reviewedBy: {
          select: {
            username: true,
            profile: {
              select: {
                fullName: true,
              },
            },
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!examResult) {
      return null;
    }

    // Парсим testAnswers из JSON если есть
    let testAnswers: Record<string, number> | null = null;
    if (examResult.testAnswers) {
      try {
        testAnswers =
          typeof examResult.testAnswers === "string"
            ? JSON.parse(examResult.testAnswers)
            : (examResult.testAnswers as Record<string, number>);
      } catch (e) {
        logger.error("Ошибка парсинга testAnswers", e as Error);
      }
    }

    return {
      ...examResult,
      testAnswers,
    };
  } catch (error) {
    logger.error("Ошибка при получении результата экзамена", error as Error);
    throw new Error(
      error instanceof Error ? error.message : "Неизвестная ошибка",
    );
  }
}

/**
 * Сохраняет результат экзамена
 */
export async function submitExamResult(
  userId: string,
  data: ExamSubmissionData,
): Promise<{ success: boolean; examResultId: string }> {
  try {
    // Проверяем, что userStep принадлежит пользователю
    const userStep = await prisma.userStep.findFirst({
      where: {
        id: data.userStepId,
        userTraining: {
          userId,
        },
      },
      include: {
        stepOnDay: {
          include: {
            step: true,
          },
        },
      },
    });

    if (!userStep) {
      throw new Error("Шаг не найден или нет доступа");
    }

    // Проверяем, что это экзаменационный шаг
    if (userStep.stepOnDay.step.type !== "EXAMINATION") {
      throw new Error(
        `Этот шаг не является экзаменационным. Тип шага: ${userStep.stepOnDay.step.type || "не определен"}`,
      );
    }

    // Создаем или обновляем результат экзамена
    const updateData: Partial<{
      testAnswers: string;
      testScore: number;
      testMaxScore: number;
      videoReportUrl: string;
      writtenFeedback: string;
      overallScore: number;
      isPassed: boolean;
      trainerComment: string | null;
      reviewedAt: Date | null;
      reviewedById: string | null;
      updatedAt: Date;
    }> = {
      updatedAt: new Date(),
    };

    // Добавляем в updateData только те поля, которые были переданы
    if (data.testAnswers !== undefined) {
      updateData.testAnswers = JSON.stringify(data.testAnswers);
    }
    if (data.testScore !== undefined) {
      updateData.testScore = data.testScore;
    }
    if (data.testMaxScore !== undefined) {
      updateData.testMaxScore = data.testMaxScore;
    }
    if (data.videoReportUrl !== undefined) {
      updateData.videoReportUrl = data.videoReportUrl;
    }
    if (data.writtenFeedback !== undefined) {
      updateData.writtenFeedback = data.writtenFeedback;
    }
    if (data.overallScore !== undefined) {
      updateData.overallScore = data.overallScore;
    }
    if (data.isPassed !== undefined) {
      updateData.isPassed = data.isPassed;
    }

    // Сбрасываем результат проверки тренером при повторной отправке
    updateData.trainerComment = null;
    updateData.reviewedAt = null;
    updateData.reviewedById = null;

    const examResult = await prisma.examResult.upsert({
      where: {
        userStepId: data.userStepId,
      },
      update: updateData,
      create: {
        userStepId: data.userStepId,
        stepId: data.stepId,
        testAnswers: data.testAnswers ? JSON.stringify(data.testAnswers) : undefined,
        testScore: data.testScore || null,
        testMaxScore: data.testMaxScore || null,
        videoReportUrl: data.videoReportUrl || null,
        writtenFeedback: data.writtenFeedback || null,
        overallScore: data.overallScore || null,
        isPassed: data.isPassed || null,
      },
    });

    // Обновляем статус шага на IN_PROGRESS
    await prisma.userStep.update({
      where: {
        id: data.userStepId,
      },
      data: {
        status: "IN_PROGRESS",
      },
    });

    return { success: true, examResultId: examResult.id };
  } catch (error) {
    logger.error("Ошибка при сохранении результата экзамена", error as Error);
    throw new Error(
      error instanceof Error ? error.message : "Неизвестная ошибка",
    );
  }
}
