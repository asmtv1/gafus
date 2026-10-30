/** AG1-001/LEARN032: existing GET exam/result delegates ONLY after Hono entitlement. */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  readResult: vi.fn(),
  entitlement: vi.fn(),
  submit: vi.fn(() => {
    throw new Error("POST_EXAM_MUST_NOT_RUN");
  }),
  upload: vi.fn(() => {
    throw new Error("UPLOAD_EXAM_MUST_NOT_RUN");
  }),
  log: vi.fn(),
}));

vi.mock("@gafus/core/services/exam", () => ({
  getExamResult: m.readResult,
  submitExamResult: m.submit,
  uploadExamVideoFile: m.upload,
}));
vi.mock("@gafus/core/services/rewardedCredits", () => ({
  requirePremiumOrRewardedAccessForUserStep: m.entitlement,
  SubscriptionOrCreditsRequiredError: class SubscriptionOrCreditsRequiredError extends Error {
    constructor() {
      super("subscription required");
      this.name = "SubscriptionOrCreditsRequiredError";
    }
  },
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: m.log }),
}));

import { examRoutes } from "./exam";

const userStepId = "cmq3f664202mpka016rywnmzy";
const reqPath = `/api/v1/exam/result?userStepId=${userStepId}`;
function createApp() {
  const app = new Hono();
  app.use("/api/v1/exam/*", async (c, next) => {
    c.set("user", {
      id: c.req.header("x-actor") ?? "fictional-A",
      username: "student",
      role: "USER",
    });
    await next();
  });
  app.route("/api/v1/exam", examRoutes);
  return app;
}
function response(path = reqPath, headers?: Record<string, string>) {
  return createApp().request(path, { headers });
}
function privateHeader(r: Response) {
  expect(r.headers.get("Cache-Control")).toBe("private, no-store");
}

describe("GET /exam/result original Hono entitlement -> typed Core-read application", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.entitlement.mockResolvedValue(undefined);
    m.readResult.mockResolvedValue(null);
  });

  it("invalid CUID gives 400 before entitlement, read or any writes", async () => {
    const res = await response("/api/v1/exam/result?userStepId=bad-id");
    expect(res.status).toBe(400);
    privateHeader(res);
    expect(m.entitlement).not.toHaveBeenCalled();
    expect(m.readResult).not.toHaveBeenCalled();
    expect(m.submit).not.toHaveBeenCalled();
    expect(m.upload).not.toHaveBeenCalled();
  });

  it("existing 402 gate rejection leaves read port uncalled and preserves 402 JSON", async () => {
    const denial = Object.assign(new Error("subscription required"), {
      name: "SubscriptionOrCreditsRequiredError",
    });
    m.entitlement.mockRejectedValueOnce(denial);
    const res = await response(reqPath, { "x-rewarded-platform": "IOS" });
    expect(res.status).toBe(402);
    privateHeader(res);
    expect(await res.json()).toEqual({
      success: false,
      error: "Для действия нужна подписка или доступ к шагу за просмотр рекламы",
      code: "SUBSCRIPTION_OR_CREDITS_REQUIRED",
    });
    expect(m.entitlement).toHaveBeenCalledExactlyOnceWith({
      userId: "fictional-A",
      platform: "IOS",
      userStepId,
    });
    expect(m.readResult).not.toHaveBeenCalled();
    expect(m.submit).not.toHaveBeenCalled();
    expect(m.upload).not.toHaveBeenCalled();
  });

  it("entitled missing result passes through null to existing 404 payload", async () => {
    const res = await response();
    expect(res.status).toBe(404);
    privateHeader(res);
    expect(await res.json()).toEqual({
      success: false,
      error: "Шаг не найден или нет доступа",
      code: "NOT_FOUND",
    });
    expect(m.entitlement).toHaveBeenCalledExactlyOnceWith({
      userId: "fictional-A",
      platform: "ANDROID",
      userStepId,
    });
    expect(m.readResult).toHaveBeenCalledExactlyOnceWith("fictional-A", userStepId);
    expect(m.entitlement.mock.invocationCallOrder[0]).toBeLessThan(
      m.readResult.mock.invocationCallOrder[0]!,
    );
  });

  it("entitled result forwards exact Core projection and principal without modifying JSON", async () => {
    const output = {
      id: "fictional-exam-result",
      overallScore: 82,
      isPassed: true,
      testAnswers: { questionOne: 2 },
      submittedAt: "2026-10-24T08:15:00.000Z",
    };
    m.readResult.mockResolvedValue(output);
    const res = await response(reqPath, { "x-actor": "fictional-B", "x-platform": "IOS" });
    expect(res.status).toBe(200);
    privateHeader(res);
    expect(await res.json()).toEqual({ success: true, data: output });
    expect(m.entitlement).toHaveBeenCalledExactlyOnceWith({
      userId: "fictional-B",
      platform: "IOS",
      userStepId,
    });
    expect(m.readResult).toHaveBeenCalledExactlyOnceWith("fictional-B", userStepId);
    expect(m.entitlement.mock.invocationCallOrder[0]).toBeLessThan(
      m.readResult.mock.invocationCallOrder[0]!,
    );
    expect(m.submit).not.toHaveBeenCalled();
    expect(m.upload).not.toHaveBeenCalled();
  });

  it("Core-read failure keeps existing fixed 500 and private no-store without leaking response", async () => {
    const secret = "PRIVATE_SQL_EXAM_RESULT_AND_USERSTEP_TOKEN";
    m.readResult.mockRejectedValueOnce(new Error(`provider failure ${secret}`));
    const res = await response();
    expect(res.status).toBe(500);
    privateHeader(res);
    const json = await res.json();
    expect(json).toEqual({ success: false, error: "Внутренняя ошибка сервера" });
    expect(JSON.stringify(json)).not.toContain(secret);
    expect(m.readResult).toHaveBeenCalledExactlyOnceWith("fictional-A", userStepId);
    expect(m.entitlement.mock.invocationCallOrder[0]).toBeLessThan(
      m.readResult.mock.invocationCallOrder[0]!,
    );
    expect(m.submit).not.toHaveBeenCalled();
    expect(m.upload).not.toHaveBeenCalled();
  });
});
