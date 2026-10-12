/**
 * Managed Cloud.ru Object Storage CORS. Default is a pure dry run; --apply only
 * merges rules after a successful GetBucketCors (or NoSuchCORSConfiguration).
 * Never overwrite an unreadable bucket policy, even when PutBucketCors is allowed.
 */
import { S3Client, GetBucketCorsCommand, PutBucketCorsCommand } from "@aws-sdk/client-s3";
import { pathToFileURL } from "node:url";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const allowedBuckets = new Set([
  "gafus-gallery-private",
  "gafus-feed-private",
  "gafus-documents-private",
]);
const origins = ["https://gafus.ru", "https://www.gafus.ru"];
export function gafusBrowserCorsPolicy(bucket) {
  if (!allowedBuckets.has(bucket)) throw new Error("CLOUDRU_CORS_UNKNOWN_BUCKET");
  const writes = bucket !== "gafus-documents-private";
  return {
    ID: "gafus-browser-v1",
    AllowedOrigins: origins,
    AllowedMethods: writes ? ["GET", "HEAD", "POST"] : ["GET", "HEAD"],
    AllowedHeaders: ["content-type", "x-amz-*", "if-none-match"],
    ExposeHeaders: ["ETag", "x-amz-request-id"],
    MaxAgeSeconds: 300,
  };
}
/** Exact scoped CORS merge; retain other consumers' rules and reject limit overflow. */
export function mergeManagedCors(bucket, existing) {
  if (!Array.isArray(existing)) throw new Error("CLOUDRU_CORS_UNREADABLE_RULES");
  const requested = gafusBrowserCorsPolicy(bucket);
  // Console-managed rules without an ID may already cover our complete policy.
  // Do not duplicate them or remove a pre-existing PUT needed by older clients.
  const covered = existing.some(rule =>
    requested.AllowedOrigins.every(value => rule?.AllowedOrigins?.includes(value)) &&
    requested.AllowedMethods.every(value => rule?.AllowedMethods?.includes(value)) &&
    requested.AllowedHeaders.every(value => rule?.AllowedHeaders?.includes(value)) &&
    requested.ExposeHeaders.every(value => rule?.ExposeHeaders?.includes(value)) &&
    (rule?.MaxAgeSeconds ?? 0) >= requested.MaxAgeSeconds
  );
  if (covered) return existing;
  const preserved = existing.filter(rule => rule?.ID !== "gafus-browser-v1");
  if (preserved.length >= 100) throw new Error("CLOUDRU_CORS_RULE_LIMIT");
  return [...preserved, gafusBrowserCorsPolicy(bucket)];
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2] ?? "--plan";
  if (!["--plan", "--apply"].includes(mode)) throw new Error("CLOUDRU_CORS_INVALID_MODE");
  const buckets = Array.from(allowedBuckets);
  if (mode === "--plan") {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          buckets: buckets.map((bucket) => ({ bucket, rule: gafusBrowserCorsPolicy(bucket) })),
        },
        null,
        2,
      ),
    );
  } else {
    if (
      process.env.CLOUDRU_CORS_CONFIRM !== "approved-managed-buckets" ||
      process.env.CLOUDRU_S3_ENDPOINT !== "https://s3.cloud.ru" ||
      !process.env.CLOUDRU_S3_ACCESS_KEY_ID ||
      !process.env.CLOUDRU_S3_SECRET_ACCESS_KEY
    )
      throw new Error("CLOUDRU_CORS_APPLY_NOT_AUTHORIZED");
    const client = new S3Client({
      endpoint: "https://s3.cloud.ru",
      region: "ru-central-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.CLOUDRU_S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.CLOUDRU_S3_SECRET_ACCESS_KEY,
      },
      maxAttempts: 1,
    });
    try {
      // Two-phase apply: fetch and validate ALL policies before the first PUT.
      // This prevents partial mutation when any one bucket lacks ACL read rights.
      const before = {};
      const merged = {};
      for (const bucket of buckets) {
        try {
          before[bucket] =
            (await client.send(new GetBucketCorsCommand({ Bucket: bucket }))).CORSRules ?? [];
        } catch (error) {
          if (error.name === "NoSuchCORSConfiguration" || error.$metadata?.httpStatusCode === 404)
            before[bucket] = [];
          else throw new Error(`CLOUDRU_CORS_READ_REQUIRED_${bucket}`);
        }
        merged[bucket] = mergeManagedCors(bucket, before[bucket]);
      }
      // Persist exact snapshots locally, never in the repository. If an update
      // fails, do NOT automatically overwrite potentially concurrent changes.
      const snapshotDir = await mkdtemp(join(tmpdir(), "gafus-cloudru-cors-"));
      await writeFile(join(snapshotDir, "before.json"), JSON.stringify(before, null, 2), { mode: 0o600 });
      console.log(`CLOUDRU_CORS_BACKUP=${snapshotDir}/before.json`);
      for (const bucket of buckets) {
        if (merged[bucket] === before[bucket]) {
          console.log(`${bucket}: existing CORS already covers both origins; no change`);
          continue;
        }
        await client.send(new PutBucketCorsCommand({
          Bucket: bucket, CORSConfiguration: { CORSRules: merged[bucket] },
        }));
        // Verify the managed rule with another authorized GET. Never claim a
        // successful update based only on a 2xx PUT response.
        const verified = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
        const rule = verified.CORSRules?.find(item => item.ID === "gafus-browser-v1");
        const desired = gafusBrowserCorsPolicy(bucket);
        if (!rule ||
            !desired.AllowedOrigins.every(origin => rule.AllowedOrigins?.includes(origin)) ||
            !desired.AllowedMethods.every(method => rule.AllowedMethods?.includes(method)))
          throw new Error(`CLOUDRU_CORS_VERIFY_FAILED_${bucket}`);
        console.log(`${bucket}: verified ${verified.CORSRules?.length ?? 0} rules`);
      }
    } finally {
      client.destroy();
    }
  }
}
