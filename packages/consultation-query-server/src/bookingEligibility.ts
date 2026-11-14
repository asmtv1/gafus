/** DB-projected client consultation booking restrictions, no Core import/cycle.
 * Core retains cooldown policy and localized messages. Transactional callers
 * inject their own tx, preserving the outer booking mutation's user-row lock.
 */
import {prisma,type Prisma} from "@gafus/prisma";

export type ConsultationBookingsDb=Pick<Prisma.TransactionClient,"consultationBooking">;
export type ClientConsultationRestrictions={hasActiveBooking:boolean;lastCompletedAt:Date|null};

/** Shared lock for booking/create/completion transitions across API instances. */
export async function lockConsultationClient(tx:Prisma.TransactionClient,clientId:string):Promise<void>{
  if(!clientId)throw new Error("CONSULTATION_CLIENT_ID_REQUIRED");
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${clientId} FOR UPDATE`;
}

export async function readClientConsultationRestrictions(
  clientId:string,db:ConsultationBookingsDb=prisma,
):Promise<ClientConsultationRestrictions>{
  if(!clientId)throw new Error("CONSULTATION_CLIENT_ID_REQUIRED");
  const active=await db.consultationBooking.findFirst({
    where:{clientId,status:{in:["PENDING_TRAINER_CONFIRMATION","CONFIRMED"]}},
    select:{id:true},
  });
  if(active)return {hasActiveBooking:true,lastCompletedAt:null};
  const completed=await db.consultationBooking.findFirst({
    where:{clientId,status:"COMPLETED",completedAt:{not:null}},
    orderBy:{completedAt:"desc"},select:{completedAt:true},
  });
  return {hasActiveBooking:false,lastCompletedAt:completed?.completedAt??null};
}
