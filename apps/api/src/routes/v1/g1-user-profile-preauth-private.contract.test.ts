/** AG1-G1-001: exact private /user/profile preauth cache protection. */
import { readFileSync } from "node:fs";
import { Hono, type Context } from "hono";
import { describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock("@gafus/auth/jwt", () => ({ verifyAccessToken: m.verify }));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: async () => true }));
import { authMiddleware } from "../../middleware/auth";
const source = readFileSync(new URL("../../app.ts", import.meta.url), "utf8");
const key = "private, no-store";
const privacy = async (c: Context, next: () => Promise<void>) => {
  c.header("Cache-Control", key);
  c.header("Referrer-Policy", "no-referrer");
  await next();
  c.header("Cache-Control", key);
};
function app(rateLimited: boolean) {
  const server = new Hono();
  let hits = 0;
  server.use("/api/v1/user/profile", privacy);
  server.use("/api/v1/user/*", async (c, next) => {
    if (rateLimited) return c.json({ success: false, code: "RATE_LIMITED" }, 429);
    await next();
  });
  server.use("/api/v1/user/*", authMiddleware);
  server.all("/api/v1/user/*", (c) => {
    hits++;
    return c.json({ success: true });
  });
  return { server, hits: () => hits };
}
function assertPrivate(r: Response) {
  expect(r.headers.get("Cache-Control")).toBe(key);
  expect(r.headers.get("Referrer-Policy")).toBe("no-referrer");
}
describe("AG1 exact profile preauth private response", () => {
  it("real app registers scoped private middleware before both limiter and auth", () => {
    expect(source).toContain("const profilePrivateNoStore = async");
    expect(source).toContain("app.use(\"/api/v1/user/profile\", profilePrivateNoStore)");
    const before = source.indexOf("app.use(\"/api/v1/user/profile\", profilePrivateNoStore)");
    expect(before).toBeLessThan(source.indexOf("app.use(\"/api/v1/user/*\", apiRateLimiter)"));
    expect(before).toBeLessThan(source.indexOf("app.use(\"/api/v1/user/*\", authMiddleware)"));
  });
  it("missing token GET 401 is private", async () => {
    const t = app(false);
    const res = await t.server.request("/api/v1/user/profile");
    expect(res.status).toBe(401);assertPrivate(res);expect(t.hits()).toBe(0);
  });
  it("preauth 429 is private", async () => {
    const t = app(true);
    const res = await t.server.request("/api/v1/user/profile");
    expect(res.status).toBe(429);assertPrivate(res);expect(t.hits()).toBe(0);
  });
  it("cookie mutation without trusted Origin 403 is private", async () => {
    const t = app(false);
    const res = await t.server.request("/api/v1/user/profile", {
      method: "PUT", headers: { Cookie: "gafus_access=synthetic" },
    });
    expect(res.status).toBe(403);assertPrivate(res);expect(t.hits()).toBe(0);
  });
  it("public /profile/public does not receive private profile middleware", async () => {
    const t = app(false);
    const res = await t.server.request("/api/v1/user/profile/public?username=visitor");
    expect(res.status).toBe(200);
    expect(res.headers.get("Referrer-Policy")).toBeNull();
    expect(res.headers.get("Cache-Control")).toBeNull();
    expect(t.hits()).toBe(1);
  });
});
