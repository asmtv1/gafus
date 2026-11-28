/** Phase F isolated PostgreSQL: fiscalization leases, vet PHI ACL, Gafus reads, receipt PII. */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {prisma} from "@gafus/prisma";
import {getOwnVetVisitDetail, VetVisitDetailNotFoundError} from "@gafus/pets-server/vet-visit-detail";
import {readGafusUserStepOccurrence,readGafusVideoOccurrences} from "@gafus/course-read-server/gafus-entitlement-reads";
import {redactExpiredReminderReceiptPII} from "@gafus/notifications-server/reminder-expiry-redaction";
import {claimNpdReceiptOperation,persistNpdIssuedReceipt,persistNpdCanceledReceipt,markNpdReceiptReconciliation} from "@gafus/subscription-finance-server/npd-operation-persistence";
import {deleteVersionedCourseRows} from "@gafus/course-server/course-delete-versioned";
import {readRewardedAdSettingsRow,writeRewardedAdSettingsRow} from "@gafus/gafus-server/rewarded-settings";
import {createRewardedSettingsService} from "../../packages/core/src/services/rewardedCredits/settingsService.js";
// Isolated smoke runs without the Hono composition root. Wire the exact real
// server persistence port explicitly, never a fake default or raw Core Prisma.
const {getRewardedAdSettings,updateRewardedAdSettings}=createRewardedSettingsService({readRewardedAdSettingsRow,writeRewardedAdSettingsRow},async()=>false);
const url=new URL(process.env.DATABASE_URL??"http://invalid");
if(process.env.GAFUS_LOCAL_ISOLATED_API!=="1"||process.env.GAFUS_ARCH_PHASE_F_REAL_PG!=="1"||
 url.protocol!=="postgresql:"||url.hostname!=="127.0.0.1"||url.pathname!=="/gafus_refactor_arch_phase_f")
 throw Error("REFUSING_NON_DISPOSABLE_ARCH_PHASE_F_DB");

async function main(){
 const dbZone=await prisma.$queryRaw<{timezone:string}[]>`SELECT current_setting('TimeZone') AS timezone`;
 assert.equal(dbZone[0]?.timezone,"Pacific/Auckland","regression requires a non-UTC PostgreSQL session timezone");
 const [owner,other]=await Promise.all([
  prisma.user.create({data:{username:"archf_owner",password:"synthetic-disposable"}}),
  prisma.user.create({data:{username:"archf_other",password:"synthetic-disposable"}}),
 ]);
 // Rewarded-ad persistence: validated Core policy owns safe defaults and
 // refuses production enablement without configured placement; SQL has one row.
 assert.equal((await getRewardedAdSettings()).androidEnabled,false);
 await assert.rejects(updateRewardedAdSettings({androidEnabled:true,testMode:false},owner.id),/placement id is required/);
 assert.equal(await prisma.rewardedAdSettings.count(),0,"invalid production configuration must not persist");
 const saved=await updateRewardedAdSettings({androidEnabled:true,testMode:false,yandexAndroidPlacementId:"synthetic-placement"},owner.id);
 assert.equal(saved.androidEnabled,true);
 assert.equal(saved.testMode,false);
 assert.equal((await readRewardedAdSettingsRow())?.updatedById,owner.id);
 await writeRewardedAdSettingsRow({androidEnabled:false,iosEnabled:false,dailyAdLimit:2,yandexAndroidPlacementId:null,yandexIosPlacementId:null,testMode:true},other.id);
 assert.equal(await prisma.rewardedAdSettings.count(),1,"settings upsert must never duplicate the default row");
 assert.equal((await getRewardedAdSettings()).dailyAdLimit,2);
 assert.equal((await readRewardedAdSettingsRow())?.updatedById,other.id);

 // NPD fiscal receipt is a lease and a durable email-outbox receipt, NOT a provider call.
 const now=new Date();
 await prisma.npdConnection.create({data:{id:"default",inn:"123456789012",deviceId:"synthetic-device",refreshTokenCipher:Uint8Array.from([1]),refreshTokenIv:Uint8Array.from([2]),refreshTokenTag:Uint8Array.from([3]),refreshTokenKeyVersion:1,status:"ACTIVE"}});
 const payment=await prisma.appSubscriptionPayment.create({data:{userId:owner.id,provider:"YOOKASSA",kind:"RENEWAL",status:"SUCCEEDED",planCode:"MONTHLY",idempotenceKey:"archf-invoice-1",amount:2490,currency:"RUB",buyerEmail:"synthetic@example.invalid"}});
 const receipt=await prisma.npdReceipt.create({data:{paymentId:payment.id,connectionId:"default",amountKopecks:249000,planCode:"MONTHLY",intervalDays:30,serviceName:"Synthetic plan 30 days",operationAt:now,buyerEmail:"synthetic@example.invalid"}});
 const op=await prisma.npdReceiptOperation.create({data:{receiptId:receipt.id,type:"CREATE",status:"PENDING",nextAttemptAt:new Date(now.getTime()-10_000)}});
 const claims=await Promise.all(Array.from({length:5},(_,i)=>claimNpdReceiptOperation(prisma,`runner-${i}`,now)));
 assert.equal(claims.filter(x=>x.operation!==null).length,1,"only one worker may claim same NPD operation");
 const selected=claims.find(x=>x.operation)?.operation;
 assert.ok(selected);assert.equal(selected.id,op.id);
 assert.equal((await prisma.npdReceiptOperation.findUniqueOrThrow({where:{id:op.id}})).attemptCount,1);
 await persistNpdIssuedReceipt(prisma,{...selected,leaseOwner:"stale-runner"},{receiptUuid:randomUUID(),printUrl:"https://example.invalid/print",jsonUrl:"https://example.invalid/json"});
 assert.equal((await prisma.npdReceipt.findUniqueOrThrow({where:{id:receipt.id}})).status,"PENDING","stale lease cannot finalize fiscal record");
 const receiptUuid=randomUUID();
 await persistNpdIssuedReceipt(prisma,selected,{receiptUuid,printUrl:"https://example.invalid/print",jsonUrl:"https://example.invalid/json"});
 assert.equal((await prisma.npdReceipt.findUniqueOrThrow({where:{id:receipt.id}})).status,"ISSUED");
 assert.equal((await prisma.npdReceiptEmailDelivery.findUniqueOrThrow({where:{receiptId:receipt.id}})).status,"PENDING");
 await persistNpdIssuedReceipt(prisma,selected,{receiptUuid:"late-retry",printUrl:"https://example.invalid",jsonUrl:"https://example.invalid"});
 assert.equal((await prisma.npdReceipt.findUniqueOrThrow({where:{id:receipt.id}})).providerReceiptId,receiptUuid,"late ACK cannot overwrite receipt id");
 await prisma.appSubscriptionPayment.update({where:{id:payment.id},data:{status:"REFUNDED"}});
 await prisma.npdReceipt.update({where:{id:receipt.id},data:{status:"CANCEL_PENDING"}});
 const cancel=await prisma.npdReceiptOperation.create({data:{receiptId:receipt.id,type:"CANCEL",status:"PROCESSING",leaseOwner:"cancel-owner",leaseExpiresAt:new Date(now.getTime()+90_000)}});
 const cancelOp={...cancel,receipt:{connectionId:"default"}} as never;
 assert.equal(await persistNpdCanceledReceipt(prisma,{...cancelOp,leaseOwner:"stale-owner"}),false);
 assert.equal((await prisma.npdReceipt.findUniqueOrThrow({where:{id:receipt.id}})).status,"CANCEL_PENDING");
 assert.equal(await persistNpdCanceledReceipt(prisma,cancelOp),true);
 assert.equal(await persistNpdCanceledReceipt(prisma,cancelOp),false);
 assert.equal((await prisma.npdReceipt.findUniqueOrThrow({where:{id:receipt.id}})).status,"CANCELED");
 // A second receipt forced to UNKNOWN cannot silently retry an ambiguous NPD create.
 const secondPay=await prisma.appSubscriptionPayment.create({data:{userId:other.id,provider:"YOOKASSA",kind:"RENEWAL",status:"SUCCEEDED",planCode:"MONTHLY",idempotenceKey:"archf-invoice-2",amount:1500,currency:"RUB"}});
 const secondReceipt=await prisma.npdReceipt.create({data:{paymentId:secondPay.id,connectionId:"default",amountKopecks:150000,planCode:"MONTHLY",intervalDays:30,serviceName:"Other synthetic plan",operationAt:now}});
 const unknown=await prisma.npdReceiptOperation.create({data:{receiptId:secondReceipt.id,type:"CREATE",status:"PROCESSING",leaseOwner:"reconciliation-owner"}});
 await markNpdReceiptReconciliation(prisma,unknown as never,"AMBIGUOUS_WRITE","unknown provider acceptance");
 assert.equal((await prisma.npdReceiptOperation.findUniqueOrThrow({where:{id:unknown.id}})).status,"RECONCILIATION_REQUIRED");
 assert.equal((await prisma.npdReceipt.findUniqueOrThrow({where:{id:secondReceipt.id}})).status,"RECONCILIATION_REQUIRED");

 // Vet PHI: tenant/owner scoping precedes every sensitive visit/attachment select.
 const pet=await prisma.pet.create({data:{ownerId:owner.id,name:"Synthetic",type:"DOG",breed:"Test",birthDate:new Date("2020-01-01")}});
 const visit=await prisma.petVetVisit.create({data:{petId:pet.id,ownerId:owner.id,visitedOn:new Date("2026-10-01"),specialty:"Veterinarian",diagnosis:"SYNTHETIC_PRIVATE_MEDICAL_NOTE"}});
 const attachment=await prisma.petVetAttachment.create({data:{visitId:visit.id,name:"medical.png",mimeType:"image/png",sizeBytes:500,originalKey:"synthetic-secret-vet-photo-key"}});
 await prisma.galleryStorageJob.create({data:{ownerId:owner.id,dedupeKey:`vet-preview:${attachment.id}`,kind:"vetPreview",status:"pending",sourceKeys:[],sourceETags:[],targetKeys:[]}});
 const vet=await getOwnVetVisitDetail(owner.id,pet.id,visit.id);
 assert.equal(vet.diagnosis,"SYNTHETIC_PRIVATE_MEDICAL_NOTE");
 assert.equal(vet.attachments[0]?.previewProcessing,true);
 assert.equal(vet.attachments[0]?.hasPreview,false);
 assert.ok(!JSON.stringify(vet).includes("synthetic-secret-vet-photo-key"));
 await assert.rejects(getOwnVetVisitDetail(other.id,pet.id,visit.id),(error:unknown)=>error instanceof VetVisitDetailNotFoundError && error.status===404);
 await assert.rejects(getOwnVetVisitDetail(owner.id,pet.id,"missing"),/Посещение не найдено/);
 await assert.rejects(getOwnVetVisitDetail(owner.id,"../invalid",visit.id),/Посещение не найдено/);

 // Gafus entitlement SQL: user-specific progress and occurrence data only.
 const course=await prisma.course.create({data:{name:"Course",type:"archf_unique_course",trainingLevel:"BEGINNER",duration:"7",logoImg:"",authorId:owner.id}});
 const day=await prisma.trainingDay.create({data:{title:"Day",authorId:owner.id}});
 const dayLink=await prisma.dayOnCourse.create({data:{courseId:course.id,dayId:day.id,order:0}});
 const step=await prisma.step.create({data:{title:"Step",authorId:owner.id,videoUrl:"https://synthetic.invalid/training.mp4"}});
 const stepLink=await prisma.stepOnDay.create({data:{dayId:day.id,stepId:step.id,order:0}});
 const userTraining=await prisma.userTraining.create({data:{userId:owner.id,dayOnCourseId:dayLink.id}});
 const userStep=await prisma.userStep.create({data:{userTrainingId:userTraining.id,stepOnDayId:stepLink.id}});
 assert.equal((await readGafusUserStepOccurrence(userStep.id,owner.id))?.stepOnDayId,stepLink.id);
 assert.equal(await readGafusUserStepOccurrence(userStep.id,other.id),null);
 assert.equal(await readGafusUserStepOccurrence("",owner.id),null);
 const occurrence=await readGafusVideoOccurrences("https://synthetic.invalid/training.mp4");
 assert.deepEqual(occurrence.map(x=>({id:x.id,links:x.day.stepLinks.map(s=>s.id)})),[{id:dayLink.id,links:[stepLink.id]}]);
 assert.deepEqual(await readGafusVideoOccurrences("https://synthetic.invalid/other.mp4"),[]);

 // Course.version owner-scoped, rollback-safe trainer deletion. Existing lesson
 // progress must not leak or remain dangling after the full course is gone.
 assert.deepEqual(await deleteVersionedCourseRows(course.id,1,{id:other.id,role:"TRAINER"}),{status:"not_found"});
 assert.deepEqual(await deleteVersionedCourseRows(course.id,2,{id:owner.id,role:"TRAINER"}),{status:"stale"});
 assert.ok(await prisma.userTraining.findUnique({where:{id:userTraining.id}}));
 assert.deepEqual(await deleteVersionedCourseRows(course.id,1,{id:owner.id,role:"TRAINER"}),{status:"deleted",logoImg:""});
 assert.equal(await prisma.course.findUnique({where:{id:course.id}}),null);
 assert.equal(await prisma.dayOnCourse.findUnique({where:{id:dayLink.id}}),null);
 assert.equal(await prisma.userTraining.findUnique({where:{id:userTraining.id}}),null);
 assert.equal(await prisma.userStep.findUnique({where:{id:userStep.id}}),null);
 assert.deepEqual(await deleteVersionedCourseRows(course.id,1,{id:owner.id,role:"TRAINER"}),{status:"not_found"});

 // Receipt redaction: permanent owner/key tombstones, no raw PII returned or logged.
 const oldDate=new Date(now.getTime()-60_000),newDate=new Date(now.getTime()+60_000);
 await prisma.reminderMutationReceipt.createMany({data:Array.from({length:220},(_,i)=>({ownerUserId:owner.id,operationKey:randomUUID(),fingerprint:"a".repeat(64),state:"COMMITTED",responseJson:{privateName:`SYNTHETIC_RECEIPT_PII_${i}`},expiresAt:oldDate}))});
 const active=await prisma.reminderMutationReceipt.create({data:{ownerUserId:other.id,operationKey:randomUUID(),fingerprint:"b".repeat(64),state:"COMMITTED",responseJson:{privateName:"ACTIVE_PII"},expiresAt:newDate}});
 await assert.rejects(redactExpiredReminderReceiptPII(201),RangeError);
 const eligibleBefore=await prisma.$queryRaw<{n:number}[]>`SELECT COUNT(*)::int AS n FROM "ReminderMutationReceipt" WHERE "expiresAt" <= timezone('UTC', CURRENT_TIMESTAMP)`;
 assert.equal(eligibleBefore[0]?.n,220,"the active receipt must not qualify even with a non-UTC DB session timezone");
 const counts=await Promise.all([redactExpiredReminderReceiptPII(200),redactExpiredReminderReceiptPII(200)]);
 assert.equal(counts.reduce((a,b)=>a+b,0),220,"concurrent SKIP LOCKED batches must not double-count receipts");
 assert.equal(await redactExpiredReminderReceiptPII(),0);
 const aggregate=await prisma.reminderMutationReceipt.aggregate({where:{ownerUserId:owner.id},_count:{_all:true}});
 assert.equal(aggregate._count._all,220,"redaction preserves permanent idempotency tombstones");
 const piiRows=await prisma.reminderMutationReceipt.findMany({where:{ownerUserId:owner.id}});
 assert.equal(piiRows.every(r=>r.state==="EXPIRED" && r.fingerprint==="0".repeat(64) && r.responseJson===null && r.reminderId===null),true);
 const activeAfter=await prisma.reminderMutationReceipt.findUniqueOrThrow({where:{ownerUserId_operationKey:{ownerUserId:other.id,operationKey:active.operationKey}}});
 assert.deepEqual(activeAfter.responseJson,{privateName:"ACTIVE_PII"});
 assert.equal(activeAfter.state,"COMMITTED");
 console.log("PHASE_F_REAL_PG_PASS: rewarded-ad default setting one-row upsert and Core production-placement guard; NPD xact claim/CAS/UNKNOWN recovery/receipt and email outbox; course owner+version delete with progress cascade; vet owner PHI 404/redacted storage key; Gafus progress owner scope and video occurrences; 220 expired reminder tombstones concurrent SKIP LOCKED no resurrection");
}
main().then(async()=>prisma.$disconnect()).catch(async(err)=>{console.error(err);await prisma.$disconnect();process.exitCode=1;});
