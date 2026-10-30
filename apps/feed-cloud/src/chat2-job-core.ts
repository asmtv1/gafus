/**
 * Outbound signed core transport for Chat 2.0 media Container Job. Core must
 * separately verify HMAC, nonce replay, user access, lease and CAS status.
 * No client-supplied S3 keys are ever accepted from unauthenticated callers.
 */
import { createHash, createHmac, randomUUID } from "node:crypto";
import type { Chat2V2Claim, Chat2V2Core } from "./chat2-job-runner.js";
import type { Chat2JobKind } from "@gafus/feed-cloud";

const basePath = "/internal/chat2/media/jobs";
const paths = { claim: `${basePath}/claim`, renew: `${basePath}/renew`,
  complete: `${basePath}/complete`, fail: `${basePath}/fail` } as const;
const maxBytes = 64 * 1024;

export function createChat2JobCore(input: {baseUrl: string; secret: Uint8Array;
  fetcher?: typeof fetch; now?: () => number}): Chat2V2Core {
  const url = new URL(input.baseUrl);
  const local = process.env.GAFUS_LOCAL_ISOLATED_API === "1" &&
    ["127.0.0.1", "localhost"].includes(url.hostname);
  if ((!local && url.protocol !== "https:") || (local && url.protocol !== "http:") ||
      url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      input.secret.byteLength < 32) throw new Error("CHAT2_CORE_INVALID_CONFIGURATION");
  const now = input.now ?? Date.now;
  async function call(path: string, payload: object): Promise<unknown> {
    const body=JSON.stringify(payload);
    if (Buffer.byteLength(body)>16*1024) throw Error("CHAT2_CORE_REQUEST_TOO_LARGE");
    const timestamp=Math.floor(now()/1000).toString();
    const nonce=randomUUID();
    const digest=createHash("sha256").update(body).digest("hex");
    const toSign=`POST\n${path}\n${timestamp}\n${nonce}\n${digest}`;
    const signature=createHmac("sha256",input.secret).update(toSign).digest("hex");
    const response=await (input.fetcher??fetch)(url.origin+path,{
      method:"POST",redirect:"error",signal:AbortSignal.timeout(8000),body,
      headers:{"content-type":"application/json", "x-chat2-timestamp":timestamp,
        "x-chat2-nonce":nonce,"x-chat2-signature":signature},
    });
    if (!response.ok) {await response.body?.cancel();throw Error(`CHAT2_CORE_HTTP_${response.status}`);}
    if (Number(response.headers.get("content-length"))>maxBytes){
      await response.body?.cancel();throw Error("CHAT2_CORE_RESPONSE_TOO_LARGE");
    }
    const reader=response.body?.getReader();
    if(!reader)throw Error("CHAT2_CORE_RESPONSE_EMPTY");
    const parts:Uint8Array[]=[];let n=0;
    try{
      for(;;){const part=await reader.read();if(part.done)break;
        n+=part.value.byteLength;if(n>maxBytes){await reader.cancel();throw Error("CHAT2_CORE_RESPONSE_TOO_LARGE");}
        parts.push(part.value);}
    }finally{reader.releaseLock();}
    const bytes=new Uint8Array(n);let offset=0;
    for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
    return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
  }
  function accepted(value:unknown): {accepted:boolean} {
    if(!value || typeof value!=="object" || typeof (value as {accepted?:unknown}).accepted!=="boolean")
      throw Error("CHAT2_CORE_INVALID_ACK");
    return {accepted:(value as {accepted:boolean}).accepted};
  }
  return {
    async claimOne(kind:Chat2JobKind){
      if(kind!=="image"&&kind!=="video")throw Error("CHAT2_INVALID_CLAIM_KIND");
      const output=await call(paths.claim,{batchSize:1,kind});
      if(output===null)return null;
      if(!output || typeof output!=="object" || !Array.isArray((output as {jobs?:unknown}).jobs))
        throw Error("CHAT2_CORE_INVALID_CLAIM");
      const jobs=(output as {jobs:unknown[]}).jobs;
      if(jobs.length>1 || jobs.some(x=>!x || typeof x!=="object"))throw Error("CHAT2_CORE_INVALID_CLAIM");
      return (jobs[0]??null) as Chat2V2Claim|null;
    },
    async renew(mediaId,attemptToken){return accepted(await call(paths.renew,{mediaId,attemptToken}));},
    async complete(job,manifest){return accepted(await call(paths.complete,
      {mediaId:job.mediaId,attemptToken:job.attemptToken,manifest}));},
    async fail(job,errorCode){accepted(await call(paths.fail,
      {mediaId:job.mediaId,attemptToken:job.attemptToken,code:errorCode}));},
  };
}
