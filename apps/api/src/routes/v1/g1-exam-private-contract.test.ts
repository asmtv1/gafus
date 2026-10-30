/** AG1-LEARN-032: private exam result/submit/upload response and error boundaries. */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  result: vi.fn(), submit: vi.fn(), upload: vi.fn(), premium: vi.fn(), logError: vi.fn(),
}));
vi.mock("@gafus/core/services/exam", () => ({
  getExamResult: m.result,
  submitExamResult: m.submit,
  uploadExamVideoFile: m.upload,
}));
vi.mock("@gafus/core/services/rewardedCredits", () => ({
  requirePremiumOrRewardedAccessForUserStep: m.premium,
  SubscriptionOrCreditsRequiredError: class SubscriptionOrCreditsRequiredError extends Error {
    constructor() { super("credits required"); this.name = "SubscriptionOrCreditsRequiredError"; }
  },
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: m.logError }),
}));
import { examRoutes } from "./exam";

const validUserStepId = "cmq3f664202mpka016rywnmzy";
const validStepId = "e4d823a4-53f1-4ebc-bcca-bf9b77239ead";
const submitBody = { userStepId: validUserStepId, stepId: validStepId, testAnswers: { q1: 1 } };

function createApp() {
  const app = new Hono();
  app.use("/api/v1/exam/*", async (c, next) => {
    c.set("user", { id: c.req.header("x-test-actor") ?? "user-A", username: "fixture", role: "USER" });
    await next();
  });
  app.route("/api/v1/exam", examRoutes);
  return app;
}
function submit(app = createApp(), body: unknown = submitBody) {
  return app.request("/api/v1/exam/submit", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("AG1-LEARN-032 owner-scoped exam transport", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.result.mockImplementation(async (actor: string) => ({ id: `exam-${actor}`, score: 77 }));
    m.submit.mockResolvedValue({ success: true, examResultId: "exam-1" });
  });

  it("GET /result cannot cache private results across principals", async () => {
    for (const actor of ["user-A", "user-B"]) {
      const response = await createApp().request(
        `/api/v1/exam/result?userStepId=${validUserStepId}`,
        { headers: { "x-test-actor": actor } },
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      await expect(response.json()).resolves.toEqual({
        success: true, data: { id: `exam-${actor}`, score: 77 },
      });
    }
    expect(m.result).toHaveBeenCalledWith("user-A", validUserStepId);
    expect(m.result).toHaveBeenCalledWith("user-B", validUserStepId);
  });

  it("POST /submit success is also private no-store", async () => {
    const response = await submit();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(m.submit).toHaveBeenCalledWith("user-A", submitBody);
  });

  it("missing submit JSON validates to 400 without touching Core", async () => {
    const response = await submit(createApp(), { userStepId: validUserStepId });
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(m.submit).not.toHaveBeenCalled();
  });

  it("unknown upstream error mentioning 'не найден' is a sanitized HTTP 500", async () => {
    const secret = "S3_PRIVATE_OBJECT_KEY_AND_ACCESS_TOKEN_123";
    m.submit.mockRejectedValueOnce(new Error(`provider record не найден: ${secret}`));
    const response = await submit();
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const payload = await response.json();
    expect(payload).toEqual({ success: false, error: "Внутренняя ошибка сервера" });
    expect(JSON.stringify(payload)).not.toContain(secret);
  });

  it("known missing step keeps 404 NOT_FOUND without copying provider details", async () => {
    m.submit.mockRejectedValueOnce(new Error("Шаг не найден или нет доступа"));
    const response = await submit();
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      success: false, error: "Шаг не найден или нет доступа", code: "NOT_FOUND",
    });
  });

  it("known non-exam step keeps 400 VALIDATION_ERROR with stable safe message", async () => {
    m.submit.mockRejectedValueOnce(new Error("Этот шаг не является экзаменационным. Тип шага: THEORY"));
    const response = await submit();
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      success: false, error: "Этот шаг не является экзаменационным", code: "VALIDATION_ERROR",
    });
  });

  it("upload missing video returns private 400 before storage write", async () => {
    const body = new FormData();body.set("userStepId", validUserStepId);
    const response = await createApp().request("/api/v1/exam/upload-video", {
      method: "POST", body,
    });
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(m.upload).not.toHaveBeenCalled();
  });

  it("GET /result failure does not return public-cacheable data", async () => {
    m.result.mockRejectedValueOnce(new Error("private DB message"));
    const response = await createApp().request(`/api/v1/exam/result?userStepId=${validUserStepId}`);
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toMatchObject({ success: false });
  });
});
