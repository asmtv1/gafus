import { describe, expect, it, beforeEach, vi } from "vitest";

import { createMockLogger } from "../../test/test-utils";
import { getUserTrainingDates } from "./datesService";

const mockUserStepFindMany = vi.fn();
const mockUserTrainingFindMany = vi.fn();

vi.mock("@gafus/prisma", () => ({
  prisma: {
    userStep: { findMany: (...args: unknown[]) => mockUserStepFindMany(...args) },
    userTraining: {
      findMany: (...args: unknown[]) => mockUserTrainingFindMany(...args),
    },
  },
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => createMockLogger(),
}));

describe("getUserTrainingDates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns unique dates from steps and trainings", async () => {
    mockUserStepFindMany.mockResolvedValue([
      { updatedAt: new Date("2025-03-15T10:00:00") },
      { updatedAt: new Date("2025-03-14T12:00:00") },
    ]);
    mockUserTrainingFindMany.mockResolvedValue([
      { updatedAt: new Date("2025-03-15T18:00:00") },
    ]);

    const result = await getUserTrainingDates("user-1");

    expect(result).toHaveLength(2);
    expect(result[0].getTime()).toBeGreaterThanOrEqual(result[1].getTime());
    expect(mockUserStepFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userTraining: { userId: "user-1" }, status: "COMPLETED" },
      }),
    );
    expect(mockUserTrainingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", status: "COMPLETED" },
      }),
    );
  });

  it("returns empty array when no data", async () => {
    mockUserStepFindMany.mockResolvedValue([]);
    mockUserTrainingFindMany.mockResolvedValue([]);

    const result = await getUserTrainingDates("user-1");

    expect(result).toEqual([]);
  });

  it("throws when prisma throws", async () => {
    mockUserStepFindMany.mockRejectedValue(new Error("DB error"));
    mockUserTrainingFindMany.mockResolvedValue([]);

    await expect(getUserTrainingDates("user-1")).rejects.toThrow("DB error");
  });
});
