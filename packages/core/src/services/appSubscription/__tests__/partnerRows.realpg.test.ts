/** Private opt-in PostgreSQL 18 test: only disposable, loopback DB. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import {
  withPartnerTransaction,
  readPartnerProfileForDashboard,
  lockPartnerAccount,
  readPartnerUserRole,
  lockPartnerBinding,
  readPartnerPromoById,
  readPartnerProfileBinding,
  readPromoIdByNormalizedCode,
  readPartnerForPromoAttribution,
  createPartnerReferralOnce,
  readPartnerReferral,
  readPartnerDashboardTotals,
  readPartnerPayoutTotals,
  lockPartnerPayout,
  createPartnerCommission,
  readEarnedPartnerCommission,
  createPartnerRefundAdjustment,
} from "@gafus/subscription-finance-server/partner-rows";
import { requestPartnerPayout } from "@gafus/subscription-payment-server/partner";

const qa = describe.runIf(process.env.GAFUS_PARTNER_ROWS_REAL_PG === "enabled");
const ownerId = "partner-rows-qa-owner";
const buyerId = "partner-rows-qa-buyer";
const partnerCode = "PARTNER_ROWS_QA_CODE";
let partnerId = "";
let promoCodeId = "";
let paymentId = "";
let ready = false;

qa("partner transactional persistence boundaries (PostgreSQL 18)", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    expect(url.protocol).toBe("postgresql:");
    expect(url.hostname).toBe("127.0.0.1");
    expect(url.pathname).toBe("/gafus_partner_rows_qa");
    const database = await prisma.$queryRawUnsafe<{ db: string; version: number }[]>(
      "SELECT current_database() AS db, current_setting('server_version_num')::integer AS version",
    );
    expect(database[0]?.db).toBe("gafus_partner_rows_qa");
    expect(database[0]?.version).toBeGreaterThanOrEqual(180000);
    ready = true;
    await prisma.user.createMany({
      data: [
        { id: ownerId, username: ownerId, password: "fictional-test-only", role: "PARTNER" },
        { id: buyerId, username: buyerId, password: "fictional-test-only", role: "USER" },
      ],
    });
    const promo = await prisma.appSubscriptionPromoCode.create({
      data: {
        code: partnerCode,
        normalizedCode: partnerCode,
        discountPercent: 15,
        isActive: true,
        revision: 1,
        createdById: ownerId,
        updatedById: ownerId,
      },
    });
    promoCodeId = promo.id;
    const profile = await prisma.partnerProfile.create({
      data: { userId: ownerId, promoCodeId },
    });
    partnerId = profile.id;
    const payment = await prisma.appSubscriptionPayment.create({
      data: {
        userId: buyerId,
        provider: "YOOKASSA",
        kind: "INITIAL",
        status: "SUCCEEDED",
        idempotenceKey: "partner-rows-qa-payment",
        planCode: "MONTHLY",
        amount: 250,
        currency: "RUB",
      },
    });
    paymentId = payment.id;
  });
  afterAll(async () => {
    if (!ready) return;
    await prisma.partnerPayout.deleteMany({ where: { partnerId } });
    await prisma.partnerCommission.deleteMany({ where: { partnerId } });
    await prisma.partnerReferral.deleteMany({ where: { partnerId } });
    await prisma.partnerProfile.deleteMany({ where: { id: partnerId } });
    await prisma.appSubscriptionPayment.deleteMany({ where: { id: paymentId } });
    await prisma.appSubscriptionPromoCode.deleteMany({ where: { id: promoCodeId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, buyerId] } } });
    await prisma.$disconnect();
  });

  it("locks the account and reads role / promo identity in one transaction", async () => {
    await withPartnerTransaction(async (tx) => {
      await lockPartnerAccount(tx, ownerId);
      expect((await readPartnerUserRole(tx, ownerId))?.role).toBe("PARTNER");
      await lockPartnerBinding(tx, ownerId, promoCodeId);
      const profile = await readPartnerProfileBinding(tx, ownerId);
      expect(profile?.promoCodeId).toBe(promoCodeId);
      expect((await readPartnerPromoById(tx, promoCodeId))?.normalizedCode).toBe(partnerCode);
      expect((await readPromoIdByNormalizedCode(tx, partnerCode))?.id).toBe(promoCodeId);
      expect((await readPartnerForPromoAttribution(tx, promoCodeId))?.id).toBe(partnerId);
    });
    expect((await readPartnerProfileForDashboard(prisma as never, ownerId))?.id).toBe(partnerId);
  });

  it("deduplicates the buyer's referral in SQL and binds the correct partner", async () => {
    await withPartnerTransaction(async (tx) => {
      expect((await createPartnerReferralOnce(tx, partnerId, buyerId)).count).toBe(1);
      expect((await createPartnerReferralOnce(tx, partnerId, buyerId)).count).toBe(0);
      expect((await readPartnerReferral(tx, buyerId))?.partnerId).toBe(partnerId);
    });
    expect(await prisma.partnerReferral.count({ where: { buyerId } })).toBe(1);
  });

  it("writes one earned commission and full-refund adjustment in the same payment ledger", async () => {
    await withPartnerTransaction(async (tx) => {
      await createPartnerCommission(tx, {
        partnerId,
        paymentId,
        amountKopecks: 25000,
      });
      expect((await readEarnedPartnerCommission(tx, paymentId))?.amountKopecks).toBe(25000);
      await createPartnerRefundAdjustment(tx, {
        partnerId,
        paymentId,
        amountKopecks: -25000,
      });
    });
    const commissions = await prisma.partnerCommission.findMany({ where: { paymentId } });
    expect(commissions.map((row) => row.kind).sort()).toEqual(["EARNED", "REFUND_ADJUSTMENT"]);
    expect(commissions.reduce((sum, row) => sum + row.amountKopecks, 0)).toBe(0);
  });

  it("prevents double-spend when concurrent payout requests exceed available balance", async () => {
    // A second verified payment supports one 25,000-kopeck payout.
    const funding = await prisma.appSubscriptionPayment.create({
      data: {
        userId: buyerId,
        provider: "YOOKASSA",
        kind: "INITIAL",
        status: "SUCCEEDED",
        idempotenceKey: "partner-rows-qa-payment-funded",
        planCode: "MONTHLY",
        amount: 250,
        currency: "RUB",
      },
    });
    await withPartnerTransaction(async (tx) => {
      await createPartnerCommission(tx, {
        partnerId,
        paymentId: funding.id,
        amountKopecks: 25000,
      });
      await lockPartnerPayout(tx, ownerId);
      const balance = await readPartnerPayoutTotals(tx, partnerId);
      expect(balance.earnedKopecks).toBe(25000); // refund-adjusted first payment nets to zero
      expect(balance.reservedKopecks).toBe(0);
    });
    const two = await Promise.allSettled([
      requestPartnerPayout(ownerId, 25000),
      requestPartnerPayout(ownerId, 25000),
    ]);
    expect(two.filter((p) => p.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.partnerPayout.count({ where: { partnerId } })).toBe(1);
    expect((await readPartnerDashboardTotals(partnerId)).reservedKopecks).toBe(25000);
    await prisma.partnerCommission.deleteMany({ where: { paymentId: funding.id } });
    await prisma.appSubscriptionPayment.delete({ where: { id: funding.id } });
  }, 30000);
});
