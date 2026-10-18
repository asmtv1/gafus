import { GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand,
  DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { questionPaths, sourcePattern } from "./keys.js";
import { convertQuestionImage } from "./sharp-engine.js";

export const QUESTION_JOB_BUCKET = "gafus-questions-public";
const imagePrefix = "questions/incoming/questions/";
const safeFailure = new Set(["IMAGE_SIZE", "IMAGE_FORMAT", "INVALID_IMAGE", "OUTPUT_TOO_LARGE"]);
const isMissing = (e: unknown) => (e as {$metadata?: {httpStatusCode?:number}}).$metadata?.httpStatusCode === 404;
const isPrecondition = (e: unknown) =>
  (e as {$metadata?: {httpStatusCode?:number}}).$metadata?.httpStatusCode === 412;

export function createQuestionsCloudProcessor(client: Pick<S3Client, "send">,
  engine: typeof convertQuestionImage = convertQuestionImage) {
  const head = async (key: string) => {
    try { await client.send(new HeadObjectCommand({Bucket: QUESTION_JOB_BUCKET, Key: key})); return true; }
    catch (error) { if (isMissing(error)) return false; throw error; }
  };
  async function upload(key: string, body: Uint8Array, type: string) {
    try {
      await client.send(new PutObjectCommand({Bucket: QUESTION_JOB_BUCKET, Key: key,
        Body: body, ContentType: type, ContentLength: body.length, IfNoneMatch: "*",
        CacheControl: "private, no-store"}));
    } catch (error) {
      // A retry or overlapping Job may already have produced the same immutable output.
      if (!isPrecondition(error)) throw error;
    }
  }
  async function process(source: string) {
    const keys = questionPaths(source);
    if (await head(keys.stageFailed) || await head(keys.stageFull) && await head(keys.stageThumb))
      return "already";
    const result = await client.send(new GetObjectCommand({Bucket: QUESTION_JOB_BUCKET,
      Key: source}));
    if (!result.Body || !result.ContentLength || result.ContentLength > 10 * 1024 * 1024)
      throw new Error("IMAGE_SIZE");
    const chunks: Uint8Array[] = [];
    let sum = 0;
    for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
      sum += chunk.byteLength;
      if (sum > 10 * 1024 * 1024) throw new Error("IMAGE_SIZE");
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks.map(c => Buffer.from(c)));
    try {
      const output = await engine(bytes);
      // Never write directly into the public CDN prefix. API promotes only
      // if an authenticated, still-existing unbound QuestionPhoto owns source.
      await upload(keys.stageThumb, output.thumb.bytes, "image/webp");
      await upload(keys.stageFull, output.full.bytes, "image/webp");
      return "processed";
    } catch (error) {
      const code = (error as Error).message;
      if (!safeFailure.has(code)) throw error;
      await upload(keys.stageFailed, Buffer.from(JSON.stringify({code})), "application/json");
      return "rejected";
    }
  }
  /** Failed/cancelled requests cannot leave private intermediates forever.
   * This never touches public finals; database-controlled erasure owns those.
   */
  async function sweepOldPrivateFiles(prefix: string, max = 100, now = Date.now()) {
    const staleBefore = now - 24 * 60 * 60 * 1000;
    const list = await client.send(new ListObjectsV2Command({
      Bucket: QUESTION_JOB_BUCKET, Prefix: prefix, MaxKeys: max,
    }));
    let deleted = 0;
    for (const item of list.Contents ?? []) {
      if (!item.Key || !item.Key.startsWith(prefix) ||
          !item.LastModified || item.LastModified.getTime() > staleBefore) continue;
      if (prefix === imagePrefix && !sourcePattern.test(item.Key)) continue;
      if (prefix !== imagePrefix &&
          !/^questions\/processed\/questions\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\/(?:thumb\.webp|full\.webp|failed\.json)$/.test(item.Key))
        continue;
      await client.send(new DeleteObjectCommand({Bucket: QUESTION_JOB_BUCKET, Key: item.Key}));
      deleted++;
    }
    return deleted;
  }
  async function run(max = 10) {
    if (!Number.isSafeInteger(max) || max < 1 || max > 10) throw new Error("QUESTIONS_INVALID_BATCH");
    let scanned = 0, processed = 0, rejected = 0, page: string | undefined;
    for (let i = 0; i < 25 && processed + rejected < max; i++) {
      const listed = await client.send(new ListObjectsV2Command({
        Bucket: QUESTION_JOB_BUCKET, Prefix: imagePrefix, MaxKeys: 100,
        ...(page ? { ContinuationToken: page } : {}),
      }));
      for (const object of listed.Contents ?? []) {
        if (!object.Key || !sourcePattern.test(object.Key)) continue;
        scanned++;
        if (object.LastModified && object.LastModified.getTime() < Date.now() - 24 * 60 * 60 * 1000)
          continue;
        const state = await process(object.Key);
        if (state === "processed") processed++;
        if (state === "rejected") rejected++;
        if (processed + rejected >= max) break;
      }
      if (!listed.IsTruncated || !listed.NextContinuationToken) break;
      page = listed.NextContinuationToken;
    }
    await sweepOldPrivateFiles(imagePrefix);
    await sweepOldPrivateFiles("questions/processed/questions/");
    return {scanned, processed, rejected};
  }
  return {run, process, sweepOldPrivateFiles};
}
