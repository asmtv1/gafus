/** Only after explicit AG2 DONE, compensate exact synthetic WORK rows and close lease. */
import { realpathSync } from "node:fs";
import { chmod, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@gafus/prisma";
const ROOT="/Users/asmtv1/Desktop/gafus-refactor";
const DIR=join(ROOT,".local-pg-scratch","consultations-browser");
const FILE=join(DIR,"lease.json");const DONE=join(DIR,"AG2_DONE.json");
const API="http://127.0.0.1:3001/api/v1";
function requireTrue(v:unknown,key:string):asserts v{if(!v)throw Error("CONSULT_RETIRED_"+key);}
type Lease={scope:string;marker:string;client:{id:string;username:string;password:string};trainer:{id:string;username:string;cynologistId:string};freeSlot:{id:string};cleanupState:string};
async function main(){
 requireTrue(process.env.AG1_CONS_BROWSER_RETIRE_AFTER_AG2_DONE==="1","EXPLICIT_DONE_ONLY");
 requireTrue(realpathSync(ROOT)===ROOT&&realpathSync(process.cwd()).startsWith(ROOT+"/"),"ROOT_ONLY");
 const db=new URL(process.env.DATABASE_URL??"");requireTrue(db.hostname==="127.0.0.1"&&db.port==="55921"&&db.username==="gafus_refactor_local_real"&&db.pathname==="/gafus_refactor_real_work_20261024","WORK_ONLY");
 requireTrue(realpathSync(DIR)===DIR,"PRIVATE_DIR_ONLY");
 const f=JSON.parse(await readFile(FILE,"utf8")) as Lease;
 const done=JSON.parse(await readFile(DONE,"utf8")) as {marker?:string;browserActionsFinished?:boolean};
 requireTrue(f.scope==="gafus-refactor-WORK-browser-consultation"&&f.cleanupState==="WAIT_AG2_DONE"&&f.marker===done.marker&&done.browserActionsFinished===true,"AG2_SIGNED_OFF_EXACT_LEASE");
 requireTrue(f.client.username.startsWith("ag1_browser_cons_20261025_")&&f.trainer.username.startsWith("ag1_browser_cons_20261025_")&&f.client.username!==f.trainer.username,"SYNTHETIC_ONLY");
 const [c,t,cyn,slot]=await Promise.all([
  prisma.user.findUnique({where:{id:f.client.id},select:{username:true}}),
  prisma.user.findUnique({where:{id:f.trainer.id},select:{username:true}}),
  prisma.consultationCynologist.findUnique({where:{id:f.trainer.cynologistId},select:{userId:true}}),
  prisma.consultationSlot.findUnique({where:{id:f.freeSlot.id},select:{cynologistId:true,status:true}}),
 ]);
 requireTrue(c?.username===f.client.username&&t?.username===f.trainer.username&&cyn?.userId===f.trainer.id&&slot?.cynologistId===f.trainer.cynologistId&&slot.status==="FREE","EXACT_OWNERSHIP_AND_FREE_SLOT");
 const subscriptions=await prisma.appSubscription.findMany({where:{userId:f.client.id},select:{provider:true,status:true,planCode:true,manualReason:true}});
 requireTrue(subscriptions.length===1&&subscriptions[0]?.provider==="MANUAL"&&subscriptions[0].planCode==="THREE_MONTHS"&&subscriptions[0].manualReason?.startsWith("REFRACTOR WORK isolated synthetic AG2 browser consultation"),"EXACT_ENTITLEMENT_ONLY");
 const bookings=await prisma.consultationBooking.findMany({where:{clientId:f.client.id,cynologistId:f.trainer.cynologistId},select:{id:true,status:true,slotId:true}});
 requireTrue(bookings.length===1&&bookings[0]?.status==="CANCELLED_BY_USER"&&bookings[0]?.slotId===f.freeSlot.id,"ONLY_AG2_CANCELLED_BY_USER_BOOKING");
 requireTrue((await prisma.consultationBooking.count({where:{cynologistId:f.trainer.cynologistId,clientId:{not:f.client.id}}}))===0,"NO_FOREIGN_TRAINER_BOOKINGS");
 // This retirement must never log in again, rebook, re-cancel, or hit an external provider.
 await prisma.consultationBooking.deleteMany({where:{clientId:f.client.id,cynologistId:f.trainer.cynologistId}});
 await prisma.consultationCynologist.deleteMany({where:{id:f.trainer.cynologistId,userId:f.trainer.id}});
 for(const [id,name] of [[f.client.id,f.client.username],[f.trainer.id,f.trainer.username]]){
  const current=await prisma.user.findUnique({where:{id},select:{username:true}});
  requireTrue(current?.username===name,"USER_NOT_CHANGED");
  await prisma.user.delete({where:{id}});
 }
 requireTrue((await prisma.user.count({where:{id:{in:[f.client.id,f.trainer.id]}}}))===0,"WORK_SYNTHETIC_CLEANUP_SQL0");
 await chmod(FILE,0o600);await unlink(FILE);await unlink(DONE);
 console.warn("AG1_CONSULT_AG2_DONE_OWNER_CANCEL_AND_EXACT_WORK_SQL_CLEANUP_PASS");
}
void main().catch(e=>{process.exitCode=1;console.error("AG1_CONSULT_RETIRED_FAILED_"+(e instanceof Error?e.name:"UNKNOWN"));}).finally(async()=>prisma.$disconnect());
