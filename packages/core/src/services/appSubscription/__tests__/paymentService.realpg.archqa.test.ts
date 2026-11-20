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
import { createPaymentService } from "@gafus/subscription-payment-server/service";
import { AppSubscriptionPromoCodeDomainError, isAppSubscriptionPromoCodeEntryEnabled } from "../promoCodeService";
const { handleYookassaAppSubscriptionWebhook } = createPaymentService({
  AppSubscriptionPromoCodeDomainError, isAppSubscriptionPromoCodeEntryEnabled,
});

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
// Extra IDs exist only in this disposable PG suite; never resolve external URLs.
const injectedPayments = new Map<string, ReturnType<typeof paymentObject>>();
const injectedRefunds = new Map<string, {
  paymentId:string; amount?:string; currency?:string; status?:string;
}>();
const failPaymentOnce = new Set<string>();
const failRefundOnce = new Set<string>();
const pendingForCoverage = async () => {
  const unique=randomUUID().replaceAll('-','');
  const user=await prisma.user.create({data:{username:`qa_webhook_risk_${unique}`,password:'disposable',role:'USER'}});
  const payment=await prisma.appSubscriptionPayment.create({data:{
    userId:user.id,provider:'YOOKASSA',kind:'INITIAL',planCode:'WEEKLY',
    status:'PENDING',amount:'200.00',currency:'RUB',idempotenceKey:`qa:risk:${unique}`,
    periodStart:new Date('2026-11-01T11:00:00Z'),periodEnd:new Date('2026-11-08T11:00:00Z'),
  }});
  const provider=`qa-risk-payment-${unique}`;
  const metadata={kind:'app_subscription',localPaymentId:payment.id,userId:user.id,planCode:'WEEKLY'};
  const fixture={...paymentObject(),id:provider,metadata};
  injectedPayments.set(provider,fixture);
  const input={event:'payment.succeeded',yookassaPaymentId:provider,
    providerEventKey:`payment.succeeded:${provider}`,metadata,
    shopId:'qa-fake-shop',secretKey:'qa-fake-secret'};
  return {user,payment,provider,metadata,fixture,input};
};

const remote = vi.fn(async (url: unknown) => {
  const requested=String(url);
  for(const [id,fixture] of injectedPayments){
    if(requested!==`https://api.yookassa.ru/v3/payments/${id}`)continue;
    if(failPaymentOnce.delete(id))throw Error('QA_INJECTED_PROVIDER_PAYMENT_TIMEOUT');
    return new Response(JSON.stringify(fixture),{status:200,headers:{'content-type':'application/json'}});
  }
  for(const [id,fixture] of injectedRefunds){
    if(requested!==`https://api.yookassa.ru/v3/refunds/${id}`)continue;
    if(failRefundOnce.delete(id))throw Error('QA_INJECTED_PROVIDER_REFUND_TIMEOUT');
    return new Response(JSON.stringify({id,status:fixture.status??'succeeded',payment_id:fixture.paymentId,
      amount:{value:fixture.amount??'200.00',currency:fixture.currency??'RUB'},
      created_at:'2026-11-09T11:05:00Z'}),
      {status:200,headers:{'content-type':'application/json'}});
  }
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

  it("provider timeout before first entitlement is retried without duplicate grant or receipt", async () => {
    const suffix=randomUUID().replaceAll('-','');
    const testUser=await prisma.user.create({data:{username:`qa_fault_pay_${suffix}`,password:'qa-only',role:'USER'}});
    const payment=await prisma.appSubscriptionPayment.create({data:{
      userId:testUser.id,provider:'YOOKASSA',kind:'INITIAL',planCode:'WEEKLY',
      status:'PENDING',amount:'200.00',currency:'RUB',idempotenceKey:`qa:fault:${suffix}`,
      periodStart:new Date('2026-11-01T11:00:00Z'),periodEnd:new Date('2026-11-08T11:00:00Z'),
    }});
    const provider=`qa-fault-payment-${suffix}`;
    injectedPayments.set(provider,{
      ...paymentObject(),id:provider,metadata:{kind:'app_subscription',
        localPaymentId:payment.id,userId:testUser.id,planCode:'WEEKLY'},
    });
    failPaymentOnce.add(provider);
    const key=`payment.succeeded:${provider}`;
    const event={event:'payment.succeeded',yookassaPaymentId:provider,providerEventKey:key,
      metadata:{kind:'app_subscription',localPaymentId:payment.id,userId:testUser.id,planCode:'WEEKLY'},
      shopId:'qa-fake-shop',secretKey:'qa-fake-secret'};
    await expect(handleYookassaAppSubscriptionWebhook(event)).rejects.toThrow('QA_INJECTED_PROVIDER_PAYMENT_TIMEOUT');
    expect((await prisma.appSubscriptionPayment.findUniqueOrThrow({where:{id:payment.id}})).status).toBe('PENDING');
    expect(await prisma.appSubscription.count({where:{userId:testUser.id}})).toBe(0);
    expect(await prisma.appSubscriptionEvent.count({where:{providerEventKey:key,processingStatus:'PROCESSED'}})).toBe(0);
    const retries=await Promise.allSettled([
      handleYookassaAppSubscriptionWebhook(event),handleYookassaAppSubscriptionWebhook(event),
    ]);
    expect(retries).toHaveLength(2);
    expect(retries.every(result=>result.status==='fulfilled')).toBe(true);
    expect(await prisma.appSubscription.count({where:{userId:testUser.id}})).toBe(1);
    expect(await prisma.appSubscriptionEvent.count({where:{providerEventKey:key}})).toBe(1);
    expect((await prisma.appSubscriptionPayment.findUniqueOrThrow({where:{id:payment.id}})).status).toBe('SUCCEEDED');
  });

  it("refund verification outage preserves access until one verified refund is committed", async () => {
    const suffix=randomUUID().replaceAll('-','');
    const testUser=await prisma.user.create({data:{username:`qa_fault_refund_${suffix}`,password:'qa-only',role:'USER'}});
    const payment=await prisma.appSubscriptionPayment.create({data:{
      userId:testUser.id,provider:'YOOKASSA',kind:'INITIAL',planCode:'WEEKLY',
      status:'PENDING',amount:'200.00',currency:'RUB',idempotenceKey:`qa:refund-fault:${suffix}`,
      periodStart:new Date('2026-11-01T11:00:00Z'),periodEnd:new Date('2026-11-08T11:00:00Z'),
    }});
    const provider=`qa-fault-refund-pay-${suffix}`;
    const metadata={kind:'app_subscription',localPaymentId:payment.id,userId:testUser.id,planCode:'WEEKLY'};
    injectedPayments.set(provider,{...paymentObject(),id:provider,metadata});
    const initial={event:'payment.succeeded',yookassaPaymentId:provider,
      providerEventKey:`payment.succeeded:${provider}`,metadata,shopId:'qa-fake-shop',secretKey:'qa-fake-secret'};
    await handleYookassaAppSubscriptionWebhook(initial);
    const afterGrant=await prisma.appSubscriptionPayment.findUniqueOrThrow({where:{id:payment.id}});
    expect(afterGrant.subscriptionId).toBeTruthy();
    const refund=`qa-fault-refund-${suffix}`;
    injectedRefunds.set(refund,{paymentId:provider});failRefundOnce.add(refund);
    const key=`refund.succeeded:${refund}`;
    const event={event:'refund.succeeded',yookassaPaymentId:provider,yookassaRefundId:refund,
      providerEventKey:key,shopId:'qa-fake-shop',secretKey:'qa-fake-secret'};
    await expect(handleYookassaAppSubscriptionWebhook(event)).rejects.toThrow('QA_INJECTED_PROVIDER_REFUND_TIMEOUT');
    expect((await prisma.appSubscriptionPayment.findUniqueOrThrow({where:{id:payment.id}})).status).toBe('SUCCEEDED');
    expect((await prisma.appSubscription.findUniqueOrThrow({where:{id:afterGrant.subscriptionId!}})).status).toBe('ACTIVE');
    expect(await prisma.appSubscriptionFinanceRefund.count({where:{paymentId:payment.id}})).toBe(0);
    await handleYookassaAppSubscriptionWebhook(event);
    await handleYookassaAppSubscriptionWebhook(event);
    expect(await prisma.appSubscriptionFinanceRefund.count({where:{paymentId:payment.id,providerRefundId:refund}})).toBe(1);
    expect(await prisma.appSubscriptionEvent.count({where:{providerEventKey:key}})).toBe(1);
    expect((await prisma.appSubscription.findUniqueOrThrow({where:{id:afterGrant.subscriptionId!}})).status).toBe('CANCELED');
  });

  it("unconfirmed provider payment rejects grant, then verified replay grants exactly once",async()=>{
    const {user,payment,provider,fixture,input}=await pendingForCoverage();
    injectedPayments.set(provider,{...fixture,status:'pending',paid:false});
    await expect(handleYookassaAppSubscriptionWebhook(input)).rejects.toThrow('YooKassa payment is not confirmed');
    expect((await prisma.appSubscriptionPayment.findUniqueOrThrow({where:{id:payment.id}})).status).toBe('PENDING');
    expect(await prisma.appSubscription.count({where:{userId:user.id}})).toBe(0);
    expect(await prisma.appSubscriptionEvent.findUniqueOrThrow({where:{providerEventKey:input.providerEventKey}}))
      .toMatchObject({processingStatus:'FAILED'});
    injectedPayments.set(provider,fixture);
    const replays=await Promise.all([handleYookassaAppSubscriptionWebhook(input),handleYookassaAppSubscriptionWebhook(input)]);
    expect(replays).toEqual([{userId:user.id},{userId:user.id}]);
    expect(await prisma.appSubscription.count({where:{userId:user.id,status:'ACTIVE'}})).toBe(1);
    expect(await prisma.appSubscriptionEvent.count({where:{providerEventKey:input.providerEventKey}})).toBe(1);
    expect((await prisma.appSubscriptionPayment.findUniqueOrThrow({where:{id:payment.id}})).status).toBe('SUCCEEDED');
  });

  it("wrong provider amount is rejected without a grant and retry uses immutable checkout amount",async()=>{
    const {user,payment,provider,fixture,input}=await pendingForCoverage();
    injectedPayments.set(provider,{...fixture,amount:{value:'199.00',currency:'RUB'}});
    await expect(handleYookassaAppSubscriptionWebhook(input)).rejects.toThrow('YooKassa payment amount mismatch');
    expect(await prisma.appSubscription.count({where:{userId:user.id}})).toBe(0);
    expect((await prisma.appSubscriptionPayment.findUniqueOrThrow({where:{id:payment.id}})).status).toBe('PENDING');
    injectedPayments.set(provider,fixture);
    expect(await handleYookassaAppSubscriptionWebhook(input)).toEqual({userId:user.id});
    expect(await handleYookassaAppSubscriptionWebhook(input)).toEqual({userId:user.id});
    expect(await prisma.appSubscription.count({where:{userId:user.id}})).toBe(1);
    const final=await prisma.appSubscriptionPayment.findUniqueOrThrow({where:{id:payment.id}});
    expect(final.status).toBe('SUCCEEDED');
    expect(final.amount?.toString()).toBe('200');
    expect(await prisma.appSubscriptionEvent.count({where:{providerEventKey:input.providerEventKey}})).toBe(1);
  });

  it("cross-account provider metadata cannot grant entitlement even with valid incoming webhook metadata",async()=>{
    const {user,payment,provider,fixture,input}=await pendingForCoverage();
    injectedPayments.set(provider,{...fixture,metadata:{...fixture.metadata,userId:'qa-other-account'}});
    await expect(handleYookassaAppSubscriptionWebhook(input)).rejects.toThrow('YooKassa payment metadata userId mismatch');
    expect(await prisma.appSubscription.count({where:{userId:user.id}})).toBe(0);
    expect((await prisma.appSubscriptionPayment.findUniqueOrThrow({where:{id:payment.id}})).status).toBe('PENDING');
    injectedPayments.set(provider,fixture);
    expect(await handleYookassaAppSubscriptionWebhook(input)).toEqual({userId:user.id});
    expect(await handleYookassaAppSubscriptionWebhook(input)).toEqual({userId:user.id});
    expect(await prisma.appSubscription.count({where:{userId:user.id}})).toBe(1);
    expect(await prisma.appSubscriptionEvent.count({where:{providerEventKey:input.providerEventKey}})).toBe(1);
  });

  it("verified payment cancellation and repeated cancel webhook never create access or duplicate event",async()=>{
    const {user,payment,provider,fixture,input}=await pendingForCoverage();
    const canceled={...fixture,status:'canceled',paid:false};
    injectedPayments.set(provider,canceled);
    const event={...input,event:'payment.canceled',providerEventKey:`payment.canceled:${provider}`};
    expect(await handleYookassaAppSubscriptionWebhook(event)).toEqual({userId:user.id});
    expect(await handleYookassaAppSubscriptionWebhook(event)).toEqual({userId:user.id});
    expect((await prisma.appSubscriptionPayment.findUniqueOrThrow({where:{id:payment.id}})).status).toBe('CANCELED');
    expect(await prisma.appSubscription.count({where:{userId:user.id}})).toBe(0);
    expect(await prisma.appSubscriptionEvent.count({where:{providerEventKey:event.providerEventKey}})).toBe(1);
    expect(await prisma.appSubscriptionEvent.findUniqueOrThrow({where:{providerEventKey:event.providerEventKey}}))
      .toMatchObject({processingStatus:'PROCESSED'});
  });

  it("unknown local payment reference is ignored without granting or claiming an event processed",async()=>{
    const key=`payment.succeeded:qa-unknown-${randomUUID()}`;
    const countBefore=await prisma.appSubscription.count();
    const requestCount=remote.mock.calls.length;
    const result=await handleYookassaAppSubscriptionWebhook({
      event:'payment.succeeded',yookassaPaymentId:'qa-unknown-'+randomUUID(),
      providerEventKey:key,metadata:{kind:'app_subscription',localPaymentId:'qa-unowned-'+randomUUID()},
      shopId:'qa-fake-shop',secretKey:'qa-fake-secret',
    });
    expect(result).toEqual({userId:null});
    expect(remote.mock.calls.length).toBe(requestCount);
    expect(await prisma.appSubscription.count()).toBe(countBefore);
    expect(await prisma.appSubscriptionEvent.count({where:{providerEventKey:key}})).toBe(1);
    expect(await prisma.appSubscriptionEvent.findUniqueOrThrow({where:{providerEventKey:key}}))
      .toMatchObject({processingStatus:'RECEIVED'});
  });

  it("unverified cancel webhook fails closed until a provider-confirmed cancellation is replayed",async()=>{
    const {user,payment,provider,fixture,input}=await pendingForCoverage();
    const cancel={...input,event:'payment.canceled',providerEventKey:`payment.canceled:${provider}`};
    await expect(handleYookassaAppSubscriptionWebhook(cancel)).rejects.toThrow('YooKassa payment is not canceled');
    expect((await prisma.appSubscriptionPayment.findUniqueOrThrow({where:{id:payment.id}})).status).toBe('PENDING');
    expect(await prisma.appSubscriptionEvent.findUniqueOrThrow({where:{providerEventKey:cancel.providerEventKey}}))
      .toMatchObject({processingStatus:'FAILED'});
    expect(await prisma.appSubscription.count({where:{userId:user.id}})).toBe(0);
    injectedPayments.set(provider,{...fixture,status:'canceled',paid:false});
    expect(await handleYookassaAppSubscriptionWebhook(cancel)).toEqual({userId:user.id});
    expect(await handleYookassaAppSubscriptionWebhook(cancel)).toEqual({userId:user.id});
    expect((await prisma.appSubscriptionPayment.findUniqueOrThrow({where:{id:payment.id}})).status).toBe('CANCELED');
    expect(await prisma.appSubscriptionEvent.count({where:{providerEventKey:cancel.providerEventKey}})).toBe(1);
  });

  it("mismatched refund payment reference cannot reverse entitlement and corrected replay reverses once",async()=>{
    const {user,payment,provider,input}=await pendingForCoverage();
    await handleYookassaAppSubscriptionWebhook(input);
    const subscription=(await prisma.appSubscriptionPayment.findUniqueOrThrow({where:{id:payment.id}})).subscriptionId!;
    const refund=`qa-refund-reference-${randomUUID()}`;
    injectedRefunds.set(refund,{paymentId:`qa-wrong-payment-${randomUUID()}`});
    const evt={event:'refund.succeeded',yookassaPaymentId:provider,yookassaRefundId:refund,
      providerEventKey:`refund.succeeded:${refund}`,shopId:'qa-fake-shop',secretKey:'qa-fake-secret'};
    await expect(handleYookassaAppSubscriptionWebhook(evt)).rejects.toThrow('YooKassa refund payment id mismatch');
    expect((await prisma.appSubscriptionPayment.findUniqueOrThrow({where:{id:payment.id}})).status).toBe('SUCCEEDED');
    expect((await prisma.appSubscription.findUniqueOrThrow({where:{id:subscription}})).status).toBe('ACTIVE');
    expect(await prisma.appSubscriptionFinanceRefund.count({where:{paymentId:payment.id}})).toBe(0);
    expect(await prisma.appSubscriptionEvent.findUniqueOrThrow({where:{providerEventKey:evt.providerEventKey}}))
      .not.toMatchObject({processingStatus:'PROCESSED'});
    injectedRefunds.set(refund,{paymentId:provider});
    expect(await handleYookassaAppSubscriptionWebhook(evt)).toEqual({userId:user.id});
    expect(await handleYookassaAppSubscriptionWebhook(evt)).toEqual({userId:user.id});
    expect((await prisma.appSubscriptionPayment.findUniqueOrThrow({where:{id:payment.id}})).status).toBe('REFUNDED');
    expect(await prisma.appSubscriptionFinanceRefund.count({where:{paymentId:payment.id,providerRefundId:refund}})).toBe(1);
    expect(await prisma.appSubscriptionEvent.count({where:{providerEventKey:evt.providerEventKey}})).toBe(1);
  });

  it("partial verified refund records one finance reversal without canceling paid subscription",async()=>{
    const {user,payment,provider,input}=await pendingForCoverage();
    await handleYookassaAppSubscriptionWebhook(input);
    const subscription=(await prisma.appSubscriptionPayment.findUniqueOrThrow({where:{id:payment.id}})).subscriptionId!;
    const refund=`qa-partial-refund-${randomUUID()}`;
    injectedRefunds.set(refund,{paymentId:provider,amount:'50.00'});
    const evt={event:'refund.succeeded',yookassaPaymentId:provider,yookassaRefundId:refund,
      providerEventKey:`refund.succeeded:${refund}`,shopId:'qa-fake-shop',secretKey:'qa-fake-secret'};
    expect(await handleYookassaAppSubscriptionWebhook(evt)).toEqual({userId:user.id});
    expect(await handleYookassaAppSubscriptionWebhook(evt)).toEqual({userId:user.id});
    expect((await prisma.appSubscriptionPayment.findUniqueOrThrow({where:{id:payment.id}})).status).toBe('SUCCEEDED');
    expect((await prisma.appSubscription.findUniqueOrThrow({where:{id:subscription}})).status).toBe('ACTIVE');
    expect(await prisma.appSubscriptionFinanceRefund.count({where:{paymentId:payment.id,providerRefundId:refund}})).toBe(1);
    expect(await prisma.appSubscriptionEvent.findUniqueOrThrow({where:{providerEventKey:evt.providerEventKey}}))
      .toMatchObject({processingStatus:'PROCESSED',lastProcessingError:'PARTIAL_REFUND_NOT_FISCALIZED'});
  });

  it("late full refund of an older payment leaves a newer succeeded period active",async()=>{
    const {user,payment,provider,input}=await pendingForCoverage();
    await handleYookassaAppSubscriptionWebhook(input);
    const first=await prisma.appSubscriptionPayment.findUniqueOrThrow({where:{id:payment.id}});
    const laterEnd=new Date('2026-11-15T11:00:00Z');
    await prisma.appSubscriptionPayment.create({data:{
      userId:user.id,subscriptionId:first.subscriptionId!,provider:'YOOKASSA',kind:'RENEWAL',planCode:'WEEKLY',
      status:'SUCCEEDED',amount:'200.00',currency:'RUB',
      idempotenceKey:`qa:newer:${randomUUID()}`,yookassaPaymentId:`qa-newer-${randomUUID()}`,
      periodStart:first.periodEnd,periodEnd:laterEnd,
    }});
    await prisma.appSubscription.update({where:{id:first.subscriptionId!},
      data:{currentPeriodStart:first.periodEnd,currentPeriodEnd:laterEnd}});
    const refund=`qa-late-refund-${randomUUID()}`;
    injectedRefunds.set(refund,{paymentId:provider});
    const evt={event:'refund.succeeded',yookassaPaymentId:provider,yookassaRefundId:refund,
      providerEventKey:`refund.succeeded:${refund}`,shopId:'qa-fake-shop',secretKey:'qa-fake-secret'};
    expect(await handleYookassaAppSubscriptionWebhook(evt)).toEqual({userId:user.id});
    expect(await handleYookassaAppSubscriptionWebhook(evt)).toEqual({userId:user.id});
    expect((await prisma.appSubscriptionPayment.findUniqueOrThrow({where:{id:payment.id}})).status).toBe('REFUNDED');
    expect((await prisma.appSubscription.findUniqueOrThrow({where:{id:first.subscriptionId!}})))
      .toMatchObject({status:'ACTIVE',currentPeriodEnd:laterEnd});
    expect(await prisma.appSubscriptionPayment.count({where:{userId:user.id,status:'SUCCEEDED'}})).toBe(1);
    expect(await prisma.appSubscriptionFinanceRefund.count({where:{paymentId:payment.id,providerRefundId:refund}})).toBe(1);
    expect(await prisma.appSubscriptionEvent.count({where:{providerEventKey:evt.providerEventKey}})).toBe(1);
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
