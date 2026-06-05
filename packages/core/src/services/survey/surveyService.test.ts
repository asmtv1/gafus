import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getSurveyComparison,
  getSurveyResponse,
  submitSurveyResponse,
} from "./surveyService";

const mocks = vi.hoisted(() => ({
  stepFindFirst: vi.fn(),
  surveyResponseFindUnique: vi.fn(),
  surveyResponseFindMany: vi.fn(),
  surveyResponseCreate: vi.fn(),
  surveyResponseUpdate: vi.fn(),
  userStepFindFirst: vi.fn(),
  userStepFindMany: vi.fn(),
  userStepUpdate: vi.fn(),
  userTrainingUpdate: vi.fn(),
  stepOnDayFindMany: vi.fn(),
  transaction: vi.fn(),
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
      findMany: (...args: unknown[]) => mocks.userStepFindMany(...args),
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
    mocks.transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      callback({
        surveyResponse: {
          create: (...args: unknown[]) => mocks.surveyResponseCreate(...args),
          update: (...args: unknown[]) => mocks.surveyResponseUpdate(...args),
        },
        userStep: {
          update: (...args: unknown[]) => mocks.userStepUpdate(...args),
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
        id: "step-on-day-1",
        day: {
          dayLinks: [{ id: "day-on-course-1", courseId: "course-1" }],
        },
      },
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
    mocks.surveyResponseFindUnique.mockResolvedValue({
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
