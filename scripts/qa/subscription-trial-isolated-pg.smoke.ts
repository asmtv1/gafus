/** 2026-11 disposable PostgreSQL: same payment-card fingerprint race and rollback. */
import assert from "node:assert/strict";
import {setTimeout as sleep} from "node:timers/promises";
import {prisma} from "@gafus/prisma";
import {
 hasUsedAppSubscriptionTrial,getYookassaTrialAvailability,
 findYookassaTrialByPaymentMethodFingerprintHash,recordYookassaTrialStarted,
 recordYookassaTrialUnavailable,
} from "@gafus/subscription-trial-server/trial-usage";
const url=new URL(process.env.DATABASE_URL??"http://invalid");
if(process.env.GAFUS_LOCAL_ISOLATED_API!=="1" || process.env.GAFUS_SUBSCRIPTION_TRIAL_REAL_PG!=="1" ||
 url.protocol!=="postgresql:" || url.hostname!=="127.0.0.1" ||
 url.pathname!=="/gafus_refactor_subscription_trial")throw Error("REFUSING_NON_DISPOSABLE_TRIAL_DB");
async function main(){
 const [owner,other]=await Promise.all([
  prisma.user.create({data:{username:"trial-owner",password:"synthetic-disposable"}}),
  prisma.user.create({data:{username:"trial-other",password:"synthetic-disposable"}}),
 ]);
 const [subA,subB]=await Promise.all([
  prisma.appSubscription.create({data:{userId:owner.id,provider:"YOOKASSA"}}),
  prisma.appSubscription.create({data:{userId:other.id,provider:"YOOKASSA"}}),
 ]);
 const fingerprint="c".repeat(64);
 const startedAt=new Date("2026-11-07T12:00:00Z"),endedAt=new Date("2026-11-10T12:00:00Z");
 assert.equal((await getYookassaTrialAvailability(owner.id)).available,true);
 let firstLocked!:()=>void;
 const firstEntered=new Promise<void>(resolve=>{firstLocked=resolve;});
 let secondReadFinished=false;
 const first=prisma.$transaction(async tx=>{
  const otherTrial=await findYookassaTrialByPaymentMethodFingerprintHash({userId:owner.id,paymentMethodFingerprintHash:fingerprint,tx});
  assert.equal(otherTrial,null);
  firstLocked();
  await sleep(180);
  await recordYookassaTrialStarted({userId:owner.id,subscriptionId:subA.id,startedAt,endedAt,paymentMethodFingerprintHash:fingerprint,tx});
  return "started";
 });
 await firstEntered;
 const second=prisma.$transaction(async tx=>{
  const existing=await findYookassaTrialByPaymentMethodFingerprintHash({userId:other.id,paymentMethodFingerprintHash:fingerprint,tx});
  secondReadFinished=true;
  if(existing){
   await recordYookassaTrialUnavailable({userId:other.id,subscriptionId:subB.id,at:startedAt,paymentMethodFingerprintHash:fingerprint,reason:"CARD_FINGERPRINT_REUSED",tx});
   return "reused";
  }
  await recordYookassaTrialStarted({userId:other.id,subscriptionId:subB.id,startedAt,endedAt,paymentMethodFingerprintHash:fingerprint,tx});
  return "started";
 });
 await sleep(40);
 assert.equal(secondReadFinished,false,"second transaction must not read before the fingerprint lock releases");
 const [a,b]=await Promise.all([first,second]);
 assert.equal(a,"started");assert.equal(b,"reused");
 assert.equal(await hasUsedAppSubscriptionTrial({userId:owner.id,provider:"YOOKASSA"}),true);
 const own=await getYookassaTrialAvailability(owner.id);
 assert.deepEqual(own,{available:false,trialDays:3,unavailableReason:null});
 const denied=await getYookassaTrialAvailability(other.id);
 assert.deepEqual(denied,{available:false,trialDays:3,unavailableReason:"CARD_FINGERPRINT_REUSED"});
 const receipts=await prisma.appSubscriptionTrial.findMany({where:{paymentMethodFingerprintHash:fingerprint}});
 assert.equal(receipts.length,2);
 assert.equal(receipts.filter(x=>x.trialUnavailableReason===null).length,1,"fingerprint may grant a free trial only once");
 assert.equal(receipts.filter(x=>x.trialUnavailableReason==="CARD_FINGERPRINT_REUSED").length,1);
 assert.equal(receipts.find(x=>x.userId===owner.id)?.startedAt.getTime(),startedAt.getTime());
 const failedFingerprint="d".repeat(64);
 await assert.rejects(prisma.$transaction(async tx=>{
  const existing=await findYookassaTrialByPaymentMethodFingerprintHash({userId:owner.id,paymentMethodFingerprintHash:failedFingerprint,tx});
  assert.equal(existing,null);
  await recordYookassaTrialStarted({userId:owner.id,subscriptionId:subA.id,startedAt,endedAt,paymentMethodFingerprintHash:failedFingerprint,tx});
  throw Error("SYNTHETIC_FAILURE_AFTER_UPSERT");
 }),/SYNTHETIC_FAILURE_AFTER_UPSERT/);
 const after=await prisma.appSubscriptionTrial.findUniqueOrThrow({where:{userId_provider:{userId:owner.id,provider:"YOOKASSA"}}});
 assert.equal(after.paymentMethodFingerprintHash,fingerprint,"transaction rollback must retain earlier binding");
 assert.equal(await prisma.appSubscriptionTrial.count({where:{paymentMethodFingerprintHash:failedFingerprint}}),0);
 console.log("SUBSCRIPTION_TRIAL_REAL_PG_PASS: cross-owner fingerprint xact lock, exactly one entitled, rejected card recorded without trial, receipt idempotence, injected rollback");
}
main().then(async()=>prisma.$disconnect()).catch(async(e)=>{console.error(e);await prisma.$disconnect();process.exitCode=1;});
