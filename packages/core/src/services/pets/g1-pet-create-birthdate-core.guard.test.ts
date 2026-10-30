/** Core G05 create with original idempotent and legacy paths, no real DB/queues/media. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  create: vi.fn(),
  tx: vi.fn(),
  txCreate: vi.fn(),
  claim: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    pet: { create: db.create },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      db.tx();
      return callback({ pet: { create: db.txCreate }, $queryRawUnsafe: db.claim });
    },
  },
}));
vi.mock("@gafus/logger", () => ({ createWebLogger: () => ({ error: vi.fn() }) }));
vi.mock("@gafus/cdn-upload", () => ({}));
vi.mock("./petVetVisitService", () => ({ enqueuePetVetCleanup: vi.fn(), lockVetPet: vi.fn() }));
import { createPet } from "./petsService";

const owner = "owner-synthetic";
const requestKey = "ff004077-1520-41e2-8c19-0d0590202400";
const valid = { name: "Бим", type: "DOG", breed: "Метис", birthDate: "2020-02-29" };
beforeEach(() => {
  vi.clearAllMocks();
  db.create.mockResolvedValue({ id: "pet-synthetic", ownerId: owner });
  db.txCreate.mockResolvedValue({ id: "pet-synthetic", ownerId: owner });
  db.claim.mockResolvedValue([{ petId: "pet-synthetic" }]);
});

describe("PETS021 G05 direct Core create requires a real nonfuture date before any write", () => {
  it("legacy unkeyed create rejects calendar rollover/future/non-ISO before Prisma insert", async () => {
    const tomorrow = new Date(Date.now() + 172_800_000).toISOString().slice(0, 10);
    for (const birthDate of [
      "2021-02-29",
      "2021-02-30",
      tomorrow,
      "2021-02-30T00:00:00.000Z",
      "29.02.2020",
      "not-a-date",
    ]) {
      await expect(createPet(owner, { ...valid, birthDate })).rejects.toThrow();
    }
    expect(db.create).not.toHaveBeenCalled();
    expect(db.tx).not.toHaveBeenCalled();
  });
  it("idempotent keyed create rejects bad birthday before any transaction, receipt or insert", async () => {
    for (const birthDate of ["2021-02-30", "2099-01-01"]) {
      await expect(
        createPet(owner, { ...valid, birthDate, clientRequestId: requestKey }),
      ).rejects.toThrow();
    }
    expect(db.tx).not.toHaveBeenCalled();
    expect(db.txCreate).not.toHaveBeenCalled();
    expect(db.claim).not.toHaveBeenCalled();
  });
  it("rejects invalid numeric measurements and weight before either legacy insert or keyed receipt transaction", async () => {
    const bad = [
      { weightKg: -1 },
      { weightKg: 0 },
      { weightKg: 201 },
      { weightKg: NaN },
      { heightCm: 0 },
      { heightCm: -2 },
      { neckGirthCm: Infinity },
      { muzzleGirthCm: -1 },
      { bellyGirthCm: 0 },
    ];
    for (const payload of bad) {
      await expect(createPet(owner, { ...valid, ...payload })).rejects.toThrow();
      await expect(
        createPet(owner, { ...valid, ...payload, clientRequestId: requestKey }),
      ).rejects.toThrow();
    }
    expect(db.create).not.toHaveBeenCalled();
    expect(db.tx).not.toHaveBeenCalled();
    expect(db.claim).not.toHaveBeenCalled();
  });
  it("valid leap-day preserves original legacy write and durable request-key receipt", async () => {
    await createPet(owner, valid);
    expect(db.create).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerId: owner,
          birthDate: new Date("2020-02-29T00:00:00.000Z"),
        }),
      }),
    );
    await createPet(owner, { ...valid, clientRequestId: requestKey });
    expect(db.tx).toHaveBeenCalledOnce();
    expect(db.txCreate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerId: owner,
          birthDate: new Date("2020-02-29T00:00:00.000Z"),
        }),
      }),
    );
    expect(db.claim).toHaveBeenCalledOnce();
    const args = db.claim.mock.calls[0];
    expect(args[1]).toBe(owner);
    expect(args[2]).toBe(requestKey);
  });
});
