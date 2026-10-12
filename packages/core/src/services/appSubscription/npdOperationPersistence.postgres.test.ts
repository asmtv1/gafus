import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import {
  claimNpdReceiptOperation,
  persistNpdIssuedReceipt,
  persistNpdCanceledReceipt,
} from "./npdOperationPersistence";

const isolated = process.env.GAFUS_ISOLATED_TEST_DB === "1" &&
  (process.env.DATABASE_URL ?? "").includes("/gafus_refactor_bootstrap_complete");

describe.skipIf(!isolated)("NPD delivery on bootstrapped disposable PostgreSQL", () => {
  let userId = "";
  let paymentId = "";
  let receiptId = "";
  let operationId = "";
  const now = new Date();

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { username: "npd-race-" + randomUUID(), password: randomUUID(), role: "USER" },
    });
    userId = user.id;
    await prisma.npdConnection.upsert({
      where: { id: "default" },
      create: {
        id: "default", inn: "123456789012", deviceId: "test-npd-device",
        refreshTokenCipher: Uint8Array.from([11]), refreshTokenIv: Uint8Array.from([12]),
        refreshTokenTag: Uint8Array.from([13]), refreshTokenKeyVersion: 1,
        fiscalizationStartedAt: now, status: "ACTIVE",
      },
      update: {},
    });
    const payment = await prisma.appSubscriptionPayment.create({
      data: {
        userId, provider: "YOOKASSA", kind: "RENEWAL", status: "SUCCEEDED",
        planCode: "MONTHLY", idempotenceKey: randomUUID(),
        buyerEmail: "npd-race@example.test", amount: 2500, currency: "RUB",
      },
    });
    paymentId = payment.id;
    const receipt = await prisma.npdReceipt.create({
      data: {
        paymentId, connectionId: "default", amountKopecks: 250000,
        planCode: "MONTHLY", intervalDays: 30,
        serviceName: "Подписка GAFUS на 30 дней", operationAt: now,
        buyerEmail: "npd-race@example.test",
      },
    });
    receiptId = receipt.id;
    const operation = await prisma.npdReceiptOperation.create({
      data: { receiptId, type: "CREATE", status: "PENDING",
        nextAttemptAt: new Date(now.getTime() - 60_000) },
    });
    operationId = operation.id;
  });

  afterAll(async () => {
    if (receiptId) await prisma.npdReceipt.delete({ where: { id: receiptId } });
    if (paymentId) await prisma.appSubscriptionPayment.delete({ where: { id: paymentId } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("atomically leases an NPD operation across concurrent workers", async () => {
    const [a, b] = await Promise.all([
      claimNpdReceiptOperation(prisma, "owner-a", now),
      claimNpdReceiptOperation(prisma, "owner-b", now),
    ]);
    expect([a, b].filter(x => x.operation)).toHaveLength(1);
    const claimed = a.operation ?? b.operation;
    expect(claimed.id).toBe(operationId);
    expect(await prisma.npdReceiptOperation.findUniqueOrThrow({ where: { id: operationId } }))
      .toMatchObject({ status: "PROCESSING", attemptCount: 1 });

    await persistNpdIssuedReceipt(prisma, claimed, {
      receiptUuid: "npd-race-" + randomUUID(),
      printUrl: "https://example.test/npd/print",
      jsonUrl: "https://example.test/npd/json",
    });
    expect(await prisma.npdReceipt.findUniqueOrThrow({ where: { id: receiptId } }))
      .toMatchObject({ status: "ISSUED" });
    expect(await prisma.npdReceiptEmailDelivery.findUnique({ where: { receiptId } }))
      .toMatchObject({ status: "PENDING", recipientEmail: "npd-race@example.test" });
  });

  it("refuses stale cancel-ack acknowledgements", async () => {
    await prisma.appSubscriptionPayment.update({
      where: { id: paymentId }, data: { status: "REFUNDED" },
    });
    await prisma.npdReceipt.update({
      where: { id: receiptId }, data: { status: "CANCEL_PENDING" },
    });
    const cancel = await prisma.npdReceiptOperation.create({
      data: { receiptId, type: "CANCEL", status: "PROCESSING",
        leaseOwner: "cancel-owner", leaseExpiresAt: new Date(now.getTime() + 90_000) },
    });
    const stale = { ...cancel, leaseOwner: "stale-owner", receipt: { connectionId: "default" } };
    expect(await persistNpdCanceledReceipt(prisma, stale)).toBe(false);
    expect((await prisma.npdReceipt.findUniqueOrThrow({ where: { id: receiptId } })).status)
      .toBe("CANCEL_PENDING");
    expect(await persistNpdCanceledReceipt(prisma, {
      ...cancel, receipt: { connectionId: "default" },
    })).toBe(true);
    expect(await persistNpdCanceledReceipt(prisma, {
      ...cancel, receipt: { connectionId: "default" },
    })).toBe(false);
    expect((await prisma.npdReceipt.findUniqueOrThrow({ where: { id: receiptId } })).status)
      .toBe("CANCELED");
  });
});
