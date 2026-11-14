import { describe, expect, it } from "vitest";
import {
  createCourseFixture,
  createPetFixture,
  createUserFixture,
  createUserTrainingFixture,
  createStepFixture,
  createDayOnCourseFixture,
} from "./index";
import { TrainingStatus } from "@gafus/types";

describe("pure test fixture contracts", () => {
  it("preserves stable baseline fields and typed overrides without importing database infrastructure", () => {
    expect(createCourseFixture({ name: "Пробный курс" })).toMatchObject({
      id: "test-course-id", name: "Пробный курс", authorId: "test-user-id",
    });
    expect(createPetFixture({ name: "Рекс" })).toMatchObject({
      id: "test-pet-id", name: "Рекс", type: "DOG",
    });
    expect(createUserFixture({ username: "trainer" })).toMatchObject({
      id: "test-user-id", username: "trainer", role: "USER",
    });
  });
  it("keeps the unchanged training status and relational fixture references", () => {
    expect(createUserTrainingFixture()).toMatchObject({
      status: TrainingStatus.NOT_STARTED, userId: "test-user-id", dayOnCourseId: "test-day-id",
    });
    expect(createStepFixture()).toMatchObject({
      status: TrainingStatus.NOT_STARTED, stepOnDayId: "test-step-on-day-id",
    });
    expect(createDayOnCourseFixture()).toMatchObject({
      courseId: "test-course-id", order: 0,
    });
  });
  it("constructs independent Date instances per request", () => {
    expect(createCourseFixture().createdAt).not.toBe(createCourseFixture().createdAt);
    expect(createPetFixture().createdAt).not.toBe(createPetFixture().createdAt);
    expect(createUserTrainingFixture().createdAt).not.toBe(createUserTrainingFixture().createdAt);
  });
});
