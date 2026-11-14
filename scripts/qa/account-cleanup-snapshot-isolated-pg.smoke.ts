/** Disposable PostgreSQL acceptance for deletion-time account media snapshots.
 * Never calls a storage/CDN provider, never touches production. */
import assert from 'node:assert/strict';
import {prisma} from '@gafus/prisma';
import {enqueueAccountStorageCleanup} from '../../apps/api/src/modules/account-cleanup/composition/enqueue.js';
import {
 claimAccountCleanupJob,accountCleanupOwnerExists,completeAccountPrivateScope,
 checkpointAccountCdnOperations,retryAccountStorageJob,
} from '@gafus/identity-write-server/account-cleanup-worker-rows';
const db=new URL(process.env.DATABASE_URL??'http://invalid');
if(process.env.GAFUS_LOCAL_ISOLATED_API!=='1'||process.env.GAFUS_ACCOUNT_CLEANUP_REAL_PG!=='1'||
 db.protocol!=='postgresql:'||db.hostname!=='127.0.0.1'||
 db.pathname!=='/gafus_refactor_account_cleanup_k')throw Error('REFUSING_NON_DISPOSABLE_ACCOUNT_CLEANUP_DB');
async function main(){
 const zone=await prisma.$queryRaw<{zone:string}[]>`SELECT current_setting('TimeZone') AS zone`;
 assert.equal(zone[0]?.zone,'Pacific/Auckland');
 const [owner,other]=await Promise.all([
  prisma.user.create({data:{username:'cleanup_owner_k',password:'synthetic'}}),
  prisma.user.create({data:{username:'cleanup_other_k',password:'synthetic'}}),
 ]);
 const avatar=`https://example.invalid/uploads/users/${owner.id}/avatar/one.jpg`;
 await prisma.userProfile.create({data:{userId:owner.id,avatarUrl:avatar}});
 const pet=await prisma.pet.create({data:{
  ownerId:owner.id,name:'Synthetic dog',type:'DOG',breed:'Synthetic',
  birthDate:new Date('2023-01-01T00:00:00Z'),
  photoUrl:`isodev-avatar:documents/uploads/users/${owner.id}/pets/pet-A/11111111-1111-4111-8111-111111111111.jpg`,
 }});
 const docUrl=`cloudru:documents:documents/uploads/users/${owner.id}/pets/${pet.id}/documents/synthetic.pdf`;
 await prisma.petDocument.create({data:{ownerId:owner.id,petId:pet.id,name:'Synthetic document',
  mimeType:'application/pdf',sizeBytes:123,url:docUrl}});
 const foreignPet=await prisma.pet.create({data:{ownerId:other.id,name:'Other dog',type:'DOG',
  breed:'Synthetic',birthDate:new Date('2023-01-01T00:00:00Z')}});
 const foreignKey=`cloudru:documents:documents/uploads/users/${other.id}/pets/${foreignPet.id}/documents/private.pdf`;
 await prisma.petDocument.create({data:{ownerId:other.id,petId:foreignPet.id,name:'Foreign',
  mimeType:'application/pdf',sizeBytes:50,url:foreignKey}});
 const at=new Date('2026-11-09T11:00:00Z');
 await prisma.$transaction(async tx=>{
  await enqueueAccountStorageCleanup(tx,owner.id,at);
  await enqueueAccountStorageCleanup(tx,owner.id,at);
  // A cascading delete is safe ONLY when media and Stream intent has already
  // been written into no-FK immutable snapshot rows, in this same transaction.
  await tx.user.delete({where:{id:owner.id}});
 });
 assert.equal(await prisma.user.findUnique({where:{id:owner.id}}),null);
 const rows=await prisma.accountStorageCleanup.findMany({where:{ownerId:owner.id}});
 assert.equal(rows.filter(r=>r.scope==='public').length,1);
 assert.equal(rows.filter(r=>r.scope==='gallery').length,1);
 assert.equal(rows.filter(r=>r.scope==='feed').length,1);
 assert.equal(rows.filter(r=>r.scope==='documents').length,1);
 const publicRow=rows.find(r=>r.scope==='public')!;
 const docs=rows.find(r=>r.scope==='documents')!;
 assert.ok(publicRow.keys.includes(avatar));
 assert.ok(docs.keys.includes(docUrl));
 assert.ok(docs.keys.some(x=>x.startsWith('isodev-avatar:documents/uploads/users/')));
 assert.equal(rows.some(r=>r.keys.some(x=>x.includes(other.id))),false,'different owner must never leak into deleted snapshot');
 assert.equal(rows.some(r=>r.keys.includes(foreignKey)),false);
 assert.equal(rows.every(r=>r.status==='pending'),true);
 assert.equal(rows.every(r=>r.availableAt>at),true);
 assert.equal((await prisma.user.findUniqueOrThrow({where:{id:other.id}})).id,other.id);
 assert.equal(await prisma.petDocument.count({where:{ownerId:other.id}}),1);
 const rollbackOwner=await prisma.user.create({data:{username:'cleanup_rollback_k',password:'synthetic'}});
 await assert.rejects(prisma.$transaction(async tx=>{
  await enqueueAccountStorageCleanup(tx,rollbackOwner.id,at);
  throw Error('SYNTHETIC_ACCOUNT_DELETE_ABORT');
 }),/SYNTHETIC_ACCOUNT_DELETE_ABORT/);
 assert.equal(await prisma.accountStorageCleanup.count({where:{ownerId:rollbackOwner.id}}),0);
 assert.ok(await prisma.user.findUnique({where:{id:rollbackOwner.id}}));
 // The private local worker can claim ONLY this exact deleted account and
 // only its private documents/questions scopes, never someone else's media.
 assert.equal(await accountCleanupOwnerExists(other.id),true);
 assert.equal(await accountCleanupOwnerExists(owner.id),false);
 assert.equal(await claimAccountCleanupJob('foreign-claim-k',other.id),null);
 // Snapshot availability deliberately includes the safety delay. Advance ONLY
 // this disposable job before testing the lease worker, not production time.
 await prisma.accountStorageCleanup.updateMany({where:{ownerId:owner.id,scope:'documents'},data:{availableAt:new Date('2001-01-01T00:00:00Z')}});
 const first=await claimAccountCleanupJob('lease-a-k',owner.id);
 assert.equal(first?.scope,'documents');
 assert.equal(first?.ownerId,owner.id);
 assert.equal(await claimAccountCleanupJob('lease-other-k',owner.id),null,
  'a current lease may not be stolen by a second worker');
 assert.equal(await completeAccountPrivateScope(first!,'outdated-lease-k'),0,
  'stale lease token cannot mark another attempt as successful');
 assert.equal(await completeAccountPrivateScope(first!,'lease-a-k'),1);
 assert.equal((await prisma.accountStorageCleanup.findUniqueOrThrow({where:{id:first!.id}})).status,'done');
 // Claim a new synthetic isolated private job, fail a provider pass and retry.
 // Its previous token can never overwrite a fresh worker's claim/checkpoint.
 await prisma.accountStorageCleanup.create({data:{
  id:'private-questions-k',ownerId:owner.id,scope:'questions',keys:['synthetic:questions:k'],
  availableAt:new Date('2001-01-01T00:00:00Z'),
 }});
 const oldAttempt=await claimAccountCleanupJob('lease-old-k',owner.id);
 assert.equal(oldAttempt?.id,'private-questions-k');
 const retryAt=new Date(Date.now()+60_000);
 assert.equal(await retryAccountStorageJob(oldAttempt!,'lease-old-k',retryAt,'CLEANUP_RETRY',true,true),1);
 let snapshot=await prisma.accountStorageCleanup.findUniqueOrThrow({where:{id:oldAttempt!.id}});
 assert.equal(snapshot.status,'pending');
 assert.equal(snapshot.attemptToken,null);
 assert.equal(snapshot.errorCode,'CLEANUP_RETRY');
 assert.equal(snapshot.attempts,1);
 assert.equal(await claimAccountCleanupJob('lease-too-early-k',owner.id),null,
  'retry backoff must prevent immediate provider re-execution');
 await prisma.accountStorageCleanup.update({where:{id:oldAttempt!.id},data:{
  availableAt:new Date('2001-01-01T00:00:00Z'),
 }});
 const fresh=await claimAccountCleanupJob('lease-fresh-k',owner.id);
 assert.equal(fresh?.id,oldAttempt?.id);
 assert.equal(await checkpointAccountCdnOperations(fresh!,'lease-old-k',['stale']),0);
 assert.equal(await checkpointAccountCdnOperations(fresh!,'lease-fresh-k',['accepted']),1);
 snapshot=await prisma.accountStorageCleanup.findUniqueOrThrow({where:{id:fresh!.id}});
 assert.deepEqual(snapshot.purgeOperations,['accepted']);
 assert.equal(await completeAccountPrivateScope(fresh!,'lease-old-k'),0);
 assert.equal(await completeAccountPrivateScope(fresh!,'lease-fresh-k'),1);
 snapshot=await prisma.accountStorageCleanup.findUniqueOrThrow({where:{id:fresh!.id}});
 assert.equal(snapshot.status,'done');
 assert.deepEqual(snapshot.keys,[]);
 console.log('ACCOUNT_CLEANUP_PHASE_K_REAL_PG_PASS: idempotent pre-delete owner snapshots, foreign scope denied, active leases exclusive, stale ack fenced, retry backoff, fresh token supersedes stale, user cascade survives, failed transaction rollback, Pacific/Auckland PostgreSQL');
}
main().then(async()=>prisma.$disconnect()).catch(async e=>{console.error(e);await prisma.$disconnect();process.exitCode=1;});
