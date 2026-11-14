/** Registration contract persistence without a Core dependency.
 * Core retains promo-code parsing, replay fingerprints and error policy;
 * the DB adapter retains transaction-scope locks, uniqueness, and the
 * registrationPending condition on one-time login grant consumption.
 */
import {Prisma,type ConsentType,type RegistrationChannel,type AppSubscriptionPromoCode,
 type VkLoginGrantPurpose,type VkRegistrationContextPurpose} from '@gafus/prisma';
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
export type RegistrationContractVkPurpose=VkRegistrationContextPurpose;
export type RegistrationContractLoginPurpose=VkLoginGrantPurpose;
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
export async function insertVkRegistrationContextTx(tx:RegistrationContractDbTx,params:{
 contextTokenHash:string;stateHash:string;codeVerifier:string;
 purpose:VkRegistrationContextPurpose;selectedPromoCodeId?:string|null;
 selectedPromoCodeValue?:string|null;userId?:string|null;expiresAt:Date;
}){
 return tx.vkRegistrationContext.create({data:{
  contextTokenHash:params.contextTokenHash,stateHash:params.stateHash,
  codeVerifier:params.codeVerifier,purpose:params.purpose,
  selectedPromoCodeId:params.selectedPromoCodeId??null,
  selectedPromoCodeValue:params.selectedPromoCodeValue??null,
  userId:params.userId??null,expiresAt:params.expiresAt,
 }});
}
export async function claimVkRegistrationContextUserTx(tx:RegistrationContractDbTx,params:{
 contextTokenHash:string;stateHash:string;purpose:VkRegistrationContextPurpose;
 userId:string;now:Date,
}){
 return tx.vkRegistrationContext.updateMany({
  where:{contextTokenHash:params.contextTokenHash,stateHash:params.stateHash,
   purpose:params.purpose,expiresAt:{gt:params.now},completedAt:null,
   OR:[{userId:null},{userId:params.userId}]},
  data:{userId:params.userId},
 });
}
export async function insertVkLoginGrantTx(tx:RegistrationContractDbTx,params:{
 tokenHash:string;userId:string;purpose:VkLoginGrantPurpose;
 reissuedFromId?:string;registrationContextId?:string;expiresAt:Date;
}){
 return tx.vkLoginGrant.create({data:params});
}
/** Returns null on replay, stale grant, revoked consent, or pending user;
 * callers convert this to an identical public contract error. A consumed token
 * can never turn a registrationPending account into an authenticated session.
 */
export async function consumeVkLoginGrantRowTx(tx:RegistrationContractDbTx,params:{
 tokenHash:string;purpose:VkLoginGrantPurpose;requireConsent?:boolean;now:Date;
}){
 const grant=await tx.vkLoginGrant.findFirst({where:{
  tokenHash:params.tokenHash,purpose:params.purpose,expiresAt:{gt:params.now},consumedAt:null,
 }});
 if(!grant||(params.requireConsent&&!grant.consentCompletedAt))return null;
 const updated=await tx.vkLoginGrant.updateMany({
  where:{id:grant.id,expiresAt:{gt:params.now},consumedAt:null,
   ...(params.requireConsent?{consentCompletedAt:{not:null}}:{}),
   user:{registrationPending:false},
  },
  data:{consumedAt:params.now},
 });
 return updated.count===1?grant:null;
}
export {withRegistrationTransaction};

/** Consent rows commit with the account registration transaction. */
export { createCompletedConsentLogsInTransaction } from "@gafus/consent-server/consentService";

/** Referral attribution commits in the same account transaction. */
export { attributePartnerReferralIfCurrentPartnerInTransaction } from "@gafus/subscription-payment-server/partner";
