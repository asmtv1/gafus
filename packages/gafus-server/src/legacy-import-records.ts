/** The legacy rewarded-credit import is an operator-only, one-time migration.
 * This adapter performs only DB reads and a single durable wallet transaction.
 * Core owns the explicit cutover/confirmation policies, batch sizing and
 * signed wallet-credit invariant through the injected legacy balance callback.
 * Never add a cron or request-triggered path to this module.
 */
import {prisma,type Prisma} from "@gafus/prisma";
import {lockGafusUser} from "./walletLock";
export type LegacyImportCandidate={userId:string;balance:number};
export type LegacyCreditCallback=(tx:Prisma.TransactionClient,input:{
 userId:string;amount:number;kind:"LEGACY_IMPORT";idempotencyKey:string;
 metadata:{source:"RewardedCreditWallet";originalBalance:number};
})=>Promise<{transactionId:string|null}>;

export async function readLegacyImportActorRole(actorId:string){
 const user=await prisma.user.findUnique({where:{id:actorId},select:{role:true}});
 return user?.role??null;
}
export async function readLegacyImportPreflightRows(){
 const [balances,pendingRefunds,unsettledSessions,imported]=await Promise.all([
  prisma.rewardedCreditWallet.aggregate({where:{balance:{gt:0}},_count:{_all:true},_sum:{balance:true}}),
  prisma.rewardedCreditWallet.aggregate({where:{pendingRefundCredits:{gt:0}},_count:{_all:true},_sum:{pendingRefundCredits:true}}),
  prisma.rewardedAdSession.count({where:{status:{in:["SHOWN","REWARDED"]},expiresAt:{gt:new Date()}}}),
  prisma.gafusTransaction.count({where:{kind:"LEGACY_IMPORT"}}),
 ]);
 return {activeWallets:balances._count._all,credits:balances._sum.balance??0,
  pendingRefundWallets:pendingRefunds._count._all,
  pendingRefundCredits:pendingRefunds._sum.pendingRefundCredits??0,
  unsettledSessions,imported};
}
export async function readLegacyImportCandidates(cursor:string|undefined,batchSize:number){
 return prisma.rewardedCreditWallet.findMany({
  where:{balance:{gt:0}},orderBy:{userId:"asc"},
  ...(cursor?{cursor:{userId:cursor},skip:1}:{}),take:batchSize+1,
  select:{userId:true,balance:true},
 });
}
/** Every import rechecks the actor's current role UNDER a User row lock.
 * This closes the gap where an admin might be demoted after the preflight but
 * before a credit is written. Other administrative operations must use a
 * normal User UPDATE, which conflicts with FOR NO KEY UPDATE.
 * The wallet lock is the same key used by all earnings and spending paths.
 */
export async function runOneLegacyImportTransaction(
 actorId:string,row:LegacyImportCandidate,credit:LegacyCreditCallback,
){
 return prisma.$transaction(async tx=>{
  const adminRows=await tx.$queryRaw<{id:string}[]>`
    SELECT "id" FROM "User" WHERE "id"=${actorId} FOR NO KEY UPDATE
  `;
  if(adminRows.length!==1)throw new Error("FORBIDDEN");
  const admin=await tx.user.findUnique({where:{id:actorId},select:{role:true}});
  if(admin?.role!=="ADMIN")throw new Error("FORBIDDEN");
  await lockGafusUser(tx,row.userId);
  const key=`legacy-rewarded-balance:${row.userId}`;
  const prior=await tx.gafusTransaction.findUnique({where:{idempotencyKey:key}});
  if(prior)return {imported:false,replay:true,amount:0};
  const original=await tx.rewardedCreditWallet.findUnique({
   where:{userId:row.userId},select:{balance:true,pendingRefundCredits:true},
  });
  if(!original||original.balance<=0)return {imported:false,replay:false,amount:0};
  if(original.balance!==row.balance||original.pendingRefundCredits!==0)
   throw new Error("LEGACY_IMPORT_BALANCE_CHANGED");
  if(!Number.isSafeInteger(original.balance))throw new Error("LEGACY_IMPORT_INVALID_BALANCE");
  const next=await credit(tx,{userId:row.userId,amount:original.balance,kind:"LEGACY_IMPORT",
   idempotencyKey:key,metadata:{source:"RewardedCreditWallet",originalBalance:original.balance}});
  await tx.gafusAdminAudit.create({data:{actorId,targetUserId:row.userId,
   action:"LEGACY_BALANCE_IMPORTED",transactionId:next.transactionId,
   reason:"One-time conversion of pre-existing rewarded credits after advertising cutover",
   before:{balance:original.balance},
   after:{importedGafus:original.balance,previousRowRetained:true},
  }});
  return {imported:true,replay:false,amount:original.balance};
 },{maxWait:10_000,timeout:30_000});
}
