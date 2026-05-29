import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { trainingRoutes } from "./training";

const {
  checkCourseAccessByIdMock,
  checkVideoAccessMock,
  downloadFileFromCDNMock,
  extractVideoIdFromCdnUrlMock,
  generateTokenMock,
  getAppFeatureFlagEnabledMock,
  getAppSubscriptionAccessMock,
  updateStepAndDayMock,
  syncUserCourseStatusFromDaysMock,
  verifyTokenMock,
} = vi.hoisted(() => ({
  checkCourseAccessByIdMock: vi.fn(),
  checkVideoAccessMock: vi.fn(),
  downloadFileFromCDNMock: vi.fn(),
  extractVideoIdFromCdnUrlMock: vi.fn(),
  generateTokenMock: vi.fn(),
  getAppFeatureFlagEnabledMock: vi.fn(),
  getAppSubscriptionAccessMock: vi.fn(),
  updateStepAndDayMock: vi.fn(),
  syncUserCourseStatusFromDaysMock: vi.fn(),
  verifyTokenMock: vi.fn(),
}));

vi.mock("@gafus/core/services/training", () => ({
  getTrainingDays: vi.fn(),
  getTrainingDayWithUserSteps: vi.fn(),
  syncUserCourseStatusFromDays: syncUserCourseStatusFromDaysMock,
  updateStepAndDay: updateStepAndDayMock,
  validateTheoryStepForCompletion: vi.fn(),
}));

vi.mock("@gafus/core/services/course", () => ({
  checkCourseAccess: vi.fn(),
  checkCourseAccessById: checkCourseAccessByIdMock,
}));

vi.mock("@gafus/core/services/appFeatureFlags", () => ({
  APP_FEATURE_APP_SUBSCRIPTION_GATING: "app_subscription_gating_enabled",
  getAppFeatureFlagEnabled: getAppFeatureFlagEnabledMock,
}));

vi.mock("@gafus/core/services/appSubscription", () => ({
  getAppSubscriptionAccess: getAppSubscriptionAccessMock,
}));

vi.mock("@gafus/core/services/diary", () => ({
  saveDiaryEntry: vi.fn(),
  getDiaryEntries: vi.fn(),
}));

vi.mock("@gafus/core/services/notifications", () => ({
  createStepNotificationForStepStart: vi.fn(),
  getDayFromDayOnCourseId: vi.fn(),
  pauseStepNotification: vi.fn(),
  resetStepNotification: vi.fn(),
  resumeStepNotification: vi.fn(),
}));

vi.mock("@gafus/core/services/video", () => ({
  checkVideoAccess: checkVideoAccessMock,
  getVideoManifestInfo: vi.fn(),
}));

vi.mock("@gafus/cdn-upload", () => ({
  downloadFileFromCDN: downloadFileFromCDNMock,
  extractVideoIdFromCdnUrl: extractVideoIdFromCdnUrlMock,
}));

vi.mock("@gafus/video-access", () => ({
  getVideoAccessService: vi.fn(() => ({
    generateToken: generateTokenMock,
    verifyToken: verifyTokenMock,
  })),
}));

const { getVideoManifestInfo } = await import("@gafus/core/services/video");

function createTestApp() {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("user", {
      id: "cmhf79vic0000qr4m219z780r",
      username: "admin",
      role: "ADMIN",
    });
    await next();
  });
  app.route("/api/v1/training", trainingRoutes);
  return app;
}

describe("training route validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VIDEO_ACCESS_SECRET = "test-video-access-secret-that-is-long-enough";
    checkCourseAccessByIdMock.mockResolvedValue({ hasAccess: true });
    getAppFeatureFlagEnabledMock.mockResolvedValue(false);
    getAppSubscriptionAccessMock.mockResolvedValue({ hasActiveSubscription: true });
    updateStepAndDayMock.mockResolvedValue({
      courseId: "7b9e6c3a-321f-40de-ada8-11309951b181",
      allCompleted: false,
      stepJustCompleted: true,
    });
    syncUserCourseStatusFromDaysMock.mockResolvedValue(undefined);
    vi.mocked(getVideoManifestInfo).mockResolvedValue({
      hlsManifestPath: "trainers/trainer-1/videocourses/video-1/hls/playlist.m3u8",
      transcodingStatus: "COMPLETED",
      trainerId: "trainer-1",
    });
    extractVideoIdFromCdnUrlMock.mockReturnValue("video-1");
    generateTokenMock.mockReturnValue("signed-token");
    verifyTokenMock.mockReturnValue({
      videoId: "video-1",
      userId: "cmhf79vic0000qr4m219z780r",
      expiresAt: Date.now() + 60_000,
    });
    checkVideoAccessMock.mockResolvedValue(true);
    downloadFileFromCDNMock.mockResolvedValue(Buffer.from("segment"));
  });

  it("accepts UUID course ids for paid courses when completing practice steps", async () => {
    const app = createTestApp();

    const response = await app.request("/api/v1/training/step/complete/practice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courseId: "7b9e6c3a-321f-40de-ada8-11309951b181",
        dayOnCourseId: "cmlp7m13t004emr018jrl30af",
        stepIndex: 0,
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(updateStepAndDayMock).toHaveBeenCalledWith(
      "cmhf79vic0000qr4m219z780r",
      "cmlp7m13t004emr018jrl30af",
      0,
      { type: "complete" },
    );
  });

  it("does not issue a signed video URL when the user has no access to the CDN video", async () => {
    checkVideoAccessMock.mockResolvedValue(false);
    const app = createTestApp();

    const response = await app.request("/api/v1/training/video/url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoUrl: "https://storage.yandexcloud.net/gafus-media/uploads/trainers/trainer-1/videocourses/video-1/original.mp4",
      }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "FORBIDDEN",
    });
    expect(checkVideoAccessMock).toHaveBeenCalledWith({
      userId: "cmhf79vic0000qr4m219z780r",
      videoId: "video-1",
    });
    expect(generateTokenMock).not.toHaveBeenCalled();
  });

  it("rejects absolute HLS segment paths instead of reading arbitrary CDN keys", async () => {
    const app = createTestApp();

    const response = await app.request(
      "/api/v1/training/video/video-1/segment?path=%2Fuploads%2Fusers%2Fvictim%2Fpets%2Fdoc.pdf&token=signed-token",
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "INVALID_SEGMENT_PATH",
    });
    expect(downloadFileFromCDNMock).not.toHaveBeenCalled();
  });
});
