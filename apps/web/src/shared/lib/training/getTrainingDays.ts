"use server";

import { prisma } from "@gafus/prisma";
import { TrainingStatus } from "@gafus/types";

import type { TrainingDetail } from "@gafus/types";

import { getCurrentUserId } from "@/utils";

export async function getTrainingDays(typeParam?: string): Promise<{
  trainingDays: Pick<TrainingDetail, "day" | "title" | "type" | "courseId" | "userStatus">[];
  courseDescription: string | null;
  courseId: string | null;
  courseVideoUrl: string | null; // <--- добавили сюда
}> {
  const userId = await getCurrentUserId();

  try {
    const courseWhere = typeParam ? { type: typeParam } : {};

    const firstCourse = await prisma.course.findFirst({
      where: courseWhere,
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        description: true,
        videoUrl: true, // <--- добавили сюда
        dayLinks: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            order: true,
            day: {
              select: {
                title: true,
                type: true,
              },
            },
            userTrainings: {
              where: { userId },
              select: { status: true },
            },
          },
        },
      },
    });

    if (!firstCourse) {
      return {
        trainingDays: [],
        courseDescription: null,
        courseId: null,
        courseVideoUrl: null,
      };
    }

    const trainingDays = firstCourse.dayLinks.map((link) => ({
      id: link.id,
      day: link.order,
      title: link.day.title,
      type: link.day.type,
      courseId: firstCourse.id,
      userStatus: (link.userTrainings[0]?.status as TrainingStatus) ?? TrainingStatus.NOT_STARTED,
    }));

    return {
      trainingDays,
      courseDescription: firstCourse.description,
      courseId: firstCourse.id,
      courseVideoUrl: firstCourse.videoUrl,
    };
  } catch (error) {
    console.error("Ошибка в getTrainingDays:", error);
    throw new Error("Не удалось загрузить Тренировки");
  }
}
