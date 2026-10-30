import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { authMiddleware } from "../../middleware/auth";
import { jsonRequest } from "../../test/route-test-utils";
import { petsRoutes } from "./pets";
import { createPet, updatePet, PetMediaDirectPhotoUrlDeniedError } from "@gafus/core/services/pets";

vi.mock("@gafus/core/services/pets", async (original) => ({
  ...(await original<object>()), updatePet: vi.fn(), createPet: vi.fn(),
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
  beforeEach(() => {
    vi.mocked(updatePet).mockReset();
    vi.mocked(createPet).mockReset();
  });
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


describe("gated direct-photo URL route error mapping (no DB/provider)", () => {
  beforeEach(() => {
    vi.mocked(createPet).mockReset();
    vi.mocked(updatePet).mockReset();
  });
  const safe = {
    success: false,
    code: "PET_MEDIA_DIRECT_PHOTO_URL_DENIED",
    error: "Загрузите фото питомца отдельным запросом",
  };
  const valid = { name: "Бим", type: "DOG", breed: "Mixed", birthDate: "2020-01-01" };
  const samples = [
    "not-a-supported-url?secret=SYNTHETIC_SECRET_CANARY",
    "isodev-avatar:documents/uploads/users/foreign-actor/pets/foreign-pet/a.jpg",
    "cloudru:gallery:gallery/uploads/forbidden-object",
    "https://storage.yandexcloud.net/unrelated-bucket/uploads/private-photo.jpg",
  ];
  it.each(samples)("authenticated POST maps arbitrary/malformed/foreign marker to constant 400: %s", async (photoUrl) => {
    vi.mocked(createPet).mockRejectedValueOnce(new PetMediaDirectPhotoUrlDeniedError());
    const response = await createAuthenticatedTestApp().request(
      jsonRequest("/api/v1/pets", "POST", { ...valid, ownerId: "foreign-actor", photoUrl }),
    );
    expect(response.status).toBe(400);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual(safe);
    expect(vi.mocked(createPet)).toHaveBeenCalledWith("user-1", { ...valid, photoUrl });
    expect(body).not.toContain(photoUrl);
    expect(body).not.toContain("SYNTHETIC_SECRET_CANARY");
  });
  it.each(samples)("authenticated PUT maps arbitrary/malformed/foreign marker to constant 400: %s", async (photoUrl) => {
    vi.mocked(updatePet).mockRejectedValueOnce(new PetMediaDirectPhotoUrlDeniedError());
    const response = await createAuthenticatedTestApp().request(
      jsonRequest("/api/v1/pets/pet-1", "PUT", { photoUrl, ownerId: "foreign-actor" }),
    );
    expect(response.status).toBe(400);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual(safe);
    expect(vi.mocked(updatePet)).toHaveBeenCalledWith("pet-1", "user-1", { photoUrl });
    expect(body).not.toContain(photoUrl);
  });
  it("does not let a provided URL bypass authorization (POST and PUT)", async () => {
    for (const [path, method, body] of [
      ["/api/v1/pets", "POST", { ...valid, photoUrl: samples[1] }],
      ["/api/v1/pets/pet-1", "PUT", { photoUrl: samples[1] }],
    ] as const) {
      const response = await createTestApp().request(jsonRequest(path, method, body));
      expect(response.status).toBe(401);
    }
    expect(createPet).not.toHaveBeenCalled();
    expect(updatePet).not.toHaveBeenCalled();
  });
  it("foreign owned Pet still returns owner-safe 404 before any photo denial", async () => {
    vi.mocked(updatePet).mockResolvedValueOnce(null);
    const response = await createAuthenticatedTestApp().request(
      jsonRequest("/api/v1/pets/pet-foreign", "PUT", { photoUrl: samples[1] }),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ success: false, code: "PET_NOT_FOUND" });
    expect(vi.mocked(updatePet)).toHaveBeenCalledWith("pet-foreign", "user-1", { photoUrl: samples[1] });
  });
  it("JSON type validation rejects non-string marker before calling Core", async () => {
    const response = await createAuthenticatedTestApp().request(
      jsonRequest("/api/v1/pets/pet-1", "PUT", { photoUrl: 123 }),
    );
    expect(response.status).toBe(400);
    expect(vi.mocked(updatePet)).not.toHaveBeenCalled();
  });
  it("default/legacy Core success is not intercepted by new error mapping", async () => {
    vi.mocked(createPet).mockResolvedValueOnce({ id: "pet-1" } as Awaited<ReturnType<typeof createPet>>);
    vi.mocked(updatePet).mockResolvedValueOnce({ id: "pet-1", photoUrl: samples[0] } as Awaited<ReturnType<typeof updatePet>>);
    const created = await createAuthenticatedTestApp().request(
      jsonRequest("/api/v1/pets", "POST", { ...valid, photoUrl: samples[0] }),
    );
    expect(created.status).toBe(201);
    const updated = await createAuthenticatedTestApp().request(
      jsonRequest("/api/v1/pets/pet-1", "PUT", { photoUrl: samples[0] }),
    );
    expect(updated.status).toBe(200);
  });
  it("other Core failures retain masked 500, without messages or credentials", async () => {
    const secret = "STORAGE_KEY_WITH_CREDENTIAL_CANARY";
    vi.mocked(updatePet).mockRejectedValueOnce(new Error(secret));
    const response = await createAuthenticatedTestApp().request(
      jsonRequest("/api/v1/pets/pet-1", "PUT", { photoUrl: samples[0] }),
    );
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain(secret);
  });
});
