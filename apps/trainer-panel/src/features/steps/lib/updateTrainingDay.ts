"use server";

import { updateTrainingDay as updateTrainingDayCore } from "@gafus/core/services/trainingDay";
import { revalidatePath } from "next/cache";
import { invalidateTrainingDayCache } from "@shared/lib/actions/invalidateTrainingDaysCache";

export async function updateTrainingDay(data: {
  id: string;
  title: string;
  description: string;
  type: string;
  equipment: string;
  showCoursePathExport?: boolean;
  stepIds: string[];
}) {
  const result = await updateTrainingDayCore({
    id: data.id,
    title: data.title,
    description: data.description,
    type: data.type,
    equipment: data.equipment,
    showCoursePathExport: data.showCoursePathExport ?? false,
    stepIds: data.stepIds,
  });

  if (!result.success) {
    throw new Error(result.error ?? "Не удалось обновить день");
  }

  await invalidateTrainingDayCache(data.id);
  revalidatePath("/main-panel/days");
}
