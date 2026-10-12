import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockLogger } from "./test/test-utils";

vi.mock("@gafus/logger", () => ({
  createWorkerLogger: () => createMockLogger(),
}));

describe("personalizer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseUserData = {
    userId: "user-1",
    username: "testuser",
    dogName: "Шарик",
    completedCourses: [
      { id: "c1", name: "Основы", rating: 5 },
      { id: "c2", name: "Продвинутый", rating: 4 },
    ],
    totalSteps: 20,
  };

  describe("personalizeMessage", () => {
    it("заменяет плейсхолдеры {username} и {dogName}", async () => {
      const { personalizeMessage } = await import("./personalizer");
      const variant = {
        id: "v1",
        type: "emotional" as const,
        level: 1 as const,
        title: "Привет, {username}!",
        body: "Как {dogName}?",
        urlTemplate: "/trainings/group",
      };

      const result = personalizeMessage(variant, baseUserData);

      expect(result.title).toBe("Привет, testuser!");
      expect(result.body).toBe("Как Шарик?");
    });

    it("заменяет {bestCourseId} в urlTemplate", async () => {
      const { personalizeMessage } = await import("./personalizer");
      const variant = {
        id: "v1",
        type: "educational" as const,
        level: 2 as const,
        title: "Курс",
        body: "Текст",
        urlTemplate: "/trainings/group/{bestCourseId}",
      };

      const result = personalizeMessage(variant, baseUserData);

      expect(result.url).toContain("c1");
    });

    it("возвращает fallback при ошибке", async () => {
      const { personalizeMessage } = await import("./personalizer");
      const variant = {
        id: "v1",
        type: "emotional" as const,
        level: 1 as const,
        title: "Title",
        body: "Body",
        urlTemplate: "/trainings/group",
      };
      const badUserData = {
        ...baseUserData,
        completedCourses: [
          { id: "c1", name: "X", rating: Infinity },
        ] as unknown as typeof baseUserData.completedCourses,
      };

      const result = personalizeMessage(variant, badUserData);

      expect(result).toHaveProperty("title");
      expect(result).toHaveProperty("body");
      expect(result.url).toBe("/trainings/group");
    });
  });

  describe("validatePersonalizedMessage", () => {
    it("возвращает false если остались плейсхолдеры", async () => {
      const { validatePersonalizedMessage } = await import("./personalizer");

      expect(
        validatePersonalizedMessage({
          title: "Привет {username}",
          body: "Текст",
          url: "/",
          data: {},
        }),
      ).toBe(false);
    });

    it("возвращает true если плейсхолдеров нет", async () => {
      const { validatePersonalizedMessage } = await import("./personalizer");

      expect(
        validatePersonalizedMessage({
          title: "Привет",
          body: "Текст",
          url: "/",
          data: {},
        }),
      ).toBe(true);
    });
  });
});
