/** Browser guest-catalog retirement regression.
 * Next's /courses is private; the Refactor Hono app must not expose the
 * obsolete anonymous course/article list or an anonymous article view POST.
 * Keep the public landing statistics and mobile configuration independent. */
import { describe, expect, it, vi } from "vitest";

// Exercise the real router without a live Redis rate-limit connection.
vi.mock("@hono-rate-limiter/redis", () => ({
  RedisStore: class {
    windowMs = 60_000;
    init(options: { windowMs: number }) { this.windowMs = options.windowMs; }
    async increment() { return { totalHits: 1, resetTime: new Date(Date.now() + this.windowMs) }; }
    async decrement() { return undefined; }
    async resetKey() { return undefined; }
  },
}));
import { app } from "../../app";

const privateAnonymousPaths = [
  "/api/v1/public/courses",
  "/api/v1/public/courses/",
  "/api/v1/public/articles",
  "/api/v1/public/articles/dog-training",
  "/api/v1/public/articles/%D1%83%D1%87%D0%B5%D0%B1%D0%BD%D1%8B%D0%B9",
] as const;

describe("Next guest catalog retirement on the real Hono app", () => {
  it.each(privateAnonymousPaths)("never registers anonymous GET %s", async path => {
    const response = await app.request(path, { method: "GET" });
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).not.toBe("public, max-age=60");
  });
  it("never accepts anonymous article view counter mutation", async () => {
    const response = await app.request("/api/v1/public/articles/dog-training/view", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({visitorKey:"TEST_GUEST_VISITOR_1234567890"}),
    });
    expect(response.status).toBe(404);
  });
});
