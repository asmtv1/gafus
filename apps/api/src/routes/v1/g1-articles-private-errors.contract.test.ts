/** AG1-G1-001: private article list errors must never be browser-cacheable. */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const core = vi.hoisted(() => ({
  getArticles: vi.fn(),
  getArticleBySlugForMonetizedAccess: vi.fn(),
  toggleArticleLikeWithMonetizedAccess: vi.fn(),
  incrementArticleView: vi.fn(),
}));

vi.mock("@gafus/core/services/article", () => core);
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: vi.fn() }),
}));

import { articlesRoutes } from "./articles";

function app() {
  const server = new Hono();
  server.use("/api/v1/articles/*", async (c, next) => {
    c.set("user", { id: "user-A", username: "a", role: "USER" });
    await next();
  });
  server.route("/api/v1/articles", articlesRoutes);
  return server;
}

describe("AG1-G1-001 articles private cache failure characterization (mock Core)", () => {
  beforeEach(() => vi.resetAllMocks());

  it("retains current successful list response and no-store", async () => {
    core.getArticles.mockResolvedValue({ success: true, data: [{ id: "article-A" }] });
    const response = await app().request("/api/v1/articles");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ success: true, data: [{ id: "article-A" }] });
    expect(core.getArticles).toHaveBeenCalledExactlyOnceWith("user-A");
  });

  it("Core failure is 500 with no-store, not an empty successful list", async () => {
    core.getArticles.mockResolvedValue({ success: false, error: "Не удалось загрузить статьи" });
    const response = await app().request("/api/v1/articles");
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ success: false, error: "Не удалось загрузить статьи" });
  });

  it("thrown Core error returns sanitized 500 and private no-store", async () => {
    core.getArticles.mockRejectedValue(new Error("test-db-private-credential"));
    const response = await app().request("/api/v1/articles");
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await response.text();
    expect(body).toContain("Внутренняя ошибка сервера");
    expect(body).not.toContain("test-db-private-credential");
  });
});
