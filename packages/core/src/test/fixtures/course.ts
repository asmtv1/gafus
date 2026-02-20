/**
 * Fixture для тестов курсов
 */
import type { Course } from "@gafus/prisma";

export function createCourseFixture(overrides?: Partial<Course>): Partial<Course> {
  return {
    id: "test-course-id",
    name: "Тестовый курс",
    type: "basic_dog_training",
    description: "Описание тестового курса",
    trainingLevel: "BEGINNER",
    duration: "30 дней",
    authorId: "test-user-id",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}
