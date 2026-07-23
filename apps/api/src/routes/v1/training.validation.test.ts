import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { trainingRoutes } from "./training";

const {
  checkCourseAccessByIdMock,
  checkVideoAccessMock,
  downloadFileFromCDNMock,
  extractVideoIdFromCdnUrlMock,
  generateTokenMock,
  getProgressMock,
  getSignedDownloadUrlMock,
  getAppFeatureFlagEnabledMock,
  getAppSubscriptionAccessMock,
  getTrainingDayWithMonetizedStepsMock,
  requirePremiumOrRewardedAccessForVideoUrlMock,
  requireCourseStepPremiumOrRewardedUnlockMock,
  saveProgressMock,
  streamFileFromCDNMock,
  updateStepAndDayMock,
  syncUserCourseStatusFromDaysMock,
  unlockCourseStepRewardedTargetMock,
  verifyTokenMock,
} = vi.hoisted(() => ({
  checkCourseAccessByIdMock: vi.fn(),
  checkVideoAccessMock: vi.fn(),
  downloadFileFromCDNMock: vi.fn(),
  extractVideoIdFromCdnUrlMock: vi.fn(),
  generateTokenMock: vi.fn(),
  getProgressMock: vi.fn(),
  getSignedDownloadUrlMock: vi.fn(),
  getAppFeatureFlagEnabledMock: vi.fn(),
  getAppSubscriptionAccessMock: vi.fn(),
  getTrainingDayWithMonetizedStepsMock: vi.fn(),
  requirePremiumOrRewardedAccessForVideoUrlMock: vi.fn(),
  requireCourseStepPremiumOrRewardedUnlockMock: vi.fn(),
  saveProgressMock: vi.fn(),
  streamFileFromCDNMock: vi.fn(),
  updateStepAndDayMock: vi.fn(),
  syncUserCourseStatusFromDaysMock: vi.fn(),
  unlockCourseStepRewardedTargetMock: vi.fn(),
  verifyTokenMock: vi.fn(),
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
  requirePremiumOrRewardedAccessForVideoUrl: requirePremiumOrRewardedAccessForVideoUrlMock,
  SubscriptionOrCreditsRequiredError: class SubscriptionOrCreditsRequiredError extends Error {
    constructor() {
      super("Для действия нужна подписка или rewarded credits");
      this.name = "SubscriptionOrCreditsRequiredError";
    }
  },
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
  getProgress: getProgressMock,
  getVideoManifestInfo: vi.fn(),
  saveProgress: saveProgressMock,
}));

vi.mock("@gafus/cdn-upload", () => ({
  downloadFileFromCDN: downloadFileFromCDNMock,
  extractVideoIdFromCdnUrl: extractVideoIdFromCdnUrlMock,
  getSignedDownloadUrl: getSignedDownloadUrlMock,
  streamFileFromCDN: streamFileFromCDNMock,
}));

vi.mock("@gafus/video-access", () => ({
  VIDEO_PLAYBACK_TOKEN_TTL_MINUTES: 720,
  getVideoAccessService: vi.fn(() => ({
    generateToken: generateTokenMock,
    verifyToken: verifyTokenMock,
  })),
}));

const { getVideoManifestInfo } = await import("@gafus/core/services/video");
const { invalidateVideoPlaybackAccessCache } = await import("./training");

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
    invalidateVideoPlaybackAccessCache();
    process.env.VIDEO_ACCESS_SECRET = "test-video-access-secret-that-is-long-enough";
    checkCourseAccessByIdMock.mockResolvedValue({ hasAccess: true });
    getAppFeatureFlagEnabledMock.mockResolvedValue(false);
    getAppSubscriptionAccessMock.mockResolvedValue({ hasActiveSubscription: true });
    getTrainingDayWithMonetizedStepsMock.mockResolvedValue({ trainingDayId: "day-1", steps: [] });
    requirePremiumOrRewardedAccessForVideoUrlMock.mockResolvedValue(null);
    requireCourseStepPremiumOrRewardedUnlockMock.mockResolvedValue(null);
    unlockCourseStepRewardedTargetMock.mockResolvedValue({
      targetType: "COURSE_STEP",
      targetId: "step-on-day-1",
      unlocked: true,
      spentCredits: 1,
      balance: 4,
      pendingRefundCredits: 0,
    });
    updateStepAndDayMock.mockResolvedValue({
      courseId: "7b9e6c3a-321f-40de-ada8-11309951b181",
      allCompleted: false,
      stepJustCompleted: true,
    });
    syncUserCourseStatusFromDaysMock.mockResolvedValue(undefined);
    vi.mocked(getVideoManifestInfo).mockResolvedValue({
      hlsManifestPath: "trainers/trainer-1/videocourses/video-1/hls/playlist.m3u8",
      thumbnailPath: null,
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
    getProgressMock.mockResolvedValue({ lastPositionSec: 42 });
    saveProgressMock.mockResolvedValue({ success: true });
    downloadFileFromCDNMock.mockResolvedValue(Buffer.from("segment"));
    streamFileFromCDNMock.mockResolvedValue({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("segment"));
          controller.close();
        },
      }),
      contentLength: 7,
      contentType: "video/mp2t",
      isPartialContent: false,
    });
    getSignedDownloadUrlMock.mockImplementation(
      async (path: string) => `https://storage.example/${path}`,
    );
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
        videoUrl:
          "https://storage.yandexcloud.net/gafus-media/uploads/trainers/trainer-1/videocourses/video-1/original.mp4",
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
    expect(requirePremiumOrRewardedAccessForVideoUrlMock).toHaveBeenCalledWith({
      userId: "cmhf79vic0000qr4m219z780r",
      platform: "ANDROID",
      videoUrl:
        "https://storage.yandexcloud.net/gafus-media/uploads/trainers/trainer-1/videocourses/video-1/original.mp4",
    });
    expect(generateTokenMock).not.toHaveBeenCalled();
  });

  it("returns the video id with a signed URL for progress synchronization", async () => {
    vi.mocked(getVideoManifestInfo).mockResolvedValueOnce({
      hlsManifestPath: "trainers/trainer-1/videocourses/video-1/hls/master.m3u8",
      thumbnailPath: "uploads/trainers/trainer-1/videocourses/video-1/hls/thumbnail.jpg",
      transcodingStatus: "COMPLETED",
      trainerId: "trainer-1",
    });
    const app = createTestApp();

    const response = await app.request("/api/v1/training/video/url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoUrl:
          "https://storage.yandexcloud.net/gafus-media/uploads/trainers/trainer-1/videocourses/video-1/original.mp4",
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        videoId: "video-1",
        url: expect.stringContaining("manifest.m3u8?token="),
        posterUrl: expect.stringContaining("thumbnail.jpg"),
      },
    });
  });

  it("выдаёт сегменты media playlist прямыми signed URL", async () => {
    downloadFileFromCDNMock.mockResolvedValueOnce(
      Buffer.from("#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\n720p-segment-001.ts\n"),
    );
    const app = createTestApp();

    const response = await app.request(
      "/api/v1/training/video/video-1/manifest.m3u8?token=signed-token",
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain(
      "https://storage.example/trainers/trainer-1/videocourses/video-1/hls/720p-segment-001.ts",
    );
    expect(getSignedDownloadUrlMock).toHaveBeenCalledWith(
      "trainers/trainer-1/videocourses/video-1/hls/720p-segment-001.ts",
      43_200,
    );
    expect(streamFileFromCDNMock).not.toHaveBeenCalled();
  });

  it("returns progress only after checking access to the video", async () => {
    const app = createTestApp();

    const response = await app.request("/api/v1/training/video/video-1/progress");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: { lastPositionSec: 42 },
    });
    expect(checkVideoAccessMock).toHaveBeenCalledWith({
      userId: "cmhf79vic0000qr4m219z780r",
      videoId: "video-1",
    });
    expect(getProgressMock).toHaveBeenCalledWith("cmhf79vic0000qr4m219z780r", "video-1");
  });

  it("saves validated video progress", async () => {
    const app = createTestApp();

    const response = await app.request("/api/v1/training/video/video-1/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positionSec: 73 }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(saveProgressMock).toHaveBeenCalledWith("cmhf79vic0000qr4m219z780r", "video-1", 73);
  });

  it("does not expose progress when video access is denied", async () => {
    checkVideoAccessMock.mockResolvedValue(false);
    const app = createTestApp();

    const response = await app.request("/api/v1/training/video/video-1/progress");

    expect(response.status).toBe(403);
    expect(getProgressMock).not.toHaveBeenCalled();
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
    expect(streamFileFromCDNMock).not.toHaveBeenCalled();
  });

  it("streams valid HLS segments instead of buffering them in API memory", async () => {
    const app = createTestApp();

    const response = await app.request(
      "/api/v1/training/video/video-1/segment?path=segment-001.ts&token=signed-token",
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("segment");
    expect(response.headers.get("content-length")).toBe("7");
    expect(streamFileFromCDNMock).toHaveBeenCalledWith(
      "trainers/trainer-1/videocourses/video-1/hls/segment-001.ts",
      undefined,
    );
    expect(downloadFileFromCDNMock).not.toHaveBeenCalled();
  });
});
