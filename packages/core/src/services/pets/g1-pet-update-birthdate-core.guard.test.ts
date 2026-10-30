/** Actual original Core pet update service, synthetic Prisma write spies only. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ findFirst: vi.fn(), tx: vi.fn(), write: vi.fn() }));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    pet: { findFirst: db.findFirst },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      db.tx();
      return fn({ pet: { update: db.write } });
    },
  },
}));
import { updatePet } from "./petsService";

beforeEach(() => {
  vi.clearAllMocks();
  db.findFirst.mockResolvedValue({ id: "pet-synthetic", ownerId: "owner-synthetic" });
  db.write.mockResolvedValue({ id: "pet-synthetic", ownerId: "owner-synthetic" });
});

describe("PETS021 direct Core birthday write boundary", () => {
  it("rejects nonexistent and future dates before any transaction or write", async () => {
    const future = new Date(Date.now() + 172_800_000).toISOString().slice(0, 10);
    for (const birthDate of [
      "2021-02-29",
      "2021-02-30",
      future,
      "2021-02-30T00:00:00.000Z",
      `${future}T00:00:00.000Z`,
      "not-a-date",
    ]) {
      await expect(updatePet("pet-synthetic", "owner-synthetic", { birthDate })).rejects.toThrow(
        "Неверная дата",
      );
    }
    expect(db.tx).not.toHaveBeenCalled();
    expect(db.write).not.toHaveBeenCalled();
  });
  it("rejects negative/zero/nonfinite measurements before any write and preserves nullable clears", async () => {
    for (const patch of [
      { heightCm: -1 },
      { heightCm: 0 },
      { neckGirthCm: Infinity },
      { muzzleGirthCm: -4 },
      { bellyGirthCm: NaN },
    ]) {
      await expect(updatePet("pet-synthetic", "owner-synthetic", patch)).rejects.toThrow();
    }
    expect(db.tx).not.toHaveBeenCalled();
    expect(db.write).not.toHaveBeenCalled();
    await updatePet("pet-synthetic", "owner-synthetic", { heightCm: null, neckGirthCm: 25.25 });
    expect(db.write).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        data: { heightCm: null, neckGirthCm: 25.25 },
        where: { id: "pet-synthetic", ownerId: "owner-synthetic" },
      }),
    );
  });
  it("allows valid leap birthday and ISO existing client contract through original Core owner transaction", async () => {
    for (const birthDate of ["2020-02-29", "2020-02-29T00:00:00.000Z"]) {
      await updatePet("pet-synthetic", "owner-synthetic", { birthDate });
    }
    expect(db.tx).toHaveBeenCalledTimes(2);
    for (const [call] of db.write.mock.calls) {
      expect(call.where).toEqual({ id: "pet-synthetic", ownerId: "owner-synthetic" });
      expect(call.data.birthDate).toEqual(new Date("2020-02-29T00:00:00.000Z"));
    }
  });
});
