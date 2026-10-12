import { renewalAmountsEqualToKopecks } from "./renewalPolicy";

export type YookassaRenewalProviderResponse = {
  id?: string;
  status?: string;
  amount?: { value?: string; currency?: string };
  payment_method?: { id?: string; type?: string };
  income_amount?: { value?: string; currency?: string };
  captured_at?: string;
};

/** Amount, metadata and period rules must be consistent across all adapters. */
export function buildYookassaRenewalPaymentPayload(input: {
  amountRub: number;
  currency: string;
  paymentMethodId: string;
  intervalDays: number;
  localPaymentId: string;
  userId: string;
  subscriptionId: string;
  planCode: string;
  kind: "INITIAL" | "RENEWAL";
}) {
  return {
    amount: { value: input.amountRub.toFixed(2), currency: input.currency },
    capture: true,
    payment_method_id: input.paymentMethodId,
    description: `Продление подписки Gafus Premium (${input.intervalDays} дн.)`,
    metadata: {
      kind: "app_subscription",
      localPaymentId: input.localPaymentId,
      userId: input.userId,
      subscriptionId: input.subscriptionId,
      planCode: input.planCode,
      renewal: input.kind === "RENEWAL" ? "true" : "false",
    },
  };
}

/** Pure, exhaustive classification before any billing state changes. */
export function classifyYookassaRenewalProviderResponse(
  response: YookassaRenewalProviderResponse,
  expectedAmountRub: number,
  expectedCurrency: string,
):
  | { kind: "invalid" }
  | { kind: "canceled" | "amount_mismatch" | "succeeded" | "pending"; paymentId: string } {
  if (!response.id) return { kind: "invalid" };
  if (response.status === "canceled") return { kind: "canceled", paymentId: response.id };
  if (response.status === "succeeded") {
    if (!renewalAmountsEqualToKopecks(response.amount?.value, expectedAmountRub) ||
      response.amount?.currency !== expectedCurrency) {
      return { kind: "amount_mismatch", paymentId: response.id };
    }
    return { kind: "succeeded", paymentId: response.id };
  }
  return { kind: "pending", paymentId: response.id };
}
