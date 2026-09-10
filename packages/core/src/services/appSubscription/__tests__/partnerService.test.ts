import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  partnerReferralFindUnique,
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
    partnerReferral: { findUnique: partnerReferralFindUnique },
    partnerCommission: { create: partnerCommissionCreate, findUnique: partnerCommissionFindUnique },
  };

  beforeEach(() => vi.clearAllMocks());

  it("writes the fixed 25,000-kopeck credit for an attributed payment", async () => {
    partnerReferralFindUnique.mockResolvedValue({ partnerId: "partner-1" });
    partnerCommissionCreate.mockResolvedValue({ id: "commission-1" });

    await recordPartnerCommissionForPayment(tx, { id: "payment-1", userId: "buyer-1" });

    expect(partnerCommissionCreate).toHaveBeenCalledWith({
      data: { partnerId: "partner-1", paymentId: "payment-1", amountKopecks: PARTNER_COMMISSION_KOPECKS, kind: "EARNED" },
    });
  });

  it("writes exactly one negative adjustment after a full refund", async () => {
    partnerCommissionFindUnique.mockResolvedValue({ partnerId: "partner-1" });
    partnerCommissionCreate.mockResolvedValue({ id: "adjustment-1" });

    await reversePartnerCommissionForRefund(tx, { id: "payment-1", userId: "buyer-1" });

    expect(partnerCommissionCreate).toHaveBeenCalledWith({
      data: { partnerId: "partner-1", paymentId: "payment-1", amountKopecks: -PARTNER_COMMISSION_KOPECKS, kind: "REFUND_ADJUSTMENT" },
    });
  });

  it("treats a duplicate provider delivery as an idempotent no-op", async () => {
    partnerReferralFindUnique.mockResolvedValue({ partnerId: "partner-1" });
    partnerCommissionCreate.mockRejectedValue({ code: "P2002" });

    await expect(recordPartnerCommissionForPayment(tx, { id: "payment-1", userId: "buyer-1" })).resolves.toBeNull();
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
