import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { jsonRequest } from "../../test/route-test-utils";
import { authRoutes } from "./auth";

function createTestApp() {
  const app = new Hono();
  app.route("/api/v1/auth", authRoutes);
  return app;
}

describe("auth route contracts", () => {
  it("rejects invalid login payloads before calling auth services", async () => {
    const app = createTestApp();

    const response = await app.request(
      jsonRequest("/api/v1/auth/login", "POST", {
        username: "",
        password: "",
      }),
    );

    expect(response.status).toBe(400);
  });
});
