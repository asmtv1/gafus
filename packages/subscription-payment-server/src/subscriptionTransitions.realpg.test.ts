/** Real isolated PG test for the shared YooKassa state transitions. */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID, randomBytes } from "node:crypto";
import { prisma } from "@gafus/prisma";
import { activateYookassaPaymentMethodSubscription,
  cancelYookassaAutorenewal, expireYookassaPendingSubscription } from "./subscriptionTransitions";
const allowed=(()=>{try{const u=new URL(process.env.DATABASE_URL??"");return (
  process.env.GAFUS_ARCHQA_REALPG==="1" && u.protocol==="postgresql:" &&
  u.hostname==="127.0.0.1" && u.username==="qapayment" && Number(u.port)>10000 &&
  /^archqa_schema_[a-f0-9]{12}$/.test(u.pathname.slice(1)) &&
  process.env.GAFUS_ARCHQA_DB_NAME===u.pathname.slice(1));}catch{return false;}})();
if(process.env.GAFUS_ARCHQA_REALPG==="1"&&!allowed)throw Error("PAYMENT_TRANSITIONS_TEST_DATABASE_INVALID");
const suite=allowed?describe:describe.skip;
let userId="",activeId="",pendingId="";
const periodStart=new Date("2026-11-01T00:00:00Z");
const periodEnd=new Date("2026-12-01T00:00:00Z");
const load=(id:string)=>prisma.appSubscription.findUniqueOrThrow({where:{id}});
const disposableOwners:string[]=[];
const scopedSubscription=async(status:"PENDING"|"ACTIVE"|"PAST_DUE"|"EXPIRED"|"CANCELED"="PENDING",provider:"YOOKASSA"|"APPLE"="YOOKASSA")=>{
  const owner=await prisma.user.create({data:{username:"qa_transition_risk_"+randomUUID(),password:"disposable"}});
  disposableOwners.push(owner.id);
  const subscription=await prisma.appSubscription.create({data:{userId:owner.id,provider,planCode:"WEEKLY",status,
    pendingExpiresAt:new Date("2026-11-01T01:00:00Z")}});
  return {owner,subscription};
};
const fingerprint=()=>randomBytes(32).toString("hex");

suite("YooKassa cancellation and stale pending expiry on disposable PostgreSQL",()=>{
  beforeAll(async()=>{
    const [db]=await prisma.$queryRaw<{db:string}[]>`SELECT current_database() AS db`;
    expect(db.db).toBe(process.env.GAFUS_ARCHQA_DB_NAME);
    userId=(await prisma.user.create({data:{username:"qa-transition-"+randomUUID(),password:"no-login"}})).id;
    activeId=(await prisma.appSubscription.create({data:{userId,provider:"YOOKASSA",planCode:"MONTHLY",status:"ACTIVE",
      currentPeriodStart:periodStart,currentPeriodEnd:periodEnd,
      yookassaPaymentMethodId:"qa-card",yookassaPaymentMethodLast4:"1234",
      yookassaPaymentMethodTitle:"qa-card-title"}})).id;
    pendingId=(await prisma.appSubscription.create({data:{userId,provider:"YOOKASSA",planCode:"MONTHLY",status:"PENDING",
      pendingExpiresAt:new Date("2026-11-01T01:00:00Z"),yookassaPaymentMethodId:"qa-pending-card"}})).id;
  });
  afterAll(async()=>{
    if(disposableOwners.length)await prisma.user.deleteMany({where:{id:{in:disposableOwners}}});
    if(userId)await prisma.user.delete({where:{id:userId}});
    await prisma.$disconnect();
  });
  it("cancels autorenewal but retains the paid period and entitlement status",async()=>{
    await cancelYookassaAutorenewal(userId);
    const active=await load(activeId);
    expect(active).toMatchObject({status:"ACTIVE",cancelAtPeriodEnd:true,
      currentPeriodStart:periodStart,currentPeriodEnd:periodEnd,
      yookassaPaymentMethodId:null,yookassaPaymentMethodLast4:null,yookassaPaymentMethodTitle:null});
    expect(active.canceledAt).toBeInstanceOf(Date);
  });
  it("a stale worker cannot expire a subscription that was already activated",async()=>{
    await expireYookassaPendingSubscription(activeId);
    expect(await load(activeId)).toMatchObject({status:"ACTIVE",currentPeriodEnd:periodEnd});
  });
  it("expires only a genuinely pending binding and clears the provider method",async()=>{
    await expireYookassaPendingSubscription(pendingId);
    expect(await load(pendingId)).toMatchObject({status:"EXPIRED",pendingExpiresAt:null,
      yookassaPaymentMethodId:null});
    await expireYookassaPendingSubscription(pendingId);
    expect((await load(pendingId)).status).toBe("EXPIRED");
  });
  it("trial activation on pending subscription grants a bounded period and one durable receipt",async()=>{
    const {owner,subscription}=await scopedSubscription();
    const before=new Date();
    const result=await activateYookassaPaymentMethodSubscription({
      subscription,paymentMethodId:"qa-trial-"+randomUUID(),paymentMethodLast4:"4242",
      paymentMethodFingerprintHash:null,paymentMethodDisplayTitle:"QA card",
    });
    expect(result).toEqual({activated:true});
    const after=new Date();
    const active=await load(subscription.id);
    expect(active).toMatchObject({status:"ACTIVE",cancelAtPeriodEnd:false,pendingExpiresAt:null,
      yookassaPaymentMethodLast4:"4242",yookassaPaymentMethodTitle:"QA card"});
    expect(active.currentPeriodStart!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(active.currentPeriodStart!.getTime()).toBeLessThanOrEqual(after.getTime());
    expect(active.currentPeriodEnd!.getTime()-active.currentPeriodStart!.getTime()).toBe(3*86400000);
    const trials=await prisma.appSubscriptionTrial.findMany({where:{userId:owner.id}});
    expect(trials).toHaveLength(1);
    expect(trials[0]).toMatchObject({provider:"YOOKASSA",subscriptionId:subscription.id,
      trialUnavailableReason:null,paymentMethodFingerprintHash:null});
  });

  it("late binding after cancellation preserves paid entitlement and never reenables renewal",async()=>{
    const {owner,subscription}=await scopedSubscription("ACTIVE");
    const from=new Date(Date.now()-2*86400000),until=new Date(Date.now()+12*86400000);
    await prisma.appSubscription.update({where:{id:subscription.id},data:{currentPeriodStart:from,
      currentPeriodEnd:until,cancelAtPeriodEnd:true}});
    const current=await load(subscription.id);
    expect(await activateYookassaPaymentMethodSubscription({
      subscription:current,paymentMethodId:"qa-active-"+randomUUID(),
      paymentMethodFingerprintHash:fingerprint(),paymentMethodDisplayTitle:null,
    })).toEqual({activated:false,reason:"STALE_PAYMENT_METHOD"});
    const after=await load(subscription.id);
    expect(after).toMatchObject({status:"ACTIVE",cancelAtPeriodEnd:true,
      currentPeriodStart:from,currentPeriodEnd:until});
    expect(await prisma.appSubscriptionTrial.count({where:{userId:owner.id}})).toBe(0);
  });

  it("a card fingerprint previously used by another owner denies trial without granting access",async()=>{
    const first=await scopedSubscription("ACTIVE");
    const second=await scopedSubscription();
    const hash=fingerprint();
    const since=new Date("2026-11-01T00:00:00Z");
    await prisma.appSubscriptionTrial.create({data:{userId:first.owner.id,provider:"YOOKASSA",
      subscriptionId:first.subscription.id,startedAt:since,endedAt:new Date("2026-11-04T00:00:00Z"),
      paymentMethodFingerprintHash:hash}});
    expect(await activateYookassaPaymentMethodSubscription({
      subscription:second.subscription,paymentMethodId:"qa-duplicate-"+randomUUID(),
      paymentMethodFingerprintHash:hash,paymentMethodLast4:"9999",paymentMethodDisplayTitle:"Reused QA card",
    })).toEqual({activated:false,reason:"CARD_FINGERPRINT_REUSED"});
    const denied=await load(second.subscription.id);
    expect(denied).toMatchObject({status:"CANCELED",currentPeriodStart:null,currentPeriodEnd:null,
      yookassaPaymentMethodId:null,pendingExpiresAt:null});
    const trials=await prisma.appSubscriptionTrial.findMany({where:{userId:second.owner.id}});
    expect(trials).toHaveLength(1);
    expect(trials[0]).toMatchObject({subscriptionId:second.subscription.id,
      trialUnavailableReason:"CARD_FINGERPRINT_REUSED",paymentMethodFingerprintHash:hash});
    expect(await prisma.appSubscriptionTrial.count({where:{userId:first.owner.id}})).toBe(1);
  });

  it("two simultaneous card bindings yield one trial grant and one denied trial",async()=>{
    const first=await scopedSubscription(),second=await scopedSubscription();
    const hash=fingerprint();
    const bind=(subscription:typeof first.subscription)=>activateYookassaPaymentMethodSubscription({
      subscription,paymentMethodId:"qa-race-"+randomUUID(),
      paymentMethodFingerprintHash:hash,paymentMethodDisplayTitle:null,
    });
    const results=await Promise.all([bind(first.subscription),bind(second.subscription)]);
    expect(results.filter(r=>r.activated)).toHaveLength(1);
    expect(results.filter(r=>!r.activated)).toHaveLength(1);
    const states=await prisma.appSubscription.findMany({where:{id:{in:[first.subscription.id,second.subscription.id]}}});
    expect(states.map(x=>x.status).sort()).toEqual(["ACTIVE","CANCELED"]);
    expect(states.filter(x=>x.status==="ACTIVE"&&x.currentPeriodEnd)).toHaveLength(1);
    const trialRows=await prisma.appSubscriptionTrial.findMany({where:{userId:{in:[first.owner.id,second.owner.id]}}});
    expect(trialRows).toHaveLength(2);
    expect(trialRows.filter(x=>x.trialUnavailableReason===null)).toHaveLength(1);
    expect(trialRows.filter(x=>x.trialUnavailableReason==="CARD_FINGERPRINT_REUSED")).toHaveLength(1);
  });

  it("failed activation of unknown subscription rolls back a trial receipt",async()=>{
    const {owner}=await scopedSubscription();
    await expect(activateYookassaPaymentMethodSubscription({
      subscription:{id:"qa-missing-"+randomUUID(),userId:owner.id,status:"PENDING"},
      paymentMethodId:"qa-missing-method-"+randomUUID(),paymentMethodFingerprintHash:null,
      paymentMethodDisplayTitle:null,
    })).rejects.toThrow();
    expect(await prisma.appSubscriptionTrial.count({where:{userId:owner.id}})).toBe(0);
  });

  it("cancellation and stale expiry never alter Apple, already expired or canceled entitlements",async()=>{
    const {owner,subscription:pastDue}=await scopedSubscription("PAST_DUE");
    const expired=await prisma.appSubscription.create({data:{userId:owner.id,provider:"YOOKASSA",
      planCode:"WEEKLY",status:"EXPIRED",currentPeriodEnd:periodEnd}});
    const canceled=await prisma.appSubscription.create({data:{userId:owner.id,provider:"YOOKASSA",
      planCode:"WEEKLY",status:"CANCELED",currentPeriodEnd:periodEnd}});
    const apple=await prisma.appSubscription.create({data:{userId:owner.id,provider:"APPLE",
      planCode:"MONTHLY",status:"PENDING",currentPeriodEnd:periodEnd}});
    await Promise.all([cancelYookassaAutorenewal(owner.id),expireYookassaPendingSubscription(apple.id)]);
    await Promise.all([expireYookassaPendingSubscription(pastDue.id),
      expireYookassaPendingSubscription(expired.id),expireYookassaPendingSubscription(canceled.id)]);
    expect(await load(pastDue.id)).toMatchObject({status:"PAST_DUE",cancelAtPeriodEnd:true});
    for(const [item,status] of [[expired,"EXPIRED"],[canceled,"CANCELED"],[apple,"PENDING"]] as const){
      expect(await load(item.id)).toMatchObject({status,cancelAtPeriodEnd:false,currentPeriodEnd:periodEnd});
    }
    expect(await prisma.appSubscriptionTrial.count({where:{userId:owner.id}})).toBe(0);
  });
});
