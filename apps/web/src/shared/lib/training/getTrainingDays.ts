"use server";

import { prisma } from "@gafus/prisma";
import { TrainingStatus } from "@gafus/types";

import type { TrainingDetail } from "@gafus/types";

import { getCurrentUserId } from "@/utils";

export async function getTrainingDays(typeParam?: string, userId?: string): Promise<{
  trainingDays: Pick<TrainingDetail, "trainingDayId" | "day" | "title" | "type" | "courseId" | "userStatus">[];
  courseDescription: string | null;
  courseId: string | null;
  courseVideoUrl: string | null; // <--- добавили сюда
}> {
  try {
    // Если userId не передан, получаем его
    const currentUserId = userId || await getCurrentUserId();
    
    if (!currentUserId) {
      console.error("getTrainingDays: userId is null or undefined");
      throw new Error("Пользователь не авторизован");
    }
    
    console.warn("getTrainingDays: userId =", currentUserId, "typeParam =", typeParam);
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
              where: { userId: currentUserId },
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

    const trainingDays = firstCourse.dayLinks.map((link: { id: string; order: number; day: { title: string; type: string }; userTrainings: { status: string }[] }) => ({
      trainingDayId: link.id,
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
