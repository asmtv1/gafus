/** Consultation trainer catalogue persistence, without Core/import cycles.
 * Every admin listing mutation is serialized across API instances and checks
 * CURRENT admin/trainer roles while PostgreSQL row locks are held. The caller
 * still rejects non-admin roles before entering this port and maps result
 * codes to its established public ConsultationForbiddenError responses.
 */
import {Prisma,prisma} from '@gafus/prisma';

export async function readListedCynologistRows(){
 return prisma.consultationCynologist.findMany({
  where:{isListed:true,user:{role:'TRAINER'}},
  select:{id:true,userId:true,slotDurationMin:true,
   user:{select:{username:true,profile:{select:{fullName:true,avatarUrl:true,about:true}}}}},
  orderBy:{id:'asc'},
 });
}

export async function readAllTrainerCatalogRows(){
 return prisma.user.findMany({
  where:{role:'TRAINER'},
  select:{id:true,username:true,
   profile:{select:{fullName:true,avatarUrl:true,about:true}},
   consultationCynologist:{select:{id:true,isListed:true}}},
  orderBy:{username:'asc'},
 });
}

export async function isCurrentConsultationTrainer(userId:string):Promise<boolean>{
 if(!userId)return false;
 const row=await prisma.user.findUnique({where:{id:userId},select:{role:true}});
 return row?.role==='TRAINER';
}

export type SetListedCynologistsResult='OK'|'ADMIN_REVOKED'|'INVALID_TRAINERS';
export async function setListedCynologistsAtomic(
 adminId:string,trainerIds:readonly string[],
):Promise<SetListedCynologistsResult>{
 if(!adminId)return 'ADMIN_REVOKED';
 // Duplicates never matched the original findMany count; preserve rejection.
 if(new Set(trainerIds).size!==trainerIds.length||trainerIds.some(id=>!id))
  return 'INVALID_TRAINERS';
 return prisma.$transaction(async tx=>{
  // Prevent two simultaneous full-catalogue rewrites from interleaving.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('gafus:consultation:listed-cynologists',0))::text AS locked`;
  const admin=await tx.$queryRaw<{role:string}[]>`
   SELECT "role"::text AS role FROM "User" WHERE "id"=${adminId} FOR UPDATE
  `;
  if(admin.length!==1||admin[0]?.role!=='ADMIN')return 'ADMIN_REVOKED';
  if(trainerIds.length){
   // A promotion/demotion cannot race past validation. Lock rows in the
   // same stable id order for all API callers before touching catalogue.
   const trainers=await tx.$queryRaw<{id:string,role:string}[]>`
    SELECT "id", "role"::text AS role FROM "User"
    WHERE "id" IN (${Prisma.join([...trainerIds])}) ORDER BY "id" FOR UPDATE
   `;
   if(trainers.length!==trainerIds.length||trainers.some(x=>x.role!=='TRAINER'))
    return 'INVALID_TRAINERS';
  }
  await tx.consultationCynologist.updateMany({data:{isListed:false}});
  for(const userId of trainerIds){
   await tx.consultationCynologist.upsert({
    where:{userId},create:{userId,isListed:true},update:{isListed:true},
   });
  }
  return 'OK';
 },{maxWait:10_000,timeout:30_000});
}

/** A demoted trainer may not keep an already-existing schedule row. */
export async function ensureCurrentTrainerCynologistRow(userId:string):Promise<string|null>{
 if(!userId)return null;
 return prisma.$transaction(async tx=>{
  const rows=await tx.$queryRaw<{role:string}[]>`
   SELECT "role"::text AS role FROM "User" WHERE "id"=${userId} FOR UPDATE
  `;
  if(rows.length!==1||rows[0]?.role!=='TRAINER')return null;
  const row=await tx.consultationCynologist.upsert({
   where:{userId},create:{userId},update:{},select:{id:true},
  });
  return row.id;
 });
}
