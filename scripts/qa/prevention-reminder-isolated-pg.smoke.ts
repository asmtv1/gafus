/** Real, disposable PostgreSQL test of the UTC due-day projection and
 * owner+pet+scheduled-date fenced acknowledgement. No actual pushes. */
import assert from "node:assert/strict";
import {prisma} from "@gafus/prisma";
import {readDuePetPreventionReminders,acknowledgePetPreventionQueuedTimes} from "@gafus/pets-server/prevention-reminder-rows";
import {checkAndSendPetPreventionReminders} from "../../packages/core/src/services/petPrevention/reminderDelivery.js";
const url=new URL(process.env.DATABASE_URL??"http://invalid");
if(process.env.GAFUS_LOCAL_ISOLATED_API!=="1"||process.env.GAFUS_PREVENTION_REMINDER_REAL_PG!=="1"||
 url.protocol!=="postgresql:"||url.hostname!=="127.0.0.1"||url.pathname!=="/gafus_refactor_prevention_reminder_h")
 throw Error("REFUSING_NON_DISPOSABLE_PREVENTION_REMINDER_PG");
const old=new Date("2020-01-01T00:00:00.000Z");
const future=new Date("2099-02-01T00:00:00.000Z");
async function main(){
 const zone=await prisma.$queryRaw<{zone:string}[]>`SELECT current_setting('TimeZone') AS zone`;
 assert.equal(zone[0]?.zone,"Pacific/Auckland");
 const [owner,other]=await Promise.all([
  prisma.user.create({data:{username:"prevention_owner_h",password:"fictional"}}),
  prisma.user.create({data:{username:"prevention_other_h",password:"fictional"}}),
 ]);
 const dog=await prisma.pet.create({data:{ownerId:owner.id,name:"Dog H",type:"DOG",breed:"Breed H",birthDate:new Date("2022-01-01")}});
 const past=await prisma.petPreventionEntry.create({data:{
  ownerId:owner.id,petId:dog.id,type:"VACCINATION",performedAt:old,reminderEnabled:true,
  reminderKind:"ON_DATE",reminderOnDate:old,remindAt:old,
  reminderTimes:["09:00","19:00"],sentTimesForRemindAt:[],productName:"Synthetic",notes:"Private",
 }});
 const disabled=await prisma.petPreventionEntry.create({data:{ownerId:owner.id,petId:dog.id,type:"DEWORMING",performedAt:old,reminderEnabled:false,remindAt:old}});
 const later=await prisma.petPreventionEntry.create({data:{ownerId:owner.id,petId:dog.id,type:"TICKS_FLEAS",performedAt:old,reminderEnabled:true,remindAt:future}});
 const due=await readDuePetPreventionReminders();
 assert.deepEqual(due.map(e=>e.id),[past.id]);
 assert.equal(due[0]?.ownerId,owner.id);
 assert.equal(due[0]?.petName,"Dog H");
 assert.equal(due[0]?.type,"VACCINATION");
 assert.ok(due[0]?.remindAt instanceof Date);
 await assert.rejects(acknowledgePetPreventionQueuedTimes({...due[0]!,ownerId:other.id},["09:00"],false),/Record to update not found|P2025/);
 await acknowledgePetPreventionQueuedTimes(due[0]!,["09:00"],false);
 let row=await prisma.petPreventionEntry.findUniqueOrThrow({where:{id:past.id}});
 assert.deepEqual(row.sentTimesForRemindAt,["09:00"]);
 assert.equal(row.lastNotifiedForRemindAt,null,"a partial acknowledgement must not complete the reminder day");
 await acknowledgePetPreventionQueuedTimes(due[0]!,["09:00","19:00"],true);
 row=await prisma.petPreventionEntry.findUniqueOrThrow({where:{id:past.id}});
 assert.deepEqual(row.sentTimesForRemindAt,["09:00","19:00"]);
 assert.ok(row.lastNotifiedForRemindAt,"both queued times may complete the reminder day");
 // A user reschedules while a slow queue operation is in flight. Old ack must
 // NEVER mark the new date as already sent.
 await prisma.petPreventionEntry.update({where:{id:past.id},data:{
  remindAt:future,reminderTimes:["11:00"],sentTimesForRemindAt:[],lastNotifiedForRemindAt:null,
 }});
 await assert.rejects(acknowledgePetPreventionQueuedTimes(due[0]!,["09:00"],true),/Record to update not found|P2025/);
 row=await prisma.petPreventionEntry.findUniqueOrThrow({where:{id:past.id}});
 assert.equal(row.remindAt?.toISOString(),future.toISOString());
 assert.deepEqual(row.sentTimesForRemindAt,[]);
 assert.equal(row.lastNotifiedForRemindAt,null);
 assert.deepEqual(await readDuePetPreventionReminders(),[]);
 assert.equal((await prisma.petPreventionEntry.findUniqueOrThrow({where:{id:disabled.id}})).reminderEnabled,false);
 assert.equal((await prisma.petPreventionEntry.findUniqueOrThrow({where:{id:later.id}})).remindAt?.toISOString(),future.toISOString());
 // The real Core use case now receives both SQL ports from its composition
 // root. An unqueued push is NOT an acknowledgement, even when the date is due.
 const integrated=await prisma.petPreventionEntry.create({data:{
   ownerId:owner.id,petId:dog.id,type:"VACCINATION",performedAt:old,reminderEnabled:true,
   reminderKind:"ON_DATE",reminderOnDate:old,remindAt:old,
   reminderTimes:["00:00"],sentTimesForRemindAt:[],productName:"Synthetic",notes:"Private",
 }});
 const queuedFor:string[]=[];
 const ports={
   readDue:readDuePetPreventionReminders,
   acknowledge:acknowledgePetPreventionQueuedTimes,
   enqueue:async ({userId}:{userId:string})=>{queuedFor.push(userId);return {queued:false};},
 };
 assert.deepEqual(await checkAndSendPetPreventionReminders(ports),{sent:0,errors:0});
 assert.deepEqual(queuedFor,[owner.id]);
 assert.equal((await prisma.petPreventionEntry.findUniqueOrThrow({where:{id:integrated.id}})).lastNotifiedForRemindAt,null);
 assert.deepEqual((await prisma.petPreventionEntry.findUniqueOrThrow({where:{id:integrated.id}})).sentTimesForRemindAt,[]);
 assert.deepEqual(await checkAndSendPetPreventionReminders({
   ...ports,enqueue:async ({userId})=>{queuedFor.push(userId);return {queued:true};},
 }),{sent:1,errors:0});
 const integratedAck=await prisma.petPreventionEntry.findUniqueOrThrow({where:{id:integrated.id}});
 assert.deepEqual(integratedAck.sentTimesForRemindAt,["00:00"]);
 assert.ok(integratedAck.lastNotifiedForRemindAt);
 assert.deepEqual(queuedFor,[owner.id,owner.id]);
 console.log("PREVENTION_PORT_COMPOSITION_REAL_PG_PASS: injected SQL projection/owner-fenced acknowledgement, no fake push ACK, only queued:true completes");
 console.log("PREVENTION_REMINDER_PHASE_H_REAL_PG_PASS: UTC due date under nonUTC server, owner and pet projection, disabled/future excluded, partial vs full ack, foreign owner denied, stale schedule ack fails closed");
}
main().then(async()=>prisma.$disconnect()).catch(async error=>{console.error(error);await prisma.$disconnect();process.exitCode=1;});
