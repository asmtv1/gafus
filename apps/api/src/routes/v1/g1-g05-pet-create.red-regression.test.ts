/** G05 expected server safety baseline. Expected RED until AG4 policy is accepted. */
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  create: vi.fn().mockResolvedValue({ id: "synthetic", ownerId: "A" }),
}));
vi.mock("@gafus/core/services/pets", () => ({
  createPet: fixture.create,
  getUserPets: vi.fn(),
  getPetById: vi.fn(),
  updatePet: vi.fn(),
  deletePet: vi.fn(),
  deletePetDocument: vi.fn(),
  listPetDocuments: vi.fn(),
  preparePetDocumentDownload: vi.fn(),
  renamePetDocument: vi.fn(),
  uploadPetDocument: vi.fn(),
  updatePetPhoto: vi.fn(),
  getPetWeightHistory: vi.fn(),
  addPetWeightEntry: vi.fn(),
  deletePetWeightEntry: vi.fn(),
  setPetTargetWeight: vi.fn(),
}));
import { petsRoutes } from "./pets";
async function post(data: Record<string, unknown>) {
  fixture.create.mockClear();
  const app = new Hono();
  app.use("/api/v1/pets/*", async (c, next) => {
    c.set("user", { id: "A", username: "fixture", role: "USER" });
    await next();
  });
  app.route("/api/v1/pets", petsRoutes);
  return app.request("http://fixture.invalid/api/v1/pets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Лайма",
      type: "DOG",
      breed: "Метис",
      birthDate: "2020-02-29",
      ...data,
    }),
  });
}
describe("G05 RED regression: invalid date/weight must fail before Core", () => {
  it("RED-G05-01 non-leap February 29 must be 400", async () => {
    expect((await post({ birthDate: "2025-02-29" })).status).toBe(400);
    expect(fixture.create).not.toHaveBeenCalled();
  });
  it("RED-G05-02 future birth calendar date must be 400", async () => {
    expect((await post({ birthDate: "2099-01-01" })).status).toBe(400);
    expect(fixture.create).not.toHaveBeenCalled();
  });
  it("RED-G05-03 negative weight must be 400", async () => {
    expect((await post({ weightKg: -1 })).status).toBe(400);
    expect(fixture.create).not.toHaveBeenCalled();
  });
  it("G05-G05 approved leap day and min weight", async () => {
    const response = await post({ birthDate: "2020-02-29", weightKg: 0.1 });
    expect(response.status).toBe(201);
    expect(fixture.create).toHaveBeenCalledWith(
      "A",
      expect.objectContaining({ birthDate: "2020-02-29", weightKg: 0.1 }),
    );
  });
  it("G05-G06 valid current UTC day", async () => {
    expect((await post({ birthDate: new Date().toISOString().slice(0, 10) })).status).toBe(201);
  });
  it("G05-G07 random/non-date rejects 400", async () => {
    expect((await post({ birthDate: "not-a-date" })).status).toBe(400);
  });
  it("G05-G08 direct RU DD.MM.YYYY rejected", async () => {
    expect((await post({ birthDate: "29.02.2020" })).status).toBe(400);
  });
  it("G05-G09 ISO timestamp with offset rejected", async () => {
    expect((await post({ birthDate: "2020-02-29T23:30:00+03:00" })).status).toBe(400);
  });
  it("G05-G10 rejects 0,>200,null and string weight", async () => {
    for (const weightKg of [0, 250, null, "12.5"]) {
      expect((await post({ weightKg })).status).toBe(400);
    }
  });
  it("G05-G11 retains 0.123456 precision without rounding", async () => {
    expect((await post({ weightKg: 0.123456 })).status).toBe(201);
    expect(fixture.create).toHaveBeenCalledWith(
      "A",
      expect.objectContaining({ weightKg: 0.123456 }),
    );
  });
  it("G05-G12 omitted optional weight stays omitted", async () => {
    expect((await post({})).status).toBe(201);
    expect(fixture.create.mock.calls[0]?.[1]).not.toHaveProperty("weightKg");
  });
  it("G05-G13 UTC skipped-civil-zone calendar value stable", async () => {
    expect((await post({ birthDate: "2011-12-30" })).status).toBe(201);
  });
  it("G05-G14 forged ownerId stripped from parsed payload", async () => {
    expect((await post({ ownerId: "B", userId: "B" })).status).toBe(201);
    expect(fixture.create).toHaveBeenCalledWith("A", expect.not.objectContaining({ ownerId: "B" }));
  });
  it("G05-G15 negative centimeters rejected for create only", async () => {
    for (const key of ["heightCm", "neckGirthCm", "muzzleGirthCm", "bellyGirthCm"]) {
      expect((await post({ [key]: -1 })).status).toBe(400);
    }
  });
});
