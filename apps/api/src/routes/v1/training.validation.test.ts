import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { trainingRoutes } from "./training";

const { updateStepAndDayMock, syncUserCourseStatusFromDaysMock } = vi.hoisted(() => ({
  updateStepAndDayMock: vi.fn(),
  syncUserCourseStatusFromDaysMock: vi.fn(),
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
  getVideoManifestInfo: vi.fn(),
}));

vi.mock("@gafus/cdn-upload", () => ({
  downloadFileFromCDN: vi.fn(),
  extractVideoIdFromCdnUrl: vi.fn(),
}));

vi.mock("@gafus/video-access", () => ({
  getVideoAccessService: vi.fn(),
}));

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
    updateStepAndDayMock.mockResolvedValue({
      courseId: "7b9e6c3a-321f-40de-ada8-11309951b181",
      allCompleted: false,
      stepJustCompleted: true,
    });
    syncUserCourseStatusFromDaysMock.mockResolvedValue(undefined);
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
});
