/**
 * Controlled integration smoke in REAL Cloud.ru Object Storage.
 * Each object is generated with a UUID under a reserved validation prefix,
 * uses immutable PUT, verifies private signed GET and requires DELETE+404.
 * No object discovery, no user IDs, and never deletes an existing key.
 */
import { randomUUID } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
const env = process.env;
if (
  env.CLOUDRU_S3_ENDPOINT !== "https://s3.cloud.ru" ||
  !env.CLOUDRU_S3_ACCESS_KEY_ID ||
  !env.CLOUDRU_S3_SECRET_ACCESS_KEY
)
  throw new Error("CLOUDRU_S3_SMOKE_NOT_CONFIGURED");
const buckets = [env.GALLERY_BUCKET, env.FEED_BUCKET, env.CLOUDRU_DOCUMENTS_BUCKET];
if (buckets.some((bucket) => !/^gafus-[a-z0-9-]+-private$/.test(bucket)))
  throw new Error("CLOUDRU_S3_SMOKE_BUCKET_NOT_ALLOWED");
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
let failures = 0;
try {
  for (const bucket of new Set(buckets)) {
    const key = `__gafus_cloudru_validation__/${randomUUID()}.txt`;
    const bytes = new TextEncoder().encode(randomUUID());
    const result = {
      bucket,
      put: false,
      get: false,
      presignedGet: false,
      anonymousDenied: false,
      removed: false,
    };
    let created = false;
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: bytes,
          ContentType: "text/plain",
          CacheControl: "private, no-store",
          IfNoneMatch: "*",
        }),
      );
      created = true;
      result.put = true;
      const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const loaded = await object.Body?.transformToByteArray();
      result.get = Buffer.from(loaded ?? []).equals(Buffer.from(bytes));
      const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
        expiresIn: 90,
      });
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      result.presignedGet =
        response.ok && Buffer.from(await response.arrayBuffer()).equals(Buffer.from(bytes));
      const anonymous = await fetch(`https://s3.cloud.ru/${bucket}/${key}`, {
        method: "HEAD",
        signal: AbortSignal.timeout(10000),
      });
      result.anonymousDenied = anonymous.status >= 400;
    } catch (error) {
      result.failedStep = error.name === "Error" ? "client" : String(error.name).slice(0, 45);
    } finally {
      if (created) {
        try {
          await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
          try {
            await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
          } catch (error) {
            result.removed = error.$metadata?.httpStatusCode === 404 || error.name === "NotFound";
          }
        } catch {
          result.removalFailed = true;
        }
      }
    }
    if (
      !result.put ||
      !result.get ||
      !result.presignedGet ||
      !result.anonymousDenied ||
      !result.removed
    )
      failures++;
    console.log(JSON.stringify(result));
  }
} finally {
  client.destroy();
}
if (failures) {
  console.error(`Cloud.ru S3 validation errors: ${failures}`);
  process.exitCode = 1;
}
