"use server";

import { authOptions } from "@gafus/auth";
import { prisma } from "@gafus/prisma";
import { getServerSession } from "next-auth";
import { invalidateTrainingDayCache } from "@shared/lib/actions/invalidateTrainingDaysCache";

export async function createTrainingDay(data: {
  title: string;
  description: string;
  type: string;
  equipment: string;
  showCoursePathExport?: boolean;
  stepIds: string[];
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Not authenticated");

  const authorId = session.user.id;

  const day = await prisma.trainingDay.create({
    data: {
      title: data.title,
      description: data.description,
      type: data.type,
      equipment: data.equipment,
      showCoursePathExport: data.showCoursePathExport ?? false,
      author: { connect: { id: authorId } },
      stepLinks: {
        create: data.stepIds.map((stepId: string, index: number) => ({
          step: { connect: { id: stepId } },
          order: index + 1, // Шаги начинаются с 1, а не с 0
        })),
      },
    },
  });

  // Инвалидируем кэш конкретного дня курса при создании
  await invalidateTrainingDayCache(day.id);

  return day;
}
