"use server";

import { prisma } from "@gafus/prisma";
import { revalidatePath } from "next/cache";
import { invalidateTrainingDayCache } from "@shared/lib/actions/invalidateTrainingDaysCache";

export async function updateTrainingDay(data: {
  id: string;
  title: string;
  description: string;
  type: string;
  equipment: string;
  stepIds: string[];
}) {
  const { id, title, description, type, equipment, stepIds } = data;

  await prisma.trainingDay.update({
    where: { id },
    data: {
      title,
      description,
      type,
      equipment,
      stepLinks: {
        deleteMany: {},
        create: stepIds.map((stepId: string, index: number) => ({ stepId, order: index })),
      },
    },
  });

  // Инвалидируем кэш конкретного дня курса при обновлении
  await invalidateTrainingDayCache(id);

  revalidatePath("/main-panel/days");
}
