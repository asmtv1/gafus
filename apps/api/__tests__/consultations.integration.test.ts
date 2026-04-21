import { describe, it, expect, vi } from "vitest";

vi.mock("../src/middleware/rate-limit.js", () => ({
  apiRateLimiter: async (_c: unknown, next: () => Promise<void>) => next(),
  authRateLimiter: async (_c: unknown, next: () => Promise<void>) => next(),
  paymentsRateLimiter: async (_c: unknown, next: () => Promise<void>) => next(),
  usernameAvailableRateLimiter: async (_c: unknown, next: () => Promise<void>) => next(),
  consultationBookRateLimiter: async (_c: unknown, next: () => Promise<void>) => next(),
}));

describe("consultations API (контракт)", () => {
  it("401 без Authorization на GET /cynologists", async () => {
    const { app } = await import("../src/app.js");
    const res = await app.request("http://localhost/api/v1/consultations/cynologists", {
      method: "GET",
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { success: boolean };
    expect(body.success).toBe(false);
  });
});
