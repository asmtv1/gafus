/**
 * Questions Photo Media V2 uses the EXISTING public Questions bucket.
 * Originals are stored outside its public GetObject policy prefix, while
 * processed WebP files are under the existing public questions/uploads/questions/.
 * Only the exact confirmed public bucket is permitted in Cloud.ru.
 */
import {
  S3Client, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { signClientWebpStaging, verifyClientWebp, copyVerifiedClientWebp,
  clientWebpRenditionsMatchAspect } from "./clientPhotoRenditions.js";

const variantPattern = /^questions\/uploads\/questions\/v2\/[A-Za-z0-9_-]{1,128}\/[a-f0-9-]{36}\/v1\/image\/[sm]\.webp$/i;
const smallClientPattern = /^questions\/v2\/[A-Za-z0-9_-]{1,128}\/[a-f0-9-]{36}\/incoming\/small\.webp$/i;
const sourcePattern = /^questions\/v2\/[A-Za-z0-9_-]{1,128}\/[a-f0-9-]{36}\/incoming\/source\.(?:jpg|png|webp)$/i;
const keyPattern = /^(?:questions\/v2\/[A-Za-z0-9_-]{1,128}\/[a-f0-9-]{36}\/incoming\/small\.webp|questions\/v2\/[A-Za-z0-9_-]{1,128}\/[a-f0-9-]{36}\/incoming\/source\.(?:jpg|png|webp)|questions\/uploads\/questions\/v2\/[A-Za-z0-9_-]{1,128}\/[a-f0-9-]{36}\/v1\/image\/[sm]\.webp)$/i;
const marker = "questions-v2:";
const allowedMime = new Set(["image/jpeg", "image/png", "image/webp"]);
// Beget CDN already provisioned for the existing public Cloud.ru Questions bucket.
// Runtime env may override it; explicit empty string opts out for emergency rollback.
export const QUESTIONS_V2_CDN_ORIGIN = "https://ebiteskukingusk.begetcdn.cloud";
function validate(key: string, kind: "source" | "variant" | "any") {
  if (!keyPattern.test(key) || !(kind === "any" || (kind === "source" ? sourcePattern : variantPattern).test(key)))
    throw Error("QUESTIONS_V2_S3_INVALID_KEY");
}
function configuration() {
  const e = process.env;
  const bucket = e.QUESTIONS_V2_S3_BUCKET ?? "";
  const endpoint = e.QUESTIONS_V2_S3_ENDPOINT ?? "";
  const isolated=e.GAFUS_LOCAL_ISOLATED_API==="1" &&
    (endpoint==="http://127.0.0.1:9000" ||
     endpoint==="http://127.0.0.1:9500" ||
     endpoint==="http://127.0.0.1:9501") &&
    /^gafus-refactor-(?:web4-)?questions-test$/.test(bucket);
  const cloud=endpoint==="https://s3.cloud.ru" &&
    bucket==="gafus-questions-public";
  if (e.QUESTIONS_V2_MEDIA_ENABLED !== "true" ||
      !(isolated || cloud) ||
      !e.QUESTIONS_V2_S3_ACCESS_KEY_ID || !e.QUESTIONS_V2_S3_SECRET_ACCESS_KEY ||
      bucket.includes("feed") || bucket.includes("chat") || bucket.includes("gallery") ||
      e.QUESTIONS_V2_PUBLIC_BUCKET_VERIFIED !== "true")
    throw Error("QUESTIONS_V2_PUBLIC_STORAGE_NOT_CONFIGURED_OR_UNVERIFIED");
  return { bucket, endpoint, region: e.QUESTIONS_V2_S3_REGION ?? "ru-central-1" };
}
export function questionsV2Storage() {
  const conf = configuration(), e = process.env;
  const client = new S3Client({
    endpoint:conf.endpoint,region:conf.region,forcePathStyle:true,maxAttempts:2,
    requestChecksumCalculation:"WHEN_REQUIRED",responseChecksumValidation:"WHEN_REQUIRED",
    credentials:{ accessKeyId:e.QUESTIONS_V2_S3_ACCESS_KEY_ID!,
      secretAccessKey:e.QUESTIONS_V2_S3_SECRET_ACCESS_KEY! },
  });
  return {client,bucket:conf.bucket};
}
export async function questionsV2PresignedPost(key:string,mime:string,bytes:number) {
  validate(key,"source");
  if (!allowedMime.has(mime) || !Number.isSafeInteger(bytes) ||
      bytes < 12 || bytes > 10*1024*1024) throw Error("QUESTIONS_V2_UPLOAD_REJECTED");
  const {client,bucket}=questionsV2Storage();
  try {
    const form = await createPresignedPost(client,{Bucket:bucket,Key:key,Expires:600,
      Fields:{"Content-Type":mime,success_action_status:"204"},
      // S3 evaluates the multipart POST envelope length, NOT just the file
      // payload. Permit bounded form-field overhead and verify exact object
      // bytes + Content-Type with HEAD at confirmation.
      Conditions:[["content-length-range",bytes,bytes+24*1024],
        ["eq","$Content-Type",mime],["eq","$key",key],
        ["eq","$success_action_status","204"]]});
    // Cloud.ru accepts browser CORS on the bucket's verified virtual-host
    // alias, not on the S3 API path-style endpoint used by the SDK.
    // POST policy signs the bucket/key/fields, not this transport URL.
    return confPublicPostUrl(bucket, form, process.env.QUESTIONS_V2_S3_ENDPOINT);
  } finally { client.destroy(); }
}
function confPublicPostUrl(bucket:string, form:{url:string;fields:Record<string,string>},
  endpoint:string|undefined){
  if(endpoint!=="https://s3.cloud.ru")return form;
  if(bucket!=="gafus-questions-public")throw Error("QUESTIONS_V2_PUBLIC_HOST_DENIED");
  return {...form,url:"https://gafus-questions-public.s3.cloud.ru/"};
}
export async function questionsV2Head(key:string) {
  validate(key,"any");
  const {client,bucket}=questionsV2Storage();
  try {
    const head=await client.send(new HeadObjectCommand({Bucket:bucket,Key:key}),
      {abortSignal:AbortSignal.timeout(12_000)});
    return { bytes:head.ContentLength, mime:head.ContentType,
      etag:head.ETag?.replace(/"/g,"").toLowerCase() };
  } finally {client.destroy();}
}
/** Client-only staging is private; final published keys remain server-owned and immutable. */
export function questionsV2ClientSmallKey(sourceKey: string): string {
  validate(sourceKey, "source");
  if (!sourceKey.endsWith("/source.webp")) throw Error("QUESTIONS_V2_CLIENT_SOURCE_INVALID");
  const key = sourceKey.replace(/source\.webp$/, "small.webp");
  if (!smallClientPattern.test(key)) throw Error("QUESTIONS_V2_CLIENT_KEY_INVALID");
  return key;
}
export async function questionsV2ClientSmallPost(sourceKey: string) {
  const key = questionsV2ClientSmallKey(sourceKey);
  const { client, bucket } = questionsV2Storage();
  try {
    const form = await signClientWebpStaging(client, bucket, key, 1_750_000);
    return confPublicPostUrl(bucket, form, process.env.QUESTIONS_V2_S3_ENDPOINT);
  } finally { client.destroy(); }
}
export async function questionsV2FinishClientWebp(sourceKey: string, finalKeys: {
  small: string; medium: string;
}) {
  validate(sourceKey, "source");
  validate(finalKeys.small, "variant");
  validate(finalKeys.medium, "variant");
  const { client, bucket } = questionsV2Storage();
  try {
    const [small, medium] = await Promise.all([
      verifyClientWebp(client, bucket, questionsV2ClientSmallKey(sourceKey), 360, 1_750_000),
      verifyClientWebp(client, bucket, sourceKey, 1440, 1_750_000),
    ]);
    if (!clientWebpRenditionsMatchAspect(small, medium))
      throw Error("QUESTIONS_V2_CLIENT_DIMENSIONS_INVALID");
    await Promise.all([
      copyVerifiedClientWebp(client, bucket, questionsV2ClientSmallKey(sourceKey), finalKeys.small, small),
      copyVerifiedClientWebp(client, bucket, sourceKey, finalKeys.medium, medium),
    ]);
    return { kind: "image" as const, variants: {
      small: { key: finalKeys.small, width: small.width, height: small.height, bytes: small.bytes },
      medium: { key: finalKeys.medium, width: medium.width, height: medium.height, bytes: medium.bytes },
    } };
  } finally { client.destroy(); }
}

export function questionsV2Marker(key:string) {
  validate(key,"variant");
  return marker + key;
}
export function questionsV2IsMarker(location:string) {
  return location.startsWith(marker);
}
/**
 * The caller must still check ownership/question visibility for business rules.
 * Public Cloud.ru renditions are directly readable using the existing alias;
 * local isolated S3 continues to use signed GET for realistic integration tests.
 */
export function questionsV2PublicDelivery(location: string) {
  if (!questionsV2IsMarker(location)) throw Error("QUESTIONS_V2_INVALID_MARKER");
  const key=location.slice(marker.length);
  validate(key,"variant");
  const direct="https://gafus-questions-public.s3.cloud.ru/"+key;
  const configured=process.env.QUESTIONS_V2_CDN_BASE_URL;
  const defaultCloudCdn=process.env.QUESTIONS_V2_S3_ENDPOINT==="https://s3.cloud.ru" &&
    process.env.QUESTIONS_V2_S3_BUCKET==="gafus-questions-public";
  const raw=configured===undefined
    ? (defaultCloudCdn ? QUESTIONS_V2_CDN_ORIGIN : "")
    : configured.trim();
  if (!raw) return {url:direct};
  const parsed=new URL(raw);
  if (parsed.protocol!=="https:" || !/^[a-z0-9-]+\.begetcdn\.cloud$/i.test(parsed.hostname) ||
      parsed.origin!==raw.replace(/\/$/,"") || parsed.username || parsed.password)
    throw Error("QUESTIONS_V2_INVALID_CDN_ORIGIN");
  return {url:parsed.origin+"/"+key,fallbackUrl:direct};
}
/** Resolve private localhost test-bucket reads with short-lived signed URLs.
 * Never send a local variant to the public Cloud.ru hostname. */
export async function questionsV2Delivery(location:string) {
  const local=process.env.NODE_ENV==="development" &&
    process.env.GAFUS_LOCAL_ISOLATED_API==="1" &&
    process.env.QUESTIONS_V2_S3_ENDPOINT==="http://127.0.0.1:9000" &&
    process.env.QUESTIONS_V2_S3_BUCKET==="gafus-refactor-questions-test";
  return local ? {url:await questionsV2SignedRead(location)} : questionsV2PublicDelivery(location);
}

export async function questionsV2SignedRead(location:string) {
  if (!questionsV2IsMarker(location)) throw Error("QUESTIONS_V2_INVALID_MARKER");
  const key=location.slice(marker.length);
  validate(key,"variant");
  const conf=configuration();
  if(conf.endpoint==="https://s3.cloud.ru")
    return "https://gafus-questions-public.s3.cloud.ru/" + key;
  const {client,bucket}=questionsV2Storage();
  try {
    return await getSignedUrl(client,new GetObjectCommand({Bucket:bucket,Key:key,
      ResponseCacheControl:"private, max-age=180, must-revalidate"}),{expiresIn:900});
  }finally{client.destroy();}
}
/** Always delete exact owner-derived keys; no list-prefix or client paths. */
export async function questionsV2Delete(keys:readonly string[]) {
  if (!keys.length || keys.length>4 || new Set(keys).size!==keys.length)
    throw Error("QUESTIONS_V2_INVALID_CLEANUP_KEYS");
  keys.forEach(key=>validate(key,"any"));
  const {client,bucket}=questionsV2Storage();
  try {
    const results=await Promise.allSettled(keys.map(async key=>{
      // DELETE may succeed even for a missing object. Read back the same exact
      // key to ensure the final S3 receipt represents physical disappearance.
      // A 403, transient error or still-visible object must keep the PG outbox.
      await client.send(new DeleteObjectCommand({Bucket:bucket,Key:key}),
        {abortSignal:AbortSignal.timeout(12_000)});
      try {
        await client.send(new HeadObjectCommand({Bucket:bucket,Key:key}),
          {abortSignal:AbortSignal.timeout(12_000)});
      } catch (e) {
        if ((e as {$metadata?:{httpStatusCode?:number}})?.$metadata?.httpStatusCode===404)
          return;
        throw e;
      }
      throw Error("QUESTIONS_V2_DELETE_NOT_CONFIRMED");
    }));
    for (const result of results)
      if (result.status==="rejected") throw Error("QUESTIONS_V2_DELETE_RETRY");
  }finally{client.destroy();}
}
