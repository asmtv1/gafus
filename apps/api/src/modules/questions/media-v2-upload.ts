/** Signed direct S3 POST for Questions. No photo bytes traverse Hono. */
import { randomUUID } from "node:crypto";
import { prisma } from "@gafus/prisma";
import { questionsPhotoDailyLimitReached } from "@gafus/core/services/mediaDelivery";
import { questionActor, QuestionError, scheduleQuestionsV2Cleanup } from "@gafus/core/services/questions";
import { questionsV2PresignedPost, questionsV2Head, questionsV2Delivery,
  questionsV2Marker, questionsV2ClientSmallPost, questionsV2FinishClientWebp } from "@gafus/cdn-upload";
import { questionsV2CheckSource, questionsV2SourceKey, questionsV2FinalKeys, questionsV2ValidateManifest,
  type QuestionsV2Mime,type QuestionsV2Manifest } from "@gafus/feed-cloud";
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
async function reservePreparedQuestionsPhoto(userId:string,input:{mime:string;bytes:number}){
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
/** Web and Mobile upload pre-encoded 360/1440 WebP directly to S3 staging.
 * The Core/Cloud Job path remains untouched for Web and older app versions.
 */
export async function reserveClientQuestionsPhoto(userId: string, input: { mediumBytes: number }) {
  enabled();

  if (!Number.isSafeInteger(input.mediumBytes) || input.mediumBytes < 12 || input.mediumBytes > 1_750_000)
    throw new QuestionError("PHOTO_FORMAT", "Некорректный размер фото", 400);
  const reserved = await reservePreparedQuestionsPhoto(userId, { mime: "image/webp", bytes: input.mediumBytes });
  const sourceKey = questionsV2SourceKey(userId, reserved.mediaId, "image/webp");
  try {
    const smallUpload = await questionsV2ClientSmallPost(sourceKey);
    return { ...reserved, smallUpload: { method: "POST" as const,
      url: smallUpload.url, fields: smallUpload.fields, expiresIn: 600 } };
  } catch {
    await prisma.questionV2MediaTask.updateMany({
      where: { mediaId: reserved.mediaId, ownerId: userId, status: "AWAITING_UPLOAD" },
      data: { status: "EXPIRED", cleanupKind: "ALL", cleanupNextAt: new Date() },
    });
    throw unavailable();
  }
}
export async function confirmClientQuestionsPhoto(userId: string, photoId: string) {
  enabled();

  const { task } = await own(userId, photoId);
  if (task.status === "READY" && task.manifest) return { id: photoId, status: "READY" as const };
  if (task.status !== "AWAITING_UPLOAD" || task.sourceMime !== "image/webp")
    throw new QuestionError("PHOTO_CONFIRM_CONFLICT", "Неверный статус загрузки", 409);
  const token = randomUUID();
  const leased = await prisma.questionV2MediaTask.updateMany({
    where: { mediaId: task.mediaId, ownerId: userId, status: "AWAITING_UPLOAD" },
    data: { status: "CLIENT_PROCESSING", attemptToken: token,
      leaseUntil: new Date(Date.now() + 180_000) },
  });
  if (leased.count !== 1)
    throw new QuestionError("PHOTO_CONFIRM_CONFLICT", "Загрузка уже подтверждается", 409);
  try {
    const original = await questionsV2Head(task.sourceKey);
    if (original.bytes !== task.sourceBytes || original.mime !== "image/webp")
      throw Error("QUESTIONS_CLIENT_PHOTO_SOURCE_CHANGED");
    const manifest = await questionsV2FinishClientWebp(task.sourceKey,
      questionsV2FinalKeys(userId, task.mediaId));
    questionsV2ValidateManifest({ mediaId: task.mediaId, ownerId: userId,
      sourceKey: task.sourceKey, sourceMime: "image/webp", sourceBytes: task.sourceBytes }, manifest);
    // The published QuestionPhoto URL and READY task must commit atomically.
    // The worker path updates BOTH in one transaction; keeping that contract
    // prevents a READY photo with an empty URL in Questions lists and answers.
    await prisma.$transaction(async tx => {
      const photo = await tx.questionPhoto.findFirst({ where: { id: task.photoId, ownerId: userId } });
      if (!photo) throw Error("PHOTO_CLIENT_OWNER_CHANGED");
      const updated = await tx.questionV2MediaTask.updateMany({
        where: { mediaId: task.mediaId, ownerId: userId, status: "CLIENT_PROCESSING", attemptToken: token,
          leaseUntil: { gt: new Date() } },
        data: { status: "READY", manifest, attemptToken: null, leaseUntil: null,
          cleanupKind: "SOURCE", cleanupNextAt: new Date(), cleanupCompletedAt: null },
      });
      if (updated.count !== 1) throw Error("PHOTO_CLIENT_COMPLETION_RACE");
      await tx.questionPhoto.update({ where: { id: task.photoId },
        data: { url: questionsV2Marker(manifest.variants.medium.key) } });
    });
    return { id: photoId, status: "READY" as const };
  } catch {
    await prisma.questionV2MediaTask.updateMany({
      where: { mediaId: task.mediaId, ownerId: userId, status: "CLIENT_PROCESSING", attemptToken: token },
      data: { status: "AWAITING_UPLOAD", attemptToken: null, leaseUntil: null },
    });
    throw new QuestionError("PHOTO_NOT_UPLOADED", "Готовые варианты фото не прошли проверку", 409);
  }
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
