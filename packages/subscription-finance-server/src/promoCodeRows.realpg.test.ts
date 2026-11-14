/** Opt-in disposable local PostgreSQL 18 transaction test. */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import {
  readPromoCodeByNormalizedCode,
  withPromoCodeRecordsTransaction,
  isUniquePromoCodeError,
} from "./promoCodeRows";

const qa = describe.runIf(process.env.GAFUS_PROMO_ROWS_REAL_PG === "enabled");
const adminId = "promo-qa-admin";
const normalizedCode = "PROMO_QA_2026";

qa("promo persistence transaction and serializable guard", () => {
  let promoId = "";
  let verifiedDisposableDb = false;
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    expect(url.protocol).toBe("postgresql:");
    expect(url.hostname).toBe("127.0.0.1");
    expect(url.pathname).toBe("/gafus_promo_rows_qa");
    const db = await prisma.$queryRawUnsafe<{ db: string; version: number }[]>(
      "SELECT current_database() AS db, current_setting('server_version_num')::integer AS version",
    );
    expect(db[0]?.db).toBe("gafus_promo_rows_qa");
    expect(db[0]?.version).toBeGreaterThanOrEqual(180000);
    verifiedDisposableDb = true;
    await prisma.user.create({
      data: { id: adminId, username: adminId, password: "test-only-not-real", role: "ADMIN" },
    });
  });
  afterAll(async () => {
    if (!verifiedDisposableDb) return;
    await prisma.appSubscriptionPromoCodeEvent.deleteMany({
      where: { promoCode: { normalizedCode } },
    });
    await prisma.appSubscriptionPromoCode.deleteMany({ where: { normalizedCode } });
    await prisma.user.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  it("rolls back a code if a later snapshot append fails", async () => {
    await expect(
      withPromoCodeRecordsTransaction(async (tx) => {
        await tx.create({
          code: "promo-qa-2026",
          normalizedCode,
          discountPercent: 15,
          isActive: true,
          actorId: adminId,
        });
        throw new Error("SNAPSHOT_WRITE_FAILED");
      }),
    ).rejects.toThrow("SNAPSHOT_WRITE_FAILED");
    expect(await readPromoCodeByNormalizedCode(normalizedCode)).toBeNull();
  });

  it("creates and atomically records the initial code snapshot", async () => {
    const code = await withPromoCodeRecordsTransaction(async (tx) => {
      const row = await tx.create({
        code: "promo-qa-2026",
        normalizedCode,
        discountPercent: 15,
        isActive: true,
        actorId: adminId,
      });
      await tx.appendEvent({
        promoCodeId: row.id,
        type: "CREATED",
        actorId: adminId,
        discountPercent: row.discountPercent,
        isActive: row.isActive,
        revision: row.revision,
      });
      return row;
    });
    promoId = code.id;
    expect(code.revision).toBe(1);
    expect((await readPromoCodeByNormalizedCode(normalizedCode))?.id).toBe(code.id);
    const events = await prisma.appSubscriptionPromoCodeEvent.findMany({
      where: { promoCodeId: code.id },
    });
    expect(events.map((row) => row.type)).toEqual(["CREATED"]);
  });

  it("increments revisions, snapshots updates and archive atomically", async () => {
    const updated = await withPromoCodeRecordsTransaction(async (tx) => {
      const prior = await tx.find(promoId);
      expect(prior?.revision).toBe(1);
      const row = await tx.update(promoId, {
        actorId: adminId,
        discountPercent: 30,
        isActive: false,
      });
      await tx.appendEvents([
        {
          promoCodeId: promoId,
          type: "UPDATED",
          actorId: adminId,
          discountPercent: row.discountPercent,
          isActive: row.isActive,
          revision: row.revision,
        },
        {
          promoCodeId: promoId,
          type: "DISABLED",
          actorId: adminId,
          discountPercent: row.discountPercent,
          isActive: row.isActive,
          revision: row.revision,
        },
      ]);
      return row;
    });
    expect(updated.revision).toBe(2);
    expect(updated.discountPercent).toBe(30);
    const archivedAt = new Date("2026-11-10T00:00:00.000Z");
    await withPromoCodeRecordsTransaction(async (tx) => {
      const row = await tx.update(promoId, { actorId: adminId, isActive: false, archivedAt });
      await tx.appendEvent({
        promoCodeId: promoId,
        type: "ARCHIVED",
        actorId: adminId,
        discountPercent: row.discountPercent,
        isActive: row.isActive,
        revision: row.revision,
        createdAt: archivedAt,
      });
    });
    const row = await readPromoCodeByNormalizedCode(normalizedCode);
    expect(row?.revision).toBe(3);
    expect(row?.archivedAt).toEqual(archivedAt);
    const events = await prisma.appSubscriptionPromoCodeEvent.findMany({
      where: { promoCodeId: promoId },
      orderBy: { revision: "asc" },
    });
    expect(events.map((event) => event.type).sort()).toEqual(
      ["ARCHIVED", "CREATED", "DISABLED", "UPDATED"].sort(),
    );
  });

  it("preserves uniqueness even for an archived promo code", async () => {
    await expect(
      withPromoCodeRecordsTransaction(async (tx) => {
        await tx.create({
          code: "promo-qa-2026",
          normalizedCode,
          discountPercent: 10,
          isActive: true,
          actorId: adminId,
        });
      }),
    ).rejects.toSatisfy(isUniquePromoCodeError);
    expect(await prisma.appSubscriptionPromoCode.count({ where: { normalizedCode } })).toBe(1);
  });
});
