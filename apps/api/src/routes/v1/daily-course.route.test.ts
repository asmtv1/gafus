import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getDailyCourseDayWithUserStepsMock,
  getTodayDailyCourseMock,
  updateDailyCourseStepAndDayMock,
} = vi.hoisted(() => ({
  getDailyCourseDayWithUserStepsMock: vi.fn(),
  getTodayDailyCourseMock: vi.fn(),
  updateDailyCourseStepAndDayMock: vi.fn(),
}));

vi.mock("@gafus/core/services/dailyCourse", () => ({
  getDailyCourseDayWithUserSteps: getDailyCourseDayWithUserStepsMock,
  getTodayDailyCourse: getTodayDailyCourseMock,
  updateDailyCourseStepAndDay: updateDailyCourseStepAndDayMock,
}));

vi.mock("@gafus/core/services/rewardedCredits", () => ({
  SubscriptionOrCreditsRequiredError: class SubscriptionOrCreditsRequiredError extends Error {
    constructor() {
      super("Для действия нужна подписка или rewarded credits");
      this.name = "SubscriptionOrCreditsRequiredError";
    }
  },
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

import { jsonRequest } from "../../test/route-test-utils";
import { dailyCourseRoutes } from "./daily-course";

function createAuthenticatedTestApp() {
  const app = new Hono();
  app.use("/api/v1/daily-course/*", async (c, next) => {
    c.set("user", { id: "user-1", username: "student", role: "USER" });
    await next();
  });
  app.route("/api/v1/daily-course", dailyCourseRoutes);
  return app;
}

describe("daily course route contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDailyCourseDayWithUserStepsMock.mockResolvedValue({
      scheduleId: "schedule-1",
      mskDate: "2026-06-01",
      trainingDayId: "bundle-1",
      bundleId: "bundle-1",
      title: "Курс дня",
      description: "Открытое описание",
      type: "daily_course",
      userStatus: "NOT_STARTED",
      steps: [
        {
          id: "daily-user-step-1",
          stepId: "bundle-step-1",
          stepIndex: 0,
          status: "NOT_STARTED",
          remainingSec: null,
          completedAt: null,
          isPausedOnServer: false,
          step: {
            id: "step-1",
            title: "Упражнение",
            description: "Полный текст упражнения",
            type: "TRAINING",
            durationSec: 60,
            estimatedDurationSec: 60,
            videoUrl: "https://cdn.example/video.m3u8",
            imageUrls: ["https://cdn.example/image.jpg"],
            pdfUrls: ["https://cdn.example/file.pdf"],
            checklist: [{ id: "q1", question: "Сделано?", type: "boolean" }],
            requiresVideoReport: false,
            requiresWrittenFeedback: false,
            hasTestQuestions: false,
            surveySlug: null,
            order: 1,
          },
        },
      ],
    });
    updateDailyCourseStepAndDayMock.mockResolvedValue({
      allCompleted: false,
      stepJustCompleted: false,
    });
  });

  it("returns full daily course step content without subscription gating", async () => {
    const app = createAuthenticatedTestApp();

    const response = await app.request(
      "/api/v1/daily-course/day?scheduleId=schedule-1&platform=IOS",
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      success: true,
      data: {
        steps: [
          {
            step: {
              description: "Полный текст упражнения",
              videoUrl: "https://cdn.example/video.m3u8",
              imageUrls: ["https://cdn.example/image.jpg"],
              pdfUrls: ["https://cdn.example/file.pdf"],
              checklist: [{ id: "q1", question: "Сделано?", type: "boolean" }],
            },
          },
        ],
      },
    });
    expect(body.data.steps[0]).not.toHaveProperty("locked");
    expect(getDailyCourseDayWithUserStepsMock).toHaveBeenCalledWith("user-1", "schedule-1", {
      createIfMissing: true,
    });
  });

  it("starts a daily course step without checking subscription or rewarded unlock", async () => {
    const app = createAuthenticatedTestApp();

    const response = await app.request(
      jsonRequest("/api/v1/daily-course/step/start", "POST", {
        scheduleId: "schedule-1",
        stepIndex: 0,
        durationSec: 60,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(updateDailyCourseStepAndDayMock).toHaveBeenCalledWith("user-1", "schedule-1", 0, {
      type: "start",
      remainingSec: 60,
    });
  });
});
