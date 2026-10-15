import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

vi.mock("@gafus/core/services/auth", () => ({
  isRegistrationCompleted: vi.fn(),
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import { authMiddleware } from "../../middleware/auth";
import { jsonRequest } from "../../test/route-test-utils";
import { paymentsRoutes } from "./payments";

const authenticated = () => {
  const app = new Hono();
  app.use("/api/v1/payments/*", async (c, next) => {
    c.set("user", { id: "test-user", username: "test-user", role: "USER" });
    await next();
  });
  app.route("/api/v1/payments", paymentsRoutes);
  return app;
};

describe("retired individual course and article purchase API", () => {
  it("never creates a course or article payment", async () => {
    const app = authenticated();
    for (const target of [{ courseId: "c1" }, { articleId: "a1" }, { courseType: "start" }]) {
      const response = await app.request(jsonRequest("/api/v1/payments/create", "POST", target));
      expect(response.status).toBe(410);
      await expect(response.json()).resolves.toMatchObject({
        success: false, code: "LEGACY_PURCHASES_DISABLED",
      });
    }
  });

  it("does not verify non-consumable Apple course purchases", async () => {
    const response = await authenticated().request(jsonRequest(
      "/api/v1/payments/apple/verify", "POST",
      { signedTransactionInfo: "legacy-signed-jws" },
    ));
    expect(response.status).toBe(410);
  });

  it("does not expose old Apple course IAP metadata", async () => {
    const response = await authenticated().request(jsonRequest(
      "/api/v1/payments/apple/course-metadata?courseType=start", "GET",
    ));
    expect(response.status).toBe(410);
  });

  it("keeps the authentication boundary for legacy endpoints", async () => {
    const app = new Hono();
    app.use("/api/v1/payments/*", authMiddleware);
    app.route("/api/v1/payments", paymentsRoutes);
    const response = await app.request(jsonRequest(
      "/api/v1/payments/create", "POST", { courseId: "c1" },
    ));
    expect(response.status).toBe(401);
  });
});
