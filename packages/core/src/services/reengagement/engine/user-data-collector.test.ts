import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockLogger, createMockPrisma } from "./test/test-utils";

const mockPrisma = createMockPrisma();
const mockLogger = createMockLogger();

vi.mock("@gafus/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@gafus/logger", () => ({
  createWorkerLogger: () => mockLogger,
}));

describe("user-data-collector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("collectUserData", () => {
    it("возвращает null когда пользователь не найден", async () => {
      const { collectUserData } = await import("./user-data-collector");
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await collectUserData("nonexistent");

      expect(result).toBeNull();
    });

    it("собирает UserData при найденном пользователе", async () => {
      const { collectUserData } = await import("./user-data-collector");
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        username: "testuser",
        profile: { fullName: "Test" },
        pets: [{ name: "Шарик" }],
      } as never);
      mockPrisma.userCourse.findMany.mockResolvedValue([]);
      mockPrisma.courseReview.findMany.mockResolvedValue([]);
      mockPrisma.userStep.count.mockResolvedValue(10);
      mockPrisma.userCourse.findFirst.mockResolvedValue(null);

      const result = await collectUserData("user-1");

      expect(result).not.toBeNull();
      expect(result!.userId).toBe("user-1");
      expect(result!.username).toBe("testuser");
      expect(result!.dogName).toBe("Шарик");
      expect(result!.totalSteps).toBe(10);
    });
  });

  describe("getBestRatedCourse", () => {
    it("возвращает null когда нет подходящего курса", async () => {
      const { getBestRatedCourse } = await import("./user-data-collector");
      mockPrisma.courseReview.findFirst.mockResolvedValue(null);

      const result = await getBestRatedCourse("user-1");

      expect(result).toBeNull();
    });

    it("возвращает лучший курс при наличии", async () => {
      const { getBestRatedCourse } = await import("./user-data-collector");
      mockPrisma.courseReview.findFirst.mockResolvedValue({
        rating: 5,
        course: { id: "c1", name: "Курс" },
      } as never);

      const result = await getBestRatedCourse("user-1");

      expect(result).toEqual({
        id: "c1",
        name: "Курс",
        rating: 5,
      });
    });
  });
});
