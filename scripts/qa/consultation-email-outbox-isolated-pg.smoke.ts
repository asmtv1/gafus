/** Disposable PostgreSQL: real consultation-email uniqueness/recovery with fake BullMQ ACK. */
import assert from "node:assert/strict";
import {prisma,ConsultationEmailType} from "@gafus/prisma";
import {enqueueConsultationEmail,resolveConsultationEmailRecipient} from "@gafus/notifications-server/consultation-email-outbox";
const url=new URL(process.env.DATABASE_URL??"http://invalid");
if(process.env.GAFUS_LOCAL_ISOLATED_API!=="1" || process.env.GAFUS_CONSULTATION_MAIL_REAL_PG!=="1" ||
 url.protocol!=="postgresql:" || url.hostname!=="127.0.0.1" ||
 url.pathname!=="/gafus_refactor_consultation_mail")throw Error("REFUSING_NON_DISPOSABLE_MAIL_DB");
async function main(){
 const [client,trainer,missingEmail]=await Promise.all([
  prisma.user.create({data:{username:"mail-client",password:"synthetic",email:"client@example.test"}}),
  prisma.user.create({data:{username:"mail-trainer",password:"synthetic",email:"trainer@example.test",role:"TRAINER"}}),
  prisma.user.create({data:{username:"mail-no-email",password:"synthetic"}}),
 ]);
 const cynologist=await prisma.consultationCynologist.create({data:{userId:trainer.id,isListed:true}});
 const slot=await prisma.consultationSlot.create({data:{cynologistId:cynologist.id,startAt:new Date("2028-01-20T12:00:00Z"),endAt:new Date("2028-01-20T12:30:00Z")}});
 const booking=await prisma.consultationBooking.create({data:{clientId:client.id,cynologistId:cynologist.id,slotId:slot.id,confirmationDeadlineAt:new Date("2028-01-01")}});
 const missingBooking=await prisma.consultationBooking.create({data:{clientId:missingEmail.id,cynologistId:cynologist.id,slotId:slot.id,confirmationDeadlineAt:new Date("2028-01-01")}});
 const clientType=ConsultationEmailType.CLIENT_BOOKING_RECEIVED;
 const trainerType=ConsultationEmailType.TRAINER_CONFIRM_REQUEST;
 assert.equal(await resolveConsultationEmailRecipient(booking.id,clientType),"client@example.test");
 assert.equal(await resolveConsultationEmailRecipient(booking.id,trainerType),"trainer@example.test");
 assert.equal(await resolveConsultationEmailRecipient("not-found",clientType),null);
 const attempts:string[]=[];
 const lostAck=async(id:string)=>{attempts.push(id);throw Error("SYNTHETIC_QUEUE_ACK_LOST");};
 await assert.rejects(enqueueConsultationEmail(booking.id,clientType,lostAck),/SYNTHETIC_QUEUE_ACK_LOST/);
 const saved=await prisma.consultationEmailLog.findUniqueOrThrow({where:{bookingId_type:{bookingId:booking.id,type:clientType}}});
 assert.equal(saved.status,"PENDING");assert.equal(saved.attempts,0);
 const recovered=async(id:string)=>{attempts.push(id);return undefined;};
 assert.equal(await enqueueConsultationEmail(booking.id,clientType,recovered),"duplicate");
 assert.deepEqual(attempts,[saved.id,saved.id],"replay must use existing queue identity");
 await prisma.consultationEmailLog.update({where:{id:saved.id},data:{attempts:1}});
 assert.equal(await enqueueConsultationEmail(booking.id,clientType,recovered),"duplicate");
 assert.equal(attempts.length,2,"attempted mail must not be queued again after ambiguous provider ACK");
 const concurrent=await Promise.all(Array.from({length:6},()=>enqueueConsultationEmail(booking.id,trainerType,recovered)));
 assert.equal(concurrent.filter(x=>x==="created").length,1);
 assert.equal(concurrent.filter(x=>x==="duplicate").length,5);
 assert.equal(await prisma.consultationEmailLog.count({where:{bookingId:booking.id,type:trainerType}}),1);
 const second=await prisma.consultationEmailLog.findUniqueOrThrow({where:{bookingId_type:{bookingId:booking.id,type:trainerType}}});
 assert.ok(attempts.filter(x=>x===second.id).length>=1);
 assert.equal(await enqueueConsultationEmail(missingBooking.id,clientType,recovered),"no_recipient");
 assert.equal(await prisma.consultationEmailLog.count({where:{bookingId:missingBooking.id}}),0);
 console.log("CONSULTATION_MAIL_REAL_PG_PASS: owner/trainer recipient separation, lost ACK recovery reuses same log id, attempted delivery not replayed, six competing creates exactly one receipt, missing recipient no log");
}
main().then(async()=>{await prisma.$disconnect();process.exit(0)}).catch(async(error)=>{console.error(error);await prisma.$disconnect();process.exit(1)});
