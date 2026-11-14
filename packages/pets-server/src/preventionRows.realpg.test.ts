/** No shared DB access: opt-in, dedicated PostgreSQL 18 loopback only. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import {
  readOwnedPreventionPet,
  readOwnedPreventionEntryForUpdate,
  readOwnedPreventionEntryId,
  createPreventionRow,
  updateOwnedPreventionRow,
  deleteOwnedPreventionRow,
  readPreventionRowsByPet,
  readOwnedPreventionPetIds,
  readPreventionRowsByPets,
  withPreventionTransaction,
  readExistingPreventionClientRow,
  createPreventionRowTx,
  updateOwnedPreventionRowTx,
} from "./preventionRows";

const qa = describe.runIf(process.env.GAFUS_PREVENTION_ROWS_REAL_PG === "enabled");
const ownerId = "prevention-rows-qa-owner";
const foreignId = "prevention-rows-qa-foreign";
const petId = "prevention-rows-qa-pet";
const performedAt = new Date("2026-11-01T09:00:00.000Z");
const reminderDate = new Date("2026-12-01T00:00:00.000Z");
let firstId = "";
let createdDb = false;

qa("isolated private prevention diary persistence (PG18)", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    expect(url.protocol).toBe("postgresql:");
    expect(url.hostname).toBe("127.0.0.1");
    expect(url.pathname).toBe("/gafus_prevention_rows_qa");
    const identity = await prisma.$queryRawUnsafe<{ db: string; version: number }[]>(
      "SELECT current_database() AS db, current_setting('server_version_num')::integer AS version",
    );
    expect(identity[0]?.db).toBe("gafus_prevention_rows_qa");
    expect(identity[0]?.version).toBeGreaterThanOrEqual(180000);
    createdDb = true;
    await prisma.user.createMany({
      data: [
        { id: ownerId, username: ownerId, password: "fictional-test-only", role: "USER" },
        { id: foreignId, username: foreignId, password: "fictional-test-only", role: "USER" },
      ],
    });
    await prisma.pet.create({
      data: {
        id: petId,
        ownerId,
        name: "Private pet",
        type: "DOG",
        breed: "Mixed",
        birthDate: new Date("2023-01-01T00:00:00Z"),
      },
    });
  });
  afterAll(async () => {
    if (!createdDb) return;
    await prisma.pet.deleteMany({ where: { id: petId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, foreignId] } } });
    await prisma.$disconnect();
  });

  it("selects only the authenticated owner's pet and keeps owner scoping in batch projections", async () => {
    expect((await readOwnedPreventionPet(ownerId, petId))?.id).toBe(petId);
    expect(await readOwnedPreventionPet(foreignId, petId)).toBeNull();
    expect((await readOwnedPreventionPetIds(ownerId, [petId])).map((row) => row.id)).toEqual([
      petId,
    ]);
    expect(await readOwnedPreventionPetIds(foreignId, [petId])).toEqual([]);
    expect(await readPreventionRowsByPets(foreignId, [petId])).toEqual([]);
  });

  it("creates receipt with database null, and fences foreign edits/deletes even with the exact ID", async () => {
    const row = await createPreventionRow({
      petId,
      ownerId,
      clientId: "prevention-unique-1",
      type: "VACCINATION",
      performedAt,
      reminderEnabled: true,
      reminderKind: "AFTER_DAYS",
      reminderDaysAfter: 30,
      reminderOnDate: null,
      remindAt: reminderDate,
      reminderTimes: ["09:00", "21:00"],
      lastNotifiedForRemindAt: null,
    });
    firstId = row.id;
    expect(row.sentTimesForRemindAt).toBeNull();
    expect((await readOwnedPreventionEntryForUpdate(ownerId, petId, row.id))?.id).toBe(row.id);
    expect(await readOwnedPreventionEntryForUpdate(foreignId, petId, row.id)).toBeNull();
    expect(await readOwnedPreventionEntryId(foreignId, petId, row.id)).toBeNull();
    await expect(
      updateOwnedPreventionRow(
        foreignId,
        petId,
        row.id,
        {
          productName: "secret mutation",
        },
        true,
      ),
    ).rejects.toMatchObject({ code: "P2025" });
    await expect(deleteOwnedPreventionRow(foreignId, petId, row.id)).rejects.toMatchObject({
      code: "P2025",
    });
    expect((await readPreventionRowsByPet(ownerId, petId)).map((v) => v.id)).toEqual([row.id]);
    expect(await readPreventionRowsByPet(foreignId, petId)).toEqual([]);
  });

  it("keeps sentTimes stable on same reminder date and clears only when date changed", async () => {
    await prisma.petPreventionEntry.update({
      where: { id: firstId },
      data: {
        sentTimesForRemindAt: ["09:00"],
      },
    });
    const same = await updateOwnedPreventionRow(
      ownerId,
      petId,
      firstId,
      {
        productName: "Same date",
      },
      false,
    );
    expect(same.sentTimesForRemindAt).toEqual(["09:00"]);
    const changed = await updateOwnedPreventionRow(
      ownerId,
      petId,
      firstId,
      {
        remindAt: new Date("2026-12-05T00:00:00Z"),
      },
      true,
    );
    expect(changed.sentTimesForRemindAt).toBeNull();
  });

  it("deduplicates the per-pet clientId in one SQL transaction, fences cross-user update, and rolls back", async () => {
    const clientId = "prevention-unique-batch";
    await expect(
      withPreventionTransaction(async (tx) => {
        expect(await readExistingPreventionClientRow(tx, petId, clientId)).toBeNull();
        const row = await createPreventionRowTx(tx, {
          petId,
          ownerId,
          clientId,
          type: "DEWORMING",
          performedAt,
          reminderEnabled: false,
          reminderKind: "AFTER_DAYS",
          reminderTimes: ["09:00"],
          lastNotifiedForRemindAt: null,
        });
        expect((await readExistingPreventionClientRow(tx, petId, clientId))?.id).toBe(row.id);
        await updateOwnedPreventionRowTx(
          tx,
          ownerId,
          petId,
          row.id,
          {
            productName: "Updated through shared tx",
          },
          false,
        );
        await updateOwnedPreventionRowTx(
          tx,
          foreignId,
          petId,
          row.id,
          {
            productName: "forbidden",
          },
          true,
        );
      }),
    ).rejects.toMatchObject({ code: "P2025" });
    expect(
      await prisma.petPreventionEntry.count({
        where: { petId, clientId },
      }),
    ).toBe(0);
    await expect(
      withPreventionTransaction(async (tx) => {
        await createPreventionRowTx(tx, {
          petId,
          ownerId,
          clientId: "prevention-rollback",
          type: "DEWORMING",
          performedAt,
          reminderEnabled: false,
          reminderKind: "AFTER_DAYS",
          reminderTimes: ["09:00"],
          lastNotifiedForRemindAt: null,
        });
        throw new Error("SYNTHETIC_ROLLBACK");
      }),
    ).rejects.toThrow("SYNTHETIC_ROLLBACK");
    expect(
      await prisma.petPreventionEntry.count({
        where: { petId, clientId: "prevention-rollback" },
      }),
    ).toBe(0);
    await deleteOwnedPreventionRow(ownerId, petId, firstId);
    expect(await readOwnedPreventionEntryId(ownerId, petId, firstId)).toBeNull();
  });
});
