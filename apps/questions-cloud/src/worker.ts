import { createHash } from "node:crypto";
import { GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand,
  DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { questionPaths, sourcePattern } from "./keys.js";
import { convertQuestionImage } from "./sharp-engine.js";

export const QUESTION_JOB_BUCKET = "gafus-questions-public";
const imagePrefix = "questions/incoming/questions/";
const workPrefix = "questions/jobs/pending/questions/";
const workPattern = /^questions\/jobs\/pending\/questions\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\/source\.(jpg|jpeg|png|webp)$/;
function sourceForWork(key: string): string {
  if (!workPattern.test(key)) throw new Error("QUESTIONS_UNTRUSTED_WORK");
  return imagePrefix + key.slice(workPrefix.length);
}
const safeFailure = new Set(["IMAGE_SIZE", "IMAGE_FORMAT", "INVALID_IMAGE", "OUTPUT_TOO_LARGE"]);
const isPrecondition = (e: unknown) =>
  (e as {$metadata?: {httpStatusCode?:number}}).$metadata?.httpStatusCode === 412;

export function createQuestionsCloudProcessor(client: Pick<S3Client, "send">,
  engine: typeof convertQuestionImage = convertQuestionImage) {
  const timed = async <T>(stage: string, task: () => Promise<T>): Promise<T> => {
    const started = performance.now();
    const cpuStart = globalThis.process.cpuUsage();
    let success = false;
    try {
      const value = await task();
      success = true;
      return value;
    } finally {
      // No S3 keys, user data, provider error messages or credentials in logs.
      const cpu = globalThis.process.cpuUsage(cpuStart);
      console.log(JSON.stringify({event: "questions_media_stage", stage,
        outcome: success ? "success" : "failure",
        durationMs: Math.round(performance.now() - started),
        cpuMs: Math.round((cpu.user + cpu.system) / 1000),
        rssMiB: Math.round(globalThis.process.memoryUsage().rss / 1048576)}));
    }
  };
  const finished = async (keys: ReturnType<typeof questionPaths>) => {
    const prefix = keys.stageThumb.slice(0, keys.stageThumb.lastIndexOf("/") + 1);
    // One scoped LIST instead of up to three per-source HEAD requests.
    const listing = await timed("stage_lookup", () => client.send(new ListObjectsV2Command({
      Bucket: QUESTION_JOB_BUCKET, Prefix: prefix, MaxKeys: 4,
    })));
    const names = new Set((listing.Contents ?? []).map(item => item.Key));
    // Unrecognized keys should not hide a completed result when MaxKeys is exhausted.
    if (listing.IsTruncated) throw new Error("QUESTIONS_STAGE_LIST_TRUNCATED");
    return names.has(keys.stageFailed) || (names.has(keys.stageFull) && names.has(keys.stageThumb));
  };
  async function upload(key: string, body: Uint8Array, type: string) {
    try {
      await client.send(new PutObjectCommand({Bucket: QUESTION_JOB_BUCKET, Key: key,
        Body: body, ContentType: type, ContentLength: body.length, IfNoneMatch: "*",
        CacheControl: "private, no-store"}));
    } catch (error) {
      // An overlapping attempt may have won the immutable write. Never treat an
      // unrelated existing object as success: verify content and metadata on 412.
      if (!isPrecondition(error)) throw error;
      const head = await client.send(new HeadObjectCommand({
        Bucket: QUESTION_JOB_BUCKET, Key: key,
      }));
      const expected = createHash("md5").update(body).digest("hex");
      if (head.ETag?.replace(/^"|"$/g, "").toLowerCase() !== expected ||
          head.ContentLength !== body.byteLength || head.ContentType !== type)
        throw new Error("QUESTIONS_IMMUTABLE_CONFLICT");
    }
  }
  async function process(source: string) {
    const keys = questionPaths(source);
    if (await finished(keys)) return "already";
    const result = await timed("source_get", () => client.send(new GetObjectCommand({Bucket: QUESTION_JOB_BUCKET,
      Key: source})));
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
      const output = await timed("encode", () => engine(bytes));
      // Never write directly into the public CDN prefix. API promotes only
      // if an authenticated, still-existing unbound QuestionPhoto owns source.
      // Both writes must settle before the attempt is reported unsuccessful.
      const writes = await timed("variant_upload", () => Promise.allSettled([
        upload(keys.stageThumb, output.thumb.bytes, "image/webp"),
        upload(keys.stageFull, output.full.bytes, "image/webp"),
      ]));
      for (const write of writes) if (write.status === "rejected") throw write.reason;
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
  // The normal path lists ONLY immutable work records created after upload.
  // Their names contain the exact source key; no extra GET or search of originals.
  async function run(max = 10, options: { recovery?: boolean } = {}) {
    if (!Number.isSafeInteger(max) || max < 1 || max > 10) throw new Error("QUESTIONS_INVALID_BATCH");
    let scanned = 0, processed = 0, rejected = 0, legacyScanned = 0;
    let page: string | undefined;
    for (let i = 0; i < 25 && processed + rejected < max; i++) {
      const listed = await timed("work_list", () => client.send(new ListObjectsV2Command({
        Bucket: QUESTION_JOB_BUCKET, Prefix: workPrefix, MaxKeys: 100,
        ...(page ? { ContinuationToken: page } : {}),
      })));
      for (const item of listed.Contents ?? []) {
        if (!item.Key || !workPattern.test(item.Key)) continue;
        scanned++;
        const source = sourceForWork(item.Key);
        let state: "already" | "processed" | "rejected" | "orphaned";
        try {
          state = await process(source);
        } catch (error) {
          const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
          // Do not delete on transient network errors. A source 404 older than
          // two minutes is a canceled upload or an orphan left by compensation.
          if (status !== 404 || !item.LastModified ||
              item.LastModified.getTime() > Date.now() - 120_000) throw error;
          state = "orphaned";
        }
        // A 2nd concurrent job may also process this marker; successful staged
        // outputs, permanent failures, and aged missing originals are safe to ack.
        await timed("work_ack", () => client.send(new DeleteObjectCommand({
          Bucket: QUESTION_JOB_BUCKET, Key: item.Key,
        })));
        if (state === "processed") processed++;
        if (state === "rejected") rejected++;
        if (processed + rejected >= max) break;
      }
      if (!listed.IsTruncated || !listed.NextContinuationToken) break;
      page = listed.NextContinuationToken;
    }
    if (options.recovery && processed + rejected < max) {
      // Compatibility/recovery only: pre-index images or uploads interrupted
      // between source PUT and work record PUT. Never run for each wake-up.
      page = undefined;
      for (let i = 0; i < 25 && processed + rejected < max; i++) {
        const listed = await timed("legacy_recovery_list", () => client.send(new ListObjectsV2Command({
          Bucket: QUESTION_JOB_BUCKET, Prefix: imagePrefix, MaxKeys: 100,
          ...(page ? { ContinuationToken: page } : {}),
        })));
        for (const item of listed.Contents ?? []) {
          if (!item.Key || !sourcePattern.test(item.Key)) continue;
          legacyScanned++;
          if (item.LastModified && item.LastModified.getTime() < Date.now() - 24 * 60 * 60 * 1000)
            continue;
          const state = await process(item.Key);
          if (state === "processed") processed++;
          if (state === "rejected") rejected++;
          if (processed + rejected >= max) break;
        }
        if (!listed.IsTruncated || !listed.NextContinuationToken) break;
        page = listed.NextContinuationToken;
      }
      await timed("cleanup", async () => {
        await sweepOldPrivateFiles(imagePrefix);
        await sweepOldPrivateFiles("questions/processed/questions/");
      });
    }
    return {scanned, processed, rejected, legacyScanned};
  }
  return {run, process, sweepOldPrivateFiles, sourceForWork};
}
