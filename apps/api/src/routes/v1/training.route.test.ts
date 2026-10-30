import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  checkCourseAccessMock,
  createStepNotificationForStepStartMock,
  createBoundStepNotificationForStartMock,
  pauseBoundStepNotificationMock,
  resumeBoundStepNotificationMock,
  resetBoundStepNotificationMock,
  getDayFromDayOnCourseIdMock,
  pauseStepNotificationMock,
  resumeStepNotificationMock,
  resetStepNotificationMock,
  validateTheoryStepForCompletionMock,
  getAppFeatureFlagEnabledMock,
  getAppSubscriptionAccessMock,
  getTrainingDayWithMonetizedStepsMock,
  getTrainingDaysMock,
  requireCourseStepOperationAccessMock,
  saveDiaryEntryMock,
  getDiaryEntriesMock,
  logErrorMock,
  syncUserCourseStatusFromDaysMock,
  updateStepAndDayMock,
} = vi.hoisted(() => ({
  checkCourseAccessMock: vi.fn(),
  createStepNotificationForStepStartMock: vi.fn(),
  createBoundStepNotificationForStartMock: vi.fn().mockResolvedValue({ queued: true }),
  pauseBoundStepNotificationMock: vi.fn().mockResolvedValue(undefined),
  resumeBoundStepNotificationMock: vi.fn().mockResolvedValue(undefined),
  resetBoundStepNotificationMock: vi.fn().mockResolvedValue(undefined),
  getDayFromDayOnCourseIdMock: vi.fn(),
  pauseStepNotificationMock: vi.fn(),
  resumeStepNotificationMock: vi.fn(),
  resetStepNotificationMock: vi.fn(),
  validateTheoryStepForCompletionMock: vi.fn(),
  getAppFeatureFlagEnabledMock: vi.fn(),
  getAppSubscriptionAccessMock: vi.fn(),
  getTrainingDayWithMonetizedStepsMock: vi.fn(),
  getTrainingDaysMock: vi.fn(),
  requireCourseStepOperationAccessMock: vi.fn(),
  saveDiaryEntryMock: vi.fn(),
  getDiaryEntriesMock: vi.fn(),
  logErrorMock: vi.fn(),
  syncUserCourseStatusFromDaysMock: vi.fn(),
  updateStepAndDayMock: vi.fn(),
}));

vi.mock("@gafus/core/services/training", () => ({
  getTrainingDays: getTrainingDaysMock,
  getTrainingDayWithMonetizedSteps: getTrainingDayWithMonetizedStepsMock,
  getTrainingDayWithUserSteps: vi.fn(),
  requireCourseStepOperationAccess: requireCourseStepOperationAccessMock,
  syncUserCourseStatusFromDays: syncUserCourseStatusFromDaysMock,
  updateStepAndDay: updateStepAndDayMock,
  validateTheoryStepForCompletion: validateTheoryStepForCompletionMock,
}));

vi.mock("@gafus/core/services/rewardedCredits", () => ({
  SubscriptionOrCreditsRequiredError: class SubscriptionOrCreditsRequiredError extends Error {
    constructor() {
      super("Для действия нужна подписка или rewarded credits");
      this.name = "SubscriptionOrCreditsRequiredError";
    }
  },
}));

vi.mock("@gafus/core/services/diary", () => ({
  getDiaryEntries: getDiaryEntriesMock,
  saveDiaryEntry: saveDiaryEntryMock,
}));

vi.mock("@gafus/core/services/course", () => ({
  checkCourseAccess: checkCourseAccessMock,
}));

vi.mock("@gafus/core/services/appFeatureFlags", () => ({
  APP_FEATURE_APP_SUBSCRIPTION_GATING: "app_subscription_gating_enabled",
  getAppFeatureFlagEnabled: getAppFeatureFlagEnabledMock,
}));

vi.mock("@gafus/core/services/appSubscription", () => ({
  getAppSubscriptionAccess: getAppSubscriptionAccessMock,
}));

vi.mock("@gafus/core/services/video", () => ({
  checkVideoAccess: vi.fn(),
  getProgress: vi.fn(),
  getVideoManifestInfo: vi.fn(),
  saveProgress: vi.fn(),
}));

vi.mock("@gafus/core/services/notifications", () => ({
  createStepNotificationForStepStart: createStepNotificationForStepStartMock,
  createBoundStepNotificationForStart: createBoundStepNotificationForStartMock,
  pauseBoundStepNotification: pauseBoundStepNotificationMock,
  resumeBoundStepNotification: resumeBoundStepNotificationMock,
  resetBoundStepNotification: resetBoundStepNotificationMock,
  getDayFromDayOnCourseId: getDayFromDayOnCourseIdMock,
  pauseStepNotification: pauseStepNotificationMock,
  resetStepNotification: resetStepNotificationMock,
  resumeStepNotification: resumeStepNotificationMock,
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    error: logErrorMock,
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock("@gafus/cdn-upload", () => ({
  downloadFileFromCDN: vi.fn(),
  extractVideoIdFromCdnUrl: vi.fn(),
  getSignedDownloadUrl: vi.fn(),
  streamFileFromCDN: vi.fn(),
}));

vi.mock("@gafus/video-access", () => ({
  VIDEO_PLAYBACK_TOKEN_TTL_MINUTES: 720,
  getVideoAccessService: vi.fn(),
}));

import { authMiddleware } from "../../middleware/auth";
import { jsonRequest } from "../../test/route-test-utils";
import { trainingRoutes } from "./training";

function createTestApp() {
  const app = new Hono();
  app.use("/api/v1/training/*", authMiddleware);
  app.route("/api/v1/training", trainingRoutes);
  return app;
}

function createAuthenticatedTestApp() {
  const app = new Hono();
  app.use("/api/v1/training/*", async (c, next) => {
    c.set("user", { id: "user-1", username: "student", role: "USER" });
    await next();
  });
  app.route("/api/v1/training", trainingRoutes);
  return app;
}

const STEP_COURSE = "clwcourse00000000000000001";
const STEP_DAY = "clwdayoc0000000000000001";
const STEP_ACTOR = "user-1";
const PRIVATE_STEP_CANARY = "SYNTHETIC_STEP_PRIVATE_OWNER_MESSAGE_STACK_20261021";
const stepOperations = [
  { name: "start", path: "start", type: "start", extra: { durationSec: 90 } },
  { name: "pause", path: "pause", type: "pause", extra: { timeLeftSec: 70 } },
  { name: "resume", path: "resume", type: "resume", extra: {} },
  { name: "practice complete", path: "complete/practice", type: "complete", extra: {} },
  { name: "theory complete", path: "complete/theory", type: "complete", extra: {} },
] as const;
function stepBody(extra: object = {}) {
  return { courseId: STEP_COURSE, dayOnCourseId: STEP_DAY, stepIndex: 2, ...extra };
}
function loggedErrorsText() {
  return logErrorMock.mock.calls
    .flat()
    .map((arg: unknown) =>
      arg instanceof Error
        ? [arg.message, arg.stack, String(arg.cause)].join(" ")
        : JSON.stringify(arg),
    )
    .join(" ");
}
function privateFailure() {
  const err = new Error(PRIVATE_STEP_CANARY);
  err.stack = "Error: " + PRIVATE_STEP_CANARY + "\nPRIVATE_STEP_STACK";
  return err;
}

describe("training route contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkCourseAccessMock.mockResolvedValue({ hasAccess: true });
    getAppFeatureFlagEnabledMock.mockResolvedValue(false);
    getAppSubscriptionAccessMock.mockResolvedValue({ hasActiveSubscription: true });
    getTrainingDayWithMonetizedStepsMock.mockResolvedValue({ trainingDayId: "day-1", steps: [] });
    requireCourseStepOperationAccessMock.mockResolvedValue(null);
    saveDiaryEntryMock.mockResolvedValue({ success: true });
    createStepNotificationForStepStartMock.mockResolvedValue(undefined);
    getDayFromDayOnCourseIdMock.mockResolvedValue("fixture-day");
    pauseStepNotificationMock.mockResolvedValue(undefined);
    resumeStepNotificationMock.mockResolvedValue(undefined);
    resetStepNotificationMock.mockResolvedValue(undefined);
    validateTheoryStepForCompletionMock.mockResolvedValue({ valid: true });
  });

  it.each([
    ["start", "start", { durationSec: 37 }, { type: "start", remainingSec: 37 }, false],
    ["theory", "complete/theory", {}, { type: "complete" }, true],
  ] as const)(
    "AG1-LEARN032 step port %s keeps guard-update-effects order",
    async (_name, path, extra, operation, isTheory) => {
      const calls: string[] = [];
      requireCourseStepOperationAccessMock.mockImplementationOnce(async () => {
        calls.push("access");
      });
      if (isTheory) {
        validateTheoryStepForCompletionMock.mockImplementationOnce(async () => {
          calls.push("theory-validation");
          return { valid: true };
        });
      }
      updateStepAndDayMock.mockImplementationOnce(async () => {
        calls.push("update");
        return { courseId: STEP_COURSE };
      });
      syncUserCourseStatusFromDaysMock.mockImplementationOnce(async () => {
        calls.push("sync");
      });
      const res = await createAuthenticatedTestApp().request(
        jsonRequest(`/api/v1/training/step/${path}`, "POST", stepBody(extra)),
      );
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ success: true });
      expect(calls).toEqual(
        isTheory ? ["access", "theory-validation", "update", "sync"] : ["access", "update", "sync"],
      );
      expect(updateStepAndDayMock).toHaveBeenCalledExactlyOnceWith(
        STEP_ACTOR,
        STEP_DAY,
        2,
        operation,
      );
      expect(syncUserCourseStatusFromDaysMock).toHaveBeenCalledExactlyOnceWith(
        STEP_ACTOR,
        STEP_COURSE,
      );
      expect(logErrorMock).not.toHaveBeenCalled();
    },
  );

  it("AG1-LEARN032 step port theory validation denial never executes Core mutation", async () => {
    validateTheoryStepForCompletionMock.mockResolvedValueOnce({
      valid: false,
      code: "NOT_FOUND",
      error: "Шаг не найден",
    });
    const response = await createAuthenticatedTestApp().request(
      jsonRequest("/api/v1/training/step/complete/theory", "POST", stepBody()),
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Шаг не найден",
      code: "NOT_FOUND",
    });
    expect(requireCourseStepOperationAccessMock).toHaveBeenCalledOnce();
    expect(validateTheoryStepForCompletionMock).toHaveBeenCalledExactlyOnceWith(STEP_DAY, 2);
    expect(updateStepAndDayMock).not.toHaveBeenCalled();
    expect(syncUserCourseStatusFromDaysMock).not.toHaveBeenCalled();
    expect(createStepNotificationForStepStartMock).not.toHaveBeenCalled();
    expect(logErrorMock).not.toHaveBeenCalled();
  });

  it.each([
    ["training days", "/api/v1/training/days?type=fixture", getTrainingDaysMock],
    [
      "training day",
      "/api/v1/training/day?courseType=fixture&dayOnCourseId=clwdayoc0000000000000001",
      getTrainingDayWithMonetizedStepsMock,
    ],
  ])("%s Core 500 must not log raw owner/entitlement error", async (_, url, fn) => {
    const canary = "SYNTHETIC_PRIVATE_TRAINING_DAY_CORE_ERROR";
    fn.mockRejectedValueOnce(new Error(canary));
    const response = await createAuthenticatedTestApp().request(url);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      error: "Внутренняя ошибка сервера",
    });
    expect(logErrorMock).toHaveBeenCalledTimes(1);
    const logged = logErrorMock.mock.calls
      .flat()
      .map((arg: unknown) =>
        arg instanceof Error ? [arg.message, arg.stack].join(" ") : JSON.stringify(arg),
      )
      .join(" ");
    expect(logged).not.toContain(canary);
  });

  it.each([
    ["specified", "/api/v1/training/days?type=general", "general"],
    ["omitted", "/api/v1/training/days", undefined],
  ])(
    "ordinary training days %s type forwards actor and retains JSON Date wire",
    async (_, path, courseType) => {
      getTrainingDaysMock.mockResolvedValueOnce({
        trainingDays: [{ dayOnCourseId: "day-1", startAt: new Date("2026-10-23T10:00:00.000Z") }],
      });
      const response = await createAuthenticatedTestApp().request(path);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        success: true,
        data: { trainingDays: [{ dayOnCourseId: "day-1", startAt: "2026-10-23T10:00:00.000Z" }] },
      });
      expect(getTrainingDaysMock).toHaveBeenCalledExactlyOnceWith("user-1", courseType);
      expect(logErrorMock).not.toHaveBeenCalled();
    },
  );

  it("training days denied Core error stays 403 with FORBIDDEN", async () => {
    getTrainingDaysMock.mockRejectedValueOnce(new Error("COURSE_ACCESS_DENIED"));
    const response = await createAuthenticatedTestApp().request(
      "/api/v1/training/days?type=fixture",
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      success: false,
      error: "Нет доступа к курсу",
      code: "FORBIDDEN",
    });
    expect(logErrorMock).not.toHaveBeenCalled();
  });

  it("training day personalization precondition keeps 428 without logging", async () => {
    getTrainingDayWithMonetizedStepsMock.mockRejectedValueOnce(
      new Error("PERSONALIZATION_REQUIRED"),
    );
    const response = await createAuthenticatedTestApp().request(
      "/api/v1/training/day?courseType=fixture&dayOnCourseId=clwdayoc0000000000000001",
    );
    expect(response.status).toBe(428);
    expect(await response.json()).toEqual({
      success: false,
      error: "Для этого курса нужно заполнить персонализацию",
      code: "PERSONALIZATION_REQUIRED",
    });
    expect(logErrorMock).not.toHaveBeenCalled();
  });

  it("WEB online pause then resume preserves registered wire IDs and action sequence", async () => {
    const app = createAuthenticatedTestApp();
    const pauseBody = {
      courseId: STEP_COURSE,
      dayOnCourseId: STEP_DAY,
      stepIndex: 2,
      timeLeftSec: 37,
    };
    const resumeBody = {
      courseId: STEP_COURSE,
      dayOnCourseId: STEP_DAY,
      stepIndex: 2,
    };
    updateStepAndDayMock.mockResolvedValue({ courseId: STEP_COURSE });

    const pause = await app.request(jsonRequest("/api/v1/training/step/pause", "POST", pauseBody));
    expect(pause.status).toBe(200);
    expect(await pause.json()).toEqual({ success: true });

    const resume = await app.request(
      jsonRequest("/api/v1/training/step/resume", "POST", resumeBody),
    );
    expect(resume.status).toBe(200);
    expect(await resume.json()).toEqual({ success: true });

    expect(requireCourseStepOperationAccessMock).toHaveBeenCalledTimes(2);
    expect(requireCourseStepOperationAccessMock).toHaveBeenNthCalledWith(1, {
      userId: STEP_ACTOR,
      platform: "ANDROID",
      expectedCourseId: STEP_COURSE,
      dayOnCourseId: STEP_DAY,
      stepIndex: 2,
    });
    expect(requireCourseStepOperationAccessMock).toHaveBeenNthCalledWith(2, {
      userId: STEP_ACTOR,
      platform: "ANDROID",
      expectedCourseId: STEP_COURSE,
      dayOnCourseId: STEP_DAY,
      stepIndex: 2,
    });
    expect(updateStepAndDayMock).toHaveBeenCalledTimes(2);
    expect(updateStepAndDayMock).toHaveBeenNthCalledWith(1, STEP_ACTOR, STEP_DAY, 2, {
      type: "pause",
      remainingSec: 37,
    });
    expect(updateStepAndDayMock).toHaveBeenNthCalledWith(2, STEP_ACTOR, STEP_DAY, 2, {
      type: "resume",
    });
    expect(syncUserCourseStatusFromDaysMock).toHaveBeenCalledTimes(2);
    expect(syncUserCourseStatusFromDaysMock).toHaveBeenNthCalledWith(1, STEP_ACTOR, STEP_COURSE);
    expect(syncUserCourseStatusFromDaysMock).toHaveBeenNthCalledWith(2, STEP_ACTOR, STEP_COURSE);
    // Downstream Core, notifications and queue remain mocked; no real POST/SQL.
  });

  describe("mounted step mutation privacy boundaries", () => {
    it.each(stepOperations)("$name unexpected Core failure is 500, not raw logged", async (op) => {
      updateStepAndDayMock.mockRejectedValueOnce(privateFailure());
      const res = await createAuthenticatedTestApp().request(
        jsonRequest("/api/v1/training/step/" + op.path, "POST", stepBody(op.extra)),
      );
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        success: false,
        error: "Внутренняя ошибка сервера",
      });
      expect(logErrorMock).toHaveBeenCalledTimes(1);
      expect(loggedErrorsText()).not.toContain(PRIVATE_STEP_CANARY);
      expect(loggedErrorsText()).not.toContain("PRIVATE_STEP_STACK");
      expect(syncUserCourseStatusFromDaysMock).not.toHaveBeenCalled();
      expect(createStepNotificationForStepStartMock).not.toHaveBeenCalled();
    });

    it.each(stepOperations)("$name access-denied remains 403 without write/log", async (op) => {
      requireCourseStepOperationAccessMock.mockRejectedValueOnce(new Error("COURSE_ACCESS_DENIED"));
      const res = await createAuthenticatedTestApp().request(
        jsonRequest("/api/v1/training/step/" + op.path, "POST", stepBody(op.extra)),
      );
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({
        success: false,
        error: "Нет доступа к курсу",
        code: "FORBIDDEN",
      });
      expect(updateStepAndDayMock).not.toHaveBeenCalled();
      expect(logErrorMock).not.toHaveBeenCalled();
    });

    it.each(stepOperations)("$name paywall remains 402 without write/log", async (op) => {
      requireCourseStepOperationAccessMock.mockRejectedValueOnce(
        Object.assign(new Error("paywall"), { name: "SubscriptionOrCreditsRequiredError" }),
      );
      const res = await createAuthenticatedTestApp().request(
        jsonRequest("/api/v1/training/step/" + op.path, "POST", stepBody(op.extra)),
      );
      expect(res.status).toBe(402);
      expect(await res.json()).toEqual({
        success: false,
        error: "Для действия нужна подписка или доступ к шагу за просмотр рекламы",
        code: "SUBSCRIPTION_OR_CREDITS_REQUIRED",
      });
      expect(updateStepAndDayMock).not.toHaveBeenCalled();
      expect(logErrorMock).not.toHaveBeenCalled();
    });

    it.each(stepOperations)("$name missing step remains 404", async (op) => {
      updateStepAndDayMock.mockRejectedValueOnce(new Error("Step not found"));
      const res = await createAuthenticatedTestApp().request(
        jsonRequest("/api/v1/training/step/" + op.path, "POST", stepBody(op.extra)),
      );
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({
        success: false,
        error: "Шаг не найден",
        code: "NOT_FOUND",
      });
      expect(logErrorMock).not.toHaveBeenCalled();
    });

    it.each(stepOperations)("$name invalid transition remains 409", async (op) => {
      updateStepAndDayMock.mockRejectedValueOnce(new Error("INVALID_STATE: finished"));
      const res = await createAuthenticatedTestApp().request(
        jsonRequest("/api/v1/training/step/" + op.path, "POST", stepBody(op.extra)),
      );
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({
        success: false,
        error: "Состояние шага уже изменилось. Обновите страницу.",
        code: "INVALID_STATE",
      });
      expect(logErrorMock).not.toHaveBeenCalled();
    });

    it.each(stepOperations)("$name success preserves exact mutation + sync", async (op) => {
      updateStepAndDayMock.mockResolvedValueOnce({ courseId: STEP_COURSE });
      const res = await createAuthenticatedTestApp().request(
        jsonRequest("/api/v1/training/step/" + op.path, "POST", stepBody(op.extra)),
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
      expect(updateStepAndDayMock).toHaveBeenCalledExactlyOnceWith(
        STEP_ACTOR,
        STEP_DAY,
        2,
        op.type === "start"
          ? { type: "start", remainingSec: 90 }
          : op.type === "pause"
            ? { type: "pause", remainingSec: 70 }
            : { type: op.type },
      );
      expect(syncUserCourseStatusFromDaysMock).toHaveBeenCalledExactlyOnceWith(
        STEP_ACTOR,
        STEP_COURSE,
      );
      expect(logErrorMock).not.toHaveBeenCalled();
    });

    it.each(stepOperations.filter((op) => op.name !== "theory complete"))(
      "$name sync failure is nonfatal and does not log provider error",
      async (op) => {
        updateStepAndDayMock.mockResolvedValueOnce({ courseId: STEP_COURSE });
        syncUserCourseStatusFromDaysMock.mockRejectedValueOnce(privateFailure());
        const res = await createAuthenticatedTestApp().request(
          jsonRequest("/api/v1/training/step/" + op.path, "POST", stepBody(op.extra)),
        );
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true });
        expect(logErrorMock).toHaveBeenCalledTimes(1);
        expect(loggedErrorsText()).not.toContain(PRIVATE_STEP_CANARY);
      },
    );

    it("theory complete sync failure stays 500 with sanitized log", async () => {
      updateStepAndDayMock.mockResolvedValueOnce({ courseId: STEP_COURSE });
      syncUserCourseStatusFromDaysMock.mockRejectedValueOnce(privateFailure());
      const res = await createAuthenticatedTestApp().request(
        jsonRequest("/api/v1/training/step/complete/theory", "POST", stepBody()),
      );
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        success: false,
        error: "Внутренняя ошибка сервера",
      });
      expect(logErrorMock).toHaveBeenCalledTimes(1);
      expect(loggedErrorsText()).not.toContain(PRIVATE_STEP_CANARY);
    });

    it("start fire-and-forget notify failure keeps success and redacts logger actor", async () => {
      updateStepAndDayMock.mockResolvedValueOnce({ courseId: STEP_COURSE });
      createStepNotificationForStepStartMock.mockRejectedValueOnce(privateFailure());
      const res = await createAuthenticatedTestApp().request(
        jsonRequest("/api/v1/training/step/start", "POST", stepBody({ durationSec: 90 })),
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
      await Promise.resolve();
      expect(logErrorMock).toHaveBeenCalledTimes(1);
      expect(loggedErrorsText()).not.toContain(PRIVATE_STEP_CANARY);
      expect(loggedErrorsText()).not.toContain(STEP_ACTOR);
      expect(loggedErrorsText()).not.toContain(STEP_DAY);
    });

    it.each([
      { name: "pause", fn: pauseStepNotificationMock, extra: { timeLeftSec: 70 } },
      { name: "resume", fn: resumeStepNotificationMock, extra: {} },
    ])("$name notification failure is nonfatal and redacts identifiers", async (op) => {
      updateStepAndDayMock.mockResolvedValueOnce({ courseId: STEP_COURSE });
      op.fn.mockRejectedValueOnce(privateFailure());
      const res = await createAuthenticatedTestApp().request(
        jsonRequest("/api/v1/training/step/" + op.name, "POST", stepBody(op.extra)),
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
      expect(logErrorMock).toHaveBeenCalledTimes(1);
      expect(loggedErrorsText()).not.toContain(PRIVATE_STEP_CANARY);
      expect(loggedErrorsText()).not.toContain(STEP_ACTOR);
      expect(loggedErrorsText()).not.toContain(STEP_DAY);
    });
  });

  describe("mounted step reset independent privacy boundary", () => {
    const path = "/api/v1/training/step/reset";
    const call = () =>
      createAuthenticatedTestApp().request(
        jsonRequest(path, "POST", stepBody({ durationSec: 90 })),
      );
    it("unexpected Core error is 500 and must not reach logger", async () => {
      updateStepAndDayMock.mockRejectedValueOnce(privateFailure());
      const res = await call();
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        success: false,
        error: "Внутренняя ошибка сервера",
      });
      expect(logErrorMock).toHaveBeenCalledTimes(1);
      expect(loggedErrorsText()).not.toContain(PRIVATE_STEP_CANARY);
      expect(syncUserCourseStatusFromDaysMock).not.toHaveBeenCalled();
      expect(resetStepNotificationMock).not.toHaveBeenCalled();
    });
    it("sync error is best effort and must not log raw provider stack", async () => {
      updateStepAndDayMock.mockResolvedValueOnce({ courseId: STEP_COURSE });
      syncUserCourseStatusFromDaysMock.mockRejectedValueOnce(privateFailure());
      const res = await call();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
      expect(logErrorMock).toHaveBeenCalledTimes(1);
      expect(loggedErrorsText()).not.toContain(PRIVATE_STEP_CANARY);
      expect(resetStepNotificationMock).toHaveBeenCalledExactlyOnceWith(
        STEP_ACTOR,
        "fixture-day",
        2,
      );
    });
    it("reset notification error remains nonfatal and redacts identifiers", async () => {
      updateStepAndDayMock.mockResolvedValueOnce({ courseId: STEP_COURSE });
      resetStepNotificationMock.mockRejectedValueOnce(privateFailure());
      const res = await call();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
      expect(logErrorMock).toHaveBeenCalledTimes(1);
      expect(loggedErrorsText()).not.toContain(PRIVATE_STEP_CANARY);
      expect(loggedErrorsText()).not.toContain(STEP_ACTOR);
      expect(loggedErrorsText()).not.toContain(STEP_DAY);
    });
    it("success keeps reset Core mutation and queue notification calls", async () => {
      updateStepAndDayMock.mockResolvedValueOnce({ courseId: STEP_COURSE });
      const res = await call();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
      expect(updateStepAndDayMock).toHaveBeenCalledExactlyOnceWith(STEP_ACTOR, STEP_DAY, 2, {
        type: "reset",
      });
      expect(syncUserCourseStatusFromDaysMock).toHaveBeenCalledExactlyOnceWith(
        STEP_ACTOR,
        STEP_COURSE,
      );
      expect(resetStepNotificationMock).toHaveBeenCalledExactlyOnceWith(
        STEP_ACTOR,
        "fixture-day",
        2,
      );
      expect(logErrorMock).not.toHaveBeenCalled();
    });
    it.each([
      [
        "COURSE_ACCESS_DENIED",
        403,
        { success: false, error: "Нет доступа к курсу", code: "FORBIDDEN" },
      ],
      [
        "SUBSCRIPTION_REQUIRED",
        402,
        {
          success: false,
          error: "Для действия нужна подписка или доступ к шагу за просмотр рекламы",
          code: "SUBSCRIPTION_OR_CREDITS_REQUIRED",
        },
      ],
    ])("denies %s without mutation (HTTP %s)", async (kind, status, dto) => {
      const error =
        kind === "COURSE_ACCESS_DENIED"
          ? new Error("COURSE_ACCESS_DENIED")
          : Object.assign(new Error("locked"), { name: "SubscriptionOrCreditsRequiredError" });
      requireCourseStepOperationAccessMock.mockRejectedValueOnce(error);
      const res = await call();
      expect(res.status).toBe(status);
      expect(await res.json()).toEqual(dto);
      expect(updateStepAndDayMock).not.toHaveBeenCalled();
      expect(logErrorMock).not.toHaveBeenCalled();
    });
    it.each([
      ["Step not found", "Шаг не найден"],
      ["DayOnCourse or day not found", "День не найден"],
    ])("preserves 404 for %s", async (code, error) => {
      updateStepAndDayMock.mockRejectedValueOnce(new Error(code));
      const res = await call();
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ success: false, error, code: "NOT_FOUND" });
      expect(logErrorMock).not.toHaveBeenCalled();
    });
    it("preserves invalid-state 409, not a fabricated 400", async () => {
      updateStepAndDayMock.mockRejectedValueOnce(new Error("INVALID_STATE: not started"));
      const res = await call();
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({
        success: false,
        error: "Состояние шага уже изменилось. Обновите страницу.",
        code: "INVALID_STATE",
      });
      expect(logErrorMock).not.toHaveBeenCalled();
    });
  });

  it("requires auth before starting a step", async () => {
    const app = createTestApp();

    const response = await app.request(
      jsonRequest("/api/v1/training/step/start", "POST", {
        dayOnCourseId: "day-1",
        stepIndex: 0,
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: "Токен не предоставлен",
    });
  });

  it("keeps DIARY steps free without an active subscription", async () => {
    getAppSubscriptionAccessMock.mockResolvedValue({ hasActiveSubscription: false });

    const response = await createAuthenticatedTestApp().request(
      jsonRequest("/api/v1/training/diary", "POST", {
        dayOnCourseId: "clwdayoc0000000000000001",
        content: "Запись в дневнике",
      }),
    );

    expect(response.status).toBe(200);
    expect(saveDiaryEntryMock).toHaveBeenCalledWith(
      "user-1",
      "clwdayoc0000000000000001",
      "Запись в дневнике",
    );
    expect(getAppSubscriptionAccessMock).not.toHaveBeenCalled();
  });

  it("diary POST 500 does not record raw student text/provider secret", async () => {
    const canary = "SYNTHETIC_PRIVATE_DIARY_CONTENT_DO_NOT_LOG";
    saveDiaryEntryMock.mockRejectedValueOnce(new Error(canary));
    const response = await createAuthenticatedTestApp().request(
      jsonRequest("/api/v1/training/diary", "POST", {
        dayOnCourseId: "clwdayoc0000000000000001",
        content: "Private diary",
      }),
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      error: "Внутренняя ошибка сервера",
    });
    expect(logErrorMock).toHaveBeenCalledTimes(1);
    const logged = logErrorMock.mock.calls
      .flat()
      .map((part: unknown) =>
        part instanceof Error ? [part.message, part.stack].join(" ") : JSON.stringify(part),
      )
      .join(" ");
    expect(logged).not.toContain(canary);
  });

  it("diary POST forwards authenticated actor, day CUID and Zod-trimmed content once", async () => {
    const content = "Сегодня выполнили упражнения";
    const response = await createAuthenticatedTestApp().request(
      jsonRequest("/api/v1/training/diary", "POST", {
        dayOnCourseId: STEP_DAY,
        content: `  ${content}  `,
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(saveDiaryEntryMock).toHaveBeenCalledExactlyOnceWith("user-1", STEP_DAY, content);
    expect(getDiaryEntriesMock).not.toHaveBeenCalled();
    expect(requireCourseStepOperationAccessMock).not.toHaveBeenCalled();
    expect(logErrorMock).not.toHaveBeenCalled();
  });

  it.each([
    ["Нет доступа к курсу", 403],
    ["День курса не найден", 400],
    ["Текст записи не может быть пустым", 400],
  ] as const)(
    "diary POST keeps original Core business error %s status %s",
    async (error, status) => {
      saveDiaryEntryMock.mockResolvedValueOnce({ success: false, error });
      const response = await createAuthenticatedTestApp().request(
        jsonRequest("/api/v1/training/diary", "POST", {
          dayOnCourseId: STEP_DAY,
          content: "Синтетическая запись",
        }),
      );
      expect(response.status).toBe(status);
      await expect(response.json()).resolves.toEqual({ success: false, error });
      expect(saveDiaryEntryMock).toHaveBeenCalledExactlyOnceWith(
        "user-1",
        STEP_DAY,
        "Синтетическая запись",
      );
      expect(logErrorMock).not.toHaveBeenCalled();
      expect(getDiaryEntriesMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    { dayOnCourseId: "not-a-cuid", content: "Дневник" },
    { dayOnCourseId: STEP_DAY, content: "  " },
    { dayOnCourseId: STEP_DAY, content: "x".repeat(10001) },
    { dayOnCourseId: STEP_DAY },
  ])("diary POST Zod rejects invalid request before Core write: %j", async (body) => {
    const response = await createAuthenticatedTestApp().request(
      jsonRequest("/api/v1/training/diary", "POST", body),
    );
    expect(response.status).toBe(400);
    expect(saveDiaryEntryMock).not.toHaveBeenCalled();
    expect(getDiaryEntriesMock).not.toHaveBeenCalled();
    expect(logErrorMock).not.toHaveBeenCalled();
  });

  it("diary POST no auth preserves original 401 with zero Core calls", async () => {
    const response = await createTestApp().request(
      jsonRequest("/api/v1/training/diary", "POST", {
        dayOnCourseId: STEP_DAY,
        content: "Текст",
      }),
    );
    expect(response.status).toBe(401);
    expect(saveDiaryEntryMock).not.toHaveBeenCalled();
    expect(getDiaryEntriesMock).not.toHaveBeenCalled();
  });

  it("diary GET success retains course/day filter order and original entries JSON", async () => {
    const entries = [{ id: "entry-1", content: "Учебная запись" }];
    getDiaryEntriesMock.mockResolvedValueOnce({ entries });
    const response = await createAuthenticatedTestApp().request(
      "/api/v1/training/diary?courseId=course-1&upToDayOnCourseId=clwdayoc0000000000000001",
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: { entries } });
    expect(getDiaryEntriesMock).toHaveBeenCalledExactlyOnceWith(
      "user-1",
      "course-1",
      "clwdayoc0000000000000001",
    );
    expect(logErrorMock).not.toHaveBeenCalled();
  });

  it("diary GET 500 does not record private entry/error stack", async () => {
    const canary = "SYNTHETIC_PRIVATE_DIARY_READ_ERROR_DO_NOT_LOG";
    getDiaryEntriesMock.mockRejectedValueOnce(new Error(canary));
    const response = await createAuthenticatedTestApp().request(
      "/api/v1/training/diary?courseId=fixture",
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      error: "Внутренняя ошибка сервера",
    });
    expect(logErrorMock).toHaveBeenCalledTimes(1);
    const logged = logErrorMock.mock.calls
      .flat()
      .map((part: unknown) =>
        part instanceof Error ? [part.message, part.stack].join(" ") : JSON.stringify(part),
      )
      .join(" ");
    expect(logged).not.toContain(canary);
  });

  it("diary GET retains owner-denied 403 and does not emit a failure log", async () => {
    getDiaryEntriesMock.mockResolvedValueOnce({
      entries: [],
      error: "Нет доступа к курсу",
    });
    const response = await createAuthenticatedTestApp().request(
      "/api/v1/training/diary?courseId=fixture",
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      success: false,
      error: "Нет доступа к курсу",
    });
    expect(getDiaryEntriesMock).toHaveBeenCalledExactlyOnceWith("user-1", "fixture", undefined);
    expect(logErrorMock).not.toHaveBeenCalled();
  });

  it("requires auth before reading video progress", async () => {
    const app = createTestApp();

    const response = await app.request("/api/v1/training/video/video-1/progress");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: "Токен не предоставлен",
    });
  });

  it("does not bypass auth when a progress video id contains manifest", async () => {
    const app = createTestApp();

    const response = await app.request("/api/v1/training/video/manifest/progress");

    expect(response.status).toBe(401);
  });

  it("starts a step, syncs course status, and schedules timeout notification", async () => {
    const app = createAuthenticatedTestApp();
    updateStepAndDayMock.mockResolvedValueOnce({ courseId: "course-1" });
    syncUserCourseStatusFromDaysMock.mockResolvedValueOnce(undefined);
    createStepNotificationForStepStartMock.mockResolvedValueOnce(undefined);

    const response = await app.request(
      jsonRequest("/api/v1/training/step/start", "POST", {
        courseId: "clwcourse00000000000000001",
        dayOnCourseId: "clwdayoc0000000000000001",
        stepIndex: 2,
        durationSec: 90,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(updateStepAndDayMock).toHaveBeenCalledWith("user-1", "clwdayoc0000000000000001", 2, {
      type: "start",
      remainingSec: 90,
    });
    expect(syncUserCourseStatusFromDaysMock).toHaveBeenCalledWith("user-1", "course-1");
    expect(createStepNotificationForStepStartMock).toHaveBeenCalledWith(
      "user-1",
      "clwdayoc0000000000000001",
      2,
      90,
    );
    expect(requireCourseStepOperationAccessMock).toHaveBeenCalledWith({
      userId: "user-1",
      platform: "ANDROID",
      expectedCourseId: "clwcourse00000000000000001",
      dayOnCourseId: "clwdayoc0000000000000001",
      stepIndex: 2,
    });
  });

  it("maps missing training day errors to not found responses", async () => {
    const app = createAuthenticatedTestApp();
    updateStepAndDayMock.mockRejectedValueOnce(new Error("DayOnCourse or day not found"));

    const response = await app.request(
      jsonRequest("/api/v1/training/step/start", "POST", {
        courseId: "clwcourse00000000000000001",
        dayOnCourseId: "clwdayoc0000000000000001",
        stepIndex: 0,
        durationSec: 60,
      }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "День не найден",
      code: "NOT_FOUND",
    });
    expect(syncUserCourseStatusFromDaysMock).not.toHaveBeenCalled();
  });

  it("returns a redacted monetized training day", async () => {
    const app = createAuthenticatedTestApp();
    getTrainingDayWithMonetizedStepsMock.mockResolvedValueOnce({
      trainingDayId: "day-1",
      steps: [
        { locked: true, monetizationTarget: { targetType: "COURSE_STEP", targetId: "sod-1" } },
      ],
    });

    const response = await app.request(
      "/api/v1/training/day?courseType=course&dayOnCourseId=clwdayoc0000000000000001&platform=IOS",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        steps: [{ locked: true }],
      },
    });
    expect(getTrainingDayWithMonetizedStepsMock).toHaveBeenCalledWith(
      "user-1",
      "course",
      "clwdayoc0000000000000001",
      { createIfMissing: false, platform: "IOS" },
    );
  });

  it("opt-in stable StepOnDay binding crosses Hono guard and Core write without changing success ACK", async () => {
    const binding = {
      expectedStepOnDayId: "stable-occurrence-B",
      expectedStepId: "original-step-B",
    };
    updateStepAndDayMock.mockResolvedValueOnce({ courseId: STEP_COURSE });
    const result = await createAuthenticatedTestApp().request(
      jsonRequest("/api/v1/training/step/start", "POST", stepBody({ durationSec: 60, ...binding })),
    );
    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toEqual({ success: true });
    expect(requireCourseStepOperationAccessMock).toHaveBeenCalledExactlyOnceWith({
      userId: STEP_ACTOR,
      platform: "ANDROID",
      expectedCourseId: STEP_COURSE,
      dayOnCourseId: STEP_DAY,
      stepIndex: 2,
      ...binding,
    });
    expect(updateStepAndDayMock).toHaveBeenCalledExactlyOnceWith(
      STEP_ACTOR,
      STEP_DAY,
      2,
      { type: "start", remainingSec: 60 },
      { ...binding, expectedCourseId: STEP_COURSE },
    );
  });

  it("opt-in stale target maps to 409 before Core mutation or queue notification", async () => {
    requireCourseStepOperationAccessMock.mockRejectedValueOnce(new Error("STALE_STEP_BINDING"));
    const res = await createAuthenticatedTestApp().request(
      jsonRequest(
        "/api/v1/training/step/start",
        "POST",
        stepBody({
          durationSec: 10,
          expectedStepOnDayId: "stale-link",
          expectedStepId: "stale-step",
        }),
      ),
    );
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ success: false, code: "STALE_STEP_BINDING" });
    expect(updateStepAndDayMock).not.toHaveBeenCalled();
    expect(createStepNotificationForStepStartMock).not.toHaveBeenCalled();
  });

  it("opt-in incomplete binding gives 400 with no authorizer/DB/notification side effects", async () => {
    const res = await createAuthenticatedTestApp().request(
      jsonRequest(
        "/api/v1/training/step/pause",
        "POST",
        stepBody({
          timeLeftSec: 5,
          expectedStepOnDayId: "link-only",
        }),
      ),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      code: "INVALID_STEP_BINDING",
    });
    expect(requireCourseStepOperationAccessMock).not.toHaveBeenCalled();
    expect(updateStepAndDayMock).not.toHaveBeenCalled();
    expect(pauseStepNotificationMock).not.toHaveBeenCalled();
  });

  it("opt-in theory validates same stable occurrence before write", async () => {
    updateStepAndDayMock.mockResolvedValueOnce({ courseId: STEP_COURSE });
    const binding = { expectedStepOnDayId: "theory-occurrence", expectedStepId: "theory-step" };
    const res = await createAuthenticatedTestApp().request(
      jsonRequest("/api/v1/training/step/complete/theory", "POST", stepBody(binding)),
    );
    expect(res.status).toBe(200);
    expect(validateTheoryStepForCompletionMock).toHaveBeenCalledExactlyOnceWith(
      STEP_DAY,
      2,
      binding,
    );
    expect(updateStepAndDayMock).toHaveBeenCalledExactlyOnceWith(
      STEP_ACTOR,
      STEP_DAY,
      2,
      { type: "complete" },
      { ...binding, expectedCourseId: STEP_COURSE },
    );
  });

  it("rejects locked monetized step completion with subscription-or-credits required", async () => {
    const app = createAuthenticatedTestApp();
    requireCourseStepOperationAccessMock.mockRejectedValueOnce(
      Object.assign(new Error("locked"), { name: "SubscriptionOrCreditsRequiredError" }),
    );

    const response = await app.request(
      jsonRequest("/api/v1/training/step/complete/practice", "POST", {
        courseId: "clwcourse00000000000000001",
        dayOnCourseId: "clwdayoc0000000000000001",
        stepIndex: 0,
      }),
    );

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Для действия нужна подписка или доступ к шагу за просмотр рекламы",
      code: "SUBSCRIPTION_OR_CREDITS_REQUIRED",
    });
    expect(updateStepAndDayMock).not.toHaveBeenCalled();
  });
});
