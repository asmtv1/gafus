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
      throw new Error(
        `Этот шаг не является экзаменационным. Тип шага: ${userStep.stepOnDay.step.type || "не определен"}`
      );
    }

    // Создаем или обновляем результат экзамена
    // ВАЖНО: обновляем только переданные поля, чтобы не перезаписывать существующие данные
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
      updatedAt: new Date()
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
        userStepId: data.userStepId
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
