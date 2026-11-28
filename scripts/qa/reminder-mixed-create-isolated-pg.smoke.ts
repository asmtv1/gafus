/** Real disposable PostgreSQL acceptance: keyed and keyless training reminder CREATE
 * must serialize on the same User row after persistence moved out of Core.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@gafus/prisma";
import { createReminder } from "../../packages/notifications-server/src/training-reminder-application.js";
import { createReminderAG4, lookupReminderAG4 } from "../../packages/core/src/services/reminders/g1ReminderMutationReceiptAG4.review.js";
import {reminderRows} from "../../apps/api/src/modules/reminders/composition/reminder-rows.js";
const db=new URL(process.env.DATABASE_URL??"http://invalid");
if(process.env.GAFUS_LOCAL_ISOLATED_API!=="1"||process.env.GAFUS_REMINDER_MIXED_REAL_PG!=="1"||
 db.protocol!=="postgresql:"||db.hostname!=="127.0.0.1"||db.pathname!=="/gafus_refactor_reminder_mixed")
 throw Error("REFUSING_NON_DISPOSABLE_REMINDER_MIXED_DB");

async function ownerWithFour(label:string){
 const u=await prisma.user.create({data:{username:`mixed_reminder_${label}`,password:"synthetic-disposable"}});
 await prisma.reminder.createMany({data:Array.from({length:4},(_,i)=>({
  userId:u.id,type:"training",name:`Synthetic ${label} ${i}`,enabled:true,
  reminderTime:"09:30",timezone:"Europe/Moscow",
 }))});
 return u.id;
}
async function verify(keyedFirst:boolean){
 const owner=await ownerWithFour(keyedFirst?"keyed_first":"keyless_first");
 const operationKey=randomUUID();
 const keyed=()=>createReminderAG4(owner,{name:"Synthetic keyed",reminderTime:"09:30"},operationKey,reminderRows);
 const keyless=()=>createReminder(owner,"Synthetic keyless","09:30");
 const promises=keyedFirst?[keyed(),keyless()]:[keyless(),keyed()];
 const results=await Promise.allSettled(promises);
 assert.equal(results.filter(r=>r.status==="fulfilled").length,1,"exactly one competing CREATE succeeds");
 assert.equal(results.filter(r=>r.status==="rejected").length,1,"losing CREATE must fail closed");
 const fail=results.find(r=>r.status==="rejected");
 if(fail?.status==="rejected")assert.match(String(fail.reason),/Максимум 5 напоминаний/);
 const rows=await prisma.reminder.findMany({where:{userId:owner,type:"training"},select:{id:true,name:true}});
 assert.equal(rows.length,5,"a sixth training reminder must never be committed");
 const receipts=await prisma.reminderMutationReceipt.findMany({where:{ownerUserId:owner}});
 assert.ok(receipts.length<=1,"keyless requests never write idempotency receipts");
 if(receipts.length===1){
  assert.equal(receipts[0].state,"COMMITTED","keyed transaction includes the receipt atomically");
  const previous=await lookupReminderAG4(owner,operationKey,reminderRows);
  assert.equal(previous.reminder.id,receipts[0].reminderId);
  const replay=await createReminderAG4(owner,{name:"Synthetic keyed",reminderTime:"09:30"},operationKey,reminderRows);
  assert.equal(replay.kind,"idempotent_replay");
  assert.equal(replay.reminder.id,previous.reminder.id);
  assert.equal(await prisma.reminder.count({where:{userId:owner,type:"training"}}),5);
 }
 return {winner:receipts.length===1?"keyed":"keyless",owner};
}
async function main(){
 const zone=await prisma.$queryRaw<{zone:string}[]>`SELECT current_setting('TimeZone') AS zone`;
 assert.equal(zone[0]?.zone,"Pacific/Auckland");
 const first=await verify(true);
 const second=await verify(false);
 const owner=await ownerWithFour("two_keyless");
 const two=await Promise.allSettled([
  createReminder(owner,"Synthetic A","09:30"),
  createReminder(owner,"Synthetic B","09:30"),
 ]);
 assert.deepEqual(two.map(r=>r.status).sort(),["fulfilled","rejected"]);
 assert.equal(await prisma.reminder.count({where:{userId:owner,type:"training"}}),5);
 assert.equal(await prisma.reminderMutationReceipt.count({where:{ownerUserId:owner}}),0);
 console.log(`PHASE_G_REMINDER_MIXED_REAL_PG_PASS: keyed-first winner=${first.winner}; keyless-first winner=${second.winner}; two keyless race exactly one succeeds; cap5 and atomic receipt/replay hold in nonUTC DB`);
}
main().then(async()=>prisma.$disconnect()).catch(async err=>{console.error(err);await prisma.$disconnect();process.exitCode=1;});
