"use server";

import { getUserProgress as getUserProgressInternal } from "@gafus/statistics";

export type { UserDetailedProgress, UserDayProgress } from "@gafus/statistics";

export async function getUserProgress(courseId: string, userId: string) {
  return getUserProgressInternal(courseId, userId);
}
