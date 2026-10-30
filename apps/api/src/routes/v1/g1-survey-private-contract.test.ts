/** AG1-LEARN-032: a user's survey responses and comparison must stay private. */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  comparison: vi.fn(), response: vi.fn(), template: vi.fn(), submit: vi.fn(), premium: vi.fn(),
}));
vi.mock("@gafus/core/services/survey", () => ({
  getSurveyComparison: m.comparison,
  getSurveyResponse: m.response,
  getSurveyTemplate: m.template,
  submitSurveyResponse: m.submit,
}));
vi.mock("@gafus/core/services/rewardedCredits", () => ({
  requirePremiumOrRewardedAccessForUserStep: m.premium,
  SubscriptionOrCreditsRequiredError: class SubscriptionOrCreditsRequiredError extends Error {
    constructor() { super("subscription required"); this.name = "SubscriptionOrCreditsRequiredError"; }
  },
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: vi.fn() }),
}));
import { surveysRoutes } from "./surveys";

const payload = {
  courseId: "course-1", stepId: "step-1", userStepId: "user-step-1",
  answers: { q1: "private", q2: ["A", "B"] },
};
function app() {
  const server = new Hono();
  server.use("/api/v1/surveys/*", async (c, next) => {
    c.set("user", {
      id: c.req.header("x-test-principal") || "owner-A", username: "fixture", role: "USER",
    });
    await next();
  });
  server.route("/api/v1/surveys", surveysRoutes);
  return server;
}
function post(body: unknown = payload) {
  return app().request("/api/v1/surveys/behavior/response", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("AG1-LEARN-032 surveys owner private cache policy", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.template.mockReturnValue({ slug: "behavior", title: "Опрос" });
    m.response.mockImplementation(async (actor: string) => ({
      userId: actor, answers: payload.answers,
    }));
    m.comparison.mockImplementation(async (actor: string) => ({ userId: actor, chart: [] }));
    m.submit.mockResolvedValue({ success: true });
  });

  it("rejects oversized survey input before parsing or calling business services", async () => {
    const tooLarge = { ...payload, answers: { huge: "A".repeat(150_000) } };
    const response = await post(tooLarge);
    expect(response.status).toBe(413);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(m.submit).not.toHaveBeenCalled();
    expect(m.premium).not.toHaveBeenCalled();
  });

  it("owner-A and owner-B cannot share cached template with saved answers", async () => {
    for (const actor of ["owner-A", "owner-B"]) {
      const response = await app().request("/api/v1/surveys/behavior?stepId=step-1", {
        headers: { "x-test-principal": actor },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      await expect(response.json()).resolves.toMatchObject({
        success: true, data: { response: { userId: actor } },
      });
    }
  });

  it("comparison is user-scoped and no-store", async () => {
    const response = await app().request("/api/v1/surveys/comparison?courseId=x&familySlug=y");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(m.comparison).toHaveBeenCalledWith("owner-A", "x", "y");
  });

  it("GET /comparison forwards exact authenticated principal and query identifiers for A and B", async () => {
    for (const actor of ["owner-A", "owner-B"]) {
      const value = { userId: actor, familySlug: "behavior", privateComparison: actor };
      m.comparison.mockResolvedValueOnce(value);
      const response = await app().request(
        "/api/v1/surveys/comparison?courseId=course-2&familySlug=behavior",
        { headers: { "x-test-principal": actor } },
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      await expect(response.json()).resolves.toEqual({ success: true, data: value });
    }
    expect(m.comparison.mock.calls).toEqual([
      ["owner-A", "course-2", "behavior"],
      ["owner-B", "course-2", "behavior"],
    ]);
    expect(m.template).not.toHaveBeenCalled();
    expect(m.response).not.toHaveBeenCalled();
    expect(m.submit).not.toHaveBeenCalled();
    expect(m.premium).not.toHaveBeenCalled();
  });

  it("GET /comparison retains 200 with null Core comparison", async () => {
    m.comparison.mockResolvedValueOnce(null);
    const response = await app().request("/api/v1/surveys/comparison?courseId=c&familySlug=f");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ success: true, data: null });
    expect(m.comparison).toHaveBeenCalledExactlyOnceWith("owner-A", "c", "f");
  });

  it.each([
    "/api/v1/surveys/comparison?familySlug=behavior",
    "/api/v1/surveys/comparison?courseId=c",
    "/api/v1/surveys/comparison?courseId=&familySlug=f",
  ])("GET /comparison retains Zod 400/no-store and never reads Core: %s", async (path) => {
    const response = await app().request(path);
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(m.comparison).not.toHaveBeenCalled();
    expect(m.template).not.toHaveBeenCalled();
    expect(m.response).not.toHaveBeenCalled();
  });

  it("GET /:slug without stepId synchronously gets template and never reads response", async () => {
    const template = { slug: "behavior", title: "Проверка шаблона" };
    m.template.mockReturnValueOnce(template);
    const response = await app().request("/api/v1/surveys/behavior");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      success: true, data: { template, response: null },
    });
    expect(m.template).toHaveBeenCalledExactlyOnceWith("behavior");
    expect(m.response).not.toHaveBeenCalled();
    expect(m.comparison).not.toHaveBeenCalled();
    expect(m.submit).not.toHaveBeenCalled();
  });

  it("GET /:slug missing template preserves 400 SURVEY_NOT_FOUND before any private response read", async () => {
    m.template.mockReturnValueOnce(null);
    const response = await app().request("/api/v1/surveys/unknown?stepId=private-step");
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      success: false, error: "Анкета не найдена", code: "SURVEY_NOT_FOUND",
    });
    expect(m.template).toHaveBeenCalledExactlyOnceWith("unknown");
    expect(m.response).not.toHaveBeenCalled();
    expect(m.comparison).not.toHaveBeenCalled();
  });

  it("GET /:slug with stepId reads only authenticated owner's response and retains null", async () => {
    m.response.mockResolvedValueOnce(null);
    const response = await app().request("/api/v1/surveys/behavior?stepId=step-7", {
      headers: { "x-test-principal": "owner-B" },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true, data: { template: { slug: "behavior", title: "Опрос" }, response: null },
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(m.template).toHaveBeenCalledExactlyOnceWith("behavior");
    expect(m.response).toHaveBeenCalledExactlyOnceWith("owner-B", "step-7");
  });

  it("GET /:slug with stepId preserves exact private response without merging actor data", async () => {
    const saved = { userId: "owner-B", stepId: "step-8", answers: { secret: "private" } };
    m.response.mockResolvedValueOnce(saved);
    const response = await app().request("/api/v1/surveys/behavior?stepId=step-8", {
      headers: { "x-test-principal": "owner-B" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      success: true, data: { template: { slug: "behavior", title: "Опрос" }, response: saved },
    });
    expect(m.response).toHaveBeenCalledExactlyOnceWith("owner-B", "step-8");
    expect(m.comparison).not.toHaveBeenCalled();
    expect(m.submit).not.toHaveBeenCalled();
  });

  it("GET /:slug empty stepId fails Zod without loading template or owner data", async () => {
    const response = await app().request("/api/v1/surveys/behavior?stepId=");
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(m.template).not.toHaveBeenCalled();
    expect(m.response).not.toHaveBeenCalled();
  });

  it.each(["template", "response"] as const)(
    "GET /:slug keeps masked 500 and no-store on %s Core failure",
    async (phase) => {
      if (phase === "template") m.template.mockImplementationOnce(() => { throw new Error("private-template-error"); });
      else m.response.mockRejectedValueOnce(new Error("private-response-error"));
      const response = await app().request("/api/v1/surveys/behavior?stepId=step-1");
      expect(response.status).toBe(500);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      await expect(response.json()).resolves.toEqual({
        success: false, error: "Внутренняя ошибка сервера",
      });
      expect(m.template).toHaveBeenCalledExactlyOnceWith("behavior");
      expect(m.response).toHaveBeenCalledTimes(phase === "template" ? 0 : 1);
      expect(m.submit).not.toHaveBeenCalled();
    },
  );

  it("AG1 submit port forwards actor B, path slug and exact validated survey payload after access", async () => {
    const calls: string[] = [];
    m.premium.mockImplementationOnce(async () => { calls.push("access"); });
    const result = { success: true, response: { synthetic: "saved" } };
    m.submit.mockImplementationOnce(async () => { calls.push("submit"); return result; });
    const response = await app().request("/api/v1/surveys/survey-from-path/response?platform=IOS", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-principal": "owner-B" },
      body: JSON.stringify({ ...payload, petId: null, answers: { q1: "private-B" } }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual(result);
    expect(calls).toEqual(["access", "submit"]);
    expect(m.premium).toHaveBeenCalledExactlyOnceWith({
      userId: "owner-B", platform: "IOS", userStepId: "user-step-1",
    });
    expect(m.submit).toHaveBeenCalledExactlyOnceWith("owner-B", {
      ...payload, petId: null, answers: { q1: "private-B" }, surveySlug: "survey-from-path",
    });
    expect(m.comparison).not.toHaveBeenCalled();
    expect(m.template).not.toHaveBeenCalled();
    expect(m.response).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...payload, courseId: "" }],
    [{ ...payload, stepId: "" }],
    [{ ...payload, userStepId: "" }],
    [{ ...payload, answers: { q1: 42 } }],
    [{ ...payload, answers: ["not-a-record"] }],
  ])("AG1 submit port leaves Zod 400 before access and Core submit: %j", async (invalid) => {
    const response = await post(invalid);
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(m.premium).not.toHaveBeenCalled();
    expect(m.submit).not.toHaveBeenCalled();
  });

  it("AG1 submit port preserves paywall 402 and calls no submit on refused access", async () => {
    m.premium.mockRejectedValueOnce(Object.assign(new Error("private-paywall"), {
      name: "SubscriptionOrCreditsRequiredError",
    }));
    const response = await post();
    expect(response.status).toBe(402);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Для действия нужна подписка или доступ к шагу за просмотр рекламы",
      code: "SUBSCRIPTION_OR_CREDITS_REQUIRED",
    });
    expect(m.premium).toHaveBeenCalledOnce();
    expect(m.submit).not.toHaveBeenCalled();
  });

  it.each([
    [{ success: false, code: "SURVEY_EDIT_WINDOW_EXPIRED", error: "Окно истекло" }, 423],
    [{ success: false, code: "SURVEY_NOT_FOUND", error: "Анкета недоступна" }, 400],
    [{ success: false, error: "Некорректные ответы" }, 400],
  ] as const)("AG1 submit port preserves exact resolved business result %j and HTTP %i", async (
    result, status,
  ) => {
    m.submit.mockResolvedValueOnce(result);
    const response = await post();
    expect(response.status).toBe(status);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual(result);
    expect(m.premium).toHaveBeenCalledOnce();
    expect(m.submit).toHaveBeenCalledExactlyOnceWith("owner-A", {
      ...payload, surveySlug: "behavior",
    });
  });

  it.each(["access", "submit"] as const)(
    "AG1 submit port retains masked 500/private headers on %s thrown failure",
    async (phase) => {
      if (phase === "access") m.premium.mockRejectedValueOnce(new Error("private-access-failure"));
      else m.submit.mockRejectedValueOnce(new Error("private-submit-failure"));
      const response = await post();
      expect(response.status).toBe(500);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      await expect(response.json()).resolves.toEqual({
        success: false, error: "Внутренняя ошибка сервера",
      });
      expect(m.premium).toHaveBeenCalledOnce();
      expect(m.submit).toHaveBeenCalledTimes(phase === "access" ? 0 : 1);
    },
  );

  it("successful submission response is no-store", async () => {
    const response = await post();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(m.submit).toHaveBeenCalledWith("owner-A", { ...payload, surveySlug: "behavior" });
  });

  it("invalid submission returns private 400 with no Core write", async () => {
    const response = await post({ ...payload, answers: { bad: 77 } });
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(m.submit).not.toHaveBeenCalled();
  });

  it("expired edit returns 423 without cacheability", async () => {
    m.submit.mockResolvedValueOnce({
      success: false, code: "SURVEY_EDIT_WINDOW_EXPIRED", error: "Время редактирования истекло",
    });
    const response = await post();
    expect(response.status).toBe(423);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toMatchObject({ code: "SURVEY_EDIT_WINDOW_EXPIRED" });
  });

  it("subscription required stays private 402 with no Core mutation", async () => {
    m.premium.mockRejectedValueOnce(Object.assign(new Error("pay"), {
      name: "SubscriptionOrCreditsRequiredError",
    }));
    const response = await post();
    expect(response.status).toBe(402);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(m.submit).not.toHaveBeenCalled();
  });

  it("unexpected database failure stays private 500", async () => {
    m.comparison.mockRejectedValueOnce(new Error("private provider error"));
    const response = await app().request("/api/v1/surveys/comparison?courseId=x&familySlug=y");
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      success: false, error: "Внутренняя ошибка сервера",
    });
  });
});
