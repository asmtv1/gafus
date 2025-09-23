"use server";


import { createTrainerPanelLogger } from "@gafus/logger";
import { prisma } from "@gafus/prisma";
import { reportErrorToDashboard } from "@shared/lib/actions/reportError";
import { revalidatePath } from "next/cache";

import type { ActionResult } from "@gafus/types";

// Создаем логгер для delete-steps
const logger = createTrainerPanelLogger('trainer-panel-delete-steps');

export async function deleteSteps(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const ids = formData.getAll("ids").map(String).filter(Boolean);
    if (ids.length === 0) {
      return { error: "Не указаны шаги для удаления" };
    }

    const result = await prisma.step.deleteMany({ where: { id: { in: ids } } });

    revalidatePath("/main-panel/steps");

    return { success: true, message: `Удалено: ${result.count}` } as { success: boolean; message: string };
  } catch (error) {
    logger.error("Ошибка при удалении шагов:", error as Error, { operation: 'error' });
    await reportErrorToDashboard({
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      appName: "trainer-panel",
      environment: process.env.NODE_ENV || "development",
      additionalContext: { action: "deleteSteps" },
      tags: ["steps", "delete"],
    });
    return { error: "Не удалось удалить шаги" };
  }
}
