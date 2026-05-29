import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  checkCourseAccessMock,
  checkCourseAccessByIdMock,
  createStepNotificationForStepStartMock,
  getAppFeatureFlagEnabledMock,
  getAppSubscriptionAccessMock,
  syncUserCourseStatusFromDaysMock,
  updateStepAndDayMock,
} = vi.hoisted(() => ({
  checkCourseAccessMock: vi.fn(),
  checkCourseAccessByIdMock: vi.fn(),
  createStepNotificationForStepStartMock: vi.fn(),
  getAppFeatureFlagEnabledMock: vi.fn(),
  getAppSubscriptionAccessMock: vi.fn(),
  syncUserCourseStatusFromDaysMock: vi.fn(),
  updateStepAndDayMock: vi.fn(),
}));

vi.mock("@gafus/core/services/training", () => ({
  getTrainingDays: vi.fn(),
  getTrainingDayWithUserSteps: vi.fn(),
  syncUserCourseStatusFromDays: syncUserCourseStatusFromDaysMock,
  updateStepAndDay: updateStepAndDayMock,
  validateTheoryStepForCompletion: vi.fn(),
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
  getVideoManifestInfo: vi.fn(),
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
}));

vi.mock("@gafus/video-access", () => ({
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

  it("rejects step completion when app subscription gating is enabled and user has no active subscription", async () => {
    const app = createAuthenticatedTestApp();
    getAppFeatureFlagEnabledMock.mockResolvedValueOnce(true);
    getAppSubscriptionAccessMock.mockResolvedValueOnce({ hasActiveSubscription: false });

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
      error: "Для действия нужна подписка",
      code: "SUBSCRIPTION_REQUIRED",
    });
    expect(updateStepAndDayMock).not.toHaveBeenCalled();
  });
});
