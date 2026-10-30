/** Source contract of actual Core updatePet Prisma writes, synthetic DB only. */
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  findFirst: vi.fn(), update: vi.fn(), tx: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    pet: { findFirst: m.findFirst },
    $transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      m.tx();
      return cb({ pet: { update: m.update } });
    },
  },
}));
import { updatePet, PetWeightUpdateUnsupportedError } from "./petsService";
beforeEach(() => {
  vi.clearAllMocks();
  m.findFirst.mockResolvedValue({ id: "pet-A", ownerId: "owner-A" });
  m.update.mockImplementation(async ({ data }: { data: object }) => ({ id: "pet-A", ...data }));
});
describe("AG1 nullable measurements Core owner-scoped persistence", () => {
  it("C01 only four approved null fields map to Prisma nullable columns", async () => {
    const d = { heightCm: null, neckGirthCm: null,
      muzzleGirthCm: null, bellyGirthCm: null };
    const value = await updatePet("pet-A", "owner-A", d);
    expect(m.findFirst).toHaveBeenCalledWith({
      where: { id: "pet-A", ownerId: "owner-A" },
    });
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "pet-A", ownerId: "owner-A" },
      data: d,
    }));
    expect(value).toMatchObject(d);
  });
  it("C02 omitted fields never written, partial null does not clear birthDate", async () => {
    await updatePet("pet-A", "owner-A", { neckGirthCm: null, heightCm: 31 });
    const data = m.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data).toEqual({ neckGirthCm: null, heightCm: 31 });
    expect(data).not.toHaveProperty("name");
    expect(data).not.toHaveProperty("birthDate");
    expect(data).not.toHaveProperty("weightKg");
  });
  it("C03 direct Core legacy weight write is explicitly rejected, never silently ignored", async () => {
    await expect(updatePet("pet-A", "owner-A", { weightKg: 22 }))
      .rejects.toBeInstanceOf(PetWeightUpdateUnsupportedError);
    await expect(updatePet("pet-A", "owner-A", { weightKg: null } as never))
      .rejects.toBeInstanceOf(PetWeightUpdateUnsupportedError);
    expect(m.update).not.toHaveBeenCalled();
  });
  it("C04 foreign pet not found, no mutation or transaction", async () => {
    m.findFirst.mockResolvedValueOnce(null);
    expect(await updatePet("pet-B", "owner-A", { neckGirthCm: null })).toBeNull();
    expect(m.update).not.toHaveBeenCalled();
    expect(m.tx).not.toHaveBeenCalled();
  });
});
