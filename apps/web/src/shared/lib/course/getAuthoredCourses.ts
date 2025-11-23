"use server";

import type { AuthoredCourse } from "@gafus/types";
import { getAuthoredCoursesWithStats } from "@gafus/statistics";

import { getCurrentUserId } from "@/utils/getCurrentUserId";

export async function getAuthoredCourses(): Promise<AuthoredCourse[]> {
  const userId = await getCurrentUserId();

  if (!userId) {
    throw new Error("Пользователь не авторизован");
  }

  return getAuthoredCoursesWithStats(userId);
}

