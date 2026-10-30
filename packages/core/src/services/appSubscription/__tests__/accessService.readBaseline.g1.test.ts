/**
 * Baseline characterization before the subscription read-only server extraction.
 * Synthetic Prisma rows only; no DB/provider calls or production code changes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  user: vi.fn(), subscriptions: vi.fn(), payment: vi.fn(),
  write: vi.fn(), transaction: vi.fn(),
}));

vi.mock("@gafus/prisma", () => ({ prisma: {
  user: { findUnique: m.user },
  appSubscription: { findMany: m.subscriptions, updateMany: m.write },
  appSubscriptionPayment: { findFirst: m.payment },
  $transaction: m.transaction,
} }));

import { getAppSubscriptionAccess } from "../accessService";

const now = new Date("2026-10-30T08:00:00.000Z");
const later = new Date("2026-11-30T08:00:00.000Z");
const owner = "synthetic-owner-A";

type SubscriptionRow = {
  id: string; provider: "YOOKASSA" | "APPLE" | "MANUAL";
  planCode: "WEEKLY" | "MONTHLY" | "THREE_MONTHS";
  status: "ACTIVE" | "PENDING" | "PAST_DUE";
  isLifetime: boolean; currentPeriodEnd: Date | null;
  createdAt: Date; cancelAtPeriodEnd: boolean;
  yookassaPaymentMethodId: string | null;
  yookassaPaymentMethodLast4: string | null;
  yookassaPaymentMethodTitle: string | null;
  payments: { id: string }[];
};
const subscription = (id: string, patch: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
  id, provider: "APPLE", planCode: "MONTHLY", status: "ACTIVE", isLifetime: false,
  currentPeriodEnd: later, createdAt: new Date("2026-10-01T00:00:00.000Z"),
  cancelAtPeriodEnd: false, yookassaPaymentMethodId: null,
  yookassaPaymentMethodLast4: null, yookassaPaymentMethodTitle: null,
  payments: [], ...patch,
});

let rows: SubscriptionRow[] = [];
let databaseRole: "USER" | "PARTNER" | null = "USER";

beforeEach(() => {
  vi.clearAllMocks();
  rows = []; databaseRole = "USER";
  m.user.mockImplementation(async () => databaseRole ? { role: databaseRole } : null);
  // Model the real Prisma WHERE predicate, not an indiscriminate findMany mock.
  m.subscriptions.mockImplementation(async (query: {
    where: { userId: string; status: "ACTIVE" | { in: string[] };
      OR?: [{ isLifetime: true }, { currentPeriodEnd: { gt: Date } }]; };
  }) => {
    if (query.where.userId !== owner) return [];
    if (query.where.status === "ACTIVE") {
      const cutoff = query.where.OR?.[1]?.currentPeriodEnd.gt;
      return rows.filter(row => row.status === "ACTIVE" &&
        (row.isLifetime || (!!row.currentPeriodEnd && !!cutoff && row.currentPeriodEnd > cutoff)));
    }
    return rows.filter(row => query.where.status !== "ACTIVE" &&
      query.where.status.in.includes(row.status));
  });
  m.payment.mockResolvedValue(null);
});

function assertScopedReadOnlyQueries() {
  expect(m.user).toHaveBeenCalledTimes(2);
  expect(m.user.mock.calls.every(([query]) => query.where.id === owner &&
    query.select.role === true)).toBe(true);
  expect(m.subscriptions).toHaveBeenCalledTimes(2);
  expect(m.subscriptions).toHaveBeenCalledWith({
    where: { userId: owner, status: { in: ["ACTIVE", "PENDING", "PAST_DUE"] } },
    orderBy: [{ isLifetime: "desc" }, { currentPeriodEnd: "desc" }],
  });
  expect(m.subscriptions).toHaveBeenCalledWith({
    where: { userId: owner, status: "ACTIVE", OR: [
      { isLifetime: true }, { currentPeriodEnd: { gt: now } },
    ] },
    include: { payments: { where: { status: "SUCCEEDED" }, take: 1, select: { id: true } } },
  });
  expect(m.write).not.toHaveBeenCalled();
  expect(m.transaction).not.toHaveBeenCalled();
}

describe("P1 subscription read-model before extraction: negative owner/time/composition baseline", () => {
  it("ACTIVE ending exactly now or with null end is denied, including chat/booking and payment lookup", async () => {
    rows = [subscription("at-boundary", { currentPeriodEnd: now }),
      subscription("null-period", { currentPeriodEnd: null })];
    const data = await getAppSubscriptionAccess(owner, now);
    expect(data).toMatchObject({
      hasActiveSubscription: false, status: null, provider: null,
      paidAt: null, activeUntil: null, isLifetime: false,
      canUseCynologistChat: false, canBookConsultations: false,
    });
    expect(m.payment).not.toHaveBeenCalled();
    assertScopedReadOnlyQueries();
  });

  it("a saved-card trial selected for status cannot mask a concurrent paid THREE_MONTHS entitlement", async () => {
    rows = [
      subscription("trial-status", { provider: "YOOKASSA", planCode: "THREE_MONTHS",
        yookassaPaymentMethodId: "synthetic-card", yookassaPaymentMethodLast4: "0000" }),
      subscription("real-paid", { provider: "YOOKASSA", planCode: "THREE_MONTHS",
        yookassaPaymentMethodId: "synthetic-paid-card", payments: [{ id: "synthetic-succeeded" }] }),
    ];
    const data = await getAppSubscriptionAccess(owner, now);
    expect(data).toMatchObject({
      hasActiveSubscription: true, provider: "YOOKASSA", planCode: "THREE_MONTHS",
      isTrial: true, paidAt: null, trialEndsAt: later.toISOString(),
      canUseCynologistChat: true, canBookConsultations: true,
    });
    expect(m.payment).toHaveBeenCalledExactlyOnceWith({
      where: { subscriptionId: "trial-status", status: "SUCCEEDED" },
      orderBy: [{ succeededAt: "desc" }, { updatedAt: "desc" }],
      select: { succeededAt: true, updatedAt: true, createdAt: true },
    });
    assertScopedReadOnlyQueries();
  });

  it("revoking PARTNER in the database immediately removes status and both rights without a payment write", async () => {
    databaseRole = "PARTNER";
    const partner = await getAppSubscriptionAccess(owner, now);
    expect(partner).toMatchObject({
      hasActiveSubscription: true, isLifetime: true, provider: "MANUAL", status: "ACTIVE",
      canUseCynologistChat: true, canBookConsultations: false,
    });
    expect(m.subscriptions).toHaveBeenCalledTimes(1); // entitlement read only, status early role return
    vi.clearAllMocks();
    databaseRole = "USER";
    const revoked = await getAppSubscriptionAccess(owner, now);
    expect(revoked).toMatchObject({
      hasActiveSubscription: false, isLifetime: false, status: null,
      canUseCynologistChat: false, canBookConsultations: false,
    });
    expect(m.payment).not.toHaveBeenCalled();
    assertScopedReadOnlyQueries();
  });
});
