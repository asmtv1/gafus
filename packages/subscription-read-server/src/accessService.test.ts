/** Isolated read-model guarantees; imported production module must never depend on Core. */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ user: vi.fn(), subscriptions: vi.fn(), payment: vi.fn(),
  mutation: vi.fn(), transaction: vi.fn() }));
vi.mock("@gafus/prisma", () => ({ prisma: {
  user: { findUnique: m.user },
  appSubscription: { findMany: m.subscriptions, updateMany: m.mutation },
  appSubscriptionPayment: { findFirst: m.payment },
  $transaction: m.transaction,
} }));

import { getAppSubscriptionAccess, getCynologistEntitlements } from "./accessService";
const owner = "fixture-owner";
const now = new Date("2026-10-30T08:00:00.000Z");
const future = new Date("2026-11-30T08:00:00.000Z");
const row = (overrides: Record<string, unknown> = {}) => ({
  id: "synthetic", provider: "YOOKASSA", planCode: "THREE_MONTHS", status: "ACTIVE",
  isLifetime: false, currentPeriodEnd: future, createdAt: now,
  yookassaPaymentMethodId: "synthetic-card", yookassaPaymentMethodLast4: "0000",
  yookassaPaymentMethodTitle: null, cancelAtPeriodEnd: false, payments: [], ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.user.mockResolvedValue({ role: "USER" });
  m.payment.mockResolvedValue(null);
  m.subscriptions.mockImplementation(async ({ where }: { where: { status: string | { in: string[] } } }) =>
    where.status === "ACTIVE" ? [] : []);
});

describe("extracted subscription SELECT-only read model", () => {
  it("keeps a missing owner fail-closed, scoped, with no mutations/transaction", async () => {
    m.user.mockResolvedValue(null);
    const result = await getAppSubscriptionAccess(owner, now);
    expect(result).toMatchObject({ hasActiveSubscription: false, canUseCynologistChat: false,
      canBookConsultations: false, paidAt: null, status: null });
    expect(m.user).toHaveBeenCalledWith({ where: { id: owner }, select: { role: true } });
    expect(m.subscriptions).toHaveBeenCalledWith({ where: { userId: owner, status: "ACTIVE",
      OR: [{ isLifetime: true }, { currentPeriodEnd: { gt: now } }] },
    include: { payments: { where: { status: "SUCCEEDED" }, take: 1, select: { id: true } } } });
    expect(m.payment).not.toHaveBeenCalled();
    expect(m.mutation).not.toHaveBeenCalled();
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it("denies saved-card trial rights but accepts an overlapping SUCCEEDED paid period", async () => {
    let paid = false;
    m.subscriptions.mockImplementation(async ({ where }: { where: { status: string | { in: string[] } } }) =>
      where.status === "ACTIVE"
        ? [row({ payments: [] }), ...(paid ? [row({ id: "paid", payments: [{ id: "SUCCEEDED" }] })] : [])]
        : [row()]);
    const trial = await getAppSubscriptionAccess(owner, now);
    expect(trial).toMatchObject({ hasActiveSubscription: true, isTrial: true, paidAt: null,
      canUseCynologistChat: false, canBookConsultations: false });
    paid = true;
    const overlapped = await getAppSubscriptionAccess(owner, now);
    expect(overlapped).toMatchObject({ hasActiveSubscription: true, isTrial: true,
      canUseCynologistChat: true, canBookConsultations: true });
    expect(m.payment).toHaveBeenCalledWith(expect.objectContaining({
      where: { subscriptionId: "synthetic", status: "SUCCEEDED" } }));
    expect(m.mutation).not.toHaveBeenCalled();
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it("denies lifetime-only consultations and partner rights after DB revocation", async () => {
    m.subscriptions.mockImplementation(async ({ where }: { where: { status: string | { in: string[] } } }) =>
      where.status === "ACTIVE" ? [row({ isLifetime: true, currentPeriodEnd: null })] : []);
    const lifetime = await getCynologistEntitlements(owner, now);
    expect(lifetime).toEqual({ canUseCynologistChat: true, canBookConsultations: false });
    m.subscriptions.mockResolvedValue([]);
    m.user.mockResolvedValueOnce({ role: "PARTNER" });
    expect(await getCynologistEntitlements(owner, now)).toEqual({
      canUseCynologistChat: true, canBookConsultations: false });
    m.user.mockResolvedValueOnce({ role: "USER" });
    expect(await getCynologistEntitlements(owner, now)).toEqual({
      canUseCynologistChat: false, canBookConsultations: false });
    expect(m.mutation).not.toHaveBeenCalled();
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it("has no runtime import back to Core, provider, mutation, or transaction", () => {
    const source = readFileSync(new URL("./accessService.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/@gafus\/core|\.\.\/\.\.\/core/);
    expect(source).not.toMatch(/\$transaction|\.(create|update|delete|upsert|updateMany|createMany|deleteMany)\s*\(/);
    expect(source).not.toMatch(/yookassa\.ru|api\.appstoreconnect|fetch\s*\(|axios|@gafus\/mailer/);
    expect(source).toContain('import type { AppSubscriptionStatusDto } from "@gafus/types"');
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { dependencies: Record<string, string> };
    expect(Object.keys(pkg.dependencies).sort()).toEqual(["@gafus/prisma", "@gafus/types"]);
    expect(Object.keys(pkg.dependencies)).not.toContain("@gafus/core");
    expect(readFileSync(new URL("./index.ts", import.meta.url), "utf8")).toContain('from "./accessService"');
  });
});
