"use server";

import { createTrainerPanelLogger } from "@gafus/logger";
import { getStudentsByIds as getStudentsByIdsCore } from "@gafus/core/services/user";

const logger = createTrainerPanelLogger("trainer-panel-get-students-by-ids");

export async function getStudentsByIds(
  studentIds: string[],
): Promise<{ id: string; username: string }[]> {
  try {
    return await getStudentsByIdsCore(studentIds);
  } catch (error) {
    logger.error("Ошибка при получении учеников по ID", error as Error, {
      studentIds,
    });
    return [];
  }
}
