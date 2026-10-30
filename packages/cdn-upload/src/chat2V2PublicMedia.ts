/** Chat 2.0 V2, explicitly scoped Cloud.ru PUBLIC chat bucket. No fallback. */
import {S3Client, HeadObjectCommand, DeleteObjectCommand} from "@aws-sdk/client-s3";
import {createPresignedPost} from "@aws-sdk/s3-presigned-post";
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
      Conditions:[["content-length-range",bytes,bytes],
        ["eq","$Content-Type",mime],["eq","$key",key],["eq","$success_action_status","204"]]});
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
  const keyPattern=/^chat2\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\/[a-f0-9-]{36}\/(?:incoming\/source\.(?:jpg|png|webp|heic|heif|mp4|mov|webm)|v1\/(?:image\/[sm]\.webp|poster\.webp|video\/(?:360|720)\.mp4))$/i;
  if(keys.length<1||keys.length>6||new Set(keys).size!==keys.length||keys.some(key=>!keyPattern.test(key)))
    throw Error("CHAT2_DELETE_UNTRUSTED_KEYS");
  const client=injectedClient??storage();
  try{
    // Bounded parallelism, no per-key HEAD and no directory moves.
    const answers=await Promise.allSettled(keys.map(key=>client.send(new DeleteObjectCommand({Bucket:bucket,Key:key}),
      {abortSignal:AbortSignal.timeout(12_000)})));
    for(const result of answers)if(result.status==='rejected')throw new Error('CHAT2_CLEANUP_S3_RETRY');
  }finally{if(!injectedClient)client.destroy();}
}
