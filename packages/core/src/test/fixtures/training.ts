/**
 * Fixture для тестов тренировок
 */
import { TrainingStatus } from "@gafus/types";

function defaultUserTrainingFixture() {
  return {
    id: "test-training-id",
    userId: "test-user-id",
    dayOnCourseId: "test-day-id",
    status: TrainingStatus.NOT_STARTED,
    currentStepIndex: 0,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  };
}

type UserTrainingFixture = ReturnType<typeof defaultUserTrainingFixture>;

export function createUserTrainingFixture(
  overrides?: Partial<UserTrainingFixture>,
): Partial<UserTrainingFixture> {
  return { ...defaultUserTrainingFixture(), ...overrides };
}

function defaultUserStepFixture() {
  return {
    id: "test-step-id",
    userTrainingId: "test-training-id",
    stepOnDayId: "test-step-on-day-id",
    status: TrainingStatus.NOT_STARTED,
    paused: false,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  };
}

type UserStepFixture = ReturnType<typeof defaultUserStepFixture>;

export function createStepFixture(overrides?: Partial<UserStepFixture>): Partial<UserStepFixture> {
  return { ...defaultUserStepFixture(), ...overrides };
}

function defaultDayOnCourseFixture() {
  return {
    id: "test-day-id",
    courseId: "test-course-id",
    dayId: "test-training-day-id",
    order: 0,
  };
}

type DayOnCourseFixture = ReturnType<typeof defaultDayOnCourseFixture>;

export function createDayOnCourseFixture(
  overrides?: Partial<DayOnCourseFixture>,
): Partial<DayOnCourseFixture> {
  return { ...defaultDayOnCourseFixture(), ...overrides };
}
