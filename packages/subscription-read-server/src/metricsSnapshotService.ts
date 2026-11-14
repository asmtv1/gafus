import { prisma } from "@gafus/prisma";

/** Snapshot of subscription/billing state for the worker's monitoring endpoint. */
export async function getAppSubscriptionMetricsSnapshot() {
  const [activeTotal, pastDueTotal, npdOperations, oldestNpdOperation, npdReceipts, npdConnection] = await Promise.all([
    prisma.appSubscription.count({ where: { status: "ACTIVE" } }),
    prisma.appSubscription.count({ where: { status: "PAST_DUE" } }),
    prisma.npdReceiptOperation.groupBy({ by: ["status", "type"], _count: { _all: true } }),
    prisma.npdReceiptOperation.findFirst({
      where: { status: { in: ["PENDING", "RETRY", "PROCESSING"] } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    prisma.npdReceipt.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.npdConnection.findUnique({
      where: { id: "default" },
      select: { status: true, lastSuccessfulOperationAt: true },
    }),
  ]);
  return { activeTotal, pastDueTotal, npdOperations, oldestNpdOperation, npdReceipts, npdConnection };
}
