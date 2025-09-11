"use server";

import { prisma } from "@gafus/prisma";
import { TrainingStatus } from "@gafus/types";

import { calculateDayStatusFromStatuses } from "@shared/utils/trainingCalculations";

import type { TrainingDetail } from "@gafus/types";

import { getCurrentUserId } from "@/utils";

export async function getTrainingDays(typeParam?: string, userId?: string): Promise<{
  trainingDays: (Pick<TrainingDetail, "trainingDayId" | "day" | "title" | "type" | "courseId" | "userStatus"> & { estimatedDuration: number; equipment: string })[];
  courseDescription: string | null;
  courseId: string | null;
  courseVideoUrl: string | null;
  courseEquipment: string | null;
  courseTrainingLevel: string | null;
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
        videoUrl: true,
        equipment: true,
        trainingLevel: true,
        dayLinks: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            order: true,
            day: {
              select: {
                title: true,
                type: true,
                equipment: true,  // Добавляем equipment
                stepLinks: {
                  select: {
                    id: true,
                    order: true,
                    step: {
                      select: {
                        durationSec: true
                      }
                    }
                  },
                },
              },
            },
            userTrainings: {
              where: { userId: currentUserId },
              select: { 
                status: true, 
                steps: { 
                  select: { 
                    stepOnDayId: true,
                    status: true 
                  } 
                } 
              },
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
        courseEquipment: null,
        courseTrainingLevel: null,
      };
    }

    const trainingDays = firstCourse.dayLinks.map(
      (link: {
        id: string;
        order: number;
        day: { 
          title: string; 
          type: string;
          equipment: string; // Added equipment to the type
          stepLinks: { id: string; order: number; step: { durationSec: number } }[];
        };
        userTrainings: { 
          status: string; 
          steps: { stepOnDayId: string; status: string }[] 
        }[];
      }) => {
        const ut = link.userTrainings[0];
        
        // Создаем массив статусов для ВСЕХ шагов дня, заполняя недостающие как NOT_STARTED
        const allStepStatuses: string[] = [];
        for (const stepLink of link.day.stepLinks) {
          const userStep = ut?.steps?.find((s: { stepOnDayId: string }) => s.stepOnDayId === stepLink.id);
          allStepStatuses.push(userStep?.status || TrainingStatus.NOT_STARTED);
        }
        
        const computed = calculateDayStatusFromStatuses(allStepStatuses);
        const userStatus = ut ? computed : TrainingStatus.NOT_STARTED;

        const totalSeconds = link.day.stepLinks.reduce((sum, sl) => sum + sl.step.durationSec, 0);
        const estimatedDuration = Math.ceil(totalSeconds / 60);

        return {
          trainingDayId: link.id,
          day: link.order,
          title: link.day.title,
          type: link.day.type,
          courseId: firstCourse.id,
          userStatus,
          estimatedDuration,
          equipment: link.day.equipment || ""
        };
      },
    );

    return {
      trainingDays,
      courseDescription: firstCourse.description,
      courseId: firstCourse.id,
      courseVideoUrl: firstCourse.videoUrl,
      courseEquipment: firstCourse.equipment,
      courseTrainingLevel: firstCourse.trainingLevel,
    };
  } catch (error) {
    console.error("Ошибка в getTrainingDays:", error);
    throw new Error("Не удалось загрузить Тренировки");
  }
}
