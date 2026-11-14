/** Strictly opt-in isolated local PostgreSQL18 acceptance: never a shared DB. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import {
  updateGafusSettingsAdmin,
  adjustGafusBalanceAdmin,
  getGafusAdminDashboard,
  reviewGafusFraudSignalAdmin,
} from "./index";
import { withGafusAdminRows } from "@gafus/gafus-server/admin-rows";
import { registerGafusAdminRowsPort } from "./adminRowsPort";

const qa = describe.runIf(process.env.GAFUS_ADMIN_ROWS_REAL_PG === "enabled");
const adminId = "admin-rows-qa-administrator";
const viewerId = "admin-rows-qa-viewer";

qa("admin Gafus ORM boundaries, RBAC, idempotency, fraud CAS on PostgreSQL 18", () => {
  beforeAll(async () => {
    registerGafusAdminRowsPort({
      withTransaction(operation, options) {
        return withGafusAdminRows((rows) => operation(rows), options);
      },
    });
    const url = new URL(process.env.DATABASE_URL ?? "");
    expect(url.protocol).toBe("postgresql:");
    expect(url.hostname).toBe("127.0.0.1");
    expect(url.pathname).toBe("/gafus_admin_rows_qa");
    const identity = await prisma.$queryRawUnsafe<{ db: string; version: number }[]>(
      "SELECT current_database() AS db, current_setting('server_version_num')::integer AS version",
    );
    expect(identity[0]?.db).toBe("gafus_admin_rows_qa");
    expect(identity[0]?.version).toBeGreaterThanOrEqual(180000);
    await prisma.user.createMany({
      data: [
        { id: adminId, username: adminId, password: "fictional-test-only", role: "ADMIN" },
        { id: viewerId, username: viewerId, password: "fictional-test-only", role: "USER" },
      ],
    });
  });
  afterAll(() => prisma.$disconnect());

  it("rejects non-admin dashboard and revision changes before any mutation", async () => {
    await expect(getGafusAdminDashboard(viewerId)).rejects.toThrow("FORBIDDEN");
    await expect(
      updateGafusSettingsAdmin({
        actorId: viewerId,
        expectedRevision: 1,
        patch: { earningEnabled: false },
        reason: "Valid reason for denial",
      }),
    ).rejects.toThrow("FORBIDDEN");
    expect(await prisma.gafusSettingsRevision.count()).toBe(0);
    expect(await prisma.gafusAdminAudit.count()).toBe(0);
  });

  it("atomically updates revision snapshot and audit; stale expected version is refused", async () => {
    const result = await updateGafusSettingsAdmin({
      actorId: adminId,
      expectedRevision: 1,
      patch: { postReward: 2 },
      reason: "Reviewed staff policy change",
    });
    expect(result).toMatchObject({ revision: 2, postReward: 2 });
    const row = await prisma.gafusSettings.findUniqueOrThrow({ where: { key: "default" } });
    expect(row.revision).toBe(2);
    expect(row.updatedById).toBe(adminId);
    expect(await prisma.gafusSettingsRevision.count({ where: { revision: 2 } })).toBe(1);
    expect(await prisma.gafusAdminAudit.count({ where: { action: "SETTINGS_UPDATED" } })).toBe(1);
    await expect(
      updateGafusSettingsAdmin({
        actorId: adminId,
        expectedRevision: 1,
        patch: { postReward: 3 },
        reason: "Rejected stale revision",
      }),
    ).rejects.toThrow("SETTINGS_REVISION_CONFLICT");
    expect(await prisma.gafusSettingsRevision.count()).toBe(1);
  });

  it("replays manual credits without double ledger effects and forbids altered request IDs", async () => {
    const request = {
      actorId: adminId,
      userId: viewerId,
      delta: 5,
      requestId: "admin-rows-qa-request-001",
      reason: "Approved manual reconciliation",
    };
    const first = await adjustGafusBalanceAdmin(request);
    expect(first).toMatchObject({ balance: 5, replay: false });
    const replay = await adjustGafusBalanceAdmin(request);
    expect(replay).toMatchObject({ balance: 5, replay: true, transactionId: first.transactionId });
    await expect(adjustGafusBalanceAdmin({ ...request, delta: 9 })).rejects.toThrow(
      "REQUEST_CONFLICT",
    );
    expect(await prisma.gafusTransaction.count({ where: { userId: viewerId } })).toBe(1);
    expect(await prisma.gafusAdminAudit.count({ where: { action: "WALLET_ADJUSTMENT" } })).toBe(1);
    expect(
      (await prisma.gafusWallet.findUniqueOrThrow({ where: { userId: viewerId } })).balance,
    ).toBe(5);
  });

  it("admin CONFIRM clamps recovered funds, CAS marks signal, and retries cannot debit twice", async () => {
    const signal = await prisma.gafusFraudSignal.create({
      data: { userId: viewerId, severity: "MEDIUM", kind: "REACTION_BURST" },
    });
    const action = {
      actorId: adminId,
      signalId: signal.id,
      action: "CONFIRM" as const,
      requestedReversal: 9,
      reason: "Confirmed coordinated fraudulent reactions",
    };
    const result = await reviewGafusFraudSignalAdmin(action);
    expect(result).toMatchObject({
      status: "RESOLVED",
      requested: 9,
      recovered: 5,
      unrecovered: 4,
    });
    expect(
      (await prisma.gafusWallet.findUniqueOrThrow({ where: { userId: viewerId } })).balance,
    ).toBe(0);
    expect(
      (await prisma.gafusFraudSignal.findUniqueOrThrow({ where: { id: signal.id } })).status,
    ).toBe("RESOLVED");
    await expect(reviewGafusFraudSignalAdmin(action)).rejects.toThrow(
      "FRAUD_SIGNAL_ALREADY_REVIEWED",
    );
    expect(await prisma.gafusTransaction.count({ where: { userId: viewerId } })).toBe(2);
    expect(await prisma.gafusAdminAudit.count({ where: { action: "FRAUD_CONFIRMED" } })).toBe(1);
  });

  it("aborted admin transaction rolls back settings and its revision audit", async () => {
    const current = await prisma.gafusSettings.findUniqueOrThrow({ where: { key: "default" } });
    await expect(
      withGafusAdminRows(async (rows) => {
        await rows.upsertSettings(
          {
            revision: 3,
            economyEnabled: current.economyEnabled,
            earningEnabled: current.earningEnabled,
            spendingEnabled: current.spendingEnabled,
            postReward: 9,
            questionReward: current.questionReward,
            answerReward: current.answerReward,
            activityLimit: current.activityLimit,
            activityWindowSeconds: current.activityWindowSeconds,
            reactionThreshold: current.reactionThreshold,
            reactionReward: current.reactionReward,
            bestAnswerReward: current.bestAnswerReward,
            courseStepCost: current.courseStepCost,
            miniGuideCost: current.miniGuideCost,
            accessDurationSeconds: current.accessDurationSeconds,
          },
          adminId,
        );
        throw new Error("TRANSACTION_ABORTED");
      }),
    ).rejects.toThrow("TRANSACTION_ABORTED");
    expect(
      (await prisma.gafusSettings.findUniqueOrThrow({ where: { key: "default" } })).revision,
    ).toBe(2);
    expect(await prisma.gafusSettingsRevision.count()).toBe(1);
  });
});
