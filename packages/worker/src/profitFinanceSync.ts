import {
 readProfitReconciliationBatch,persistProfitReconciliationSnapshot,
 readProfitReconciliationRevision,withProfitFinanceRefundTransaction,
 completeProfitReconciliationIfUnchanged,type LocalProfitReconciliationPayment,
} from "@gafus/subscription-finance-server/profit-reconciliation-rows";
import {
  parsePaymentFinance,
  recordFinanceRefund,
  type FinancePaymentObject,
  type FinanceRefundObject,
} from "@gafus/subscription-payment-server/payment-finance";
import { PROFIT_START, moneyKopecks } from "@gafus/subscription-shared/profitMath";

/** Read-only provider calls; --apply only enriches the local financial ledger. */
export async function syncProfitFinance(apply = false, now = new Date()) {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secretKey) throw new Error("YooKassa credentials are missing");
  const auth = Buffer.from(`${shopId}:${secretKey}`).toString("base64");
  async function get<T>(path: string): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(`https://api.yookassa.ru/v3/${path}`, {
          headers: { Authorization: `Basic ${auth}` },
          signal: AbortSignal.timeout(15_000),
          cache: "no-store",
        });
        if (response.ok) return (await response.json()) as T;
        if (response.status !== 429 && response.status < 500)
          throw new Error(`Provider HTTP ${response.status}`);
      } catch (error) {
        if (attempt === 2 || (error instanceof Error && error.message.startsWith("Provider HTTP")))
          throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 1000));
    }
    throw new Error("Provider request failed after retries");
  }
  const report = {
    apply,
    paymentsChecked: 0,
    paymentsVerified: 0,
    missingFinance: 0,
    failedPayments: 0,
    refundsChecked: 0,
    refundsRecorded: 0,
    refundScanComplete: false,
    completedPayments: 0,
  };
  const verified = new Map<
    string,
    {
      id: string;
      amount: LocalProfitReconciliationPayment["amount"];
      yookassaPaymentId: string;
      status: string;
      updatedAt?: Date;
    }
  >();
  let cursor: string | undefined;
  while (true) {
    const batch = await readProfitReconciliationBatch(cursor,PROFIT_START,now);
    if (!batch.length) break;
    for (const local of batch) {
      if (!local.yookassaPaymentId) continue;
      report.paymentsChecked += 1;
      try {
        const provider = await get<FinancePaymentObject>(
          `payments/${encodeURIComponent(local.yookassaPaymentId)}`,
        );
        const data = parsePaymentFinance(provider, {
          ...local,
          yookassaPaymentId: local.yookassaPaymentId,
        });
        if (apply) {
          await persistProfitReconciliationSnapshot(local.id,data);
        }
        if (!data.financeSyncedAt || !data.providerCapturedAt || data.providerCapturedAt > now) {
          report.missingFinance += 1;
          continue;
        }
        if (data.providerCapturedAt < PROFIT_START) continue;
        const stored = apply
          ? await readProfitReconciliationRevision(local.id)
          : null;
        verified.set(local.yookassaPaymentId, {
          ...local,
          yookassaPaymentId: local.yookassaPaymentId,
          updatedAt: stored?.updatedAt,
        });
        report.paymentsVerified += 1;
      } catch {
        report.failedPayments += 1;
      }
    }
    cursor = batch[batch.length - 1].id;
    if (batch.length < 100) break;
  }
  let refundCursor: string | undefined;
  const seenCursors = new Set<string>();
  const refundSums = new Map<string, number>();
  const seenRefunds = new Set<string>();
  do {
    const query = new URLSearchParams({
      "created_at.gte": PROFIT_START.toISOString(),
      "created_at.lte": now.toISOString(),
      limit: "100",
    });
    if (refundCursor) query.set("cursor", refundCursor);
    const page = await get<{ items: FinanceRefundObject[]; next_cursor?: string }>(
      `refunds?${query}`,
    );
    if (!Array.isArray(page.items)) throw new Error("Invalid refund list");
    for (const refund of page.items) {
      if (refund.status !== "succeeded" || !refund.payment_id) continue;
      const local = verified.get(refund.payment_id);
      if (!local) continue;
      report.refundsChecked += 1;
      if (
        !refund.id ||
        !refund.created_at ||
        !Number.isFinite(Date.parse(refund.created_at)) ||
        refund.amount?.currency !== "RUB"
      )
        throw new Error("Invalid financial refund in reconciliation");
      if (seenRefunds.has(refund.id)) continue;
      seenRefunds.add(refund.id);
      const total = (refundSums.get(refund.payment_id) ?? 0) + moneyKopecks(refund.amount.value);
      if (total > moneyKopecks(local.amount)) throw new Error("Refund total exceeds payment");
      refundSums.set(refund.payment_id, total);
      if (apply) await withProfitFinanceRefundTransaction((tx) => recordFinanceRefund(tx, local, refund));
      report.refundsRecorded += 1;
    }
    refundCursor = page.next_cursor;
    if (refundCursor) {
      if (seenCursors.has(refundCursor)) throw new Error("Repeated refund pagination cursor");
      seenCursors.add(refundCursor);
    }
  } while (refundCursor);
  report.refundScanComplete = true;
  for (const local of verified.values()) {
    if (
      local.status === "REFUNDED" &&
      (refundSums.get(local.yookassaPaymentId) ?? 0) !== moneyKopecks(local.amount)
    ) {
      report.missingFinance += 1;
      continue;
    }
    if (apply) {
      // A concurrent webhook/change invalidates this reconciliation snapshot.
      const updated = await completeProfitReconciliationIfUnchanged(local.id,local.updatedAt!);
      report.completedPayments += updated.count;
    } else report.completedPayments += 1;
  }
  return report;
}
