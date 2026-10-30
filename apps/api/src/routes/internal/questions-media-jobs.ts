/** Internal Questions Photo Jobs API: HMAC, replay protection, exact schema. */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod/v3";
import { connection as redis } from "@gafus/queues";
import { createLiveQuestionsV2Queue, type QuestionsV2Queue } from "../../modules/questions/media-v2-jobs.js";

const prefix="/internal/questions/media/jobs/";
const routes=new Set(["claim","renew","complete","fail","cleanup"]);
const uuid=z.string().uuid();
const attempt=z.object({mediaId:uuid,attemptToken:uuid}).strict();
const rendition=z.object({key:z.string().min(20).max(500),width:z.number().int().min(1),
  height:z.number().int().min(1),bytes:z.number().int().min(12)}).strict();
const schema={
  claim:z.object({batchSize:z.literal(1)}).strict(),
  cleanup:z.object({batchSize:z.literal(1)}).strict(),
  renew:attempt,
  complete:attempt.extend({manifest:z.object({
    kind:z.literal("image"),
    variants:z.object({small:rendition,medium:rendition}).strict(),
  }).strict()}).strict(),
  fail:attempt.extend({code:z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/)}).strict(),
} as const;
function invalid(code:string,status:number){
  return Object.assign(new Error(code),{status});
}
export function createQuestionsInternalDispatcher(deps:{
  secret:Uint8Array;
  consumeNonce:(nonce:string,expiry:number)=>Promise<boolean>;
  queue:QuestionsV2Queue;
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
    const checked=schema[op as keyof typeof schema].safeParse(parsed);
    if(!checked.success)throw invalid("INVALID_COMMAND",400);
    switch(op){
      case "claim":return deps.queue.claimOne();
      case "cleanup":return deps.queue.cleanupPending();
      case "renew":{
        const data=schema.renew.parse(parsed);
        return deps.queue.renew(data.mediaId,data.attemptToken);
      }
      case "complete":{
        const data=schema.complete.parse(parsed);
        return deps.queue.complete(data.mediaId,data.attemptToken,data.manifest);
      }
      default:{
        const data=schema.fail.parse(parsed);
        return deps.queue.fail(data.mediaId,data.attemptToken,data.code);
      }
    }
  };
}
export const internalQuestionsMediaJobRoutes=new Hono();
internalQuestionsMediaJobRoutes.use("*",async(c,next)=>{
  c.header("Cache-Control","no-store");
  await next();
});
internalQuestionsMediaJobRoutes.all("*",async c=>{
  if(process.env.QUESTIONS_V2_MEDIA_ENABLED!=="true" ||
      process.env.QUESTIONS_V2_PROCESSOR_READY!=="true")
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
