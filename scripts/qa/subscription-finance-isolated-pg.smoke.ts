/** Disposable finance SQL acceptance; no remote YooKassa access or mutations. */
import assert from "node:assert/strict";
import {prisma} from "@gafus/prisma";
import {readLocalFinancePayment} from "@gafus/subscription-finance-server/payment-finance";
import {enrichPaymentFinance,recordFinanceRefund} from "../../packages/core/src/services/appSubscription/paymentFinanceService.js";
const db=new URL(process.env.DATABASE_URL??"http://invalid");
if(process.env.GAFUS_LOCAL_ISOLATED_API!=="1" || process.env.GAFUS_SUBSCRIPTION_FINANCE_REAL_PG!=="1" ||
 db.protocol!=="postgresql:" || db.hostname!=="127.0.0.1" ||
 db.pathname!=="/gafus_refactor_subscription_finance")throw Error("REFUSING_NON_DISPOSABLE_FINANCE_DB");
async function main(){
 const owner=await prisma.user.create({data:{username:"finance_owner",password:"synthetic-disposable"}});
 const [payment,apple]=await Promise.all([
  prisma.appSubscriptionPayment.create({data:{userId:owner.id,provider:"YOOKASSA",kind:"INITIAL",status:"SUCCEEDED",planCode:"MONTHLY",amount:"2490.00",currency:"RUB",idempotenceKey:"finance-yk-original",yookassaPaymentId:"yk-finance-1"}}),
  prisma.appSubscriptionPayment.create({data:{userId:owner.id,provider:"APPLE",kind:"INITIAL",status:"SUCCEEDED",planCode:"MONTHLY",amount:"2490.00",currency:"RUB",idempotenceKey:"finance-apple-original"}}),
 ]);
 const provider={id:"yk-finance-1",status:"succeeded",amount:{value:"2490.00",currency:"RUB"},income_amount:{value:"2390.00",currency:"RUB"},captured_at:"2026-11-03T12:00:00Z",payment_method:{type:"sbp"}};
 assert.deepEqual((await readLocalFinancePayment(payment.id))?.id,payment.id);
 assert.equal(await enrichPaymentFinance(payment.id,provider),true);
 const enriched=await prisma.appSubscriptionPayment.findUniqueOrThrow({where:{id:payment.id}});
 assert.equal(enriched.providerIncomeAmount?.toString(),"2390");
 assert.equal(enriched.providerPaymentMethodType,"sbp");
 assert.equal(enriched.financeSyncedAt instanceof Date,true);
 assert.equal(await enrichPaymentFinance(payment.id,{...provider,id:"wrong-yk"}),false);
 assert.equal(await enrichPaymentFinance(payment.id,{...provider,amount:{value:"2500",currency:"RUB"}}),false);
 assert.equal(await enrichPaymentFinance(payment.id,{...provider,income_amount:{value:"2600",currency:"RUB"}}),false);
 assert.equal(await enrichPaymentFinance(apple.id,provider),false);
 assert.equal((await prisma.appSubscriptionPayment.findUniqueOrThrow({where:{id:apple.id}})).financeSyncedAt,null);
 const refund={id:"refund-finance-1",status:"succeeded",payment_id:"yk-finance-1",created_at:"2026-11-04T12:00:00Z",amount:{value:"100",currency:"RUB"}};
 const snapshot={id:payment.id,yookassaPaymentId:"yk-finance-1",amount:"2490"};
 await prisma.$transaction(tx=>recordFinanceRefund(tx,snapshot,refund));
 await prisma.$transaction(tx=>recordFinanceRefund(tx,snapshot,refund));
 assert.equal(await prisma.appSubscriptionFinanceRefund.count({where:{paymentId:payment.id}}),1);
 assert.equal((await prisma.appSubscriptionFinanceRefund.findUniqueOrThrow({where:{providerRefundId:refund.id}})).amountKopecks,10000);
 await assert.rejects(prisma.$transaction(tx=>recordFinanceRefund(tx,snapshot,{...refund,id:"too-large",amount:{value:"999999",currency:"RUB"}})),/Invalid refund amount/);
 assert.equal(await prisma.appSubscriptionFinanceRefund.count({where:{paymentId:payment.id}}),1);
 console.log("SUBSCRIPTION_FINANCE_REAL_PG_PASS: local owner payment, verified provider/amount, Apple mismatch deny, persisted fee metadata, refund idempotence and overrefund denial");
}
main().then(async()=>prisma.$disconnect()).catch(async(error)=>{console.error(error);await prisma.$disconnect();process.exitCode=1;});
