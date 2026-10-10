import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

vi.mock("@hono-rate-limiter/redis", () => ({
  RedisStore: class {
    windowMs = 60_000;
    counts = new Map<string, number>();
    init(options: { windowMs: number }) { this.windowMs = options.windowMs; }
    async increment(key: string) {
      const totalHits = (this.counts.get(key) ?? 0) + 1;
      this.counts.set(key, totalHits);
      return { totalHits, resetTime: new Date(Date.now() + this.windowMs) };
    }
    async decrement() {}
    async resetKey(key: string) { this.counts.delete(key); }
  },
}));
import { apiRateLimiter, galleryRateLimiter } from "./rate-limit";

function app(user: string) {
  const a = new Hono();
  a.use("*", async (c, next) => { c.set("user", { id: user, username: user, role: "USER" }); await next(); });
  a.use("/gallery/*", galleryRateLimiter);
  a.use("/other/*", apiRateLimiter);
  a.all("*", c => c.json({ success: true }));
  return a;
}
describe("gallery polling rate limit", () => {
  it("allows a five-photo polling minute without consuming the general API budget", async () => {
    const a = app("five-photos");
    for (let i = 0; i < 140; i++) expect((await a.request("/gallery/uploads/status")).status).toBe(200);
    expect((await a.request("/other/profile")).status).toBe(200);
    expect((await a.request("/gallery/uploads", { method: "POST" })).status).toBe(200);
  });
  it("retains the write limit and returns a JSON error when the read budget is exhausted", async () => {
    const a = app("bounded");
    for (let i = 0; i < 100; i++) expect((await a.request("/gallery/uploads", { method: "POST" })).status).toBe(200);
    expect((await a.request("/gallery/uploads", { method: "POST" })).status).toBe(429);
    for (let i = 0; i < 300; i++) expect((await a.request("/gallery/uploads/status")).status).toBe(200);
    const blocked = await a.request("/gallery/uploads/status");
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ success: false, code: "RATE_LIMITED" });
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
    expect((await app("another-account").request("/gallery/uploads/status")).status).toBe(200);
  });
});
