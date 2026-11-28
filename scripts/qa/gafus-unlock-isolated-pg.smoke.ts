/** Disposable exact-DB acceptance for Core wallet-policy + standalone unlock repository.
 * No payment, provider, user real data or production contact. */
import assert from 'node:assert/strict';
import {prisma} from '@gafus/prisma';
import {withGafusUserLock} from '@gafus/gafus-server/wallet-lock';
import {withGafusUnlockTransaction,readGafusUnlockReplayTx,insertGafusUnlockGrantTx}
 from '@gafus/gafus-server/unlock-records';
import {gafusWallet} from "../../apps/api/src/modules/gafus/composition/wallet-instance.js";
const {changeGafusBalanceTx}=gafusWallet;
const url=new URL(process.env.DATABASE_URL??'http://invalid');
if(process.env.GAFUS_LOCAL_ISOLATED_API!=='1'||process.env.GAFUS_UNLOCK_REAL_PG!=='1'||
 url.protocol!=='postgresql:'||url.hostname!=='127.0.0.1'||url.pathname!=='/gafus_refactor_unlock_j')
 throw Error('REFUSING_NON_DISPOSABLE_UNLOCK_PG');
const started=new Date('2026-11-09T10:00:00Z');
const expiration=new Date(started.getTime()+7*86400_000);
async function main(){
 const zone=await prisma.$queryRaw<{zone:string}[]>`SELECT current_setting('TimeZone') AS zone`;
 assert.equal(zone[0]?.zone,'Pacific/Auckland');
 const [actor,other]=await Promise.all([
  prisma.user.create({data:{username:'synthetic_unlock_j_actor',password:'never-login'}}),
  prisma.user.create({data:{username:'synthetic_unlock_j_other',password:'never-login'}}),
 ]);
 await withGafusUserLock(actor.id,tx=>changeGafusBalanceTx(tx,{
  userId:actor.id,kind:'ADMIN_CREDIT',amount:3,idempotencyKey:'synthetic-unlock-j-balance',
 }));
 const purchase=(idempotencyKey:string)=>withGafusUnlockTransaction(actor.id,async tx=>{
  const prior=await readGafusUnlockReplayTx(tx,idempotencyKey);
  if(prior)return {replay:true,transactionId:prior.id,expiration:prior.targetAccess?.expiresAt};
  const debit=await changeGafusBalanceTx(tx,{
   userId:actor.id,kind:'SPEND',amount:-1,idempotencyKey,
   targetType:'ARTICLE',targetKey:'article:synthetic-unlock-j',settingsRevision:1,
  });
  const grant=await insertGafusUnlockGrantTx(tx,{
   userId:actor.id,targetType:'ARTICLE',targetKey:'article:synthetic-unlock-j',
   courseId:null,dayOnCourseId:null,stepOnDayId:null,
   transactionId:debit.transactionId,settingsRevision:1,grantedAt:started,expiresAt:expiration,
  });
  return {replay:false,transactionId:debit.transactionId,expiration:grant.expiresAt};
 });
 const same=await Promise.all(Array.from({length:12},()=>purchase('synthetic-unlock-j-one-request')));
 assert.equal(same.filter(x=>!x.replay).length,1,'must charge only one request');
 assert.equal(same.filter(x=>x.replay).length,11);
 assert.equal(new Set(same.map(x=>x.transactionId)).size,1);
 assert.equal(same.every(x=>x.expiration?.toISOString()===expiration.toISOString()),true);
 assert.equal((await prisma.gafusWallet.findUniqueOrThrow({where:{userId:actor.id}})).balance,2);
 assert.equal(await prisma.gafusTargetAccess.count({where:{userId:actor.id}}),1);
 assert.equal(await prisma.gafusTransaction.count({where:{userId:actor.id,kind:'SPEND'}}),1);
 // Two remaining coins: eight distinct concurrent requests can commit at most
 // two complete ledger+grant transactions. No negative wallet, orphan grant,
 // or orphan debit may persist after the six failures.
 const racing=await Promise.allSettled(Array.from({length:8},(_,i)=>purchase(`synthetic-unlock-j-distinct-${i}`)));
 assert.equal(racing.filter(x=>x.status==='fulfilled').length,2);
 assert.equal(racing.filter(x=>x.status==='rejected').length,6);
 assert.equal((await prisma.gafusWallet.findUniqueOrThrow({where:{userId:actor.id}})).balance,0);
 assert.equal(await prisma.gafusTransaction.count({where:{userId:actor.id,kind:'SPEND'}}),3);
 assert.equal(await prisma.gafusTargetAccess.count({where:{userId:actor.id}}),3);
 assert.equal(await prisma.gafusTargetAccess.count({where:{userId:other.id}}),0);
 // A failure AFTER the money debit must roll back the debit and its journal.
 await assert.rejects(withGafusUnlockTransaction(actor.id,async tx=>{
  await changeGafusBalanceTx(tx,{
   userId:actor.id,kind:'ADMIN_CREDIT',amount:1,idempotencyKey:'synthetic-unlock-j-rollback',
  });
  throw Error('INJECTED_GRANT_INSERT_FAILURE');
 }),/INJECTED_GRANT_INSERT_FAILURE/);
 assert.equal((await prisma.gafusWallet.findUniqueOrThrow({where:{userId:actor.id}})).balance,0);
 assert.equal(await prisma.gafusTransaction.count({where:{idempotencyKey:'synthetic-unlock-j-rollback'}}),0);
 assert.equal(await prisma.gafusTargetAccess.count({where:{userId:actor.id}}),3);
 await assert.rejects(withGafusUnlockTransaction('',async()=>null),/GAFUS_WALLET_OWNER_REQUIRED/);
 await assert.rejects(withGafusUnlockTransaction(actor.id,async tx=>
  insertGafusUnlockGrantTx(tx,{
   userId:actor.id,targetType:'ARTICLE',targetKey:'article:invalid',courseId:null,
   dayOnCourseId:null,stepOnDayId:null,transactionId:'invalid',settingsRevision:1,
   grantedAt:started,expiresAt:started,
  })
 ),/GAFUS_UNLOCK_INVALID_GRANT/);
 console.log('GAFUS_UNLOCK_PHASE_J_REAL_PG_PASS: twelve concurrent same-key requests charge once, eight different spend attempts commit only two, no orphan grant/debit, one owner scope, seven-day replay, rollback, invalid grants rejected, nonUTC PostgreSQL');
}
main().then(async()=>prisma.$disconnect()).catch(async e=>{console.error(e);await prisma.$disconnect();process.exitCode=1;});
