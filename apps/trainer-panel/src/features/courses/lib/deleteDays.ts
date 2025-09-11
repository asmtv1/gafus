"use server";

import { prisma } from "@gafus/prisma";
import { reportErrorToDashboard } from "@shared/lib/actions/reportError";
import { revalidatePath } from "next/cache";
import { invalidateTrainingDayCache } from "@shared/lib/actions/invalidateTrainingDaysCache";

import type { ActionResult } from "@gafus/types";

export async function deleteDays(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const ids = formData.getAll("ids").map(String).filter(Boolean);
    if (ids.length === 0) {
      return { error: "Не указаны дни для удаления" };
    }

    // Инвалидируем кэш для каждого удаляемого дня
    for (const dayId of ids) {
      await invalidateTrainingDayCache(dayId);
    }

    // Удаляем связи дней с курсами, чтобы не нарушать ограничения внешних ключей
    await prisma.dayOnCourse.deleteMany({ where: { dayId: { in: ids } } });

    // Удаляем сами дни (StepOnDay удалится каскадно)
    await prisma.trainingDay.deleteMany({ where: { id: { in: ids } } });

    revalidatePath("/main-panel/days");

    return { success: true };
  } catch (error) {
    console.error("Ошибка при удалении дней:", error);
    await reportErrorToDashboard({
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      appName: "trainer-panel",
      environment: process.env.NODE_ENV || "development",
      additionalContext: { action: "deleteDays" },
      tags: ["days", "delete"],
    });
    return { error: "Не удалось удалить дни" };
  }
}
