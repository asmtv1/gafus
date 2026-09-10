import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { getClientAppContext } from "./client-app-context";

function appForContext() {
  const app = new Hono();
  app.get("/", (c) => c.json(getClientAppContext(c)));
  return app;
}

describe("getClientAppContext", () => {
  it("normalizes a valid mobile context", async () => {
    const response = await appForContext().request("/", {
      headers: {
        "x-client-platform": "IOS",
        "x-client-version": "1.6.8",
      },
    });
    await expect(response.json()).resolves.toEqual({
      platform: "ios",
      version: "1.6.8",
    });
  });

  it("falls back safely for missing or invalid headers", async () => {
    const response = await appForContext().request("/", {
      headers: {
        "x-client-platform": "web",
        "x-client-version": "latest",
      },
    });
    await expect(response.json()).resolves.toEqual({
      platform: "unknown",
      version: null,
    });
  });
});
