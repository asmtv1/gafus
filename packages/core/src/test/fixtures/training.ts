/**
 * Fixture для тестов тренировок
 */
import type { UserTraining, UserStep, DayOnCourse } from "@gafus/prisma";
import { TrainingStatus } from "@gafus/prisma";

export function createUserTrainingFixture(
  overrides?: Partial<UserTraining>,
): Partial<UserTraining> {
  return {
    id: "test-training-id",
    userId: "test-user-id",
    dayOnCourseId: "test-day-id",
    status: TrainingStatus.NOT_STARTED,
    currentStepIndex: 0,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

export function createStepFixture(overrides?: Partial<UserStep>): Partial<UserStep> {
  return {
    id: "test-step-id",
    userTrainingId: "test-training-id",
    stepOnDayId: "test-step-on-day-id",
    status: TrainingStatus.NOT_STARTED,
    paused: false,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

export function createDayOnCourseFixture(
  overrides?: Partial<DayOnCourse>,
): Partial<DayOnCourse> {
  return {
    id: "test-day-id",
    courseId: "test-course-id",
    dayId: "test-training-day-id",
    order: 0,
    ...overrides,
  };
}
