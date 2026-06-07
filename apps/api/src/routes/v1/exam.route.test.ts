import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requirePremiumOrRewardedAccessForUserStepMock, submitExamResultMock } = vi.hoisted(() => ({
  requirePremiumOrRewardedAccessForUserStepMock: vi.fn(),
  submitExamResultMock: vi.fn(),
}));

vi.mock("@gafus/core/services/exam", () => ({
  getExamResult: vi.fn(),
  submitExamResult: submitExamResultMock,
  uploadExamVideoFile: vi.fn(),
}));

vi.mock("@gafus/core/services/rewardedCredits", () => ({
  requirePremiumOrRewardedAccessForUserStep: requirePremiumOrRewardedAccessForUserStepMock,
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
import { examRoutes } from "./exam";

function createAuthenticatedTestApp() {
  const app = new Hono();
  app.use("/api/v1/exam/*", async (c, next) => {
    c.set("user", { id: "user-1", username: "student", role: "USER" });
    await next();
  });
  app.route("/api/v1/exam", examRoutes);
  return app;
}

describe("exam route contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePremiumOrRewardedAccessForUserStepMock.mockResolvedValue(undefined);
    submitExamResultMock.mockResolvedValue({ success: true, examResultId: "exam-1" });
  });

  it("accepts UUID step ids when submitting exam test answers", async () => {
    const app = createAuthenticatedTestApp();

    const response = await app.request(
      jsonRequest("/api/v1/exam/submit", "POST", {
        userStepId: "cmq3f664202mpka016rywnmzy",
        stepId: "e4d823a4-53f1-4ebc-bcca-bf9b77239ead",
        testAnswers: { q1: 1 },
        testScore: 1,
        testMaxScore: 1,
        overallScore: 100,
        isPassed: true,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: { success: true, examResultId: "exam-1" },
    });
    expect(submitExamResultMock).toHaveBeenCalledWith("user-1", {
      userStepId: "cmq3f664202mpka016rywnmzy",
      stepId: "e4d823a4-53f1-4ebc-bcca-bf9b77239ead",
      testAnswers: { q1: 1 },
      testScore: 1,
      testMaxScore: 1,
      overallScore: 100,
      isPassed: true,
    });
  });
});
