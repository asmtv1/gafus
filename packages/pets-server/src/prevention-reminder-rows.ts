/** PostgreSQL-only projection and acknowledgement for pet prevention pushes.
 * Actual enqueue, text formatting and Moscow-local HH:MM selection stay Core.
 * The acknowledgement cannot alter another user's, pet's or rescheduled
 * prevention entry; a queue failure never marks a reminder as delivered.
 */
import {prisma} from "@gafus/prisma";
export interface DuePetPreventionReminderRow {
 id:string;ownerId:string;petId:string;petName:string;type:string;
 productName:string|null;notes:string|null;remindAt:Date;
 reminderTimes:unknown;sentTimesForRemindAt:unknown;
}

export async function readDuePetPreventionReminders():Promise<DuePetPreventionReminderRow[]>{
 return prisma.$queryRaw<DuePetPreventionReminderRow[]>`
  SELECT ppe.id,ppe."ownerId",ppe."petId",p.name AS "petName",
    ppe.type::text AS "type",ppe."productName",ppe.notes,
    ppe."remindAt",ppe."reminderTimes",ppe."sentTimesForRemindAt"
  FROM "PetPreventionEntry" ppe INNER JOIN "Pet" p ON p.id = ppe."petId"
  WHERE ppe."reminderEnabled" = true AND ppe."remindAt" IS NOT NULL
    AND ppe."remindAt" <= (timezone('utc', now()))::date
 `;
}

/** Conditional ack: do not stamp a new schedule with old delivery times.
 * A missing/rescheduled entry raises P2025 and the caller counts an error.
 */
export async function acknowledgePetPreventionQueuedTimes(
 row:Pick<DuePetPreventionReminderRow,"id"|"ownerId"|"petId"|"remindAt">,
 sentTimes:string[],allSent:boolean,
){
 return prisma.petPreventionEntry.update({
  where:{id:row.id,ownerId:row.ownerId,petId:row.petId,
    remindAt:row.remindAt,reminderEnabled:true},
  data:{sentTimesForRemindAt:sentTimes,
    ...(allSent?{lastNotifiedForRemindAt:row.remindAt}:{})},
 });
}
