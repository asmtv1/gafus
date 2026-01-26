"use server";

import { prisma } from "@gafus/prisma";
import { createTrainerPanelLogger } from "@gafus/logger";

const logger = createTrainerPanelLogger("trainer-panel-get-students-by-ids");

export async function getStudentsByIds(
  studentIds: string[]
): Promise<{ id: string; username: string }[]> {
  try {
    if (!studentIds || studentIds.length === 0) {
      return [];
    }

    const students = await prisma.user.findMany({
      where: {
        id: { in: studentIds },
        role: "USER", // Только ученики
      },
      select: {
        id: true,
        username: true,
      },
    });

    return students;
  } catch (error) {
    logger.error("Ошибка при получении учеников по ID", error as Error, {
      studentIds,
    });
    return [];
  }
}
