/** Prisma-only wallet ledger repository.
 * Core retains signed-delta validation, idempotency conflict policy, balance
 * bounds and all domain decisions. Every mutation runs under the existing
 * caller-owned PostgreSQL advisory transaction lock.
 */
import {prisma,type Prisma} from "@gafus/prisma";
export type GafusLedgerTx=Prisma.TransactionClient;
export type GafusLedgerMetadata=Prisma.InputJsonValue;
export type GafusLedgerAppend={
 userId:string;
 kind:"EARN"|"SPEND"|"ADMIN_CREDIT"|"ADMIN_DEBIT"|"LEGACY_IMPORT";
 delta:number;
 balanceBefore:number;
 balanceAfter:number;
 idempotencyKey:string;
 rewardKind?:"POST_PUBLISHED"|"QUESTION_CREATED"|"ANSWER_CREATED"|"POST_REACTION_MILESTONE"|"BEST_ANSWER";
 sourceEntityType?:string;
 sourceEntityId?:string;
 targetType?:"COURSE_STEP"|"MINI_GUIDE"|"ARTICLE";
 targetKey?:string;
 settingsRevision?:number;
 metadata?:GafusLedgerMetadata;
};
export async function ensureWalletRow(tx:GafusLedgerTx,userId:string){
 return tx.gafusWallet.upsert({where:{userId},create:{userId,balance:0},update:{}});
}
export async function findLedgerEntry(tx:GafusLedgerTx,idempotencyKey:string){
 return tx.gafusTransaction.findUnique({where:{idempotencyKey}});
}
export async function updateWalletBalanceRow(tx:GafusLedgerTx,userId:string,delta:number){
 return tx.gafusWallet.updateMany({
  where:{userId,...(delta<0?{balance:{gte:-delta}}:{})},
  data:{balance:delta>0?{increment:delta}:{decrement:-delta}},
 });
}
export async function appendLedgerEntry(tx:GafusLedgerTx,data:GafusLedgerAppend){
 return tx.gafusTransaction.create({data});
}
export async function readWalletBalanceRow(userId:string){
 return prisma.gafusWallet.findUnique({where:{userId},select:{balance:true}});
}
export async function readWalletLedgerRows(userId:string,cursor:string|undefined,limit:number){
 return prisma.gafusTransaction.findMany({
  where:{userId},orderBy:[{createdAt:"desc"},{id:"desc"}],
  ...(cursor?{cursor:{id:cursor},skip:1}:{}),take:limit+1,
 });
}
