/**
 * Pure application course-completion policy.
 * Persistence (including the enrollment CAS) belongs to composition ports.
 * This module intentionally has no imports from server packages or Prisma.
 */
import { TrainingStatus } from "@gafus/types";
import { createWebLogger } from "@gafus/logger";

export interface UserCourseCompletionPorts<TCourse> {
  completeUserCourseRecord(userId: string, courseId: string): Promise<TCourse>;
  completeExistingUserCourseRecord(userId: string, courseId: string): Promise<unknown>;
  countCourseDays(courseId: string): Promise<number>;
  readCourseDayIds(courseId: string): Promise<{ id: string }[]>;
  readOwnTrainingStatuses(userId: string, dayOnCourseIds: string[]): Promise<{
    dayOnCourseId: string;
    status: string;
  }[]>;
}

export function createUserCourseService<TCourse>(ports: UserCourseCompletionPorts<TCourse>) {
  const logger = createWebLogger("core-user-course");

  async function completeUserCourse(userId: string, courseId: string): Promise<{
    success: boolean; data?: TCourse; error?: string;
  }> {
    try {
      return { success: true, data: await ports.completeUserCourseRecord(userId, courseId) };
    } catch (error) {
      logger.error("Ошибка в completeUserCourse", error as Error, {
        operation: "complete_user_course_error", userId, courseId,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Неизвестная ошибка",
      };
    }
  }

  function getDaysCountForCourse(courseId: string): Promise<number> {
    return ports.countCourseDays(courseId);
  }

  function getUserTrainingsForDays(userId: string, dayOnCourseIds: string[]) {
    return ports.readOwnTrainingStatuses(userId, dayOnCourseIds);
  }

  async function checkAndCompleteCourse(
    userId: string,
    courseId: string,
    options?: { trainingDays?: { userStatus: string }[] },
  ): Promise<{ success: boolean; reason?: string }> {
    if (options?.trainingDays) {
      const trainingDays = options.trainingDays;
      if (!trainingDays.every((d) => d.userStatus === TrainingStatus.COMPLETED)) {
        return { success: false, reason: "Not all training days completed" };
      }
      const count = await getDaysCountForCourse(courseId);
      if (trainingDays.length !== count) {
        return { success: false, reason: "Not all course days have trainings" };
      }
      const completed = await completeUserCourse(userId, courseId);
      return completed.success ? { success: true } : { success: false, reason: completed.error };
    }

    try {
      const allDays = await ports.readCourseDayIds(courseId);
      if (allDays.length === 0) return { success: false, reason: "No days in course" };
      const trainings = await getUserTrainingsForDays(userId, allDays.map(d => d.id));
      const statuses = new Map(trainings.map(item => [item.dayOnCourseId, item.status]));
      if (!allDays.every(day => statuses.get(day.id) === TrainingStatus.COMPLETED)) {
        return { success: false, reason: "Not all days completed" };
      }
      await ports.completeExistingUserCourseRecord(userId, courseId);
      return { success: true };
    } catch (error) {
      logger.error("Ошибка в checkAndCompleteCourse", error as Error, {
        operation: "check_and_complete_course_error", userId, courseId,
      });
      return { success: false, reason: "Error checking course completion" };
    }
  }

  return {
    completeUserCourse,
    getDaysCountForCourse,
    getUserTrainingsForDays,
    checkAndCompleteCourse,
  };
}
