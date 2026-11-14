import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPreventionRow,
  updateOwnedPreventionRow,
  deleteOwnedPreventionRow,
  readOwnedPreventionPet,
  readOwnedPreventionEntryForUpdate,
  readOwnedPreventionEntryId,
  readPreventionRowsByPet,
  readOwnedPreventionPetIds,
  readPreventionRowsByPets,
  withPreventionTransaction,
  readExistingPreventionClientRow,
  createPreventionRowTx,
  updateOwnedPreventionRowTx,
} from "./preventionRows";

const db = vi.hoisted(() => ({
  petFindFirst: vi.fn(),
  petFindMany: vi.fn(),
  entryFindFirst: vi.fn(),
  entryFindMany: vi.fn(),
  entryCreate: vi.fn(),
  entryUpdate: vi.fn(),
  entryDelete: vi.fn(),
  transaction: vi.fn(),
  txUnique: vi.fn(),
  txCreate: vi.fn(),
  txUpdate: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  Prisma: { DbNull: { _tag: "DbNull" } },
  prisma: {
    pet: { findFirst: db.petFindFirst, findMany: db.petFindMany },
    petPreventionEntry: {
      findFirst: db.entryFindFirst,
      findMany: db.entryFindMany,
      create: db.entryCreate,
      update: db.entryUpdate,
      delete: db.entryDelete,
    },
    $transaction: db.transaction,
  },
}));
const tx = {
  petPreventionEntry: {
    findUnique: db.txUnique,
    create: db.txCreate,
    update: db.txUpdate,
  },
};
beforeEach(() => {
  vi.resetAllMocks();
  db.transaction.mockImplementation((work) => work(tx));
});

const data = {
  ownerId: "owner-A",
  petId: "pet-A",
  clientId: "event-1",
  type: "VACCINATION" as const,
  performedAt: new Date("2026-11-01T09:00:00Z"),
  reminderEnabled: true,
  reminderKind: "AFTER_DAYS" as const,
  reminderDaysAfter: 30,
  reminderOnDate: null,
  remindAt: new Date("2026-12-01T00:00:00Z"),
  reminderTimes: ["09:00"],
  lastNotifiedForRemindAt: null,
};

describe("Pet prevention diary SQL isolation", () => {
  it("uses only owner-scoped pet and diary projections with a bounded list", async () => {
    await readOwnedPreventionPet("owner-A", "pet-A");
    await readOwnedPreventionEntryForUpdate("owner-A", "pet-A", "diary-A");
    await readOwnedPreventionEntryId("owner-A", "pet-A", "diary-A");
    await readPreventionRowsByPet("owner-A", "pet-A");
    await readOwnedPreventionPetIds("owner-A", ["pet-A", "pet-B"]);
    await readPreventionRowsByPets("owner-A", ["pet-A"]);
    expect(db.petFindFirst).toHaveBeenCalledWith({
      where: { id: "pet-A", ownerId: "owner-A" },
      select: { id: true },
    });
    expect(db.entryFindFirst).toHaveBeenNthCalledWith(2, {
      where: { id: "diary-A", ownerId: "owner-A", petId: "pet-A" },
      select: { id: true },
    });
    expect(db.entryFindMany).toHaveBeenNthCalledWith(1, {
      where: { petId: "pet-A", ownerId: "owner-A" },
      orderBy: { performedAt: "desc" },
      take: 100,
      select: expect.objectContaining({ id: true, performedAt: true }),
    });
    expect(db.entryFindMany).toHaveBeenNthCalledWith(2, {
      where: { ownerId: "owner-A", petId: { in: ["pet-A"] } },
      orderBy: { performedAt: "desc" },
      take: 500,
      select: expect.objectContaining({ petId: true, reminderTimes: true }),
    });
  });

  it("normalizes JSON null at DB boundary and atomically fences update/delete by owner and pet", async () => {
    await createPreventionRow(data);
    expect(db.entryCreate).toHaveBeenCalledWith({
      data: { ...data, sentTimesForRemindAt: { _tag: "DbNull" } },
      select: expect.objectContaining({ reminderTimes: true }),
    });
    await updateOwnedPreventionRow("owner-A", "pet-A", "diary-A", { productName: "Updated" }, true);
    expect(db.entryUpdate).toHaveBeenCalledWith({
      where: { id: "diary-A", ownerId: "owner-A", petId: "pet-A" },
      data: { productName: "Updated", sentTimesForRemindAt: { _tag: "DbNull" } },
      select: expect.objectContaining({ clientId: true }),
    });
    await deleteOwnedPreventionRow("owner-A", "pet-A", "diary-A");
    expect(db.entryDelete).toHaveBeenCalledWith({
      where: { id: "diary-A", ownerId: "owner-A", petId: "pet-A" },
    });
  });

  it("leaves reminder receipt intact when scheduled date does not change", async () => {
    await updateOwnedPreventionRow(
      "owner-A",
      "pet-A",
      "diary-A",
      { lastNotifiedForRemindAt: new Date("2026-11-05T00:00:00Z") },
      false,
    );
    expect(db.entryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sentTimesForRemindAt: undefined }),
      }),
    );
  });

  it("transactional batch is atomic; unique clientId lookup and owner-fenced mutation use caller tx", async () => {
    await withPreventionTransaction(async (client) => {
      await readExistingPreventionClientRow(client, "pet-A", "event-1");
      await createPreventionRowTx(client, data);
      await updateOwnedPreventionRowTx(
        client,
        "owner-A",
        "pet-A",
        "diary-A",
        { productName: "Changed" },
        true,
      );
    });
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(db.txUnique).toHaveBeenCalledWith({
      where: { petId_clientId: { petId: "pet-A", clientId: "event-1" } },
      select: { id: true, remindAt: true, lastNotifiedForRemindAt: true },
    });
    expect(db.txCreate).toHaveBeenCalledWith({
      data: { ...data, sentTimesForRemindAt: { _tag: "DbNull" } },
      select: { id: true },
    });
    expect(db.txUpdate).toHaveBeenCalledWith({
      where: { id: "diary-A", ownerId: "owner-A", petId: "pet-A" },
      data: { productName: "Changed", sentTimesForRemindAt: { _tag: "DbNull" } },
    });
  });
});
