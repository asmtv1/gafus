"use server";

import { prisma } from "@gafus/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";

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

/**
 * Получает результат экзамена для конкретного userStepId
 */
export async function getExamResult(userStepId: string): Promise<ExamResultData | null> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("Не авторизован");
  }

  try {
    // Проверяем, что userStep принадлежит текущему пользователю
    const userStep = await prisma.userStep.findFirst({
      where: {
        id: userStepId,
        userTraining: {
          userId: session.user.id,
        },
      },
    });

    if (!userStep) {
      throw new Error("Шаг не найден или нет доступа");
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
        console.error("Ошибка парсинга testAnswers:", e);
      }
    }

    return {
      ...examResult,
      testAnswers,
    };
  } catch (error) {
    console.error("Ошибка при получении результата экзамена:", error);
    throw new Error(error instanceof Error ? error.message : "Неизвестная ошибка");
  }
}
