/** AG1-001/LEARN032: original POST exam submit guard -> typed application/unchanged Core payload. */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  submit: vi.fn(),
  gate: vi.fn(),
  get: vi.fn(() => {
    throw new Error("GET_EXAM_CORE_MUST_NOT_RUN");
  }),
  upload: vi.fn(() => {
    throw new Error("UPLOAD_CORE_MUST_NOT_RUN");
  }),
  log: vi.fn(),
}));
vi.mock("@gafus/core/services/exam", () => ({
  getExamResult: m.get,
  submitExamResult: m.submit,
  uploadExamVideoFile: m.upload,
}));
vi.mock("@gafus/core/services/rewardedCredits", () => ({
  requirePremiumOrRewardedAccessForUserStep: m.gate,
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
const stepId = "e4d823a4-53f1-4ebc-bcca-bf9b77239ead";
const endpoint = "/api/v1/exam/submit";
const basic = { userStepId, stepId };
const full = {
  userStepId,
  stepId,
  testAnswers: { "test/first": 2, "test/second": 0, "test/third": -1 },
  testScore: 12,
  testMaxScore: 17,
  videoReportUrl: null,
  writtenFeedback: "Fictional written report: Мой результат",
  overallScore: 71,
  isPassed: false,
};
const success = { success: true, examResultId: "fictional-exam-id" };

function app() {
  const server = new Hono();
  // Fixture only. Real JWT, entitlement provider and Core write are NOT invoked.
  server.use("/api/v1/exam/*", async (c, next) => {
    c.set("user", {
      id: c.req.header("x-fixture-actor") ?? "fictional-A",
      role: "USER",
      username: "student",
    });
    await next();
  });
  server.route("/api/v1/exam", examRoutes);
  return server;
}
function submit(data: unknown = basic, headers: Record<string, string> = {}) {
  return app().request(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(data),
  });
}
function assertPrivate(response: Response) {
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
}
function assertNoUnauthorizedWrites() {
  expect(m.get).not.toHaveBeenCalled();
  expect(m.upload).not.toHaveBeenCalled();
}
function gateCalledBeforeSubmit(actor = "fictional-A", platform = "ANDROID") {
  expect(m.gate).toHaveBeenCalledExactlyOnceWith({ userId: actor, platform, userStepId });
  expect(m.submit.mock.invocationCallOrder).toHaveLength(1);
  expect(m.gate.mock.invocationCallOrder[0]).toBeLessThan(m.submit.mock.invocationCallOrder[0]!);
}

describe("original exam POST submit typed application + retained Hono entitlement boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.gate.mockResolvedValue(undefined);
    m.submit.mockResolvedValue(success);
  });

  it("invalid Zod JSON gives private 400 before gate and submit", async () => {
    const r = await submit({ userStepId, stepId, testAnswers: { "test/first": "2" } });
    expect(r.status).toBe(400);
    assertPrivate(r);
    expect(m.gate).not.toHaveBeenCalled();
    expect(m.submit).not.toHaveBeenCalled();
    assertNoUnauthorizedWrites();
  });

  it("rewarded gate denies with exact original 402 payload and never calls submit", async () => {
    const denial = Object.assign(new Error("subscription required"), {
      name: "SubscriptionOrCreditsRequiredError",
    });
    m.gate.mockRejectedValueOnce(denial);
    const r = await submit(full, { "x-rewarded-platform": "IOS" });
    expect(r.status).toBe(402);
    assertPrivate(r);
    expect(await r.json()).toEqual({
      success: false,
      error: "Для действия нужна подписка или доступ к шагу за просмотр рекламы",
      code: "SUBSCRIPTION_OR_CREDITS_REQUIRED",
    });
    expect(m.gate).toHaveBeenCalledExactlyOnceWith({
      userId: "fictional-A",
      platform: "IOS",
      userStepId,
    });
    expect(m.submit).not.toHaveBeenCalled();
    assertNoUnauthorizedWrites();
  });

  it("valid complete source payload is forwarded exactly, incl numeric test answers and opaque null video URL", async () => {
    const body = { ...full, ignoredRuntimeField: "must be stripped by existing Zod" };
    const r = await submit(body, { "x-fixture-actor": "fictional-B", "x-platform": "IOS" });
    expect(r.status).toBe(200);
    assertPrivate(r);
    expect(await r.json()).toEqual({ success: true, data: success });
    gateCalledBeforeSubmit("fictional-B", "IOS");
    expect(m.submit).toHaveBeenCalledExactlyOnceWith("fictional-B", full);
    expect(m.submit.mock.calls[0]?.[1]).toHaveProperty("videoReportUrl", null);
    assertNoUnauthorizedWrites();
  });

  it("existing omitted optional exam inputs stay omitted, not synthesized", async () => {
    const r = await submit(basic);
    expect(r.status).toBe(200);
    assertPrivate(r);
    gateCalledBeforeSubmit();
    expect(m.submit).toHaveBeenCalledExactlyOnceWith("fictional-A", basic);
    assertNoUnauthorizedWrites();
  });

  it("known missing step exception retains exact 404 NOT_FOUND and no extra Core operation", async () => {
    m.submit.mockRejectedValueOnce(new Error("Шаг не найден или нет доступа"));
    const r = await submit(full);
    expect(r.status).toBe(404);
    assertPrivate(r);
    expect(await r.json()).toEqual({
      success: false,
      error: "Шаг не найден или нет доступа",
      code: "NOT_FOUND",
    });
    gateCalledBeforeSubmit();
    assertNoUnauthorizedWrites();
  });

  it("known non-exam source exception retains fixed safe 400 VALIDATION_ERROR", async () => {
    m.submit.mockRejectedValueOnce(
      new Error("Этот шаг не является экзаменационным. Тип шага: THEORY"),
    );
    const r = await submit(full);
    expect(r.status).toBe(400);
    assertPrivate(r);
    expect(await r.json()).toEqual({
      success: false,
      error: "Этот шаг не является экзаменационным",
      code: "VALIDATION_ERROR",
    });
    gateCalledBeforeSubmit();
    assertNoUnauthorizedWrites();
  });

  it("unknown Core/provider error remains fixed private 500 without SQL or personal text in body", async () => {
    const marker = "PRIVATE_RESULT_SQL_OR_MEDIA_TOKEN";
    m.submit.mockRejectedValueOnce(new Error(`database failed: ${marker}`));
    const r = await submit(full);
    expect(r.status).toBe(500);
    assertPrivate(r);
    expect(await r.json()).toEqual({ success: false, error: "Внутренняя ошибка сервера" });
    gateCalledBeforeSubmit();
    assertNoUnauthorizedWrites();
  });
});
