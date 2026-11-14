/** Disposable owner-update/delete race acceptance; no production DB permitted. */
import assert from "node:assert/strict";
import {setTimeout as sleep} from "node:timers/promises";
import {prisma} from "@gafus/prisma";
import {updateReminder,deleteReminder,createReminder} from "../../packages/notifications-server/src/training-reminder-application.js";
const db=new URL(process.env.DATABASE_URL??"http://invalid");
if(process.env.GAFUS_LOCAL_ISOLATED_API!=="1" || process.env.GAFUS_REMINDER_ATOMIC_PG!=="1" ||
   db.protocol!=="postgresql:" || db.hostname!=="127.0.0.1" ||
   db.pathname!=="/gafus_refactor_reminder_atomic")throw Error("REFUSING_NON_DISPOSABLE_REMINDER_DB");
async function main(){
 const [a,b]=await Promise.all([
   prisma.user.create({data:{username:"reminder_a",password:"synthetic-disposable"}}),
   prisma.user.create({data:{username:"reminder_b",password:"synthetic-disposable"}}),
 ]);
 const reminder=await createReminder(a.id,"Safe A","08:15",null,"Europe/Moscow");
 assert.equal(reminder.userId,a.id);
 await assert.rejects(updateReminder(b.id,reminder.id,{name:"stolen"}),/Напоминание не найдено/);
 await assert.rejects(deleteReminder(b.id,reminder.id),/Напоминание не найдено/);
 assert.equal((await prisma.reminder.findUniqueOrThrow({where:{id:reminder.id}})).name,"Safe A");
 await updateReminder(a.id,reminder.id,{name:"Safe edit",enabled:false});
 assert.equal((await prisma.reminder.findUniqueOrThrow({where:{id:reminder.id}})).name,"Safe edit");
 let announceLocked!:()=>void;
 const locked=new Promise<void>(resolve=>{announceLocked=resolve});
 const ownershipTransfer=prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT "id" FROM "Reminder" WHERE "id" = ${reminder.id} FOR UPDATE`;
   announceLocked();
   await sleep(120);
   await tx.reminder.update({where:{id:reminder.id},data:{userId:b.id}});
 },{timeout:10000});
 await locked;
 const oldOwnerAttempt=updateReminder(a.id,reminder.id,{name:"stale edit should not commit"});
 await ownershipTransfer;
 await assert.rejects(oldOwnerAttempt,/Напоминание не найдено/);
 assert.equal((await prisma.reminder.findUniqueOrThrow({where:{id:reminder.id}})).name,"Safe edit");
 assert.equal((await prisma.reminder.findUniqueOrThrow({where:{id:reminder.id}})).userId,b.id);
 await assert.rejects(deleteReminder(a.id,reminder.id),/Напоминание не найдено/);
 assert.equal((await deleteReminder(b.id,reminder.id)).id,reminder.id);
 assert.equal(await prisma.reminder.findUnique({where:{id:reminder.id}}),null);
 console.log("REMINDER_ATOMIC_OWNER_REAL_PG_PASS: foreign update/delete deny, owner edits, concurrent transfer blocks stale update under FOR UPDATE, transferred owner can delete");
}
main().then(async()=>prisma.$disconnect())
 .catch(async(error)=>{console.error(error);await prisma.$disconnect();process.exitCode=1;});
