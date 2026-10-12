/**
 * Main-only private Cloud.ru S3 acceptance on disposable synthetic objects.
 * Requires GET/HEAD/PUT/DELETE for all three production buckets.
 * No user object is read, modified or deleted. Always cleans up its own UUID key.
 */
import { randomUUID, createHash } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

const mode = process.argv[2] ?? "--plan";
if (!["--plan", "--verify"].includes(mode)) throw Error("CLOUDRU_S3_INVALID_MODE");
const buckets = ["gafus-gallery-private", "gafus-feed-private", "gafus-documents-private"];
if (mode === "--plan") {
  console.log(
    JSON.stringify({
      mode,
      mutates: false,
      buckets,
      checks: ["HEAD", "PUT", "GET SHA256", "DELETE"],
    }),
  );
  process.exit(0);
}
const e = process.env;
if (
  e.GITHUB_REF !== "refs/heads/main" ||
  e.GITHUB_EVENT_NAME !== "push" ||
  e.CLOUDRU_S3_PROBE_CONFIRM !== "synthetic-private-s3-only" ||
  e.CLOUDRU_S3_ENDPOINT !== "https://s3.cloud.ru"
)
  throw Error("CLOUDRU_S3_PROBE_NOT_APPROVED");
if (!(e.CLOUDRU_S3_ACCESS_KEY_ID?.length > 10 && e.CLOUDRU_S3_SECRET_ACCESS_KEY?.length > 15))
  throw Error("CLOUDRU_S3_PROBE_KEYS_MISSING");
const client = new S3Client({
  endpoint: e.CLOUDRU_S3_ENDPOINT,
  region: "ru-central-1",
  forcePathStyle: true,
  maxAttempts: 2,
  credentials: {
    accessKeyId: e.CLOUDRU_S3_ACCESS_KEY_ID,
    secretAccessKey: e.CLOUDRU_S3_SECRET_ACCESS_KEY,
  },
});
try {
  for (const bucket of buckets) {
    const key = "__gafus_cloudru_validation__/deployment/" + randomUUID() + ".txt";
    const data = Buffer.from("GAFUS S3 deployment readiness " + randomUUID() + "\n", "utf8");
    let saved = false;
    try {
      const put = await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: data,
          ContentType: "text/plain",
          CacheControl: "private, no-store",
          IfNoneMatch: "*",
        }),
        {
          abortSignal: AbortSignal.timeout(18000),
        },
      );
      saved = true;
      if (put.$metadata.httpStatusCode !== 200) throw Error("CLOUDRU_S3_PUT_UNVERIFIED");
      const h = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }), {
        abortSignal: AbortSignal.timeout(12000),
      });
      if (h.ContentLength !== data.length || h.ContentType !== "text/plain")
        throw Error("CLOUDRU_S3_HEAD_MISMATCH");
      const g = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }), {
        abortSignal: AbortSignal.timeout(18000),
      });
      const got = Buffer.from(await g.Body.transformToByteArray());
      if (
        createHash("sha256").update(got).digest("hex") !==
        createHash("sha256").update(data).digest("hex")
      )
        throw Error("CLOUDRU_S3_GET_HASH_MISMATCH");
    } finally {
      if (saved) {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), {
          abortSignal: AbortSignal.timeout(18000),
        });
        try {
          await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }), {
            abortSignal: AbortSignal.timeout(12000),
          });
          throw Error("CLOUDRU_S3_SYNTHETIC_OBJECT_REMAINS");
        } catch (ex) {
          if (ex?.$metadata?.httpStatusCode !== 404) throw ex;
        }
      }
    }
    console.log(JSON.stringify({ bucket, privateS3ReadWriteDelete: "PASS" }));
  }
} finally {
  client.destroy();
}
console.log("CLOUDRU_S3_PRIVATE_BUCKETS_ACCEPTED=PASS");
