"use server";

import { submitExamResult as submitExamResultCore } from "@gafus/core/services/exam";
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
    const result = await submitExamResultCore(session.user.id, data);
    revalidatePath("/trainings");
    return { success: true, examResultId: result.examResultId };
  } catch (error) {
    console.error("Ошибка при сохранении результата экзамена:", error);
    throw new Error(error instanceof Error ? error.message : "Неизвестная ошибка");
  }
}
