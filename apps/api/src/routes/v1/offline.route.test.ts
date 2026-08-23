import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  downloadFullCourse: vi.fn(),
  getAppSubscriptionAccess: vi.fn(),
  getTrainingDays: vi.fn(),
}));

vi.mock("@gafus/core/services/offline", () => ({
  checkCourseUpdates: vi.fn(),
  downloadFullCourse: mocks.downloadFullCourse,
  getCourseVersion: vi.fn(),
}));
vi.mock("@gafus/core/services/training", () => ({
  getTrainingDays: mocks.getTrainingDays,
}));
vi.mock("@gafus/core/services/appSubscription", () => ({
  getAppSubscriptionAccess: mocks.getAppSubscriptionAccess,
  isOfflineCourseDownloadIncludedPlanCode: (planCode: unknown) =>
    planCode === "MONTHLY" || planCode === "THREE_MONTHS",
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: vi.fn() }),
}));

import { offlineRoutes } from "./offline";

function createApp() {
  const app = new Hono();
  app.use("/api/v1/offline/*", async (c, next) => {
    c.set("user", { id: "user-1", username: "student", role: "USER" });
    await next();
  });
  app.route("/api/v1/offline", offlineRoutes);
  return app;
}

describe("offline course download access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTrainingDays.mockResolvedValue({ trainingDays: [] });
    mocks.downloadFullCourse.mockResolvedValue({ success: true, data: { course: {} } });
  });

  it("rejects a full-course download without an active subscription", async () => {
    mocks.getAppSubscriptionAccess.mockResolvedValue({ hasActiveSubscription: false });

    const response = await createApp().request("/api/v1/offline/course/download?courseType=basic");

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toMatchObject({ code: "SUBSCRIPTION_REQUIRED" });
    expect(mocks.getTrainingDays).not.toHaveBeenCalled();
    expect(mocks.downloadFullCourse).not.toHaveBeenCalled();
  });

  it("rejects a full-course download on the two-week plan", async () => {
    mocks.getAppSubscriptionAccess.mockResolvedValue({
      hasActiveSubscription: true,
      planCode: "TWO_WEEKS",
    });

    const response = await createApp().request("/api/v1/offline/course/download?courseType=basic");

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "OFFLINE_DOWNLOAD_NOT_INCLUDED",
    });
    expect(mocks.getTrainingDays).not.toHaveBeenCalled();
    expect(mocks.downloadFullCourse).not.toHaveBeenCalled();
  });

  it("downloads only after subscription and course access checks pass", async () => {
    mocks.getAppSubscriptionAccess.mockResolvedValue({
      hasActiveSubscription: true,
      planCode: "MONTHLY",
    });

    const response = await createApp().request("/api/v1/offline/course/download?courseType=basic");

    expect(response.status).toBe(200);
    expect(mocks.getTrainingDays).toHaveBeenCalledWith("user-1", "basic");
    expect(mocks.downloadFullCourse).toHaveBeenCalledWith("basic");
  });

  it("allows a full-course download on the three-month plan", async () => {
    mocks.getAppSubscriptionAccess.mockResolvedValue({
      hasActiveSubscription: true,
      planCode: "THREE_MONTHS",
    });

    const response = await createApp().request("/api/v1/offline/course/download?courseType=basic");

    expect(response.status).toBe(200);
    expect(mocks.downloadFullCourse).toHaveBeenCalledWith("basic");
  });
});
