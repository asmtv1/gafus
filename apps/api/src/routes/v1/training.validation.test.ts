import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { trainingRoutes } from "./training";

const {
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
  requireCourseStepOperationAccessMock,
  saveProgressMock,
  streamFileFromCDNMock,
  updateStepAndDayMock,
  syncUserCourseStatusFromDaysMock,
  verifyTokenMock,
  logErrorMock,
  logInfoMock,
} = vi.hoisted(() => ({
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
  requireCourseStepOperationAccessMock: vi.fn(),
  saveProgressMock: vi.fn(),
  streamFileFromCDNMock: vi.fn(),
  updateStepAndDayMock: vi.fn(),
  syncUserCourseStatusFromDaysMock: vi.fn(),
  verifyTokenMock: vi.fn(),
  logErrorMock: vi.fn(),
  logInfoMock: vi.fn(),
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: logErrorMock, info: logInfoMock, warn: vi.fn() }),
}));

vi.mock("@gafus/core/services/training", () => ({
  getTrainingDays: vi.fn(),
  getTrainingDayWithMonetizedSteps: getTrainingDayWithMonetizedStepsMock,
  getTrainingDayWithUserSteps: vi.fn(),
  requireCourseStepOperationAccess: requireCourseStepOperationAccessMock,
  syncUserCourseStatusFromDays: syncUserCourseStatusFromDaysMock,
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
    getAppFeatureFlagEnabledMock.mockResolvedValue(false);
    getAppSubscriptionAccessMock.mockResolvedValue({ hasActiveSubscription: true });
    getTrainingDayWithMonetizedStepsMock.mockResolvedValue({ trainingDayId: "day-1", steps: [] });
    requirePremiumOrRewardedAccessForVideoUrlMock.mockResolvedValue(null);
    requireCourseStepOperationAccessMock.mockResolvedValue(null);
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

  it("preview signs only authorized ready thumbnail without issuing playback ticket", async () => {
    vi.mocked(getVideoManifestInfo).mockResolvedValueOnce({
      hlsManifestPath: "trainers/t/videocourses/video-1/hls/master.m3u8",
      thumbnailPath: "uploads/trainers/t/videocourses/video-1/hls/poster.jpg",
      transcodingStatus: "COMPLETED", trainerId: "trainer-1",
    });
    const original = "https://storage.yandexcloud.net/gafus-media/uploads/trainers/t/videocourses/video-1/original.mp4";
    const response = await createTestApp().request(
      "/api/v1/training/video/preview?videoUrl=" + encodeURIComponent(original));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
    await expect(response.json()).resolves.toEqual({
      success: true, data: { posterUrl:
        "https://storage.example/uploads/trainers/t/videocourses/video-1/hls/poster.jpg" },
    });
    expect(requirePremiumOrRewardedAccessForVideoUrlMock).toHaveBeenCalledWith({
      userId: "cmhf79vic0000qr4m219z780r", platform: "ANDROID", videoUrl: original,
    });
    expect(checkVideoAccessMock).toHaveBeenCalledWith({
      userId: "cmhf79vic0000qr4m219z780r", videoId: "video-1",
    });
    expect(getSignedDownloadUrlMock).toHaveBeenCalledWith(
      "uploads/trainers/t/videocourses/video-1/hls/poster.jpg", 300);
    expect(generateTokenMock).not.toHaveBeenCalled();
    expect(saveProgressMock).not.toHaveBeenCalled();
  });

  it("preview fails closed on revoked access before S3/CDN signing", async () => {
    checkVideoAccessMock.mockResolvedValue(false);
    const original = "https://storage.yandexcloud.net/gafus-media/uploads/trainers/t/videocourses/video-1/original.mp4";
    const response = await createTestApp().request(
      "/api/v1/training/video/preview?videoUrl=" + encodeURIComponent(original));
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(getSignedDownloadUrlMock).not.toHaveBeenCalled();
    expect(generateTokenMock).not.toHaveBeenCalled();
  });

  it("preview never signs absent or unprocessed thumbnails", async () => {
    const original = "https://storage.yandexcloud.net/gafus-media/uploads/trainers/t/videocourses/video-1/original.mp4";
    for (const state of ["PROCESSING", "COMPLETED"] as const) {
      invalidateVideoPlaybackAccessCache();
      vi.mocked(getVideoManifestInfo).mockResolvedValueOnce({
        hlsManifestPath: "trainers/t/videocourses/video-1/hls/master.m3u8",
        thumbnailPath: state === "COMPLETED" ? null : "uploads/private/poster.jpg",
        transcodingStatus: state, trainerId: "trainer-1",
      });
      const res = await createTestApp().request(
        "/api/v1/training/video/preview?videoUrl=" + encodeURIComponent(original));
      expect(res.status).toBe(404);
    }
    expect(getSignedDownloadUrlMock).not.toHaveBeenCalled();
  });

  it.each([
    "https://storage.yandexcloud.net.evil.test/gafus-media/uploads/trainers/t/videocourses/video-1/file.mp4",
    "https://storage.yandexcloud.net/otherbucket/uploads/trainers/t/videocourses/video-1/file.mp4",
    "https://example.com/uploads/trainers/t/videocourses/video-1/file.mp4",
    "https://storage.yandexcloud.net/gafus-media/uploads/trainers/t/videocourses/../../video-1/file.mp4",
    "javascript:alert(1)",
  ])("preview rejects spoofed/untrusted video source without DB lookup or signed URL: %s", async url => {
    const res = await createTestApp().request(
      "/api/v1/training/video/preview?videoUrl=" + encodeURIComponent(url));
    expect(res.status).toBe(400);
    expect(checkVideoAccessMock).not.toHaveBeenCalled();
    expect(getSignedDownloadUrlMock).not.toHaveBeenCalled();
    expect(requirePremiumOrRewardedAccessForVideoUrlMock).not.toHaveBeenCalled();
  });

  it("preview returns 402 for missing subscription without revealing private poster", async () => {
    requirePremiumOrRewardedAccessForVideoUrlMock.mockRejectedValueOnce(
      Object.assign(new Error("Subscription required"),
        { name: "SubscriptionOrCreditsRequiredError" }));
    const original = "https://storage.yandexcloud.net/gafus-media/uploads/trainers/t/videocourses/video-1/original.mp4";
    const response = await createTestApp().request(
      "/api/v1/training/video/preview?videoUrl=" + encodeURIComponent(original));
    expect(response.status).toBe(402);
    expect(getSignedDownloadUrlMock).not.toHaveBeenCalled();
    expect(checkVideoAccessMock).not.toHaveBeenCalled();
  });

  it("video URL unexpected access error never exposes signed request or provider secret", async () => {
    const canary = "SYNTHETIC_PRIVATE_VIDEO_SIGNED_QUERY_456";
    const videoUrl = `https://cdn.invalid/private/video?token=${canary}`;
    requirePremiumOrRewardedAccessForVideoUrlMock.mockRejectedValueOnce(new Error(canary));
    const response = await createTestApp().request("/api/v1/training/video/url", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ videoUrl }),
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false, error: "Внутренняя ошибка сервера", code: "INTERNAL_SERVER_ERROR",
    });
    expect(JSON.stringify(logErrorMock.mock.calls)).not.toContain(canary);
    expect(JSON.stringify(logInfoMock.mock.calls)).not.toContain(canary);
    expect(JSON.stringify(logErrorMock.mock.calls)).not.toContain(videoUrl);
  });

  it("video URL token generation 500 never reveals secret in response or logs", async () => {
    const canary = "SYNTHETIC_PRIVATE_GENERATE_TOKEN_EXCEPTION_789";
    generateTokenMock.mockImplementationOnce(() => { throw new Error(canary); });
    const response = await createTestApp().request("/api/v1/training/video/url", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        videoUrl:
          "https://storage.yandexcloud.net/gafus-media/uploads/trainers/t/video.mp4",
      }),
    });
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      success: false, error: "Ошибка генерации signed URL",
      code: "TOKEN_GENERATION_ERROR",
    });
    expect(JSON.stringify(body)).not.toContain(canary);
    expect(JSON.stringify(logErrorMock.mock.calls)).not.toContain(canary);
  });

  it("video URL passthrough retains response while not logging private query tokens", async () => {
    const canary = "SYNTHETIC_PRIVATE_VIDEO_QUERY_TOKEN_123";
    const videoUrl = `https://youtube.com/watch?v=demo&token=${canary}`;
    const response = await createTestApp().request("/api/v1/training/video/url", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ videoUrl }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true, data: { url: videoUrl },
    });
    expect(JSON.stringify(logInfoMock.mock.calls)).not.toContain(canary);
    expect(JSON.stringify(logErrorMock.mock.calls)).not.toContain(canary);
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

  it("local-only real HLS uses same-origin protected GET, never provider credentials", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("GAFUS_LOCAL_ISOLATED_API", "1");
    vi.stubEnv("GAFUS_ISOLATED_NONPROD_S3", "enabled");
    vi.stubEnv("GAFUS_LOCAL_LEGACY_VIDEO_READ_ONLY", "1");
    const raw = "https://storage.yandexcloud.net/gafus-media/uploads/trainers/trainer-1/videocourses/video-1/original.mp4";
    const playlist = "#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\nclip.ts\n";
    const fetcher = vi.fn(async (url: string) => new Response(
      url.endsWith(".m3u8") ? playlist : "segment-bytes", { status: 200 },
    ));
    vi.stubGlobal("fetch", fetcher);
    vi.mocked(getVideoManifestInfo).mockResolvedValue({
      hlsManifestPath: "trainers/trainer-1/videocourses/video-1/hls/master.m3u8",
      thumbnailPath: "uploads/trainers/trainer-1/videocourses/video-1/hls/thumbnail.jpg",
      transcodingStatus: "COMPLETED", trainerId: "trainer-1",
    });
    const app = createTestApp();
    const browserHeaders = { Host: "127.0.0.1:5173" };
    const ticket = await app.request("/api/v1/training/video/url", {
      method: "POST", headers: { ...browserHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ videoUrl: raw }),
    });
    expect(ticket.status).toBe(200);
    const signed = (await ticket.json()).data;
    expect(signed.url).toBe("/api/v1/training/video/video-1/manifest.m3u8?token=signed-token");
    expect(signed.posterUrl).toContain("https://storage.yandexcloud.net/gafus-media/uploads/");
    const manifest = await app.request(signed.url, { headers: browserHeaders });
    expect(manifest.status).toBe(200);
    expect(manifest.headers.get("content-type")).toBe("application/vnd.apple.mpegurl");
    const segment = "/api/v1/training/video/video-1/segment?path=clip.ts&token=signed-token";
    expect(await manifest.text()).toContain(segment);
    const content = await app.request(segment, { headers: browserHeaders });
    expect(content.status).toBe(200);
    expect(await content.text()).toBe("segment-bytes");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(getSignedDownloadUrlMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
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

  describe("mounted video progress private exception boundary", () => {
    const path = "/api/v1/training/video/video-1/progress";
    const canary = "SYNTHETIC_PRIVATE_VIDEO_PROGRESS_PROVIDER_TOKEN_20261021";
    const get = () => createTestApp().request(path);
    const post = (payload: object) => createTestApp().request(path, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const log = () => logErrorMock.mock.calls.flat().map((arg: unknown) =>
      arg instanceof Error ? [arg.message, arg.stack, String(arg.cause)].join(" ")
        : JSON.stringify(arg)
    ).join(" ");

    it.each(["GET", "POST"])("%s Core 500 never forwards raw error/stack to logger", async (method) => {
      const error = new Error(canary);
      error.stack = "PRIVATE_PROGRESS_PROVIDER_STACK_NEVER_LOG";
      if (method === "GET") getProgressMock.mockRejectedValueOnce(error);
      else saveProgressMock.mockRejectedValueOnce(error);
      const r = method === "GET" ? await get() : await post({ positionSec: 45 });
      expect(r.status).toBe(500);
      expect(await r.json()).toEqual({ success: false, error: "Внутренняя ошибка сервера" });
      expect(logErrorMock).toHaveBeenCalledTimes(1);
      expect(log()).not.toContain(canary);
      expect(log()).not.toContain("PRIVATE_PROGRESS_PROVIDER_STACK_NEVER_LOG");
    });

    it("GET success preserves video-scoped DTO", async () => {
      getProgressMock.mockResolvedValueOnce({ lastPositionSec: 45 });
      const r = await get();
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ success: true, data: { lastPositionSec: 45 } });
      expect(getProgressMock).toHaveBeenCalledExactlyOnceWith(
        "cmhf79vic0000qr4m219z780r", "video-1",
      );
      expect(logErrorMock).not.toHaveBeenCalled();
    });
    it("POST success preserves video-scoped write", async () => {
      const r = await post({ positionSec: 45 });
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ success: true });
      expect(saveProgressMock).toHaveBeenCalledExactlyOnceWith(
        "cmhf79vic0000qr4m219z780r", "video-1", 45,
      );
      expect(logErrorMock).not.toHaveBeenCalled();
    });
    it("POST typed business refusal stays 400", async () => {
      saveProgressMock.mockResolvedValueOnce({ success: false, error: "Отказано" });
      const r = await post({ positionSec: 45 });
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ success: false, error: "Отказано" });
      expect(logErrorMock).not.toHaveBeenCalled();
    });
    it.each(["GET", "POST"])("%s revoked video access stays 403 without read/write", async method => {
      checkVideoAccessMock.mockResolvedValue(false);
      const r = method === "GET" ? await get() : await post({ positionSec: 45 });
      expect(r.status).toBe(403);
      expect(await r.json()).toEqual({
        success: false, error: "Недостаточно прав для просмотра видео", code: "FORBIDDEN",
      });
      expect(getProgressMock).not.toHaveBeenCalled();
      expect(saveProgressMock).not.toHaveBeenCalled();
      expect(logErrorMock).not.toHaveBeenCalled();
    });
    it("POST malformed position rejected at validation before storage", async () => {
      const r = await post({ positionSec: -10 });
      expect(r.status).toBe(400);
      expect(saveProgressMock).not.toHaveBeenCalled();
      expect(logErrorMock).not.toHaveBeenCalled();
    });
  });

  it("revokes cached video playback immediately when subscription expires", async () => {
    const app = createTestApp();
    const first = await app.request("/api/v1/training/video/video-1/progress");
    expect(first.status).toBe(200);
    checkVideoAccessMock.mockResolvedValue(false);
    const second = await app.request("/api/v1/training/video/video-1/progress");
    expect(second.status).toBe(403);
    expect(checkVideoAccessMock).toHaveBeenCalledTimes(2);
    expect(getProgressMock).toHaveBeenCalledTimes(1);
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


  it("does not leak provider exception details in HLS manifest 500 JSON", async () => {
    const secret = "PRIVATE_ORIGIN_PATH_AND_SIGNED_CREDENTIAL_123";
    downloadFileFromCDNMock.mockRejectedValueOnce(new Error(secret));
    const response = await createTestApp().request(
      "/api/v1/training/video/video-1/manifest.m3u8?token=signed-token",
    );
    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload).toEqual({
      success: false,
      error: "Ошибка получения манифеста",
      code: "INTERNAL_SERVER_ERROR",
    });
    expect(JSON.stringify(payload)).not.toContain(secret);
    expect(JSON.stringify(logErrorMock.mock.calls)).not.toContain(secret);
    expect(JSON.stringify(logErrorMock.mock.calls)).not.toContain(secret);
  });

  it("does not leak provider exception details in HLS segment 500 JSON", async () => {
    const secret = "PRIVATE_BUCKET_INTERNAL_TOKEN_AND_USER_REFERENCE_456";
    streamFileFromCDNMock.mockRejectedValueOnce(new Error(secret));
    const response = await createTestApp().request(
      "/api/v1/training/video/video-1/segment?path=segment-001.ts&token=signed-token",
    );
    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload).toEqual({
      success: false,
      error: "Ошибка получения сегмента",
      code: "INTERNAL_SERVER_ERROR",
    });
    expect(JSON.stringify(payload)).not.toContain(secret);
  });


  it("does not include raw HLS playlist metadata in server info logs", async () => {
    const privateContent = "PRIVATE_MANIFEST_METADATA_SIGNED_REFERENCE_789";
    downloadFileFromCDNMock.mockResolvedValueOnce(Buffer.from(
      `#EXTM3U\n#EXT-X-TARGETDURATION:4\n#${privateContent}\n#EXTINF:4,\nsegment-001.ts\n`,
    ));
    const response = await createTestApp().request(
      "/api/v1/training/video/video-1/manifest.m3u8?token=signed-token",
    );
    expect(response.status).toBe(200);
    expect(JSON.stringify(logInfoMock.mock.calls)).not.toContain(privateContent);
  });


  it.each([
    ["manifest.m3u8", ""],
    ["segment", "?path=segment-001.ts"],
  ])("denies unsigned HLS %s without fetching media", async (suffix, query) => {
    const response = await createTestApp().request(
      `/api/v1/training/video/video-1/${suffix}${query}`,
    );
    expect(response.status).toBe(401);
    expect(verifyTokenMock).not.toHaveBeenCalled();
    expect(downloadFileFromCDNMock).not.toHaveBeenCalled();
    expect(streamFileFromCDNMock).not.toHaveBeenCalled();
  });

  it.each([
    ["manifest.m3u8", ""],
    ["segment", "&path=segment-001.ts"],
  ])("denies forged token for HLS %s before media fetch", async (suffix, query) => {
    verifyTokenMock.mockReturnValueOnce(null);
    const response = await createTestApp().request(
      `/api/v1/training/video/video-1/${suffix}?token=forged${query}`,
    );
    expect(response.status).toBe(403);
    expect(verifyTokenMock).toHaveBeenCalledWith("forged");
    expect(downloadFileFromCDNMock).not.toHaveBeenCalled();
    expect(streamFileFromCDNMock).not.toHaveBeenCalled();
  });

  it.each([
    ["manifest.m3u8", ""],
    ["segment", "&path=segment-001.ts"],
  ])("denies video-id mismatch for signed HLS %s", async (suffix, query) => {
    verifyTokenMock.mockReturnValueOnce({
      videoId: "video-OTHER",
      userId: "cmhf79vic0000qr4m219z780r",
      expiresAt: Date.now() + 60_000,
    });
    const response = await createTestApp().request(
      `/api/v1/training/video/video-1/${suffix}?token=signed-token${query}`,
    );
    expect(response.status).toBe(403);
    expect(checkVideoAccessMock).not.toHaveBeenCalled();
    expect(downloadFileFromCDNMock).not.toHaveBeenCalled();
    expect(streamFileFromCDNMock).not.toHaveBeenCalled();
  });

  it.each([
    ["manifest.m3u8", ""],
    ["segment", "&path=segment-001.ts"],
  ])("denies revoked entitlement for HLS %s", async (suffix, query) => {
    checkVideoAccessMock.mockResolvedValue(false);
    const response = await createTestApp().request(
      `/api/v1/training/video/video-1/${suffix}?token=signed-token${query}`,
    );
    expect(response.status).toBe(403);
    expect(checkVideoAccessMock).toHaveBeenCalledWith({
      userId: "cmhf79vic0000qr4m219z780r", videoId: "video-1",
    });
    expect(downloadFileFromCDNMock).not.toHaveBeenCalled();
    expect(streamFileFromCDNMock).not.toHaveBeenCalled();
  });

});
