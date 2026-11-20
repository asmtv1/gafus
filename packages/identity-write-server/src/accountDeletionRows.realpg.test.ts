/** Explicit opt-in: only disposable loopback PG18, never shared or production DB. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import {
  readAccountDeletionPreflightRow,
  readAccountDeletionActorRow,
  readAccountDeletionAuthoredCounts,
  readAccountDeletionRequestedAt,
  readAccountDeletionChallenge,
  replaceAccountDeletionChallenge,
  deleteAccountAndPersistCleanup,
} from "./accountDeletionRows";

const qa = describe.runIf(process.env.GAFUS_ACCOUNT_DELETE_REAL_PG === "enabled");
const owner = "account-delete-qa-owner";
const rollbackOwner = "account-delete-qa-rollback";
const now = new Date("2026-11-10T18:00:00Z");
let disposable = false;

qa("account self-delete durable transactional ledger on real PG18", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    expect(url.protocol).toBe("postgresql:");
    expect(url.hostname).toBe("127.0.0.1");
    expect(url.pathname).toBe("/gafus_account_delete_qa");
    const identity = await prisma.$queryRawUnsafe<{ db: string; version: number }[]>(
      "SELECT current_database() AS db, current_setting('server_version_num')::integer AS version",
    );
    expect(identity[0]?.db).toBe("gafus_account_delete_qa");
    expect(identity[0]?.version).toBeGreaterThanOrEqual(180000);
    disposable = true;
    await prisma.user.createMany({
      data: [
        {
          id: owner,
          username: owner,
          password: "fictional-test-only",
          email: "owner@synthetic.test",
          role: "USER",
        },
        {
          id: rollbackOwner,
          username: rollbackOwner,
          password: "fictional-test-only",
          role: "USER",
        },
      ],
    });
  });
  afterAll(async () => {
    if (!disposable) return;
    await prisma.accountDeletionToken.deleteMany({
      where: { userId: { in: [owner, rollbackOwner] } },
    });
    // The audit is append-only; the entire owned PG cluster is removed by QA teardown.
    await prisma.accountStorageCleanup.deleteMany({
      where: { ownerId: { in: [owner, rollbackOwner] } },
    });
    await prisma.accountDeletionCounter.deleteMany({ where: { id: "global" } });
    await prisma.user.deleteMany({ where: { id: { in: [owner, rollbackOwner] } } });
    await prisma.$disconnect();
  });
  it("retrieves only minimal self-delete fields and counts authored content", async () => {
    const preflight = await readAccountDeletionPreflightRow(owner);
    expect(preflight).toEqual({
      id: owner,
      username: owner,
      email: "owner@synthetic.test",
    });
    expect((await readAccountDeletionActorRow(owner))?.role).toBe("USER");
    expect(await readAccountDeletionAuthoredCounts(owner)).toEqual([0, 0, 0, 0, 0]);
    expect((await readAccountDeletionRequestedAt(owner))?.accountDeletionRequestedAt).toBeNull();
  });
  it("persists and replaces the owner's single-use email challenge in one transaction", async () => {
    expect(
      await replaceAccountDeletionChallenge(
        owner,
        new Date("2026-11-12T00:00:00Z"),
        8,
        () => "123456",
      ),
    ).toBe("123456");
    expect((await readAccountDeletionChallenge(owner, "123456"))?.shortCode).toBe("123456");
    expect(
      await replaceAccountDeletionChallenge(
        owner,
        new Date("2026-11-13T00:00:00Z"),
        8,
        () => "654321",
      ),
    ).toBe("654321");
    expect(await readAccountDeletionChallenge(owner, "123456")).toBeNull();
    expect((await readAccountDeletionChallenge(owner, "654321"))?.expiresAt).toEqual(
      new Date("2026-11-13T00:00:00Z"),
    );
  });
  it("failed durable cleanup callback rolls back token, revocation and all rows", async () => {
    await prisma.accountDeletionToken.create({
      data: {
        userId: rollbackOwner,
        shortCode: "111111",
        expiresAt: new Date("2026-11-14T00:00:00Z"),
      },
    });
    await expect(
      deleteAccountAndPersistCleanup(rollbackOwner, "USER", false, now, async (tx) => {
        await tx.accountStorageCleanup.create({
          data: {
            id: "account-delete-qa-rollback-intent",
            ownerId: rollbackOwner,
            scope: "public",
            keys: ["synthetic"],
            prefixes: [],
          },
        });
        throw Error("SYNTHETIC_CLEANUP_FAILURE");
      }),
    ).rejects.toThrow("SYNTHETIC_CLEANUP_FAILURE");
    expect(await prisma.accountDeletionToken.count({ where: { userId: rollbackOwner } })).toBe(1);
    expect(
      await prisma.user.findUnique({ where: { id: rollbackOwner }, select: { id: true } }),
    ).toEqual({ id: rollbackOwner });
    expect(await prisma.accountStorageCleanup.count({ where: { ownerId: rollbackOwner } })).toBe(0);
    expect(await prisma.accountDeletionAudit.count({ where: { userId: rollbackOwner } })).toBe(0);
  });
  it("commits cleanup record and deletion audit atomically before account cascade", async () => {
    await deleteAccountAndPersistCleanup(owner, "USER", true, now, async (tx, userId) => {
      expect(userId).toBe(owner);
      await tx.accountStorageCleanup.create({
        data: {
          id: "account-delete-qa-cleanup",
          ownerId: userId,
          scope: "public",
          keys: ["synthetic://private-file"],
          prefixes: [],
        },
      });
    });
    expect(await prisma.user.findUnique({ where: { id: owner } })).toBeNull();
    expect(await prisma.accountDeletionToken.count({ where: { userId: owner } })).toBe(0);
    expect(
      (
        await prisma.accountStorageCleanup.findUnique({
          where: { id: "account-delete-qa-cleanup" },
        })
      )?.ownerId,
    ).toBe(owner);
    const audit = await prisma.accountDeletionAudit.findFirst({ where: { userId: owner } });
    expect(audit).toMatchObject({
      userId: owner,
      role: "USER",
      hadEmail: true,
      initiatedBy: "SELF_SERVICE",
    });
    expect(
      (await prisma.accountDeletionCounter.findUnique({ where: { id: "global" } }))?.totalDeleted,
    ).toBe(1);
  });
  it("rejects direct SQL UPDATE DELETE and TRUNCATE against the deletion audit", async () => {
    const before = await prisma.accountDeletionAudit.findFirstOrThrow({
      where: { userId: owner },
    });
    await expect(
      prisma.$executeRaw`UPDATE "AccountDeletionAudit" SET "initiatedBy" = 'TAMPERED' WHERE "id" = ${before.id}`,
    ).rejects.toThrow("ACCOUNT_DELETION_AUDIT_IMMUTABLE");
    await expect(
      prisma.$executeRaw`DELETE FROM "AccountDeletionAudit" WHERE "id" = ${before.id}`,
    ).rejects.toThrow("ACCOUNT_DELETION_AUDIT_IMMUTABLE");
    await expect(
      prisma.$executeRaw`TRUNCATE TABLE "AccountDeletionAudit"`,
    ).rejects.toThrow("ACCOUNT_DELETION_AUDIT_IMMUTABLE");
    const after = await prisma.accountDeletionAudit.findUniqueOrThrow({
      where: { id: before.id },
    });
    expect(after).toEqual(before);
    expect(await prisma.accountDeletionAudit.count({ where: { userId: owner } })).toBe(1);
  });
});
