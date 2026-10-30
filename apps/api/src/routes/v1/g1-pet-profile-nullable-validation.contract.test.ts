/** Live Hono handlers, mocked Core, no SQL or production I/O. */
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { petUpdate, profileUpdate } = vi.hoisted(() => ({
  petUpdate: vi.fn(),
  profileUpdate: vi.fn(),
}));
vi.mock("@gafus/core/services/pets", async (load) => ({
  ...(await load<object>()),
  updatePet: petUpdate,
}));
vi.mock("@gafus/core/services/user", async (load) => ({
  ...(await load<object>()),
  updateUserProfile: profileUpdate,
}));
import { petsRoutes } from "./pets";
import { userRoutes } from "./user";
const app = new Hono();
for (const prefix of ["/api/v1/pets/*", "/api/v1/user/*"]) {
  app.use(prefix, async (c, next) => {
    c.set("user", { id: "owner-A", username: "a", role: "USER" });
    await next();
  });
}
app.route("/api/v1/pets", petsRoutes);
app.route("/api/v1/user", userRoutes);
const request = (path: string, body: object) =>
  app.request(path, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const pet = (body: object) => request("/api/v1/pets/pet-A", body);
const profile = (body: object) => request("/api/v1/user/profile", body);
beforeEach(() => {
  vi.clearAllMocks();
  petUpdate.mockImplementation(async (id: string, owner: string, fields: object) => ({
    id,
    ownerId: owner,
    ...fields,
  }));
  profileUpdate.mockImplementation(async (owner: string, fields: object) => ({
    userId: owner,
    ...fields,
  }));
});
describe("AG1 pet nullable measurement clear, stable fieldErrors", () => {
  it("P01 exactly four AG4-approved nullable measurements clear for verified owner", async () => {
    const fields = { heightCm: null, neckGirthCm: null, muzzleGirthCm: null, bellyGirthCm: null };
    const res = await pet(fields);
    expect(res.status).toBe(200);
    expect(petUpdate).toHaveBeenCalledWith("pet-A", "owner-A", fields);
  });
  it("P02 null/number partial patch retains omitted fields", async () => {
    const res = await pet({ heightCm: 34, neckGirthCm: null });
    expect(res.status).toBe(200);
    expect(petUpdate).toHaveBeenCalledWith("pet-A", "owner-A", {
      heightCm: 34,
      neckGirthCm: null,
    });
  });
  it("P03 required non-null fields reject null/empty, 400 fieldErrors", async () => {
    for (const field of ["name", "type", "breed", "birthDate"]) {
      const res = await pet({ [field]: null });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({
        code: "PET_VALIDATION_ERROR",
        fieldErrors: { [field]: expect.any(String) },
      });
    }
    expect((await pet({ name: "" })).status).toBe(400);
    expect((await pet({ birthDate: "invalid" })).status).toBe(400);
    expect(petUpdate).not.toHaveBeenCalled();
  });
  it("P03a rejects Gregorian rollover and future pet birthDate on PUT before Core writes", async () => {
    const tomorrow = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10);
    const invalid = [
      "2021-02-29",
      "2021-02-30",
      "2020-02-30",
      "2021-13-01",
      tomorrow,
      "2021-02-30T00:00:00.000Z",
      `${tomorrow}T00:00:00.000Z`,
    ];
    for (const birthDate of invalid) {
      const result = await pet({ birthDate });
      expect(result.status).toBe(400);
      expect(await result.json()).toMatchObject({
        code: "PET_VALIDATION_ERROR",
        fieldErrors: { birthDate: "INVALID_VALUE" },
      });
    }
    expect(petUpdate).not.toHaveBeenCalled();
  });
  it("P03b retains valid Gregorian leap birthDate and existing ISO client edit", async () => {
    for (const birthDate of ["2020-02-29", "2020-02-29T00:00:00.000Z"]) {
      const result = await pet({ birthDate });
      expect(result.status).toBe(200);
      expect(petUpdate).toHaveBeenLastCalledWith("pet-A", "owner-A", { birthDate });
    }
    expect(petUpdate).toHaveBeenCalledTimes(2);
  });
  it("P04 measurements invalid types/bounds return stable fields 400", async () => {
    for (const field of ["heightCm", "neckGirthCm", "muzzleGirthCm", "bellyGirthCm"]) {
      const res = await pet({ [field]: "35" });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({
        code: "PET_VALIDATION_ERROR",
        fieldErrors: { [field]: expect.any(String) },
      });
    }
    for (const weightKg of [null, 0, 10, 201, "10"]) {
      const res = await pet({ weightKg });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({
        code: "PET_VALIDATION_ERROR",
        fieldErrors: { weightKg: "UNSUPPORTED_FIELD" },
      });
    }
    expect(petUpdate).not.toHaveBeenCalled();
  });
  it("P05 foreign pet masked 404 with stable PET_NOT_FOUND", async () => {
    petUpdate.mockResolvedValueOnce(null);
    const res = await pet({ heightCm: null });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ success: false, code: "PET_NOT_FOUND" });
  });
  it("P06 forged owner ignored; old mobile toggle and date still work", async () => {
    expect((await pet({ heightCm: null, ownerId: "B" })).status).toBe(200);
    expect(petUpdate).toHaveBeenCalledWith("pet-A", "owner-A", { heightCm: null });
    petUpdate.mockClear();
    expect((await pet({ showInProfile: false, birthDate: "2021-06-10" })).status).toBe(200);
    expect(petUpdate).toHaveBeenCalledWith("pet-A", "owner-A", {
      showInProfile: false,
      birthDate: "2021-06-10",
    });
  });
});
describe("AG1 profile nullable/validation Web Mobile contract", () => {
  it("U01 existing empty string clearing preserved", async () => {
    const res = await profile({ city: "", about: "" });
    expect(res.status).toBe(200);
    expect(profileUpdate).toHaveBeenCalledWith("owner-A", { city: "", about: "" });
  });
  it("U02 null not allowed in profile; 400 fieldErrors no Core write", async () => {
    for (const field of ["city", "fullName", "about", "website", "birthDate"]) {
      const res = await profile({ [field]: null });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({
        code: "PROFILE_VALIDATION_ERROR",
        fieldErrors: { [field]: expect.any(String) },
      });
      expect(res.headers.get("cache-control")).toBe("private, no-store");
    }
    expect(profileUpdate).not.toHaveBeenCalled();
  });
  it("U03 social transform invalid input returns 400 not 500", async () => {
    const res = await profile({ website: "not a url" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: "PROFILE_VALIDATION_ERROR",
      fieldErrors: { website: expect.any(String) },
    });
  });
  it("U04 invalid profile date is structured 400, legacy empty-date clear succeeds", async () => {
    const denied = await profile({ birthDate: "not-a-date" });
    expect(denied.status).toBe(400);
    expect(await denied.json()).toMatchObject({
      code: "PROFILE_VALIDATION_ERROR",
      fieldErrors: { birthDate: "INVALID_VALUE" },
    });
    expect(profileUpdate).not.toHaveBeenCalled();
    expect((await profile({ birthDate: "" })).status).toBe(200);
  });
  it("U04a rejects invalid/future profile birthday but preserves ISO and empty clear", async () => {
    const tomorrow = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10);
    for (const birthDate of ["2021-02-29", "2021-02-30", tomorrow, "2021-02-30T00:00:00.000Z"]) {
      const r = await profile({ birthDate });
      expect(r.status).toBe(400);
      expect(await r.json()).toMatchObject({
        code: "PROFILE_VALIDATION_ERROR",
        fieldErrors: { birthDate: "INVALID_VALUE" },
      });
    }
    expect(profileUpdate).not.toHaveBeenCalled();
    for (const birthDate of ["2020-02-29", "2020-02-29T00:00:00.000Z", ""]) {
      const r = await profile({ birthDate });
      expect(r.status).toBe(200);
      expect(profileUpdate).toHaveBeenLastCalledWith("owner-A", { birthDate });
    }
  });
  it("U05 spoofed owner ID never reaches Core", async () => {
    expect((await profile({ city: "Самара", userId: "owner-B" })).status).toBe(200);
    expect(profileUpdate).toHaveBeenCalledWith("owner-A", { city: "Самара" });
  });
});
