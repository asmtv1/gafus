/** Disposable owner-scoped consultation booking restriction and user-row lock QA. */
import assert from "node:assert/strict";
import {setTimeout as sleep} from "node:timers/promises";
import {prisma} from "@gafus/prisma";
import {readClientConsultationRestrictions,lockConsultationClient} from "@gafus/consultation-query-server/booking-eligibility";
import {getConsultationBookingEligibility} from "../../apps/api/src/modules/consultations/composition/booking-eligibility.js";
const db=new URL(process.env.DATABASE_URL??"http://invalid");
if(process.env.GAFUS_LOCAL_ISOLATED_API!=="1" || process.env.GAFUS_CONSULT_ELIGIBILITY_REAL_PG!=="1" ||
  db.protocol!=="postgresql:" || db.hostname!=="127.0.0.1" ||
  db.pathname!=="/gafus_refactor_consult_eligibility")throw Error("REFUSING_NON_DISPOSABLE_CONSULTATION_DB");
async function main(){
 const [client,outsider,trainer]=await Promise.all([
  prisma.user.create({data:{username:"consult_read_client",password:"synthetic-disposable"}}),
  prisma.user.create({data:{username:"consult_read_other",password:"synthetic-disposable"}}),
  prisma.user.create({data:{username:"consult_read_trainer",password:"synthetic-disposable",role:"TRAINER"}}),
 ]);
 const cynologist=await prisma.consultationCynologist.create({data:{userId:trainer.id,isListed:true}});
 const slot=await prisma.consultationSlot.create({data:{cynologistId:cynologist.id,startAt:new Date("2028-01-20T12:00:00Z"),endAt:new Date("2028-01-20T12:30:00Z")}});
 const now=new Date("2026-11-07T12:00:00Z");
 assert.equal((await getConsultationBookingEligibility(client.id,undefined,now)).canBook,true);
 assert.equal((await getConsultationBookingEligibility(outsider.id,undefined,now)).canBook,true);
 const booking=await prisma.consultationBooking.create({data:{clientId:client.id,cynologistId:cynologist.id,slotId:slot.id,status:"PENDING_TRAINER_CONFIRMATION",confirmationDeadlineAt:new Date("2028-01-01")}});
 assert.deepEqual(await readClientConsultationRestrictions(client.id),{hasActiveBooking:true,lastCompletedAt:null});
 assert.equal((await getConsultationBookingEligibility(client.id,undefined,now)).reason,"ACTIVE_BOOKING");
 assert.equal((await getConsultationBookingEligibility(outsider.id,undefined,now)).canBook,true);
 const completedAt=new Date("2026-11-06T12:00:00Z");
 await prisma.consultationBooking.update({where:{id:booking.id},data:{status:"COMPLETED",completedAt}});
 const cooldown=await getConsultationBookingEligibility(client.id,undefined,now);
 assert.equal(cooldown.reason,"WEEKLY_COOLDOWN");
 assert.equal(cooldown.nextBookingAt,new Date(completedAt.getTime()+7*24*60*60*1000).toISOString());
 assert.equal((await getConsultationBookingEligibility(outsider.id,undefined,now)).canBook,true);
 assert.equal((await getConsultationBookingEligibility(client.id,undefined,new Date(cooldown.nextBookingAt!))).canBook,true);
 await prisma.consultationBooking.update({where:{id:booking.id},data:{completedAt:null}});
 assert.deepEqual(await readClientConsultationRestrictions(client.id),{hasActiveBooking:false,lastCompletedAt:null},"legacy completion cannot start cooldown");
 await prisma.consultationBooking.update({where:{id:booking.id},data:{status:"NO_SHOW"}});
 assert.equal((await getConsultationBookingEligibility(client.id,undefined,now)).canBook,true);
 // The booking and completion workflow must share the same user-row lock.
 let firstEntered!:()=>void;const started=new Promise<void>(resolve=>{firstEntered=resolve});
 const first=prisma.$transaction(async tx=>{
  await lockConsultationClient(tx,client.id);firstEntered();await sleep(155);
  return "first";
 });
 await started;let secondEntered=false;
 const second=prisma.$transaction(async tx=>{
  await lockConsultationClient(tx,client.id);secondEntered=true;return "second";
 });
 await sleep(30);assert.equal(secondEntered,false,"actor booking lock cannot be bypassed across transactions");
 assert.equal(await first,"first");assert.equal(await second,"second");
 assert.equal(secondEntered,true);
 await assert.rejects(readClientConsultationRestrictions(""),/CONSULTATION_CLIENT_ID_REQUIRED/);
 console.log("CONSULTATION_ELIGIBILITY_REAL_PG_PASS: active booking cross-trainer ACL, owner-only 168h cooldown, zero cooldown from null/NO_SHOW, serialized user-row lock");
}
main().then(async()=>prisma.$disconnect()).catch(async(error)=>{console.error(error);await prisma.$disconnect();process.exitCode=1;});
