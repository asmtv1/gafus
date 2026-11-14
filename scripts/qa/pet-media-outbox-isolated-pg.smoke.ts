/** Disposable owner-fenced pet media deletion acceptance.
 * Provider callback is intentionally fake; never contact S3/CDN or prod.
 */
import assert from 'node:assert/strict';
import {prisma} from '@gafus/prisma';
import {enqueuePetMediaDeletionIntent,consumePetMediaUploadReservation,
 createPetMediaDeletionSqlPort,runOnePetMediaDeletionSql,claimOnePetMediaDeletion}
 from '@gafus/pets-server/pet-media-deletion-sql';
const db=new URL(process.env.DATABASE_URL??'http://invalid');
if(process.env.GAFUS_LOCAL_ISOLATED_API!=='1'||process.env.GAFUS_PET_MEDIA_N_REAL_PG!=='1'||
 db.protocol!=='postgresql:'||db.hostname!=='127.0.0.1'||
 db.pathname!=='/gafus_refactor_pet_media_n')throw Error('REFUSING_NON_DISPOSABLE_PET_MEDIA_DB');
async function main(){
 const z=await prisma.$queryRaw<{zone:string}[]>`SELECT current_setting('TimeZone') AS zone`;
 assert.equal(z[0]?.zone,'Pacific/Auckland');
 const [owner,foreign]=await Promise.all([
  prisma.user.create({data:{username:'pet_media_owner_n',password:'synthetic'}}),
  prisma.user.create({data:{username:'pet_media_foreign_n',password:'synthetic'}}),
 ]);
 const pet=await prisma.pet.create({data:{ownerId:owner.id,name:'Synthetic pet N',type:'DOG',
  breed:'Synthetic',birthDate:new Date('2023-01-01T00:00:00Z')}});
 const foreignPet=await prisma.pet.create({data:{ownerId:foreign.id,name:'Foreign pet N',
  type:'DOG',breed:'Synthetic',birthDate:new Date('2023-01-01T00:00:00Z')}});
 const locator=`cloudru:documents:documents/uploads/users/${owner.id}/pets/${pet.id}/documents/dog-n.pdf`;
 const wrong=`cloudru:documents:documents/uploads/users/${foreign.id}/pets/${foreignPet.id}/documents/foreign.pdf`;
 const providerCalls:{provider:string,locator:string}[]=[];
 const provider=async(provider:string,locator:string)=>{providerCalls.push({provider,locator});};
 const used=await prisma.petDocument.create({data:{ownerId:owner.id,petId:pet.id,
  name:'Synthetic in-use document',mimeType:'application/pdf',sizeBytes:200,url:locator}});
 const past=new Date('2001-01-01T00:00:00Z');
 // No outbox row may escape a rolled-back owner write transaction.
 await assert.rejects(prisma.$transaction(async tx=>{
  await enqueuePetMediaDeletionIntent(tx,owner.id,pet.id,locator,'document-delete',past);
  throw Error('SYNTHETIC_PET_DELETE_TX_ABORT');
 }),/SYNTHETIC_PET_DELETE_TX_ABORT/);
 assert.equal(await prisma.petMediaDeletionIntent.count({where:{ownerId:owner.id}}),0);
 // Candidate reservation protects the PUT window. Consumption must use the
 // exact same caller tx as an accepted document or Pet.photoUrl mutation.
 const candidate=`cloudru:documents:documents/uploads/users/${owner.id}/pets/${pet.id}/documents/candidate-n.pdf`;
 await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${owner.id} FOR UPDATE`;
  await enqueuePetMediaDeletionIntent(tx,owner.id,pet.id,candidate,'candidate',new Date('2099-01-01T00:00:00Z'));
 });
 await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${owner.id} FOR UPDATE`;
  await consumePetMediaUploadReservation(tx,owner.id,candidate);
  await tx.petDocument.create({data:{ownerId:owner.id,petId:pet.id,
   name:'Accepted candidate',mimeType:'application/pdf',sizeBytes:100,url:candidate}});
 });
 assert.equal(await prisma.petMediaDeletionIntent.count({where:{ownerId:owner.id}}),0);
 await assert.rejects(prisma.$transaction(tx=>consumePetMediaUploadReservation(tx,owner.id,candidate)),
  /PET_MEDIA_CANDIDATE_RESERVATION_UNSAFE/);
 await assert.rejects(prisma.$transaction(tx=>enqueuePetMediaDeletionIntent(tx,
  owner.id,pet.id,wrong,'document-delete',past)));
 assert.equal(await prisma.petMediaDeletionIntent.count({where:{ownerId:owner.id}}),0);
 // Eight concurrent owner-row-serialized retry creates may only create one
 // durable outbox row for this content-addressed owner/locator.
 await Promise.all(Array.from({length:8},()=>prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${owner.id} FOR UPDATE`;
  await enqueuePetMediaDeletionIntent(tx,owner.id,pet.id,locator,'document-delete',past);
 })));
 assert.equal(await prisma.petMediaDeletionIntent.count({where:{ownerId:owner.id}}),1);
 // Physical deletion is denied while even one PetDocument points at the
 // locator, regardless of what event produced the queued cleanup request.
 assert.equal(await runOnePetMediaDeletionSql(prisma as never,provider),'protected');
 assert.deepEqual(providerCalls,[]);
 let row=await prisma.petMediaDeletionIntent.findFirstOrThrow({where:{ownerId:owner.id}});
 assert.equal(row.status,'pending');assert.equal(row.attemptToken,null);
 assert.equal(row.errorCode,'RETRY_REQUIRED');
 // New lease after user removed the reference. One worker may claim the row;
 // overlapping workers must see SKIP LOCKED / leased and never delete twice.
 await prisma.petDocument.delete({where:{id:used.id}});
 await prisma.petMediaDeletionIntent.update({where:{id:row.id},data:{availableAt:past}});
 const results=await Promise.all(Array.from({length:8},()=>runOnePetMediaDeletionSql(prisma as never,provider)));
 assert.equal(results.filter(x=>x==='done').length,1);
 assert.equal(results.filter(x=>x==='empty').length,7);
 assert.deepEqual(providerCalls,[{provider:'cloudru-documents',locator}]);
 row=await prisma.petMediaDeletionIntent.findUniqueOrThrow({where:{id:row.id}});
 assert.equal(row.status,'done');assert.equal(row.attemptToken,null);assert.equal(row.leaseUntil,null);
 assert.equal(row.attempts,2);assert.equal(row.errorCode,null);
 // A stale token cannot commit a success into a done row, even if another
 // provider completion was already observed. Owner guard remains mandatory.
 const port=createPetMediaDeletionSqlPort(prisma as never,provider);
 await assert.rejects(port.hasActiveReference(locator),/PET_MEDIA_OWNER_FENCE_REQUIRED/);
 assert.equal(await port.withOwnerFence(owner.id,()=>
  port.complete(row.id,'00000000-0000-4000-8000-000000000000')),false);
 assert.equal(providerCalls.length,1);
 assert.equal(await prisma.petDocument.count({where:{ownerId:foreign.id}}),0);
 assert.equal(await claimOnePetMediaDeletion(prisma as never),null);
 console.log('PET_MEDIA_PHASE_N_REAL_PG_PASS: owner-locked dedupe 8 concurrent enqueues, strict rollback, candidate consumption same tx, foreign locator denied, protected live document no provider, 8 competing SKIP LOCKED workers exactly one fake provider invocation, stale CAS denied; nonUTC DB');
}
main().then(async()=>prisma.$disconnect()).catch(async e=>{console.error(e);await prisma.$disconnect();process.exitCode=1;});
