/** VK registration completion database port.
 * Core performs consent, promotion, VK purpose/state and replay decisions.
 * This module owns only same-transaction SQL, including the context-scoped
 * advisory lock, context read, registrationPending CAS and LOGIN grant revoke.
 * It never performs OAuth calls and never creates independent transactions
 * inside the Core callback.
 */
import {ConsentLogStatus,Prisma,prisma,type Prisma as PrismaType} from '@gafus/prisma';

export const completedConsentLogStatus=ConsentLogStatus.COMPLETED;
export type VkCompletionDbTx=PrismaType.TransactionClient;

export async function withLockedVkCompletion<T>(
 contextTokenHash:string,
 action:(tx:VkCompletionDbTx,context:Awaited<ReturnType<typeof loadVkCompletionContextTx>>,now:Date)=>Promise<T>,
):Promise<T>{
 if(!/^[a-f0-9]{64}$/.test(contextTokenHash)) throw Error('VK_COMPLETION_HASH_INVALID');
 return prisma.$transaction(async tx=>{
  await tx.$executeRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(hashtextextended(${contextTokenHash}, 0))
  `);
  const now=new Date();
  const context=await loadVkCompletionContextTx(tx,contextTokenHash);
  return action(tx,context,now);
 });
}

async function loadVkCompletionContextTx(tx:VkCompletionDbTx,contextTokenHash:string){
 return tx.vkRegistrationContext.findUnique({
  where:{contextTokenHash},
  include:{
   user:{select:{id:true,username:true,role:true,phone:true,registrationPending:true}},
   selectedPromoCode:{select:{code:true}},
   resultUser:{select:{id:true,username:true,role:true,phone:true}},
  },
 });
}

/** Context replay can reissue only one unconsumed LOGIN token. This runs
 * within the context-scoped advisory lock, before the new grant is inserted.
 */
export async function revokePriorVkCompletionLoginGrantsTx(
 tx:VkCompletionDbTx,contextId:string,now:Date,
){
 return tx.vkLoginGrant.updateMany({
  where:{registrationContextId:contextId,purpose:'LOGIN',consumedAt:null},
  data:{consumedAt:now},
 });
}

/** Compare-and-set pending -> completed without creating a live account on
 * a stale/previously completed user. Core must reject count !== 1.
 */
export async function completePendingVkRegistrationUserTx(tx:VkCompletionDbTx,userId:string){
 return tx.user.updateMany({
  where:{id:userId,registrationPending:true},
  data:{registrationPending:false},
 });
}

/** Atomic context result marker, within same transaction as user consent,
 * referral and login grant. Core already verified fingerprint and purpose.
 */
export async function markVkRegistrationContextCompletedTx(
 tx:VkCompletionDbTx,contextId:string,userId:string,fingerprint:string,now:Date,
){
 if(!/^[a-f0-9]{64}$/.test(fingerprint))throw Error('VK_COMPLETION_FINGERPRINT_INVALID');
 return tx.vkRegistrationContext.update({
  where:{id:contextId},
  data:{resultUserId:userId,completionFingerprint:fingerprint,completedAt:now},
 });
}

/** VK completion must persist consent inside the same locked transaction. */
export { createCompletedConsentLogsInTransaction } from "@gafus/consent-server/consentService";

/** Referral attribution commits in the same account transaction. */
export { attributePartnerReferralIfCurrentPartnerInTransaction } from "@gafus/subscription-payment-server/partner";
