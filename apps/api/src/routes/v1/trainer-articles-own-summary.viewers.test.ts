import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { createTrainerArticlesOwnSummaryRoutes } from "./trainer-articles-own-summary";

const item = { userId: "person_1", username: "reader", fullName: "Читатель",
  lastViewedAt: "2026-11-03T11:00:00.000Z" };
const read = vi.fn(async (articleId: string, ownerId: string) =>
  articleId === "mine_1" && ownerId === "trainer_1"
    ? { success: true as const, data: [item] }
    : { success: false as const, error: "Not found" });
function setup(role: "TRAINER" | "ADMIN" | "USER" = "TRAINER") {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("user", { id: "trainer_1", username: "trainer", role });
    await next();
  });
  app.route("/articles", createTrainerArticlesOwnSummaryRoutes(read));
  return app;
}
describe("article viewers: Next read parity, author ACL", () => {
  it("lists only signed-in viewers of an author-owned article with private cache", async () => {
    const response = await setup().request("/articles/own-summary/mine_1/viewers");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await response.json()).toEqual({ success: true, data: { viewers: [item] } });
    expect(read).toHaveBeenCalledWith("mine_1", "trainer_1");
  });
  it("rejects other article owners, even for an administrator", async () => {
    read.mockClear();
    const response = await setup("ADMIN").request("/articles/own-summary/foreign_1/viewers");
    expect(response.status).toBe(404);
    expect((await response.text())).not.toContain(item.username);
    expect(read).toHaveBeenCalledWith("foreign_1", "trainer_1");
  });
  it("denies non-staff before querying and rejects query/invalid identifiers", async () => {
    read.mockClear();
    expect((await setup("USER").request("/articles/own-summary/mine_1/viewers")).status).toBe(403);
    expect(read).not.toHaveBeenCalled();
    expect((await setup().request("/articles/own-summary/mine_1/viewers?owner=other")).status).toBe(400);
    expect((await setup().request("/articles/own-summary/%20/viewers")).status).toBe(400);
    expect(read).not.toHaveBeenCalled();
  });
  it("fails closed on a malformed backend viewer projection", async () => {
    read.mockResolvedValueOnce({ success: true as const, data: [{
      userId: "person_1", username: "private", fullName: "Reader",
      lastViewedAt: "INVALID_DATE",
    }] });
    const response = await setup().request("/articles/own-summary/mine_1/viewers");
    expect(response.status).toBe(500);
    expect((await response.text())).not.toContain("private");
  });
});
