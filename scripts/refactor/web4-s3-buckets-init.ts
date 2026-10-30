/** WEB4 own isolated MinIO only: provision four PRIVATE, exact test buckets once.
 * No user data or production bucket is ever touched. No bucket policy is set. */
import { realpathSync } from "node:fs";
import {
  S3Client, CreateBucketCommand, HeadBucketCommand,
  GetBucketPolicyCommand,
} from "@aws-sdk/client-s3";
import { isolatedNonprodS3Config } from "../../packages/cdn-upload/src/isolatedNonprodS3";
const root = "/Users/asmtv1/Desktop/gafus-refactor";
const expected = ["documents","questions","gallery","feed"] as const;
async function main() {
  if (process.env.WEB4_PROVISION_PRIVATE_S3 !== "1" ||
      process.env.GAFUS_WEB4_ISOLATED_MEDIA !== "1" ||
      process.env.GAFUS_ISOLATED_NONPROD_S3 !== "enabled" ||
      realpathSync(process.cwd()) !== root || realpathSync(root) !== root ||
      process.env.NODE_ENV !== "development" ||
      process.env.GAFUS_LOCAL_ISOLATED_API !== "1")
    throw Error("WEB4_PRIVATE_S3_PREFLIGHT_DENIED");
  const config=isolatedNonprodS3Config("feed");
  if (!config || config.endpoint!=="http://127.0.0.1:9500" ||
      config.bucket!=="gafus-refactor-web4-feed-test")
    throw Error("WEB4_PRIVATE_S3_IDENTITY_DENIED");
  const response=await fetch("http://127.0.0.1:9500/minio/health/live",{signal:AbortSignal.timeout(3000)});
  if (response.status!==200) throw Error("WEB4_PRIVATE_S3_RUNTIME_DENIED");
  const client=new S3Client({endpoint:config.endpoint,region:"us-east-1",forcePathStyle:true,
    credentials:{accessKeyId:config.accessKeyId,secretAccessKey:config.secretAccessKey},
    maxAttempts:1,requestChecksumCalculation:"WHEN_REQUIRED",responseChecksumValidation:"WHEN_REQUIRED"});
  try {
    for(const kind of expected){
      const ownBucket=`gafus-refactor-web4-${kind}-test`;
      const own=isolatedNonprodS3Config(kind);
      if(!own || own.endpoint!==config.endpoint || own.bucket!==ownBucket)throw Error("WEB4_BUCKET_OWNERSHIP_DENIED");
      try { await client.send(new HeadBucketCommand({Bucket:ownBucket})); }
      catch(e){
        const status=(e as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode;
        if(status!==404)throw Error("WEB4_BUCKET_UNEXPECTED_STATE");
        await client.send(new CreateBucketCommand({Bucket:ownBucket}));
      }
      try { await client.send(new GetBucketPolicyCommand({Bucket:ownBucket}));
        throw Error("WEB4_PUBLIC_BUCKET_POLICY_DENIED");
      } catch(e){
        if ((e as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode!==404)
          throw Error("WEB4_BUCKET_POLICY_NOT_PROVEN_PRIVATE");
      }
      console.log(`WEB4_OWN_PRIVATE_BUCKET_READY ${kind}`);
    }
  } finally {client.destroy();}
}
main().catch(e=>{console.error("WEB4_S3_PROVISION_FAILED", e instanceof Error ? e.message : "UNKNOWN");process.exitCode=1;});
