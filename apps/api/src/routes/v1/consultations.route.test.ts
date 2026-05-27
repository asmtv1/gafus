import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { authMiddleware } from "../../middleware/auth";
import { jsonRequest } from "../../test/route-test-utils";
import { consultationsRoutes } from "./consultations";

function createTestApp() {
  const app = new Hono();
  app.use("/api/v1/consultations/*", authMiddleware);
  app.route("/api/v1/consultations", consultationsRoutes);
  return app;
}

function createAuthenticatedTestApp() {
  const app = new Hono();
  app.use("/api/v1/consultations/*", async (c, next) => {
    c.set("user", { id: "user-1", username: "student", role: "USER" });
    await next();
  });
  app.route("/api/v1/consultations", consultationsRoutes);
  return app;
}

describe("consultations route contracts", () => {
  it("requires auth before booking a slot", async () => {
    const app = createTestApp();

    const response = await app.request(
      jsonRequest("/api/v1/consultations/book", "POST", {
        slotId: "slot-1",
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: "Токен не предоставлен",
    });
  });

  it("rejects invalid slot range query before calling slot services", async () => {
    const app = createAuthenticatedTestApp();

    const response = await app.request(
      "/api/v1/consultations/cynologists/trainer-1/slots?from=bad-date&to=also-bad",
    );

    expect(response.status).toBe(400);
  });
});
