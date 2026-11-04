/** Signed direct S3 POST for Questions. No photo bytes traverse Hono. */
import { randomUUID } from "node:crypto";
import { prisma } from "@gafus/prisma";
import { questionsCanRetryConfirmedPhoto, questionsPhotoDailyLimitReached } from "@gafus/core/services/mediaDelivery";
import { questionActor, QuestionError, scheduleQuestionsV2Cleanup } from "@gafus/core/services/questions";
import { questionsV2PresignedPost, questionsV2Head, questionsV2Delivery,
  questionsV2Marker } from "@gafus/cdn-upload";
import { questionsV2CheckSource, questionsV2SourceKey,
  type QuestionsV2Mime,type QuestionsV2Manifest } from "@gafus/feed-cloud";
import { enqueueQuestionsPhoto } from "@gafus/queues";
function enabled(){
  if(process.env.QUESTIONS_V2_MEDIA_ENABLED!=="true")
    throw new QuestionError("PHOTO_V2_UNAVAILABLE","Сервис фотографий ещё не настроен",503);
}
const unavailable=()=>new QuestionError("PHOTO_S3_UNAVAILABLE",
  "Хранилище фотографий временно недоступно",503);
async function own(userId:string,photoId:string){
  await questionActor(userId);
  const photo=await prisma.questionPhoto.findFirst({where:{id:photoId,ownerId:userId}});
  const task=photo?await prisma.questionV2MediaTask.findUnique({where:{photoId}}):null;
  if(!photo||!task)throw new QuestionError("PHOTO_FORBIDDEN","Фото недоступно",403);
  return {photo,task};
}
export async function reserveQuestionsPhoto(userId:string,input:{mime:string;bytes:number}){
  enabled();
  let mime:QuestionsV2Mime;
  try{mime=questionsV2CheckSource(input.mime,input.bytes);}
  catch{throw new QuestionError("PHOTO_FORMAT","Допустимы JPEG, PNG и WebP до 10 МБ",400);}
  const mediaId=randomUUID();
  const sourceKey=questionsV2SourceKey(userId,mediaId,mime);
  const photo=await prisma.$transaction(async tx=>{
    await questionActor(userId,tx,true);
    const count=await tx.questionPhoto.count({where:{ownerId:userId,
      createdAt:{gte:new Date(Date.now()-86400000)}}});
    if(questionsPhotoDailyLimitReached(count))throw new QuestionError("UPLOAD_LIMIT","Лимит фото за сутки исчерпан",429);
    const reserved=await tx.questionPhoto.create({
      data:{ownerId:userId,storagePath:"questions-v2:"+sourceKey,url:""},
    });
    await tx.questionV2MediaTask.create({
      data:{mediaId,photoId:reserved.id,ownerId:userId,sourceKey,
        sourceMime:mime,sourceBytes:input.bytes,status:"AWAITING_UPLOAD"},
    });
    return reserved;
  });
  try{
    const form=await questionsV2PresignedPost(sourceKey,mime,input.bytes);
    return {id:photo.id,mediaId,status:"AWAITING_UPLOAD" as const,
      upload:{method:"POST" as const,url:form.url,fields:form.fields,expiresIn:600}};
  }catch{
    await prisma.questionV2MediaTask.updateMany({
      where:{mediaId,status:"AWAITING_UPLOAD"},
      data:{status:"EXPIRED",cleanupKind:"ALL",cleanupNextAt:new Date()}});
    throw unavailable();
  }
}
export async function confirmQuestionsPhoto(userId:string,photoId:string){
  enabled();
  const {task}=await own(userId,photoId);
  if(task.status!=="AWAITING_UPLOAD"){
    if(questionsCanRetryConfirmedPhoto(task.status)){
      if(task.status==="QUEUED")void enqueueQuestionsPhoto(task.mediaId).catch(()=>{});
      return {id:photoId,status:task.status};
    }
    throw new QuestionError("PHOTO_UPLOAD_EXPIRED","Загрузка отменена или истекла",409);
  }
  try{
    const head=await questionsV2Head(task.sourceKey);
    if(head.bytes!==task.sourceBytes||head.mime!==task.sourceMime)
      throw Error("SOURCE_MISMATCH");
  }catch{
    throw new QuestionError("PHOTO_NOT_UPLOADED","Фото не загружено или не прошло проверку",409);
  }
  const done=await prisma.questionV2MediaTask.updateMany({
    where:{mediaId:task.mediaId,ownerId:userId,status:"AWAITING_UPLOAD"},
    data:{status:"QUEUED",nextAttemptAt:new Date()}});
  if(!done.count){
    // Another confirmation/discard raced with our CAS. Re-read exactly once;
    // recursive confirmations can spin forever if a row remains AWAITING_UPLOAD.
    const latest=await prisma.questionV2MediaTask.findUnique({where:{mediaId:task.mediaId}});
    if(latest && questionsCanRetryConfirmedPhoto(latest.status)){
      if(latest.status==="QUEUED")void enqueueQuestionsPhoto(latest.mediaId).catch(()=>{});
      return {id:photoId,status:latest.status};
    }
    throw new QuestionError("PHOTO_CONFIRM_CONFLICT",
      "Не удалось подтвердить фото. Проверьте статус загрузки",409);
  }
  // Redis errors never roll back an S3 upload or lose the durable QUEUED row.
  void enqueueQuestionsPhoto(task.mediaId).catch(()=>{});
  return {id:photoId,status:"QUEUED" as const};
}
export async function statusQuestionsPhoto(userId:string,photoId:string){
  enabled();
  const {task}=await own(userId,photoId);
  const result:{id:string;status:string;errorCode?:string|null;url?:string;
    smallUrl?:string;width?:number;height?:number;smallWidth?:number;smallHeight?:number}={
    id:photoId,status:task.status,
    ...(task.status==="FAILED"?{errorCode:task.errorCode}:{}),
  };
  if(task.status!=="READY"||!task.manifest)return result;
  const m=task.manifest as unknown as QuestionsV2Manifest;
  const small=await questionsV2Delivery(questionsV2Marker(m.variants.small.key));
  const medium=await questionsV2Delivery(questionsV2Marker(m.variants.medium.key));
  const url=medium.url,smallUrl=small.url;
  return {...result,url,smallUrl,
    ...(medium.fallbackUrl?{fallbackUrl:medium.fallbackUrl,fallbackSmallUrl:small.fallbackUrl}:{}),width:m.variants.medium.width,height:m.variants.medium.height,
    smallWidth:m.variants.small.width,smallHeight:m.variants.small.height};
}
export async function discardQuestionsV2Photo(userId:string,photoId:string){
  enabled();
  await prisma.$transaction(async tx=>{
    await tx.$queryRawUnsafe('SELECT id FROM "User" WHERE id = $1 FOR NO KEY UPDATE',userId);
    const photo=await tx.questionPhoto.findFirst({where:{id:photoId,ownerId:userId,
      questionId:null,answerId:null}});
    if(!photo)throw new QuestionError("PHOTO_FORBIDDEN","Фото недоступно",403);
    const task=await tx.questionV2MediaTask.findUnique({where:{photoId}});
    if(!task)throw new QuestionError("PHOTO_FORBIDDEN","Фото недоступно",403);
    await scheduleQuestionsV2Cleanup(tx,[photoId]);
    await tx.questionPhoto.delete({where:{id:photoId}});
  });
  return {id:photoId};
}
