/** Chat 2.0 V2, explicitly scoped Cloud.ru PUBLIC chat bucket. No fallback. */
import {S3Client, HeadObjectCommand, DeleteObjectCommand} from "@aws-sdk/client-s3";
import {verifyClientMp4,copyVerifiedClientMp4} from "./clientVideoMp4.js";
import {createPresignedPost} from "@aws-sdk/s3-presigned-post";
import {signClientWebpStaging,verifyClientWebp,copyVerifiedClientWebp} from "./clientPhotoRenditions.js";
const bucket="gafus-chat2-media-2026";
const sourcePattern=/^chat2\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\/[a-f0-9-]{36}\/incoming\/source\.(?:jpg|png|webp|heic|heif|mp4|mov|webm)$/i;
const mimePattern=/^(?:image\/(?:jpeg|png|webp|heic|heif)|video\/(?:mp4|quicktime|webm))$/;
function storage(){
  const e=process.env;
  if(e.CHAT2_V2_MEDIA_ENABLED!=="true" || e.CHAT2_S3_ENDPOINT!=="https://s3.cloud.ru" ||
     e.CHAT2_S3_BUCKET!==bucket || !e.CHAT2_S3_ACCESS_KEY_ID || !e.CHAT2_S3_SECRET_ACCESS_KEY)
    throw new Error("CHAT2_V2_STORAGE_NOT_CONFIGURED");
  return new S3Client({endpoint:e.CHAT2_S3_ENDPOINT,forcePathStyle:true,region:"ru-central-1",
    maxAttempts:2,requestChecksumCalculation:"WHEN_REQUIRED",responseChecksumValidation:"WHEN_REQUIRED",
    credentials:{accessKeyId:e.CHAT2_S3_ACCESS_KEY_ID,secretAccessKey:e.CHAT2_S3_SECRET_ACCESS_KEY}});
}
function assertSource(key:string,mime:string,bytes:number){
  if(!sourcePattern.test(key)||!mimePattern.test(mime)||!Number.isSafeInteger(bytes)||bytes<10||
     bytes>(mime.startsWith("video/")?200:10)*1024*1024)throw Error("CHAT2_V2_UNTRUSTED_UPLOAD");
}
/** Browser uploads source directly. Exact key/content-type/length; no anonymous write. */
export async function chat2V2DirectUploadForm(key:string,mime:string,bytes:number){
  assertSource(key,mime,bytes);
  const client=storage();
  try{
    return await createPresignedPost(client,{Bucket:bucket,Key:key,Expires:600,
      Fields:{"Content-Type":mime,success_action_status:"204"},
      // S3 checks the multipart envelope length, not only file bytes.
      // Confirm independently HEAD-verifies exact object length and MIME.
      Conditions:[["content-length-range",bytes,bytes+24*1024],
        ["eq","$Content-Type",mime],["eq","$key",key],["eq","$success_action_status","204"]]});
  }finally{client.destroy();}
}
/** Signed private staging copy; only server-owned final keys may be published. */
export function chat2V2ClientSmallKey(sourceKey:string):string{
  assertSource(sourceKey,"image/webp",12);
  if(!sourceKey.endsWith("/source.webp"))throw Error("CHAT2_CLIENT_PHOTO_SOURCE_INVALID");
  return sourceKey.replace(/source\.webp$/,"small.webp");
}
/** Signed one-off WebP thumbnail generated on the user's device. */
export function chat2V2ClientVideoPosterKey(sourceKey:string):string{
  assertSource(sourceKey,"video/mp4",12);
  if(!sourceKey.endsWith("/incoming/source.mp4"))throw Error("CHAT2_VIDEO_POSTER_SOURCE_DENIED");
  return sourceKey.replace(/source\.mp4$/,"poster.webp");
}
export async function chat2V2ClientVideoPosterPost(sourceKey:string){
  const client=storage();
  try{return await signClientWebpStaging(client,bucket,
    chat2V2ClientVideoPosterKey(sourceKey),1_750_000);}
  finally{client.destroy();}
}
export async function chat2V2ClientSmallPost(sourceKey:string){
  const client=storage();
  try{return await signClientWebpStaging(client,bucket,chat2V2ClientSmallKey(sourceKey),1_750_000);}
  finally{client.destroy();}
}
export async function chat2V2FinishClientWebp(sourceKey:string,keys:{small:string;medium:string}){
  const staged=chat2V2ClientSmallKey(sourceKey);
  const base=sourceKey.slice(0,sourceKey.indexOf("/incoming/source.webp"));
  if(keys.small!==base+"/v1/image/s.webp"||keys.medium!==base+"/v1/image/m.webp")
    throw Error("CHAT2_CLIENT_PHOTO_KEYS_INVALID");
  const client=storage();
  try{
    const [small,medium]=await Promise.all([
      verifyClientWebp(client,bucket,staged,360,1_750_000),
      verifyClientWebp(client,bucket,sourceKey,1440,1_750_000),
    ]);
    if(medium.width<small.width||medium.height<small.height||
       Math.abs(small.width/small.height-medium.width/medium.height)>0.012)
      throw Error("CHAT2_CLIENT_PHOTO_DIMENSIONS_INVALID");
    await Promise.all([
      copyVerifiedClientWebp(client,bucket,staged,keys.small,small),
      copyVerifiedClientWebp(client,bucket,sourceKey,keys.medium,medium),
    ]);
    return {kind:"image" as const,width:medium.width,height:medium.height,keys,
      imageSizes:{small:{width:small.width,height:small.height},
        medium:{width:medium.width,height:medium.height}}};
  }finally{client.destroy();}
}

/** HEAD checks the uploaded original, not a user-supplied URL or bucket. */
export async function chat2V2CheckOriginal(key:string,mime:string,bytes:number){
  assertSource(key,mime,bytes);
  const client=storage();
  try{
    const head=await client.send(new HeadObjectCommand({Bucket:bucket,Key:key}),
      {abortSignal:AbortSignal.timeout(10_000)});
    if(head.ContentLength!==bytes||head.ContentType!==mime)
      throw new Error("CHAT2_V2_ORIGINAL_SIZE_OR_MIME_MISMATCH");
    return {bytes:head.ContentLength,mime:head.ContentType,etag:head.ETag??null};
  }finally{client.destroy();}
}


/** Chat-only durable cleanup primitive. Exactly owner-derived source/final keys;
 * callers must CAS task into READY or terminal FAILED/EXPIRED before invoking.
 * Retry-safe: S3 DELETE of a missing key is successful. No other buckets. */
export async function chat2V2DeleteObjects(keys: readonly string[], injectedClient?:S3Client):Promise<void>{
  const keyPattern=/^chat2\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\/[a-f0-9-]{36}\/(?:incoming\/(?:small|poster)\.webp|incoming\/source\.(?:jpg|png|webp|heic|heif|mp4|mov|webm)|v1\/(?:image\/[sm]\.webp|poster\.webp|video\/(?:360|720)\.mp4))$/i;
  if(keys.length<1||keys.length>7||new Set(keys).size!==keys.length||keys.some(key=>!keyPattern.test(key)))
    throw Error("CHAT2_DELETE_UNTRUSTED_KEYS");
  const client=injectedClient??storage();
  try{
    // Bounded parallelism, no per-key HEAD and no directory moves.
    const answers=await Promise.allSettled(keys.map(key=>client.send(new DeleteObjectCommand({Bucket:bucket,Key:key}),
      {abortSignal:AbortSignal.timeout(12_000)})));
    for(const result of answers)if(result.status==='rejected')throw new Error('CHAT2_CLEANUP_S3_RETRY');
  }finally{if(!injectedClient)client.destroy();}
}

/** Client H.264 MP4 is inspected in S3, then copied into an immutable 720p key.
 * Optional 360p transcoding remains an independent Cloud.ru Job.
 */
export async function chat2V2FinishClientMp4(sourceKey:string,finalKey:string,bytes:number){
  if(!/^chat2\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\/[a-f0-9-]{36}\/incoming\/source\.mp4$/i.test(sourceKey)||
      finalKey!==sourceKey.replace(/\/incoming\/source\.mp4$/,"/v1/video/720.mp4"))
    throw Error("CHAT2_CLIENT_VIDEO_KEYS_INVALID");
  const client=storage();
  try{
    const posterSource=chat2V2ClientVideoPosterKey(sourceKey);
    const posterTarget=finalKey.replace(/video\/720\.mp4$/,"poster.webp");
    if(posterTarget===finalKey||posterTarget!==sourceKey.replace(/incoming\/source\.mp4$/,"v1/poster.webp"))
      throw Error("CHAT2_VIDEO_POSTER_TARGET_DENIED");
    const [valid,poster]=await Promise.all([
      verifyClientMp4(client,bucket,sourceKey,bytes),
      verifyClientWebp(client,bucket,posterSource,480,1_750_000),
    ]);
    if(Math.abs(valid.width/valid.height-poster.width/poster.height)>0.015)
      throw Error("CHAT2_VIDEO_POSTER_ASPECT_MISMATCH");
    await Promise.all([
      copyVerifiedClientMp4(client,bucket,sourceKey,finalKey,valid),
      copyVerifiedClientWebp(client,bucket,posterSource,posterTarget,poster),
    ]);
    return {width:valid.width,height:valid.height,durationSeconds:valid.durationSeconds,
      bytes:valid.bytes,posterKey:posterTarget};
  }finally{client.destroy();}
}
