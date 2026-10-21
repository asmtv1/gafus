import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const unlock = vi.hoisted(() => vi.fn());
vi.mock("@gafus/core/services/gafus", () => ({
  unlockContentWithGafus: unlock,
  getGafusStatus: vi.fn(), listGafusTransactions: vi.fn(), listGafusMiniGuides: vi.fn(),
  getGafusPostReactionProgress: vi.fn(), getAuthorizedMiniGuideContent: vi.fn(),
  GafusError: class GafusError extends Error {},
}));
import { gafusRoutes } from "./gafus";

function app() {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("user", { id: "viewer", username: "viewer", role: "USER" });
    await next();
  });
  app.route("/gafus", gafusRoutes);
  return app;
}
const request = (target: unknown, extra = {}) => app().request("/gafus/unlock", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ clientRequestId: "article-unlock-001", target, ...extra }),
});
describe("Gafus article unlock HTTP route", () => {
  beforeEach(() => { vi.clearAllMocks(); unlock.mockResolvedValue({ spent: 1, balance: 2 }); });
  it("uses the authenticated viewer and server-owned purchase terms", async () => {
    const response = await request({ type: "ARTICLE", articleId: "article-1" });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(unlock).toHaveBeenCalledWith({ userId: "viewer", clientRequestId: "article-unlock-001", target: { type: "ARTICLE", articleId: "article-1" } });
  });
  it.each([{ price: 0 }, { userId: "victim" }, { accessDurationSeconds: 999999999 }])("rejects client-supplied terms %j", async extra => {
    expect((await request({ type: "ARTICLE", articleId: "article-1" }, extra)).status).toBe(400);
    expect(unlock).not.toHaveBeenCalled();
  });
  it("rejects article target shape injection", async () => {
    expect((await request({ type: "ARTICLE", articleId: "article-1", courseId: "other" })).status).toBe(400);
    expect(unlock).not.toHaveBeenCalled();
  });
});
