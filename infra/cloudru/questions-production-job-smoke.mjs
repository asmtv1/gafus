/** One real production Job execution, isolated disposable private fixture only.
 * Stop if any other pending Questions uploads exist. Never touch user records.
 */
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
const cdnUploadRequire = createRequire(new URL("../../packages/cdn-upload/package.json", import.meta.url));
const sharpRequire = createRequire(new URL("../../apps/feed-cloud/package.json", import.meta.url));
const sharp = sharpRequire("sharp");
const S3 = cdnUploadRequire("@aws-sdk/client-s3");
const project = process.env.CLOUDRU_PROJECT_ID;
const id = "gafus-questions-photo";
const releaseSha = process.env.GITHUB_SHA;
if (!/^[a-f0-9]{40}$/.test(releaseSha ?? ""))
  throw Error("QUESTIONS_SMOKE_INVALID_RELEASE_SHA");
const imageBase = "gafus.cr.cloud.ru/gafus-questions-worker";
const manifest = spawnSync("docker", ["manifest", "inspect", "--verbose",
  imageBase + ":" + releaseSha], {encoding:"utf8",timeout:45000});
if (manifest.status !== 0) throw Error("QUESTIONS_SMOKE_RELEASE_IMAGE_NOT_PUBLISHED");
const inspect = JSON.parse(manifest.stdout);
const descriptor = (Array.isArray(inspect) ? inspect[0] : inspect)?.Descriptor;
if (descriptor?.platform?.architecture !== "amd64" ||
    !/^sha256:[a-f0-9]{64}$/.test(descriptor.digest ?? ""))
  throw Error("QUESTIONS_SMOKE_RELEASE_IMAGE_ARCH_OR_DIGEST_INVALID");
const expectedImage = imageBase + "@" + descriptor.digest;
const bucket = "gafus-questions-public";
for (const key of ["CLOUDRU_PROJECT_ID","CLOUDRU_KEY_ID","CLOUDRU_KEY_SECRET",
                  "CLOUDRU_S3_ACCESS_KEY_ID","CLOUDRU_S3_SECRET_ACCESS_KEY"])
  if (!process.env[key]) throw Error("QUESTIONS_SMOKE_MISSING_REQUIRED_ENV_" + key);
if (!/^[a-f0-9-]{32,40}$/.test(project)) throw Error("QUESTIONS_SMOKE_PROJECT_UNSAFE");
const client = new S3.S3Client({
  endpoint: "https://s3.cloud.ru", region: "ru-central-1", forcePathStyle: true, maxAttempts: 2,
  credentials: {accessKeyId: process.env.CLOUDRU_S3_ACCESS_KEY_ID,
                secretAccessKey: process.env.CLOUDRU_S3_SECRET_ACCESS_KEY},
});
const uid = randomUUID();
const objectId = "0qa-job-readiness";
const path = "questions/incoming/questions/" + objectId + "/" + uid + "/source.png";
const intermediate = "questions/processed/questions/" + objectId + "/" + uid + "/";
const work = "questions/jobs/pending/questions/" + objectId + "/" + uid + "/source.png";
const publicPrefix = "questions/uploads/questions/" + objectId + "/" + uid + "/";
const candidates = [path, work, intermediate+"thumb.webp", intermediate+"full.webp",
  intermediate+"failed.json", publicPrefix+"thumb.webp", publicPrefix+"full.webp"];
const send = cmd => client.send(cmd, {abortSignal: AbortSignal.timeout(18000)});
async function fetchJson(url, init) {
  const r = await fetch(url, {...init, signal: AbortSignal.timeout(18000)});
  if (!r.ok) throw Error("QUESTIONS_SMOKE_API_HTTP_"+r.status);
  return r.json();
}
async function head(key) {
  try { return await send(new S3.HeadObjectCommand({Bucket:bucket,Key:key})); }
  catch (e) {if(e.$metadata?.httpStatusCode===404)return null; throw e;}
}
async function wait(ms) {await new Promise(resolve=>setTimeout(resolve,ms));}
let created=false, executed=false, success=false;
try {
  const login=await fetchJson("https://iam.api.cloud.ru/api/v1/auth/token", {
    method:"POST", headers:{"content-type":"application/json"},
    body:JSON.stringify({keyId:process.env.CLOUDRU_KEY_ID,secret:process.env.CLOUDRU_KEY_SECRET}),
  });
  if (!login.access_token)throw Error("QUESTIONS_SMOKE_IAM_EMPTY");
  const token=login.access_token;
  const auth={authorization:"Bearer "+token};
  const details=await fetchJson("https://containers.api.cloud.ru/v2/jobs/"+id+"?projectId="+
    encodeURIComponent(project),{headers:auth});
  const c=details?.template?.containers?.[0];
  if (details?.name!==id || details?.projectId!==project || c?.image!==expectedImage ||
      c?.name!==id || !c.env?.some(e=>e.name==="QUESTIONS_JOB_ENABLED"))
    throw Error("QUESTIONS_SMOKE_JOB_NOT_EXPECTED");
  console.log("QUESTIONS_SMOKE_REAL_JOB_VERIFIED",id);
  // Do not block a later release merely because real user photos are in
  // flight. The Job normally processes those sources; this smoke only
  // verifies and cleans its own UUID-scoped fixture.
  const fixture=await sharp({create:{width:720,height:480,channels:3,
    background:{r:90,g:128,b:65}}}).png().toBuffer();
  await send(new S3.PutObjectCommand({
    Bucket:bucket,Key:path,IfNoneMatch:"*",Body:fixture,ContentLength:fixture.length,
    ContentType:"image/png",CacheControl:"private, no-store",
  }));
  created=true;
  console.log("QUESTIONS_SMOKE_SOURCE_UPLOADED",fixture.length);
  // The worker normally discovers immutable work records, not the entire source prefix.
  // A smoke without this marker would test only the 15-minute compatibility recovery.
  await send(new S3.PutObjectCommand({
    Bucket:bucket,Key:work,IfNoneMatch:"*",Body:Buffer.from([1]),
    ContentLength:1,ContentType:"application/octet-stream",CacheControl:"private, no-store",
  }));
  console.log("QUESTIONS_SMOKE_PRIVATE_WORK_ENQUEUED");
  const response=await fetch("https://containers.api.cloud.ru/v2/jobs/"+id+":execute",{
    method:"POST",headers:{...auth,"content-type":"application/json"},
    body:JSON.stringify({projectId:project,jobName:id,params:{}}),
    signal:AbortSignal.timeout(18000),
  });
  if(!response.ok)throw Error("QUESTIONS_SMOKE_EXECUTE_HTTP_"+response.status);
  executed=true;
  console.log("QUESTIONS_SMOKE_REAL_JOB_EXECUTE_ACCEPTED",response.status);
  let finished=false;
  for(let attempt=0;attempt<68;attempt++){
    const err=await head(intermediate+"failed.json");
    if(err)throw Error("QUESTIONS_SMOKE_PROCESSOR_REJECTED_IMAGE");
    const thumb=await head(intermediate+"thumb.webp");
    const full=await head(intermediate+"full.webp");
    if(thumb&&full){
      for(const [name,meta] of [["thumb",thumb],["full",full]]){
        if(meta.ContentType!=="image/webp" || !meta.ContentLength ||
           meta.ContentLength>1_750_000)throw Error("QUESTIONS_SMOKE_STAGE_METADATA_"+name);
        const response=await send(new S3.GetObjectCommand({
          Bucket:bucket,Key:intermediate+name+".webp",
        }));
        const bytes=Buffer.from(await response.Body.transformToByteArray());
        const info=await sharp(bytes).metadata();
        if(info.format!=="webp"||info.exif || !info.width || info.width>(name==="thumb"?480:1920))
          throw Error("QUESTIONS_SMOKE_NOT_VALID_WEBP_"+name);
        console.log("QUESTIONS_SMOKE_WEBP_OK",name,bytes.length,info.width,info.height);
      }
      finished=true;
      break;
    }
    await wait(5000);
  }
  if(!finished)throw Error("QUESTIONS_SMOKE_JOB_PROCESSING_TIMEOUT");
  // Both staged WebP may become visible shortly before the marker DELETE.
  // Observe the separate acknowledgement with a bounded wait, not a racy HEAD.
  let acknowledged=false;
  for(let attempt=0;attempt<15;attempt++){
    if(!(await head(work))){acknowledged=true;break;}
    await wait(1000);
  }
  if(!acknowledged)throw Error("QUESTIONS_SMOKE_WORK_NOT_ACKNOWLEDGED");
  for(const key of [publicPrefix+"thumb.webp",publicPrefix+"full.webp"]){
    if(await head(key))throw Error("QUESTIONS_SMOKE_UNEXPECTED_PUBLIC_WRITE");
  }
  success=true;
} finally {
  let clean=true;
  if(created){
    for(const key of candidates){
      try {
        await send(new S3.DeleteObjectCommand({Bucket:bucket,Key:key}));
        if(await head(key)){clean=false;console.log("QUESTIONS_SMOKE_OBJECT_NOT_DELETED");}
      }catch(e){clean=false;console.log("QUESTIONS_SMOKE_CLEANUP_ERROR",e.name);}
    }
  }
  client.destroy();
  console.log("QUESTIONS_REAL_JOB_E2E_RESULT",{executed,success,cleanup:clean});
  if(!clean)process.exitCode=1;
}
