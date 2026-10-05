import { prisma, type Prisma } from "@gafus/prisma";
import { moneyKopecks } from "./profitMath";

export type FinancePaymentObject = {
  id?: string;
  status?: string;
  amount?: { value?: string; currency?: string };
  income_amount?: { value?: string; currency?: string };
  captured_at?: string;
  payment_method?: { type?: string };
};

export function parsePaymentFinance(
  provider: FinancePaymentObject,
  local: {
    yookassaPaymentId: string;
    amount: unknown;
    currency: string | null;
  },
) {
  if (
    provider.id !== local.yookassaPaymentId ||
    provider.status !== "succeeded" ||
    provider.amount?.currency !== "RUB" ||
    local.currency !== "RUB" ||
    moneyKopecks(provider.amount?.value) !== moneyKopecks(local.amount)
  ) {
    throw new Error("Financial payment verification failed");
  }
  const captured = provider.captured_at ? new Date(provider.captured_at) : null;
  const income = provider.income_amount;
  if (
    income &&
    (income.currency !== "RUB" || moneyKopecks(income.value) > moneyKopecks(local.amount))
  ) {
    throw new Error("Invalid YooKassa income amount");
  }
  return {
    ...(provider.payment_method?.type
      ? { providerPaymentMethodType: provider.payment_method.type }
      : {}),
    ...(captured && Number.isFinite(captured.getTime()) ? { providerCapturedAt: captured } : {}),
    ...(income ? { providerIncomeAmount: income.value } : {}),
    ...(income && captured && Number.isFinite(captured.getTime())
      ? { financeSyncedAt: new Date() }
      : {}),
  };
}

/** Finance enrichment must never prevent access to a verified successful payment. */
export async function enrichPaymentFinance(
  paymentId: string,
  provider: FinancePaymentObject,
  snapshot?: { yookassaPaymentId: string; amount: unknown; currency: string | null },
) {
  try {
    const local =
      snapshot ?? (await prisma.appSubscriptionPayment.findUnique({ where: { id: paymentId } }));
    if (!local?.yookassaPaymentId || ("provider" in local && local.provider !== "YOOKASSA"))
      return false;
    const data = parsePaymentFinance(provider, {
      ...local,
      yookassaPaymentId: local.yookassaPaymentId,
    });
    await prisma.appSubscriptionPayment.update({ where: { id: paymentId }, data });
    return true;
  } catch {
    // Missing/invalid provider fields remain visible through finance completeness.
    return false;
  }
}

export type FinanceRefundObject = {
  id?: string;
  status?: string;
  payment_id?: string;
  created_at?: string;
  amount?: { value?: string; currency?: string };
};

export async function recordFinanceRefund(
  tx: Prisma.TransactionClient,
  payment: { id: string; yookassaPaymentId: string | null; amount: unknown },
  refund: FinanceRefundObject,
) {
  const date = refund.created_at ? new Date(refund.created_at) : null;
  if (
    !refund.id ||
    refund.status !== "succeeded" ||
    refund.payment_id !== payment.yookassaPaymentId ||
    refund.amount?.currency !== "RUB" ||
    !date ||
    !Number.isFinite(date.getTime())
  ) {
    throw new Error("Invalid financial refund");
  }
  const amountKopecks = moneyKopecks(refund.amount.value);
  if (amountKopecks <= 0 || amountKopecks > moneyKopecks(payment.amount))
    throw new Error("Invalid refund amount");
  await tx.appSubscriptionFinanceRefund.upsert({
    where: { providerRefundId: refund.id },
    update: {},
    create: { providerRefundId: refund.id, paymentId: payment.id, amountKopecks, refundedAt: date },
  });
}
