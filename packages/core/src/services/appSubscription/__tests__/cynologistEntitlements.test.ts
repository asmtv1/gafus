import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ user: vi.fn(), rows: vi.fn() }));
vi.mock("@gafus/prisma", () => ({ prisma: { user: { findUnique: mock.user }, appSubscription: { findMany: mock.rows } } }));
import { getCynologistEntitlements } from "../accessService";
import { getAppSubscriptionPlanConfig } from "../plans";
beforeEach(() => { mock.user.mockResolvedValue({ role: "USER" }); mock.rows.mockResolvedValue([]); });
const row = (provider: string, planCode: string, extra = {}) => ({ provider, planCode, isLifetime: false, yookassaPaymentMethodId: null, payments: [], ...extra });
describe("cynologist entitlement matrix", () => {
  it.each(["APPLE", "YOOKASSA", "MANUAL"])("uses the same plan policy for %s", async (provider) => {
    for (const plan of ["WEEKLY", "TWO_WEEKS", "MONTHLY", "THREE_MONTHS"] as const) {
      mock.rows.mockResolvedValue([row(provider, plan)]);
      expect(await getCynologistEntitlements("client")).toEqual({ canUseCynologistChat: ["MONTHLY", "THREE_MONTHS"].includes(plan), canBookConsultations: plan === "THREE_MONTHS" });
      expect(getAppSubscriptionPlanConfig(null, plan).consultationBookingIncluded).toBe(plan === "THREE_MONTHS");
    }
  });
  it("trial does not mask a concurrent paid three-month period", async () => {
    mock.rows.mockResolvedValue([row("YOOKASSA", "MONTHLY", { yookassaPaymentMethodId: "card" }), row("YOOKASSA", "THREE_MONTHS", { yookassaPaymentMethodId: "paid", payments: [{ id: "payment" }] })]);
    expect(await getCynologistEntitlements("client")).toEqual({ canUseCynologistChat: true, canBookConsultations: true });
  });
  it("trial alone has neither entitlement", async () => { mock.rows.mockResolvedValue([row("YOOKASSA", "THREE_MONTHS", { yookassaPaymentMethodId: "card" })]); expect(await getCynologistEntitlements("client")).toEqual({ canUseCynologistChat: false, canBookConsultations: false }); });
  it("partner and lifetime get chat but need a paid three-month period to book", async () => {
    mock.user.mockResolvedValue({ role: "PARTNER" }); expect(await getCynologistEntitlements("client")).toEqual({ canUseCynologistChat: true, canBookConsultations: false });
    mock.user.mockResolvedValue({ role: "USER" }); mock.rows.mockResolvedValue([row("MANUAL", "THREE_MONTHS", { isLifetime: true })]); expect(await getCynologistEntitlements("client")).toEqual({ canUseCynologistChat: true, canBookConsultations: false });
  });
  it("checks the current role, so revoking partner removes access", async () => { mock.user.mockResolvedValue({ role: "PARTNER" }); expect((await getCynologistEntitlements("client")).canUseCynologistChat).toBe(true); mock.user.mockResolvedValue({ role: "USER" }); expect((await getCynologistEntitlements("client")).canUseCynologistChat).toBe(false); });
});
