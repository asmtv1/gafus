import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  courseFind: vi.fn(),
  daysFind: vi.fn(),
  trainingsFind: vi.fn(),
  stepsFind: vi.fn(),
  courseUpdate: vi.fn(),
  userFind: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    userCourse: { findFirst: m.courseFind, update: m.courseUpdate },
    dayOnCourse: { findMany: m.daysFind },
    userTraining: { findMany: m.trainingsFind },
    userStep: { findMany: m.stepsFind },
    user: { findUnique: m.userFind },
  },
}));
import {
  readOwnedCourseProgressRow,
  readCourseDaysProgressRows,
  readSharedCompletedTrainingRows,
  readOwnedCourseTrainingStatuses,
  readTrainingStartedSteps,
  writeOwnedUserCourseProgress,
  readProgressDisplayAccount,
  readOwnedCourseTrainingTimeline,
  readOwnedCourseTrainingDayRows,
} from "./userProgressRows.js";

beforeEach(() => {
  vi.clearAllMocks();
  for (const f of Object.values(m)) f.mockResolvedValue([]);
});
describe("learner progress repository owner/course scoping", () => {
  it("never fetches a learner's enrollment without their exact user and course id", async () => {
    await readOwnedCourseProgressRow("owner-A", "course-A");
    expect(m.courseFind).toHaveBeenCalledExactlyOnceWith({
      where: { userId: "owner-A", courseId: "course-A" },
      include: { user: { select: { username: true, profile: { select: { avatarUrl: true } } } } },
    });
  });
  it("public course day projection orders occurrence links and selects no progress of other learners", async () => {
    await readCourseDaysProgressRows("course-A");
    expect(m.daysFind).toHaveBeenCalledExactlyOnceWith({
      where: { courseId: "course-A" },
      orderBy: { order: "asc" },
      include: {
        day: {
          select: {
            title: true,
            shareProgressAcrossCourses: true,
            stepLinks: {
              orderBy: { order: "asc" },
              include: { step: { select: { title: true } } },
            },
          },
        },
      },
    });
  });
  it("shared completion is explicitly limited to the owner and supplied day IDs", async () => {
    await readSharedCompletedTrainingRows("owner-A", ["day-1", "day-2"]);
    const query = m.trainingsFind.mock.calls[0]?.[0];
    expect(query.where).toEqual({
      userId: "owner-A",
      status: "COMPLETED",
      dayOnCourse: { dayId: { in: ["day-1", "day-2"] } },
    });
    expect(query.select.steps.select).toMatchObject({
      stepOnDayId: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    });
  });
  it("scopes training lists and per-day step projections to the same account/course", async () => {
    await readOwnedCourseTrainingStatuses("owner-A", "course-A");
    await readOwnedCourseTrainingTimeline("owner-A", "course-A");
    await readOwnedCourseTrainingDayRows("owner-A", "course-A");
    expect(m.trainingsFind).toHaveBeenCalledTimes(3);
    for (const [query] of m.trainingsFind.mock.calls) {
      expect(query.where).toEqual({ userId: "owner-A", dayOnCourse: { courseId: "course-A" } });
    }
    expect(m.trainingsFind.mock.calls[2]?.[0].include).toEqual({
      steps: { include: { stepOnDay: true } },
    });
  });
  it("selects only started/completed owner training steps, and only account username/avatar", async () => {
    await readTrainingStartedSteps(["ut1", "ut2"]);
    expect(m.stepsFind).toHaveBeenCalledWith({
      where: {
        userTrainingId: { in: ["ut1", "ut2"] },
        status: { in: ["IN_PROGRESS", "COMPLETED"] },
      },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    await readProgressDisplayAccount("owner-A");
    expect(m.userFind).toHaveBeenCalledWith({
      where: { id: "owner-A" },
      select: { username: true, profile: { select: { avatarUrl: true } } },
    });
  });
  it("allows only canonical progress statuses, and updates precisely the owner's enrollment", async () => {
    await expect(() =>
      writeOwnedUserCourseProgress("owner-A", "course-A", { status: "PAUSED", startedAt: null }),
    ).toThrow("USER_COURSE_PROGRESS_STATUS_INVALID");
    await expect(() =>
      writeOwnedUserCourseProgress("", "course-A", { status: "COMPLETED", startedAt: null }),
    ).toThrow("USER_COURSE_PROGRESS_STATUS_INVALID");
    expect(m.courseUpdate).not.toHaveBeenCalled();
    const completedAt = new Date("2026-11-10T00:00:00Z");
    await writeOwnedUserCourseProgress("owner-A", "course-A", {
      status: "COMPLETED",
      startedAt: null,
      completedAt,
    });
    expect(m.courseUpdate).toHaveBeenCalledExactlyOnceWith({
      where: { userId_courseId: { userId: "owner-A", courseId: "course-A" } },
      data: { status: "COMPLETED", startedAt: null, completedAt },
    });
  });
});
