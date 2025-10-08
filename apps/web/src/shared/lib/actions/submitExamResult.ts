"use server";

import { prisma } from "@gafus/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { revalidatePath } from "next/cache";

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

export async function submitExamResult(data: ExamSubmissionData) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    throw new Error("Не авторизован");
  }

  try {
    // Проверяем, что userStep принадлежит текущему пользователю
    const userStep = await prisma.userStep.findFirst({
      where: {
        id: data.userStepId,
        userTraining: {
          userId: session.user.id
        }
      },
      include: {
        stepOnDay: {
          include: {
            step: true
          }
        }
      }
    });

    if (!userStep) {
      throw new Error("Шаг не найден или нет доступа");
    }

    // Проверяем, что это экзаменационный шаг
    if (userStep.stepOnDay.step.type !== "EXAMINATION") {
      throw new Error("Этот шаг не является экзаменационным");
    }

    // Создаем или обновляем результат экзамена
    const examResult = await prisma.examResult.upsert({
      where: {
        userStepId: data.userStepId
      },
      update: {
        testAnswers: data.testAnswers ? JSON.stringify(data.testAnswers) : undefined,
        testScore: data.testScore || null,
        testMaxScore: data.testMaxScore || null,
        videoReportUrl: data.videoReportUrl || null,
        writtenFeedback: data.writtenFeedback || null,
        overallScore: data.overallScore || null,
        isPassed: data.isPassed || null,
        updatedAt: new Date()
      },
      create: {
        userStepId: data.userStepId,
        stepId: data.stepId,
        testAnswers: data.testAnswers ? JSON.stringify(data.testAnswers) : undefined,
        testScore: data.testScore || null,
        testMaxScore: data.testMaxScore || null,
        videoReportUrl: data.videoReportUrl || null,
        writtenFeedback: data.writtenFeedback || null,
        overallScore: data.overallScore || null,
        isPassed: data.isPassed || null
      }
    });

    // Обновляем статус шага на IN_PROGRESS
    // Статус будет изменен на COMPLETED только после проверки тренером
    await prisma.userStep.update({
      where: {
        id: data.userStepId
      },
      data: {
        status: "IN_PROGRESS"
      }
    });

    revalidatePath("/trainings");
    
    return { success: true, examResultId: examResult.id };
  } catch (error) {
    console.error("Ошибка при сохранении результата экзамена:", error);
    throw new Error(error instanceof Error ? error.message : "Неизвестная ошибка");
  }
}
