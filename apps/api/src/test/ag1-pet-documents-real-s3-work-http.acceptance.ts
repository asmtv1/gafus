import { realpathSync } from "node:fs";
/** Genuinely registered Hono -> restricted WORK PG18 -> local PRIVATE MinIO pet documents. */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@gafus/prisma";
import { isolatedNonprodS3Config } from "@gafus/cdn-upload/isolated-nonprod-s3";
import { parsePrivateMediaLocation, deletePrivateUserMedia } from "@gafus/cdn-upload";

const root = "/Users/asmtv1/Desktop/gafus-refactor";
const prefix = `ag1_docs_real_s3_${randomBytes(7).toString("hex")}`;
const base = "http://127.0.0.1:3001/api/v1";
const obj = (data: unknown): Record<string, unknown> => data && typeof data === "object" && !Array.isArray(data)
  ? data as Record<string, unknown> : {};
function ensure(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(`ASSERT_${label}`);
}
const pass = (label: string) => console.warn(`AG1_DOCS_WORK_HTTP_${label}=PASS`);
interface Actor { id: string; username: string; password: string; token: string }
let owner: Actor | undefined;
let foreign: Actor | undefined;
let petId = "";
let documentId = "";
let phase = "preflight";
let s3: S3Client | undefined;
const documentBucket = "gafus-refactor-documents-test";
const ownKeys = new Set<string>();

async function request(path: string, method: string, token: string, body?: unknown) {
  const response = await fetch(base + path, {
    method, headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000),
  });
  return { status:response.status, headers:response.headers, body:obj(await response.json()) };
}
async function multipart(path: string, token: string, content: Uint8Array, mime: string, name: string) {
  const data = new FormData();
  data.append("file", new File([content], name, {type:mime}));
  const result = await fetch(base + path, { method:"POST", headers:{Authorization:`Bearer ${token}`},
    body:data, signal:AbortSignal.timeout(60000) });
  return { status:result.status, headers:result.headers, body:obj(await result.json()) };
}
async function createActor(suffix: string) {
  const username = `${prefix}_${suffix}`;
  const password = randomBytes(24).toString("base64url");
  const user = await prisma.user.create({data:{username,password:await bcrypt.hash(password,10),
    role:"USER",passwordSetAt:new Date(),registrationPending:false}});
  const login = await fetch(`${base}/auth/login`, {method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({username,password}),signal:AbortSignal.timeout(15000)});
  const auth = obj(await login.json());
  ensure(login.status === 200 && auth.success === true, "LOGIN");
  const token = obj(auth.data).accessToken;
  ensure(typeof token === "string" && token.length > 30, "REAL_JWT");
  return {id:user.id,username,password,token} as Actor;
}
async function main() {
  ensure(process.env.AG1_PET_DOCUMENTS_WORK_HTTP === "1", "EXPLICIT_EXECUTION_FLAG");
  ensure(realpathSync(root) === root && (realpathSync(process.cwd()) === root || realpathSync(process.cwd()).startsWith(root + "/")), "PHYSICAL_PROJECT_ROOT");
  const database = new URL(process.env.DATABASE_URL ?? "");
  ensure(database.hostname === "127.0.0.1" && database.port === "55921" &&
    database.pathname === "/gafus_refactor_real_work_20261024" &&
    database.username === "gafus_refactor_local_real", "RESTRICTED_WORK_SQL_ONLY");
  const names = await prisma.$queryRaw<{name:string}[]>`SELECT current_database() AS name`;
  ensure(names[0]?.name === "gafus_refactor_real_work_20261024", "ACTUAL_DB_NAME");
  const config = isolatedNonprodS3Config("documents", { ...process.env,
    NODE_ENV:"development",GAFUS_LOCAL_ISOLATED_API:"1",GAFUS_ISOLATED_NONPROD_S3:"enabled",
    GAFUS_ISOLATED_S3_ENDPOINT:"http://127.0.0.1:9000",
    GAFUS_ISOLATED_S3_DOCUMENTS_BUCKET:documentBucket,
  });
  ensure(config && config.bucket === documentBucket && config.endpoint === "http://127.0.0.1:9000", "LOCAL_PRIVATE_S3_ONLY");
  // Signed reads and compensation use process.env; local provider flags must
  // also be active in this acceptance process, not only in the original Hono.
  Object.assign(process.env, {
    NODE_ENV: "development", GAFUS_LOCAL_ISOLATED_API: "1",
    GAFUS_ISOLATED_NONPROD_S3: "enabled",
    GAFUS_ISOLATED_S3_ENDPOINT: "http://127.0.0.1:9000",
    GAFUS_ISOLATED_S3_DOCUMENTS_BUCKET: documentBucket,
  });
  s3 = new S3Client({endpoint:config.endpoint,region:"us-east-1",forcePathStyle:true,
    credentials:{accessKeyId:config.accessKeyId,secretAccessKey:config.secretAccessKey},maxAttempts:1,
    requestChecksumCalculation:"WHEN_REQUIRED",responseChecksumValidation:"WHEN_REQUIRED"});
  const health = await fetch("http://127.0.0.1:3001/health", {signal:AbortSignal.timeout(3500)});
  ensure(health.status === 200,"ORIGINAL_HONO_HEALTH");
  pass("ROOT_RESTRICTED_SQL_LOCAL_S3_HONO");
  phase="actors";
  owner = await createActor("owner");
  foreign = await createActor("foreign");
  const pet = await prisma.pet.create({data:{name:`AG1 DOCS ${prefix}`,type:"DOG",breed:"Synthetic",
    birthDate:new Date("2020-02-29T00:00:00Z"),ownerId:owner.id}});
  petId=pet.id;
  pass("SIGNED_TWO_ACTORS_AND_TEST_PET_SQL");
  const path = `/pets/${petId}/documents`;
  const payload = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
  phase="negative";
  const missing = await request(path,"POST",owner.token);
  ensure(missing.status === 400 && missing.body.code === "FILE_REQUIRED","MISSING_FILE_400");
  const invalid = await multipart(path,owner.token,payload,"text/plain","misleading.pdf");
  ensure(invalid.status === 400 && invalid.body.code === "INVALID_DOCUMENT_TYPE","INVALID_MIME_400");
  const tooLarge = await multipart(path,owner.token,new Uint8Array(10*1024*1024+1),"application/pdf","huge.pdf");
  ensure([400,413].includes(tooLarge.status),"SIZE_LIMIT_REJECTED");
  const deniedUpload = await multipart(path,foreign.token,payload,"application/pdf","foreign.pdf");
  ensure(deniedUpload.status === 404,"FOREIGN_UPLOAD_BLOCKED_BEFORE_STORAGE");
  ensure(await prisma.petDocument.count({where:{petId}}) === 0,"NO_INVALID_SQL_DOCUMENTS");
  pass("INVALID_MIME_SIZE_MISSING_AND_FOREIGN_UPLOAD");
  phase="upload";
  const created = await multipart(path,owner.token,payload,"application/pdf","synthetic.pdf");
  ensure(created.status === 201 && created.body.success === true,"DOC_POST_201");
  documentId=obj(created.body.data).id as string;
  ensure(typeof documentId === "string" && documentId.length > 12,"DOC_ID");
  const row = await prisma.petDocument.findFirst({where:{id:documentId,petId,ownerId:owner.id}});
  ensure(row && row.mimeType === "application/pdf" && row.sizeBytes === payload.length,"DOC_SQL_FIELDS");
  const location = parsePrivateMediaLocation(row.url);
  ensure(location?.kind === "documents" && location.key.startsWith(`documents/uploads/users/${owner.id}/pets/${petId}/documents/`),"PRIVATE_KEY_OWNER_BOUND");
  ownKeys.add(location.key);
  const head = await s3.send(new HeadObjectCommand({Bucket:documentBucket,Key:location.key}));
  ensure(head.ContentLength === payload.length,"ACTUAL_MINIO_HEAD");
  const object = await s3.send(new GetObjectCommand({Bucket:documentBucket,Key:location.key}));
  ensure(Buffer.from(await object.Body!.transformToByteArray()).equals(payload), "ACTUAL_S3_BYTES");
  const presentedUrl = obj(created.body.data).url;
  ensure(typeof presentedUrl === "string" && new URL(presentedUrl).origin === "http://127.0.0.1:9000", "OWNER_SIGNED_PRESENTATION");
  ensure((await fetch(presentedUrl)).status === 200,"SIGNED_OWNER_GET_BYTES");
  pass("ORIGINAL_HONO_POST_SQL_ACTUAL_S3_PUT_HEAD_GET_SIGNED");
  phase="list/rename";
  const list = await request(path,"GET",owner.token);
  ensure(list.status === 200 && Array.isArray(list.body.data) && (list.body.data as unknown[]).length === 1 &&
    obj((list.body.data as unknown[])[0]).id === documentId,"OWNER_LIST_READBACK");
  const rename = await request(`${path}/${documentId}`,"PUT",owner.token,{name:"AG1 renamed document"});
  ensure(rename.status === 200 && String(obj(rename.body.data).name).includes("AG1 renamed document"),"DOC_RENAME");
  const renamedRow = await prisma.petDocument.findUnique({where:{id:documentId}});
  ensure(renamedRow?.name.startsWith("AG1 renamed document") && renamedRow.url === row.url,"SQL_RENAME_NO_STORAGE_MUTATION");
  const download = await request(`${path}/${documentId}/download`,"GET",owner.token);
  const downloadUrl = obj(download.body.data).downloadUrl;
  ensure(download.status === 200 && typeof downloadUrl === "string" && new URL(downloadUrl).origin === "http://127.0.0.1:9000", "OWNER_DOWNLOAD_SIGNED");
  const fetched = await fetch(downloadUrl,{signal:AbortSignal.timeout(6000)});
  ensure(fetched.status === 200 && Buffer.from(await fetched.arrayBuffer()).equals(payload),"SIGNED_REAL_DOWNLOAD_BYTES");
  const cache = download.headers.get("Cache-Control") ?? "";
  console.warn("AG1_DOCS_DOWNLOAD_CACHE_HEADER=" + cache);
  ensure(cache.toLowerCase().includes("no-store"),"PRIVATE_DOWNLOAD_NO_STORE");
  pass("OWNER_LIST_RENAME_SQL_PRIVATE_SIGNED_REAL_DOWNLOAD");
  phase="foreign_security";
  for (const [method,suffix,body] of [
    ["GET","",undefined], ["PUT",`/${documentId}`,{name:"foreign overwrite"}],
    ["GET",`/${documentId}/download`,undefined],["DELETE",`/${documentId}`,undefined],
  ] as const) {
    const denied=await request(path+suffix,method,foreign.token,body);
    ensure(denied.status === 404 || (method === "GET" && suffix === "" &&
      denied.status === 200 && JSON.stringify(denied.body).indexOf(documentId) < 0),"FOREIGN_ACL");
  }
  const malformed = await request(`${path}/${documentId}`,"PUT",owner.token,{name:"  "});
  ensure(malformed.status === 400,"EMPTY_RENAME_DENY");
  const anonymous=await fetch(`http://127.0.0.1:9000/${documentBucket}/${location.key}`);
  ensure(anonymous.status === 403,"ANONYMOUS_S3_DENIED");
  ensure((await prisma.petDocument.findUnique({where:{id:documentId}}))?.ownerId === owner.id,"FOREIGN_SQL_UNCHANGED");
  pass("FOREIGN_OWNER_RENAME_DOWNLOAD_DELETE_404_AND_ANONYMOUS_DENIED");
  phase="delete";
  const deleted=await request(`${path}/${documentId}`,"DELETE",owner.token);
  ensure(deleted.status === 200 && deleted.body.success === true,"OWNER_DELETE_200");
  ownKeys.delete(location.key);
  ensure((await prisma.petDocument.count({where:{id:documentId}})) === 0,"SQL_ROW_REMOVED");
  try {await s3.send(new HeadObjectCommand({Bucket:documentBucket,Key:location.key}));
    throw new Error("ASSERT_S3_OBJECT_REMAINS");
  } catch(err) {ensure((err as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode === 404,"S3_DELETE_HEAD404");}
  ensure((await request(path,"GET",owner.token)).status === 200,"OWNER_EMPTY_DOCUMENTS_GET");
  ensure((await request(`${path}/${documentId}/download`,"GET",owner.token)).status === 404,"DELETED_DOWNLOAD404");
  pass("OWNER_DELETE_ACTUAL_S3_AND_SQL_RECONCILED");
}
async function cleanup() {
  // A failed HTTP response can still mean committed SQL/S3. Rediscover only
  // our own (ownerId,petId) records before deleting the fixture, and clean
  // their exact allowed private-object keys instead of prefix-wide deletes.
  if (petId && owner) {
    const rows=await prisma.petDocument.findMany({where:{petId,ownerId:owner.id},select:{url:true}});
    for (const row of rows) {
      const parsed=parsePrivateMediaLocation(row.url);
      if(parsed?.kind==="documents" &&
         parsed.key.startsWith(`documents/uploads/users/${owner.id}/pets/${petId}/documents/`)) {
        ownKeys.add(parsed.key);
      }
    }
  }
  // Only our synthetic URL keys, pet, users. Do not delete unrelated rows/objects.
  for (const key of ownKeys) {
    if (!owner || !petId ||
        !key.startsWith(`documents/uploads/users/${owner.id}/pets/${petId}/documents/`)) {
      process.exitCode=1;
      console.error("AG1_DOCS_UNOWNED_KEY_CLEANUP_DENIED");
      continue;
    }
    try {await deletePrivateUserMedia(`cloudru:documents:${key}`);} catch {
      console.error("AG1_DOCS_PRIVATE_CLEANUP_REVIEW_REQUIRED"); process.exitCode=1;
    }
  }
  if (petId && owner) {
    const p=await prisma.pet.findFirst({where:{id:petId,ownerId:owner.id},select:{name:true}});
    if (p?.name === `AG1 DOCS ${prefix}`) await prisma.pet.delete({where:{id:petId}});
  }
  for (const a of [owner,foreign]) if (a) {
    const record=await prisma.user.findUnique({where:{id:a.id},select:{username:true}});
    if (record?.username === a.username && a.username.startsWith(prefix)) await prisma.user.delete({where:{id:a.id}});
  }
}
void (async () => {
  try {await main();}
  catch(err) {process.exitCode=1;console.error(`AG1_DOCS_WORK_HTTP_FAILED phase=${phase} code=${err instanceof Error&&err.message.startsWith("ASSERT_")?err.message:"REDACTED"}`);}
  finally {try {await cleanup();if(owner) pass("SYNTHETIC_OWN_SQL_AND_OBJECT_CLEANUP");}
    catch {process.exitCode=1;console.error("AG1_DOCS_SQL_CLEANUP_REVIEW_REQUIRED");}
    s3?.destroy(); await prisma.$disconnect();}
})();
