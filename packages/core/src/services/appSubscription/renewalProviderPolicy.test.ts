import { describe, expect, it } from "vitest";
import {
  buildYookassaRenewalPaymentPayload,
  classifyYookassaRenewalProviderResponse,
} from "./renewalProviderPolicy";

describe("YooKassa renewal provider request and interpretation in core", () => {
  it("constructs an immutable amount, period and local payment metadata", () => {
    const payload = buildYookassaRenewalPaymentPayload({
      amountRub: 2500, currency: "RUB", paymentMethodId: "pm-1",
      intervalDays: 30, localPaymentId: "pay-1",
      userId: "user-1", subscriptionId: "sub-1",
      planCode: "MONTHLY", kind: "RENEWAL",
    });
    expect(payload).toEqual(expect.objectContaining({
      amount: { value: "2500.00", currency: "RUB" },
      capture: true, payment_method_id: "pm-1",
      metadata: expect.objectContaining({
        localPaymentId: "pay-1", userId: "user-1",
        subscriptionId: "sub-1", renewal: "true",
      }),
    }));
  });

  it("does not mark a payment succeeded for missing IDs or currency/amount mismatch", () => {
    expect(classifyYookassaRenewalProviderResponse({ status: "succeeded" }, 2500, "RUB"))
      .toEqual({ kind: "invalid" });
    expect(classifyYookassaRenewalProviderResponse({
      id: "yk-1", status: "succeeded", amount: { value: "1.00", currency: "RUB" },
    }, 2500, "RUB")).toEqual({ kind: "amount_mismatch", paymentId: "yk-1" });
    expect(classifyYookassaRenewalProviderResponse({
      id: "yk-1", status: "succeeded", amount: { value: "2500.00", currency: "USD" },
    }, 2500, "RUB")).toEqual({ kind: "amount_mismatch", paymentId: "yk-1" });
  });

  it("preserves canceled and pending statuses while strictly validating success", () => {
    expect(classifyYookassaRenewalProviderResponse({ id: "yk-2", status: "canceled" }, 2500, "RUB"))
      .toEqual({ kind: "canceled", paymentId: "yk-2" });
    expect(classifyYookassaRenewalProviderResponse({ id: "yk-2", status: "pending" }, 2500, "RUB"))
      .toEqual({ kind: "pending", paymentId: "yk-2" });
    expect(classifyYookassaRenewalProviderResponse({
      id: "yk-2", status: "succeeded", amount: { value: "2500.00", currency: "RUB" },
    }, 2500, "RUB")).toEqual({ kind: "succeeded", paymentId: "yk-2" });
  });
});
