/** All Trainer AI history/config SQL belongs to this persistence-owning server adapter. */
import {prisma,type Prisma,type UserRole} from "@gafus/prisma";

/** Compatibility with existing Core settings DTO; all runtime persistence stays here. */
export type TrainerAIConfigMutation = Prisma.TrainerAIConfigUpsertArgs;

export async function readTrainerAIActorRole(actorId:string){
  if(!actorId)return null;
  const actor=await prisma.user.findUnique({where:{id:actorId},select:{role:true}});
  return actor?.role??null;
}

export async function readTrainerAIStreamConfig(trainerId:string,authorizedRoles:readonly UserRole[]){
  if(!trainerId || !authorizedRoles.length)return null;
  return prisma.trainerAIConfig.findFirst({where:{
    trainerId,trainer:{role:{in:[...authorizedRoles]}},
  }});
}
export async function readTrainerAISettingsSummary(trainerId:string,authorizedRoles:readonly UserRole[]){
  if(!trainerId || !authorizedRoles.length)return null;
  const row=await prisma.trainerAIConfig.findFirst({
    where:{trainerId,trainer:{role:{in:[...authorizedRoles]}}},
    select:{model:true,enabled:true,apiKey:true},
  });
  return row?{model:row.model,enabled:row.enabled,hasCustomKey:Boolean(row.apiKey)}:null;
}

export async function readTrainerAIHistoryRows(trainerId:string,skip:number,take:number,authorizedRoles:readonly UserRole[]){
  if(!trainerId || !authorizedRoles.length)throw new Error("FORBIDDEN");
  const where={trainerId,trainer:{role:{in:[...authorizedRoles]}}};
  if(!Number.isSafeInteger(skip)||skip<0||!Number.isInteger(take)||take<1||take>100)
    throw new Error("INVALID_HISTORY_PAGE");
  // Preserve full history but never ask PostgreSQL/Prisma for an out-of-range
  // giant OFFSET. Both reads use the same current-role predicate.
  const total=await prisma.trainerAIChat.count({where});
  if(skip>=total)return {total,messages:[]};
  const messages=await prisma.trainerAIChat.findMany({
    where,orderBy:[{createdAt:"desc"},{id:"desc"}],take,skip,
    select:{id:true,role:true,content:true,tokensUsed:true,attachments:true,createdAt:true},
  });
  return {total,messages};
}

async function lockedAuthorizedTrainer<T>(
  trainerId:string,authorizedRoles:readonly string[],
  act:(tx:Prisma.TransactionClient)=>Promise<T>,
):Promise<T>{
  if(!trainerId || authorizedRoles.length===0)throw new Error("FORBIDDEN");
  return prisma.$transaction(async tx=>{
    const lock=await tx.$queryRaw<{id:string}[]>`
      SELECT "id" FROM "User" WHERE "id" = ${trainerId} FOR UPDATE
    `;
    if(lock.length!==1)throw new Error("FORBIDDEN");
    const actor=await tx.user.findUnique({where:{id:trainerId},select:{role:true}});
    if(!actor || !authorizedRoles.includes(actor.role))throw new Error("FORBIDDEN");
    return act(tx);
  });
}

export async function clearTrainerAIHistoryAuthorized(trainerId:string,authorizedRoles:readonly string[]):Promise<number>{
  return lockedAuthorizedTrainer(trainerId,authorizedRoles,async tx=>{
    const result=await tx.trainerAIChat.deleteMany({where:{trainerId}});
    return result.count;
  });
}

export async function saveTrainerAIExchangeAuthorized(input:{
  trainerId:string;content:string;reply:string;model:string;tokensUsed?:number;
  attachments?:{name?:string;contentType?:string;size?:number}[]|null;
},authorizedRoles:readonly string[]){
  return lockedAuthorizedTrainer(input.trainerId,authorizedRoles,async tx=>{
    await tx.trainerAIChat.create({
      data:{trainerId:input.trainerId,role:"user",content:input.content,model:input.model,
        attachments:input.attachments?.length?input.attachments:undefined},
    });
    return tx.trainerAIChat.create({
      data:{trainerId:input.trainerId,role:"assistant",content:input.reply,model:input.model,
        tokensUsed:input.tokensUsed},
    });
  });
}

export async function saveTrainerAIConfigAuthorized(
  actorId:string,data:TrainerAIConfigMutation,authorizedRoles:readonly string[],
):Promise<void>{
  // Different actor and target: lock the actor's persisted current role,
  // never infer staff privileges from the target user or request body.
  if(!actorId || authorizedRoles.length===0)throw new Error("Недостаточно прав доступа");
  await prisma.$transaction(async tx=>{
    const rows=await tx.$queryRaw<{id:string}[]>`
      SELECT "id" FROM "User" WHERE "id" = ${actorId} FOR UPDATE
    `;
    const actor=rows.length===1?await tx.user.findUnique({
      where:{id:actorId},select:{role:true},
    }):null;
    if(!actor || !authorizedRoles.includes(actor.role))
      throw new Error("Недостаточно прав доступа");
    await tx.trainerAIConfig.upsert(data);
  });
}
