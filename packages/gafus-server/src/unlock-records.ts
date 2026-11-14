/** Persistence adapter for one user-scoped Gafus unlock.
 * Core owns target eligibility, cost, entitlements, errors and wallet policy.
 * The same transaction holds the canonical Gafus wallet advisory lock for
 * idempotency lookup, debit and grant creation. The grant MUST commit together
 * with the signed wallet ledger debit; no independent query or connection.
 */
import {prisma, type Prisma} from '@gafus/prisma';
import {lockGafusUser} from './walletLock';

export type GafusUnlockTransaction=Prisma.TransactionClient;
export type GafusUnlockGrant={
 userId:string;
 targetType:'COURSE_STEP'|'MINI_GUIDE'|'ARTICLE';
 targetKey:string;
 courseId:string|null;
 dayOnCourseId:string|null;
 stepOnDayId:string|null;
 transactionId:string;
 settingsRevision:number;
 grantedAt:Date;
 expiresAt:Date;
};

/** Same maxWait/timeout as the original Core path; no implicit nested tx. */
export async function withGafusUnlockTransaction<T>(
 userId:string,action:(tx:GafusUnlockTransaction)=>Promise<T>,
):Promise<T>{
 if(!userId)throw Error('GAFUS_WALLET_OWNER_REQUIRED');
 return prisma.$transaction(async tx=>{
  await lockGafusUser(tx,userId);
  return action(tx);
 },{maxWait:10_000,timeout:30_000});
}

/** Global idempotency key is deliberately NOT owner filtered here: Core must
 * see and reject another owner's / target's replay as CONFLICT. */
export async function readGafusUnlockReplayTx(tx:GafusUnlockTransaction,idempotencyKey:string){
 return tx.gafusTransaction.findUnique({
  where:{idempotencyKey},include:{targetAccess:true},
 });
}

/** Insertion under caller-held wallet lock, after signed debit. */
export async function insertGafusUnlockGrantTx(tx:GafusUnlockTransaction,grant:GafusUnlockGrant){
 if(!grant.userId||!grant.targetKey||!grant.transactionId||
   !(grant.expiresAt instanceof Date)||!Number.isFinite(grant.expiresAt.getTime())||
   !(grant.grantedAt instanceof Date)||!Number.isFinite(grant.grantedAt.getTime())||
   grant.expiresAt<=grant.grantedAt)throw Error('GAFUS_UNLOCK_INVALID_GRANT');
 return tx.gafusTargetAccess.create({data:grant});
}
