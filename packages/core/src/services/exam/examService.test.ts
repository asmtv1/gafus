import { beforeEach, describe, expect, it, vi } from "vitest";

import { getExamResult, reviewExamResult, submitExamResult } from "./examService";

const mocks = vi.hoisted(() => ({
  userStepFindFirst: vi.fn(),
  userStepFindUnique: vi.fn(),
  userStepUpdate: vi.fn(),
  dailyCourseUserStepFindFirst: vi.fn(),
  dailyCourseUserStepFindUnique: vi.fn(),
  dailyCourseUserStepFindMany: vi.fn(),
  dailyCourseUserStepUpdate: vi.fn(),
  dailyCourseUserTrainingUpdate: vi.fn(),
  examResultFindUnique: vi.fn(),
  examResultFindFirst: vi.fn(),
  examResultUpsert: vi.fn(),
  examResultUpdate: vi.fn(),
  transaction: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@gafus/prisma", () => ({
  prisma: {
    $transaction: (...args: unknown[]) => mocks.transaction(...args),
    userStep: {
      findFirst: (...args: unknown[]) => mocks.userStepFindFirst(...args),
      findUnique: (...args: unknown[]) => mocks.userStepFindUnique(...args),
      update: (...args: unknown[]) => mocks.userStepUpdate(...args),
    },
    dailyCourseUserStep: {
      findFirst: (...args: unknown[]) => mocks.dailyCourseUserStepFindFirst(...args),
      findUnique: (...args: unknown[]) => mocks.dailyCourseUserStepFindUnique(...args),
      findMany: (...args: unknown[]) => mocks.dailyCourseUserStepFindMany(...args),
      update: (...args: unknown[]) => mocks.dailyCourseUserStepUpdate(...args),
    },
    dailyCourseUserTraining: {
      update: (...args: unknown[]) => mocks.dailyCourseUserTrainingUpdate(...args),
    },
    examResult: {
      findUnique: (...args: unknown[]) => mocks.examResultFindUnique(...args),
      findFirst: (...args: unknown[]) => mocks.examResultFindFirst(...args),
      upsert: (...args: unknown[]) => mocks.examResultUpsert(...args),
      update: (...args: unknown[]) => mocks.examResultUpdate(...args),
    },
  },
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: mocks.loggerError,
    success: vi.fn(),
  }),
}));

vi.mock("@gafus/cdn-upload", () => ({
  deleteFileFromCDN: vi.fn(),
  getExamVideoPath: vi.fn(),
  getRelativePathFromCDNUrl: vi.fn(),
  uploadBufferToCDN: vi.fn(),
}));

vi.mock("../notifications/immediatePushService", () => ({
  sendImmediatePushNotification: vi.fn().mockResolvedValue({ success: true }),
}));

describe("examService daily course support", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      callback({
        userStep: { update: (...args: unknown[]) => mocks.userStepUpdate(...args) },
        dailyCourseUserStep: {
          findMany: (...args: unknown[]) => mocks.dailyCourseUserStepFindMany(...args),
          update: (...args: unknown[]) => mocks.dailyCourseUserStepUpdate(...args),
        },
        dailyCourseUserTraining: {
          update: (...args: unknown[]) => mocks.dailyCourseUserTrainingUpdate(...args),
        },
        examResult: { update: (...args: unknown[]) => mocks.examResultUpdate(...args) },
      }),
    );
  });

  it("gets an exam result for a daily course user step", async () => {
    mocks.userStepFindFirst.mockResolvedValue(null);
    mocks.dailyCourseUserStepFindFirst.mockResolvedValue({ id: "daily-user-step-1" });
    mocks.examResultFindFirst.mockResolvedValue({
      id: "exam-1",
      testAnswers: { q1: 0 },
      testScore: 1,
      testMaxScore: 1,
      videoReportUrl: null,
      writtenFeedback: null,
      overallScore: 100,
      isPassed: true,
      trainerComment: null,
      reviewedAt: null,
      reviewedById: null,
      reviewedBy: null,
      createdAt: new Date("2026-05-04T08:00:00.000Z"),
      updatedAt: new Date("2026-05-04T08:00:00.000Z"),
    });

    const result = await getExamResult("user-1", "daily-user-step-1");

    expect(mocks.dailyCourseUserStepFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "daily-user-step-1",
          dailyCourseUserTraining: { userId: "user-1" },
        }),
      }),
    );
    expect(mocks.examResultFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { dailyCourseUserStepId: "daily-user-step-1" } }),
    );
    expect(result).toMatchObject({ id: "exam-1", testAnswers: { q1: 0 } });
  });

  it("submits an exam result for a daily course user step", async () => {
    mocks.userStepFindFirst.mockResolvedValue(null);
    mocks.dailyCourseUserStepFindFirst.mockResolvedValue({
      id: "daily-user-step-1",
      dailyCourseUserTrainingId: "daily-training-1",
      bundleStep: { step: { id: "step-1", type: "EXAMINATION" } },
    });
    mocks.examResultUpsert.mockResolvedValue({ id: "exam-1" });
    mocks.dailyCourseUserStepUpdate.mockResolvedValue({ id: "daily-user-step-1" });
    mocks.dailyCourseUserTrainingUpdate.mockResolvedValue({ id: "daily-training-1" });

    const result = await submitExamResult("user-1", {
      userStepId: "daily-user-step-1",
      stepId: "step-1",
      writtenFeedback: "daily course answer",
    });

    expect(mocks.examResultUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { dailyCourseUserStepId: "daily-user-step-1" },
        create: expect.objectContaining({
          userStepId: undefined,
          dailyCourseUserStepId: "daily-user-step-1",
        }),
      }),
    );
    expect(mocks.dailyCourseUserStepUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "daily-user-step-1" },
        data: { status: "IN_PROGRESS" },
      }),
    );
    expect(result).toEqual({ success: true, examResultId: "exam-1" });
  });

  it("auto-passes a test-only exam above 50 percent using the server score", async () => {
    mocks.userStepFindFirst.mockResolvedValue({
      id: "user-step-1",
      stepOnDay: {
        step: {
          id: "step-1",
          type: "EXAMINATION",
          hasTestQuestions: true,
          requiresVideoReport: false,
          requiresWrittenFeedback: false,
          checklist: [
            { id: "q1", correctAnswer: 0 },
            { id: "q2", correctAnswer: 1 },
            { id: "q3", correctAnswer: 1 },
          ],
        },
      },
    });
    mocks.examResultUpsert.mockResolvedValue({ id: "exam-1" });
    mocks.userStepUpdate.mockResolvedValue({ id: "user-step-1" });

    const result = await submitExamResult("user-1", {
      userStepId: "user-step-1",
      stepId: "step-1",
      testAnswers: { q1: 0, q2: 1, q3: 0 },
      testScore: 3,
      testMaxScore: 3,
      overallScore: 0,
      isPassed: false,
    });

    expect(mocks.examResultUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          testScore: 2,
          testMaxScore: 3,
          overallScore: 67,
          isPassed: true,
          reviewedAt: null,
          reviewedById: null,
        }),
        create: expect.objectContaining({
          overallScore: 67,
          isPassed: true,
        }),
      }),
    );
    expect(mocks.userStepUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-step-1" },
        data: { status: "COMPLETED" },
      }),
    );
    expect(result).toEqual({ success: true, examResultId: "exam-1" });
  });

  it("auto-fails a test-only exam at exactly 50 percent and leaves it retakeable", async () => {
    mocks.userStepFindFirst.mockResolvedValue({
      id: "user-step-1",
      stepOnDay: {
        step: {
          id: "step-1",
          type: "EXAMINATION",
          hasTestQuestions: true,
          requiresVideoReport: false,
          requiresWrittenFeedback: false,
          checklist: [
            { id: "q1", correctAnswer: 0 },
            { id: "q2", correctAnswer: 1 },
          ],
        },
      },
    });
    mocks.examResultUpsert.mockResolvedValue({ id: "exam-1" });
    mocks.userStepUpdate.mockResolvedValue({ id: "user-step-1" });

    const result = await submitExamResult("user-1", {
      userStepId: "user-step-1",
      stepId: "step-1",
      testAnswers: { q1: 0, q2: 0 },
      testScore: 1,
      testMaxScore: 2,
      overallScore: 100,
      isPassed: true,
    });

    expect(mocks.examResultUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          overallScore: 50,
          isPassed: false,
          reviewedAt: null,
          reviewedById: null,
        }),
        create: expect.objectContaining({
          overallScore: 50,
          isPassed: false,
        }),
      }),
    );
    expect(mocks.userStepUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-step-1" },
        data: { status: "IN_PROGRESS" },
      }),
    );
    expect(result).toEqual({ success: true, examResultId: "exam-1" });
  });

  it("reviews a daily course exam result", async () => {
    mocks.userStepFindUnique.mockResolvedValue(null);
    mocks.dailyCourseUserStepFindUnique.mockResolvedValue({
      id: "daily-user-step-1",
      dailyCourseUserTrainingId: "daily-training-1",
      dailyCourseUserTraining: {
        userId: "user-1",
        schedule: {
          id: "schedule-1",
          date: new Date("2026-05-04T00:00:00.000Z"),
          bundle: { title: "Daily bundle", authorId: "trainer-1" },
        },
      },
      bundleStep: { order: 1, step: { title: "Daily exam", type: "EXAMINATION" } },
      examResult: { id: "exam-1" },
    });
    mocks.dailyCourseUserStepUpdate.mockResolvedValue({ id: "daily-user-step-1" });
    mocks.examResultUpdate.mockResolvedValue({ id: "exam-1" });
    mocks.dailyCourseUserStepFindMany.mockResolvedValue([
      { id: "daily-user-step-1", status: "IN_PROGRESS" },
    ]);
    mocks.dailyCourseUserTrainingUpdate.mockResolvedValue({ id: "daily-training-1" });

    const result = await reviewExamResult("trainer-1", "TRAINER", {
      userStepId: "daily-user-step-1",
      action: "approve",
    });

    expect(result).toEqual({ success: true });
    expect(mocks.dailyCourseUserStepUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "daily-user-step-1" },
        data: expect.objectContaining({ status: "COMPLETED" }),
      }),
    );
  });
});

describe("getExamResult numeric exam answers READ contract", () => {
  const createdAt = new Date("2026-10-21T10:00:00.000Z");
  const updatedAt = new Date("2026-10-22T12:30:00.000Z");
  const reviewedAt = new Date("2026-10-23T16:00:00.000Z");
  const persisted = {
    id: "fictional-result-read",
    testScore: 2,
    testMaxScore: 3,
    videoReportUrl: "opaque://unchanged-video-report",
    writtenFeedback: "Fictional note",
    overallScore: 67,
    isPassed: true,
    trainerComment: "Fictional trainer comment",
    reviewedAt,
    reviewedById: "fictional-trainer",
    reviewedBy: { username: "trainer", profile: { fullName: null } },
    createdAt,
    updatedAt,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userStepFindFirst.mockResolvedValue({ id: "fictional-owned-step" });
    mocks.examResultFindFirst.mockImplementation(async () => ({ ...persisted, testAnswers: null }));
  });

  async function readWithStoredAnswers(value: unknown) {
    mocks.examResultFindFirst.mockResolvedValueOnce({ ...persisted, testAnswers: value });
    const data = await getExamResult("fictional-actor", "fictional-owned-step");
    expect(mocks.userStepFindFirst).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        where: { id: "fictional-owned-step", userTraining: { userId: "fictional-actor" } },
      }),
    );
    expect(mocks.examResultFindFirst).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ where: { userStepId: "fictional-owned-step" } }),
    );
    expect(mocks.dailyCourseUserStepFindFirst).not.toHaveBeenCalled();
    expect(data).toMatchObject({
      id: persisted.id,
      testScore: persisted.testScore,
      testMaxScore: persisted.testMaxScore,
      videoReportUrl: persisted.videoReportUrl,
      writtenFeedback: persisted.writtenFeedback,
      overallScore: persisted.overallScore,
      isPassed: persisted.isPassed,
      trainerComment: persisted.trainerComment,
      reviewedAt,
      reviewedById: persisted.reviewedById,
      reviewedBy: persisted.reviewedBy,
      createdAt,
      updatedAt,
    });
    expect(mocks.examResultUpsert).not.toHaveBeenCalled();
    expect(mocks.examResultUpdate).not.toHaveBeenCalled();
    expect(mocks.userStepUpdate).not.toHaveBeenCalled();
    return data?.testAnswers;
  }

  it.each([
    {
      label: "direct numeric object with zero and negative",
      raw: { q1: 0, q2: -1, q3: 1.5 },
      expected: { q1: 0, q2: -1, q3: 1.5 },
    },
    {
      label: "JSON string encoded numeric object",
      raw: '{"q1":0,"q2":1e3}',
      expected: { q1: 0, q2: 1000 },
    },
    { label: "direct empty record", raw: {}, expected: {} },
    { label: "encoded empty record", raw: "{}", expected: {} },
    { label: "null stored JSON", raw: null, expected: null },
    { label: "JSON null literal", raw: "null", expected: null },
  ])("preserves $label", async ({ raw, expected }) => {
    expect(await readWithStoredAnswers(raw)).toEqual(expected);
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });

  it.each([
    { label: "encoded array", raw: "[]" },
    { label: "direct array", raw: [0, 1] },
    { label: "encoded boolean", raw: "true" },
    { label: "direct boolean", raw: true },
    { label: "encoded number", raw: "42" },
    { label: "direct number", raw: 42 },
    { label: "encoded non-object string", raw: '"hello"' },
    { label: "direct non-JSON string", raw: "hello" },
    { label: "encoded text-valued answer", raw: '{"q":"text"}' },
    { label: "direct text-valued answer", raw: { q: "text" } },
    { label: "encoded null-valued answer", raw: '{"q":null}' },
    { label: "direct null-valued answer", raw: { q: null } },
    { label: "encoded nested answer", raw: '{"q":{"answer":2}}' },
    { label: "direct nested answer", raw: { q: { answer: 2 } } },
    { label: "direct NaN", raw: { q: NaN } },
    { label: "direct Infinity", raw: { q: Infinity } },
    { label: "direct negative Infinity", raw: { q: -Infinity } },
    { label: "Date instance", raw: new Date("2026-10-24T00:00:00.000Z") },
    { label: "encoded mixed numeric and text", raw: '{"q1":2,"q2":"3"}' },
  ])("rejects $label rather than returning false numeric wire", async ({ raw }) => {
    expect(await readWithStoredAnswers(raw)).toBeNull();
    // Well-formed JSON with invalid shape is not a parse exception.
    if (typeof raw !== "string" || raw === "hello") return;
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });

  it("returns null for malformed JSON without leaking the stored contents or SyntaxError", async () => {
    const stored = '{"secret-token-from-stored-answers":';
    expect(await readWithStoredAnswers(stored)).toBeNull();
    expect(mocks.loggerError).toHaveBeenCalledExactlyOnceWith("Ошибка парсинга testAnswers");
  });
});
