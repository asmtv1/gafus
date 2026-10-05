import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@gafus/prisma";
import {
  cancelProfitVideoExpense,
  getProfitDashboard,
  saveProfitVideoExpense,
} from "../profitService";
import { recordFinanceRefund } from "../paymentFinanceService";

// Explicit opt-in and a dedicated database prevent writes to developer/production data.
const enabled =
  process.env.PROFIT_INTEGRATION_TESTS === "1" &&
  /\/gafus_profit_qa(?:_|\?|$)/.test(process.env.DATABASE_URL ?? "");
const now = new Date("2026-10-05T12:00:00Z");

describe.skipIf(!enabled)("profit PostgreSQL integration", () => {
  beforeAll(async () => {
    await prisma.profitVideoExpenseRevision.deleteMany({
      where: { expense: { actorId: "profit-test-admin" } },
    });
    await prisma.profitVideoExpense.deleteMany({ where: { actorId: "profit-test-admin" } });
    await prisma.appSubscriptionFinanceRefund.deleteMany({
      where: { paymentId: { startsWith: "profit-test-" } },
    });
    await prisma.partnerCommission.deleteMany({
      where: { paymentId: { startsWith: "profit-test-" } },
    });
    await prisma.partnerPayout.deleteMany({ where: { partnerId: "profit-test-partner" } });
    await prisma.appSubscriptionPayment.deleteMany({
      where: { id: { startsWith: "profit-test-" } },
    });
    await prisma.user.createMany({
      data: [
        {
          id: "profit-test-admin",
          username: "profit-test-admin",
          password: "unused",
          role: "ADMIN",
        },
        {
          id: "profit-test-partner-user",
          username: "profit-test-partner",
          password: "unused",
          role: "PARTNER",
        },
        { id: "profit-test-buyer", username: "profit-test-buyer", password: "unused" },
      ],
      skipDuplicates: true,
    });
    await prisma.partnerProfile.upsert({
      where: { id: "profit-test-partner" },
      update: {},
      create: { id: "profit-test-partner", userId: "profit-test-partner-user", isActive: false },
    });
    await prisma.appSubscriptionPayment.createMany({
      data: [
        {
          id: "profit-test-payment",
          userId: "profit-test-buyer",
          provider: "YOOKASSA",
          kind: "INITIAL",
          status: "SUCCEEDED",
          planCode: "MONTHLY",
          amount: "2490",
          currency: "RUB",
          idempotenceKey: "profit-test-payment",
          yookassaPaymentId: "yk-profit-test",
          createdAt: new Date("2026-08-28T00:00:00Z"),
          succeededAt: new Date("2026-09-18T12:00:00Z"),
          providerCapturedAt: new Date("2026-09-18T12:00:00Z"),
          providerIncomeAmount: "2390",
          financeRefundsIncomplete: false,
          providerPaymentMethodType: "sbp",
        },
        {
          id: "profit-test-august",
          userId: "profit-test-buyer",
          provider: "YOOKASSA",
          kind: "INITIAL",
          status: "SUCCEEDED",
          amount: "9999",
          currency: "RUB",
          idempotenceKey: "profit-test-august",
          succeededAt: new Date("2026-08-31T19:59:59Z"),
          providerCapturedAt: new Date("2026-08-31T19:59:59Z"),
        },
        {
          id: "profit-test-apple",
          userId: "profit-test-buyer",
          provider: "APPLE",
          kind: "INITIAL",
          status: "SUCCEEDED",
          amount: "9999",
          currency: "RUB",
          idempotenceKey: "profit-test-apple",
          succeededAt: new Date("2026-09-18T00:00:00Z"),
        },
      ],
      skipDuplicates: true,
    });
    await prisma.partnerCommission.createMany({
      data: {
        partnerId: "profit-test-partner",
        paymentId: "profit-test-payment",
        amountKopecks: 25000,
        kind: "EARNED",
        createdAt: new Date("2026-09-18T12:00:01Z"),
      },
      skipDuplicates: true,
    });
    await prisma.partnerPayout.create({
      data: { partnerId: "profit-test-partner", amountKopecks: 25000, status: "PAID" },
    });
  });
  afterAll(() => prisma.$disconnect());
  const video = {
    actorId: "profit-test-admin",
    requestKey: "profit-test-request-00001",
    input: {
      partnerId: "profit-test-partner",
      paidDay: "2026-09-18",
      quantity: 2,
      comment: "Два видео",
    },
  };
  let expenseId: string;

  it("creates one expense for concurrent duplicate submissions", async () => {
    const [a, b] = await Promise.all([
      saveProfitVideoExpense(video),
      saveProfitVideoExpense(video),
    ]);
    expect(a).toBe(b);
    expenseId = a;
    expect(await prisma.profitVideoExpense.count({ where: { requestKey: video.requestKey } })).toBe(
      1,
    );
    expect(await prisma.profitVideoExpenseRevision.count({ where: { expenseId } })).toBe(1);
  });
  it("matches the agreed example, ignores Apple/August and does not subtract payouts", async () => {
    const result = await getProfitDashboard({ from: "2026-09-01", to: "2026-09-30" }, now);
    expect(result.profitKopecks).toBe(61140);
    expect(result.paymentCount).toBe(1);
    expect(result.totals.partners).toBe(25000);
  });
  it("preserves inactive creator history and detects conflicting edits", async () => {
    await saveProfitVideoExpense({
      ...video,
      id: expenseId,
      version: 1,
      input: { ...video.input, quantity: 3 },
    });
    await expect(saveProfitVideoExpense({ ...video, id: expenseId, version: 1 })).rejects.toThrow(
      "Запись уже",
    );
    expect(await prisma.profitVideoExpenseRevision.count({ where: { expenseId } })).toBe(2);
    await cancelProfitVideoExpense(video.actorId, expenseId, 2);
    await cancelProfitVideoExpense(video.actorId, expenseId, 2);
    const result = await getProfitDashboard({ from: "2026-09-01", to: "2026-09-30" }, now);
    expect(result.totals.videos).toBe(0);
    expect(result.videos[0].canceled).toBe(true);
    expect(await prisma.profitVideoExpenseRevision.count({ where: { expenseId } })).toBe(3);
  });
  it("denies non-admin mutations and invalid dates", async () => {
    await expect(
      saveProfitVideoExpense({ ...video, actorId: "profit-test-partner-user" }),
    ).rejects.toThrow("Недостаточно");
    await expect(
      saveProfitVideoExpense({ ...video, input: { ...video.input, paidDay: "2026-08-31" } }),
    ).rejects.toThrow("Некорректная дата");
    await expect(
      saveProfitVideoExpense({ ...video, input: { ...video.input, paidDay: "2099-01-01" } }),
    ).rejects.toThrow("Некорректная дата");
  });
  it("accounts for a partial refund in its own month once", async () => {
    const payment = await prisma.appSubscriptionPayment.findUniqueOrThrow({
      where: { id: "profit-test-payment" },
    });
    const refund = {
      id: "profit-test-refund",
      payment_id: "yk-profit-test",
      status: "succeeded",
      amount: { value: "1000.00", currency: "RUB" },
      created_at: "2026-10-01T00:00:00Z",
    };
    await prisma.$transaction((tx) => recordFinanceRefund(tx, payment, refund));
    await prisma.$transaction((tx) => recordFinanceRefund(tx, payment, refund));
    const october = await getProfitDashboard({ from: "2026-10-01", to: "2026-10-05" }, now);
    expect(october.totals).toMatchObject({
      payments: 0,
      refunds: 100000,
      yookassa: 0,
      npd: -4000,
      server: 0,
    });
    expect(october.profitKopecks).toBe(-96000);
    const all = await getProfitDashboard({ from: "2026-09-01", to: "2026-10-05" }, now);
    expect(all.totals.yookassa).toBe(10000);
    expect(all.paymentCount).toBe(1);
  });
  it("requires a complete full refund ledger and preserves the original commission", async () => {
    const payment = await prisma.appSubscriptionPayment.update({
      where: { id: "profit-test-payment" },
      data: { status: "REFUNDED" },
    });
    const incomplete = await getProfitDashboard({ from: "2026-10-01", to: "2026-10-05" }, now);
    expect(incomplete.profitKopecks).toBeNull();
    await prisma.$transaction((tx) =>
      recordFinanceRefund(tx, payment, {
        id: "profit-test-refund-rest",
        payment_id: "yk-profit-test",
        status: "succeeded",
        amount: { value: "1490.00", currency: "RUB" },
        created_at: "2026-10-02T00:00:00Z",
      }),
    );
    await prisma.partnerCommission.create({
      data: {
        partnerId: "profit-test-partner",
        paymentId: payment.id,
        kind: "REFUND_ADJUSTMENT",
        amountKopecks: -25000,
        createdAt: new Date("2026-10-02T00:00:01Z"),
      },
    });
    const all = await getProfitDashboard({ from: "2026-09-01", to: "2026-10-05" }, now);
    expect(all.totals).toMatchObject({
      payments: 249000,
      refunds: 249000,
      yookassa: 10000,
      npd: 0,
      partners: 0,
    });
    expect(all.profitKopecks).toBe(-52900);
  });

  it("withholds final profit for unknown fees and unresolved historical refunds", async () => {
    await prisma.appSubscriptionPayment.update({
      where: { id: "profit-test-payment" },
      data: { providerIncomeAmount: null, financeRefundsIncomplete: true },
    });
    const result = await getProfitDashboard({ from: "2026-09-01", to: "2026-09-30" }, now);
    expect(result.profitKopecks).toBeNull();
    expect(result.missingFees).toBe(1);
    await prisma.appSubscriptionFinanceRefund.deleteMany({
      where: { paymentId: "profit-test-payment" },
    });
    const october = await getProfitDashboard({ from: "2026-10-01", to: "2026-10-05" }, now);
    expect(october.profitKopecks).toBeNull();
  });
});
