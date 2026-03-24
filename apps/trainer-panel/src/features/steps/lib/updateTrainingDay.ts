"use server";

import { updateTrainingDay as updateTrainingDayCore } from "@gafus/core/services/trainingDay";
import { createTrainerPanelLogger } from "@gafus/logger";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { invalidateTrainingDayCache } from "@shared/lib/actions/invalidateTrainingDaysCache";

const logger = createTrainerPanelLogger("trainer-update-training-day");

export async function updateTrainingDay(data: {
  id: string;
  title: string;
  description: string;
  type: string;
  equipment: string;
  showCoursePathExport?: boolean;
  shareProgressAcrossCourses?: boolean;
  stepIds: string[];
}) {
  try {
    const result = await updateTrainingDayCore({
      id: data.id,
      title: data.title,
      description: data.description,
      type: data.type,
      equipment: data.equipment,
      showCoursePathExport: data.showCoursePathExport ?? false,
      shareProgressAcrossCourses: data.shareProgressAcrossCourses ?? false,
      stepIds: data.stepIds,
    });

    if (!result.success) {
      throw new Error(result.error ?? "Не удалось обновить день");
    }

    await invalidateTrainingDayCache(data.id);
    revalidatePath("/main-panel/days");
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "updateTrainingDay failed",
      error instanceof Error ? error : new Error(String(error)),
      { dayId: data.id },
    );
    throw error;
  }
}
