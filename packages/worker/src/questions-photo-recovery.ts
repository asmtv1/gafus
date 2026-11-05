/** Questions photo S3 cleanup. GAFUS Worker owns DELETE; Hono owns PostgreSQL leases.
 * No Cloud.ru Container Job, no public S3 keys from a caller, and no API DELETE.
 */
import { createWorkerLogger } from "@gafus/logger";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { questionsV2CleanupKeys, questionsV2Delete,
  type QuestionsV2CleanupIdentity } from "@gafus/cdn-upload";

export function createQuestionsPhotoRecoveryTick(input:{
  cleanup:()=>Promise<unknown>;
  onCleanupError?:(error:unknown)=>void;
}){
  let running=false;
  return async()=>{
    if(running)return {skipped:true,dispatched:0};
    running=true;
    try{
      try{await input.cleanup();}
      catch(error){input.onCleanupError?.(error);}
      return {dispatched:0};
    }finally{running=false;}
  };
}
const recoveryLogger=createWorkerLogger("questions-photo-recovery");
let tick:ReturnType<typeof createQuestionsPhotoRecoveryTick>|undefined;
export async function runQuestionsPhotoRecoveryTick(){
  if(process.env.QUESTIONS_V2_MEDIA_ENABLED!=="true")return;
  tick??=createQuestionsPhotoRecoveryTick({
    cleanup:questionsPhotoCleanupInternal,
    onCleanupError:()=>recoveryLogger.error("Questions V2 local S3 cleanup failed",
      new Error("QUESTIONS_V2_LOCAL_S3_CLEANUP_FAILED")),
  });
  await tick();
}

type CleanupClaim = QuestionsV2CleanupIdentity & {
  cleanupToken:string;cleanupLeaseUntil:string;
};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function verifiedJob(raw:unknown):{job:CleanupClaim;keys:string[]}|null{
  if(!raw||typeof raw!=="object"||!("job" in raw))
    throw Error("QUESTIONS_V2_JANITOR_UNTRUSTED_CLAIM");
  const job=(raw as {job:unknown}).job;
  if(job===null)return null;
  if(!job||typeof job!=="object")throw Error("QUESTIONS_V2_JANITOR_UNTRUSTED_CLAIM");
  const item=job as Record<string,unknown>;
  if(Object.keys(item).sort().join(",")!==[
    "cleanupKind","cleanupLeaseUntil","cleanupToken","mediaId", "ownerId",
    "sourceKey","sourceMime"].sort().join(",") ||
    typeof item.mediaId!=="string"||typeof item.cleanupToken!=="string"||
    !uuid.test(item.mediaId)||!uuid.test(item.cleanupToken)||
    typeof item.ownerId!=="string"||typeof item.sourceKey!=="string"||
    typeof item.sourceMime!=="string"||typeof item.cleanupKind!=="string"||
    typeof item.cleanupLeaseUntil!=="string"||
    !Number.isFinite(Date.parse(item.cleanupLeaseUntil))||
    Date.parse(item.cleanupLeaseUntil)<Date.now()+20_000)
    throw Error("QUESTIONS_V2_JANITOR_UNTRUSTED_CLAIM");
  const verified=item as unknown as CleanupClaim;
  return {job:verified,keys:questionsV2CleanupKeys(verified)};
}
function cleanupOrigin(env:NodeJS.ProcessEnv){
  const root=env.QUESTIONS_V2_INTERNAL_BASE_URL;
  const secret=env.QUESTIONS_V2_INTERNAL_HMAC_SECRET;
  if(!root||!secret||Buffer.byteLength(secret)<32)
    throw Error("QUESTIONS_V2_RECOVERY_AUTH_NOT_CONFIGURED");
  const address=new URL(root);
  const local=env.GAFUS_LOCAL_ISOLATED_API==="1" &&
    ["127.0.0.1","localhost"].includes(address.hostname) &&
    address.protocol==="http:" && address.port==="3001";
  const forbidden=new Set(["gafus.ru","api.gafus.ru","www.gafus.ru",
    "gafus.app","api.gafus.app","www.gafus.app"]);
  const productionApi=env.NODE_ENV==="production" &&
    env.GAFUS_LOCAL_ISOLATED_API!=="1" && address.hostname==="api.gafus.ru";
  const verifiedCloud=address.protocol==="https:" && !address.port &&
    env.QUESTIONS_V2_INTERNAL_REFRACTOR_VERIFIED==="true" &&
    env.QUESTIONS_V2_INTERNAL_ALLOWED_HOSTNAME===address.hostname &&
    (productionApi||(!forbidden.has(address.hostname) &&
      !address.hostname.endsWith(".gafus.ru") &&
      !address.hostname.endsWith(".gafus.app")));
  if(!(local||verifiedCloud)||address.pathname!=="/"||address.search||
      address.hash||address.username||address.password)
    throw Error("QUESTIONS_V2_RECOVERY_UNSAFE_ORIGIN");
  return {origin:productionApi?"http://api:3001":address.origin,secret};
}
type CleanupHttp=(url:string,init:RequestInit)=>Promise<Response>;
async function signedCleanupRequest(op:"claim"|"complete"|"fail",body:object,
  env:NodeJS.ProcessEnv,http:CleanupHttp):Promise<unknown>{
  const {origin,secret}=cleanupOrigin(env);
  const path=`/internal/questions/media/jobs/${op}`;
  const payload=JSON.stringify(body),stamp=Math.floor(Date.now()/1000).toString();
  const nonce=randomUUID(),digest=createHash("sha256").update(payload).digest("hex");
  const signature=createHmac("sha256",secret)
    .update(["POST",path,stamp,nonce,digest].join("\n")).digest("hex");
  const res=await http(origin+path,{method:"POST",redirect:"error",body:payload,
    signal:AbortSignal.timeout(15_000),headers:{"content-type":"application/json",
      "x-questions-timestamp":stamp,"x-questions-nonce":nonce,
      "x-questions-signature":signature}});
  if(!res.ok){await res.body?.cancel();throw Error("QUESTIONS_V2_JANITOR_HTTP_"+res.status);}
  if(Number(res.headers.get("content-length")??0)>4096){
    await res.body?.cancel();throw Error("QUESTIONS_V2_JANITOR_UNTRUSTED_RESPONSE");
  }
  const responseText=await res.text();
  if(Buffer.byteLength(responseText)>4096)throw Error("QUESTIONS_V2_JANITOR_UNTRUSTED_RESPONSE");
  try{return JSON.parse(responseText) as unknown;}
  catch{throw Error("QUESTIONS_V2_JANITOR_UNTRUSTED_RESPONSE");}
}

/** Exactly one leased photo cleanup per tick; S3 deletion is performed HERE.
 * A lost acknowledgement leaves the lease to expire; retry is idempotent.
 */
export async function questionsPhotoCleanupInternal(options:{
  env?:NodeJS.ProcessEnv;http?:CleanupHttp;
  deleteObjects?:(keys:readonly string[])=>Promise<void>;
}={}):Promise<{cleaned:boolean}>{
  const env=options.env??process.env,http=options.http??fetch;
  const request=(op:"claim"|"complete"|"fail",body:object)=>
    signedCleanupRequest(op,body,env,http);
  const claimed=verifiedJob(await request("claim",{batchSize:1}));
  if(!claimed)return {cleaned:false};
  const {job,keys}=claimed;
  try{await (options.deleteObjects??questionsV2Delete)(keys);}
  catch{
    // A failed physical DELETE is retried after a PostgreSQL backoff.
    // Never report completion or remove the source/cleanup receipt in this case.
    const failed=await request("fail",{mediaId:job.mediaId,cleanupToken:job.cleanupToken,cleanupKind:job.cleanupKind});
    if(!failed||typeof failed!=="object"||
       (failed as {accepted?:unknown}).accepted!==true)
      throw Error("QUESTIONS_V2_JANITOR_FAIL_UNACKNOWLEDGED");
    throw Error("QUESTIONS_V2_JANITOR_DELETE_RETRY");
  }
  const finished=await request("complete",{mediaId:job.mediaId,cleanupToken:job.cleanupToken,cleanupKind:job.cleanupKind});
  if(!finished||typeof finished!=="object"||
     (finished as {accepted?:unknown}).accepted!==true)
    throw Error("QUESTIONS_V2_JANITOR_COMPLETION_UNACKNOWLEDGED");
  return {cleaned:true};
}
