import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  getTrainingDays,
  getTrainingDayWithUserSteps,
} from "./trainingService";
import { checkCourseAccess } from "../course";

const mockCourseFindFirst = vi.fn();
const mockCheckCourseAccessById = vi.fn();

// Mocks для getTrainingDayWithUserSteps и syncUserCourseStatusFromDays
const mockDayOnCourseFindFirst = vi.fn();
const mockDayOnCourseFindMany = vi.fn();
const mockUserTrainingUpsert = vi.fn();
const mockUserTrainingFindUnique = vi.fn();
const mockUserTrainingFindMany = vi.fn();
const mockUserStepFindMany = vi.fn();
const mockUserStepCreate = vi.fn();
const mockUserCourseFindUnique = vi.fn();
const mockUserCourseUpsert = vi.fn();
const mockTransaction = vi.fn();
const mockIsPrismaUniqueConstraintError = vi.fn();

const txForMissingSteps = {
  userStep: {
    create: (...args: unknown[]) => mockUserStepCreate(...args),
  },
};

vi.mock("@gafus/prisma", () => ({
  prisma: {
    course: {
      findFirst: (...args: unknown[]) => mockCourseFindFirst(...args),
    },
    dayOnCourse: {
      findFirst: (...args: unknown[]) => mockDayOnCourseFindFirst(...args),
      findMany: (...args: unknown[]) => mockDayOnCourseFindMany(...args),
    },
    userTraining: {
      upsert: (...args: unknown[]) => mockUserTrainingUpsert(...args),
      findUnique: (...args: unknown[]) => mockUserTrainingFindUnique(...args),
      findMany: (...args: unknown[]) => mockUserTrainingFindMany(...args),
    },
    userStep: {
      findMany: (...args: unknown[]) => mockUserStepFindMany(...args),
      create: (...args: unknown[]) => mockUserStepCreate(...args),
    },
    userCourse: {
      findUnique: (...args: unknown[]) => mockUserCourseFindUnique(...args),
      upsert: (...args: unknown[]) => mockUserCourseUpsert(...args),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => mockTransaction(fn),
  },
  isPrismaUniqueConstraintError: (err: unknown) => mockIsPrismaUniqueConstraintError(err),
}));

vi.mock("../course", () => ({
  checkCourseAccess: vi.fn().mockResolvedValue({ hasAccess: true }),
  checkCourseAccessById: (...args: unknown[]) => mockCheckCourseAccessById(...args),
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

describe("getTrainingDays", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckCourseAccessById.mockResolvedValue({ hasAccess: true });
  });

  it("returns empty trainingDays when course not found", async () => {
    mockCourseFindFirst.mockResolvedValue(null);

    const result = await getTrainingDays("user-1");

    expect(result.trainingDays).toEqual([]);
    expect(result.courseId).toBeNull();
  });

  it("returns trainingDays when course found", async () => {
    mockCourseFindFirst.mockResolvedValue({
      id: "course-1",
      description: "Описание",
      videoUrl: null,
      equipment: null,
      trainingLevel: "beginner",
      isPersonalized: false,
      isPrivate: false,
      isPaid: false,
      userCourses: [],
      dayLinks: [
        {
          id: "dl-1",
          order: 0,
          day: {
            title: "День 1",
            type: "regular",
            equipment: "",
            showCoursePathExport: false,
            stepLinks: [
              {
                id: "sl-1",
                order: 0,
                step: { durationSec: 60, estimatedDurationSec: 60, type: "TRAINING" },
              },
            ],
          },
          userTrainings: [
            {
              status: "IN_PROGRESS",
              steps: [{ stepOnDayId: "sl-1", status: "COMPLETED" }],
            },
          ],
        },
      ],
    });

    const result = await getTrainingDays("user-1");

    expect(result.trainingDays).toHaveLength(1);
    expect(result.courseId).toBe("course-1");
    expect(result.trainingDays[0].title).toBe("День 1");
  });

  it("throws when access denied for private course", async () => {
    mockCourseFindFirst.mockResolvedValue({
      id: "course-1",
      description: null,
      videoUrl: null,
      equipment: null,
      trainingLevel: "beginner",
      isPersonalized: false,
      isPrivate: true,
      isPaid: false,
      userCourses: [],
      dayLinks: [],
    });
    mockCheckCourseAccessById.mockResolvedValue({ hasAccess: false });

    await expect(getTrainingDays("user-1")).rejects.toThrow();
    expect(mockCheckCourseAccessById).toHaveBeenCalledWith("course-1", "user-1");
  });

  it("wraps generic error in user-friendly message", async () => {
    mockCourseFindFirst.mockRejectedValue(new Error("db failure"));

    await expect(getTrainingDays("user-1")).rejects.toThrow("Не удалось загрузить Тренировки");
  });

  it("counts TRAINING durationSec into estimatedDuration", async () => {
    mockCourseFindFirst.mockResolvedValue({
      id: "course-1",
      description: null,
      videoUrl: null,
      equipment: null,
      trainingLevel: "beginner",
      isPersonalized: false,
      isPrivate: false,
      isPaid: false,
      userCourses: [],
      dayLinks: [
        {
          id: "dl-1",
          order: 0,
          day: {
            title: "День 1",
            type: "regular",
            equipment: "",
            showCoursePathExport: false,
            stepLinks: [
              {
                id: "sl-1",
                order: 0,
                step: { durationSec: 120, estimatedDurationSec: null, type: "TRAINING" },
              },
            ],
          },
          userTrainings: [{ status: "NOT_STARTED", steps: [] }],
        },
      ],
    });

    const result = await getTrainingDays("user-1");

    expect(result.trainingDays[0].estimatedDuration).toBe(2);
  });

  it("counts PRACTICE estimatedDurationSec into estimatedDuration", async () => {
    mockCourseFindFirst.mockResolvedValue({
      id: "course-1",
      description: null,
      videoUrl: null,
      equipment: null,
      trainingLevel: "beginner",
      isPersonalized: false,
      isPrivate: false,
      isPaid: false,
      userCourses: [],
      dayLinks: [
        {
          id: "dl-1",
          order: 0,
          day: {
            title: "День 1",
            type: "regular",
            equipment: "",
            showCoursePathExport: false,
            stepLinks: [
              {
                id: "sl-1",
                order: 0,
                step: { durationSec: null, estimatedDurationSec: 60, type: "PRACTICE" },
              },
            ],
          },
          userTrainings: [{ status: "NOT_STARTED", steps: [] }],
        },
      ],
    });

    const result = await getTrainingDays("user-1");

    expect(result.trainingDays[0].estimatedDuration).toBe(1);
  });

  it("skips BREAK and DIARY in duration calculation", async () => {
    mockCourseFindFirst.mockResolvedValue({
      id: "course-1",
      description: null,
      videoUrl: null,
      equipment: null,
      trainingLevel: "beginner",
      isPersonalized: false,
      isPrivate: false,
      isPaid: false,
      userCourses: [],
      dayLinks: [
        {
          id: "dl-1",
          order: 0,
          day: {
            title: "Перерыв",
            type: "regular",
            equipment: "",
            showCoursePathExport: false,
            stepLinks: [
              { id: "sl-1", order: 0, step: { durationSec: null, estimatedDurationSec: null, type: "BREAK" } },
              { id: "sl-2", order: 1, step: { durationSec: null, estimatedDurationSec: null, type: "DIARY" } },
            ],
          },
          userTrainings: [{ status: "NOT_STARTED", steps: [] }],
        },
      ],
    });

    const result = await getTrainingDays("user-1");

    expect(result.trainingDays[0].estimatedDuration).toBe(0);
    expect(result.trainingDays[0].theoryMinutes).toBe(0);
  });

  it("counts THEORY into theoryMinutes", async () => {
    mockCourseFindFirst.mockResolvedValue({
      id: "course-1",
      description: null,
      videoUrl: null,
      equipment: null,
      trainingLevel: "beginner",
      isPersonalized: false,
      isPrivate: false,
      isPaid: false,
      userCourses: [],
      dayLinks: [
        {
          id: "dl-1",
          order: 0,
          day: {
            title: "Теория",
            type: "regular",
            equipment: "",
            showCoursePathExport: false,
            stepLinks: [
              {
                id: "sl-1",
                order: 0,
                step: { durationSec: null, estimatedDurationSec: 120, type: "THEORY" },
              },
            ],
          },
          userTrainings: [{ status: "NOT_STARTED", steps: [] }],
        },
      ],
    });

    const result = await getTrainingDays("user-1");

    expect(result.trainingDays[0].theoryMinutes).toBe(2);
  });

  it("summary day is NOT locked when all other days completed", async () => {
    mockCourseFindFirst.mockResolvedValue({
      id: "course-1",
      description: null,
      videoUrl: null,
      equipment: null,
      trainingLevel: "beginner",
      isPersonalized: false,
      isPrivate: false,
      isPaid: false,
      userCourses: [],
      dayLinks: [
        {
          id: "dl-regular",
          order: 0,
          day: {
            title: "День 1",
            type: "regular",
            equipment: "",
            showCoursePathExport: false,
            stepLinks: [
              {
                id: "sl-1",
                order: 0,
                step: { durationSec: 60, estimatedDurationSec: null, type: "TRAINING" },
              },
            ],
          },
          userTrainings: [
            {
              status: "COMPLETED",
              steps: [{ stepOnDayId: "sl-1", status: "COMPLETED" }],
            },
          ],
        },
        {
          id: "dl-summary",
          order: 1,
          day: {
            title: "Итоги",
            type: "summary",
            equipment: "",
            showCoursePathExport: false,
            stepLinks: [],
          },
          userTrainings: [{ status: "NOT_STARTED", steps: [] }],
        },
      ],
    });

    const result = await getTrainingDays("user-1");

    const summaryDay = result.trainingDays.find((d) => d.type === "summary");
    expect(summaryDay).toBeDefined();
    expect(summaryDay?.isLocked).toBe(false);
  });

  it("locks summary day when other days not completed", async () => {
    mockCourseFindFirst.mockResolvedValue({
      id: "course-1",
      description: null,
      videoUrl: null,
      equipment: null,
      trainingLevel: "beginner",
      isPersonalized: false,
      isPrivate: false,
      isPaid: false,
      userCourses: [],
      dayLinks: [
        {
          id: "dl-regular",
          order: 0,
          day: {
            title: "День 1",
            type: "regular",
            equipment: "",
            showCoursePathExport: false,
            stepLinks: [
              {
                id: "sl-1",
                order: 0,
                step: {
                  durationSec: 60,
                  estimatedDurationSec: null,
                  type: "TRAINING",
                },
              },
            ],
          },
          userTrainings: [
            {
              status: "IN_PROGRESS",
              steps: [{ stepOnDayId: "sl-1", status: "IN_PROGRESS" }],
            },
          ],
        },
        {
          id: "dl-summary",
          order: 1,
          day: {
            title: "Итоги",
            type: "summary",
            equipment: "",
            showCoursePathExport: false,
            stepLinks: [],
          },
          userTrainings: [{ status: "NOT_STARTED", steps: [] }],
        },
      ],
    });

    const result = await getTrainingDays("user-1");

    const summaryDay = result.trainingDays.find((d) => d.type === "summary");
    expect(summaryDay).toBeDefined();
    expect(summaryDay?.isLocked).toBe(true);
  });
});

describe("getTrainingDayWithUserSteps", () => {
  const baseFoundDay = {
    id: "doc-1",
    order: 1,
    courseId: "course-1",
    course: {
      duration: "30 дней",
      isPersonalized: false,
      userCourses: [],
    },
    day: {
      id: "day-1",
      title: "День 1",
      description: "Описание",
      type: "regular",
      showCoursePathExport: false,
      stepLinks: [
        {
          id: "sl-1",
          order: 0,
          step: {
            id: "step-1",
            title: "Шаг",
            description: null,
            durationSec: 60,
            estimatedDurationSec: null,
            videoUrl: null,
            imageUrls: null,
            pdfUrls: null,
            type: "TRAINING",
            checklist: null,
            requiresVideoReport: false,
            requiresWrittenFeedback: false,
            hasTestQuestions: false,
          },
        },
      ],
    },
    userTrainings: [] as { id: string; status: string; currentStepIndex: number }[],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkCourseAccess).mockResolvedValue({ hasAccess: true });
    mockDayOnCourseFindMany.mockResolvedValue([
      { order: 1, day: { type: "regular" } },
    ]);
  });

  it("returns null when access denied", async () => {
    vi.mocked(checkCourseAccess).mockResolvedValue({ hasAccess: false });

    const result = await getTrainingDayWithUserSteps("u1", "main", "doc-1");

    expect(result).toBeNull();
  });

  it("returns null when dayOnCourse not found", async () => {
    mockDayOnCourseFindFirst.mockResolvedValue(null);

    const result = await getTrainingDayWithUserSteps("u1", "main", "doc-1");

    expect(result).toBeNull();
  });

  it("returns day with NOT_STARTED steps when no userTraining and no createIfMissing", async () => {
    mockDayOnCourseFindFirst.mockResolvedValue({
      ...baseFoundDay,
      userTrainings: [],
    });

    const result = await getTrainingDayWithUserSteps("u1", "main", "doc-1");

    expect(result).not.toBeNull();
    expect(result?.userStatus).toBe("NOT_STARTED");
    expect(result?.steps[0].userStepId).toBeUndefined();
  });

  it("creates userTraining when createIfMissing:true and no existing training", async () => {
    mockDayOnCourseFindFirst.mockResolvedValue({
      ...baseFoundDay,
      userTrainings: [],
    });
    mockUserTrainingUpsert.mockResolvedValue({ id: "ut-1" });
    mockUserStepFindMany.mockResolvedValue([]);
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(txForMissingSteps),
    );
    mockUserStepCreate.mockResolvedValue({
      id: "us-1",
      stepOnDayId: "sl-1",
      status: "NOT_STARTED",
      paused: false,
      remainingSec: null,
    });

    const result = await getTrainingDayWithUserSteps("u1", "main", "doc-1", {
      createIfMissing: true,
    });

    expect(result).not.toBeNull();
    expect(mockUserTrainingUpsert).toHaveBeenCalled();
    expect(result?.steps[0].userStepId).toBe("us-1");
  });

  it("returns steps with isPausedOnServer and remainingSecOnServer when paused", async () => {
    mockDayOnCourseFindFirst.mockResolvedValue({
      ...baseFoundDay,
      userTrainings: [{ id: "ut-1", status: "IN_PROGRESS", currentStepIndex: 0 }],
    });
    mockUserStepFindMany.mockResolvedValue([
      {
        id: "us-1",
        stepOnDayId: "sl-1",
        status: "IN_PROGRESS",
        paused: true,
        remainingSec: 45,
      },
    ]);

    const result = await getTrainingDayWithUserSteps("u1", "main", "doc-1");

    expect(result?.steps[0].isPausedOnServer).toBe(true);
    expect(result?.steps[0].remainingSecOnServer).toBe(45);
  });

  it("falls back to findMany without paused/remainingSec when first findMany throws", async () => {
    mockDayOnCourseFindFirst.mockResolvedValue({
      ...baseFoundDay,
      userTrainings: [{ id: "ut-1", status: "IN_PROGRESS", currentStepIndex: 0 }],
    });
    mockUserStepFindMany
      .mockRejectedValueOnce(new Error("column not found"))
      .mockResolvedValueOnce([
        { id: "us-1", stepOnDayId: "sl-1", status: "IN_PROGRESS" },
      ]);

    const result = await getTrainingDayWithUserSteps("u1", "main", "doc-1");

    expect(result?.steps[0].isPausedOnServer).toBe(false);
  });

  it("refreshes steps after P2002 on transaction in missing-step creation", async () => {
    mockDayOnCourseFindFirst.mockResolvedValue({
      ...baseFoundDay,
      userTrainings: [{ id: "ut-1", status: "NOT_STARTED", currentStepIndex: 0 }],
    });
    mockUserStepFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "us-1",
          stepOnDayId: "sl-1",
          status: "NOT_STARTED",
          paused: false,
          remainingSec: null,
        },
      ]);
    mockTransaction.mockRejectedValueOnce(
      Object.assign(new Error("unique"), { code: "P2002" }),
    );
    mockIsPrismaUniqueConstraintError.mockReturnValue(true);

    const result = await getTrainingDayWithUserSteps("u1", "main", "doc-1");

    expect(result).not.toBeNull();
    expect(result?.steps).toHaveLength(1);
  });
});

