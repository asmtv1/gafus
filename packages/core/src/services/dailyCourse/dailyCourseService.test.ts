import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getDailyCourseCandidates,
  getDailyCourseBundleStepCandidates,
  getDailyCourseDayWithUserSteps,
  getDailyCourseScheduleStatistics,
  getMoscowDateKey,
  getTodayDailyCourse,
  updateDailyCourseStepAndDay,
  upsertDailyCourseBundle,
  upsertDailyCourseSchedule,
} from "./dailyCourseService";

const mocks = vi.hoisted(() => ({
  dailyCourseScheduleFindUnique: vi.fn(),
  dailyCourseScheduleFindFirst: vi.fn(),
  dailyCourseScheduleUpsert: vi.fn(),
  dailyCourseBundleFindMany: vi.fn(),
  dailyCourseBundleFindUnique: vi.fn(),
  dailyCourseBundleUpdate: vi.fn(),
  dailyCourseBundleCreate: vi.fn(),
  dailyCourseBundleStepDeleteMany: vi.fn(),
  dailyCourseBundleStepCreateMany: vi.fn(),
  dailyCourseUserTrainingUpsert: vi.fn(),
  dailyCourseUserStepFindFirst: vi.fn(),
  dailyCourseUserStepUpdate: vi.fn(),
  dailyCourseUserStepFindMany: vi.fn(),
  dailyCourseUserTrainingUpdate: vi.fn(),
  stepFindMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@gafus/prisma", () => ({
  prisma: {
    $transaction: (...args: unknown[]) => mocks.transaction(...args),
    dailyCourseSchedule: {
      findUnique: (...args: unknown[]) => mocks.dailyCourseScheduleFindUnique(...args),
      findFirst: (...args: unknown[]) => mocks.dailyCourseScheduleFindFirst(...args),
      upsert: (...args: unknown[]) => mocks.dailyCourseScheduleUpsert(...args),
    },
    dailyCourseBundle: {
      findMany: (...args: unknown[]) => mocks.dailyCourseBundleFindMany(...args),
      findUnique: (...args: unknown[]) => mocks.dailyCourseBundleFindUnique(...args),
      update: (...args: unknown[]) => mocks.dailyCourseBundleUpdate(...args),
      create: (...args: unknown[]) => mocks.dailyCourseBundleCreate(...args),
    },
    dailyCourseBundleStep: {
      deleteMany: (...args: unknown[]) => mocks.dailyCourseBundleStepDeleteMany(...args),
      createMany: (...args: unknown[]) => mocks.dailyCourseBundleStepCreateMany(...args),
    },
    dailyCourseUserTraining: {
      upsert: (...args: unknown[]) => mocks.dailyCourseUserTrainingUpsert(...args),
      update: (...args: unknown[]) => mocks.dailyCourseUserTrainingUpdate(...args),
    },
    dailyCourseUserStep: {
      findFirst: (...args: unknown[]) => mocks.dailyCourseUserStepFindFirst(...args),
      update: (...args: unknown[]) => mocks.dailyCourseUserStepUpdate(...args),
      findMany: (...args: unknown[]) => mocks.dailyCourseUserStepFindMany(...args),
    },
    step: {
      findMany: (...args: unknown[]) => mocks.stepFindMany(...args),
    },
  },
  isPrismaUniqueConstraintError: () => false,
  TrainingStatus: {
    NOT_STARTED: "NOT_STARTED",
    IN_PROGRESS: "IN_PROGRESS",
    COMPLETED: "COMPLETED",
    RESET: "RESET",
  },
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

describe("dailyCourseService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      callback({
        dailyCourseSchedule: {
          findFirst: (...args: unknown[]) => mocks.dailyCourseScheduleFindFirst(...args),
        },
        dailyCourseBundle: {
          update: (...args: unknown[]) => mocks.dailyCourseBundleUpdate(...args),
          create: (...args: unknown[]) => mocks.dailyCourseBundleCreate(...args),
        },
        dailyCourseBundleStep: {
          deleteMany: (...args: unknown[]) => mocks.dailyCourseBundleStepDeleteMany(...args),
          createMany: (...args: unknown[]) => mocks.dailyCourseBundleStepCreateMany(...args),
        },
        dailyCourseUserTraining: {
          upsert: (...args: unknown[]) => mocks.dailyCourseUserTrainingUpsert(...args),
          update: (...args: unknown[]) => mocks.dailyCourseUserTrainingUpdate(...args),
        },
        dailyCourseUserStep: {
          findFirst: (...args: unknown[]) => mocks.dailyCourseUserStepFindFirst(...args),
          update: (...args: unknown[]) => mocks.dailyCourseUserStepUpdate(...args),
          findMany: (...args: unknown[]) => mocks.dailyCourseUserStepFindMany(...args),
        },
      }),
    );
  });

  it("calculates date in Europe/Moscow", () => {
    expect(getMoscowDateKey(new Date("2026-05-02T20:59:59.000Z"))).toBe("2026-05-02");
    expect(getMoscowDateKey(new Date("2026-05-02T21:00:00.000Z"))).toBe("2026-05-03");
  });

  it("returns empty today response when nothing is scheduled", async () => {
    mocks.dailyCourseScheduleFindUnique.mockResolvedValue(null);

    const result = await getTodayDailyCourse("user-1", new Date("2026-05-02T21:00:00.000Z"));

    expect(result).toMatchObject({
      mskDate: "2026-05-03",
      scheduleId: null,
      userStatus: "NOT_STARTED",
      stepsSummary: { total: 0, completed: 0 },
    });
  });

  it("filters candidates to safe 2-5 daily course bundles scoped by trainer", async () => {
    mocks.dailyCourseBundleFindMany.mockResolvedValue([
      dailyBundle("valid", "Valid", ["TRAINING", "PRACTICE"]),
      dailyBundle("exam", "Exam", ["TRAINING", "EXAMINATION"], "trainer-1", {
        EXAMINATION: { requiresVideoReport: true },
      }),
      dailyBundle("too-small", "Too small", ["TRAINING"]),
      dailyBundle("diary", "Diary", ["TRAINING", "DIARY"]),
      {
        ...dailyBundle("report", "Report", ["TRAINING", "PRACTICE"]),
        stepLinks: [
          stepLink("TRAINING"),
          {
            ...stepLink("PRACTICE"),
            step: { ...stepLink("PRACTICE").step, hasTestQuestions: true },
          },
        ],
      },
    ]);

    const result = await getDailyCourseCandidates({ id: "trainer-1", role: "TRAINER" });

    expect(mocks.dailyCourseBundleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { authorId: "trainer-1" } }),
    );
    expect(result).toEqual([
      expect.objectContaining({ id: "valid", title: "Valid", stepsCount: 2 }),
      expect.objectContaining({ id: "exam", title: "Exam", stepsCount: 2 }),
    ]);
  });

  it("does not allow scheduling another trainer bundle for non-admin actor", async () => {
    mocks.dailyCourseScheduleFindUnique.mockResolvedValue(null);
    mocks.dailyCourseBundleFindUnique.mockResolvedValue(
      dailyBundle("valid", "Valid", ["TRAINING", "PRACTICE"], "other"),
    );

    await expect(
      upsertDailyCourseSchedule(
        { id: "trainer-1", role: "TRAINER" },
        { date: "2099-01-01", bundleId: "valid", isPublished: true },
      ),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("only lists daily-course marked steps as bundle step candidates", async () => {
    mocks.stepFindMany.mockResolvedValue([]);

    await getDailyCourseBundleStepCandidates({ id: "trainer-1", role: "TRAINER" });

    expect(mocks.stepFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          authorId: "trainer-1",
          isDailyCourse: true,
        }),
      }),
    );
  });

  it("lists examination daily-course steps as bundle step candidates", async () => {
    mocks.stepFindMany.mockResolvedValue([
      {
        id: "exam-step",
        title: "Exam step",
        type: "EXAMINATION",
        durationSec: null,
        authorId: "trainer-1",
        author: { username: "trainer" },
      },
    ]);

    const result = await getDailyCourseBundleStepCandidates({ id: "trainer-1", role: "TRAINER" });

    expect(mocks.stepFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([expect.objectContaining({ type: "EXAMINATION" })]),
        }),
      }),
    );
    expect(result).toEqual([expect.objectContaining({ id: "exam-step", type: "EXAMINATION" })]);
  });

  it("keeps examination metadata when building a daily course day for a user", async () => {
    mocks.dailyCourseScheduleFindFirst.mockResolvedValue({
      id: "schedule-1",
      date: new Date("2026-05-04T00:00:00.000Z"),
      bundle: {
        id: "bundle-1",
        title: "Daily exam",
        description: "Exam day",
        type: "daily_course",
        stepLinks: [
          {
            id: "bundle-step-1",
            order: 1,
            step: {
              ...stepLink("EXAMINATION").step,
              checklist: [
                { id: "q1", question: "Question?", options: ["A", "B"], correctAnswer: 0 },
              ],
              hasTestQuestions: true,
              requiresWrittenFeedback: true,
              requiresVideoReport: true,
            },
          },
        ],
      },
      userTrainings: [{ id: "user-training-1" }],
    });
    mocks.dailyCourseUserStepFindMany.mockResolvedValue([
      {
        id: "daily-user-step-1",
        bundleStepId: "bundle-step-1",
        status: "NOT_STARTED",
        paused: false,
        remainingSec: null,
        updatedAt: new Date("2026-05-04T08:00:00.000Z"),
      },
    ]);

    const result = await getDailyCourseDayWithUserSteps("user-1", "schedule-1", {
      createIfMissing: true,
    });

    expect(result?.steps[0]?.step).toMatchObject({
      type: "EXAMINATION",
      checklist: [{ id: "q1", question: "Question?", options: ["A", "B"], correctAnswer: 0 }],
      hasTestQuestions: true,
      requiresWrittenFeedback: true,
      requiresVideoReport: true,
    });
  });

  it("does not edit a bundle that is already used by a schedule", async () => {
    mocks.stepFindMany.mockResolvedValue([
      stepForBundle("step-1", "TRAINING"),
      stepForBundle("step-2", "PRACTICE"),
    ]);
    mocks.dailyCourseBundleFindUnique.mockResolvedValue({
      id: "bundle-1",
      authorId: "trainer-1",
      schedules: [{ id: "schedule-1" }],
    });
    mocks.dailyCourseBundleUpdate.mockResolvedValue({ id: "bundle-1" });
    mocks.dailyCourseBundleStepDeleteMany.mockResolvedValue({ count: 2 });
    mocks.dailyCourseBundleStepCreateMany.mockResolvedValue({ count: 2 });

    await expect(
      upsertDailyCourseBundle(
        { id: "trainer-1", role: "TRAINER" },
        {
          id: "bundle-1",
          title: "Updated",
          equipment: "",
          description: "",
          type: "daily_course",
          stepIds: ["step-1", "step-2"],
        },
      ),
    ).rejects.toThrow("DAILY_COURSE_BUNDLE_IN_USE");

    expect(mocks.dailyCourseBundleStepDeleteMany).not.toHaveBeenCalled();
  });

  it("does not return future daily course schedules to users", async () => {
    mocks.dailyCourseScheduleFindFirst.mockResolvedValue(null);

    const result = await getDailyCourseDayWithUserSteps("user-1", "schedule-1", {
      createIfMissing: true,
    });

    expect(result).toBeNull();
    expect(mocks.dailyCourseScheduleFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "schedule-1",
          isPublished: true,
          date: expect.objectContaining({ lte: expect.any(Date) }),
        }),
      }),
    );
  });

  it("rejects daily course timer values larger than step duration", async () => {
    mocks.dailyCourseScheduleFindFirst.mockResolvedValue({
      id: "schedule-1",
      bundle: {
        stepLinks: [{ id: "bundle-step-1", step: { durationSec: 60 } }],
      },
    });
    mocks.dailyCourseUserTrainingUpsert.mockResolvedValue({ id: "user-training-1" });
    mocks.dailyCourseUserStepFindFirst.mockResolvedValue({
      id: "user-step-1",
      status: "IN_PROGRESS",
    });
    mocks.dailyCourseUserStepUpdate.mockResolvedValue({ id: "user-step-1" });
    mocks.dailyCourseUserStepFindMany.mockResolvedValue([
      { bundleStepId: "bundle-step-1", status: "IN_PROGRESS" },
    ]);
    mocks.dailyCourseUserTrainingUpdate.mockResolvedValue({ id: "user-training-1" });

    await expect(
      updateDailyCourseStepAndDay("user-1", "schedule-1", 0, {
        type: "pause",
        remainingSec: 61,
      }),
    ).rejects.toThrow("INVALID_TIMER");

    expect(mocks.dailyCourseUserStepUpdate).not.toHaveBeenCalled();
  });

  it("builds daily course schedule statistics for users who opened the selected day", async () => {
    const openedAt = new Date("2026-05-04T08:00:00.000Z");
    const startedAt = new Date("2026-05-04T08:05:00.000Z");
    const completedAt = new Date("2026-05-04T08:10:00.000Z");

    mocks.dailyCourseScheduleFindFirst.mockResolvedValue({
      id: "schedule-1",
      date: new Date("2026-05-04T00:00:00.000Z"),
      isPublished: true,
      bundle: {
        id: "bundle-1",
        title: "Morning routine",
        authorId: "trainer-1",
        stepLinks: [
          {
            id: "bundle-step-1",
            order: 0,
            step: { id: "step-1", title: "Warm up" },
          },
          {
            id: "bundle-step-2",
            order: 1,
            step: { id: "step-2", title: "Main drill" },
          },
        ],
      },
      userTrainings: [
        {
          id: "training-opened",
          userId: "user-opened",
          status: "NOT_STARTED",
          currentStepIndex: 0,
          createdAt: openedAt,
          updatedAt: openedAt,
          user: { id: "user-opened", username: "opened_only" },
          steps: [],
        },
        {
          id: "training-started",
          userId: "user-started",
          status: "IN_PROGRESS",
          currentStepIndex: 1,
          createdAt: startedAt,
          updatedAt: completedAt,
          user: { id: "user-started", username: "started_user" },
          steps: [
            {
              id: "user-step-1",
              bundleStepId: "bundle-step-1",
              status: "COMPLETED",
              paused: false,
              remainingSec: null,
              createdAt: startedAt,
              updatedAt: completedAt,
            },
            {
              id: "user-step-2",
              bundleStepId: "bundle-step-2",
              status: "IN_PROGRESS",
              paused: true,
              remainingSec: 45,
              createdAt: startedAt,
              updatedAt: startedAt,
            },
          ],
        },
      ],
    });

    const result = await getDailyCourseScheduleStatistics(
      { id: "trainer-1", role: "TRAINER" },
      { scheduleId: "schedule-1" },
    );

    expect(result).toMatchObject({
      scheduleId: "schedule-1",
      mskDate: "2026-05-04",
      title: "Morning routine",
      totalSteps: 2,
      summary: {
        openedUsers: 2,
        startedUsers: 1,
        completedUsers: 0,
        openedWithoutStartUsers: 1,
      },
    });
    expect(result?.users).toHaveLength(2);
    expect(result?.users[0]).toMatchObject({
      userId: "user-started",
      username: "started_user",
      status: "IN_PROGRESS",
      completedSteps: 1,
      totalSteps: 2,
      currentStepTitle: "Main drill",
    });
    expect(result?.users[0]?.steps).toEqual([
      expect.objectContaining({
        bundleStepId: "bundle-step-1",
        title: "Warm up",
        status: "COMPLETED",
      }),
      expect.objectContaining({
        bundleStepId: "bundle-step-2",
        title: "Main drill",
        status: "IN_PROGRESS",
        paused: true,
        remainingSec: 45,
      }),
    ]);
    expect(result?.users[1]).toMatchObject({
      userId: "user-opened",
      username: "opened_only",
      status: "NOT_STARTED",
      completedSteps: 0,
      currentStepTitle: "Warm up",
    });
  });

  it("does not expose another trainer's daily course statistics to a non-elevated trainer", async () => {
    mocks.dailyCourseScheduleFindFirst.mockResolvedValue(null);

    const result = await getDailyCourseScheduleStatistics(
      { id: "trainer-1", role: "TRAINER" },
      { scheduleId: "schedule-2" },
    );

    expect(result).toBeNull();
    expect(mocks.dailyCourseScheduleFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "schedule-2",
          bundle: { authorId: "trainer-1" },
        },
      }),
    );
  });
});

function dailyBundle(
  id: string,
  title: string,
  types: string[],
  authorId = "trainer-1",
  overrides: Record<string, Partial<ReturnType<typeof stepLink>["step"]>> = {},
) {
  return {
    id,
    title,
    type: "daily_course",
    authorId,
    author: { username: authorId },
    stepLinks: types.map((type) => {
      const link = stepLink(type);
      return { ...link, step: { ...link.step, ...overrides[type] } };
    }),
  };
}

function stepLink(type: string) {
  return {
    id: `step-on-day-${type}`,
    order: 1,
    step: {
      id: `step-${type}`,
      title: type,
      description: "",
      type,
      durationSec: 60,
      estimatedDurationSec: 60,
      videoUrl: null,
      imageUrls: [],
      pdfUrls: [],
      checklist: null,
      requiresVideoReport: false,
      requiresWrittenFeedback: false,
      hasTestQuestions: false,
      isDailyCourse: true,
    },
  };
}

function stepForBundle(id: string, type: string) {
  return {
    id,
    title: type,
    description: "",
    type,
    durationSec: 60,
    estimatedDurationSec: 60,
    videoUrl: null,
    imageUrls: [],
    pdfUrls: [],
    requiresVideoReport: false,
    requiresWrittenFeedback: false,
    hasTestQuestions: false,
    isDailyCourse: true,
    authorId: "trainer-1",
  };
}
