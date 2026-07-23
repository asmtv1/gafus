import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  checkCourseAccessMock,
  checkCourseAccessByIdMock,
  createStepNotificationForStepStartMock,
  getAppFeatureFlagEnabledMock,
  getAppSubscriptionAccessMock,
  getTrainingDayWithMonetizedStepsMock,
  requireCourseStepPremiumOrRewardedUnlockMock,
  syncUserCourseStatusFromDaysMock,
  unlockCourseStepRewardedTargetMock,
  updateStepAndDayMock,
} = vi.hoisted(() => ({
  checkCourseAccessMock: vi.fn(),
  checkCourseAccessByIdMock: vi.fn(),
  createStepNotificationForStepStartMock: vi.fn(),
  getAppFeatureFlagEnabledMock: vi.fn(),
  getAppSubscriptionAccessMock: vi.fn(),
  getTrainingDayWithMonetizedStepsMock: vi.fn(),
  requireCourseStepPremiumOrRewardedUnlockMock: vi.fn(),
  syncUserCourseStatusFromDaysMock: vi.fn(),
  unlockCourseStepRewardedTargetMock: vi.fn(),
  updateStepAndDayMock: vi.fn(),
}));

vi.mock("@gafus/core/services/training", () => ({
  getTrainingDays: vi.fn(),
  getTrainingDayWithMonetizedSteps: getTrainingDayWithMonetizedStepsMock,
  getTrainingDayWithUserSteps: vi.fn(),
  requireCourseStepPremiumOrRewardedUnlock: requireCourseStepPremiumOrRewardedUnlockMock,
  syncUserCourseStatusFromDays: syncUserCourseStatusFromDaysMock,
  unlockCourseStepRewardedTarget: unlockCourseStepRewardedTargetMock,
  updateStepAndDay: updateStepAndDayMock,
  validateTheoryStepForCompletion: vi.fn(),
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
  getDiaryEntries: vi.fn(),
  saveDiaryEntry: vi.fn(),
}));

vi.mock("@gafus/core/services/course", () => ({
  checkCourseAccess: checkCourseAccessMock,
  checkCourseAccessById: checkCourseAccessByIdMock,
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
  getDayFromDayOnCourseId: vi.fn(),
  pauseStepNotification: vi.fn(),
  resetStepNotification: vi.fn(),
  resumeStepNotification: vi.fn(),
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    error: vi.fn(),
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

describe("training route contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkCourseAccessMock.mockResolvedValue({ hasAccess: true });
    checkCourseAccessByIdMock.mockResolvedValue({ hasAccess: true });
    getAppFeatureFlagEnabledMock.mockResolvedValue(false);
    getAppSubscriptionAccessMock.mockResolvedValue({ hasActiveSubscription: true });
    getTrainingDayWithMonetizedStepsMock.mockResolvedValue({ trainingDayId: "day-1", steps: [] });
    requireCourseStepPremiumOrRewardedUnlockMock.mockResolvedValue(null);
    unlockCourseStepRewardedTargetMock.mockResolvedValue({
      targetType: "COURSE_STEP",
      targetId: "step-on-day-1",
      unlocked: true,
      spentCredits: 1,
      balance: 4,
      pendingRefundCredits: 0,
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
    expect(requireCourseStepPremiumOrRewardedUnlockMock).toHaveBeenCalledWith({
      userId: "user-1",
      platform: "ANDROID",
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

  it("unlocks a monetized training step with rewarded credits", async () => {
    const app = createAuthenticatedTestApp();

    const response = await app.request(
      jsonRequest("/api/v1/training/step/unlock", "POST", {
        courseType: "course",
        dayOnCourseId: "clwdayoc0000000000000001",
        stepIndex: 0,
        platform: "IOS",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { targetId: "step-on-day-1", spentCredits: 1 },
    });
    expect(unlockCourseStepRewardedTargetMock).toHaveBeenCalledWith({
      userId: "user-1",
      platform: "IOS",
      courseType: "course",
      dayOnCourseId: "clwdayoc0000000000000001",
      stepIndex: 0,
    });
  });

  it("rejects locked monetized step completion with subscription-or-credits required", async () => {
    const app = createAuthenticatedTestApp();
    requireCourseStepPremiumOrRewardedUnlockMock.mockRejectedValueOnce(
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
      error: "Для действия нужна подписка или rewarded credits",
      code: "SUBSCRIPTION_OR_CREDITS_REQUIRED",
    });
    expect(updateStepAndDayMock).not.toHaveBeenCalled();
  });
});
