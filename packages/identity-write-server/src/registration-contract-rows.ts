/** Registration contract persistence without a Core dependency.
 * Core retains promo-code parsing, replay fingerprints and error policy;
 * the DB adapter retains transaction-scope locks, uniqueness, and the
 * registrationPending condition on one-time login grant consumption.
 */
import {Prisma,type ConsentType,type RegistrationChannel,type AppSubscriptionPromoCode,
} from '@gafus/prisma';
import {withRegistrationTransaction} from './registration-context-reads';

/** Static schema-checked wire literals: no eager Prisma enum runtime imports.
 * Important for isolated VK/Next modules with narrowly mocked Prisma clients.
 */
export const REGISTRATION_UNKNOWN_CHANNEL = "UNKNOWN" satisfies RegistrationChannel;
export const REGISTRATION_CONSENT_TYPES = ["PERSONAL_DATA", "PRIVACY_POLICY", "DATA_DISTRIBUTION"] as const satisfies readonly ConsentType[];
/** Narrow unique errors only; do not mistake unrelated adapter failures for conflicts. */
export function registrationUniqueErrorTargets(error:unknown):string[]|null{
 if(!(error instanceof Prisma.PrismaClientKnownRequestError)||error.code!=='P2002')return null;
 const target=(error.meta?.target as string[]|string|undefined);
 return Array.isArray(target)?target:target?[target]:[];
}
export type RegistrationContractDbTx=Prisma.TransactionClient;
/** Replay read is bound to exactly the previously committed attempt's account. */
export function readCredentialRegistrationReplayUserTx(tx:RegistrationContractDbTx,userId:string){
 return tx.user.findUnique({where:{id:userId},select:{id:true,password:true}});
}
/** The caller's transaction also commits consent, referral and attempt receipt. */
export function insertCredentialRegistrationUserTx(tx:RegistrationContractDbTx,input:{
 username:string;email:string;passwordHash:string;registrationChannel:RegistrationChannel,
}){
 return tx.user.create({data:{username:input.username,email:input.email,phone:null,
  password:input.passwordHash,passwordSetAt:new Date(),registrationChannel:input.registrationChannel,
  profile:{create:{}}},select:{id:true}});
}
/** Same transaction as account/consent/promo; never mark success prematurely. */
export function markCredentialRegistrationAttemptSucceededTx(tx:RegistrationContractDbTx,attemptId:string,userId:string){
 return tx.registrationEmailAttempt.update({where:{id:attemptId},
  data:{result:'SUCCEEDED',userId,completedAt:new Date()}});
}

export type RegistrationContractChannel=RegistrationChannel;
export type RegistrationPromoDbRow=Pick<AppSubscriptionPromoCode,
 'id'|'code'|'normalizedCode'|'discountPercent'|'revision'>;

export async function readRegistrationPromoRowTx(tx:RegistrationContractDbTx,normalizedCode:string){
 return tx.appSubscriptionPromoCode.findUnique({
  where:{normalizedCode},select:{id:true,code:true,normalizedCode:true,
   discountPercent:true,revision:true,isActive:true,archivedAt:true},
 });
}
export async function saveRegistrationPromoRowTx(tx:RegistrationContractDbTx,userId:string,promoId:string){
 return tx.user.update({where:{id:userId},data:{savedRegistrationPromoCodeId:promoId}});
}
/** Strict advisory lock is necessary: do not catch PostgreSQL P2002 from
 * inside an already-aborted caller transaction. */
export async function lockRegistrationEmailAttemptTx(tx:RegistrationContractDbTx,tempSessionId:string){
 await tx.$executeRaw(Prisma.sql`
  SELECT pg_advisory_xact_lock(hashtextextended(${tempSessionId},0))
 `);
}
export async function readRegistrationEmailAttemptTx(tx:RegistrationContractDbTx,tempSessionId:string){
 return tx.registrationEmailAttempt.findUnique({where:{tempSessionId}});
}
export async function insertRegistrationEmailAttemptTx(tx:RegistrationContractDbTx,params:{tempSessionId:string;dataFingerprint:string}){
 return tx.registrationEmailAttempt.create({data:params});
}
export async function finishRegistrationEmailAttemptTx(tx:RegistrationContractDbTx,id:string,params:{
 result:'SUCCEEDED'|'USERNAME_TAKEN'|'EMAIL_TAKEN'|'VALIDATION_ERROR';userId?:string,
}){
 return tx.registrationEmailAttempt.update({
  where:{id},data:{result:params.result,userId:params.userId??null,completedAt:new Date()},
 });
}
export {withRegistrationTransaction};

/** Consent rows commit with the account registration transaction. */
export { createCompletedConsentLogsInTransaction } from "@gafus/consent-server/consentService";

/** Referral attribution commits in the same account transaction. */
export { attributePartnerReferralIfCurrentPartnerInTransaction } from "@gafus/subscription-payment-server/partner";
