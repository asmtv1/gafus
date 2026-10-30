/** Read-only exact owner/booking + whole non-own row count checkpoint before consented synthetic lease retire. */
import { realpathSync } from "node:fs";
import { readFile, writeFile, chmod } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@gafus/prisma";
const ROOT="/Users/asmtv1/Desktop/gafus-refactor",DIR=join(ROOT,".local-pg-scratch/consultations-browser");
const SNAP=join(DIR,"retire-preflight.private.json");
function requireTrue(x:unknown,s:string):asserts x{if(!x)throw Error("AG1_CONSULT_RETIRE_PREFLIGHT_"+s);}
async function foreignCount(f:{client:{id:string},trainer:{id:string,cynologistId:string}}){
 const ids=[f.client.id,f.trainer.id];const trainer=f.trainer.cynologistId;
 const count=await Promise.all([
  prisma.user.count({where:{id:{notIn:ids}}}),
  prisma.userProfile.count({where:{userId:{notIn:ids}}}),
  prisma.appSubscription.count({where:{userId:{not:f.client.id}}}),
  prisma.consultationCynologist.count({where:{id:{not:trainer}}}),
  prisma.consultationAvailabilityRule.count({where:{cynologistId:{not:trainer}}}),
  prisma.consultationSlot.count({where:{cynologistId:{not:trainer}}}),
  prisma.consultationBooking.count({where:{OR:[{clientId:{not:f.client.id}},{cynologistId:{not:trainer}}]}}),
  prisma.consultationBookingIdempotency.count({where:{clientId:{not:f.client.id}}}),
  prisma.consultationEmailLog.count({where:{booking:{clientId:{not:f.client.id}}}}),
 ]);
 return {nonOwnUsers:count[0],nonOwnProfiles:count[1],nonOwnSubscriptions:count[2],nonOwnTrainers:count[3],
  nonOwnAvailability:count[4],nonOwnSlots:count[5],nonOwnBookings:count[6],nonOwnBookingReceipts:count[7],nonOwnEmailOutbox:count[8]};
}
async function main(){
 requireTrue(process.env.AG1_CONSULT_RETIRE_PREFLIGHT==="1","EXPLICIT_ONLY");
 requireTrue(realpathSync(ROOT)===ROOT&&realpathSync(process.cwd()).startsWith(ROOT+"/")&&realpathSync(DIR)===DIR,"PROJECT_ONLY");
 const db=new URL(process.env.DATABASE_URL??"");requireTrue(db.hostname==="127.0.0.1"&&db.port==="55921"&&db.username==="gafus_refactor_local_real"&&db.pathname==="/gafus_refactor_real_work_20261024","WORK_ONLY");
 const f=JSON.parse(await readFile(join(DIR,"lease.json"),"utf8")) as {scope:string,marker:string,cleanupState:string,client:{id:string,username:string},trainer:{id:string,username:string,cynologistId:string},freeSlot:{id:string}};
 const done=JSON.parse(await readFile(join(DIR,"AG2_DONE.json"),"utf8")) as {marker?:string,browserActionsFinished?:boolean};
 requireTrue(f.scope==="gafus-refactor-WORK-browser-consultation"&&f.cleanupState==="WAIT_AG2_DONE"&&f.marker===done.marker&&done.browserActionsFinished===true,"SIGNED_AG2_DONE");
 requireTrue(f.client.username.startsWith("ag1_browser_cons_20261025_")&&f.trainer.username.startsWith("ag1_browser_cons_20261025_")&&f.client.id!==f.trainer.id,"SYNTHETIC_ONLY");
 const [client,trainer,cyn,slot,subscriptions,bookings,otherTrainerBookings]=await Promise.all([
  prisma.user.findUnique({where:{id:f.client.id},select:{username:true,role:true,email:true}}),
  prisma.user.findUnique({where:{id:f.trainer.id},select:{username:true,role:true,email:true}}),
  prisma.consultationCynologist.findUnique({where:{id:f.trainer.cynologistId},select:{userId:true,isListed:true}}),
  prisma.consultationSlot.findUnique({where:{id:f.freeSlot.id},select:{cynologistId:true,status:true}}),
  prisma.appSubscription.findMany({where:{userId:f.client.id},select:{planCode:true,provider:true,status:true,manualReason:true}}),
  prisma.consultationBooking.findMany({where:{clientId:f.client.id},select:{status:true,slotId:true,cynologistId:true}}),
  prisma.consultationBooking.count({where:{cynologistId:f.trainer.cynologistId,clientId:{not:f.client.id}}}),
 ]);
 requireTrue(client?.username===f.client.username&&client.role==="USER"&&!client.email&&trainer?.username===f.trainer.username&&trainer.role==="TRAINER"&&!trainer.email,"MATCHING_OWNER_ROLES");
 requireTrue(cyn?.userId===f.trainer.id&&cyn.isListed&&slot?.cynologistId===f.trainer.cynologistId&&slot.status==="FREE","MATCHING_TRAINER_FREE_SLOT");
 requireTrue(subscriptions.length===1&&subscriptions[0]?.planCode==="THREE_MONTHS"&&subscriptions[0].provider==="MANUAL"&&subscriptions[0].status==="ACTIVE"&&subscriptions[0].manualReason?.startsWith("REFRACTOR WORK isolated synthetic AG2 browser consultation"),"MATCHING_SYNTHETIC_SUBSCRIPTION");
 requireTrue(bookings.length===1&&bookings[0]?.status==="CANCELLED_BY_USER"&&bookings[0]?.slotId===f.freeSlot.id&&bookings[0]?.cynologistId===f.trainer.cynologistId&&otherTrainerBookings===0,"ONE_ONLY_CANCELLED_BOOKING_NO_FOREIGN_TRAINER_BOOKING");
 const foreign=await foreignCount(f);
 const base={v:1,createdAt:new Date().toISOString(),ids:{clientId:f.client.id,trainerId:f.trainer.id,cynologistId:f.trainer.cynologistId,slotId:f.freeSlot.id},foreign,before:{users:2,bookings:bookings.length,subscription:subscriptions.length,freeSlot:slot.status}};
 await writeFile(SNAP,JSON.stringify(base),{flag:"wx",mode:0o600});await chmod(SNAP,0o600);
 console.warn("AG1_CONSULT_RETIRE_READONLY_DRY_PREFLIGHT=PASS");
 console.warn("AG1_CONSULT_RETIRE_SIGNED_DONE_OWNER_IDS_ROLE_ENTITLEMENT=PASS");
 console.warn("AG1_CONSULT_RETIRE_WORK_ONE_CANCELLED_BY_USER_SLOT_FREE_NO_FOREIGN_TRAINER_BOOKINGS=PASS");
 console.warn("AG1_CONSULT_RETIRE_NONOWN_COUNTS_CAPTURED="+Object.keys(foreign).length);
}
void main().catch(e=>{console.error("AG1_CONSULT_RETIRE_DRY_PREFLIGHT_FAILED_"+(e instanceof Error&&e.message.startsWith("AG1_CONSULT_RETIRE_PREFLIGHT_")?e.message:"CHECK_OR_STATE"));process.exitCode=1;}).finally(async()=>prisma.$disconnect());
