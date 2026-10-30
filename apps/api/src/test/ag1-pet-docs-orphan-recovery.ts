/** One-time bounded cleanup of a failed AG1 fixture only, never other documents. */
import { S3Client, ListObjectsV2Command, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { isolatedNonprodS3Config } from "@gafus/cdn-upload/isolated-nonprod-s3";
import { prisma } from "@gafus/prisma";
import { realpathSync } from "node:fs";

const root = "/Users/asmtv1/Desktop/gafus-refactor";
const bucket = "gafus-refactor-documents-test";
const exactPayload = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
async function main() {
  if (process.env.AG1_RECOVER_DOCS_OWN_FIXTURE !== "1" || realpathSync(root) !== root ||
    !realpathSync(process.cwd()).startsWith(root + "/")) throw Error("AG1_RECOVERY_REFUSED");
  const db = new URL(process.env.DATABASE_URL ?? "");
  if (db.hostname !== "127.0.0.1" || db.port !== "55921" ||
    db.pathname !== "/gafus_refactor_real_work_20261024" ||
    db.username !== "gafus_refactor_local_real") throw Error("AG1_RECOVERY_DB_REFUSED");
  const cfg=isolatedNonprodS3Config("documents", { ...process.env,
    NODE_ENV:"development",GAFUS_LOCAL_ISOLATED_API:"1",GAFUS_ISOLATED_NONPROD_S3:"enabled",
    GAFUS_ISOLATED_S3_ENDPOINT:"http://127.0.0.1:9000",
    GAFUS_ISOLATED_S3_DOCUMENTS_BUCKET:bucket,
  });
  if (!cfg || cfg.bucket !== bucket) throw Error("AG1_RECOVERY_S3_REFUSED");
  const client=new S3Client({endpoint:cfg.endpoint,region:"us-east-1",forcePathStyle:true,
    credentials:{accessKeyId:cfg.accessKeyId,secretAccessKey:cfg.secretAccessKey},maxAttempts:1});
  let looked=0, removed=0;
  try {
    const list=await client.send(new ListObjectsV2Command({Bucket:bucket,Prefix:"documents/uploads/users/",MaxKeys:500}));
    if (list.IsTruncated) throw Error("AG1_RECOVERY_SCOPE_TOO_WIDE");
    for (const item of list.Contents??[]) {
      const key=item.Key;
      if (!key || !/^documents\/uploads\/users\/[A-Za-z0-9_-]+\/pets\/[A-Za-z0-9_-]+\/documents\/[A-Za-z0-9_-]+\.pdf$/.test(key) ||
        item.Size !== exactPayload.length) continue;
      looked++;
      const body=await client.send(new GetObjectCommand({Bucket:bucket,Key:key}));
      if (!Buffer.from(await body.Body!.transformToByteArray()).equals(exactPayload)) continue;
      if (await prisma.petDocument.count({where:{url:`cloudru:documents:${key}`}})) continue;
      // Only matching bytes from the *unique AG1 acceptance fixture*, not arbitrary S3 objects.
      await client.send(new DeleteObjectCommand({Bucket:bucket,Key:key}));
      try {await client.send(new HeadObjectCommand({Bucket:bucket,Key:key}));
        throw Error("AG1_RECOVERY_DELETE_UNCONFIRMED");
      } catch (err) {
        if ((err as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode !== 404) throw err;
      }
      removed++;
    }
    console.warn(`AG1_OWN_SYNTHETIC_DOC_ORPHAN_RECOVERY looked=${looked} removed=${removed} existingDBrows_preserved=true`);
  } finally { client.destroy(); await prisma.$disconnect(); }
}
void main().catch(()=>{process.exitCode=1;console.error("AG1_OWN_DOC_ORPHAN_RECOVERY_FAILED");});
