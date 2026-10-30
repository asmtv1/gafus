/** G05 real createPet business logic with only the persistence adapter stubbed. */
import { describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@gafus/prisma", () => ({ prisma: { pet: { create: fixture.create } } }));
vi.mock("@gafus/logger", () => ({ createWebLogger: () => ({ error: vi.fn() }) }));
vi.mock("@gafus/cdn-upload", () => ({}));
vi.mock("./petVetVisitService", () => ({ enqueuePetVetCleanup: vi.fn(), lockVetPet: vi.fn() }));
import { createPet } from "./petsService";
describe("G05 RED regression: real Core createPet must persist supplied weight", () => {
  it("RED-G05-04 optional supplied weight must not be discarded before Prisma create", async () => {
    fixture.create.mockResolvedValueOnce({ id: "fixture-pet", ownerId: "owner-A", weightKg: 4.25 });
    await createPet("owner-A", {
      name: "Лайма",
      type: "DOG",
      breed: "Метис",
      birthDate: "2020-02-29",
      weightKg: 4.25,
    });
    expect(fixture.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ownerId: "owner-A", weightKg: 4.25 }),
      }),
    );
  });
  it("G05-G16 omitted weight preserves null", async () => {
    fixture.create.mockReset().mockResolvedValueOnce({ id: "pet-no-weight" });
    await createPet("owner-A", {
      name: "Бим",
      type: "DOG",
      breed: "Метис",
      birthDate: "2020-02-29",
    });
    expect(fixture.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ weightKg: null }) }),
    );
  });
  it("G05-G17 decimal weight reaches Prisma unrounded", async () => {
    fixture.create.mockReset().mockResolvedValueOnce({ id: "fraction-pet" });
    await createPet("owner-A", {
      name: "Бим",
      type: "DOG",
      breed: "Метис",
      birthDate: "2020-02-29",
      weightKg: 0.123456,
    });
    expect(fixture.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ weightKg: 0.123456 }) }),
    );
  });
});
