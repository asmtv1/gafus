import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@gafus/prisma";
import { markPartnerBalancePaidAdmin } from "../adminPartnerService";
import { requestPartnerPayout } from "../partnerService";

const isolated = process.env.GAFUS_ISOLATED_TEST_DB === "1" &&
  (process.env.DATABASE_URL ?? "").includes("/gafus_refactor_concurrency");

describe.skipIf(!isolated)("partner payouts on isolated PostgreSQL", () => {
  const userIds: string[] = [];
  const partnerIds: string[] = [];
  const paymentIds: string[] = [];
  let adminId = "";

  async function addUser(role: "ADMIN" | "PARTNER" | "USER") {
    const user = await prisma.user.create({
      data: { username: `test-${randomUUID()}`, password: randomUUID(), role },
    });
    userIds.push(user.id);
    return user;
  }

  beforeAll(async () => {
    const admin = await addUser("ADMIN");
    adminId = admin.id;
  });

  async function seed() {
    const owner = await addUser("PARTNER");
    const buyer = await addUser("USER");
    const partner = await prisma.partnerProfile.create({ data: { userId: owner.id } });
    partnerIds.push(partner.id);
    const payment = await prisma.appSubscriptionPayment.create({
      data: {
        userId: buyer.id,
        provider: "YOOKASSA",
        kind: "INITIAL",
        status: "SUCCEEDED",
        idempotenceKey: randomUUID(),
        planCode: "MONTHLY",
        amount: 250,
        currency: "RUB",
      },
    });
    paymentIds.push(payment.id);
    await prisma.partnerCommission.create({
      data: { partnerId: partner.id, paymentId: payment.id, amountKopecks: 25000, kind: "EARNED" },
    });
    return { partnerId: partner.id, ownerId: owner.id };
  }

  afterAll(async () => {
    if (partnerIds.length) {
      await prisma.partnerPayout.deleteMany({ where: { partnerId: { in: partnerIds } } });
      await prisma.partnerCommission.deleteMany({ where: { partnerId: { in: partnerIds } } });
      await prisma.partnerProfile.deleteMany({ where: { id: { in: partnerIds } } });
    }
    if (paymentIds.length) await prisma.appSubscriptionPayment.deleteMany({ where: { id: { in: paymentIds } } });
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it("serializes two concurrent admin payouts", async () => {
    const { partnerId } = await seed();
    const results = await Promise.all([
      markPartnerBalancePaidAdmin({ actorId: adminId, partnerId }),
      markPartnerBalancePaidAdmin({ actorId: adminId, partnerId }),
    ]);
    expect(results.filter(x => x.success)).toHaveLength(1);
    const payouts = await prisma.partnerPayout.findMany({ where: { partnerId } });
    expect(payouts).toHaveLength(1);
    expect(payouts[0].amountKopecks).toBe(25000);
  }, 30000);

  it("serializes self-service payout and admin payout on the same lock key", async () => {
    const { partnerId, ownerId } = await seed();
    const [admin, self] = await Promise.allSettled([
      markPartnerBalancePaidAdmin({ actorId: adminId, partnerId }),
      requestPartnerPayout(ownerId, 25000),
    ]);
    const adminSuccess = admin.status === "fulfilled" && admin.value.success;
    const selfSuccess = self.status === "fulfilled";
    expect(Number(adminSuccess) + Number(selfSuccess)).toBe(1);
    const payouts = await prisma.partnerPayout.findMany({ where: { partnerId } });
    expect(payouts).toHaveLength(1);
    expect(payouts[0].amountKopecks).toBe(25000);
  }, 30000);
});
