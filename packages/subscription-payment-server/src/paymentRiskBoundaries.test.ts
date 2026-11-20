import { describe, expect, it } from "vitest";
import {
  assertYookassaPaymentBelongsToLocalPayment,
  assertYookassaPaymentConfirmed,
  assertYookassaPaymentCanceled,
  getYookassaPaymentMethodInactiveReason,
} from "./yookassaProvider";
import { partnerCommissionKopecksForPlan } from "./partnerService";

const provider = {
  id: "synthetic-provider-1",
  status: "succeeded",
  paid: true,
  amount: { value: "349.00", currency: "RUB" },
  metadata: {
    kind: "app_subscription",
    localPaymentId: "synthetic-local-1",
    userId: "synthetic-user-1",
    planCode: "MONTHLY",
  },
};
const local = {
  id: "synthetic-local-1",
  userId: "synthetic-user-1",
  planCode: "MONTHLY",
  amount: 349,
  currency: "RUB",
};
const accepted = () => ({
  providerPayment: provider,
  localPayment: local,
  yookassaPaymentId: provider.id,
});

describe("provider identity, amount and cashflow guardrails", () => {
  it("confirms only an exact matching paid subscription payment", () => {
    expect(() => assertYookassaPaymentConfirmed(accepted())).not.toThrow();
    for (const changed of [
      { id: "foreign-provider" },
      { metadata: { ...provider.metadata, kind: "single_course" } },
      { metadata: { ...provider.metadata, localPaymentId: "foreign-local" } },
      { metadata: { ...provider.metadata, userId: "foreign-user" } },
      { metadata: { ...provider.metadata, planCode: "THREE_MONTHS" } },
      { amount: { value: "348.99", currency: "RUB" } },
      { amount: { value: "349.00", currency: "USD" } },
      { status: "pending", paid: false },
      { paid: false },
    ]) {
      expect(() => assertYookassaPaymentConfirmed({
        ...accepted(), providerPayment: { ...provider, ...changed },
      })).toThrow();
    }
  });

  it("rejects an unsigned local payment identity or amount override", () => {
    for (const changed of [
      { userId: "other-user" },
      { id: "other-payment" },
      { planCode: "THREE_MONTHS" },
      { amount: 350 },
      { currency: "USD" },
    ]) {
      expect(() => assertYookassaPaymentBelongsToLocalPayment({
        ...accepted(), localPayment: { ...local, ...changed },
      })).toThrow();
    }
  });

  it("does not treat a succeeded payment as a cancellation or pending as confirmed", () => {
    expect(() => assertYookassaPaymentCanceled(accepted())).toThrow();
    expect(() => assertYookassaPaymentCanceled({
      ...accepted(), providerPayment: { ...provider, status: "canceled", paid: false },
    })).not.toThrow();
    expect(() => assertYookassaPaymentConfirmed({
      ...accepted(), providerPayment: { ...provider, status: "pending" },
    })).toThrow();
  });

  it("rejects payment method not explicitly bound, active and saved", () => {
    const method = {
      id: "synthetic-method-1",
      status: "active",
      saved: true,
      metadata: {
        kind: "app_subscription_payment_method",
        userId: "synthetic-user-1",
        subscriptionId: "synthetic-subscription-1",
      },
    };
    const query = {
      providerPaymentMethod: method,
      paymentMethodId: method.id,
      userId: method.metadata.userId,
      subscriptionId: method.metadata.subscriptionId,
    };
    expect(getYookassaPaymentMethodInactiveReason(query)).toBeNull();
    for (const altered of [
      { paymentMethodId: "foreign-method" },
      { userId: "foreign-user" },
      { subscriptionId: "foreign-subscription" },
      { providerPaymentMethod: { ...method, saved: false } },
      { providerPaymentMethod: { ...method, status: "inactive" } },
    ]) {
      expect(getYookassaPaymentMethodInactiveReason({ ...query, ...altered })).not.toBeNull();
    }
  });

  it("never pays partner commission on a trial, invalid or unknown plan", () => {
    expect(partnerCommissionKopecksForPlan("MONTHLY")).toBe(25_000);
    expect(partnerCommissionKopecksForPlan("THREE_MONTHS")).toBe(75_000);
    for (const invalid of ["TWO_WEEKS", "FREE", "monthly", "", 0, null, undefined, {}])
      expect(partnerCommissionKopecksForPlan(invalid), String(invalid)).toBe(0);
  });
});
