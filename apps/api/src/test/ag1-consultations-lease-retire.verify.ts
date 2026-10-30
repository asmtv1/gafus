/** Read-only post-retirement SQL verification; never contacts auth, worker, browser or providers. */
import { realpathSync, existsSync } from "node:fs";
import { readFile, writeFile, chmod } from "node:fs/promises";
import { prisma } from "@gafus/prisma";
const root="/Users/asmtv1/Desktop/gafus-refactor";
const dir=root+"/.local-pg-scratch/consultations-browser";
function check(v:unknown,key:string):asserts v {if(!v)throw Error("RETIRE_VERIFY_"+key);}
async function main(){
 check(process.env.AG1_CONS_RETIRE_VERIFY==="1","EXPLICIT_WORK_ONLY");
 check(realpathSync(root)===root&&realpathSync(dir)===dir&&realpathSync(process.cwd()).startsWith(root+"/"),"PROJECT_ONLY");
 const url=new URL(process.env.DATABASE_URL??"");
 check(url.hostname==="127.0.0.1"&&url.port==="55921"&&url.username==="gafus_refactor_local_real"&&url.pathname==="/gafus_refactor_real_work_20261024","RESTRICTED_PG_ONLY");
 check(!existsSync(dir+"/lease.json")&&!existsSync(dir+"/AG2_DONE.json"),"RETIRED_FILES_ABSENT");
 const pre=JSON.parse(await readFile(dir+"/retire-preflight.private.json","utf8")) as {
   v:number,ids:{clientId:string,trainerId:string,cynologistId:string,slotId:string},foreign:Record<string,number>,before:{users:number,bookings:number,subscription:number,freeSlot:string}};
 check(pre.v===1&&pre.before.users===2&&pre.before.bookings===1&&pre.before.subscription===1&&pre.before.freeSlot==="FREE","VALID_PREFLIGHT");
 const {clientId,trainerId,cynologistId,slotId}=pre.ids;
 const [own,foreign]=await Promise.all([
  Promise.all([
   prisma.user.count({where:{id:{in:[clientId,trainerId]}}}),
   prisma.userProfile.count({where:{userId:{in:[clientId,trainerId]}}}),
   prisma.appSubscription.count({where:{userId:clientId}}),
   prisma.consultationCynologist.count({where:{id:cynologistId}}),
   prisma.consultationAvailabilityRule.count({where:{cynologistId}}),
   prisma.consultationSlot.count({where:{cynologistId}}),
   prisma.consultationBooking.count({where:{OR:[{clientId},{cynologistId},{slotId}]}}),
   prisma.consultationBookingIdempotency.count({where:{clientId}}),
   prisma.consultationEmailLog.count({where:{booking:{clientId}}}),
  ]),
  Promise.all([
   prisma.user.count({where:{id:{notIn:[clientId,trainerId]}}}),
   prisma.userProfile.count({where:{userId:{notIn:[clientId,trainerId]}}}),
   prisma.appSubscription.count({where:{userId:{not:clientId}}}),
   prisma.consultationCynologist.count({where:{id:{not:cynologistId}}}),
   prisma.consultationAvailabilityRule.count({where:{cynologistId:{not:cynologistId}}}),
   prisma.consultationSlot.count({where:{cynologistId:{not:cynologistId}}}),
   prisma.consultationBooking.count({where:{OR:[{clientId:{not:clientId}},{cynologistId:{not:cynologistId}}]}}),
   prisma.consultationBookingIdempotency.count({where:{clientId:{not:clientId}}}),
   prisma.consultationEmailLog.count({where:{booking:{clientId:{not:clientId}}}}),
  ]),
 ]);
 const keys=["nonOwnUsers","nonOwnProfiles","nonOwnSubscriptions","nonOwnTrainers","nonOwnAvailability","nonOwnSlots","nonOwnBookings","nonOwnBookingReceipts","nonOwnEmailOutbox"];
 const foreignMatches=keys.every((k,i)=>pre.foreign[k]===foreign[i]);
 const ownZero=own.every(n=>n===0);
 console.warn("AG1_CONSULT_OWN_SQL_ZERO_9_CATEGORIES="+(ownZero?"PASS":"FAIL"));
 console.warn("AG1_CONSULT_FOREIGN_COUNTS_UNCHANGED_9_CATEGORIES="+(foreignMatches?"PASS":"DIFFERENCE_REVIEW_REQUIRED"));
 if(!ownZero||!foreignMatches){process.exitCode=1;return;}
 const result={v:1,verifiedAt:new Date().toISOString(),result:"PASS",syntheticOwnCountZero:9,foreignCountsUnchanged:9,credentialLeaseAbsent:true,signedDoneConsumed:true};
 const path=dir+"/retire-result.private.json";
 await writeFile(path,JSON.stringify(result)+"\n",{mode:0o600,flag:"wx"});await chmod(path,0o600);
 console.warn("AG1_CONSULT_RETIRE_PRIVATE_SANITIZED_VERIFICATION_WRITTEN=PASS");
}
void main().catch(e=>{process.exitCode=1;console.error("AG1_CONSULT_SQL_READONLY_VERIFICATION_ERROR_"+(e instanceof Error?e.name:"UNKNOWN"));}).finally(async()=>prisma.$disconnect());
