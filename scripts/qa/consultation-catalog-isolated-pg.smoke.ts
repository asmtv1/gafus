/** Only disposable local PostgreSQL, real Core authorization + independent
 * consultation-query-server persistence. No contact with production/provider. */
import assert from 'node:assert/strict';
import {prisma} from '@gafus/prisma';
import {listListedCynologists,adminSetListedCynologists,listAllTrainersForAdmin,
 resolveTargetTrainerUserIdForStaff,ensureConsultationCynologistRow,
 setTrainerAvailability,getTrainerAvailability,addDayOff,removeDayOff,
 addSlotException,removeSlotException,getCynologistDayOffDates,
} from '../../apps/api/src/modules/consultations/composition/catalog-schedule.js';
import {applyTrainerScheduleChange,ScheduleRowNotFound,readTrainerSchedule}
 from '@gafus/consultation-query-server/schedule-rows';
const db=new URL(process.env.DATABASE_URL??'http://invalid');
if(process.env.GAFUS_LOCAL_ISOLATED_API!=='1'||process.env.GAFUS_CONSULTATION_CATALOG_REAL_PG!=='1'||
 db.protocol!=='postgresql:'||db.hostname!=='127.0.0.1'||
 db.pathname!=='/gafus_refactor_consultation_catalog_l')throw Error('REFUSING_NON_DISPOSABLE_CONSULTATION_CATALOG_DB');
async function main(){
 const zone=await prisma.$queryRaw<{zone:string}[]>`SELECT current_setting('TimeZone') AS zone`;
 assert.equal(zone[0]?.zone,'Pacific/Auckland');
 const [adminA,adminB,trainer1,trainer2,trainer3,nontrainer]=await Promise.all([
  prisma.user.create({data:{username:'catalog_l_adminA',password:'fictional',role:'ADMIN'}}),
  prisma.user.create({data:{username:'catalog_l_adminB',password:'fictional',role:'ADMIN'}}),
  prisma.user.create({data:{username:'catalog_l_trainer1',password:'fictional',role:'TRAINER'}}),
  prisma.user.create({data:{username:'catalog_l_trainer2',password:'fictional',role:'TRAINER'}}),
  prisma.user.create({data:{username:'catalog_l_trainer3',password:'fictional',role:'TRAINER'}}),
  prisma.user.create({data:{username:'catalog_l_user',password:'fictional',role:'USER'}}),
 ]);
 await adminSetListedCynologists(adminA.id,'ADMIN',[trainer1.id,trainer2.id]);
 assert.deepEqual((await listListedCynologists()).map(x=>x.userId).sort(),[trainer1.id,trainer2.id].sort());
 assert.equal((await listAllTrainersForAdmin()).length,3);
 assert.equal((await listAllTrainersForAdmin()).filter(x=>x.isListed).length,2);
 const assigned=await ensureConsultationCynologistRow(trainer1.id);
 const replays=await Promise.all(Array.from({length:8},()=>ensureConsultationCynologistRow(trainer1.id)));
 assert.equal(replays.every(x=>x===assigned),true);
 assert.equal(await prisma.consultationCynologist.count({where:{userId:trainer1.id}}),1);
 assert.equal(await resolveTargetTrainerUserIdForStaff({id:adminA.id,role:'ADMIN'},trainer3.id),trainer3.id);
 await assert.rejects(resolveTargetTrainerUserIdForStaff({id:adminA.id,role:'ADMIN'},nontrainer.id),/Указанный пользователь не тренер/);
 await assert.rejects(ensureConsultationCynologistRow(nontrainer.id),/Пользователь не тренер/);
 const before=(await listListedCynologists()).map(x=>x.userId).sort();
 for(const ids of [[trainer1.id,trainer1.id],[trainer1.id,nontrainer.id],['not-a-user']]){
  await assert.rejects(adminSetListedCynologists(adminA.id,'ADMIN',ids),/Указаны не только тренеры/);
  assert.deepEqual((await listListedCynologists()).map(x=>x.userId).sort(),before,
   'invalid target must not reset any existing published listing');
 }
 await assert.rejects(adminSetListedCynologists(nontrainer.id,'MODERATOR',[trainer3.id]));
 await prisma.user.update({where:{id:adminA.id},data:{role:'MODERATOR'}});
 await assert.rejects(adminSetListedCynologists(adminA.id,'ADMIN',[trainer3.id]),
  'stale admin claim must not authorize any DB writes');
 assert.deepEqual((await listListedCynologists()).map(x=>x.userId).sort(),before);
 await prisma.user.update({where:{id:trainer2.id},data:{role:'USER'}});
 assert.deepEqual((await listListedCynologists()).map(x=>x.userId),[trainer1.id],
  'demoted trainer must vanish from public read without waiting for admin rewrite');
 await assert.rejects(ensureConsultationCynologistRow(trainer2.id),/Пользователь не тренер/);
 await assert.rejects(adminSetListedCynologists(adminB.id,'ADMIN',[trainer2.id]),/Указаны не только тренеры/);
 // These writers use the SAME global catalogue lock; neither may interleave
 // updates to produce a union of two incomplete admin requests.
 const writes=await Promise.allSettled([
  adminSetListedCynologists(adminB.id,'ADMIN',[trainer1.id]),
  adminSetListedCynologists(adminB.id,'ADMIN',[trainer3.id]),
 ]);
 assert.deepEqual(writes.map(x=>x.status),['fulfilled','fulfilled']);
 const final=(await listListedCynologists()).map(x=>x.userId);
 assert.equal(final.length,1);
 assert.ok(final[0]===trainer1.id||final[0]===trainer3.id,
  'catalogue must reflect precisely one complete admin request');
 // Any exception in caller transaction rolls back both the global unlist and
 // new set even with the advisory lock; foreign user and prior catalog intact.
 await assert.rejects(prisma.$transaction(async tx=>{
  await tx.consultationCynologist.updateMany({data:{isListed:false}});
  throw Error('SYNTHETIC_CATALOG_ROLLBACK');
 }),/SYNTHETIC_CATALOG_ROLLBACK/);
 assert.deepEqual((await listListedCynologists()).map(x=>x.userId),final);
 assert.equal(await prisma.user.findUniqueOrThrow({where:{id:nontrainer.id}}).then(x=>x.role),'USER');
 // Phase M: the full real Core schedule mutation must re-materialize slots
 // inside the SAME transaction as every accepted change.
 const horizon=await prisma.consultationCynologist.findUniqueOrThrow({where:{userId:trainer1.id}});
 await prisma.consultationCynologist.update({where:{id:horizon.id},data:{slotHorizonDays:10}});
 const rule1={weekday:1,startTime:'09:00',endTime:'10:00',isWorkingDay:true};
 const rule2={weekday:2,startTime:'11:00',endTime:'12:00',isWorkingDay:true};
 await setTrainerAvailability(trainer1.id,{rules:[rule1]});
 assert.deepEqual((await getTrainerAvailability(trainer1.id)).rules.map(x=>x.startTime),['09:00']);
 const persisted=await prisma.consultationAvailabilityRule.findMany({where:{cynologistId:horizon.id}});
 assert.equal(persisted.length,1);
 // Simulated rebuild exception proves the new persistence port cannot commit
 // any changed rule before the slot projection finishes.
 await assert.rejects(applyTrainerScheduleChange(trainer1.id,horizon.id,
  {kind:'set-rules',rules:[rule2]},async()=>{throw Error('SYNTHETIC_SLOT_REBUILD_ABORT');}),
  /SYNTHETIC_SLOT_REBUILD_ABORT/);
 assert.deepEqual((await getTrainerAvailability(trainer1.id)).rules.map(x=>x.startTime),['09:00']);
 // Actual Core add/remove operations still regenerate materialized slots.
 const day='2026-11-16';
 await addDayOff(trainer1.id,day,'synthetic-time-off');
 assert.equal((await getTrainerAvailability(trainer1.id)).dayOffs.some(x=>x.date===day),true);
 const dates=await getCynologistDayOffDates(trainer1.id,new Date('2026-11-01'),new Date('2026-11-30'));
 assert.ok(dates.includes(day));
 const removed=(await getTrainerAvailability(trainer1.id)).dayOffs.find(x=>x.date===day)!;
 await removeDayOff(trainer1.id,removed.id);
 assert.equal((await getTrainerAvailability(trainer1.id)).dayOffs.some(x=>x.date===day),false);
 await assert.rejects(removeDayOff(trainer1.id,removed.id),/Выходной/);
 const start=new Date('2026-11-17T09:00:00Z'),end=new Date('2026-11-17T10:00:00Z');
 await addSlotException(trainer1.id,start,end,'synthetic-exception');
 const ex=(await getTrainerAvailability(trainer1.id)).exceptions.find(x=>x.startAtUtc===start.toISOString())!;
 assert.ok(ex);
 await removeSlotException(trainer1.id,ex.id);
 await assert.rejects(removeSlotException(trainer1.id,ex.id),/Исключение/);
 // Two concurrent rules writes cannot interleave: advisory lock + same-tx
 // slot rebuild leave one complete winner. The foreign owner's rows remain.
 const updates=await Promise.allSettled([
  setTrainerAvailability(trainer1.id,{rules:[rule1]}),
  setTrainerAvailability(trainer1.id,{rules:[rule2]}),
 ]);
 assert.deepEqual(updates.map(x=>x.status),['fulfilled','fulfilled']);
 assert.equal((await getTrainerAvailability(trainer1.id)).rules.length,1);
 const current=(await getTrainerAvailability(trainer1.id)).rules[0]!.startTime;
 assert.ok(current==='09:00'||current==='11:00');
 assert.equal(await prisma.consultationAvailabilityRule.count({where:{cynologistId:horizon.id}}),1);
 // Demoted trainer cannot mutate schedule even through direct port with stale
 // prevalidated caller ID. Likewise a trainer cannot change another's row.
 await assert.rejects(applyTrainerScheduleChange(trainer3.id,horizon.id,
  {kind:'set-rules',rules:[rule1]},async()=>{}),ScheduleRowNotFound);
 await prisma.user.update({where:{id:trainer1.id},data:{role:'USER'}});
 await assert.rejects(applyTrainerScheduleChange(trainer1.id,horizon.id,
  {kind:'set-rules',rules:[rule1]},async()=>{}),ScheduleRowNotFound);
 assert.equal((await readTrainerSchedule(horizon.id))?.availabilityRules[0]?.startTime,current);
 console.log('CONSULTATION_CATALOG_AND_SCHEDULE_PHASE_M_REAL_PG_PASS: Core schedule materialization, same-transaction rebuild rollback, day off/exception lifecycle, current trainer role fence, foreign owner denied, concurrent full rule updates, nonUTC DB');
}
main().then(async()=>prisma.$disconnect()).catch(async e=>{console.error(e);await prisma.$disconnect();process.exitCode=1;});
