/**
 * Bounded disposable Cloud.ru multipart compatibility acceptance.
 * Only touches a freshly generated UUID object under the reserved smoke prefix.
 * Never lists, edits or deletes user keys. Cleans even after ambiguous completion.
 */
import { randomUUID, createHash } from "node:crypto";
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

export async function runCloudruMultipartSmoke(env = process.env) {
  if (
    env.CLOUDRU_MULTIPART_SMOKE_CONFIRM !== "disposable-uuid-only" ||
    env.CLOUDRU_S3_ENDPOINT !== "https://s3.cloud.ru" ||
    env.GALLERY_BUCKET !== "gafus-gallery-private" ||
    !env.CLOUDRU_S3_ACCESS_KEY_ID ||
    !env.CLOUDRU_S3_SECRET_ACCESS_KEY
  )
    throw new Error("CLOUDRU_MULTIPART_SMOKE_NOT_AUTHORIZED");
  const bucket = "gafus-gallery-private";
  const key = `__gafus_cloudru_validation__/multipart-${randomUUID()}.bin`;
  const client = new S3Client({
    endpoint: "https://s3.cloud.ru",
    region: "ru-central-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.CLOUDRU_S3_ACCESS_KEY_ID,
      secretAccessKey: env.CLOUDRU_S3_SECRET_ACCESS_KEY,
    },
    maxAttempts: 1,
  });
  const payload = Buffer.alloc(8 * 1024 * 1024 + 211);
  for (let i = 0; i < payload.length; i++) payload[i] = i % 251;
  const expected = createHash("sha256").update(payload).digest("hex");
  const output = {
    bucket,
    prefix: "__gafus_cloudru_validation__/",
    conditionalCompleteSupported: false,
    sha256Verified: false,
    removed: false,
  };
  let uploadId;
  let initiated = false;
  try {
    const begin = await client.send(
      new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        ContentType: "application/octet-stream",
        CacheControl: "private, no-store",
      }),
      { abortSignal: AbortSignal.timeout(20000) },
    );
    uploadId = begin.UploadId;
    if (!uploadId) throw new Error("CLOUDRU_MULTIPART_NO_UPLOAD_ID");
    initiated = true;
    const parts = [];
    for (let offset = 0, number = 1; offset < payload.length; offset += 8 * 1024 * 1024, number++) {
      const bytes = payload.subarray(offset, Math.min(payload.length, offset + 8 * 1024 * 1024));
      const result = await client.send(
        new UploadPartCommand({
          Bucket: bucket,
          Key: key,
          UploadId: uploadId,
          PartNumber: number,
          Body: bytes,
          ContentLength: bytes.length,
          ContentMD5: createHash("md5").update(bytes).digest("base64"),
        }),
        { abortSignal: AbortSignal.timeout(30000) },
      );
      if (!result.ETag) throw new Error("CLOUDRU_MULTIPART_MISSING_PART_ETAG");
      parts.push({ PartNumber: number, ETag: result.ETag });
    }
    await client.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts },
        IfNoneMatch: "*",
      }),
      { abortSignal: AbortSignal.timeout(30000) },
    );
    uploadId = undefined;
    output.conditionalCompleteSupported = true;
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(15000),
    });
    if (head.ContentLength !== payload.length || head.ContentType !== "application/octet-stream")
      throw new Error("CLOUDRU_MULTIPART_BAD_HEAD");
    const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(30000),
    });
    if (!object.Body) throw new Error("CLOUDRU_MULTIPART_NO_BODY");
    const hash = createHash("sha256");
    let size = 0;
    for await (const chunk of object.Body) {
      size += chunk.byteLength;
      if (size > payload.length) throw new Error("CLOUDRU_MULTIPART_OVERFLOW");
      hash.update(chunk);
    }
    output.sha256Verified = size === payload.length && hash.digest("hex") === expected;
    if (!output.sha256Verified) throw new Error("CLOUDRU_MULTIPART_HASH_MISMATCH");
  } finally {
    if (uploadId) {
      try {
        await client.send(
          new AbortMultipartUploadCommand({
            Bucket: bucket,
            Key: key,
            UploadId: uploadId,
          }),
          { abortSignal: AbortSignal.timeout(12000) },
        );
      } catch {}
    }
    if (initiated) {
      try {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), {
          abortSignal: AbortSignal.timeout(12000),
        });
        try {
          await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }), {
            abortSignal: AbortSignal.timeout(12000),
          });
        } catch (error) {
          output.removed = error?.$metadata?.httpStatusCode === 404;
        }
      } catch {
        output.removed = false;
      }
    }
    client.destroy();
  }
  if (!output.conditionalCompleteSupported || !output.sha256Verified || !output.removed)
    throw new Error("CLOUDRU_MULTIPART_SMOKE_UNVERIFIED");
  return output;
}
if (process.argv[1]?.endsWith("/multipart-smoke.mjs")) {
  try {
    console.log(JSON.stringify(await runCloudruMultipartSmoke()));
  } catch (error) {
    console.error(
      error instanceof Error && /^CLOUDRU_MULTIPART_[A-Z_]+$/.test(error.message)
        ? error.message
        : "CLOUDRU_MULTIPART_SMOKE_FAILED",
    );
    process.exitCode = 1;
  }
}
