"use server";

import { authOptions } from "@gafus/auth";
import { createTrainingDay as createTrainingDayCore } from "@gafus/core/services/trainingDay";
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

  const result = await createTrainingDayCore({
    title: data.title,
    description: data.description,
    type: data.type,
    equipment: data.equipment,
    showCoursePathExport: data.showCoursePathExport ?? false,
    stepIds: data.stepIds,
    authorId,
  });

  if (!result.success || result.dayId == null) {
    throw new Error(result.error ?? "Не удалось создать день");
  }

  await invalidateTrainingDayCache(result.dayId);
  return { id: result.dayId };
}
