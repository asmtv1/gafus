"use server";

import { authOptions } from "@gafus/auth";
import { createTrainingDay as createTrainingDayCore } from "@gafus/core/services/trainingDay";
import { createTrainerPanelLogger } from "@gafus/logger";
import { unstable_rethrow } from "next/navigation";
import { getServerSession } from "next-auth";
import { invalidateTrainingDayCache } from "@shared/lib/actions/invalidateTrainingDaysCache";

const logger = createTrainerPanelLogger("trainer-create-training-day");

export async function createTrainingDay(data: {
  title: string;
  description: string;
  type: string;
  equipment: string;
  showCoursePathExport?: boolean;
  shareProgressAcrossCourses?: boolean;
  stepIds: string[];
}) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) throw new Error("Not authenticated");

    const authorId = session.user.id;

    const result = await createTrainingDayCore({
      title: data.title,
      description: data.description,
      type: data.type,
      equipment: data.equipment,
      showCoursePathExport: data.showCoursePathExport ?? false,
      shareProgressAcrossCourses: data.shareProgressAcrossCourses ?? false,
      stepIds: data.stepIds,
      authorId,
    });

    if (!result.success || result.dayId == null) {
      throw new Error(result.error ?? "Не удалось создать день");
    }

    await invalidateTrainingDayCache(result.dayId);
    return { id: result.dayId };
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "createTrainingDay failed",
      error instanceof Error ? error : new Error(String(error)),
    );
    throw error;
  }
}
