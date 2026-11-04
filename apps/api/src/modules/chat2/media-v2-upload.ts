/** Chat2 V2 direct Cloud.ru POST lifecycle, intentionally disabled until cutover. */
import {randomUUID} from "node:crypto";
import {prisma} from "@gafus/prisma";
import { chat2CanRetryConfirmedUpload, chat2CanAttachVerifiedOriginal, chat2MediaWithoutRendition } from "@gafus/core/services/mediaDelivery";
import {chat2V2SourceKey,chat2V2ClassifySource,validateChat2V2Manifest,
  type Chat2V2Mime,type Chat2V2Job,type Chat2V2Manifest} from "@gafus/feed-cloud";
import {chat2V2DirectUploadForm,chat2V2CheckOriginal} from "@gafus/cdn-upload";
import {writeGate,readGate,Chat2Error} from "./service.js";
import { chat2V2Delivery } from "./media-v2-delivery.js";
const fail=(code:string,status:Chat2Error["status"],message:string):never=>{
  throw new Chat2Error(code,status,message);
};
function enabled(){
  if(process.env.CHAT2_V2_MEDIA_ENABLED!=="true" || process.env.CHAT2_V2_CORE_ENABLED!=="true")
    fail("MEDIA_V2_UNAVAILABLE",503,"Новый сервис медиа ещё не готов");
}
function safeName(raw:string){return raw.replace(/[^\p{L}\p{N} ._-]/gu,"").trim().slice(0,180)||"Вложение";}
export async function reserveChat2V2Upload(userId:string,conversationId:string,input:{name:string;mime:string;bytes:number}){
  enabled();
  // Never accept a browser original into S3 when no verified Job can take it.
  if(process.env.CHAT2_PROCESSOR_READY!=="true")
    fail("MEDIA_V2_PROCESSOR_UNAVAILABLE",503,"Обработка медиа временно недоступна");
  await writeGate(userId,conversationId);
  const kind=chat2V2ClassifySource(input.mime,input.bytes);
  const mediaId=randomUUID();const sourceKey=chat2V2SourceKey(conversationId,userId,mediaId,input.mime as Chat2V2Mime);
  const name=safeName(input.name);
  // Reserve before producing any presigned URL. Durable status is still only
  // AWAITING_UPLOAD; missing/abandoned uploads can be expired separately.
  await prisma.chat2V2MediaTask.create({data:{mediaId,conversationId,ownerId:userId,name,
    sourceKey,sourceMime:input.mime,sourceBytes:input.bytes,status:"AWAITING_UPLOAD"}});
  let form:Awaited<ReturnType<typeof chat2V2DirectUploadForm>>;
  try{form=await chat2V2DirectUploadForm(sourceKey,input.mime,input.bytes);}
  catch{
    await prisma.chat2V2MediaTask.deleteMany({where:{mediaId,ownerId:userId,status:"AWAITING_UPLOAD"}})
      .catch(()=>undefined);
    throw new Chat2Error("MEDIA_V2_S3_UNAVAILABLE",503,"Хранилище временно недоступно");
  }
  return {mediaId,status:"AWAITING_UPLOAD" as const,name,kind:kind.kind,
    upload:{url:form.url,fields:form.fields,method:"POST" as const,expiresIn:600}};
}
/** Original is uploaded and verified, but processing begins only after a message is committed. */
export async function confirmChat2V2Upload(userId:string,conversationId:string,mediaId:string){
  enabled();await writeGate(userId,conversationId);
  const task=await prisma.chat2V2MediaTask.findFirst({where:{mediaId,conversationId,ownerId:userId}});
  if(!task)throw new Chat2Error("MEDIA_V2_NOT_FOUND",404,"Загрузка не найдена");
  if(task.status!=="AWAITING_UPLOAD"){
    if(chat2CanRetryConfirmedUpload(task.status))
      return {mediaId,status:task.status};
    fail("MEDIA_V2_INVALID_STATUS",409,"Эту загрузку нельзя подтвердить");
  }
  try{await chat2V2CheckOriginal(task.sourceKey,task.sourceMime,task.sourceBytes);}
  catch{fail("MEDIA_V2_SOURCE_NOT_READY",409,"Файл не загружен или не прошёл проверку");}
  const committed=await prisma.chat2V2MediaTask.updateMany({
    where:{mediaId,conversationId,ownerId:userId,status:"AWAITING_UPLOAD"},
    data:{status:"UPLOADED",errorCode:null}
  });
  if(!committed.count)fail("MEDIA_V2_RACE",409,"Состояние загрузки изменилось");
  // Not QUEUED until sendMessage binds the attachment in the same transaction.
  return {mediaId,status:"UPLOADED" as const};
}
/** Temporary owner-only polling. Attachment registration is a distinct atomic step. */
export async function getChat2V2UploadStatus(userId:string,conversationId:string,mediaId:string){
  enabled();await readGate(userId,conversationId);
  const task=await prisma.chat2V2MediaTask.findFirst({where:{mediaId,conversationId,ownerId:userId}});
  if(!task)throw new Chat2Error("MEDIA_V2_NOT_FOUND",404,"Загрузка не найдена");
  if(task.status!=="READY"||!task.manifest)return {mediaId,status:task.status};
  const job:Chat2V2Job={conversationId:task.conversationId,ownerId:task.ownerId,
    mediaId:task.mediaId,sourceMime:task.sourceMime as Chat2V2Mime,
    sourceBytes:task.sourceBytes,sourceKey:task.sourceKey};
  const manifest=task.manifest as unknown as Chat2V2Manifest;
  validateChat2V2Manifest(job,manifest);
  return {mediaId,status:"READY" as const,name:task.name,kind:manifest.kind,
    ...chat2V2Delivery(manifest),sourceBytes:task.sourceBytes};
}

/** A verified uploaded original may be attached before processing completes.
 * Chat2Media controls message ownership; no rendition URL is disclosed until
 * READY. The marker can never be mistaken for an S3 object key.
 */
export const chat2V2Marker = (mediaId: string) => `chat2-v2:${mediaId}`;
export async function attachChat2V2Media(userId: string, conversationId: string, mediaId: string) {
  enabled();
  await writeGate(userId,conversationId);
  const task=await prisma.chat2V2MediaTask.findFirst({
    where:{mediaId,conversationId,ownerId:userId,status:{in:["UPLOADED","QUEUED","PROCESSING","READY"]}},
  });
  if(!task || !chat2CanAttachVerifiedOriginal(task.status))
    return fail("MEDIA_V2_NOT_READY",409,"Файл ещё не загружен");
  const kind=chat2V2ClassifySource(task.sourceMime,task.sourceBytes).kind;
  if(task.status==="READY"){
    if(!task.manifest)fail("MEDIA_V2_NOT_READY",409,"Не найден результат обработки");
    const job:Chat2V2Job={conversationId,ownerId:userId,mediaId,
      sourceMime:task.sourceMime as Chat2V2Mime,sourceBytes:task.sourceBytes,sourceKey:task.sourceKey};
    validateChat2V2Manifest(job,task.manifest as unknown as Chat2V2Manifest);
  }
  const marker=chat2V2Marker(mediaId);
  const row=await prisma.chat2Media.upsert({
    where:{objectKey:marker},
    update:{},
    create:{conversationId,ownerId:userId,objectKey:marker,name:task.name,
      kind,mime:kind==="image"?"image/webp":"video/mp4",
      bytes:task.sourceBytes,status:"READY"},
  });
  if(row.ownerId!==userId||row.conversationId!==conversationId||row.status!=="READY")
    fail("MEDIA_V2_ALREADY_USED",409,"Вложение уже используется");
  return {id:row.id,name:row.name,kind:row.kind,mime:row.mime,bytes:row.bytes};
}

/** Existing chat message authorization remains mandatory before disclosing URLs. */
export async function readChat2V2Media(userId:string,conversationId:string,mediaId:string){
  await readGate(userId,conversationId);
  const task=await prisma.chat2V2MediaTask.findFirst({
    where:{mediaId,conversationId},
  });
  if(!task)return fail("MEDIA_V2_NOT_FOUND",404,"Вложение недоступно");
  // No object URL for unprocessed media, even for authorized room members.
  // This state is returned only for a Chat2Media row bound to a real message.
  if(chat2MediaWithoutRendition(task.status))
    return {url:"",status:task.status,name:task.name,mime:task.sourceMime,expiresIn:0};
  if(task.status!=="READY" || !task.manifest)
    return fail("MEDIA_V2_NOT_FOUND",404,"Вложение недоступно");
  const job:Chat2V2Job={conversationId,ownerId:task.ownerId,mediaId,
    sourceMime:task.sourceMime as Chat2V2Mime,sourceBytes:task.sourceBytes,sourceKey:task.sourceKey};
  const manifest=task.manifest as unknown as Chat2V2Manifest;
  validateChat2V2Manifest(job,manifest);
  return {...chat2V2Delivery(manifest),name:task.name,
    mime:manifest.kind==="image"?"image/webp":"video/mp4",expiresIn:300};
}

/** Do not delete S3 inside the user request. A durable task and worker own it. */
export async function discardChat2V2Media(userId:string,conversationId:string,attachmentId:string,mediaId:string){
  await writeGate(userId,conversationId);
  const now=new Date();
  await prisma.$transaction(async tx=>{
    const removed=await tx.chat2Media.updateMany({
      where:{id:attachmentId,conversationId,ownerId:userId,messageId:null,
        objectKey:chat2V2Marker(mediaId),status:"READY"},
      data:{status:"REMOVING"},
    });
    if(removed.count!==1)fail("MEDIA_V2_ALREADY_USED",409,"Вложение уже используется");
    const task=await tx.chat2V2MediaTask.updateMany({
      where:{mediaId,conversationId,ownerId:userId,status:{in:["UPLOADED","QUEUED","READY"]}},
      data:{status:"EXPIRED",cleanupKind:"ALL",cleanupNextAt:now,cleanupCompletedAt:null},
    });
    if(task.count!==1)fail("MEDIA_V2_NOT_READY",409,"Вложение недоступно");
    await tx.chat2Media.delete({where:{id:attachmentId}});
  });
  return {deleted:true};
}
