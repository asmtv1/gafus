import { describe, expect, it, beforeEach, vi } from "vitest";

import { createMockLogger } from "../../test/test-utils";
import { getAchievementStats } from "./statsService";

const mockUserCourseFindMany = vi.fn();
const mockUserTrainingFindMany = vi.fn();
const mockUserStepFindMany = vi.fn();
const mockDayOnCourseGroupBy = vi.fn();

vi.mock("@gafus/prisma", () => ({
  prisma: {
    userCourse: { findMany: (...args: unknown[]) => mockUserCourseFindMany(...args) },
    userTraining: {
      findMany: (...args: unknown[]) => mockUserTrainingFindMany(...args),
    },
    userStep: { findMany: (...args: unknown[]) => mockUserStepFindMany(...args) },
    dayOnCourse: { groupBy: (...args: unknown[]) => mockDayOnCourseGroupBy(...args) },
  },
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => createMockLogger(),
}));

describe("getAchievementStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserStepFindMany.mockResolvedValue([]);
    mockUserTrainingFindMany.mockImplementation((opts: { include?: unknown }) =>
      opts?.include ? Promise.resolve([]) : Promise.resolve([]),
    );
  });

  it("returns zeros when no data", async () => {
    mockUserCourseFindMany.mockResolvedValue([]);
    mockUserTrainingFindMany.mockResolvedValue([]);

    const result = await getAchievementStats("user-1");

    expect(result.totalCourses).toBe(0);
    expect(result.completedCourses).toBe(0);
    expect(result.inProgressCourses).toBe(0);
    expect(result.totalCompletedDays).toBe(0);
    expect(result.totalDays).toBe(0);
    expect(result.overallProgress).toBe(0);
    expect(result.longestStreak).toBe(0);
    expect(result.currentStreak).toBe(0);
    expect(result.achievements).toBeDefined();
    expect(result.lastUpdated).toBeInstanceOf(Date);
    expect(result.version).toBe("1.0.0");
  });

  it("computes totalCourses and completedCourses from userCourse", async () => {
    mockUserCourseFindMany.mockResolvedValue([
      { courseId: "c1", status: "COMPLETED" },
      { courseId: "c2", status: "COMPLETED" },
      { courseId: "c3", status: "IN_PROGRESS" },
    ]);
    mockUserTrainingFindMany.mockResolvedValue([]);
    mockDayOnCourseGroupBy.mockResolvedValue([]);

    const result = await getAchievementStats("user-1");

    expect(result.totalCourses).toBe(3);
    expect(result.completedCourses).toBe(2);
    expect(result.inProgressCourses).toBe(1);
  });

  it("excludes NOT_STARTED from active courses", async () => {
    mockUserCourseFindMany.mockResolvedValue([
      { courseId: "c1", status: "NOT_STARTED" },
      { courseId: "c2", status: "IN_PROGRESS" },
    ]);
    mockUserTrainingFindMany.mockResolvedValue([]);
    mockDayOnCourseGroupBy.mockResolvedValue([{ courseId: "c2", _count: 5 }]);

    const result = await getAchievementStats("user-1");

    expect(result.totalCourses).toBe(1);
  });

  it("computes overallProgress from completed days and total days", async () => {
    mockUserCourseFindMany.mockResolvedValue([
      { courseId: "c1", status: "IN_PROGRESS" },
    ]);
    mockUserTrainingFindMany
      .mockResolvedValueOnce([
        { dayOnCourse: { courseId: "c1" } },
        { dayOnCourse: { courseId: "c1" } },
      ])
      .mockResolvedValue([]);
    mockDayOnCourseGroupBy.mockResolvedValue([
      { courseId: "c1", _count: 4 },
    ]);

    const result = await getAchievementStats("user-1");

    expect(result.totalCompletedDays).toBe(2);
    expect(result.totalDays).toBe(4);
    expect(result.overallProgress).toBe(50);
  });
});
