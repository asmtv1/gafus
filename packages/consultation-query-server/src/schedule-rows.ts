/** DB-only consultation availability persistence. Public DTO mapping, Zod
 * validation, localized HTTP errors and the slot-rebuild policy stay in Core.
 * Every edit, exception and materialized slot rebuild shares one transaction
 * and the canonical consultation-slots advisory lock.
 */
import {Prisma,prisma,type Prisma as PrismaTypes} from '@gafus/prisma';

export type ConsultationScheduleDbTx=PrismaTypes.TransactionClient;
export type ConsultationScheduleRule={
 weekday:number;startTime:string;endTime:string;isWorkingDay:boolean;
};
export type ConsultationScheduleChange=
 | {kind:'set-rules';rules:readonly ConsultationScheduleRule[]}
 | {kind:'upsert-day-off';date:Date;reason:string|null}
 | {kind:'remove-day-off';id:string}
 | {kind:'add-exception';startAt:Date;endAt:Date;reason:string|null}
 | {kind:'remove-exception';id:string};

export class ScheduleRowNotFound extends Error {
 constructor(readonly field:'trainer'|'profile'|'day-off'|'exception'){
  super('CONSULTATION_SCHEDULE_ROW_NOT_FOUND');
 }
}

export async function readTrainerSchedule(cynologistId:string){
 return prisma.consultationCynologist.findUnique({
  where:{id:cynologistId},include:{availabilityRules:true,dayOffs:true,slotExceptions:true},
 });
}

export async function readCynologistDayOffDates(userId:string,fromUtc:Date,toUtc:Date):Promise<Date[]|null>{
 const cyn=await prisma.consultationCynologist.findUnique({
  where:{userId},select:{id:true},
 });
 if(!cyn)return null;
 const rows=await prisma.consultationDayOff.findMany({
  where:{cynologistId:cyn.id,date:{gte:fromUtc,lte:toUtc}},
  select:{date:true},orderBy:{date:'asc'},
 });
 return rows.map(row=>row.date);
}

export async function hasTrainerScheduleOwnership(trainerUserId:string,cynologistId:string){
 const row=await prisma.consultationCynologist.findFirst({
  where:{id:cynologistId,userId:trainerUserId},select:{id:true},
 });
 return Boolean(row);
}

export async function applyTrainerScheduleChange(
 trainerUserId:string,cynologistId:string,change:ConsultationScheduleChange,
 rebuild:(tx:ConsultationScheduleDbTx,cynId:string,horizonDays:number)=>Promise<void>,
):Promise<void>{
 if(!trainerUserId||!cynologistId)throw new ScheduleRowNotFound('trainer');
 await prisma.$transaction(async tx=>{
  // Canonical lock also taken by reader-triggered rebuilds. As in the
  // previous Core implementation, it precedes all schedule edits.
  await tx.$executeRaw(Prisma.sql`
   SELECT pg_advisory_xact_lock(hashtextextended(${`consultation-slots:${cynologistId}`},0))
  `);
  // Confirm the user is STILL a trainer in the same transaction as the
  // mutation, preventing a stale client role from editing after revocation.
  const users=await tx.$queryRaw<{role:string}[]>`
   SELECT "role"::text AS role FROM "User" WHERE "id"=${trainerUserId} FOR NO KEY UPDATE
  `;
  if(users.length!==1||users[0]?.role!=='TRAINER')throw new ScheduleRowNotFound('trainer');
  const cyn=await tx.consultationCynologist.findUnique({
   where:{id:cynologistId},select:{userId:true,slotHorizonDays:true},
  });
  if(!cyn||cyn.userId!==trainerUserId)throw new ScheduleRowNotFound('profile');
  switch(change.kind){
   case 'set-rules':
    await tx.consultationAvailabilityRule.deleteMany({where:{cynologistId}});
    for(const rule of change.rules){
     await tx.consultationAvailabilityRule.create({data:{cynologistId,
      weekday:rule.weekday,startTime:rule.startTime,endTime:rule.endTime,
      isWorkingDay:rule.isWorkingDay,
     }});
    }
    break;
   case 'upsert-day-off':{
    const found=await tx.consultationDayOff.findFirst({
     where:{cynologistId,date:change.date},
    });
    if(found)await tx.consultationDayOff.update({where:{id:found.id},data:{reason:change.reason}});
    else await tx.consultationDayOff.create({data:{cynologistId,date:change.date,reason:change.reason}});
    break;
   }
   case 'remove-day-off':{
    const found=await tx.consultationDayOff.findFirst({where:{id:change.id,cynologistId}});
    if(!found)throw new ScheduleRowNotFound('day-off');
    await tx.consultationDayOff.delete({where:{id:found.id}});
    break;
   }
   case 'add-exception':
    await tx.consultationSlotException.create({data:{cynologistId,
     startAt:change.startAt,endAt:change.endAt,reason:change.reason}});
    break;
   case 'remove-exception':{
    const found=await tx.consultationSlotException.findFirst({where:{id:change.id,cynologistId}});
    if(!found)throw new ScheduleRowNotFound('exception');
    await tx.consultationSlotException.delete({where:{id:found.id}});
    break;
   }
  }
  // MUST remain in the same tx: an exception/rule must not commit without
  // matching materialized slots, including when the provider rebuild fails.
  await rebuild(tx,cynologistId,cyn.slotHorizonDays);
 },{maxWait:10_000,timeout:120_000});
}
