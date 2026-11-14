/** Owner-fenced veterinary visit write/read persistence.
 * The API remains in Core: Zod validation, signed storage URLs, MIME checks,
 * upload and the gallery-storage deletion outbox callback are injected.
 * Database row locks and each matched outbox write MUST share one transaction.
 */
import {prisma,type Prisma} from '@gafus/prisma';
import {VET_VISIT_MAX_ATTACHMENTS} from '@gafus/types';

export type VetVisitDbTx=Prisma.TransactionClient;
const include={attachments:{orderBy:{createdAt:'asc' as const}}};
export type VetVisitDbRow=Prisma.PetVetVisitGetPayload<{include:{attachments:true}}>;
export type VetVisitDbFailure='pet'|'visit'|'attachment'|'limit'|'reservation';
export class VetVisitDbError extends Error {
 constructor(readonly kind:VetVisitDbFailure){super('VET_VISIT_DB_'+kind.toUpperCase());}
}
export type VetVisitOutboxEnqueue=(tx:VetVisitDbTx,ownerId:string,
 keys:(string|null|undefined)[],availableAt:Date,dedupeKey:string)=>Promise<unknown>;

export async function ownPetForVet(petId:string,ownerId:string):Promise<void>{
 const pet=await prisma.pet.findFirst({where:{id:petId,ownerId},select:{id:true}});
 if(!pet)throw new VetVisitDbError('pet');
}
export async function lockVetPetRowTx(tx:VetVisitDbTx,petId:string,ownerId:string){
 await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${ownerId} FOR UPDATE`;
 const pets=await tx.$queryRaw<{id:string}[]>`
  SELECT "id" FROM "Pet" WHERE "id"=${petId} AND "ownerId"=${ownerId} FOR UPDATE`;
 if(!pets.length)throw new VetVisitDbError('pet');
}
async function lockVetVisitTx(tx:VetVisitDbTx,petId:string,ownerId:string,id:string){
 await lockVetPetRowTx(tx,petId,ownerId);
 const rows=await tx.$queryRaw<{id:string}[]>`
  SELECT v."id" FROM "PetVetVisit" v
   JOIN "Pet" p ON p."id"=v."petId" AND p."ownerId"=v."ownerId"
  WHERE v."id"=${id} AND v."petId"=${petId} AND v."ownerId"=${ownerId} FOR UPDATE OF v`;
 if(!rows.length)throw new VetVisitDbError('visit');
}
export async function listOwnPetVetRows(petId:string,ownerId:string){
 await ownPetForVet(petId,ownerId);
 const rows=await prisma.petVetVisit.findMany({
  where:{petId,ownerId},include,orderBy:[{visitedOn:'desc'},{createdAt:'desc'}],
 });
 const candidates=rows.flatMap(row=>row.attachments
  .filter(a=>!a.previewKey&&a.mimeType.startsWith('image/'))
  .map(a=>`vet-preview:${a.id}`));
 const jobs=candidates.length?await prisma.galleryStorageJob.findMany({
  where:{dedupeKey:{in:candidates},status:{in:['pending','processing']}},
  select:{dedupeKey:true},
 }):[];
 return {rows,pending:new Set(jobs.map(job=>job.dedupeKey))};
}
export async function upsertOwnPetVetVisit(petId:string,ownerId:string,
 data:{visitedOn:Date;specialty:string;doctorName:string;clinic:string;
 diagnosis:string;conclusion:string;notes:string},id?:string,
):Promise<VetVisitDbRow>{
 return prisma.$transaction(async tx=>{
  if(id){
   await lockVetVisitTx(tx,petId,ownerId,id);
   return tx.petVetVisit.update({where:{id},data,include});
  }
  await lockVetPetRowTx(tx,petId,ownerId);
  return tx.petVetVisit.create({data:{...data,petId,ownerId},include});
 });
}
export async function removeOwnPetVetVisit(petId:string,ownerId:string,
 id:string,enqueue:VetVisitOutboxEnqueue){
 await prisma.$transaction(async tx=>{
  await lockVetVisitTx(tx,petId,ownerId,id);
  const attachments=await tx.petVetAttachment.findMany({where:{visitId:id}});
  await enqueue(tx,ownerId,attachments.flatMap(a=>[a.originalKey,a.previewKey]),
   new Date(),`vet-visit:${id}`);
  await tx.petVetVisit.delete({where:{id}});
 });
}
export async function requireOwnPetVetVisit(petId:string,ownerId:string,id:string){
 const row=await prisma.petVetVisit.findFirst({where:{id,petId,ownerId},select:{id:true}});
 if(!row)throw new VetVisitDbError('visit');
}
export async function reservePetVetAttachment(petId:string,ownerId:string,
 visitId:string,keys:{originalKey:string;previewKey:string|null},
 dedupeKey:string,enqueue:VetVisitOutboxEnqueue){
 await prisma.$transaction(async tx=>{
  await lockVetVisitTx(tx,petId,ownerId,visitId);
  if(await tx.petVetAttachment.count({where:{visitId}})>=VET_VISIT_MAX_ATTACHMENTS)
   throw new VetVisitDbError('limit');
  await enqueue(tx,ownerId,[keys.originalKey,keys.previewKey],
   new Date(Date.now()+10*60_000),dedupeKey);
 });
}
export async function commitPetVetAttachment(petId:string,ownerId:string,
 visitId:string,input:{id:string;keys:{originalKey:string;previewKey:string|null};
 dedupeKey:string;name:string;mimeType:string;sizeBytes:number},
){
 await prisma.$transaction(async tx=>{
  await lockVetVisitTx(tx,petId,ownerId,visitId);
  if(await tx.petVetAttachment.count({where:{visitId}})>=VET_VISIT_MAX_ATTACHMENTS)
   throw new VetVisitDbError('limit');
  const deleted=await tx.galleryStorageJob.deleteMany({
   where:{dedupeKey:input.dedupeKey,status:'pending',availableAt:{gt:new Date()}},
  });
  if(deleted.count!==1)throw new VetVisitDbError('reservation');
  await tx.petVetAttachment.create({data:{
   id:input.id,visitId,...input.keys,previewKey:input.keys.previewKey,
   name:input.name,mimeType:input.mimeType,sizeBytes:input.sizeBytes,
  }});
 });
}
export async function removeOwnPetVetAttachment(petId:string,ownerId:string,
 visitId:string,id:string,enqueue:VetVisitOutboxEnqueue){
 await prisma.$transaction(async tx=>{
  await lockVetVisitTx(tx,petId,ownerId,visitId);
  const attachment=await tx.petVetAttachment.findFirst({where:{id,visitId}});
  if(!attachment)throw new VetVisitDbError('attachment');
  await enqueue(tx,ownerId,[attachment.originalKey,attachment.previewKey],
   new Date(),`vet-attachment:${id}`);
  await tx.petVetAttachment.delete({where:{id}});
 });
}
export async function readOwnPetVetAttachment(petId:string,ownerId:string,
 visitId:string,id:string){
 const row=await prisma.petVetAttachment.findFirst({
  where:{id,visitId,visit:{petId,ownerId}},
 });
 if(!row)throw new VetVisitDbError('attachment');
 return row;
}
/** Used by the existing parent Pet.delete transaction. Do not create a
 * nested transaction or schedule cleanup after the cascading FK deletion. */
export async function enqueueOwnPetVetCleanupTx(tx:VetVisitDbTx,petId:string,
 ownerId:string,enqueue:VetVisitOutboxEnqueue){
 const rows=await tx.petVetAttachment.findMany({where:{visit:{petId,ownerId}}});
 for(const a of rows)await enqueue(tx,ownerId,[a.originalKey,a.previewKey],
  new Date(),`vet-pet:${petId}:${a.id}`);
}
