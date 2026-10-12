import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  course: { findMany: vi.fn() },
  step: { findMany: vi.fn() },
  user: { findUnique: vi.fn() },
}));
vi.mock("@gafus/prisma", () => ({
  prisma: mock,
  TrainingStatus: {
    NOT_STARTED: "NOT_STARTED", IN_PROGRESS: "IN_PROGRESS", COMPLETED: "COMPLETED",
  },
}));
import { getAuthoredCoursesWithStats } from "./engine/course/getAuthoredCourses";
import { getStepStatistics } from "./engine/steps/statistics";
import { getUserProgress } from "./engine/user/progress";

describe("statistics business queries inside core", () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it("prevents querying all authors when an author ID is absent", async () => {
    await expect(getAuthoredCoursesWithStats("")).rejects.toThrow("Author ID is required");
    expect(mock.course.findMany).not.toHaveBeenCalled();
  });

  it("restricts step statistics to the current author unless elevated", async () => {
    mock.step.findMany.mockResolvedValue([]);
    expect(await getStepStatistics("trainer-1", false)).toEqual({ steps: [], totalSteps: 0 });
    expect(mock.step.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { authorId: "trainer-1" },
    }));
    expect(await getStepStatistics("trainer-1", true)).toEqual({ steps: [], totalSteps: 0 });
    expect(mock.step.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: {},
    }));
  });

  it("validates course and user IDs before any database request", async () => {
    await expect(getUserProgress("", "user-1")).rejects.toThrow("courseId");
    await expect(getUserProgress("course-1", "")).rejects.toThrow("userId");
    expect(mock.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns null instead of a partial progress DTO for unknown users", async () => {
    mock.user.findUnique.mockResolvedValue(null);
    expect(await getUserProgress("course-1", "user-1")).toBeNull();
    expect(mock.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "user-1" },
    }));
  });
});
