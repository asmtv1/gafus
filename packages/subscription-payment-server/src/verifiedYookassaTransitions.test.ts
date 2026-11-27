import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@gafus/prisma";

const mocks = vi.hoisted(() => {
  const payment = { updateMany: vi.fn(), findUniqueOrThrow: vi.fn(), findFirst: vi.fn(), update: vi.fn() };
  const subscription = { updateMany: vi.fn(), create: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() };
  const tx = { $queryRaw: vi.fn(), appSubscriptionPayment: payment, appSubscription: subscription, appSubscriptionTrial:{findUnique:vi.fn()}, npdReceipt: { updateMany: vi.fn() } };
  return { payment, subscription, tx, partner: vi.fn(), reverse: vi.fn(), receipt: vi.fn(), cancelReceipt: vi.fn(), financeRefund: vi.fn() };
});
vi.mock("@gafus/prisma", () => ({
  prisma: { $transaction: async (fn: (tx: typeof mocks.tx) => unknown) => fn(mocks.tx),
    appSubscriptionPayment: mocks.payment },
}));
vi.mock("@gafus/subscription-finance-server/npd-receipts", () => ({
  ensureNpdReceiptForSucceededPayment: mocks.receipt,
  queueNpdReceiptCancellation: mocks.cancelReceipt,
}));
vi.mock("@gafus/subscription-trial-server/trial-usage", () => ({
  findYookassaTrialByPaymentMethodFingerprintHash: vi.fn(),
  recordYookassaTrialUnavailable: vi.fn(),
  recordYookassaTrialStarted: vi.fn(),
  YOOKASSA_TRIAL_UNAVAILABLE_CARD_FINGERPRINT_REUSED: "duplicate",
  YOOKASSA_TRIAL_DAYS: 7,
}));
vi.mock("./partnerService", () => ({
  recordPartnerCommissionForPayment: mocks.partner,
  reversePartnerCommissionForRefund: mocks.reverse,
}));
vi.mock("./paymentFinanceService", () => ({ recordFinanceRefund: mocks.financeRefund }));
import { applyVerifiedYookassaPayment, applyVerifiedYookassaCancellation, applyVerifiedYookassaRefund, finalizeVerifiedSubscriptionRenewal, recordInitialYookassaCheckoutFailure, attachInitialYookassaCheckoutResponse, activateYookassaPaymentMethodSubscription } from "./subscriptionTransitions";

const periodStart = new Date("2026-11-01T00:00:00Z");
const periodEnd = new Date("2026-12-01T00:00:00Z");
const payment = {
  id: "payment", userId: "owner", subscriptionId: "subscription", kind: "INITIAL",
  planCode: "MONTHLY", promoCodeId: null, planTitle: "Historical title",
  originalAmount: null, amount: null, currency: "RUB",
} satisfies Pick<Prisma.AppSubscriptionPaymentGetPayload<{}>,
  "id" | "userId" | "subscriptionId" | "kind" | "planCode" | "promoCodeId" |
  "planTitle" | "originalAmount" | "amount" | "currency">;
const input = { payment, yookassaPaymentId: "provider", periodStart, periodEnd, now: periodStart };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.payment.updateMany.mockResolvedValue({ count: 1 });
  mocks.subscription.updateMany.mockResolvedValue({ count: 1 });
});

describe("verified YooKassa transaction ownership", () => {
  it("claims once and sends entitlement, commission and receipt through the same transaction", async () => {
    mocks.payment.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await applyVerifiedYookassaPayment(input);
    await applyVerifiedYookassaPayment(input);
    expect(mocks.partner).toHaveBeenCalledExactlyOnceWith(mocks.tx, payment);
    expect(mocks.receipt).toHaveBeenCalledExactlyOnceWith(mocks.tx, payment.id);
    expect(mocks.subscription.updateMany).toHaveBeenCalledTimes(2);
    expect(mocks.subscription.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: payment.subscriptionId, OR: [
        { currentPeriodEnd: null }, { currentPeriodEnd: { lte: periodEnd } },
      ] },
      data: { currentPeriodStart: periodStart, currentPeriodEnd: periodEnd,
        renewalIntervalDays: 30, planTitle: "Historical title" },
    });
  });

  it("cannot overwrite a newer success or refund with a late cancellation", async () => {
    await applyVerifiedYookassaCancellation(payment.id, "provider");
    expect(mocks.payment.updateMany).toHaveBeenCalledWith({
      where: { id: payment.id, provider: "YOOKASSA", status: { notIn: ["SUCCEEDED", "REFUNDED"] }, OR: [{yookassaPaymentId:null},{yookassaPaymentId:"provider"}] },
      data: { status: "CANCELED", yookassaPaymentId: "provider" },
    });
  });

  const refundable = { id: payment.id, provider: "YOOKASSA", status: "SUCCEEDED",
    subscriptionId: "new-link", periodEnd, amount: "100.00", currency: "RUB", yookassaPaymentId: "provider" };
  const refund = { id: "refund-1", payment_id: "provider", status: "succeeded",
    amount: { value: "100.00", currency: "RUB" }, created_at: "2026-11-02T00:00:00Z" };

  it("refund locks payment, stores finance and revokes only its own period; replay only repairs finance", async () => {
    mocks.payment.findUniqueOrThrow.mockResolvedValueOnce(refundable).mockResolvedValueOnce({ ...refundable, status: "REFUNDED" });
    mocks.payment.findFirst.mockResolvedValue({ id: "newer-payment" });
    await expect(applyVerifiedYookassaRefund(payment.id, refund)).resolves.toEqual({fullRefund:true,financeIncomplete:false});
    await applyVerifiedYookassaRefund(payment.id, refund);
    expect(mocks.tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(mocks.financeRefund).toHaveBeenCalledTimes(2);
    expect(mocks.financeRefund).toHaveBeenNthCalledWith(1,mocks.tx,refundable,refund);
    expect(mocks.tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(mocks.financeRefund.mock.invocationCallOrder[0]);
    expect(mocks.financeRefund.mock.invocationCallOrder[0]).toBeLessThan(mocks.payment.updateMany.mock.invocationCallOrder[0]);
    expect(mocks.reverse).toHaveBeenCalledTimes(1);
    expect(mocks.cancelReceipt).toHaveBeenCalledExactlyOnceWith(mocks.tx, payment.id);
    expect(mocks.payment.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { subscriptionId: "new-link", status: "SUCCEEDED", periodEnd: { gt: periodEnd } },
    }));
    expect(mocks.subscription.updateMany).not.toHaveBeenCalled();
  });
  it("leaves a durable finance reconciliation marker when verified full refund has no timestamp",async()=>{
    mocks.payment.findUniqueOrThrow.mockResolvedValue(refundable);
    mocks.payment.findFirst.mockResolvedValue(null);
    await expect(applyVerifiedYookassaRefund(payment.id,{...refund,created_at:undefined}))
      .resolves.toEqual({fullRefund:true,financeIncomplete:true});
    expect(mocks.payment.update).toHaveBeenCalledWith({where:{id:payment.id},data:{financeRefundsIncomplete:true}});
    expect(mocks.financeRefund).not.toHaveBeenCalled();
    expect(mocks.subscription.updateMany).toHaveBeenCalledOnce();
    expect(mocks.reverse).toHaveBeenCalledOnce();
  });
  it("partial refund never revokes entitlement, and a late partial cannot replace a full refund's cancellation",async()=>{
    mocks.payment.findUniqueOrThrow.mockResolvedValueOnce(refundable).mockResolvedValueOnce({...refundable,status:"REFUNDED"});
    const partial={...refund,amount:{value:"25.00",currency:"RUB"}};
    await expect(applyVerifiedYookassaRefund(payment.id,partial)).resolves.toEqual({fullRefund:false,financeIncomplete:false});
    await applyVerifiedYookassaRefund(payment.id,partial);
    expect(mocks.financeRefund).toHaveBeenCalledTimes(2);
    expect(mocks.tx.npdReceipt.updateMany).toHaveBeenCalledOnce();
    expect(mocks.payment.updateMany).not.toHaveBeenCalled();
    expect(mocks.reverse).not.toHaveBeenCalled();
    expect(mocks.subscription.updateMany).not.toHaveBeenCalled();
  });
  it("does not apply an unverified amount or continue after a finance SQL failure",async()=>{
    mocks.payment.findUniqueOrThrow.mockResolvedValue(refundable);
    await expect(applyVerifiedYookassaRefund(payment.id,{...refund,amount:{value:"101.00",currency:"RUB"}}))
      .rejects.toThrow("Invalid refund amount");
    mocks.financeRefund.mockRejectedValueOnce(new Error("finance transaction failed"));
    await expect(applyVerifiedYookassaRefund(payment.id,refund)).rejects.toThrow("finance transaction failed");
    expect(mocks.payment.updateMany).not.toHaveBeenCalled();
    expect(mocks.reverse).not.toHaveBeenCalled();
  });
});

describe("shared renewal and initial transport transitions", () => {
  const snapshot = {...payment, kind:"RENEWAL", provider:"YOOKASSA",
    amount:"100.00", originalAmount:"100.00", periodStart, periodEnd, yookassaPaymentId:"provider"};
  const renewal = {paymentId:payment.id,subscriptionId:payment.subscriptionId,
    userId:payment.userId,providerPaymentId:"provider",amountRub:100,currency:"RUB",periodStart,periodEnd};
  it("worker and webhook use the same single claim and finance commit", async () => {
    mocks.payment.findUniqueOrThrow.mockResolvedValue(snapshot);
    mocks.payment.updateMany.mockResolvedValueOnce({count:1}).mockResolvedValueOnce({count:0});
    await expect(finalizeVerifiedSubscriptionRenewal(renewal)).resolves.toBe(true);
    await expect(applyVerifiedYookassaPayment({...input,payment:{...payment,kind:"RENEWAL"}})).resolves.toBe(false);
    expect(mocks.partner).toHaveBeenCalledOnce();
    expect(mocks.receipt).toHaveBeenCalledOnce();
  });
  it("rejects worker provider amount, period or ownership mismatch before claiming", async () => {
    mocks.payment.findUniqueOrThrow.mockResolvedValue(snapshot);
    for(const changed of [{amountRub:99},{userId:"other"},{periodEnd:new Date(0)},{providerPaymentId:"other"}]){
      await expect(finalizeVerifiedSubscriptionRenewal({...renewal,...changed})).rejects.toThrow("RENEWAL_PAYMENT_SNAPSHOT_MISMATCH");
    }
    expect(mocks.payment.updateMany).not.toHaveBeenCalled();
  });
  it("propagates fiscal receipt failure to the shared transaction rollback", async () => {
    mocks.payment.findUniqueOrThrow.mockResolvedValue(snapshot);
    mocks.receipt.mockRejectedValueOnce(new Error("receipt failure"));
    await expect(finalizeVerifiedSubscriptionRenewal(renewal)).rejects.toThrow("receipt failure");
    expect(mocks.partner).toHaveBeenCalledOnce();
  });
  const failure = {paymentId:payment.id,subscriptionId:payment.subscriptionId,attemptCount:1,
    code:"NETWORK" as const,reason:"network",definitive:false};
  it("keeps uncertain POST pending; no entitlement mutation", async () => {
    await recordInitialYookassaCheckoutFailure(failure);
    expect(mocks.payment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where:expect.objectContaining({status:"PENDING",attemptCount:1,yookassaPaymentId:null}),
      data:{failureCode:"NETWORK",failureReason:"network"},
    }));
    expect(mocks.subscription.updateMany).not.toHaveBeenCalled();
  });
  it("a stale definitive rejection cannot overwrite a confirmed payment", async () => {
    mocks.payment.updateMany.mockResolvedValueOnce({count:0});
    await recordInitialYookassaCheckoutFailure({...failure,definitive:true});
    expect(mocks.subscription.updateMany).not.toHaveBeenCalled();
  });
  it("retires only the rejected pending checkout with no other live payment",async()=>{
    await recordInitialYookassaCheckoutFailure({...failure,definitive:true});
    expect(mocks.subscription.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where:expect.objectContaining({status:"PENDING",payments:{none:{status:{in:["PENDING","SUCCEEDED"]}}}}),
    }));
  });
  it("POST result must not replace another provider identity or terminal state",async()=>{
    mocks.payment.updateMany.mockResolvedValueOnce({count:0});
    expect(await attachInitialYookassaCheckoutResponse({paymentId:"payment",subscriptionId:"subscription",providerId:"provider",confirmationUrl:"https://example.test"})).toBe(false);
    expect(mocks.payment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where:expect.objectContaining({status:"PENDING",OR:[{yookassaPaymentId:null},{yookassaPaymentId:"provider"}]}),
    }));
  });
});

describe("stale trial callback",()=>{
  const trialInput={subscription:{id:"subscription",userId:"owner",status:"PENDING"},
    paymentMethodId:"method",paymentMethodFingerprintHash:null,paymentMethodDisplayTitle:null};
  const row={id:"subscription",userId:"owner",provider:"YOOKASSA",status:"PENDING",
    cancelAtPeriodEnd:false,isLifetime:false,currentPeriodStart:null,currentPeriodEnd:null,yookassaPaymentMethodId:"method"};
  it("cannot grant the same owner another trial on another setup",async()=>{
    mocks.subscription.findUniqueOrThrow.mockResolvedValue(row);
    mocks.tx.appSubscriptionTrial.findUnique.mockResolvedValue({id:"old-trial"});
    expect(await activateYookassaPaymentMethodSubscription(trialInput)).toEqual({activated:false,reason:"TRIAL_ALREADY_USED"});
    expect(mocks.tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(mocks.subscription.update).not.toHaveBeenCalled();
  });
  it("preserves a newly active period after replay; never extends it",async()=>{
    mocks.subscription.findUniqueOrThrow.mockResolvedValue({...row,status:"ACTIVE",currentPeriodEnd:new Date(Date.now()+86_400_000)});
    expect(await activateYookassaPaymentMethodSubscription(trialInput)).toEqual({activated:true});
    expect(mocks.subscription.update).not.toHaveBeenCalled();
  });
  it("does not re-enable a canceled or replaced method",async()=>{
    for(const change of [{cancelAtPeriodEnd:true},{yookassaPaymentMethodId:"other"},{status:"EXPIRED"}]){
      mocks.subscription.findUniqueOrThrow.mockResolvedValue({...row,...change});
      expect(await activateYookassaPaymentMethodSubscription(trialInput)).toEqual({activated:false,reason:"STALE_PAYMENT_METHOD"});
    }
    expect(mocks.subscription.update).not.toHaveBeenCalled();
  });
});
