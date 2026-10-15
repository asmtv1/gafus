import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  getTrainingDays,
  getTrainingDayWithMonetizedSteps,
  getTrainingDayWithUserSteps,
  requireCourseStepOperationAccess,
  resolveCourseStepRewardedTarget,
} from "./trainingService.ts";
import { checkCourseAccess } from "../course";
import { clearTrainingDayContentCache } from "./trainingDayContent";

vi.mock("./trainingContentRevision", () => ({
  courseContentSyncEnabled: () => true,
  getVerifiedCourseContentRevision: async () => "0",
}));

const mockCourseFindFirst = vi.fn();
const mockCheckCourseAccessById = vi.fn();

// Mocks для getTrainingDayWithUserSteps и syncUserCourseStatusFromDays
const mockDayOnCourseFindFirst = vi.fn();
const mockDayOnCourseFindUnique = vi.fn();
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
const mockGetPremiumOrRewardedAccess = vi.fn();
const mockRequirePremiumOrRewardedUnlock = vi.fn();
const mockHasActiveGafusAccess = vi.fn().mockResolvedValue(false);

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
      findUnique: (...args: unknown[]) => mockDayOnCourseFindUnique(...args),
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

vi.mock("../contentAccess", () => ({
  hasActiveGafusCourseStepAccess: (...args: unknown[]) => mockHasActiveGafusAccess(...args),
}));

vi.mock("../rewardedCredits", () => ({
  getPremiumOrRewardedAccess: (...args: unknown[]) => mockGetPremiumOrRewardedAccess(...args),
  requirePremiumOrRewardedUnlock: (...args: unknown[]) =>
    mockRequirePremiumOrRewardedUnlock(...args),
  REWARDED_STEP_UNLOCK_COST: 1,
  SubscriptionOrCreditsRequiredError: class SubscriptionOrCreditsRequiredError extends Error {
    constructor() {
      super("Для действия нужна подписка или rewarded credits");
      this.name = "SubscriptionOrCreditsRequiredError";
    }
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

  it("returns days for a public course without CourseAccess", async () => {
    mockCheckCourseAccessById.mockResolvedValue({ hasAccess: false });
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
          dayId: "day-1",
          day: {
            title: "День 1",
            type: "regular",
            equipment: "",
            showCoursePathExport: false,
            shareProgressAcrossCourses: false,
            stepLinks: [],
          },
          userTrainings: [],
        },
      ],
    });
    mockUserTrainingFindMany.mockResolvedValue([]);

    const result = await getTrainingDays("user-1", "course");

    expect(result.trainingDays).toHaveLength(1);
    expect(mockCheckCourseAccessById).not.toHaveBeenCalled();
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
              {
                id: "sl-1",
                order: 0,
                step: { durationSec: null, estimatedDurationSec: null, type: "BREAK" },
              },
              {
                id: "sl-2",
                order: 1,
                step: { durationSec: null, estimatedDurationSec: null, type: "DIARY" },
              },
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

describe("requireCourseStepOperationAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckCourseAccessById.mockResolvedValue({ hasAccess: true });
  });

  it("rejects a client courseId that does not own the target day", async () => {
    mockDayOnCourseFindUnique.mockResolvedValue({
      course: { id: "course-real", type: "real", isPaid: false, isPrivate: false },
      day: { stepLinks: [{ id: "step-link-1", step: { type: "BREAK" } }] },
    });

    await expect(
      requireCourseStepOperationAccess({
        userId: "user-1",
        platform: "ANDROID",
        expectedCourseId: "course-from-client",
        dayOnCourseId: "day-1",
        stepIndex: 0,
      }),
    ).rejects.toThrow("COURSE_DAY_MISMATCH");

    expect(mockCheckCourseAccessById).not.toHaveBeenCalled();
  });

  it("checks access against the course resolved from the day", async () => {
    mockDayOnCourseFindUnique.mockResolvedValue({
      course: { id: "course-real", type: "real", isPaid: true, isPrivate: false },
      day: { stepLinks: [{ id: "step-link-1", step: { type: "PRACTICE" } }] },
    });

    await expect(
      requireCourseStepOperationAccess({
        userId: "user-1",
        platform: "ANDROID",
        expectedCourseId: "course-real",
        dayOnCourseId: "day-1",
        stepIndex: 0,
      }),
    ).resolves.toEqual({ courseId: "course-real", courseType: "real" });

    expect(mockCheckCourseAccessById).toHaveBeenCalledWith("course-real", "user-1");
  });
});

describe("rewarded training step access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (checkCourseAccess as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      hasAccess: true,
    });
    mockDayOnCourseFindMany.mockResolvedValue([{ order: 1, day: { type: "regular" } }]);
    mockDayOnCourseFindFirst.mockResolvedValue({
      id: "doc-1",
      order: 1,
      courseId: "course-1",
      course: { duration: "1 week", isPersonalized: false, userCourses: [] },
      day: {
        id: "day-1",
        title: "Day",
        description: "Day description",
        type: "regular",
        showCoursePathExport: false,
        stepLinks: [
          {
            id: "sod-1",
            order: 0,
            step: {
              id: "step-1",
              title: "Theory",
              description: "Secret content",
              durationSec: null,
              estimatedDurationSec: 60,
              videoUrl: "video.mp4",
              imageUrls: ["image.png"],
              pdfUrls: ["file.pdf"],
              type: "THEORY",
              checklist: [{ id: "q1" }],
              requiresVideoReport: false,
              requiresWrittenFeedback: false,
              hasTestQuestions: true,
              surveySlug: "survey",
            },
          },
          {
            id: "sod-2",
            order: 1,
            step: {
              id: "step-2",
              title: "Break",
              description: "Free break",
              durationSec: null,
              estimatedDurationSec: null,
              videoUrl: null,
              imageUrls: [],
              pdfUrls: [],
              type: "BREAK",
              checklist: null,
              requiresVideoReport: false,
              requiresWrittenFeedback: false,
              hasTestQuestions: false,
              surveySlug: null,
            },
          },
        ],
      },
      userTrainings: [],
    });
  });

  it("redacts monetized locked steps without redacting free break steps", async () => {
    vi.mocked(checkCourseAccess).mockResolvedValue({ hasAccess: false });
    mockCourseFindFirst.mockResolvedValue({ isPaid: true, isPrivate: false });
    mockGetPremiumOrRewardedAccess.mockRejectedValue(
      Object.assign(new Error("locked"), { name: "SubscriptionOrCreditsRequiredError" }),
    );

    const result = await getTrainingDayWithMonetizedSteps("user-1", "course", "doc-1", {
      platform: "ANDROID",
    });

    expect(result?.steps[0]).toMatchObject({
      locked: true,
      description: "",
      videoUrl: "",
      imageUrls: [],
      pdfUrls: [],
      checklist: null,
      monetizationTarget: { targetType: "COURSE_STEP", targetId: "sod-1" },
    });
    expect(result?.steps[1]).toMatchObject({ locked: false, description: "Free break" });
  });

  it("resolves a monetized course step target by day and step index", async () => {
    const target = await resolveCourseStepRewardedTarget({
      userId: "user-1",
      courseType: "course",
      dayOnCourseId: "doc-1",
      stepIndex: 0,
    });

    expect(target).toEqual({ targetType: "COURSE_STEP", targetId: "sod-1" });
  });

  it("keeps future free course steps available without a subscription", async () => {
    vi.mocked(checkCourseAccess).mockResolvedValue({ hasAccess: true });
    mockCourseFindFirst.mockResolvedValue({ isPaid: false, isPrivate: false });
    const result = await getTrainingDayWithMonetizedSteps("user-1", "course", "doc-1", {
      platform: "ANDROID",
    });
    expect(result?.steps[0]).toMatchObject({ locked: false, description: "Secret content" });
    expect(mockGetPremiumOrRewardedAccess).not.toHaveBeenCalled();
  });

  it("does not redact steps in a paid course when separate CourseAccess exists", async () => {
    vi.mocked(checkCourseAccess).mockResolvedValue({ hasAccess: true });
    mockCourseFindFirst.mockResolvedValue({ isPaid: true, isPrivate: false });
    mockGetPremiumOrRewardedAccess.mockRejectedValue(
      Object.assign(new Error("locked"), { name: "SubscriptionOrCreditsRequiredError" }),
    );

    const result = await getTrainingDayWithMonetizedSteps("user-1", "course", "doc-1", {
      platform: "ANDROID",
    });

    expect(result?.steps[0]).toMatchObject({
      locked: false,
      description: "Secret content",
      videoUrl: "video.mp4",
    });
    expect(mockGetPremiumOrRewardedAccess).not.toHaveBeenCalled();
  });

  it("does not apply rewarded step gating inside a private course with CourseAccess", async () => {
    vi.mocked(checkCourseAccess).mockResolvedValue({ hasAccess: true });
    mockCourseFindFirst.mockResolvedValue({ isPaid: false, isPrivate: true });

    const result = await getTrainingDayWithMonetizedSteps("user-1", "course", "doc-1", {
      platform: "IOS",
    });

    expect(result?.steps[0]).toMatchObject({
      locked: false,
      description: "Secret content",
    });
    expect(mockGetPremiumOrRewardedAccess).not.toHaveBeenCalled();
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
  };

  beforeEach(() => {
    vi.clearAllMocks();
    clearTrainingDayContentCache();
    vi.mocked(checkCourseAccess).mockResolvedValue({ hasAccess: true });
    mockCourseFindFirst.mockResolvedValue({ isPaid: false, isPrivate: true });
    mockUserCourseFindUnique.mockResolvedValue(null);
    mockUserTrainingFindUnique.mockResolvedValue(null);
    mockDayOnCourseFindMany.mockResolvedValue([{ order: 1, day: { type: "regular" } }]);
  });

  it("isolates content projection from viewer grants, progress and personalization", async () => {
    mockDayOnCourseFindFirst.mockResolvedValue(baseFoundDay);

    await getTrainingDayWithUserSteps("u1", "main", "doc-1");

    const query = mockDayOnCourseFindFirst.mock.calls[0]?.[0];
    expect(query.where).toEqual({ id: "doc-1", course: { type: "main" } });
    expect(query.select.userTrainings).toBeUndefined();
    expect(query.select.course.select.userCourses).toBeUndefined();
    expect(query.select.day.select.stepLinks.select.step.select.description).toBe(true);
    expect(mockUserCourseFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_courseId: { userId: "u1", courseId: "course-1" } },
      }),
    );
    expect(mockUserTrainingFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_dayOnCourseId: { userId: "u1", dayOnCourseId: "doc-1" } },
      }),
    );
  });

  it("does not read user rows when no viewer is supplied", async () => {
    mockDayOnCourseFindFirst.mockResolvedValue(baseFoundDay);

    const result = await getTrainingDayWithUserSteps(undefined, "main", "doc-1");

    expect(result?.steps[0].status).toBe("NOT_STARTED");
    expect(mockUserCourseFindUnique).not.toHaveBeenCalled();
    expect(mockUserTrainingFindUnique).not.toHaveBeenCalled();
  });

  it("applies per-user names after reading shared lesson text", async () => {
    mockDayOnCourseFindFirst.mockResolvedValue({
      ...baseFoundDay,
      course: { ...baseFoundDay.course, isPersonalized: true },
      day: {
        ...baseFoundDay.day,
        title: "Привет, {{userName}}",
        stepLinks: [
          {
            ...baseFoundDay.day.stepLinks[0],
            step: {
              ...baseFoundDay.day.stepLinks[0].step,
              description: "{{petName}} начинает урок",
            },
          },
        ],
      },
    });
    mockUserCourseFindUnique.mockResolvedValue({
      userDisplayName: "Ира",
      userGender: "female",
      petName: "Лайка",
      petGender: "female",
      petNameGen: null,
      petNameDat: null,
      petNameAcc: null,
      petNameIns: null,
      petNamePre: null,
    });

    const result = await getTrainingDayWithUserSteps("u1", "main", "doc-1");

    expect(result?.title).toBe("Привет, Ира");
    expect(result?.steps[0].description).toBe("Лайка начинает урок");
  });

  it("requires personalization before revealing a personalized lesson", async () => {
    mockDayOnCourseFindFirst.mockResolvedValue({
      ...baseFoundDay,
      course: { ...baseFoundDay.course, isPersonalized: true },
    });

    await expect(getTrainingDayWithUserSteps("u1", "main", "doc-1")).rejects.toThrow(
      "PERSONALIZATION_REQUIRED",
    );
  });

  it("keeps current progress separate across viewers", async () => {
    mockDayOnCourseFindFirst.mockResolvedValue(baseFoundDay);
    mockUserTrainingFindUnique.mockImplementation(({ where }) =>
      where.userId_dayOnCourseId.userId === "u1"
        ? Promise.resolve({ id: "ut-1", status: "COMPLETED", currentStepIndex: 1 })
        : Promise.resolve(null),
    );
    mockUserStepFindMany.mockResolvedValue([
      {
        id: "us-1",
        stepOnDayId: "sl-1",
        status: "COMPLETED",
        paused: false,
        remainingSec: null,
      },
    ]);

    const first = await getTrainingDayWithUserSteps("u1", "main", "doc-1");
    const second = await getTrainingDayWithUserSteps("u2", "main", "doc-1");

    expect(first?.steps[0].status).toBe("COMPLETED");
    expect(second?.steps[0].status).toBe("NOT_STARTED");
    expect(first?.steps[0].title).toBe(second?.steps[0].title);
  });

  it("rechecks paid access on every viewer request even if content was cached", async () => {
    const originalFlag = process.env.ENABLE_COURSE_CACHE;
    process.env.ENABLE_COURSE_CACHE = "true";
    try {
      mockDayOnCourseFindFirst.mockResolvedValue(baseFoundDay);
      mockCourseFindFirst.mockResolvedValue({ isPaid: true, isPrivate: false });
      vi.mocked(checkCourseAccess)
        .mockResolvedValueOnce({ hasAccess: true })
        .mockResolvedValueOnce({ hasAccess: false });

      const entitled = await getTrainingDayWithUserSteps("entitled", "main", "doc-1");
      const denied = await getTrainingDayWithUserSteps("revoked", "main", "doc-1");

      expect(entitled?.steps).toHaveLength(1);
      expect(denied).toBeNull();
      expect(mockDayOnCourseFindFirst).toHaveBeenCalledTimes(1);
    } finally {
      if (originalFlag === undefined) delete process.env.ENABLE_COURSE_CACHE;
      else process.env.ENABLE_COURSE_CACHE = originalFlag;
    }
  });

  it("keeps personalization different for users sharing one cached lesson", async () => {
    const originalFlag = process.env.ENABLE_COURSE_CACHE;
    process.env.ENABLE_COURSE_CACHE = "true";
    try {
      mockDayOnCourseFindFirst.mockResolvedValue({
        ...baseFoundDay,
        course: { ...baseFoundDay.course, isPersonalized: true },
        day: {
          ...baseFoundDay.day,
          title: "Привет, {{userName}}",
          stepLinks: [
            {
              ...baseFoundDay.day.stepLinks[0],
              step: { ...baseFoundDay.day.stepLinks[0].step, description: "Общий текст" },
            },
          ],
        },
      });
      mockUserCourseFindUnique.mockImplementation(({ where }) =>
        Promise.resolve({
          userDisplayName: where.userId_courseId.userId === "alice" ? "Алиса" : "Борис",
          userGender: "male",
          petName: "Пёс",
          petGender: "male",
        }),
      );

      const alice = await getTrainingDayWithUserSteps("alice", "main", "doc-1");
      const boris = await getTrainingDayWithUserSteps("boris", "main", "doc-1");

      expect(alice?.title).toBe("Привет, Алиса");
      expect(boris?.title).toBe("Привет, Борис");
      expect(mockDayOnCourseFindFirst).toHaveBeenCalledTimes(1);
    } finally {
      if (originalFlag === undefined) delete process.env.ENABLE_COURSE_CACHE;
      else process.env.ENABLE_COURSE_CACHE = originalFlag;
    }
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
    mockDayOnCourseFindFirst.mockResolvedValue(baseFoundDay);

    const result = await getTrainingDayWithUserSteps("u1", "main", "doc-1");

    expect(result).not.toBeNull();
    expect(result?.userStatus).toBe("NOT_STARTED");
    expect(result?.steps[0].userStepId).toBeUndefined();
  });

  it("creates userTraining when createIfMissing:true and no existing training", async () => {
    mockDayOnCourseFindFirst.mockResolvedValue(baseFoundDay);
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
    mockDayOnCourseFindFirst.mockResolvedValue(baseFoundDay);
    mockUserTrainingFindUnique.mockResolvedValue({
      id: "ut-1",
      status: "IN_PROGRESS",
      currentStepIndex: 0,
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
    mockDayOnCourseFindFirst.mockResolvedValue(baseFoundDay);
    mockUserTrainingFindUnique.mockResolvedValue({
      id: "ut-1",
      status: "IN_PROGRESS",
      currentStepIndex: 0,
    });
    mockUserStepFindMany
      .mockRejectedValueOnce(new Error("column not found"))
      .mockResolvedValueOnce([{ id: "us-1", stepOnDayId: "sl-1", status: "IN_PROGRESS" }]);

    const result = await getTrainingDayWithUserSteps("u1", "main", "doc-1");

    expect(result?.steps[0].isPausedOnServer).toBe(false);
  });

  it("refreshes steps after P2002 on transaction in missing-step creation", async () => {
    mockDayOnCourseFindFirst.mockResolvedValue(baseFoundDay);
    mockUserTrainingFindUnique.mockResolvedValue({
      id: "ut-1",
      status: "NOT_STARTED",
      currentStepIndex: 0,
    });
    mockUserStepFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: "us-1",
        stepOnDayId: "sl-1",
        status: "NOT_STARTED",
        paused: false,
        remainingSec: null,
      },
    ]);
    mockTransaction.mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" }));
    mockIsPrismaUniqueConstraintError.mockReturnValue(true);

    const result = await getTrainingDayWithUserSteps("u1", "main", "doc-1");

    expect(result).not.toBeNull();
    expect(result?.steps).toHaveLength(1);
  });
});
