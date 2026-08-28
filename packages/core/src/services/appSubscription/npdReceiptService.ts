import type { Prisma } from "@gafus/prisma";

const NPD_SERVICE_NAMES = {
  TWO_WEEKS: "Подписка Gafus Premium на 14 дней",
  MONTHLY: "Подписка Gafus Premium на 30 дней",
  THREE_MONTHS: "Подписка Gafus Premium на 90 дней",
} as const;

const NPD_INTERVAL_DAYS = {
  TWO_WEEKS: 14,
  MONTHLY: 30,
  THREE_MONTHS: 90,
} as const;

type NpdPlanCode = keyof typeof NPD_SERVICE_NAMES;
type TransactionClient = Prisma.TransactionClient;

function amountToKopecks(amount: unknown): number | null {
  const raw = typeof amount === "object" && amount && "toString" in amount
    ? (amount as { toString(): string }).toString()
    : String(amount ?? "");
  // Prisma stores this monetary column at scale 3. A trailing third zero is
  // still an exact two-decimal RUB amount; any non-zero third digit is not.
  if (!/^\d+(?:\.\d{1,2}0?)?$/.test(raw)) return null;
  const [rubles, fractional = ""] = raw.split(".");
  const kopecks = Number(rubles) * 100 + Number(fractional.slice(0, 2).padEnd(2, "0"));
  return Number.isSafeInteger(kopecks) && kopecks > 0 ? kopecks : null;
}

/**
 * Creates the local fiscalization outbox record only. The NPD provider is deliberately
 * not called from a payment transaction.
 */
export async function ensureNpdReceiptForSucceededPayment(
  tx: TransactionClient,
  paymentId: string,
) {
  const client = tx as TransactionClient & Record<string, any>;
  const payment = await client.appSubscriptionPayment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      provider: true,
      kind: true,
      status: true,
      planCode: true,
      amount: true,
      currency: true,
      buyerEmail: true,
      periodStart: true,
      periodEnd: true,
      succeededAt: true,
    },
  });
  if (!payment || payment.provider !== "YOOKASSA" || payment.status !== "SUCCEEDED") return null;
  if (payment.kind !== "INITIAL" && payment.kind !== "RENEWAL") return null;
  if (!(payment.planCode in NPD_SERVICE_NAMES) || payment.currency !== "RUB") return null;
  const planCode = payment.planCode as NpdPlanCode;
  const buyerEmail = payment.buyerEmail?.trim();
  const amountKopecks = amountToKopecks(payment.amount);
  if (!buyerEmail || !amountKopecks || !payment.periodStart || !payment.periodEnd || !payment.succeededAt) {
    return null;
  }

  const intervalDays = Math.round(
    (payment.periodEnd.getTime() - payment.periodStart.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (intervalDays !== NPD_INTERVAL_DAYS[planCode]) return null;

  const connection = await client.npdConnection.findUnique({
    where: { id: "default" },
    select: { id: true, fiscalizationStartedAt: true },
  });
  if (!connection?.fiscalizationStartedAt || payment.succeededAt < connection.fiscalizationStartedAt) {
    return null;
  }

  return client.npdReceipt.upsert({
    where: { paymentId: payment.id },
    create: {
      paymentId: payment.id,
      connectionId: connection.id,
      amountKopecks,
      currency: "RUB",
      planCode,
      intervalDays,
      serviceName: NPD_SERVICE_NAMES[planCode],
      buyerEmail,
      operationAt: payment.succeededAt,
      operations: { create: { type: "CREATE", status: "PENDING" } },
    },
    update: {},
    select: { id: true, status: true },
  });
}

export async function queueNpdReceiptCancellation(
  tx: TransactionClient,
  paymentId: string,
) {
  const client = tx as TransactionClient & Record<string, any>;
  const receipt = await client.npdReceipt.findUnique({
    where: { paymentId },
    select: { id: true, status: true, operations: { select: { id: true, type: true, status: true } } },
  });
  if (!receipt) return null;
  const createOperation = receipt.operations.find((operation: { type: string }) => operation.type === "CREATE");
  if (createOperation && ["PENDING", "RETRY"].includes(createOperation.status)) {
    const canceledCreate = await client.npdReceiptOperation.updateMany({
      where: { id: createOperation.id, status: { in: ["PENDING", "RETRY"] } },
      data: { status: "NOT_REQUIRED", completedAt: new Date(), nextAttemptAt: null },
    });
    if (canceledCreate.count === 1) return "not_required" as const;

    // The worker won the race. Re-read its terminal state: an issued receipt
    // needs a real cancellation. A non-terminal state cannot safely be
    // acknowledged, because CREATE might still execute; roll back the refund
    // transaction so the idempotent webhook is retried.
    const racedCreate = await client.npdReceiptOperation.findUnique({
      where: { id: createOperation.id },
      select: { status: true },
    });
    if (racedCreate?.status === "PROCESSING") {
      await client.npdReceipt.update({
        where: { id: receipt.id },
        data: { status: "CANCEL_PENDING" },
      });
      return "cancel_pending" as const;
    }
    if (racedCreate?.status !== "SUCCEEDED") {
      throw new Error("NPD_CREATE_CANCELLATION_RACE_RETRY");
    }
  }
  if (createOperation?.status === "PROCESSING") {
    await client.npdReceipt.update({
      where: { id: receipt.id },
      data: { status: "CANCEL_PENDING" },
    });
    return "cancel_pending" as const;
  }
  await client.npdReceipt.update({
    where: { id: receipt.id },
    data: { status: "CANCEL_PENDING" },
  });
  await client.npdReceiptOperation.upsert({
    where: { receiptId_type: { receiptId: receipt.id, type: "CANCEL" } },
    create: { receiptId: receipt.id, type: "CANCEL", status: "PENDING" },
    update: {},
  });
  return "queued" as const;
}
