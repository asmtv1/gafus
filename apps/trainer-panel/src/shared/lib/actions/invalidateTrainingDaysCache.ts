"use server";

import { revalidateTag } from "next/cache";
import { reportErrorToDashboard } from "./reportError";

// Функция для инвалидации кэша дней курсов (все дни)
export async function invalidateTrainingDaysCache() {
  try {
    console.warn("[Cache] Invalidating training days cache");
    revalidateTag("training");
    revalidateTag("days");
    console.warn("[Cache] Training days cache invalidated successfully");
  } catch (error) {
    console.error("❌ Error invalidating training days cache:", error);
    await reportErrorToDashboard({
      message: error instanceof Error ? error.message : "Unknown error in invalidateTrainingDaysCache",
      stack: error instanceof Error ? error.stack : undefined,
      appName: "trainer-panel",
      environment: process.env.NODE_ENV || "development",
      additionalContext: {
        action: "invalidateTrainingDaysCache",
        errorType: error instanceof Error ? error.constructor.name : typeof error,
      },
      tags: ["training", "days", "cache", "invalidation"],
    });
  }
}

// Функция для инвалидации кэша конкретного дня курса
export async function invalidateTrainingDayCache(dayId: string) {
  try {
    console.warn(`[Cache] Invalidating training day cache for day: ${dayId}`);
    revalidateTag("training");
    revalidateTag("day");
    console.warn(`[Cache] Training day ${dayId} cache invalidated successfully`);
  } catch (error) {
    console.error("❌ Error invalidating training day cache:", error);
    await reportErrorToDashboard({
      message: error instanceof Error ? error.message : "Unknown error in invalidateTrainingDayCache",
      stack: error instanceof Error ? error.stack : undefined,
      appName: "trainer-panel",
      environment: process.env.NODE_ENV || "development",
      additionalContext: {
        action: "invalidateTrainingDayCache",
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        dayId,
      },
      tags: ["training", "day", "cache", "invalidation"],
    });
  }
}
