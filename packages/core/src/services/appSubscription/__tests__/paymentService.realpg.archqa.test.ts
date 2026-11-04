/**
 * Genuine packaged Core + Prisma + current-schema disposable PostgreSQL.
 * Only the remote YooKassa HTTP read is stubbed, and any other fetch throws.
 * Requires GAFUS_ARCHQA_REALPG=1 and a fresh local DB name/URL from the
 * dedicated launcher. Not enabled by normal Core vitest config.
 * No production data or payment service is contacted.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@gafus/prisma";
import { handleYookassaAppSubscriptionWebhook } from "../paymentService";

const database = process.env.DATABASE_URL ?? "";
const safe = (() => {
  try {
    const url = new URL(database);
    return process.env.GAFUS_ARCHQA_REALPG === "1" &&
      url.protocol === "postgresql:" && url.hostname === "127.0.0.1" &&
      /^archqa_schema_[a-f0-9]{12}$/.test(url.pathname.slice(1)) &&
      process.env.GAFUS_ARCHQA_DB_NAME === url.pathname.slice(1);
  } catch { return false; }
})();
if (!safe) throw Error("ARCHQA_PAYMENT_REALPG_DISPOSABLE_DATABASE_REQUIRED");

const nonce = randomUUID().replaceAll("-", "");
const providerId = `qa-yoo-${nonce}`;
const pendingProviderId = `qa-yoo-pending-${nonce}`;
const raceProviderId = `qa-yoo-race-${nonce}`;
const refundId = `qa-refund-${nonce}`;
let userId = "";
let paymentId = "";
let pendingPaymentId = "";
let raceUserId = "";
let racePaymentId = "";
const eventMetadata = () => ({
  kind: "app_subscription", localPaymentId: paymentId,
  userId, planCode: "WEEKLY",
});
const params = (providerEventKey: string, event = "payment.succeeded") => ({
  event, yookassaPaymentId: providerId, providerEventKey,
  metadata: eventMetadata(), shopId: "qa-fake-shop", secretKey: "qa-fake-secret",
});
const paymentObject = (id = providerId) => ({
  id, status: "succeeded", paid: true,
  amount: { value: "200.00", currency: "RUB" },
  income_amount: { value: "190.00", currency: "RUB" },
  captured_at: "2026-11-01T11:05:00Z",
  payment_method: { type: "sbp" },
  metadata: id === pendingProviderId
    ? { kind: "app_subscription", localPaymentId: pendingPaymentId, userId, planCode: "WEEKLY" }
    : id === raceProviderId
      ? { kind: "app_subscription", localPaymentId: racePaymentId, userId: raceUserId, planCode: "WEEKLY" }
      : eventMetadata(),
});
const remote = vi.fn(async (url: unknown) => {
  const str = String(url);
  if (str === `https://api.yookassa.ru/v3/refunds/${refundId}`) {
    return new Response(JSON.stringify({ id: refundId, status: "succeeded",
      payment_id: pendingProviderId, amount: { value: "200.00", currency: "RUB" },
      created_at: "2026-11-09T11:05:00Z" }), { status: 200,
      headers: { "content-type": "application/json" } });
  }
  const validIds = [providerId, pendingProviderId, raceProviderId];
  const selected = validIds.find(id => str === `https://api.yookassa.ru/v3/payments/${id}`);
  if (!selected) throw Error("BLOCKED_NON_SYNTHETIC_PROVIDER_REQUEST");
  return new Response(JSON.stringify(paymentObject(selected)), {
    status: 200, headers: { "content-type": "application/json" },
  });
});

beforeAll(async () => {
  const rows = await prisma.$queryRawUnsafe<{ db: string }[]>(
    "SELECT current_database() AS db",
  );
  expect(rows[0]?.db).toBe(process.env.GAFUS_ARCHQA_DB_NAME);
  vi.stubGlobal("fetch", remote);
  const user = await prisma.user.create({
    data: { username: `qa_payment_${nonce}`, password: "synthetic-inaccessible-hash", role: "USER" },
  });
  userId = user.id;
  const payment = await prisma.appSubscriptionPayment.create({
    data: {
      userId, provider: "YOOKASSA", kind: "INITIAL", planCode: "WEEKLY",
      status: "SUCCEEDED", amount: "200.00", currency: "RUB",
      idempotenceKey: `qa:verified:${nonce}`, yookassaPaymentId: providerId,
    },
  });
  paymentId = payment.id;
  const pending = await prisma.appSubscriptionPayment.create({
    data: {
      userId, provider: "YOOKASSA", kind: "INITIAL", planCode: "WEEKLY",
      status: "PENDING", amount: "200.00", currency: "RUB",
      idempotenceKey: `qa:pending:${nonce}`,
      periodStart: new Date("2026-11-01T11:00:00.000Z"),
      periodEnd: new Date("2026-11-08T11:00:00.000Z"),
    },
  });
  pendingPaymentId = pending.id;
  const raceUser = await prisma.user.create({
    data: { username: `qa_race_${nonce}`, password: "synthetic-only", role: "USER" },
  });
  raceUserId = raceUser.id;
  const race = await prisma.appSubscriptionPayment.create({
    data: { userId: raceUserId, provider: "YOOKASSA", kind: "INITIAL",
      planCode: "WEEKLY", status: "PENDING", amount: "200.00", currency: "RUB",
      idempotenceKey: `qa:race:${nonce}`,
      periodStart: new Date("2026-11-01T11:00:00.000Z"),
      periodEnd: new Date("2026-11-08T11:00:00.000Z"),
    },
  });
  racePaymentId = race.id;
});
afterAll(async () => {
  vi.unstubAllGlobals();
  // All fixtures live in the owned disposable PG tmpfs, destroyed by launcher.
  // Do not cascade-delete finance/refund fixtures before snapshot assertions.
  await prisma.$disconnect();
});

describe("real Core YooKassa webhook replay against disposable current-schema PostgreSQL", () => {
  it("a sequential replay yields one durable processed event, no duplicate subscription", async () => {
    const key = `payment.succeeded:${providerId}:sequential`;
    expect(await handleYookassaAppSubscriptionWebhook(params(key))).toEqual({ userId });
    expect(await handleYookassaAppSubscriptionWebhook(params(key))).toEqual({ userId });
    const events = await prisma.appSubscriptionEvent.findMany({ where: { providerEventKey: key } });
    expect(events).toHaveLength(1);
    expect(events[0]?.processingStatus).toBe("PROCESSED");
    expect(await prisma.appSubscription.count({ where: { userId } })).toBe(0);
    const payment = await prisma.appSubscriptionPayment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe("SUCCEEDED");
    expect(payment.providerPaymentMethodType).toBe("sbp");
    expect(payment.providerIncomeAmount?.toString()).toBe("190");
    expect(remote).toHaveBeenCalledTimes(2);
  });

  it("concurrent replays still commit a single event receipt", async () => {
    const key = `payment.succeeded:${providerId}:parallel`;
    const results = await Promise.all([
      handleYookassaAppSubscriptionWebhook(params(key)),
      handleYookassaAppSubscriptionWebhook(params(key)),
    ]);
    expect(results).toEqual([{ userId }, { userId }]);
    expect(await prisma.appSubscriptionEvent.count({ where: { providerEventKey: key } })).toBe(1);
    expect(await prisma.appSubscription.count({ where: { userId } })).toBe(0);
  });

  it("a failed provider ACK is not falsely marked processed, retry recovers", async () => {
    const key = `payment.succeeded:${providerId}:failed-retry`;
    remote.mockRejectedValueOnce(Error("QA_SIMULATED_PROVIDER_UNAVAILABLE"));
    await expect(handleYookassaAppSubscriptionWebhook(params(key)))
      .rejects.toThrow("QA_SIMULATED_PROVIDER_UNAVAILABLE");
    const failed = await prisma.appSubscriptionEvent.findMany({ where: { providerEventKey: key } });
    expect(failed).toHaveLength(1);
    expect(failed[0]?.processingStatus).toBe("RECEIVED");
    // When the already-successful payment branch fails verification, the
    // legacy handler keeps RECEIVED (no false ACK). A future retry proceeds.
    expect(await handleYookassaAppSubscriptionWebhook(params(key))).toEqual({ userId });
    const retried = await prisma.appSubscriptionEvent.findMany({ where: { providerEventKey: key } });
    expect(retried).toHaveLength(1);
    expect(retried[0]?.processingStatus).toBe("PROCESSED");
  });

  it("verifies an initial PENDING payment, commits one ACTIVE subscription, then replays without a second grant", async () => {
    const key = `payment.succeeded:${pendingProviderId}:first`;
    const input = {
      event: "payment.succeeded", providerEventKey: key,
      yookassaPaymentId: pendingProviderId,
      metadata: { kind: "app_subscription", localPaymentId: pendingPaymentId,
        userId, planCode: "WEEKLY" },
      shopId: "qa-fake-shop", secretKey: "qa-fake-secret",
    };
    expect(await handleYookassaAppSubscriptionWebhook(input)).toEqual({ userId });
    const payment = await prisma.appSubscriptionPayment.findUniqueOrThrow({ where: { id: pendingPaymentId } });
    expect(payment.status).toBe("SUCCEEDED");
    expect(payment.yookassaPaymentId).toBe(pendingProviderId);
    expect(payment.subscriptionId).toBeTruthy();
    const subscription = await prisma.appSubscription.findUniqueOrThrow({
      where: { id: payment.subscriptionId! },
    });
    expect(subscription.status).toBe("ACTIVE");
    expect(subscription.currentPeriodEnd?.toISOString()).toBe("2026-11-08T11:00:00.000Z");
    expect(await prisma.appSubscription.count({ where: { userId } })).toBe(1);
    expect(await handleYookassaAppSubscriptionWebhook(input)).toEqual({ userId });
    expect(await prisma.appSubscription.count({ where: { userId } })).toBe(1);
    expect(await prisma.appSubscriptionEvent.count({ where: { providerEventKey: key } })).toBe(1);
    expect(await prisma.appSubscriptionEvent.findFirst({ where: { providerEventKey: key } }))
      .toMatchObject({ processingStatus: "PROCESSED" });
  });


  it("two concurrent initial payment callbacks commit one ACTIVE grant and one event", async () => {
    const key = `payment.succeeded:${raceProviderId}:race`;
    const input = {
      event: "payment.succeeded", providerEventKey: key,
      yookassaPaymentId: raceProviderId,
      metadata: { kind: "app_subscription", localPaymentId: racePaymentId,
        userId: raceUserId, planCode: "WEEKLY" },
      shopId: "qa-fake-shop", secretKey: "qa-fake-secret",
    };
    const callbacks = await Promise.allSettled([
      handleYookassaAppSubscriptionWebhook(input),
      handleYookassaAppSubscriptionWebhook(input),
    ]);
    expect(callbacks.filter(result => result.status === "fulfilled")).toHaveLength(2);
    expect(await prisma.appSubscription.count({ where: { userId: raceUserId } })).toBe(1);
    expect(await prisma.appSubscriptionEvent.count({ where: { providerEventKey: key } })).toBe(1);
    expect(await prisma.appSubscriptionPayment.findUniqueOrThrow({ where: { id: racePaymentId } }))
      .toMatchObject({ status: "SUCCEEDED", yookassaPaymentId: raceProviderId });
  });

  it("full verified refund is idempotent, persists finance refund and cannot regrant access", async () => {
    const key = `refund.succeeded:${refundId}`;
    const input = { event: "refund.succeeded", yookassaPaymentId: pendingProviderId,
      yookassaRefundId: refundId, providerEventKey: key,
      shopId: "qa-fake-shop", secretKey: "qa-fake-secret" };
    expect(await handleYookassaAppSubscriptionWebhook(input)).toEqual({ userId });
    expect(await handleYookassaAppSubscriptionWebhook(input)).toEqual({ userId });
    const refunded = await prisma.appSubscriptionPayment.findUniqueOrThrow({
      where: { id: pendingPaymentId },
    });
    expect(refunded.status).toBe("REFUNDED");
    expect(await prisma.appSubscriptionFinanceRefund.count({
      where: { paymentId: pendingPaymentId, providerRefundId: refundId },
    })).toBe(1);
    expect(await prisma.appSubscriptionEvent.count({ where: { providerEventKey: key } })).toBe(1);
    expect(await prisma.appSubscription.findUniqueOrThrow({
      where: { id: refunded.subscriptionId! },
    })).toMatchObject({ status: "CANCELED" });
  });
});
