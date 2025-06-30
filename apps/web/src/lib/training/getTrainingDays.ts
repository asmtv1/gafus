"use server";

import { prisma } from "@prisma";
import { TrainingStatus } from "@gafus/types";
import type { TrainingDetail } from "@gafus/types";
import { getCurrentUserId } from "@/utils/getCurrentUserId";

export async function getTrainingDays(typeParam?: string): Promise<{
  trainingDays: Array<
    Pick<
      TrainingDetail,
      "id" | "day" | "title" | "type" | "courseId" | "userStatus"
    >
  >;
  courseDescription: string | null;
  courseId: number | null;
}> {
  const userId = await getCurrentUserId();

  try {
    const where = typeParam ? { type: typeParam } : {};

    const firstTrainingDay = await prisma.trainingDay.findFirst({
      where,
      orderBy: { dayNumber: "asc" },
      select: {
        course: { select: { description: true, id: true } },
      },
    });

    const trainingDaysWithStatus = await prisma.trainingDay.findMany({
      where,
      orderBy: { dayNumber: "asc" },
      select: {
        id: true,
        dayNumber: true,
        title: true,
        type: true,
        courseId: true,
        userTrainings: {
          where: { userId },
          select: { status: true },
        },
      },
    });

    const trainingDays = trainingDaysWithStatus.map(
      (day: {
        id: number;
        dayNumber: number;
        title: string;
        type: string;
        courseId: number;
        userTrainings: { status: TrainingStatus }[];
      }) => ({
        id: day.id,
        day: day.dayNumber,
        title: day.title,
        type: day.type,
        courseId: day.courseId,
        userStatus: day.userTrainings[0]?.status ?? TrainingStatus.NOT_STARTED,
      })
    );

    return {
      trainingDays,
      courseDescription: firstTrainingDay?.course.description ?? null,
      courseId: firstTrainingDay?.course.id ?? null,
    };
  } catch (error) {
    console.error("Ошибка в getTrainingDays:", error);
    throw new Error("Не удалось загрузить Тренировки");
  }
}
