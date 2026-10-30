/** AG1-G1-001: protect article mutation responses without changing old Mobile JSON. */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  like: vi.fn(),
  view: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
}));
vi.mock("@gafus/core/services/article", () => ({
  getArticles: mocks.list,
  getArticleBySlugForMonetizedAccess: mocks.detail,
  toggleArticleLikeWithMonetizedAccess: mocks.like,
  incrementArticleView: mocks.view,
}));
vi.mock("@gafus/core/services/rewardedCredits", () => ({
  SubscriptionOrCreditsRequiredError: class SubscriptionOrCreditsRequiredError extends Error {},
}));
vi.mock("@gafus/logger", () => ({ createWebLogger: () => ({ error: vi.fn() }) }));
import { SubscriptionOrCreditsRequiredError } from "@gafus/core/services/rewardedCredits";
import { articlesRoutes } from "./articles";

function app() {
  const server = new Hono();
  server.use("/api/v1/articles/*", async (c, next) => {
    c.set("user", { id: "user-A", username: "native", role: "USER" });
    await next();
  });
  server.route("/api/v1/articles", articlesRoutes);
  return server;
}

const url = "/api/v1/articles/article-1/like";
function like(headers: Record<string, string> = {}) {
  return app().request(url, { method: "POST", headers });
}
function assertPrivate(res: Response) {
  expect(res.headers.get("Cache-Control")).toBe("private, no-store");
}

beforeEach(() => vi.resetAllMocks());

describe("AG1 articles mutation private response contract (mock Core)", () => {
  it("200 like retains native JSON and Android default", async () => {
    mocks.like.mockResolvedValueOnce(true);
    const response = await like({ Authorization: "Bearer synthetic-native" });
    expect(response.status).toBe(200);
    assertPrivate(response);
    expect(await response.json()).toEqual({ success: true, data: { isLiked: true } });
    expect(mocks.like).toHaveBeenCalledExactlyOnceWith({
      articleId: "article-1",
      userId: "user-A",
      platform: "ANDROID",
    });
  });

  it("402 subscription error retains machine code and privacy", async () => {
    mocks.like.mockRejectedValueOnce(new SubscriptionOrCreditsRequiredError("denied"));
    const response = await like();
    expect(response.status).toBe(402);
    assertPrivate(response);
    expect(await response.json()).toMatchObject({
      success: false,
      code: "SUBSCRIPTION_OR_CREDITS_REQUIRED",
    });
  });

  it("built Core denial still maps 402 when source/dist error class differs", async () => {
    const error = Object.assign(new Error("denied across build boundary"), {
      code: "SUBSCRIPTION_OR_CREDITS_REQUIRED",
    });
    mocks.like.mockRejectedValueOnce(error);
    const response = await like();
    expect(response.status).toBe(402);
    assertPrivate(response);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "SUBSCRIPTION_OR_CREDITS_REQUIRED",
    });
  });

  it("404 unknown article is private with existing NOT_FOUND code", async () => {
    mocks.like.mockRejectedValueOnce(new Error("ARTICLE_NOT_FOUND"));
    const response = await like();
    expect(response.status).toBe(404);
    assertPrivate(response);
    expect(await response.json()).toMatchObject({ success: false, code: "NOT_FOUND" });
  });

  it("500 sanitizes message and never permits cache", async () => {
    mocks.like.mockRejectedValueOnce(new Error("PRIVATE_DB_FAULT_CANARY"));
    const response = await like();
    expect(response.status).toBe(500);
    assertPrivate(response);
    expect(await response.text()).not.toContain("PRIVATE_DB_FAULT_CANARY");
  });

  it("view success keeps old response and is private", async () => {
    mocks.view.mockResolvedValueOnce({ success: true });
    const response = await app().request("/api/v1/articles/article-1/view", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visitorKey: "synthetic-visitor" }),
    });
    expect(response.status).toBe(200);
    assertPrivate(response);
    expect(await response.json()).toEqual({ success: true });
    expect(mocks.view).toHaveBeenCalledWith("article-1", {
      viewerUserId: "user-A",
      guestVisitorKey: "synthetic-visitor",
    });
  });

  it("view Core error preserves legacy 200 failure envelope but no-store", async () => {
    mocks.view.mockResolvedValueOnce({ success: false, error: "unknown" });
    const response = await app().request("/api/v1/articles/article-1/view", { method: "POST" });
    expect(response.status).toBe(200);
    assertPrivate(response);
    expect(await response.json()).toEqual({ success: false, error: "unknown" });
  });

  it("view exception returns sanitized private 500", async () => {
    mocks.view.mockRejectedValueOnce(new Error("PRIVATE_DB_FAULT_CANARY"));
    const response = await app().request("/api/v1/articles/article-1/view", { method: "POST" });
    expect(response.status).toBe(500);
    assertPrivate(response);
    expect(await response.text()).not.toContain("PRIVATE_DB_FAULT_CANARY");
  });
});
