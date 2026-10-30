/**
 * AG1 TR018 actual Core engine SQL-shape and aggregation characterization.
 * Prisma is mocked; these synthetic counts are NOT production KPIs.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  courseFindMany: vi.fn(),
  stepFindMany: vi.fn(),
  userTrainingFindMany: vi.fn(),
  userStepFindMany: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    course: { findMany: m.courseFindMany },
    step: { findMany: m.stepFindMany },
    userTraining: { findMany: m.userTrainingFindMany },
    userStep: { findMany: m.userStepFindMany },
  },
  TrainingStatus: {
    NOT_STARTED: "NOT_STARTED", IN_PROGRESS: "IN_PROGRESS",
    COMPLETED: "COMPLETED", RESET: "RESET",
  },
}));

import { getCourseStatistics, getStepStatistics } from "./engine";

const created = new Date("2026-10-01T00:00:00Z");
const course = (owner: "TRAINER_A" | "TRAINER_B") => ({
  id: "COURSE_" + owner, authorId: owner,
  name: "Synthetic course " + owner,
  logoImg: "", avgRating: null, isPrivate: true, isPaid: false,
  isPersonalized: false, trainingLevel: "BEGINNER",
  createdAt: created,
  author: { username: owner, profile: { fullName: owner } },
  dayLinks: owner === "TRAINER_A" ? [
    { id: "DAY_A1" }, { id: "DAY_A2" },
  ] : [{ id: "DAY_B1" }],
  reviews: [],
  userCourses: owner === "TRAINER_A" ? [
    {
      userId: "STUDENT_1", status: "COMPLETED",
      startedAt: created, completedAt: created,
      user: { username: "student1", profile: { avatarUrl: null } },
    },
    {
      userId: "STUDENT_2", status: "IN_PROGRESS",
      startedAt: created, completedAt: null,
      user: { username: "student2", profile: { avatarUrl: null } },
    },
  ] : [
    {
      userId: "FOREIGN_STUDENT", status: "IN_PROGRESS",
      startedAt: created, completedAt: null,
      user: { username: "foreign", profile: { avatarUrl: null } },
    },
  ],
});
const step = (owner: "TRAINER_A" | "TRAINER_B") => ({
  id: "STEP_" + owner, authorId: owner,
  title: "Step " + owner, durationSec: 45, createdAt: created,
  stepLinks: [{
    dayId: "DAY_" + owner,
    day: {
      dayLinks: [{ courseId: "COURSE_" + owner }],
    },
  }],
});

beforeEach(() => {
  vi.resetAllMocks();
  m.courseFindMany.mockImplementation(async ({ where }: { where: { authorId?: string } }) =>
    [course("TRAINER_A"), course("TRAINER_B")].filter(
      (item) => where.authorId === undefined || item.authorId === where.authorId
    )
  );
  m.stepFindMany.mockImplementation(async ({ where }: { where: { authorId?: string } }) =>
    [step("TRAINER_A"), step("TRAINER_B")].filter(
      (item) => where.authorId === undefined || item.authorId === where.authorId
    )
  );
  m.userTrainingFindMany.mockResolvedValue([]);
  m.userStepFindMany.mockResolvedValue([]);
});

describe("AG1 TR018 real Core engine backed by synthetic Prisma fixture", () => {
  it("TRAINER_A only queries own authored courses and user progress for scoped IDs", async () => {
    const result = await getCourseStatistics("TRAINER_A", false);
    expect(m.courseFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { authorId: "TRAINER_A" },
      orderBy: { createdAt: "desc" },
    }));
    expect(m.userTrainingFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { dayOnCourse: { courseId: { in: ["COURSE_TRAINER_A"] } } },
    }));
    expect(m.userStepFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userTraining: {
          dayOnCourse: { courseId: { in: ["COURSE_TRAINER_A"] } },
        },
      }),
    }));
    expect(result.courses.map((item) => item.id)).toEqual(["COURSE_TRAINER_A"]);
    expect(result.totalCourses).toBe(1);
    expect(result.totalDays).toBe(2);
    expect(result.courses[0]).toMatchObject({
      totalUsers: 2, completedUsers: 1,
      inProgressUsers: 1, notStartedUsers: 0,
    });
    expect(result.courses[0].totalUsers).toBe(
      result.courses[0].completedUsers +
      result.courses[0].inProgressUsers +
      result.courses[0].notStartedUsers
    );
  });

  it("TRAINER_B cannot get A courses or A aggregate", async () => {
    const result = await getCourseStatistics("TRAINER_B", false);
    expect(m.courseFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { authorId: "TRAINER_B" },
    }));
    expect(result.courses.map((item) => item.id)).toEqual(["COURSE_TRAINER_B"]);
    expect(result.totalDays).toBe(1);
    expect(result.courses[0].totalUsers).toBe(1);
    expect(JSON.stringify(result)).not.toContain("STUDENT_1");
  });

  it("only explicit elevated Core request enumerates both course authors", async () => {
    const result = await getCourseStatistics("ADMIN_1", true);
    expect(m.courseFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    expect(result.courses.map((item) => item.id)).toEqual([
      "COURSE_TRAINER_A", "COURSE_TRAINER_B",
    ]);
    expect(result.totalCourses).toBe(2);
    expect(result.totalDays).toBe(3);
    expect(result.courses.reduce((sum, item) => sum + item.totalUsers, 0)).toBe(3);
  });

  it("empty scoped Core course source returns empty, never fake completion", async () => {
    m.courseFindMany.mockResolvedValueOnce([]);
    const result = await getCourseStatistics("TRAINER_A", false);
    expect(result).toEqual({ courses: [], totalCourses: 0, totalDays: 0 });
    expect(m.userTrainingFindMany).not.toHaveBeenCalled();
    expect(m.userStepFindMany).not.toHaveBeenCalled();
  });

  it("actual Core step query enforces TRAINER_A authorId and real linkage counts", async () => {
    const result = await getStepStatistics("TRAINER_A", false);
    expect(m.stepFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { authorId: "TRAINER_A" },
    }));
    expect(result).toMatchObject({
      totalSteps: 1,
      steps: [{
        id: "STEP_TRAINER_A", usedInDaysCount: 1, usedInCoursesCount: 1,
      }],
    });
    // These zeros are placeholders in the legacy engine, not measured progress.
    expect(result.steps[0].totalUsers).toBe(0);
    expect(result.steps[0].completedUsers).toBe(0);
  });

  it("step queries for TRAINER_B stay scoped, ADMIN elevated sees both", async () => {
    const foreign = await getStepStatistics("TRAINER_B", false);
    expect(foreign.steps.map((item) => item.id)).toEqual(["STEP_TRAINER_B"]);
    expect(m.stepFindMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { authorId: "TRAINER_B" },
    }));
    const all = await getStepStatistics("ADMIN_1", true);
    expect(all.steps.map((item) => item.id)).toEqual([
      "STEP_TRAINER_A", "STEP_TRAINER_B",
    ]);
    expect(m.stepFindMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: {} }));
  });
});
