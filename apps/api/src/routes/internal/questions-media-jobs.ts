/** Internal Questions S3 cleanup lease API. Physical DELETE runs only in Worker. */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod/v3";
import { connection as redis } from "@gafus/queues";
import { createLiveQuestionsV2Queue, type QuestionsV2Queue } from "../../modules/questions/media-v2-jobs.js";

const prefix="/internal/questions/media/jobs/";
const routes=new Set(["claim","complete","fail"]);
const schema={
  claim:z.object({batchSize:z.literal(1)}).strict(),
  complete:z.object({mediaId:z.string().uuid(),cleanupToken:z.string().uuid(),
    cleanupKind:z.enum(["SOURCE","ALL"])}).strict(),
  fail:z.object({mediaId:z.string().uuid(),cleanupToken:z.string().uuid(),
    cleanupKind:z.enum(["SOURCE","ALL"])}).strict(),
} as const;
function invalid(code:string,status:number){
  return Object.assign(new Error(code),{status});
}
export function createQuestionsInternalDispatcher(deps:{
  secret:Uint8Array;
  consumeNonce:(nonce:string,expiry:number)=>Promise<boolean>;
  queue:Pick<QuestionsV2Queue,"claimCleanup"|"completeCleanup"|"failCleanup">;
  now?:()=>number;
}){
  const now=deps.now??Date.now;
  return async(request:Request,pathname:string):Promise<unknown>=>{
    const url=new URL(request.url);
    const op=pathname.startsWith(prefix)?pathname.slice(prefix.length):"";
    if(url.pathname!==pathname || url.search || !routes.has(op))throw invalid("NOT_FOUND",404);
    if(request.method!=="POST")throw invalid("METHOD_NOT_ALLOWED",405);
    if(request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase()!=="application/json")
      throw invalid("CONTENT_TYPE_REQUIRED",415);
    if(deps.secret.length<32)throw invalid("NOT_CONFIGURED",503);
    if(Number(request.headers.get("content-length")??0)>16_384)
      throw invalid("BODY_TOO_LARGE",413);
    let size=0;
    const chunks:Uint8Array[]=[];
    const reader=request.body?.getReader();
    try{
      if(reader)for(;;){
        const chunk=await reader.read();
        if(chunk.done)break;
        size+=chunk.value.byteLength;
        if(size>16_384){await reader.cancel();throw invalid("BODY_TOO_LARGE",413);}
        chunks.push(chunk.value);
      }
    }finally{reader?.releaseLock();}
    const body=Buffer.concat(chunks);
    const stamp=request.headers.get("x-questions-timestamp")??"";
    const nonce=request.headers.get("x-questions-nonce")??"";
    const digest=request.headers.get("x-questions-signature")??"";
    const timestamp=Number(stamp);
    if(!/^\d{10,12}$/.test(stamp)||!Number.isSafeInteger(timestamp)||
        Math.abs(now()-timestamp*1000)>120_000||
        !/^[0-9a-f-]{36}$/i.test(nonce)||!/^[0-9a-f]{64}$/i.test(digest))
      throw invalid("INVALID_SIGNATURE",401);
    const hash=createHash("sha256").update(body).digest("hex");
    const signed=["POST",pathname,stamp,nonce,hash].join("\n");
    const actual=createHmac("sha256",deps.secret).update(signed).digest();
    if(!timingSafeEqual(Buffer.from(digest,"hex"),actual))
      throw invalid("INVALID_SIGNATURE",401);
    if(!await deps.consumeNonce(nonce,now()+130_000))
      throw invalid("REPLAY_DENIED",401);
    let parsed:unknown;
    try{parsed=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(body));}
    catch{throw invalid("INVALID_JSON",400);}
    if(op==="claim"){
      const checked=schema.claim.safeParse(parsed);
      if(!checked.success)throw invalid("INVALID_COMMAND",400);
      return deps.queue.claimCleanup();
    }
    if(op==="complete"){
      const checked=schema.complete.safeParse(parsed);
      if(!checked.success)throw invalid("INVALID_COMMAND",400);
      return deps.queue.completeCleanup(checked.data.mediaId,checked.data.cleanupToken,
        checked.data.cleanupKind);
    }
    if(op==="fail"){
      const checked=schema.fail.safeParse(parsed);
      if(!checked.success)throw invalid("INVALID_COMMAND",400);
      return deps.queue.failCleanup(checked.data.mediaId,checked.data.cleanupToken,
        checked.data.cleanupKind);
    }
    throw invalid("NOT_FOUND",404);
  };
}
export const internalQuestionsMediaJobRoutes=new Hono();
internalQuestionsMediaJobRoutes.use("*",async(c,next)=>{
  c.header("Cache-Control","no-store");
  await next();
});
internalQuestionsMediaJobRoutes.all("*",async c=>{
  if(process.env.QUESTIONS_V2_MEDIA_ENABLED!=="true")
    return c.json({error:"QUESTIONS_V2_DISABLED"},503);
  const secret=Buffer.from(process.env.QUESTIONS_V2_INTERNAL_HMAC_SECRET??"","utf8");
  if(secret.length<32)return c.json({error:"QUESTIONS_V2_NOT_CONFIGURED"},503);
  const consumeNonce=async(id:string,expires:number)=>{
    if(redis.status!=="ready")throw Error("NONCE_REDIS_NOT_READY");
    return (await redis.set("questions-photo-v2-nonce:"+id,"1","PXAT",expires,"NX"))==="OK";
  };
  try{
    const answer=await createQuestionsInternalDispatcher({
      secret,consumeNonce,queue:createLiveQuestionsV2Queue(),
    })(c.req.raw,new URL(c.req.url).pathname);
    return c.json(answer,200);
  }catch(e){
    const status=(e as {status?:number}).status??503;
    return c.json({error:status===401?"UNAUTHORIZED":status<500?"INVALID_REQUEST":"JOB_UNAVAILABLE"},
      status as 400);
  }
});
