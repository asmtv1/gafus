import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { authMiddleware } from "../../middleware/auth";
import { jsonRequest } from "../../test/route-test-utils";
import { petsRoutes } from "./pets";
import { updatePet } from "@gafus/core/services/pets";

vi.mock("@gafus/core/services/pets", async (original) => ({
  ...(await original<object>()), updatePet: vi.fn(),
}));

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
  beforeEach(() => vi.mocked(updatePet).mockReset());
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


describe("pet visibility route", () => {
  it("requires authentication to update visibility", async () => {
    const response = await createTestApp().request(jsonRequest("/api/v1/pets/pet-1", "PUT", { showInProfile: false }));
    expect(response.status).toBe(401);
  });
  it("accepts false without losing it during validation", async () => {
    vi.mocked(updatePet).mockResolvedValueOnce({ id: "pet-1", showInProfile: false } as unknown as Awaited<ReturnType<typeof updatePet>>);
    const response = await createAuthenticatedTestApp().request(jsonRequest("/api/v1/pets/pet-1", "PUT", { showInProfile: false }));
    expect(response.status).toBe(200);
    expect(updatePet).toHaveBeenLastCalledWith("pet-1", "user-1", { showInProfile: false });
    expect(await response.json()).toMatchObject({ success: true, data: { showInProfile: false } });
  });
  it("rejects string booleans", async () => {
    const response = await createAuthenticatedTestApp().request(jsonRequest("/api/v1/pets/pet-1", "PUT", { showInProfile: "false" }));
    expect(response.status).toBe(400);
  });
  it("returns not found when the pet is not owned by this user", async () => {
    vi.mocked(updatePet).mockResolvedValueOnce(null);
    const response = await createAuthenticatedTestApp().request(jsonRequest("/api/v1/pets/other-pet", "PUT", { showInProfile: false }));
    expect(response.status).toBe(404);
  });
});
