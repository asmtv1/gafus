/** HMAC-authenticated, one-shot Questions V2 Core client for Cloud.ru jobs. */
import { createHash,createHmac,randomUUID } from "node:crypto";
import type { QuestionsV2Claim } from "./questions-v2-job-runner.js";
import type { QuestionsV2Manifest } from "@gafus/feed-cloud";
const basePath="/internal/questions/media/jobs";
const paths={claim:basePath+"/claim",renew:basePath+"/renew",
  complete:basePath+"/complete",fail:basePath+"/fail"} as const;
export interface QuestionsV2Core {
  claimOne():Promise<QuestionsV2Claim|null>;
  renew(id:string,token:string):Promise<{accepted:boolean}>;
  complete(id:string,token:string,manifest:QuestionsV2Manifest):Promise<{accepted:boolean}>;
  fail(id:string,token:string,code:string):Promise<{accepted:boolean}>;
}
export function createQuestionsV2JobCore(input:{
  baseUrl:string;secret:Uint8Array;fetcher?:typeof fetch;now?:()=>number;
}):QuestionsV2Core {
  const origin=new URL(input.baseUrl);
  const isolated=process.env.GAFUS_LOCAL_ISOLATED_API==="1" &&
    ["127.0.0.1","localhost"].includes(origin.hostname) &&
    origin.protocol==="http:" && origin.port==="3001";
  const forbidden=new Set(["gafus.ru","api.gafus.ru","www.gafus.ru",
    "gafus.app","api.gafus.app","www.gafus.app"]);
  // Match the production Questions-only Job activation contract: the job
  // runs in a minimal Node image without NODE_ENV, so require the explicit
  // verified Job gate rather than relying on NODE_ENV=production.
  // Keep this exact-host exception aligned with Worker recovery cleanup.
  const productionApi=process.env.QUESTIONS_V2_JOB_ENABLED==="true" &&
    process.env.GAFUS_LOCAL_ISOLATED_API!=="1" &&
    origin.hostname==="api.gafus.ru";
  const verifiedCloud=origin.protocol==="https:" && !origin.port &&
    process.env.QUESTIONS_V2_INTERNAL_REFRACTOR_VERIFIED==="true" &&
    process.env.QUESTIONS_V2_INTERNAL_ALLOWED_HOSTNAME===origin.hostname &&
    (productionApi || (!forbidden.has(origin.hostname) &&
      !origin.hostname.endsWith(".gafus.ru") &&
      !origin.hostname.endsWith(".gafus.app")));
  if(!(isolated || verifiedCloud)||
      origin.pathname!=="/"||origin.search||origin.hash||origin.username||
      origin.password||input.secret.length<32)
    throw Error("QUESTIONS_V2_CORE_UNSAFE_ORIGIN");
  const now=input.now??Date.now;
  async function call(path:string,data:object):Promise<unknown>{
    const body=JSON.stringify(data);
    if(Buffer.byteLength(body)>16_384)throw Error("QUESTIONS_V2_CORE_REQUEST_OVERSIZE");
    const stamp=Math.floor(now()/1000).toString(),nonce=randomUUID();
    const sha=createHash("sha256").update(body).digest("hex");
    const sig=createHmac("sha256",input.secret)
      .update(["POST",path,stamp,nonce,sha].join("\n")).digest("hex");
    const response=await (input.fetcher??fetch)(origin.origin+path,{
      method:"POST",redirect:"error",body,
      signal:AbortSignal.timeout(12_000),
      headers:{"content-type":"application/json","x-questions-timestamp":stamp,
        "x-questions-nonce":nonce,"x-questions-signature":sig},
    });
    if(!response.ok){await response.body?.cancel();throw Error("QUESTIONS_V2_CORE_HTTP_"+response.status);}
    if(Number(response.headers.get("content-length")??0)>64*1024){
      await response.body?.cancel();throw Error("QUESTIONS_V2_CORE_RESPONSE_OVERSIZE");
    }
    const reader=response.body?.getReader();
    if(!reader)throw Error("QUESTIONS_V2_CORE_EMPTY");
    let total=0;
    const parts:Uint8Array[]=[];
    try{
      for(;;){
        const part=await reader.read();
        if(part.done)break;
        total+=part.value.byteLength;
        if(total>64*1024){await reader.cancel();throw Error("QUESTIONS_V2_CORE_RESPONSE_OVERSIZE");}
        parts.push(part.value);
      }
    }finally{reader.releaseLock();}
    return JSON.parse(Buffer.concat(parts.map(p=>Buffer.from(p))).toString("utf8")) as unknown;
  }
  function ack(v:unknown):{accepted:boolean}{
    if(!v||typeof v!=="object"||typeof (v as {accepted?:unknown}).accepted!=="boolean")
      throw Error("QUESTIONS_V2_INVALID_ACK");
    return v as {accepted:boolean};
  }
  return {
    async claimOne(){
      const result=await call(paths.claim,{batchSize:1});
      if(!result||typeof result!=="object"||
          !Array.isArray((result as {jobs?:unknown}).jobs)||
          (result as {jobs:unknown[]}).jobs.length>1)
        throw Error("QUESTIONS_V2_INVALID_CLAIM");
      return (result as {jobs:QuestionsV2Claim[]}).jobs[0]??null;
    },
    async renew(id,token){return ack(await call(paths.renew,{mediaId:id,attemptToken:token}));},
    async complete(id,token,manifest){return ack(await call(paths.complete,
      {mediaId:id,attemptToken:token,manifest}));},
    async fail(id,token,code){return ack(await call(paths.fail,
      {mediaId:id,attemptToken:token,code}));},
  };
}
