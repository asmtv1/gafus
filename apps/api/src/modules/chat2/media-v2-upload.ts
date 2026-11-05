/** Chat2 V2 direct Cloud.ru POST lifecycle, intentionally disabled until cutover. */
import {randomUUID} from "node:crypto";
import {prisma} from "@gafus/prisma";
import { chat2CanRetryConfirmedUpload, chat2CanAttachVerifiedOriginal, chat2MediaWithoutRendition } from "@gafus/core/services/mediaDelivery";
import {chat2V2SourceKey,chat2V2FinalKeys,chat2V2ClassifySource,validateChat2V2Manifest,
  type Chat2V2Mime,type Chat2V2Job,type Chat2V2Manifest} from "@gafus/feed-cloud";
import {chat2V2DirectUploadForm,chat2V2CheckOriginal,chat2V2ClientSmallPost,
  chat2V2FinishClientWebp,chat2V2FinishClientMp4,
  chat2V2ClientVideoPosterPost} from "@gafus/cdn-upload";
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
export async function reserveChat2V2Upload(userId:string,conversationId:string,
  input:{name:string;mime:string;bytes:number},clientPhoto=false){
  enabled();
  // Legacy image uploads are removed. Only /client-reserve accepts final WebP.
  if(!clientPhoto && input.mime.startsWith("image/"))
    fail("MEDIA_CLIENT_WEBP_REQUIRED",410,"Отправьте обработанную на устройстве фотографию");
  if(clientPhoto){
    if(input.mime!=="image/webp"||
       input.bytes<12||input.bytes>1_750_000)
      fail("MEDIA_V2_CLIENT_UNAVAILABLE",503,"Ускоренная загрузка фото не включена");
  }else if(input.mime!=="video/mp4")
    fail("MEDIA_CLIENT_H264_REQUIRED",410,"Подготовьте MP4 H.264 на устройстве");
  await writeGate(userId,conversationId);
  const kind=chat2V2ClassifySource(input.mime,input.bytes);
  const mediaId=randomUUID();const sourceKey=chat2V2SourceKey(conversationId,userId,mediaId,input.mime as Chat2V2Mime);
  const name=safeName(input.name);
  // Reserve before producing any presigned URL. Durable status is still only
  // AWAITING_UPLOAD; missing/abandoned uploads can be expired separately.
  await prisma.chat2V2MediaTask.create({data:{mediaId,conversationId,ownerId:userId,name,
    sourceKey,sourceMime:input.mime,sourceBytes:input.bytes,status:"AWAITING_UPLOAD"}});
  let form:Awaited<ReturnType<typeof chat2V2DirectUploadForm>>;
  let small:Awaited<ReturnType<typeof chat2V2ClientSmallPost>>|undefined;
  let poster:Awaited<ReturnType<typeof chat2V2ClientVideoPosterPost>>|undefined;
  try{
    form=await chat2V2DirectUploadForm(sourceKey,input.mime,input.bytes);
    if(clientPhoto)small=await chat2V2ClientSmallPost(sourceKey);
    if(!clientPhoto&&kind.kind==="video")poster=await chat2V2ClientVideoPosterPost(sourceKey);
  }
  catch{
    await prisma.chat2V2MediaTask.deleteMany({where:{mediaId,ownerId:userId,status:"AWAITING_UPLOAD"}})
      .catch(()=>undefined);
    throw new Chat2Error("MEDIA_V2_S3_UNAVAILABLE",503,"Хранилище временно недоступно");
  }
  return {mediaId,status:"AWAITING_UPLOAD" as const,name,kind:kind.kind,
    upload:{url:form.url,fields:form.fields,method:"POST" as const,expiresIn:600},
    ...(small?{smallUpload:{url:small.url,fields:small.fields,method:"POST" as const,expiresIn:600}}:{}),
    ...(poster?{posterUpload:{url:poster.url,fields:poster.fields,method:"POST" as const,expiresIn:600}}:{})};
}
/** Original is uploaded and verified, but processing begins only after a message is committed. */
export async function confirmChat2V2Upload(userId:string,conversationId:string,mediaId:string){
  enabled();await writeGate(userId,conversationId);
  let task=await prisma.chat2V2MediaTask.findFirst({where:{mediaId,conversationId,ownerId:userId}});
  if(!task)throw new Chat2Error("MEDIA_V2_NOT_FOUND",404,"Загрузка не найдена");
  // If API died after S3 COPY but before READY commit, fencing the expired
  // lease makes a repeat safe. No second uploader can overtake a live lease.
  if(task.status==="CLIENT_PROCESSING" && task.leaseUntil &&
      task.leaseUntil.getTime()<Date.now()) {
    await prisma.chat2V2MediaTask.updateMany({where:{mediaId,conversationId,ownerId:userId,
      status:"CLIENT_PROCESSING",attemptToken:task.attemptToken,
      leaseUntil:{lt:new Date()}},data:{status:"AWAITING_UPLOAD",
        attemptToken:null,leaseUntil:null}});
    task=await prisma.chat2V2MediaTask.findFirst({where:{mediaId,conversationId,ownerId:userId}});
    if(!task)throw new Chat2Error("MEDIA_V2_NOT_FOUND",404,"Загрузка не найдена");
  }
  if(!task)throw new Chat2Error("MEDIA_V2_NOT_FOUND",404,"Загрузка не найдена");
  if(task.sourceMime!=="video/mp4")
    fail("MEDIA_CLIENT_H264_REQUIRED",410,"Видео должно быть подготовлено на устройстве");
  if(task.status==="READY"&&task.manifest)return {mediaId,status:"READY" as const};
  if(task.status!=="AWAITING_UPLOAD")
    fail("MEDIA_V2_INVALID_STATUS",409,"Видео уже обрабатывается либо загрузка устарела");
  const token=randomUUID();
  const leased=await prisma.chat2V2MediaTask.updateMany({
    where:{mediaId,conversationId,ownerId:userId,status:"AWAITING_UPLOAD"},
    data:{status:"CLIENT_PROCESSING",attemptToken:token,
      leaseUntil:new Date(Date.now()+180_000)},
  });
  if(leased.count!==1)fail("MEDIA_V2_RACE",409,"Вложение уже подтверждается");
  try{
    await chat2V2CheckOriginal(task.sourceKey,task.sourceMime,task.sourceBytes);
    const keys=chat2V2FinalKeys(conversationId,userId,mediaId);
    // Bounded S3 Range GET reads only ftyp/moov metadata. Verified S3 COPY
    // creates a server-authorized immutable final; no container transcode.
    const prepared=await chat2V2FinishClientMp4(task.sourceKey,
      keys.video.variants[720],task.sourceBytes);
    const manifest:Chat2V2Manifest={kind:"video",width:prepared.width,
      height:prepared.height,durationSeconds:prepared.durationSeconds,
      posterKey:prepared.posterKey,
      renditions:[{quality:720,key:keys.video.variants[720],
        width:prepared.width,height:prepared.height,bytes:prepared.bytes}]};
    const job:Chat2V2Job={conversationId,ownerId:userId,mediaId,
      sourceKey:task.sourceKey,sourceMime:"video/mp4",sourceBytes:task.sourceBytes};
    validateChat2V2Manifest(job,manifest);
    const result=await prisma.chat2V2MediaTask.updateMany({
      where:{mediaId,conversationId,ownerId:userId,status:"CLIENT_PROCESSING",attemptToken:token},
      data:{status:"READY",manifest,attemptToken:null,leaseUntil:null,errorCode:null,
        // Only after message bind will the 360p Cloud.ru worker be eligible.
        nextAttemptAt:new Date("9999-01-01T00:00:00Z"),attempts:0,
        cleanupKind:"SOURCE",cleanupNextAt:new Date(),cleanupCompletedAt:null},
    });
    if(result.count!==1)throw Error("CHAT2_CLIENT_MP4_FINALIZE_RACE");
    return {mediaId,status:"READY" as const};
  }catch(error){
    await prisma.chat2V2MediaTask.updateMany({
      where:{mediaId,conversationId,ownerId:userId,status:"CLIENT_PROCESSING",attemptToken:token},
      data:{status:"AWAITING_UPLOAD",attemptToken:null,leaseUntil:null},
    });
    fail("MEDIA_V2_CLIENT_VIDEO_UNVERIFIED",409,
      "Видео не прошло проверку MP4/H.264. Перекодируйте ролик и повторите отправку");
  }
}
/** Client WebP finalization: verify/decode only, S3 server-side COPY, no video or photo Job. */
export async function confirmClientChat2V2Upload(userId:string,conversationId:string,mediaId:string){
  enabled();

  await writeGate(userId,conversationId);
  const task=await prisma.chat2V2MediaTask.findFirst({where:{mediaId,conversationId,ownerId:userId}});
  if(!task)return fail("MEDIA_V2_NOT_FOUND",404,"Загрузка не найдена");
  if(task.status==="READY"&&task.manifest)return {mediaId,status:"READY" as const};
  if(task.status!=="AWAITING_UPLOAD"||task.sourceMime!=="image/webp")
    fail("MEDIA_V2_INVALID_STATUS",409,"Неверный статус загрузки");
  const token=randomUUID();
  const leased=await prisma.chat2V2MediaTask.updateMany({
    where:{mediaId,conversationId,ownerId:userId,status:"AWAITING_UPLOAD"},
    data:{status:"CLIENT_PROCESSING",attemptToken:token,leaseUntil:new Date(Date.now()+180_000)},
  });
  if(leased.count!==1)fail("MEDIA_V2_RACE",409,"Файл уже подтверждается");
  try{
    await chat2V2CheckOriginal(task.sourceKey,task.sourceMime,task.sourceBytes);
    const manifest=await chat2V2FinishClientWebp(task.sourceKey,
      chat2V2FinalKeys(conversationId,userId,mediaId).image);
    const job:Chat2V2Job={conversationId,ownerId:userId,mediaId,
      sourceKey:task.sourceKey,sourceMime:"image/webp",sourceBytes:task.sourceBytes};
    validateChat2V2Manifest(job,manifest);
    const result=await prisma.chat2V2MediaTask.updateMany({
      where:{mediaId,conversationId,ownerId:userId,status:"CLIENT_PROCESSING",attemptToken:token},
      data:{status:"READY",manifest,attemptToken:null,leaseUntil:null,errorCode:null,
        cleanupKind:"SOURCE",cleanupNextAt:new Date()},
    });
    if(result.count!==1)throw Error("CHAT2_CLIENT_COMPLETE_RACE");
    return {mediaId,status:"READY" as const};
  }catch{
    await prisma.chat2V2MediaTask.updateMany({
      where:{mediaId,conversationId,ownerId:userId,status:"CLIENT_PROCESSING",attemptToken:token},
      data:{status:"AWAITING_UPLOAD",attemptToken:null,leaseUntil:null},
    });
    fail("MEDIA_V2_CLIENT_UNVERIFIED",409,"Не удалось проверить варианты фото в S3");
  }
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
