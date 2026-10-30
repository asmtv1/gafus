/** Article 401/403/429 must be private even before actual article routes execute. */
import { readFileSync } from "node:fs";
import { Hono, type Context } from "hono";
import { describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ verify: vi.fn(), registration: vi.fn() }));
vi.mock("@gafus/auth/jwt", () => ({ verifyAccessToken: m.verify }));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: m.registration }));
import { authMiddleware } from "../../middleware/auth";

const source = readFileSync(new URL("../../app.ts", import.meta.url), "utf8");
const paths = ["/api/v1/articles", "/api/v1/articles/private/like"];
const privateHeader = "private, no-store";
const privacy = async (c: Context, next: () => Promise<void>) => {
  c.header("Cache-Control", privateHeader);
  c.header("Referrer-Policy", "no-referrer");
  await next();
  c.header("Cache-Control", privateHeader);
};
function makeApp(limit: boolean) {
  const app = new Hono();
  let core = 0;
  app.use("/api/v1/articles", privacy);
  app.use("/api/v1/articles/*", privacy, async (c, next) => {
    if (limit) return c.json({ success: false, code: "RATE_LIMITED" }, 429);
    await next();
  });
  app.use("/api/v1/articles/*", authMiddleware);
  app.all("/api/v1/articles/*", (c) => {
    core++;
    return c.json({ success: true });
  });
  app.all("/api/v1/articles", (c) => {
    core++;
    return c.json({ success: true });
  });
  return { app, hits: () => core };
}
function assertPrivate(res: Response) {
  expect(res.headers.get("cache-control")).toBe(privateHeader);
  expect(res.headers.get("referrer-policy")).toBe("no-referrer");
}

describe("AG1 private article preauth 401/403/429 boundary", () => {
  it("source places privacy before unchanged limiter/JWT on root and descendants", () => {
    expect(source).toContain("const articlePrivateNoStore = async");
    expect(source).toContain("app.use(\"/api/v1/articles\", articlePrivateNoStore)");
    expect(source).toContain("app.use(\"/api/v1/articles/*\", articlePrivateNoStore, apiRateLimiter)");
    expect(source).toContain("app.use(\"/api/v1/articles/*\", authMiddleware)");
    expect(source.indexOf("app.use(\"/api/v1/articles/*\", articlePrivateNoStore"))
      .toBeLessThan(source.indexOf("app.use(\"/api/v1/articles/*\", authMiddleware)"));
  });
  it.each(paths)("anonymous 401 private %s", async (path) => {
    const t = makeApp(false);
    const res = await t.app.request(path);
    expect(res.status).toBe(401);
    assertPrivate(res);
    expect(t.hits()).toBe(0);
  });
  it.each(paths)("rate-limited 429 private %s", async (path) => {
    const t = makeApp(true);
    const res = await t.app.request(path);
    expect(res.status).toBe(429);
    assertPrivate(res);
    expect(t.hits()).toBe(0);
  });
  it("browser cookie Origin denied 403 and still private", async () => {
    m.verify.mockResolvedValueOnce({ id: "A", username: "a", role: "USER" });
    const t = makeApp(false);
    const res = await t.app.request("/api/v1/articles/private/like", {
      method: "POST", headers: { Cookie: "gafus_access=synthetic" },
    });
    expect(res.status).toBe(403);
    assertPrivate(res);
    expect(t.hits()).toBe(0);
  });
});
