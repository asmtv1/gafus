/**
 * Manual real Cloud.ru S3 Chat2 media integration acceptance. Test data only:
 * uses own UUID prefix; no existing keys touched; cleans all objects in finally.
 * Explicit opt-in and forced Cloud.ru en0 networking on authorized user's Mac.
 * Not the production container entrypoint. Run with tsx from repository root.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, realpathSync, lstatSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { Agent, request } from "node:https";
import { join } from "node:path";
import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import sharp from "sharp";
import { chat2V2FinalKeys,chat2V2SourceKey,type Chat2V2Job } from "@gafus/feed-cloud";
import { processChat2V2Asset } from "./chat2-v2-processor.js";
import { createChat2S3Objects } from "./chat2-s3-objects.js";
import { sharpFeedEngine } from "./sharp-engine.js";
import { chat2V2DeleteObjects } from "../../../packages/cdn-upload/src/chat2V2PublicMedia.js";
const root="/Users/asmtv1/Desktop/gafus-refactor";
if(process.env.CHAT2_S3_REAL_ACCEPTANCE!=="new-test-objects-only" ||
    realpathSync(process.cwd())!==root ||
    execFileSync("git",["-C",root,"rev-parse","--show-toplevel"],{encoding:"utf8"}).trim()!==root ||
    execFileSync("git",["-C",root,"branch","--show-current"],{encoding:"utf8"}).trim()!=="vite")
  throw Error("CHAT2_REAL_ACCEPTANCE_SCOPE");
const credsFile=root+"/.local-pg-scratch/cloudru/refactor-api-credentials.json";
if(lstatSync(credsFile).isSymbolicLink())throw Error("CHAT2_REAL_ACCEPTANCE_LINK");
const c=JSON.parse(readFileSync(credsFile,"utf8"));
if(c.project_id!=="4c590727-4133-475b-a4bc-564c90a9e686" || c.service_account!=="gafus-refactor-api")
  throw Error("CHAT2_REAL_ACCEPTANCE_WRONG_PROJECT");
const ip=execFileSync("ipconfig",["getifaddr","en0"],{encoding:"utf8"}).trim();
if(!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip))throw Error("CHAT2_REAL_ACCEPTANCE_NO_EN0");
const s3=new S3Client({endpoint:"https://s3.cloud.ru",region:"ru-central-1",forcePathStyle:true,
 requestChecksumCalculation:"WHEN_REQUIRED",responseChecksumValidation:"WHEN_REQUIRED",
 credentials:{accessKeyId:c.tenant_id+":"+c.key_id,secretAccessKey:c.key_secret},maxAttempts:2,
 requestHandler:new NodeHttpHandler({httpsAgent:new Agent({localAddress:ip,family:4,keepAlive:false}),requestTimeout:20000,connectionTimeout:5000})});
const bucket="gafus-chat-public",paths:string[]=[],workDirs:string[]=[];
const getPublic=(key:string)=>new Promise<{status:number,bytes:number}>((resolve,reject)=>{
 const req=request({hostname:"gafus-chat-public.s3.cloud.ru",path:"/"+key,method:"GET",localAddress:ip,family:4,timeout:8000},res=>{
  let n=0;res.on("data",d=>n+=d.length);res.on("end",()=>resolve({status:res.statusCode??0,bytes:n}));
 });req.on("error",reject);req.on("timeout",()=>req.destroy(Error("GET_TIMEOUT")));req.end();
});
const tests:{kind:string,output:string,publicOK:boolean}[]=[];
try{
 const base=root+"/.local-pg-scratch";
 if(lstatSync(base).isSymbolicLink())throw Error("LINK_TO_SCRATCH");
 for(const kind of ["image","video"] as const){
  const dir=await mkdtemp(join(base,".chat2-real-"));workDirs.push(dir);
  const conversationId="test_chat2_job",ownerId="synthetic_test",mediaId=randomUUID();
  const mime=kind==="image"?"image/jpeg":"video/mp4";
  const source=join(dir,kind+"-upload."+(kind==="image"?"jpg":"mp4"));
  if(kind==="image"){
   const jpeg=await sharp({create:{width:800,height:1280,channels:3,background:"#738b6c"}}).jpeg({quality:80}).toBuffer();
   await writeFile(source,jpeg);
  }else{
   execFileSync("ffmpeg",["-hide_banner","-loglevel","error","-f","lavfi","-i","testsrc2=size=1280x720:rate=15","-t","2",
    "-c:v","libx264","-preset","ultrafast","-pix_fmt","yuv420p","-movflags","+faststart","-y",source],
    {timeout:25000,maxBuffer:128*1024});
  }
  const sourceBytes=(await readFile(source)).byteLength;
  const sourceKey=chat2V2SourceKey(conversationId,ownerId,mediaId,mime);
  const job={conversationId,ownerId,mediaId,sourceMime:mime,sourceBytes,sourceKey} as Chat2V2Job;
  const keys=chat2V2FinalKeys(conversationId,ownerId,mediaId);
  paths.push(sourceKey,...Object.values(keys.image),keys.video.poster,...Object.values(keys.video.variants));
  await s3.send(new PutObjectCommand({Bucket:bucket,Key:sourceKey,ContentType:mime,
    ContentLength:sourceBytes,Body:await readFile(source),IfNoneMatch:"*"}));
  const sourcePublic=await getPublic(sourceKey);
  if(sourcePublic.status!==403)throw Error("CHAT2_SOURCE_MUST_BE_PRIVATE");
  const result=await processChat2V2Asset(job,dir,{
    objects:createChat2S3Objects(job,s3),engine:sharpFeedEngine,
  },new AbortController().signal);
  if(result.kind!==kind)throw Error("CHAT2_KIND_MISMATCH");
  if(result.kind==="image" && (
    result.imageSizes.small.width!==360 || result.imageSizes.medium.width!==720 ||
    result.imageSizes.small.height!==576 || result.imageSizes.medium.height!==1152))
    throw Error("CHAT2_IMAGE_WIDTH_NOT_EXACT");
  const expected=kind==="image"?[keys.image.small,keys.image.medium]:[
    keys.video.poster,keys.video.variants[360],keys.video.variants[720]];
  for(const key of expected){
    const object=await s3.send(new HeadObjectCommand({Bucket:bucket,Key:key}));
    if(!object.ContentLength||object.ContentLength<12)throw Error("CHAT2_EMPTY_OUTPUT");
    const pub=await getPublic(key);
    if(pub.status!==200||pub.bytes!==object.ContentLength)throw Error("CHAT2_PUBLIC_VARIANT_FAIL");
  }
  // Simulate Core's READY-after-HEAD source cleanup using the exact
  // production deletion primitive (not direct test-only DeleteObject).
  await chat2V2DeleteObjects([sourceKey],s3);
  let sourceMissing=false;
  try {await s3.send(new HeadObjectCommand({Bucket:bucket,Key:sourceKey}));}
  catch(e){sourceMissing=(e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode===404;}
  if(!sourceMissing)throw Error("CHAT2_ORIGINAL_NOT_DELETED_AFTER_READY");
  for(const key of expected){const pub=await getPublic(key);if(pub.status!==200)throw Error("CHAT2_VARIANT_DELETED_WITH_SOURCE");}
  if(kind==="video"){
    // Simulate terminal FAILED cleanup of any remaining partial rendition set.
    await chat2V2DeleteObjects([...Object.values(keys.image),keys.video.poster,...Object.values(keys.video.variants)],s3);
    for(const key of expected){
      let absent=false;
      try{await s3.send(new HeadObjectCommand({Bucket:bucket,Key:key}));}
      catch(e){absent=(e as { $metadata?:{httpStatusCode?:number} }).$metadata?.httpStatusCode===404;}
      if(!absent)throw Error("CHAT2_TERMINAL_OUTPUT_CLEANUP_FAILED");
    }
  }
  tests.push({kind,output:expected.map(x=>x.split("/").pop()).join(","),publicOK:true});
 }
}finally{
 for(const key of paths){
  try{await s3.send(new DeleteObjectCommand({Bucket:bucket,Key:key}));}
  catch(e){console.error("CHAT2_ACCEPTANCE_CLEANUP_ERROR",e instanceof Error?e.name:"UNKNOWN");process.exitCode=6;}
 }
 for(const dir of workDirs)await rm(dir,{recursive:true,force:true});
 s3.destroy();
 console.log(JSON.stringify({tests,objectsCleanupAttempted:paths.length,localDirsCleanupAttempted:workDirs.length}));
}
