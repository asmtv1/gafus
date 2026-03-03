"use server";

import { getExamResult as getExamResultCore } from "@gafus/core/services/exam";
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

export async function getExamResult(userStepId: string): Promise<ExamResultData | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error("Не авторизован");
  }
  try {
    return await getExamResultCore(session.user.id, userStepId);
  } catch (error) {
    console.error("Ошибка при получении результата экзамена:", error);
    throw new Error(error instanceof Error ? error.message : "Неизвестная ошибка");
  }
}
