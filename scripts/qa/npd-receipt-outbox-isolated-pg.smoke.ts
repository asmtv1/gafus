/** Disposable PostgreSQL acceptance: NPD receipt outbox shares its caller's
 * payment transaction, races are idempotent and cancellation is fail-closed.
 * No tax-provider, email, Redis or production access.
 */
import assert from 'node:assert/strict';
import {prisma} from '@gafus/prisma';
import {
 ensureNpdReceiptForSucceededPayment,
 queueNpdReceiptCancellation,
} from '@gafus/subscription-finance-server/npd-receipts';
import {
 readProfitReconciliationBatch,persistProfitReconciliationSnapshot,
 readProfitReconciliationRevision,withProfitFinanceRefundTransaction,
 completeProfitReconciliationIfUnchanged,
} from '@gafus/subscription-finance-server/profit-reconciliation-rows';
import {persistRefundFinanceReceipt} from '@gafus/subscription-finance-server/payment-finance';

const url=new URL(process.env.DATABASE_URL??'http://invalid');
if(process.env.GAFUS_LOCAL_ISOLATED_API!=='1'||process.env.GAFUS_NPD_RECEIPT_REAL_PG!=='1'||
 url.protocol!=='postgresql:'||url.hostname!=='127.0.0.1'||
 url.pathname!=='/gafus_refactor_npd_receipts_i') {
 throw Error('REFUSING_NON_DISPOSABLE_NPD_RECEIPT_DB');
}
const now=new Date('2026-11-09T10:00:00.000Z');
const day=86_400_000;
async function main(){
 const zone=await prisma.$queryRaw<{zone:string}[]>`SELECT current_setting('TimeZone') AS zone`;
 assert.equal(zone[0]?.zone,'Pacific/Auckland');
 const user=await prisma.user.create({data:{username:'npd_receipts_i_owner',password:'fictional'}});
 await prisma.npdConnection.create({data:{id:'default',inn:'123456789012',deviceId:'synthetic-device',
  refreshTokenCipher:Uint8Array.from([1]),refreshTokenIv:Uint8Array.from([2]),
  refreshTokenTag:Uint8Array.from([3]),refreshTokenKeyVersion:1,status:'ACTIVE',
  fiscalizationStartedAt:new Date('2026-01-01T00:00:00Z')}});
 let serial=0;
 const payment=async(input?:{status?:'SUCCEEDED'|'PENDING';buyerEmail?:string|null;periodDays?:number;currency?:string;succeededAt?:Date})=>{
  const n=++serial;
  const periodDays=input?.periodDays??30;
  return prisma.appSubscriptionPayment.create({data:{
   userId:user.id,provider:'YOOKASSA',kind:'RENEWAL',status:input?.status??'SUCCEEDED',
   planCode:'MONTHLY',idempotenceKey:`npd-receipts-i-payment-${n}`,amount:2490,
   currency:input?.currency??'RUB',buyerEmail:input?.buyerEmail===undefined?'synthetic@example.invalid':input.buyerEmail,
   periodStart:now,periodEnd:new Date(now.getTime()+periodDays*day),
   succeededAt:input?.succeededAt===undefined?now:input.succeededAt,
  }});
 };
 const first=await payment();
 // Multiple deliveries of the same payment callback must produce one unique
 // receipt and only one immutable CREATE journal entry.
 const results=await Promise.all(Array.from({length:6},()=>
  prisma.$transaction(tx=>ensureNpdReceiptForSucceededPayment(tx,first.id))));
 assert.equal(new Set(results.map(r=>r?.id)).size,1);
 assert.equal(results.every(r=>r?.status==='PENDING'),true);
 const firstReceipt=await prisma.npdReceipt.findUniqueOrThrow({where:{paymentId:first.id}});
 assert.equal(firstReceipt.amountKopecks,249000);
 assert.equal(firstReceipt.serviceName,'Подписка Gafus Premium на 30 дней');
 assert.equal(await prisma.npdReceiptOperation.count({where:{receiptId:firstReceipt.id,type:'CREATE'}}),1);
 assert.equal(await prisma.npdReceiptOperation.count({where:{receiptId:firstReceipt.id,type:'CANCEL'}}),0);
 // Pending CREATE can be atomically suppressed before the provider receives it.
 assert.equal(await prisma.$transaction(tx=>queueNpdReceiptCancellation(tx,first.id)),'not_required');
 const firstOp=await prisma.npdReceiptOperation.findUniqueOrThrow({where:{receiptId_type:{receiptId:firstReceipt.id,type:'CREATE'}}});
 assert.equal(firstOp.status,'NOT_REQUIRED');
 assert.equal(firstOp.nextAttemptAt,null);
 assert.equal(await prisma.npdReceiptOperation.count({where:{receiptId:firstReceipt.id,type:'CANCEL'}}),0);

 // Processing CREATE is ambiguous: cancellation MUST NOT pretend an invoice
 // was canceled while the in-flight provider operation may succeed.
 const second=await payment();
 const created=await prisma.$transaction(tx=>ensureNpdReceiptForSucceededPayment(tx,second.id));
 assert.ok(created);
 await prisma.npdReceiptOperation.update({where:{receiptId_type:{receiptId:created.id,type:'CREATE'}},
  data:{status:'PROCESSING',leaseOwner:'synthetic-worker',leaseExpiresAt:new Date(Date.now()+60_000)}});
 assert.equal(await prisma.$transaction(tx=>queueNpdReceiptCancellation(tx,second.id)),'cancel_pending');
 assert.equal((await prisma.npdReceipt.findUniqueOrThrow({where:{id:created.id}})).status,'CANCEL_PENDING');
 assert.equal(await prisma.npdReceiptOperation.count({where:{receiptId:created.id,type:'CANCEL'}}),0);
 // After a settled CREATE, request a real CANCEL exactly once.
 await prisma.npdReceiptOperation.update({where:{receiptId_type:{receiptId:created.id,type:'CREATE'}},
  data:{status:'SUCCEEDED',completedAt:now}});
 await prisma.npdReceipt.update({where:{id:created.id},data:{status:'ISSUED',providerReceiptId:'synthetic-issued-id'}});
 assert.equal(await prisma.$transaction(tx=>queueNpdReceiptCancellation(tx,second.id)),'queued');
 assert.equal(await prisma.$transaction(tx=>queueNpdReceiptCancellation(tx,second.id)),'queued');
 assert.equal(await prisma.npdReceiptOperation.count({where:{receiptId:created.id,type:'CANCEL'}}),1);
 assert.equal((await prisma.npdReceipt.findUniqueOrThrow({where:{id:created.id}})).status,'CANCEL_PENDING');

 // Payment webhook and refund webhook can race for the same payment.
 // Whichever takes the payment row lock first, after REFUNDED is committed
 // no executable fiscalization CREATE may remain.
 for(let i=0;i<12;i++){
  const race=await payment();
  const concurrent=await Promise.allSettled([
   prisma.$transaction(tx=>ensureNpdReceiptForSucceededPayment(tx,race.id)),
   prisma.$transaction(async tx=>{
    await tx.appSubscriptionPayment.update({where:{id:race.id},data:{status:'REFUNDED'}});
    return queueNpdReceiptCancellation(tx,race.id);
   }),
  ]);
  assert.deepEqual(concurrent.map(result=>result.status),['fulfilled','fulfilled'],
   'race should serialize without unique conflicts or deadlocks');
  assert.equal((await prisma.appSubscriptionPayment.findUniqueOrThrow({where:{id:race.id}})).status,'REFUNDED');
  const raceReceipt=await prisma.npdReceipt.findUnique({where:{paymentId:race.id}});
  if(raceReceipt){
   const queued=await prisma.npdReceiptOperation.findUniqueOrThrow({
    where:{receiptId_type:{receiptId:raceReceipt.id,type:'CREATE'}},
   });
   assert.equal(queued.status,'NOT_REQUIRED','refunded payment cannot leave executable CREATE');
  }
 }

 // Missing email, non-RUB, failed payment or pre-cutover operation never enter
 // fiscalization queue. No partially-created outbox rows are allowed.
 for(const input of [{buyerEmail:null},{currency:'USD'},{status:'PENDING' as const},
  {succeededAt:new Date('2025-12-01T00:00:00Z')},{periodDays:42}]){
  const bad=await payment(input);
  assert.equal(await prisma.$transaction(tx=>ensureNpdReceiptForSucceededPayment(tx,bad.id)),null);
  assert.equal(await prisma.npdReceipt.count({where:{paymentId:bad.id}}),0);
 }
 const last=await payment();
 await assert.rejects(prisma.$transaction(async tx=>{
  await ensureNpdReceiptForSucceededPayment(tx,last.id);
  throw Error('SYNTHETIC_PAYMENT_ROLLBACK');
 }),/SYNTHETIC_PAYMENT_ROLLBACK/);
 assert.equal(await prisma.npdReceipt.count({where:{paymentId:last.id}}),0);
 assert.equal(await prisma.npdReceiptOperation.count({where:{receipt:{paymentId:last.id}}}),0);
 // Finance reconciliation may write only after provider-validated data was
 // passed from Core; this test validates the SQL contract without network.
 const profit=await prisma.appSubscriptionPayment.create({data:{
  userId:user.id,provider:'YOOKASSA',kind:'RENEWAL',status:'SUCCEEDED',
  planCode:'MONTHLY',idempotenceKey:'profit-i-synthetic-payment',
  yookassaPaymentId:'yk-profit-i-synthetic',amount:2490,currency:'RUB',
  periodStart:now,periodEnd:new Date(now.getTime()+30*day),
  succeededAt:now,providerCapturedAt:now,
 }});
 const batch=await readProfitReconciliationBatch(undefined,new Date('2026-09-01'),new Date('2026-11-10'));
 assert.ok(batch.some(r=>r.id===profit.id));
 assert.equal(batch.find(r=>r.id===profit.id)?.yookassaPaymentId,'yk-profit-i-synthetic');
 await persistProfitReconciliationSnapshot(profit.id,{
  providerPaymentMethodType:'sbp',providerCapturedAt:now,
  providerIncomeAmount:'2400',financeSyncedAt:now,
 });
 const persisted=await prisma.appSubscriptionPayment.findUniqueOrThrow({where:{id:profit.id}});
 assert.equal(persisted.financeRefundsIncomplete,true);
 assert.equal(persisted.providerIncomeAmount?.toString(),'2400');
 const rev=await readProfitReconciliationRevision(profit.id);
 await assert.rejects(completeProfitReconciliationIfUnchanged(profit.id,undefined as never),/FINANCE_REVISION_REQUIRED/);
 await prisma.appSubscriptionPayment.update({where:{id:profit.id},
  data:{providerPaymentMethodType:'bank_card',updatedAt:new Date(rev.updatedAt.getTime()+3000)}});
 assert.equal((await completeProfitReconciliationIfUnchanged(profit.id,rev.updatedAt)).count,0,
  'stale financial reconcile must not overwrite a concurrent payment update');
 const currentRev=await readProfitReconciliationRevision(profit.id);
 assert.equal((await completeProfitReconciliationIfUnchanged(profit.id,currentRev.updatedAt)).count,1);
 assert.equal((await prisma.appSubscriptionPayment.findUniqueOrThrow({where:{id:profit.id}})).financeRefundsIncomplete,false);
 const refundInput={providerRefundId:'synthetic-refund-i',paymentId:profit.id,amountKopecks:15000,refundedAt:now};
 await assert.rejects(withProfitFinanceRefundTransaction(async tx=>{
  await persistRefundFinanceReceipt(tx,refundInput);
  throw Error('SYNTHETIC_FINANCE_ABORT');
 }),/SYNTHETIC_FINANCE_ABORT/);
 assert.equal(await prisma.appSubscriptionFinanceRefund.count({where:{paymentId:profit.id}}),0);
 await withProfitFinanceRefundTransaction(tx=>persistRefundFinanceReceipt(tx,refundInput));
 await withProfitFinanceRefundTransaction(tx=>persistRefundFinanceReceipt(tx,refundInput));
 assert.equal(await prisma.appSubscriptionFinanceRefund.count({where:{paymentId:profit.id}}),1);
 console.log('PHASE_I_NPD_AND_PROFIT_FINANCE_REAL_PG_PASS: six concurrent receipt creates; twelve create/refund races; pending/processing/issued cancellation; payment rollback; finance CAS stale guard; transactional refund rollback and idempotent replay; nonUTC PostgreSQL');
}
main().then(async()=>prisma.$disconnect()).catch(async e=>{console.error(e);await prisma.$disconnect();process.exitCode=1;});
