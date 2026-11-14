import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  withPartnerTransaction,
  readPartnerProfileForDashboard,
  lockPartnerAccount,
  readPartnerUserRole,
  lockPartnerBinding,
  readPartnerProfileBinding,
  readPartnerPromoById,
  updatePartnerPromoIfMissing,
  createPartnerProfileIfMissing,
  readPartnerProfileBoundOrThrow,
  readPromoIdByNormalizedCode,
  readPartnerForPromoAttribution,
  createPartnerReferralOnce,
  readPartnerReferral,
  readPartnerReferralId,
  readPartnerReferralRequired,
  readOriginalPaymentPromo,
  readPartnerIdByPromo,
  createPartnerCommission,
  readEarnedPartnerCommission,
  createPartnerRefundAdjustment,
  readPartnerDashboardTotals,
  lockPartnerPayout,
  readPartnerPayoutTotals,
  createPartnerPayout,
} from "./partnerRows";

const db = vi.hoisted(() => ({
  transaction: vi.fn(),
  rootCommission: vi.fn(),
  rootPayout: vi.fn(),
  rootReferralCount: vi.fn(),
  query: vi.fn(),
  execute: vi.fn(),
  userRole: vi.fn(),
  profileByUser: vi.fn(),
  promoByCode: vi.fn(),
  partnerCreate: vi.fn(),
  partnerUpdate: vi.fn(),
  profileRequired: vi.fn(),
  promo: vi.fn(),
  paymentPromo: vi.fn(),
  referralByBuyer: vi.fn(),
  referralCreate: vi.fn(),
  referralRequired: vi.fn(),
  commissionCreate: vi.fn(),
  commissionFind: vi.fn(),
  commissionAggregate: vi.fn(),
  payoutAggregate: vi.fn(),
  payoutCreate: vi.fn(),
}));
const tx = {
  $queryRaw: db.query,
  $executeRaw: db.execute,
  user: { findUnique: db.userRole },
  partnerProfile: {
    findUnique: db.profileByUser,
    updateMany: db.partnerUpdate,
    createMany: db.partnerCreate,
    findUniqueOrThrow: db.profileRequired,
  },
  appSubscriptionPromoCode: { findUnique: db.promo },
  appSubscriptionPayment: { findFirst: db.paymentPromo },
  partnerReferral: {
    createMany: db.referralCreate,
    findUnique: db.referralByBuyer,
    findUniqueOrThrow: db.referralRequired,
  },
  partnerCommission: {
    create: db.commissionCreate,
    findUnique: db.commissionFind,
    aggregate: db.commissionAggregate,
  },
  partnerPayout: { aggregate: db.payoutAggregate, create: db.payoutCreate },
};
vi.mock("@gafus/prisma", () => ({
  prisma: {
    $transaction: db.transaction,
    partnerCommission: { aggregate: db.rootCommission },
    partnerPayout: { aggregate: db.rootPayout },
    partnerReferral: { count: db.rootReferralCount },
  },
}));
beforeEach(() => {
  vi.resetAllMocks();
  db.transaction.mockImplementation(async (work) => work(tx));
  db.query.mockResolvedValue([]);
  db.execute.mockResolvedValue(1);
});

describe("Partner ledger SQL boundary", () => {
  it("executes account locks and promo bindings in caller-owned transaction, never bypassing role", async () => {
    await withPartnerTransaction(async (client) => {
      expect(client).toBe(tx);
      await lockPartnerAccount(client, "partner-1");
      await readPartnerUserRole(client, "partner-1");
      await lockPartnerBinding(client, "partner-1", "promo-1");
      await readPartnerProfileBinding(client, "partner-1");
      await readPartnerPromoById(client, "promo-1");
      await updatePartnerPromoIfMissing(client, "partner-1", "promo-1");
      await createPartnerProfileIfMissing(client, "partner-1", "promo-1");
      await readPartnerProfileBoundOrThrow(client, "partner-1");
    });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.execute).toHaveBeenCalledTimes(2);
    expect(db.userRole).toHaveBeenCalledWith({
      where: { id: "partner-1" },
      select: { role: true },
    });
    expect(db.partnerUpdate).toHaveBeenCalledWith({
      where: { userId: "partner-1", promoCodeId: null },
      data: { promoCodeId: "promo-1" },
    });
    expect(db.partnerCreate).toHaveBeenCalledWith({
      data: { userId: "partner-1", promoCodeId: "promo-1" },
      skipDuplicates: true,
    });
    expect(db.profileRequired).toHaveBeenCalledWith({
      where: { userId: "partner-1" },
      include: { promoCode: true },
    });
  });

  it("scopes referral identity and new commissions to exactly one buyer+payment", async () => {
    await readPartnerProfileForDashboard(tx, "partner-1");
    await readPromoIdByNormalizedCode(tx, "PARTNER");
    await readPartnerForPromoAttribution(tx, "promo-1");
    await createPartnerReferralOnce(tx, "partner-1", "buyer-1");
    await readPartnerReferral(tx, "buyer-1");
    await readPartnerReferralId(tx, "buyer-1");
    await readPartnerReferralRequired(tx, "buyer-1");
    await readOriginalPaymentPromo(tx, "sub-1");
    await readPartnerIdByPromo(tx, "promo-1");
    await createPartnerCommission(tx, {
      partnerId: "partner-1",
      paymentId: "payment-1",
      amountKopecks: 25000,
    });
    expect(db.paymentPromo).toHaveBeenCalledWith({
      where: {
        subscriptionId: "sub-1",
        provider: "YOOKASSA",
        kind: "INITIAL",
        status: "SUCCEEDED",
        promoCodeId: { not: null },
      },
      orderBy: { createdAt: "asc" },
      select: { promoCodeId: true },
    });
    expect(db.referralCreate).toHaveBeenCalledWith({
      data: { partnerId: "partner-1", buyerId: "buyer-1" },
      skipDuplicates: true,
    });
    expect(db.commissionCreate).toHaveBeenCalledWith({
      data: {
        partnerId: "partner-1",
        paymentId: "payment-1",
        amountKopecks: 25000,
        kind: "EARNED",
      },
    });
  });

  it("refund adjustment is reversed, never another earned commission", async () => {
    await readEarnedPartnerCommission(tx, "payment-1");
    await createPartnerRefundAdjustment(tx, {
      partnerId: "partner-1",
      paymentId: "payment-1",
      amountKopecks: -25000,
    });
    expect(db.commissionFind).toHaveBeenCalledWith({
      where: { paymentId_kind: { paymentId: "payment-1", kind: "EARNED" } },
      select: { partnerId: true, amountKopecks: true },
    });
    expect(db.commissionCreate).toHaveBeenCalledWith({
      data: {
        partnerId: "partner-1",
        paymentId: "payment-1",
        amountKopecks: -25000,
        kind: "REFUND_ADJUSTMENT",
      },
    });
  });

  it("serializes payouts for one partner and reserves only available funds", async () => {
    db.rootCommission.mockResolvedValue({ _sum: { amountKopecks: 75000 } });
    db.rootPayout.mockResolvedValue({ _sum: { amountKopecks: 25000 } });
    db.rootReferralCount.mockResolvedValue(3);
    expect(await readPartnerDashboardTotals("partner-1")).toEqual({
      earnedKopecks: 75000,
      reservedKopecks: 25000,
      referrals: 3,
    });
    db.commissionAggregate.mockResolvedValue({ _sum: { amountKopecks: 75000 } });
    db.payoutAggregate.mockResolvedValue({ _sum: { amountKopecks: 25000 } });
    await lockPartnerPayout(tx, "owner-1");
    expect(await readPartnerPayoutTotals(tx, "partner-1")).toEqual({
      earnedKopecks: 75000,
      reservedKopecks: 25000,
    });
    await createPartnerPayout(tx, "partner-1", 50000);
    expect(db.payoutCreate).toHaveBeenCalledWith({
      data: { partnerId: "partner-1", amountKopecks: 50000 },
    });
    expect(db.payoutAggregate).toHaveBeenCalledWith({
      where: { partnerId: "partner-1", status: { in: ["PENDING", "PAID"] } },
      _sum: { amountKopecks: true },
    });
  });
});
