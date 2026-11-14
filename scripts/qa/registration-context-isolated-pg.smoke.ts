/** Disposable PostgreSQL: Core registration/VK hashing + independent identity
 * reads share the original caller transaction. No VK or mail provider.
 */
import assert from 'node:assert/strict';
import {prisma} from '@gafus/prisma';
import {
 previewRegistrationPromoCode,createVkRegistrationContextWithPromo,
 getValidVkRegistrationContext,getVkConsentContextSummary,
 getVkPendingRegistrationUsername,claimVkRegistrationContextUser,
 isRegistrationCompleted,getVkLinkedAccountUsername,
} from '../../packages/core/src/services/auth/registrationUseCases.js';
import {
 hashRegistrationOpaqueValue,createVkRegistrationContextInTransaction,
 getOrCreateRegistrationEmailAttemptInTransaction,
 completeRegistrationEmailAttemptInTransaction,
 issueVkLoginGrantInTransaction,consumeVkLoginGrantInTransaction,
 reissueVkLoginGrantInTransaction,
} from '../../packages/core/src/services/auth/registrationContracts.js';
import {withRegistrationTransaction} from '@gafus/identity-write-server/registration-context-reads';
import {completeVkRegistration} from '../../packages/core/src/services/auth/vkRegistrationCompletion.js';
const url=new URL(process.env.DATABASE_URL??'http://invalid');
if(process.env.GAFUS_LOCAL_ISOLATED_API!=='1'||process.env.GAFUS_REGISTRATION_CONTEXT_REAL_PG!=='1'||
 url.protocol!=='postgresql:'||url.hostname!=='127.0.0.1'||
 url.pathname!=='/gafus_refactor_registration_context_i')
 throw Error('REFUSING_NON_DISPOSABLE_REGISTRATION_CONTEXT_PG');
async function main(){
 const zone=await prisma.$queryRaw<{zone:string}[]>`SELECT current_setting('TimeZone') AS zone`;
 assert.equal(zone[0]?.zone,'Pacific/Auckland');
 const [pending,another]=await Promise.all([
  prisma.user.create({data:{username:'registration_pending_i',password:'fictional',registrationPending:true}}),
  prisma.user.create({data:{username:'registration_other_i',password:'fictional',registrationPending:true}}),
 ]);
 assert.equal(await isRegistrationCompleted(pending.id),false);
 assert.equal(await isRegistrationCompleted('no-such-user'),false);
 assert.equal(await getVkLinkedAccountUsername(pending.id),'registration_pending_i');
 assert.equal(await getVkLinkedAccountUsername('no-such-user'),null);
 const promo=await prisma.appSubscriptionPromoCode.create({data:{
  code:'SAVE20',normalizedCode:'SAVE20',discountPercent:20,isActive:true,
 }});
 assert.equal((await previewRegistrationPromoCode(' save20 '))?.id,promo.id);
 await assert.rejects(previewRegistrationPromoCode('does-not-exist'),/REGISTRATION_PROMO_INVALID/);
 const token='synthetic-one-time-context-token-i';
 const state='synthetic-oauth-state-i';
 const saved=await createVkRegistrationContextWithPromo({
  contextToken:token,state,codeVerifier:'synthetic-code-verifier-i',promoCode:'save20',
 });
 assert.deepEqual(saved,{selectedPromoCode:'SAVE20'});
 const row=await prisma.vkRegistrationContext.findUniqueOrThrow({
  where:{contextTokenHash:hashRegistrationOpaqueValue(token)},
 });
 assert.equal(row.stateHash,hashRegistrationOpaqueValue(state));
 assert.notEqual(row.contextTokenHash,token,'raw OAuth token must never appear in DB');
 assert.equal(row.selectedPromoCodeId,promo.id);
 assert.equal(row.selectedPromoCodeValue,'SAVE20');
 assert.equal(row.userId,null);
 assert.equal((await getValidVkRegistrationContext(token))?.codeVerifier,'synthetic-code-verifier-i');
 assert.equal(await getValidVkRegistrationContext('wrong-token'),null);
 assert.equal((await getVkConsentContextSummary(token,state))?.selectedPromoCodeValue,'SAVE20');
 assert.equal(await getVkConsentContextSummary(token,'wrong-state'),null);
 assert.equal(await getVkPendingRegistrationUsername(token,state),null);
 await claimVkRegistrationContextUser({contextToken:token,state,userId:pending.id});
 await claimVkRegistrationContextUser({contextToken:token,state,userId:pending.id});
 assert.equal(await getVkPendingRegistrationUsername(token,state),'registration_pending_i');
 await assert.rejects(claimVkRegistrationContextUser({contextToken:token,state,userId:another.id}),/VK_CONTEXT_INVALID/);
 assert.equal(await isRegistrationCompleted(pending.id),false,'OAuth claim is not consent completion');
 await prisma.vkRegistrationContext.update({where:{id:row.id},data:{completedAt:new Date()}});
 assert.equal(await getValidVkRegistrationContext(token),null,'completed context must not permit second token exchange');
 assert.ok((await getVkConsentContextSummary(token,state))?.completedAt,'consent state still visible');
 await assert.rejects(claimVkRegistrationContextUser({contextToken:token,state,userId:pending.id}),/VK_CONTEXT_INVALID/);
 await prisma.user.update({where:{id:pending.id},data:{registrationPending:false}});
 assert.equal(await isRegistrationCompleted(pending.id),true);
 await prisma.vkRegistrationContext.update({where:{id:row.id},data:{expiresAt:new Date('2020-01-01T00:00:00Z')}});
 assert.equal(await getVkConsentContextSummary(token,state),null,'expired context cannot reveal selected promo');
 assert.equal(await getVkPendingRegistrationUsername(token,state),null);
 const rollbackToken='rolled-back-vk-context-i';
 await assert.rejects(withRegistrationTransaction(async tx=>{
  await createVkRegistrationContextInTransaction(tx,{
   contextToken:rollbackToken,state:'rolled-back-state-i',codeVerifier:'rolled-back-verifier',purpose:'REGISTER',
  });
  throw Error('SYNTHETIC_REGISTRATION_ABORT');
 }),/SYNTHETIC_REGISTRATION_ABORT/);
 assert.equal(await getValidVkRegistrationContext(rollbackToken),null);
 assert.equal(await prisma.vkRegistrationContext.count({where:{contextTokenHash:hashRegistrationOpaqueValue(rollbackToken)}}),0);
 // Phase K: complete a DIFFERENT claimed VK registration through the actual
 // Core consent/promo policy + independently extracted context-locked port.
 const completeToken='synthetic-mobile-completion-k';
 const completeState='synthetic-mobile-state-k';
 await createVkRegistrationContextWithPromo({
  contextToken:completeToken,state:completeState,codeVerifier:'synthetic-mobile-verifier-k',
 });
 await claimVkRegistrationContextUser({contextToken:completeToken,state:completeState,userId:another.id});
 const consent={tempSessionId:'synthetic-mobile-consent-k',
  consentPayload:{acceptPersonalData:true,acceptPrivacyPolicy:true,acceptDataDistribution:true},
  formData:{name:'Synthetic VK K'},defaultVersion:'v1'};
 const completions=await Promise.all(Array.from({length:8},()=>completeVkRegistration({
  contextToken:completeToken,state:completeState,consent,transport:'MOBILE',
 })));
 assert.equal(completions.filter(x=>!x.replayed).length,1,'one transaction completes user');
 assert.equal(completions.filter(x=>x.replayed).length,7,'replay may not re-consent or re-create user');
 assert.equal(completions.every(x=>x.user.id===another.id),true);
 assert.equal(await isRegistrationCompleted(another.id),true);
 const completed=await prisma.vkRegistrationContext.findUniqueOrThrow({where:{contextTokenHash:hashRegistrationOpaqueValue(completeToken)}});
 assert.equal(completed.resultUserId,another.id);
 assert.ok(completed.completedAt&&completed.completionFingerprint);
 assert.equal(await prisma.consentLog.count({where:{userId:another.id,tempSessionId:consent.tempSessionId,status:'COMPLETED'}}),3,
  'all three accepted consents must atomically follow the one completion');
 assert.equal(await prisma.vkLoginGrant.count({where:{registrationContextId:completed.id}}),0,
  'MOBILE must not mint WEB LOGIN tokens');
 await assert.rejects(completeVkRegistration({contextToken:completeToken,state:completeState,
  consent:{...consent,formData:{name:'Changed replay'}},transport:'MOBILE'}),/VK_COMPLETION_ATTEMPT_CONFLICT/);
 await prisma.vkRegistrationContext.update({where:{id:completed.id},data:{expiresAt:new Date('2020-01-01T00:00:00Z')}});
 await assert.rejects(completeVkRegistration({contextToken:completeToken,state:completeState,consent,transport:'MOBILE'}),/VK_CONTEXT_EXPIRED/);
 assert.equal(await prisma.consentLog.count({where:{userId:another.id,tempSessionId:consent.tempSessionId}}),3);
 // Phase M: preserve original email-registration idempotency over the
 // extracted transaction-only adapter (one lock key, one attempt, safe replay).
 const emailInput={tempSessionId:'phase-m-email-attempt',dataFingerprint:'a'.repeat(64)};
 const attempts=await Promise.all(Array.from({length:10},()=>withRegistrationTransaction(tx=>
  getOrCreateRegistrationEmailAttemptInTransaction(tx,emailInput))));
 assert.equal(new Set(attempts.map(x=>x.id)).size,1);
 assert.equal(await prisma.registrationEmailAttempt.count({where:{tempSessionId:emailInput.tempSessionId}}),1);
 await assert.rejects(withRegistrationTransaction(tx=>getOrCreateRegistrationEmailAttemptInTransaction(tx,
  {...emailInput,dataFingerprint:'b'.repeat(64)})),/REGISTRATION_ATTEMPT_FINGERPRINT_MISMATCH/);
 const completedAttempt=await withRegistrationTransaction(tx=>completeRegistrationEmailAttemptInTransaction(tx,
  {...emailInput,result:'SUCCEEDED',userId:another.id}));
 const replayAttempt=await withRegistrationTransaction(tx=>completeRegistrationEmailAttemptInTransaction(tx,
  {...emailInput,result:'EMAIL_TAKEN'}));
 assert.equal(replayAttempt.id,completedAttempt.id);
 assert.equal(replayAttempt.result,'SUCCEEDED','completed attempt must remain immutable');
 assert.equal(replayAttempt.userId,another.id);
 // Earlier phase-I tests correctly completed `pending`; this is a FRESH
 // registrationPending account created solely to prove the login CAS gate.
 const actuallyPending=await prisma.user.create({data:{
  username:'phase_m_pending_login',password:'synthetic',registrationPending:true,
 }});
 await withRegistrationTransaction(tx=>issueVkLoginGrantInTransaction(tx,{
  token:'phase-m-pending-login-token',userId:actuallyPending.id,purpose:'LOGIN',
 }));
 await assert.rejects(withRegistrationTransaction(tx=>consumeVkLoginGrantInTransaction(tx,{
  token:'phase-m-pending-login-token',purpose:'LOGIN',
 })),/VK_LOGIN_GRANT_INVALID/);
 const pendingGrant=await prisma.vkLoginGrant.findUniqueOrThrow({
  where:{tokenHash:hashRegistrationOpaqueValue('phase-m-pending-login-token')},
 });
 assert.equal(pendingGrant.consumedAt,null);
 // Even a completed user needs a completed consent token when the path
 // explicitly requires consent. Race of redemption has a single winner.
 const rawToken='phase-m-authorized-login-token';
 await withRegistrationTransaction(tx=>issueVkLoginGrantInTransaction(tx,{
  token:rawToken,userId:another.id,purpose:'LOGIN',
 }));
 await assert.rejects(withRegistrationTransaction(tx=>consumeVkLoginGrantInTransaction(tx,{
  token:rawToken,purpose:'LOGIN',requireConsent:true,
 })),/VK_LOGIN_GRANT_INVALID/);
 await prisma.vkLoginGrant.update({where:{tokenHash:hashRegistrationOpaqueValue(rawToken)},
  data:{consentCompletedAt:new Date()}});
 const redemption=await Promise.allSettled(Array.from({length:8},()=>withRegistrationTransaction(tx=>
  consumeVkLoginGrantInTransaction(tx,{token:rawToken,purpose:'LOGIN',requireConsent:true}))));
 assert.equal(redemption.filter(x=>x.status==='fulfilled').length,1,
  'only one of eight concurrent login token redemptions may succeed');
 assert.equal(redemption.filter(x=>x.status==='rejected').length,7);
 assert.equal((await prisma.vkLoginGrant.findUniqueOrThrow({
  where:{tokenHash:hashRegistrationOpaqueValue(rawToken)},
 })).consumedAt instanceof Date,true);
 const replacementOld='phase-m-reissue-old';
 const replacementNew='phase-m-reissue-new';
 const issued=await withRegistrationTransaction(tx=>issueVkLoginGrantInTransaction(tx,{
  token:replacementOld,userId:another.id,purpose:'LOGIN',
 }));
 const reissued=await withRegistrationTransaction(tx=>reissueVkLoginGrantInTransaction(tx,{
  oldToken:replacementOld,newToken:replacementNew,purpose:'LOGIN',
 }));
 assert.equal(reissued.reissuedFromId,issued.id);
 assert.equal(reissued.tokenHash,hashRegistrationOpaqueValue(replacementNew));
 assert.notEqual(reissued.tokenHash,replacementNew);
 await assert.rejects(withRegistrationTransaction(tx=>reissueVkLoginGrantInTransaction(tx,{
  oldToken:replacementOld,newToken:'phase-m-reissue-duplicate',purpose:'LOGIN',
 })),/VK_LOGIN_GRANT_INVALID/);
 assert.equal(await prisma.vkLoginGrant.count({where:{reissuedFromId:issued.id}}),1);
 console.log('REGISTRATION_CONTRACTS_PHASE_M_REAL_PG_PASS: ten concurrent email attempts one row, fingerprint mismatch denied, immutable completion, pending and unconsented grants denied, eight concurrent LOGIN redemptions one winner, hashed reissue once, nonUTC PostgreSQL');
 console.log('REGISTRATION_CONTEXT_PHASE_K_REAL_PG_PASS: eight concurrent owner-locked Core completions => exactly one user+3 consents, seven replay responses, no MOBILE login grants, changed input conflict, expiration fail-closed; nonUTC database');
 console.log('REGISTRATION_CONTEXT_PHASE_I_REAL_PG_PASS: hashed VK tokens, consent+promo atomic context, owner claim single user, role completion gate, completed/expired rejection, transaction rollback, nonUTC database');
}
main().then(async()=>prisma.$disconnect()).catch(async err=>{console.error(err);await prisma.$disconnect();process.exitCode=1;});
