import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export const QUESTION_PUBLIC_BUCKET = "gafus-questions-public";
export const QUESTION_PUBLIC_CDN = "https://ebiteskukingusk.begetcdn.cloud";
const marker = "cloudru:questions-public:";
const object = /^questions\/uploads\/questions\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_-]{1,128})\.(jpg|jpeg|png|webp)$/;
const variant = /^questions\/uploads\/questions\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_-]{1,128})\/(thumb|full)\.webp$/;
const pendingMarker = "cloudru:questions-pending:";
const pendingWorkPrefix = "questions/jobs/pending/";
/** A private, immutable S3 work record. The original upload remains the source of truth. */
function pendingWorkKey(sourceKey: string): string {
  if (!source.test(sourceKey)) throw new Error("QUESTION_PENDING_INVALID_LOCATION");
  return pendingWorkPrefix + sourceKey.slice("questions/incoming/".length);
}
const source = /^questions\/incoming\/questions\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_-]{1,128})\/source\.(jpg|jpeg|png|webp)$/;
const relative = /^questions\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_-]{1,128})\.(jpg|jpeg|png|webp)$/;

export function parsePublicQuestionLocation(value: string): string | null {
  if (!value.startsWith(marker)) return null;
  const key = value.slice(marker.length);
  if (!object.test(key) && !variant.test(key)) throw new Error("QUESTION_PUBLIC_INVALID_LOCATION");
  return key;
}

export function publicQuestionLocation(path: string): string {
  if (!relative.test(path)) throw new Error("QUESTION_PUBLIC_INVALID_KEY");
  return marker + "questions/uploads/" + path;
}

export function pendingQuestionLocation(path: string): string {
  const match = relative.exec(path);
  if (!match) throw new Error("QUESTION_PENDING_INVALID_KEY");
  return pendingMarker + `questions/incoming/questions/${match[1]}/${match[2]}/source.${match[3]}`;
}

export function parsePendingQuestionLocation(value: string): string | null {
  if (!value.startsWith(pendingMarker)) return null;
  const key = value.slice(pendingMarker.length);
  if (!source.test(key)) throw new Error("QUESTION_PENDING_INVALID_LOCATION");
  return key;
}

export function questionImageVariantKeys(value: string) {
  const s = parsePendingQuestionLocation(value);
  const p = s && source.exec(s) || (!s && parsePublicQuestionLocation(value)
    ? variant.exec(parsePublicQuestionLocation(value)!) : null);
  if (!p) throw new Error("QUESTION_VARIANT_INVALID_LOCATION");
  const id = `${p[1]}/${p[2]}`;
  return {
    source: s,
    stageThumb: `questions/processed/questions/${id}/thumb.webp`,
    stageFull: `questions/processed/questions/${id}/full.webp`,
    failed: `questions/processed/questions/${id}/failed.json`,
    thumb: `questions/uploads/questions/${id}/thumb.webp`,
    full: `questions/uploads/questions/${id}/full.webp`,
    finalLocation: marker + `questions/uploads/questions/${id}/full.webp`,
  };
}

export function questionCloudJobEnabled(env: NodeJS.ProcessEnv = process.env) {
  if (env.QUESTIONS_CLOUD_JOB_ENABLED !== undefined &&
      !["true", "false"].includes(env.QUESTIONS_CLOUD_JOB_ENABLED))
    throw new Error("QUESTIONS_JOB_INVALID_FLAG");
  if (!publicQuestionsEnabled(env)) return false;
  if (env.QUESTIONS_CLOUD_JOB_ENABLED !== "true" ||
      env.QUESTIONS_PROCESSOR_READY !== "true")
    throw new Error("QUESTIONS_JOB_NOT_READY");
  return true;
}

async function sendCloud<T>(fn: (client: S3Client) => Promise<T>, env: NodeJS.ProcessEnv) {
  const client = storage(env);
  try { return await fn(client); } finally { client.destroy(); }
}

export async function uploadQuestionSource(path: string, body: Uint8Array, contentType: string,
  env: NodeJS.ProcessEnv = process.env) {
  if (!questionCloudJobEnabled(env)) throw new Error("QUESTIONS_JOB_NOT_READY");
  const location = pendingQuestionLocation(path);
  if (!body.length || body.length > 10 * 1024 * 1024 ||
    !["image/jpeg", "image/png", "image/webp"].includes(contentType))
    throw new Error("QUESTION_PENDING_INVALID_FILE");
  const key = parsePendingQuestionLocation(location)!;
  // The work record is persisted only AFTER S3 accepted the original. An
  // interrupted BullMQ wake or Cloud.ru launch cannot lose this pending image.
  await sendCloud(async client => {
    await client.send(new PutObjectCommand({
      Bucket: QUESTION_PUBLIC_BUCKET, Key: key,
      Body: body, ContentType: contentType, ContentLength: body.length,
      IfNoneMatch: "*", CacheControl: "private, no-store",
    }), {abortSignal: AbortSignal.timeout(60_000)});
    await client.send(new PutObjectCommand({
      Bucket: QUESTION_PUBLIC_BUCKET, Key: pendingWorkKey(key),
      Body: Buffer.from([1]), ContentType: "application/octet-stream",
      ContentLength: 1, IfNoneMatch: "*", CacheControl: "private, no-store",
    }), {abortSignal: AbortSignal.timeout(15_000)});
  }, env);
  return location;
}

/** Only this API-side promotion can put processed images into the public prefix. */
export async function promoteQuestionVariants(location: string, env: NodeJS.ProcessEnv = process.env) {
  const paths = questionImageVariantKeys(location);
  if (!paths.source) throw new Error("QUESTION_PENDING_INVALID_LOCATION");
  return sendCloud(async client => {
    for (const key of [paths.stageThumb, paths.stageFull]) {
      try {
        const head = await client.send(new HeadObjectCommand({Bucket: QUESTION_PUBLIC_BUCKET, Key: key}),
          {abortSignal: AbortSignal.timeout(8000)});
        if (head.ContentType !== "image/webp" || !head.ContentLength || head.ContentLength > 1_750_000)
          throw new Error("QUESTION_STAGED_WEBP_INVALID");
      } catch (error) {
        if ((error as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode === 404)
          return {state: "processing" as const};
        throw error;
      }
    }
    for (const [from, to] of [[paths.stageThumb, paths.thumb], [paths.stageFull, paths.full]]) {
      await client.send(new CopyObjectCommand({
        Bucket: QUESTION_PUBLIC_BUCKET, Key: to,
        CopySource: encodeURIComponent(QUESTION_PUBLIC_BUCKET + "/" + from).replace(/%2F/g, "/"),
        MetadataDirective: "REPLACE", ContentType: "image/webp",
        CacheControl: "public, max-age=180, must-revalidate",
      }), {abortSignal: AbortSignal.timeout(20000)});
    }
    return {state: "ready" as const, location: paths.finalLocation};
  }, env);
}

export async function questionProcessingFailure(location: string, env: NodeJS.ProcessEnv = process.env) {
  const keys = questionImageVariantKeys(location);
  return sendCloud(async client => {
    try {
      const out = await client.send(new GetObjectCommand({Bucket: QUESTION_PUBLIC_BUCKET, Key: keys.failed}),
        {abortSignal: AbortSignal.timeout(6000)});
      if (!out.Body || (out.ContentLength ?? 0) > 256) throw new Error("QUESTION_PROCESS_FAILURE_INVALID");
      const value = JSON.parse(await out.Body.transformToString()) as {code?:string};
      return ["IMAGE_SIZE", "INVALID_IMAGE", "IMAGE_FORMAT", "OUTPUT_TOO_LARGE"].includes(value.code ?? "")
        ? value.code! : "INVALID_IMAGE";
    } catch (error) {
      if ((error as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode === 404)
        return null;
      throw error;
    }
  }, env);
}

export async function deleteQuestionPrivateStaging(location: string, env: NodeJS.ProcessEnv = process.env) {
  const keys = questionImageVariantKeys(location);
  if (!keys.source || env.QUESTIONS_PUBLIC_S3_BUCKET_VERSIONING !== "disabled")
    throw new Error("QUESTION_PUBLIC_VERSIONING_UNVERIFIED");
  await sendCloud(async client => {
    for (const key of [keys.source, keys.source && pendingWorkKey(keys.source), keys.stageThumb, keys.stageFull, keys.failed]) {
      if (!key) continue;
      await client.send(new DeleteObjectCommand({Bucket: QUESTION_PUBLIC_BUCKET, Key: key}),
        {abortSignal: AbortSignal.timeout(8000)});
    }
  }, env);
}

export async function deleteQuestionSourceAndVariants(location: string, env: NodeJS.ProcessEnv = process.env) {
  const keys = questionImageVariantKeys(location);
  if (env.QUESTIONS_PUBLIC_S3_BUCKET_VERSIONING !== "disabled")
    throw new Error("QUESTION_PUBLIC_VERSIONING_UNVERIFIED");
  await sendCloud(async client => {
    for (const key of [keys.source, keys.source && pendingWorkKey(keys.source), keys.stageThumb, keys.stageFull, keys.failed, keys.thumb, keys.full]) {
      if (!key) continue;
      await client.send(new DeleteObjectCommand({Bucket: QUESTION_PUBLIC_BUCKET, Key: key}),
        {abortSignal: AbortSignal.timeout(15000)});
      try {
        await client.send(new HeadObjectCommand({Bucket: QUESTION_PUBLIC_BUCKET, Key: key}),
          {abortSignal: AbortSignal.timeout(8000)});
      } catch (error) {
        if ((error as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode === 404) continue;
        throw error;
      }
      throw new Error("QUESTION_PUBLIC_OBJECT_REMAINS");
    }
  }, env);
}

/** The write switch is never inferred from the old private-media flag. */
export function publicQuestionsEnabled(env: NodeJS.ProcessEnv = process.env) {
  if (env.QUESTIONS_PUBLIC_S3_ENABLED !== undefined &&
      !["true", "false"].includes(env.QUESTIONS_PUBLIC_S3_ENABLED))
    throw new Error("QUESTION_PUBLIC_INVALID_FLAG");
  if (env.QUESTIONS_PUBLIC_S3_ENABLED !== "true") return false;
  // Do not route user uploads to a CDN which has not passed a real edge test.
  if (env.QUESTIONS_CDN_LIVE_VERIFIED !== "true") throw new Error("QUESTION_PUBLIC_CDN_NOT_VERIFIED");
  verifiedConfig(env);
  return true;
}

function verifiedConfig(env: NodeJS.ProcessEnv) {
  if (env.QUESTIONS_PUBLIC_S3_BUCKET !== QUESTION_PUBLIC_BUCKET ||
      env.QUESTIONS_CDN_BASE_URL !== QUESTION_PUBLIC_CDN ||
      env.CLOUDRU_S3_ENDPOINT !== "https://s3.cloud.ru" ||
      !env.CLOUDRU_S3_ACCESS_KEY_ID || !env.CLOUDRU_S3_SECRET_ACCESS_KEY)
    throw new Error("QUESTION_PUBLIC_STORAGE_UNCONFIGURED");
}

function storage(env: NodeJS.ProcessEnv) {
  if (env.QUESTIONS_PUBLIC_S3_BUCKET !== QUESTION_PUBLIC_BUCKET ||
      env.CLOUDRU_S3_ENDPOINT !== "https://s3.cloud.ru" ||
      !env.CLOUDRU_S3_ACCESS_KEY_ID || !env.CLOUDRU_S3_SECRET_ACCESS_KEY)
    throw new Error("QUESTION_PUBLIC_STORAGE_UNCONFIGURED");
  return new S3Client({
    endpoint: "https://s3.cloud.ru", region: "ru-central-1",
    forcePathStyle: true, maxAttempts: 2,
    credentials: {
      accessKeyId: env.CLOUDRU_S3_ACCESS_KEY_ID,
      secretAccessKey: env.CLOUDRU_S3_SECRET_ACCESS_KEY,
    },
  });
}

export function presentPublicQuestionPhoto(location: string, env: NodeJS.ProcessEnv = process.env): string {
  const key = parsePublicQuestionLocation(location);
  if (!key) throw new Error("QUESTION_PUBLIC_INVALID_LOCATION");
  // On deliberate rollback, already-published public photos remain readable.
  if (env.QUESTIONS_CDN_BASE_URL === QUESTION_PUBLIC_CDN &&
      env.QUESTIONS_CDN_LIVE_VERIFIED === "true")
    return QUESTION_PUBLIC_CDN + "/" + key;
  return "https://gafus-questions-public.s3.cloud.ru/" + key;
}

export async function uploadPublicQuestionPhoto(
  path: string, body: Uint8Array, contentType: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  if (!publicQuestionsEnabled(env)) throw new Error("QUESTION_PUBLIC_DISABLED");
  const location = publicQuestionLocation(path);
  if (body.byteLength < 1 || body.byteLength > 10 * 1024 * 1024 ||
      !["image/jpeg", "image/png", "image/webp"].includes(contentType))
    throw new Error("QUESTION_PUBLIC_INVALID_FILE");
  const key = parsePublicQuestionLocation(location)!;
  const client = storage(env);
  try {
    await client.send(new PutObjectCommand({
      Bucket: QUESTION_PUBLIC_BUCKET, Key: key, Body: body,
      ContentType: contentType, ContentLength: body.byteLength,
      CacheControl: "public, max-age=180, must-revalidate", IfNoneMatch: "*",
    }), { abortSignal: AbortSignal.timeout(60_000) });
    return location;
  } finally { client.destroy(); }
}

export async function deletePublicQuestionPhoto(location: string, env: NodeJS.ProcessEnv = process.env) {
  const key = parsePublicQuestionLocation(location);
  if (!key) throw new Error("QUESTION_PUBLIC_INVALID_LOCATION");
  if (variant.test(key)) return deleteQuestionSourceAndVariants(location, env);
  if (env.QUESTIONS_PUBLIC_S3_BUCKET_VERSIONING !== "disabled")
    throw new Error("QUESTION_PUBLIC_VERSIONING_UNVERIFIED");
  const client = storage(env);
  try {
    await client.send(new DeleteObjectCommand({ Bucket: QUESTION_PUBLIC_BUCKET, Key: key }),
      { abortSignal: AbortSignal.timeout(30_000) });
    try {
      await client.send(new HeadObjectCommand({ Bucket: QUESTION_PUBLIC_BUCKET, Key: key }),
        { abortSignal: AbortSignal.timeout(15_000) });
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404)
        return;
      throw error;
    }
    throw new Error("QUESTION_PUBLIC_OBJECT_REMAINS");
  } finally { client.destroy(); }
}
