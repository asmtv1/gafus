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
          bundleStepId: "bundle-occurrence-1",
          stepId: "step-1",
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

  it("GET /today delegates only authenticated user.id and preserves published response + private headers", async () => {
    const app = createAuthenticatedTestApp();
    const today = {
      mskDate: "2026-06-01",
      scheduleId: "schedule-1",
      userStatus: "IN_PROGRESS",
      day: {
        id: "bundle-1",
        title: "Курс дня",
        description: "Описание",
        type: "daily_course",
        estimatedDuration: 12,
        theoryMinutes: 3,
        stepsCount: 2,
      },
      stepsSummary: { total: 2, completed: 1 },
    };
    getTodayDailyCourseMock.mockResolvedValue(today);

    const response = await app.request("/api/v1/daily-course/today");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, data: today });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(getTodayDailyCourseMock).toHaveBeenCalledExactlyOnceWith("user-1");
    expect(getDailyCourseDayWithUserStepsMock).not.toHaveBeenCalled();
    expect(updateDailyCourseStepAndDayMock).not.toHaveBeenCalled();
  });

  it("GET /today keeps Core empty schedule result as 200, without creating a training", async () => {
    const app = createAuthenticatedTestApp();
    const empty = {
      mskDate: "2026-06-01",
      scheduleId: null,
      day: null,
      userStatus: "NOT_STARTED",
      stepsSummary: { total: 0, completed: 0 },
    };
    getTodayDailyCourseMock.mockResolvedValue(empty);

    const response = await app.request("/api/v1/daily-course/today");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, data: empty });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(getTodayDailyCourseMock).toHaveBeenCalledExactlyOnceWith("user-1");
    expect(getDailyCourseDayWithUserStepsMock).not.toHaveBeenCalled();
    expect(updateDailyCourseStepAndDayMock).not.toHaveBeenCalled();
  });

  it("GET /today preserves original 404 mapping and unknown 500 masking with private headers", async () => {
    const app = createAuthenticatedTestApp();
    for (const [failure, status, body] of [
      [
        new Error("SCHEDULE_NOT_FOUND"),
        404,
        { success: false, error: "Курс дня не найден", code: "NOT_FOUND" },
      ],
      [
        new Error("synthetic-sensitive-internal"),
        500,
        { success: false, error: "Внутренняя ошибка сервера" },
      ],
    ] as const) {
      getTodayDailyCourseMock.mockRejectedValueOnce(failure);
      const response = await app.request("/api/v1/daily-course/today");
      expect(response.status).toBe(status);
      await expect(response.json()).resolves.toEqual(body);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    }
    expect(getTodayDailyCourseMock).toHaveBeenCalledTimes(2);
    expect(getTodayDailyCourseMock).toHaveBeenNthCalledWith(1, "user-1");
    expect(getTodayDailyCourseMock).toHaveBeenNthCalledWith(2, "user-1");
    expect(getDailyCourseDayWithUserStepsMock).not.toHaveBeenCalled();
    expect(updateDailyCourseStepAndDayMock).not.toHaveBeenCalled();
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
      createIfMissing: false,
    });
  });

  it("RO08 GET /day with no flag is read-only by default", async () => {
    const app = createAuthenticatedTestApp();
    const response = await app.request("/api/v1/daily-course/day?scheduleId=schedule-1");
    expect(response.status).toBe(200);
    expect(getDailyCourseDayWithUserStepsMock).toHaveBeenCalledWith("user-1", "schedule-1", {
      createIfMissing: false,
    });
  });

  it("RO09 explicit createIfMissing=true retains legacy initialization intent", async () => {
    const app = createAuthenticatedTestApp();
    const response = await app.request(
      "/api/v1/daily-course/day?scheduleId=schedule-1&createIfMissing=true",
      { headers: { Cookie: "gafus_access=synthetic-cookie", Origin: "https://gafus.ru" } },
    );
    expect(response.status).toBe(200);
    expect(getDailyCourseDayWithUserStepsMock).toHaveBeenCalledWith("user-1", "schedule-1", {
      createIfMissing: true,
    });
  });

  it("RO10 explicit createIfMissing=false preserves opt-in read-only caller", async () => {
    const app = createAuthenticatedTestApp();
    const response = await app.request(
      "/api/v1/daily-course/day?scheduleId=schedule-1&createIfMissing=false",
    );
    expect(response.status).toBe(200);
    expect(getDailyCourseDayWithUserStepsMock).toHaveBeenCalledWith("user-1", "schedule-1", {
      createIfMissing: false,
    });
  });

  it("GET /day without a matching day preserves 404 NOT_FOUND and no-store", async () => {
    const app = createAuthenticatedTestApp();
    getDailyCourseDayWithUserStepsMock.mockResolvedValueOnce(null);
    const response = await app.request("/api/v1/daily-course/day?scheduleId=schedule-1");
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Курс дня не найден",
      code: "NOT_FOUND",
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(getDailyCourseDayWithUserStepsMock).toHaveBeenCalledExactlyOnceWith(
      "user-1",
      "schedule-1",
      { createIfMissing: false },
    );
    expect(updateDailyCourseStepAndDayMock).not.toHaveBeenCalled();
  });

  it.each([undefined, "https://untrusted.example"])(
    "GET /day?createIfMissing=true with untrusted Origin %s stays 403 before Core",
    async (origin) => {
      const app = createAuthenticatedTestApp();
      const headers: Record<string, string> = { Cookie: "gafus_access=synthetic-cookie" };
      if (origin) headers.Origin = origin;
      const response = await app.request(
        "/api/v1/daily-course/day?scheduleId=schedule-1&createIfMissing=true",
        { headers },
      );
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        success: false,
        error: "Недоверенный Origin",
      });
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(getDailyCourseDayWithUserStepsMock).not.toHaveBeenCalled();
      expect(updateDailyCourseStepAndDayMock).not.toHaveBeenCalled();
    },
  );

  it("GET /day?createIfMissing=true with Bearer preserves explicit legacy opt-in", async () => {
    const app = createAuthenticatedTestApp();
    const response = await app.request(
      "/api/v1/daily-course/day?scheduleId=schedule-1&createIfMissing=true",
      { headers: { Authorization: "Bearer synthetic-token" } },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(getDailyCourseDayWithUserStepsMock).toHaveBeenCalledExactlyOnceWith(
      "user-1",
      "schedule-1",
      { createIfMissing: true },
    );
    expect(updateDailyCourseStepAndDayMock).not.toHaveBeenCalled();
  });

  it("GET /day preserves mapped Core failure and masks unexpected errors", async () => {
    const app = createAuthenticatedTestApp();
    for (const [error, status, body] of [
      [
        new Error("SCHEDULE_NOT_FOUND"),
        404,
        { success: false, error: "Курс дня не найден", code: "NOT_FOUND" },
      ],
      [
        new Error("synthetic-sensitive-core-error"),
        500,
        { success: false, error: "Внутренняя ошибка сервера" },
      ],
    ] as const) {
      getDailyCourseDayWithUserStepsMock.mockRejectedValueOnce(error);
      const response = await app.request("/api/v1/daily-course/day?scheduleId=schedule-1");
      expect(response.status).toBe(status);
      await expect(response.json()).resolves.toEqual(body);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    }
    expect(getDailyCourseDayWithUserStepsMock.mock.calls).toEqual([
      ["user-1", "schedule-1", { createIfMissing: false }],
      ["user-1", "schedule-1", { createIfMissing: false }],
    ]);
    expect(updateDailyCourseStepAndDayMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      "start",
      { scheduleId: "schedule-1", stepIndex: 3, durationSec: 90, status: "IN_PROGRESS" },
      { type: "start", remainingSec: 90 },
    ],
    [
      "pause",
      { scheduleId: "schedule-1", stepIndex: 3, timeLeftSec: 47 },
      { type: "pause", remainingSec: 47 },
    ],
    ["resume", { scheduleId: "schedule-1", stepIndex: 3 }, { type: "resume" }],
    ["reset", { scheduleId: "schedule-1", stepIndex: 3 }, { type: "reset" }],
    ["complete", { scheduleId: "schedule-1", stepIndex: 3 }, { type: "complete" }],
  ] as const)(
    "POST /step/%s forwards original actor/schedule/index/operation with success JSON",
    async (name, payload, operation) => {
      const app = createAuthenticatedTestApp();
      const response = await app.request(
        jsonRequest(`/api/v1/daily-course/step/${name}`, "POST", payload),
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ success: true });
      expect(updateDailyCourseStepAndDayMock).toHaveBeenCalledExactlyOnceWith(
        "user-1",
        "schedule-1",
        3,
        operation,
      );
      expect(getDailyCourseDayWithUserStepsMock).not.toHaveBeenCalled();
      expect(getTodayDailyCourseMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["start", { scheduleId: "schedule-1", stepIndex: 0, durationSec: -1 }],
    ["pause", { scheduleId: "schedule-1", stepIndex: 0, timeLeftSec: -1 }],
    ["resume", { scheduleId: "schedule-1", stepIndex: -1 }],
    ["reset", { scheduleId: "", stepIndex: 0 }],
    ["complete", { scheduleId: "schedule-1", stepIndex: 0.5 }],
  ] as const)("POST /step/%s Zod invalid payload fails before Core", async (name, payload) => {
    const app = createAuthenticatedTestApp();
    const response = await app.request(
      jsonRequest(`/api/v1/daily-course/step/${name}`, "POST", payload),
    );
    expect(response.status).toBe(400);
    expect(updateDailyCourseStepAndDayMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      "start",
      "SCHEDULE_NOT_FOUND",
      404,
      { success: false, error: "Курс дня не найден", code: "NOT_FOUND" },
    ],
    ["pause", "STEP_NOT_FOUND", 404, { success: false, error: "Шаг не найден", code: "NOT_FOUND" }],
    [
      "resume",
      "INVALID_STATE:synthetic",
      409,
      { success: false, error: "Недопустимое состояние шага", code: "INVALID_STATE" },
    ],
    [
      "reset",
      "INVALID_TIMER",
      400,
      { success: false, error: "Недопустимое значение таймера", code: "INVALID_TIMER" },
    ],
    [
      "complete",
      "synthetic-secret-error",
      500,
      { success: false, error: "Внутренняя ошибка сервера" },
    ],
  ] as const)(
    "POST /step/%s keeps Core %s mapping and original masking",
    async (name, message, status, body) => {
      const app = createAuthenticatedTestApp();
      updateDailyCourseStepAndDayMock.mockRejectedValueOnce(new Error(message));
      const payload =
        name === "start"
          ? { scheduleId: "schedule-1", stepIndex: 0, durationSec: 10 }
          : name === "pause"
            ? { scheduleId: "schedule-1", stepIndex: 0, timeLeftSec: 5 }
            : { scheduleId: "schedule-1", stepIndex: 0 };
      const response = await app.request(
        jsonRequest(`/api/v1/daily-course/step/${name}`, "POST", payload),
      );
      expect(response.status).toBe(status);
      await expect(response.json()).resolves.toEqual(body);
      expect(updateDailyCourseStepAndDayMock).toHaveBeenCalledOnce();
      expect(getDailyCourseDayWithUserStepsMock).not.toHaveBeenCalled();
    },
  );

  it("negotiated daily GET exposes stable occurrence without changing legacy GET", async () => {
    const app = createAuthenticatedTestApp();
    const oldResult = await app.request("/api/v1/daily-course/day?scheduleId=schedule-1");
    expect(oldResult.status).toBe(200);
    const oldBody = await oldResult.json();
    expect(oldBody.data).not.toHaveProperty("onlineStepBinding");
    expect(oldBody.data.steps[0]).not.toHaveProperty("bundleStepId");
    expect(oldBody.data.steps[0]).not.toHaveProperty("timerSnapshot");
    expect(oldBody.data).not.toHaveProperty("serverNow");

    const boundResult = await app.request("/api/v1/daily-course/day?scheduleId=schedule-1", {
      headers: { "X-Gafus-Web-Daily-Binding": "1" },
    });
    expect(boundResult.status).toBe(200);
    const boundBody = await boundResult.json();
    expect(boundBody.data.onlineStepBinding).toBe("BUNDLE_STEP_ID_V1");
    expect(boundBody.data.steps[0].bundleStepId).toBe("bundle-occurrence-1");
    expect(boundBody.data.steps[0].stepId).toBe("step-1");
  });

  it.each(["start", "pause", "resume", "reset", "complete"] as const)(
    "Web bound daily %s forwards immutable occurrence pair with legacy index",
    async (name) => {
      const app = createAuthenticatedTestApp();
      const payload = {
        scheduleId: "schedule-1",
        stepIndex: 18,
        expectedBundleStepId: "bundle-occurrence-1",
        expectedStepId: "step-1",
        ...(name === "start" ? { durationSec: 60 } : {}),
        ...(name === "pause" ? { timeLeftSec: 20 } : {}),
      };
      const res = await app.request(
        jsonRequest("/api/v1/daily-course/step/" + name, "POST", payload),
      );
      expect(res.status).toBe(200);
      expect(updateDailyCourseStepAndDayMock).toHaveBeenCalledExactlyOnceWith(
        "user-1",
        "schedule-1",
        18,
        name === "start"
          ? { type: "start", remainingSec: 60 }
          : name === "pause"
            ? { type: "pause", remainingSec: 20 }
            : { type: name },
        { expectedBundleStepId: "bundle-occurrence-1", expectedStepId: "step-1" },
      );
    },
  );

  it("Web daily mutations refuse absent/partial binding before touching Core", async () => {
    const app = createAuthenticatedTestApp();
    for (const suffix of [
      {},
      { expectedBundleStepId: "bundle-occurrence-1" },
      { expectedStepId: "step-1" },
    ]) {
      const res = await app.request("/api/v1/daily-course/step/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Gafus-Web-Daily-Binding": "1" },
        body: JSON.stringify({
          scheduleId: "schedule-1",
          stepIndex: 0,
          durationSec: 55,
          ...suffix,
        }),
      });
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toMatchObject({ code: "INVALID_STEP_BINDING" });
    }
    expect(updateDailyCourseStepAndDayMock).not.toHaveBeenCalled();
  });

  it("stale daily occurrence maps to 409 with no success ACK", async () => {
    updateDailyCourseStepAndDayMock.mockRejectedValueOnce(new Error("STALE_DAILY_STEP_BINDING"));
    const app = createAuthenticatedTestApp();
    const res = await app.request(
      jsonRequest("/api/v1/daily-course/step/complete", "POST", {
        scheduleId: "schedule-1",
        stepIndex: 0,
        expectedBundleStepId: "old-occurrence",
        expectedStepId: "step-1",
      }),
    );
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ code: "STALE_STEP_BINDING" });
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
