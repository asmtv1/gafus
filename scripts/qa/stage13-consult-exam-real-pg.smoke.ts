/** Actual domain writes with disposable PG and Redis; external push is explicitly refused. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@gafus/prisma";
import { createConsultationBookingService, enqueueConsultationEmail } from "@gafus/consultation-write-server/service";
import { getAppSubscriptionAccess, getCynologistEntitlements } from "@gafus/subscription-read-server";
import { SubscriptionRequiredError } from "@gafus/core/services/appSubscription";
import {
  ConsultationBookingRestrictedError, ConsultationBookingNotIncludedError, ConsultationForbiddenError,
  ConsultationNotFoundError, ConsultationSlotTakenError, ConsultationIdempotencyKeyConflictError,
} from "@gafus/core/services/consultation/errors";
import { submitExamResult, getExamResult } from "../../packages/exam-server/src/examService.js";
const u=new URL(process.env.DATABASE_URL??"http://invalid"), r=new URL(process.env.REDIS_URL??"http://invalid");
if(process.env.GAFUS_STAGE13_CONSULT_EXAM!=="1" || u.protocol!=="postgresql:" || u.hostname!=="127.0.0.1" ||
  u.username!=="qacourse" || u.pathname!=="/gafus_stage13_consult_exam" || Number(u.port)<=10000 ||
  r.protocol!=="redis:" || r.hostname!=="127.0.0.1" || Number(r.port)<=10000) throw Error("REFUSING_NON_DISPOSABLE_CONSULT_EXAM");
const {bookSlot,cancelBookingByUser}=createConsultationBookingService({
  enqueueConsultationEmail, getAppSubscriptionAccess, getCynologistEntitlements, SubscriptionRequiredError,
  ConsultationBookingRestrictedError, ConsultationBookingNotIncludedError, ConsultationForbiddenError,
  ConsultationNotFoundError, ConsultationSlotTakenError, ConsultationIdempotencyKeyConflictError,
  sendImmediatePushNotification:async()=>({success:false,error:"QA_EXTERNAL_PUSH_NOT_SENT"}),
});
async function main() {
  const [a,b,trainer]=await Promise.all([
    prisma.user.create({data:{username:"consult_exam_a",email:"consult_exam_a@qa.invalid",password:"synthetic",registrationPending:false}}),
    prisma.user.create({data:{username:"consult_exam_b",email:"consult_exam_b@qa.invalid",password:"synthetic",registrationPending:false}}),
    prisma.user.create({data:{username:"consult_exam_trainer",email:"consult_exam_trainer@qa.invalid",password:"synthetic",role:"TRAINER",registrationPending:false}}),
  ]);
  let failed=false;
  const run=async(name:string,fn:()=>Promise<void>)=>{try{await fn();console.log("STAGE13_PASS",name);}catch(error){failed=true;console.error("STAGE13_FAIL",name,error);}};
  await run("consultation-slot-race-lost-ack-cancel-replay",async()=>{
    const cyn=await prisma.consultationCynologist.create({data:{userId:trainer.id,isListed:true}});
    const startAt=new Date(Date.now()+3*86400000);
    const slot=await prisma.consultationSlot.create({data:{cynologistId:cyn.id,startAt,endAt:new Date(+startAt+1800000)}});
    const base={slotId:slot.id,clientOwnerName:"Synthetic",clientPhone:"+79990000000",petName:"Synthetic",petGender:"MALE" as const,petAge:"5",petBreed:"Mixed",clientProblem:"Synthetic fixture",clientSelfHelpAttempt:"Synthetic fixture"};
    const ia={...base,idempotencyKey:randomUUID()},ib={...base,idempotencyKey:randomUUID()};
    const results=await Promise.allSettled([bookSlot(a.id,ia),bookSlot(b.id,ib)]);
    assert.equal(results.filter(x=>x.status==="fulfilled").length,1, JSON.stringify(results.map(x=>x.status==="rejected"?{status:x.status,name:x.reason?.name,message:x.reason?.message,code:x.reason?.code}:{status:x.status})));
    const winner=results[0].status==="fulfilled"?a:b, loser=winner.id===a.id?b:a;
    const intent=winner.id===a.id?ia:ib;
    const original=await prisma.consultationBooking.findFirstOrThrow({where:{slotId:slot.id}});
    assert.equal(original.clientId,winner.id);
    // Discard the first returned DTO (lost response); re-read with same intent.
    const replay=await bookSlot(winner.id,intent);
    assert.equal(replay.kind,"idempotent_replay");
    assert.equal(replay.booking.id,original.id);
    assert.equal(await prisma.consultationBooking.count({where:{slotId:slot.id}}),1);
    assert.equal(await prisma.consultationBookingIdempotency.count({where:{bookingId:original.id}}),1);
    await assert.rejects(cancelBookingByUser(loser.id,original.id));
    await cancelBookingByUser(winner.id,original.id);
    await assert.rejects(cancelBookingByUser(winner.id,original.id));
    assert.equal((await prisma.consultationSlot.findUniqueOrThrow({where:{id:slot.id}})).status,"FREE");
    assert.equal((await bookSlot(winner.id,intent)).booking.status,"CANCELLED_BY_USER");
    assert.equal(await prisma.consultationEmailLog.count({where:{bookingId:original.id,type:"TRAINER_BOOKING_CANCELLED_BY_USER"}}),1);
  });
  await run("exam-submit-replay-and-other-owner-denied",async()=>{
    const c=await prisma.course.create({data:{name:"Synthetic exam",type:"stage13_exam",duration:"7",logoImg:"",trainingLevel:"BEGINNER",authorId:trainer.id}});
    const day=await prisma.trainingDay.create({data:{title:"Synthetic day",authorId:trainer.id}});
    const dc=await prisma.dayOnCourse.create({data:{courseId:c.id,dayId:day.id,order:1}});
    const step=await prisma.step.create({data:{title:"Synthetic exam",type:"EXAMINATION",authorId:trainer.id,requiresWrittenFeedback:true}});
    const sd=await prisma.stepOnDay.create({data:{dayId:day.id,stepId:step.id,order:1}});
    const t=await prisma.userTraining.create({data:{userId:a.id,dayOnCourseId:dc.id,status:"IN_PROGRESS"}});
    const us=await prisma.userStep.create({data:{userTrainingId:t.id,stepOnDayId:sd.id,status:"IN_PROGRESS"}});
    const data={userStepId:us.id,stepId:step.id,writtenFeedback:"Synthetic answer"};
    await assert.rejects(submitExamResult(b.id,data));
    const otherStep=await prisma.step.create({data:{title:"Unrelated exam",type:"EXAMINATION",authorId:b.id}});
    await assert.rejects(submitExamResult(a.id,{...data,stepId:otherStep.id}));
    assert.equal(await prisma.examResult.count({where:{userStepId:us.id}}),0);
    const first=await submitExamResult(a.id,data), replay=await submitExamResult(a.id,data);
    assert.equal(first.examResultId,replay.examResultId);
    assert.equal(await prisma.examResult.count({where:{userStepId:us.id}}),1);
    assert.equal((await getExamResult(a.id,us.id))?.writtenFeedback,"Synthetic answer");
    assert.equal(await getExamResult(b.id,us.id),null);
  });
  if(failed) process.exitCode=1;
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await prisma.$disconnect();process.exit(process.exitCode??0);});
