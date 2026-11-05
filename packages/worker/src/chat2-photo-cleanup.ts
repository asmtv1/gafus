/**
 * Reconcile abandoned Chat2 client WebP uploads without any Cloud photo Job.
 * The existing Worker makes one signed cleanup request to Hono per tick;
 * core remains the sole owner of leases, S3 key derivation and deletion.
 */
import {createHash,createHmac,randomUUID} from "node:crypto";

export function createChat2PhotoCleanupTick(input:{
  request:()=>Promise<unknown>;
  onError?:(cause:unknown)=>void;
}){
  let running=false;
  return async()=>{
    if(running)return {skipped:true,cleaned:false};
    running=true;
    try{
      try{await input.request();return {cleaned:true};}
      catch(cause){input.onError?.(cause);return {cleaned:false};}
    }finally{running=false;}
  };
}

/** HTTP origin is constant: never send HMAC auth to an operator-provided URL. */
export async function cleanupChat2ClientPhotoReservations(
  env:Record<string,string|undefined>=process.env,
  http:typeof fetch=fetch,
){
  if(env.CHAT2_V2_CORE_ENABLED!=="true"||env.CHAT2_V2_MEDIA_ENABLED!=="true")
    return {disabled:true};
  const secret=env.CHAT2_INTERNAL_HMAC_SECRET??"";
  if(Buffer.byteLength(secret)<32)throw Error("CHAT2_PHOTO_JANITOR_HMAC_MISSING");
  const local=env.GAFUS_LOCAL_ISOLATED_API==="1"&&env.NODE_ENV!=="production";
  const url=(local?"http://127.0.0.1:3001":"http://api:3001")+
    "/internal/chat2/media/jobs/cleanup";
  const path="/internal/chat2/media/jobs/cleanup";
  const body=JSON.stringify({batchSize:1});
  const timestamp=Math.floor(Date.now()/1000).toString();
  const nonce=randomUUID();
  const digest=createHash("sha256").update(body).digest("hex");
  const signature=createHmac("sha256",secret)
    .update(["POST",path,timestamp,nonce,digest].join("\n")).digest("hex");
  const response=await http(url,{method:"POST",redirect:"error",body,
    signal:AbortSignal.timeout(15_000),headers:{
      "content-type":"application/json",
      "x-chat2-timestamp":timestamp,
      "x-chat2-nonce":nonce,
      "x-chat2-signature":signature,
    }});
  if(!response.ok){await response.body?.cancel();
    throw Error("CHAT2_PHOTO_JANITOR_HTTP_"+response.status);}
  const bodyText=await response.text();
  if(Buffer.byteLength(bodyText)>4_096)throw Error("CHAT2_PHOTO_JANITOR_RESPONSE_TOO_BIG");
  let result:unknown;
  try{result=JSON.parse(bodyText);}catch{throw Error("CHAT2_PHOTO_JANITOR_BAD_JSON");}
  if(!result||typeof result!=="object"||
      typeof (result as {cleaned?:unknown}).cleaned!=="boolean")
    throw Error("CHAT2_PHOTO_JANITOR_BAD_RESPONSE");
  return {cleaned:(result as {cleaned:boolean}).cleaned};
}

let scheduled:ReturnType<typeof createChat2PhotoCleanupTick>|undefined;
export async function runChat2PhotoCleanupTick(){
  if(process.env.CHAT2_V2_MEDIA_ENABLED!=="true" ||
    process.env.CHAT2_V2_CORE_ENABLED!=="true")return;
  scheduled??=createChat2PhotoCleanupTick({
    request:()=>cleanupChat2ClientPhotoReservations(),
    onError:()=>{
      // No S3 paths/signatures, header values or provider raw errors in logs.
      console.error("CHAT2_CLIENT_PHOTO_RECONCILIATION_FAILED");
    },
  });
  await scheduled();
}
