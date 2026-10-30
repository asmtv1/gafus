import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSurveyComparison, getSurveyResponse, submitSurveyResponse } from "./surveyService";

const mocks = vi.hoisted(() => ({
  stepFindFirst: vi.fn(),
  surveyResponseFindUnique: vi.fn(),
  txSurveyResponseFindUnique: vi.fn(),
  surveyResponseFindMany: vi.fn(),
  surveyResponseCreate: vi.fn(),
  surveyResponseUpdate: vi.fn(),
  userStepFindFirst: vi.fn(),
  userStepFindMany: vi.fn(),
  outsideTxUserStepFindMany: vi.fn(),
  userStepUpdate: vi.fn(),
  userTrainingUpdate: vi.fn(),
  stepOnDayFindMany: vi.fn(),
  transaction: vi.fn(),
  parentRowLock: vi.fn(),
}));

vi.mock("@gafus/prisma", () => ({
  prisma: {
    $transaction: (...args: unknown[]) => mocks.transaction(...args),
    step: {
      findFirst: (...args: unknown[]) => mocks.stepFindFirst(...args),
    },
    surveyResponse: {
      findUnique: (...args: unknown[]) => mocks.surveyResponseFindUnique(...args),
      findMany: (...args: unknown[]) => mocks.surveyResponseFindMany(...args),
      create: (...args: unknown[]) => mocks.surveyResponseCreate(...args),
      update: (...args: unknown[]) => mocks.surveyResponseUpdate(...args),
    },
    userStep: {
      findFirst: (...args: unknown[]) => mocks.userStepFindFirst(...args),
      findMany: (...args: unknown[]) => mocks.outsideTxUserStepFindMany(...args),
      update: (...args: unknown[]) => mocks.userStepUpdate(...args),
    },
    userTraining: {
      update: (...args: unknown[]) => mocks.userTrainingUpdate(...args),
    },
    stepOnDay: {
      findMany: (...args: unknown[]) => mocks.stepOnDayFindMany(...args),
    },
  },
  Prisma: {
    JsonNull: null,
  },
}));

vi.mock("../course", () => ({
  checkCourseAccessById: vi.fn().mockResolvedValue({ hasAccess: true }),
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

describe("surveyService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(new Date("2026-05-28T10:00:00.000Z"));
    mocks.parentRowLock.mockResolvedValue([{ id: "training-1" }]);
    mocks.txSurveyResponseFindUnique.mockResolvedValue(null);
    mocks.transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      callback({
        $queryRaw: (...args: unknown[]) => mocks.parentRowLock(...args),
        surveyResponse: {
          findUnique: (...args: unknown[]) => mocks.txSurveyResponseFindUnique(...args),
          create: (...args: unknown[]) => mocks.surveyResponseCreate(...args),
          update: (...args: unknown[]) => mocks.surveyResponseUpdate(...args),
        },
        userStep: {
          update: (...args: unknown[]) => mocks.userStepUpdate(...args),
          findMany: (...args: unknown[]) => mocks.userStepFindMany(...args),
        },
        userTraining: {
          update: (...args: unknown[]) => mocks.userTrainingUpdate(...args),
        },
      }),
    );
    mocks.stepFindFirst.mockResolvedValue({
      id: "step-1",
      type: "SURVEY",
      surveySlug: "dog-home-alone-initial",
    });
    mocks.userStepFindFirst.mockResolvedValue({
      id: "user-step-1",
      userTrainingId: "training-1",
      stepOnDay: {
        id: "step-on-day-1", stepId: "step-1", dayId: "day-1",
      },
      userTraining: { dayOnCourse: { dayId: "day-1" } },
    });
    mocks.userStepFindMany.mockResolvedValue([{ status: "COMPLETED" }]);
    mocks.stepOnDayFindMany.mockResolvedValue([{ id: "step-on-day-1" }]);
  });

  it("creates the first survey response and completes the course step", async () => {
    mocks.surveyResponseFindUnique.mockResolvedValue(null);
    mocks.surveyResponseCreate.mockResolvedValue({
      id: "response-1",
      submittedAt: new Date("2026-05-28T10:00:00.000Z"),
    });

    const result = await submitSurveyResponse("user-1", {
      courseId: "course-1",
      stepId: "step-1",
      userStepId: "user-step-1",
      surveySlug: "dog-home-alone-initial",
      answers: { concern: "Воет" },
    });

    expect(result.success).toBe(true);
    expect(mocks.surveyResponseCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          courseId: "course-1",
          stepId: "step-1",
          surveySlug: "dog-home-alone-initial",
          surveyFamilySlug: "dog-home-alone",
          phase: "INITIAL",
          answers: { concern: "Воет" },
        }),
      }),
    );
    expect(mocks.userStepUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-step-1" },
        data: { status: "COMPLETED" },
      }),
    );
    expect(mocks.userStepFindMany).toHaveBeenCalledWith({
      where: { userTrainingId: "training-1" },
      select: { status: true },
    });
    expect(mocks.outsideTxUserStepFindMany).not.toHaveBeenCalled();
    expect(mocks.parentRowLock).toHaveBeenCalledOnce();
    expect(mocks.txSurveyResponseFindUnique).toHaveBeenCalledWith({
      where: { userId_stepId: { userId: "user-1", stepId: "step-1" } },
    });
    expect(mocks.surveyResponseFindUnique).not.toHaveBeenCalled();
    expect(mocks.parentRowLock.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.txSurveyResponseFindUnique.mock.invocationCallOrder[0]!,
    );
    expect(mocks.parentRowLock.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.userStepUpdate.mock.invocationCallOrder[0]!,
    );
    expect(mocks.parentRowLock.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.surveyResponseCreate.mock.invocationCallOrder[0]!,
    );
  });

  it.each([
    ["another step in same owned course", {
      stepOnDay: { stepId: "exam-step", dayId: "day-1" },
      userTraining: { dayOnCourse: { dayId: "day-1" } },
    }],
    ["same survey template in another day", {
      stepOnDay: { stepId: "step-1", dayId: "day-2" },
      userTraining: { dayOnCourse: { dayId: "day-1" } },
    }],
  ])("refuses %s UserStep without saving or completing wrong progress", async (_case, binding) => {
    mocks.userStepFindFirst.mockResolvedValue({
      id: "user-step-1", userTrainingId: "training-1", ...binding,
    });
    const result = await submitSurveyResponse("user-1", {
      courseId: "course-1", stepId: "step-1", userStepId: "user-step-1",
      surveySlug: "dog-home-alone-initial", answers: { concern: "Волнуется" },
    });
    expect(result).toMatchObject({success:false,code:"USER_STEP_NOT_FOUND"});
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.surveyResponseCreate).not.toHaveBeenCalled();
    expect(mocks.userStepUpdate).not.toHaveBeenCalled();
  });

  it("returns an existing response with editability until 24 hours after submission", async () => {
    mocks.surveyResponseFindUnique.mockResolvedValue({
      id: "response-1",
      userId: "user-1",
      courseId: "course-1",
      stepId: "step-1",
      petId: null,
      surveySlug: "dog-home-alone-initial",
      surveyFamilySlug: "dog-home-alone",
      phase: "INITIAL",
      surveyVersion: 1,
      answers: { concern: "Воет" },
      submittedAt: new Date("2026-05-28T09:00:00.000Z"),
      createdAt: new Date("2026-05-28T09:00:00.000Z"),
      updatedAt: new Date("2026-05-28T09:00:00.000Z"),
    });

    const result = await getSurveyResponse("user-1", "step-1");

    expect(result?.canEdit).toBe(true);
    expect(result?.editableUntil).toBe("2026-05-29T09:00:00.000Z");
    expect(result?.answers).toEqual({ concern: "Воет" });
  });

  it("rejects edits after the 24 hour editing window", async () => {
    mocks.txSurveyResponseFindUnique.mockResolvedValue({
      id: "response-1",
      submittedAt: new Date("2026-05-27T09:00:00.000Z"),
      answers: { concern: "Воет" },
    });

    const result = await submitSurveyResponse("user-1", {
      courseId: "course-1",
      stepId: "step-1",
      userStepId: "user-step-1",
      surveySlug: "dog-home-alone-initial",
      answers: { concern: "Скулит" },
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe("SURVEY_EDIT_WINDOW_EXPIRED");
    expect(mocks.surveyResponseUpdate).not.toHaveBeenCalled();
  });

  it("does not submit a response for a non-survey step", async () => {
    mocks.stepFindFirst.mockResolvedValue({
      id: "step-1",
      type: "THEORY",
      surveySlug: null,
    });
    mocks.surveyResponseFindUnique.mockResolvedValue(null);

    const result = await submitSurveyResponse("user-1", {
      courseId: "course-1",
      stepId: "step-1",
      userStepId: "user-step-1",
      surveySlug: "dog-home-alone-initial",
      answers: { concern: "Воет" },
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe("INVALID_SURVEY_STEP");
    expect(mocks.surveyResponseCreate).not.toHaveBeenCalled();
  });

  it("rejects an incomplete separation anxiety screening response", async () => {
    mocks.stepFindFirst.mockResolvedValue({
      id: "step-1",
      type: "SURVEY",
      surveySlug: "separation-anxiety-screening",
    });

    const result = await submitSurveyResponse("user-1", {
      courseId: "course-1",
      stepId: "step-1",
      userStepId: "user-step-1",
      surveySlug: "separation-anxiety-screening",
      answers: { separation_sign_1: "yes" },
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe("SURVEY_REQUIRED_ANSWERS_MISSING");
    expect(mocks.surveyResponseCreate).not.toHaveBeenCalled();
  });

  it("returns null comparison when final survey response is missing", async () => {
    mocks.surveyResponseFindMany.mockResolvedValue([
      {
        id: "initial-1",
        phase: "INITIAL",
        answers: { max_alone_time: "5 минут" },
        submittedAt: new Date("2026-05-28T09:00:00.000Z"),
      },
    ]);

    const result = await getSurveyComparison("user-1", "course-1", "dog-home-alone");

    expect(result).toBeNull();
  });

  it("builds a comparison from initial and final answers", async () => {
    mocks.surveyResponseFindMany.mockResolvedValue([
      {
        id: "initial-1",
        phase: "INITIAL",
        answers: { max_alone_time: "5 минут", symptoms: ["Лает"] },
        submittedAt: new Date("2026-05-01T09:00:00.000Z"),
      },
      {
        id: "final-1",
        phase: "FINAL",
        answers: { max_alone_time: "40 минут", symptoms: ["Спокойнее"] },
        submittedAt: new Date("2026-05-28T09:00:00.000Z"),
      },
    ]);

    const result = await getSurveyComparison("user-1", "course-1", "dog-home-alone");

    expect(result).toMatchObject({
      familySlug: "dog-home-alone",
      items: [
        {
          questionId: "max_alone_time",
          before: "5 минут",
          after: "40 минут",
          changed: true,
        },
        {
          questionId: "symptoms",
          before: ["Лает"],
          after: ["Спокойнее"],
          changed: true,
        },
      ],
    });
  });
});

// Original READ must not reinterpret malformed stored JSON as SurveyAnswerValue.
// Exercise actual getSurveyResponse/getSurveyComparison; only Prisma repository
// boundaries are synthetic. No submit, permissions or SQL write is involved.
describe("READ_NORMALIZE_SURVEY_ANSWERS", () => {
  const row = (answers: unknown, phase: "INITIAL" | "FINAL" = "INITIAL") => ({
    id: `fictional-${phase}`,
    userId: "user-1",
    courseId: "course-1",
    stepId: "step-1",
    petId: null,
    surveySlug: "dog-home-alone-initial",
    surveyFamilySlug: "dog-home-alone",
    phase,
    surveyVersion: 1,
    answers,
    submittedAt: new Date("2026-05-28T09:00:00.000Z"),
  });

  it.each([
    ["numeric", { q: 123 }],
    ["nested", { q: { nested: "value" } }],
    ["boolean array", { q: [false] }],
    ["mixed array", { q: ["valid", 42] }],
    ["partially valid", { good: "visible", bad: 123 }],
  ])("READ_NORMALIZE_response rejects entire invalid stored record: %s", async (_name, answers) => {
    mocks.surveyResponseFindUnique.mockResolvedValue(row(answers));
    const result = await getSurveyResponse("user-1", "step-1");
    expect(result?.answers).toEqual({});
    expect(mocks.surveyResponseFindUnique).toHaveBeenCalledWith({
      where: { userId_stepId: { userId: "user-1", stepId: "step-1" } },
    });
    expect(mocks.surveyResponseCreate).not.toHaveBeenCalled();
    expect(mocks.surveyResponseUpdate).not.toHaveBeenCalled();
  });

  it("READ_NORMALIZE_comparison removes malformed entire INITIAL answers, not just bad field", async () => {
    mocks.surveyResponseFindMany.mockResolvedValue([
      row({ valid: "should not leak", bad: { nested: true } }, "INITIAL"),
      row({ message: "After", flags: ["quiet"] }, "FINAL"),
    ]);
    const result = await getSurveyComparison("user-1", "course-1", "dog-home-alone");
    expect(result).toEqual({
      familySlug: "dog-home-alone",
      initialSubmittedAt: "2026-05-28T09:00:00.000Z",
      finalSubmittedAt: "2026-05-28T09:00:00.000Z",
      items: [
        { questionId: "message", before: null, after: "After", changed: true },
        { questionId: "flags", before: null, after: ["quiet"], changed: true },
      ],
    });
    expect(mocks.surveyResponseFindMany).toHaveBeenCalledWith({
      where: { userId: "user-1", courseId: "course-1", surveyFamilySlug: "dog-home-alone" },
      orderBy: { submittedAt: "asc" },
    });
  });

  it("READ_NORMALIZE_all existing valid values, empty object and empty string arrays pass unchanged", async () => {
    const answers = {
      text: "plain",
      blank: "",
      list: ["a", "b"],
      emptyList: [],
      selected: false,
      enabled: true,
      skipped: null,
    };
    mocks.surveyResponseFindUnique.mockResolvedValue(row(answers));
    expect((await getSurveyResponse("user-1", "step-1"))?.answers).toEqual(answers);
    mocks.surveyResponseFindUnique.mockResolvedValue(row({}));
    expect((await getSurveyResponse("user-1", "step-1"))?.answers).toEqual({});
    mocks.surveyResponseFindMany.mockResolvedValue([row(answers, "INITIAL"), row({}, "FINAL")]);
    const result = await getSurveyComparison("user-1", "course-1", "dog-home-alone");
    expect(result?.items).toEqual(
      Object.entries(answers).map(([questionId, before]) => ({
        questionId,
        before,
        after: null,
        changed: before !== null,
      })),
    );
  });

  it.each([null, [], ["a"], '{"q":"not-a-parsed-record"}', 42, true])(
    "READ_NORMALIZE_malformed top-level JSON returns the existing empty fallback: %s",
    async (invalid) => {
      mocks.surveyResponseFindUnique.mockResolvedValue(row(invalid));
      expect((await getSurveyResponse("user-1", "step-1"))?.answers).toEqual({});
    },
  );
});
