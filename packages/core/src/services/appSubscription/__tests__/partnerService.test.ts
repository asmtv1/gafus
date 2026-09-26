import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  partnerReferralFindUnique,
  partnerProfileByPromoFindUnique,
  initialPaymentFindFirst,
  partnerCommissionCreate,
  partnerCommissionFindUnique,
  appSubscriptionPromoCodeFindUnique,
  partnerProfileFindUnique,
  partnerProfileUpdateMany,
  partnerProfileCreateMany,
  partnerReferralCreateMany,
  prismaTransaction,
} = vi.hoisted(() => ({
  partnerReferralFindUnique: vi.fn(),
  partnerProfileByPromoFindUnique: vi.fn(),
  initialPaymentFindFirst: vi.fn(),
  partnerCommissionCreate: vi.fn(),
  partnerCommissionFindUnique: vi.fn(),
  appSubscriptionPromoCodeFindUnique: vi.fn(),
  partnerProfileFindUnique: vi.fn(),
  partnerProfileUpdateMany: vi.fn(),
  partnerProfileCreateMany: vi.fn(),
  partnerReferralCreateMany: vi.fn(),
  prismaTransaction: vi.fn(),
}));

vi.mock("@gafus/prisma", () => ({
  prisma: {
    $transaction: (...args: unknown[]) => prismaTransaction(...args),
  },
}));

import {
  PARTNER_COMMISSION_KOPECKS,
  PartnerProgramError,
  attributePartnerReferralIfCurrentPartnerInTransaction,
  bindPartnerPromoCodeInTransaction,
  recordPartnerCommissionForPayment,
  requestPartnerPayout,
  reversePartnerCommissionForRefund,
} from "../partnerService";

describe("partner commission ledger", () => {
  const tx = {
    partnerReferral: { findUnique: partnerReferralFindUnique, createMany: partnerReferralCreateMany },
    partnerProfile: { findUnique: partnerProfileByPromoFindUnique },
    appSubscriptionPayment: { findFirst: initialPaymentFindFirst },
    partnerCommission: { create: partnerCommissionCreate, findUnique: partnerCommissionFindUnique },
  };

  beforeEach(() => vi.clearAllMocks());

  it("writes the fixed 25,000-kopeck credit for an attributed payment", async () => {
    partnerReferralFindUnique.mockResolvedValue({ partnerId: "partner-1" });
    partnerCommissionCreate.mockResolvedValue({ id: "commission-1" });

    await recordPartnerCommissionForPayment(tx, { id: "payment-1", userId: "buyer-1", planCode: "MONTHLY" });

    expect(partnerCommissionCreate).toHaveBeenCalledWith({
      data: { partnerId: "partner-1", paymentId: "payment-1", amountKopecks: PARTNER_COMMISSION_KOPECKS, kind: "EARNED" },
    });
  });

  it("writes the same 25,000 kopecks for a three-month payment", async () => {
    partnerReferralFindUnique.mockResolvedValue({ partnerId: "partner-1" });
    partnerCommissionCreate.mockResolvedValue({ id: "commission-1" });

    await recordPartnerCommissionForPayment(tx, { id: "payment-1", userId: "buyer-1", planCode: "THREE_MONTHS" });

    expect(partnerCommissionCreate).toHaveBeenCalledWith({
      data: { partnerId: "partner-1", paymentId: "payment-1", amountKopecks: PARTNER_COMMISSION_KOPECKS, kind: "EARNED" },
    });
  });

  it("credits a two-week payment with a partner code even without registration attribution", async () => {
    partnerProfileByPromoFindUnique.mockResolvedValue({ id: "partner-1" });
    partnerCommissionCreate.mockResolvedValue({ id: "commission-1" });

    await recordPartnerCommissionForPayment(tx as never, {
      id: "payment-1", userId: "buyer-1", kind: "INITIAL", promoCodeId: "promo-1",
    });

    expect(partnerProfileByPromoFindUnique).toHaveBeenCalledWith({ where: { promoCodeId: "promo-1" }, select: { id: true } });
    expect(partnerReferralCreateMany).toHaveBeenCalledWith({
      data: { partnerId: "partner-1", buyerId: "buyer-1" }, skipDuplicates: true,
    });
    expect(partnerCommissionCreate).toHaveBeenCalledWith({
      data: { partnerId: "partner-1", paymentId: "payment-1", amountKopecks: PARTNER_COMMISSION_KOPECKS, kind: "EARNED" },
    });
  });

  it("credits renewal to the partner code on the initial payment", async () => {
    initialPaymentFindFirst.mockResolvedValue({ promoCodeId: "promo-1" });
    partnerProfileByPromoFindUnique.mockResolvedValue({ id: "partner-1" });
    partnerCommissionCreate.mockResolvedValue({ id: "commission-2" });

    await recordPartnerCommissionForPayment(tx as never, {
      id: "renewal-1", userId: "buyer-1", subscriptionId: "subscription-1", kind: "RENEWAL",
    });

    expect(initialPaymentFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ subscriptionId: "subscription-1", kind: "INITIAL", status: "SUCCEEDED" }),
    }));
    expect(partnerReferralCreateMany).not.toHaveBeenCalled();
    expect(partnerCommissionCreate).toHaveBeenCalledWith({
      data: { partnerId: "partner-1", paymentId: "renewal-1", amountKopecks: PARTNER_COMMISSION_KOPECKS, kind: "EARNED" },
    });
  });

  it("uses the code from the payment when registration attributed another partner", async () => {
    partnerProfileByPromoFindUnique.mockResolvedValue({ id: "code-partner" });
    partnerCommissionCreate.mockResolvedValue({ id: "commission-3" });

    await recordPartnerCommissionForPayment(tx as never, {
      id: "payment-2", userId: "buyer-1", kind: "INITIAL", promoCodeId: "promo-2",
    });

    expect(partnerReferralFindUnique).not.toHaveBeenCalled();
    expect(partnerCommissionCreate).toHaveBeenCalledWith({
      data: { partnerId: "code-partner", paymentId: "payment-2", amountKopecks: PARTNER_COMMISSION_KOPECKS, kind: "EARNED" },
    });
  });

  it("uses registration attribution for a renewal without a checkout code", async () => {
    initialPaymentFindFirst.mockResolvedValue(null);
    partnerReferralFindUnique.mockResolvedValue({ partnerId: "registration-partner" });
    partnerCommissionCreate.mockResolvedValue({ id: "commission-4" });

    await recordPartnerCommissionForPayment(tx as never, {
      id: "renewal-2", userId: "buyer-1", subscriptionId: "subscription-2", kind: "RENEWAL",
    });

    expect(partnerCommissionCreate).toHaveBeenCalledWith({
      data: { partnerId: "registration-partner", paymentId: "renewal-2", amountKopecks: PARTNER_COMMISSION_KOPECKS, kind: "EARNED" },
    });
  });

  it("writes exactly one negative adjustment after a full refund", async () => {
    partnerCommissionFindUnique.mockResolvedValue({ partnerId: "partner-1", amountKopecks: PARTNER_COMMISSION_KOPECKS });
    partnerCommissionCreate.mockResolvedValue({ id: "adjustment-1" });

    await reversePartnerCommissionForRefund(tx, { id: "payment-1", userId: "buyer-1" });

    expect(partnerCommissionCreate).toHaveBeenCalledWith({
      data: { partnerId: "partner-1", paymentId: "payment-1", amountKopecks: -PARTNER_COMMISSION_KOPECKS, kind: "REFUND_ADJUSTMENT" },
    });
  });

  it("treats a duplicate provider delivery as an idempotent no-op", async () => {
    partnerReferralFindUnique.mockResolvedValue({ partnerId: "partner-1" });
    partnerCommissionCreate.mockRejectedValue({ code: "P2002" });

    await expect(recordPartnerCommissionForPayment(tx, { id: "payment-1", userId: "buyer-1", planCode: "MONTHLY" })).resolves.toBeNull();
  });
});

describe("registration attribution and promo binding", () => {
  const tx = {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    user: { findUnique: vi.fn() },
    appSubscriptionPromoCode: { findUnique: appSubscriptionPromoCodeFindUnique },
    partnerProfile: {
      findUnique: partnerProfileFindUnique,
      findUniqueOrThrow: vi.fn(),
      updateMany: partnerProfileUpdateMany,
      createMany: partnerProfileCreateMany,
    },
    partnerReferral: { createMany: partnerReferralCreateMany, findUnique: partnerReferralFindUnique },
  };

  beforeEach(() => vi.clearAllMocks());

  it("does not attribute a code after its profile owner is no longer a current partner", async () => {
    appSubscriptionPromoCodeFindUnique.mockResolvedValue({ id: "promo-1" });
    partnerProfileFindUnique.mockResolvedValue({
      id: "profile-1",
      userId: "partner-user",
      isActive: true,
      user: { role: "USER" },
      promoCode: { isActive: true, archivedAt: null },
    });

    await expect(attributePartnerReferralIfCurrentPartnerInTransaction(tx as never, "buyer-1", "PROMO")).resolves.toBeNull();
    expect(partnerReferralCreateMany).not.toHaveBeenCalled();
  });

  it("keeps a bound deactivated code and rejects a replacement", async () => {
    tx.user.findUnique.mockResolvedValue({ role: "PARTNER" });
    const boundProfile = { id: "profile-1", userId: "partner-user", promoCodeId: "old-promo", promoCode: { isActive: false } };
    partnerProfileFindUnique.mockResolvedValue(boundProfile);

    await expect(bindPartnerPromoCodeInTransaction(tx as never, { userId: "partner-user", promoCodeId: "old-promo" })).resolves.toBe(boundProfile);
    expect(appSubscriptionPromoCodeFindUnique).not.toHaveBeenCalled();

    await expect(bindPartnerPromoCodeInTransaction(tx as never, { userId: "partner-user", promoCodeId: "new-promo" })).rejects.toEqual(
      expect.objectContaining<Partial<PartnerProgramError>>({ code: "PARTNER_PROMO_UNAVAILABLE" }),
    );
    expect(partnerProfileUpdateMany).not.toHaveBeenCalled();
    expect(partnerProfileCreateMany).not.toHaveBeenCalled();
  });
});

describe("partner payouts", () => {
  const payoutTx = {
    $executeRaw: vi.fn(),
    partnerProfile: { findUnique: vi.fn() },
    partnerCommission: { aggregate: vi.fn() },
    partnerPayout: { aggregate: vi.fn(), create: vi.fn() },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prismaTransaction.mockImplementation((callback: (tx: typeof payoutTx) => unknown) => callback(payoutTx));
    payoutTx.partnerProfile.findUnique.mockResolvedValue({
      id: "partner-1",
      user: { role: "PARTNER" },
      promoCode: null,
    });
    payoutTx.partnerCommission.aggregate.mockResolvedValue({ _sum: { amountKopecks: 25_000 } });
    payoutTx.partnerPayout.aggregate.mockResolvedValue({ _sum: { amountKopecks: 0 } });
    payoutTx.partnerPayout.create.mockResolvedValue({ id: "payout-1" });
  });

  it("checks and reserves the payout inside one locked transaction", async () => {
    await expect(requestPartnerPayout("partner-user", 25_000)).resolves.toEqual({ id: "payout-1" });

    expect(prismaTransaction).toHaveBeenCalledTimes(1);
    expect(payoutTx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(payoutTx.partnerPayout.create).toHaveBeenCalledWith({
      data: { partnerId: "partner-1", amountKopecks: 25_000 },
    });
  });

  it("rejects a request when an existing reservation exhausts the balance", async () => {
    payoutTx.partnerPayout.aggregate.mockResolvedValue({ _sum: { amountKopecks: 25_000 } });

    await expect(requestPartnerPayout("partner-user", 1)).rejects.toMatchObject({
      code: "PAYOUT_BALANCE_INSUFFICIENT",
    });
    expect(payoutTx.partnerPayout.create).not.toHaveBeenCalled();
  });
});
