/** Owner of local finance-reconciliation SQL only.
 * Core retains YooKassa read-only API, cursor/retry logic, strict provider
 * validation and the explicit --apply guard; there are no provider I/O calls
 * and no reconciliation decisions in this module.
 */
import {prisma,type Prisma} from '@gafus/prisma';
import type {FinancePaymentUpdate} from './paymentFinance';

export async function readProfitReconciliationBatch(cursor:string|undefined,from:Date,now:Date){
 return prisma.appSubscriptionPayment.findMany({
  where:{provider:'YOOKASSA',status:{in:['SUCCEEDED','REFUNDED']},
   yookassaPaymentId:{not:null},
   OR:[
    {providerCapturedAt:{gte:from,lte:now}},
    {providerCapturedAt:null,succeededAt:{gte:from,lte:now}},
    {providerCapturedAt:null,succeededAt:null},
   ]},
  orderBy:{id:'asc'},take:100,
  ...(cursor?{cursor:{id:cursor},skip:1}:{}),
  select:{id:true,amount:true,currency:true,yookassaPaymentId:true,status:true},
 });
}
export type LocalProfitReconciliationPayment=Awaited<ReturnType<typeof readProfitReconciliationBatch>>[number];

/** A completed provider verification is not an entitlement grant.
 * It only records supplementary financial fields and keeps refund status
 * incomplete until the COMPLETE refund scan actually succeeds.
 */
export async function persistProfitReconciliationSnapshot(id:string,data:FinancePaymentUpdate){
 return prisma.appSubscriptionPayment.update({
  where:{id},data:{...data,financeRefundsIncomplete:true},
 });
}
export async function readProfitReconciliationRevision(id:string){
 return prisma.appSubscriptionPayment.findUniqueOrThrow({
  where:{id},select:{updatedAt:true},
 });
}
/** Only write financial-refund rows inside an explicit transaction. */
export async function withProfitFinanceRefundTransaction<T>(
 write:(tx:Prisma.TransactionClient)=>Promise<T>,
){
 return prisma.$transaction(write);
}
/** Optimistic CAS: disallow an undefined revision from broadening a write to
 * id-only after a concurrent webhook changed this payment. */
export async function completeProfitReconciliationIfUnchanged(id:string,updatedAt:Date){
 if(!(updatedAt instanceof Date)||!Number.isFinite(updatedAt.getTime()))
  throw Error('FINANCE_REVISION_REQUIRED');
 return prisma.appSubscriptionPayment.updateMany({
  where:{id,updatedAt},data:{financeRefundsIncomplete:false},
 });
}
