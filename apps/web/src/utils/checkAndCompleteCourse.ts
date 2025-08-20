import { completeUserCourse } from "@shared/lib/user/userCourses";

import type { TrainingDayUtil } from "@gafus/types";

export async function checkAndCompleteCourse(
  trainingDays: TrainingDayUtil[],
  courseId?: string | null,
) {
  if (!courseId || courseId === null) {
    throw new Error("Не передан courseId. Обнавите страницу!");
  }

  const allCompleted = trainingDays?.every((day) => day.userStatus === "COMPLETED");

  if (allCompleted && courseId) {
    await completeUserCourse(courseId);
  }
}
