import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { authMiddleware } from "../../middleware/auth";
import { jsonRequest } from "../../test/route-test-utils";
import { petsRoutes } from "./pets";

function createTestApp() {
  const app = new Hono();
  app.use("/api/v1/pets/*", authMiddleware);
  app.route("/api/v1/pets", petsRoutes);
  return app;
}

function createAuthenticatedTestApp() {
  const app = new Hono();
  app.use("/api/v1/pets/*", async (c, next) => {
    c.set("user", { id: "user-1", username: "student", role: "USER" });
    await next();
  });
  app.route("/api/v1/pets", petsRoutes);
  return app;
}

describe("pets route contracts", () => {
  it("requires auth before creating a pet", async () => {
    const app = createTestApp();

    const response = await app.request(
      jsonRequest("/api/v1/pets", "POST", {
        name: "Бим",
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: "Токен не предоставлен",
    });
  });

  it("rejects pet creation when required fields are missing", async () => {
    const app = createAuthenticatedTestApp();

    const response = await app.request(
      jsonRequest("/api/v1/pets", "POST", {
        name: "Бим",
      }),
    );

    expect(response.status).toBe(400);
  });
});
