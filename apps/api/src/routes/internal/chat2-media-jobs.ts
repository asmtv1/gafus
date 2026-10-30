/** Strictly internal HMAC-signed Cloud.ru Chat2 Job queue API; disabled by default. */
import {createHash,createHmac,timingSafeEqual} from "node:crypto";
import {Hono} from "hono";
import {z} from "zod/v3";
import {connection as redis} from "@gafus/queues";
import {createLiveChat2V2Queue,type Chat2QueueCore} from "../../modules/chat2/media-v2-jobs.js";
const prefix="/internal/chat2/media/jobs/";
const acceptedPaths=new Set(["claim","renew","complete","fail","cleanup"]);
const identifier=z.string().uuid();
const attempt=z.object({mediaId:identifier,attemptToken:identifier}).strict();
const dimensions=z.object({width:z.number().int().positive(),height:z.number().int().positive()}).strict();
const image=z.object({kind:z.literal("image"),width:z.number().int().positive(),height:z.number().int().positive(),
  keys:z.object({small:z.string().min(8).max(500),medium:z.string().min(8).max(500)}).strict(),
  imageSizes:z.object({small:dimensions,medium:dimensions}).strict()}).strict();
const video=z.object({kind:z.literal("video"),width:z.number().int().positive(),height:z.number().int().positive(),
  durationSeconds:z.number().positive().max(120),posterKey:z.string().min(8).max(500),
  renditions:z.array(z.object({quality:z.union([z.literal(360),z.literal(720)]),key:z.string().min(8).max(500),
    width:z.number().int().positive(),height:z.number().int().positive(),bytes:z.number().int().min(24)}).strict()).min(1).max(2)}).strict();
const schemas={
  claim:z.object({batchSize:z.literal(1),kind:z.enum(["image","video"])}).strict(),
  cleanup:z.object({batchSize:z.literal(1)}).strict(),
  renew:attempt,
  complete:attempt.extend({manifest:z.discriminatedUnion("kind",[image,video])}).strict(),
  fail:attempt.extend({code:z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/)}).strict(),
};
export interface Chat2InternalDependencies {
  secret:Uint8Array;
  consumeNonce:(nonce:string,expiresAt:number)=>Promise<boolean>;
  queue:Chat2QueueCore;
  now?:()=>number;
}
function error(code:string,status:number){return Object.assign(Error(code),{status});}
/** Tests inject a fake queue and replay guard; production injects Redis + Prisma. */
export function createChat2InternalDispatcher(deps:Chat2InternalDependencies){
  const now=deps.now??Date.now;
  return async function dispatch(request:Request,pathname:string):Promise<unknown>{
    const url=new URL(request.url);
    const operation=pathname.startsWith(prefix)?pathname.slice(prefix.length):"";
    if(url.pathname!==pathname || url.search || !acceptedPaths.has(operation))throw error("NOT_FOUND",404);
    if(request.method!=="POST")throw error("METHOD_NOT_ALLOWED",405);
    if(request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase()!=="application/json")
      throw error("CONTENT_TYPE_REQUIRED",415);
    if(!deps.secret || deps.secret.byteLength<32)throw error("CHAT2_INTERNAL_DISABLED",503);
    const length=request.headers.get("content-length");
    if(length && (!/^\d+$/.test(length)||Number(length)>16_384))throw error("BODY_TOO_LARGE",413);
    let bytes=0;const chunks:Uint8Array[]=[];
    const reader=request.body?.getReader();
    try{
      if(reader)for(;;){const chunk=await reader.read();if(chunk.done)break;
        bytes+=chunk.value.byteLength;
        if(bytes>16_384){await reader.cancel();throw error("BODY_TOO_LARGE",413);}
        chunks.push(chunk.value);}
    }finally{reader?.releaseLock();}
    const body=Buffer.concat(chunks);
    const stamp=request.headers.get("x-chat2-timestamp")??"";
    const nonce=request.headers.get("x-chat2-nonce")??"";
    const signature=request.headers.get("x-chat2-signature")??"";
    const seconds=Number(stamp);
    if(!/^\d{10,12}$/.test(stamp)||!Number.isSafeInteger(seconds)||Math.abs(now()-seconds*1000)>120_000||
       !/^[0-9a-f-]{36}$/i.test(nonce)||!/^[0-9a-f]{64}$/i.test(signature))
      throw error("INVALID_SIGNATURE",401);
    const sha=createHash("sha256").update(body).digest("hex");
    const value=`POST\n${pathname}\n${stamp}\n${nonce}\n${sha}`;
    const expected=createHmac("sha256",deps.secret).update(value).digest();
    if(!timingSafeEqual(Buffer.from(signature,"hex"),expected))throw error("INVALID_SIGNATURE",401);
    let once=false;
    try{once=await deps.consumeNonce(nonce,now()+130_000);}catch{throw error("NONCE_STORAGE_UNAVAILABLE",503);}
    if(!once)throw error("REPLAY_DENIED",401);
    let parsed:unknown;
    try{parsed=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(body));}
    catch{throw error("INVALID_JSON",400);}
    const validated=schemas[operation as keyof typeof schemas].safeParse(parsed);
    if(!validated.success)throw error("INVALID_JOB_COMMAND",400);
    if(operation==="claim"){const args=schemas.claim.parse(parsed);return deps.queue.claimOne(args.kind);}
    if(operation==="cleanup")return deps.queue.cleanupPending();
    if(operation==="renew"){
      const args=schemas.renew.parse(parsed);return deps.queue.renew(args.mediaId,args.attemptToken);
    }
    if(operation==="complete"){
      const args=schemas.complete.parse(parsed);return deps.queue.complete(args.mediaId,args.attemptToken,args.manifest);
    }
    const args=schemas.fail.parse(parsed);return deps.queue.fail(args.mediaId,args.attemptToken,args.code);
  };
}
export const internalChat2MediaJobRoutes=new Hono();
internalChat2MediaJobRoutes.use("*",async(c,next)=>{c.header("Cache-Control","no-store");await next();});
internalChat2MediaJobRoutes.all("*",async c=>{
  if(process.env.CHAT2_V2_CORE_ENABLED!=="true")return c.json({error:"CHAT2_V2_NOT_ENABLED"},503);
  const secret=Buffer.from(process.env.CHAT2_INTERNAL_HMAC_SECRET??"","utf8");
  if(secret.byteLength<32)return c.json({error:"CHAT2_V2_NOT_CONFIGURED"},503);
  const nonceStore=async(id:string,expires:number)=>{
    if(redis.status!=="ready")throw Error("REDIS_UNAVAILABLE");
    const answer=await redis.set("gafus-chat2-media-v2-nonce:"+id,"1","PXAT",expires,"NX");
    return answer==="OK";
  };
  try{
    const result=await createChat2InternalDispatcher({secret,consumeNonce:nonceStore,
      queue:createLiveChat2V2Queue()})(c.req.raw,new URL(c.req.url).pathname);
    return c.json(result,200);
  }catch(e){
    const status=(e as {status?:number}).status??503;
    return c.json({error:status>=500?"CHAT2_JOB_UNAVAILABLE":status===401?"UNAUTHORIZED":"INVALID_REQUEST"},
      status as 400);
  }
});
