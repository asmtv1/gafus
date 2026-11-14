/** Narrow SQL-only finance repository. Core owns immutable provider validation. */
import {prisma,type Prisma} from "@gafus/prisma";

export type PaymentFinanceTransaction=Pick<Prisma.TransactionClient,"appSubscriptionFinanceRefund">;
export type FinancePaymentUpdate={
 providerPaymentMethodType?:string;
 providerCapturedAt?:Date;
 providerIncomeAmount?:string;
 financeSyncedAt?:Date;
};

export async function readLocalFinancePayment(paymentId:string){
 if(!paymentId)return null;
 return prisma.appSubscriptionPayment.findUnique({
  where:{id:paymentId},
  select:{id:true,yookassaPaymentId:true,amount:true,currency:true,provider:true},
 });
}

/** Caller already cross-checks YooKassa provider confirmation and local amount.
 * This remains best-effort and must not block verified subscription access.
 */
export async function persistVerifiedFinanceFields(paymentId:string,data:FinancePaymentUpdate):Promise<void>{
 if(!paymentId)throw new Error("FINANCE_PAYMENT_ID_REQUIRED");
 await prisma.appSubscriptionPayment.update({where:{id:paymentId},data});
}

/** Must share the outer payment refund's transaction. No second DB connection. */
export async function persistRefundFinanceReceipt(
 tx:PaymentFinanceTransaction,data:{providerRefundId:string;paymentId:string;amountKopecks:number;refundedAt:Date},
):Promise<void>{
 await tx.appSubscriptionFinanceRefund.upsert({
  where:{providerRefundId:data.providerRefundId},update:{},create:data,
 });
}
