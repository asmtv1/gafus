/** Training-reminder persistence; validation is in the caller's application layer.
 * User-row create locks serialize both keyed and legacy keyless creation, and
 * owner-scoped FOR UPDATE checks fence cross-actor update/delete races.
 */
import {prisma,type Reminder} from "@gafus/prisma";
export type TrainingReminderRecord=Reminder;
const REMINDER_TYPE="training";
const MAX_REMINDERS=5;
export type TrainingReminderUpdate={
 name?:string;
 enabled?:boolean;
 reminderTime?:string;
 reminderDays?:string|null;
 timezone?:string;
};
export async function readTrainingReminderRows(userId:string){
 return prisma.reminder.findMany({
  where:{userId,type:REMINDER_TYPE},orderBy:{createdAt:"asc"},
  select:{id:true,name:true,enabled:true,reminderTime:true,reminderDays:true,timezone:true},
 });
}
export async function createTrainingReminderRow(
 userId:string,name:string,reminderTime:string,reminderDays?:string|null,timezone?:string|null,
):Promise<Reminder>{
 // Same lock as keyed receipt CREATE; count and insert are one transaction.
 return prisma.$transaction(async tx=>{
  const actor=await tx.$queryRaw<{id:string}[]>`
    SELECT "id" FROM "User" WHERE "id"=${userId} AND "registrationPending" = false FOR UPDATE
  `;
  if(actor.length!==1)throw new Error("Пользователь не найден");
  const count=await tx.reminder.count({where:{userId,type:REMINDER_TYPE}});
  if(count>=MAX_REMINDERS)throw new Error("Максимум 5 напоминаний");
  return tx.reminder.create({data:{userId,type:REMINDER_TYPE,name,reminderTime,
    reminderDays:reminderDays??null,timezone:timezone??"Europe/Moscow",enabled:true}});
 });
}
export async function updateTrainingReminderRow(userId:string,id:string,data:TrainingReminderUpdate):Promise<Reminder>{
 return prisma.$transaction(async tx=>{
  const owned=await tx.$queryRaw<{id:string}[]>`
    SELECT "id" FROM "Reminder" WHERE "id"=${id} AND "userId"=${userId} AND "type"=${REMINDER_TYPE} FOR UPDATE
  `;
  if(owned.length!==1)throw new Error("Напоминание не найдено");
  return tx.reminder.update({where:{id},data});
 });
}
export async function deleteTrainingReminderRow(userId:string,id:string):Promise<Reminder>{
 return prisma.$transaction(async tx=>{
  const owned=await tx.$queryRaw<{id:string}[]>`
    SELECT "id" FROM "Reminder" WHERE "id"=${id} AND "userId"=${userId} AND "type"=${REMINDER_TYPE} FOR UPDATE
  `;
  if(owned.length!==1)throw new Error("Напоминание не найдено");
  return tx.reminder.delete({where:{id}});
 });
}
