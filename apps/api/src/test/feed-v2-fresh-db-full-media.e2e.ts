/** Explicit opt-in end-to-end ORIGINAL feed pipeline, completely fresh local PostgreSQL DB.
 * Safety: pg_dump --schema-only from verified WORK snapshot, create an OWN random DB,
 * then real presigned local MinIO upload -> publish -> cloud worker -> GET/WebP/MP4 Range.
 * No modifications of WORK DB or user data, no production/network provider access,
 * no remote CDN and no shared worker queue draining. Only own generated keys removed.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm, stat } from "node:fs/promises";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { S3Client, HeadBucketCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { createFeedStorage } from "@gafus/feed-storage";
import { isolatedNonprodS3Config } from "@gafus/cdn-upload/isolated-nonprod-s3";
import { createFeedService } from "../../../../packages/core/src/services/feed/service";
import { createFeedStorageJobs } from "../../../../packages/core/src/services/feed/jobs";
import type { FeedDb } from "../../../../packages/core/src/services/feed/ports";

const ROOT = "/Users/asmtv1/Desktop/gafus-refactor";
const SCRATCH = ROOT + "/.local-pg-scratch";
const socket = SCRATCH + "/production_snapshot_20261024/s";
const appEnv = SCRATCH + "/production_snapshot_20261024/app.env";
const workDb = "gafus_refactor_real_work_20261024";
const bucket = "gafus-refactor-feed-test";
const dbName = "gafus_feed_v2_ep_" + randomBytes(10).toString("hex");
const tag = "feedv2e2e_" + randomBytes(8).toString("hex");
function check(value: unknown, why: string): asserts value { if (!value) throw Error("FEED_V2_E2E_" + why); }
check(process.env.GAFUS_FEED_V2_EPHEMERAL_E2E === "1", "OPT_IN_REQUIRED");
// Only explicitly selected synthetic durations; never read customer media.
const videoSeconds = Number(process.env.GAFUS_FEED_V2_E2E_VIDEO_SECONDS ?? "1");
check([1,30,120].includes(videoSeconds), "VIDEO_DURATION_NOT_ALLOWED");
const photoShape = process.env.GAFUS_FEED_V2_E2E_PHOTO_SHAPE ?? "landscape";
check(["landscape","portrait"].includes(photoShape), "PHOTO_SHAPE_NOT_ALLOWED");
check(realpathSync(ROOT) === ROOT && realpathSync(process.cwd()) === ROOT + "/apps/api", "PROJECT_CWD");
check(realpathSync(SCRATCH) === SCRATCH && realpathSync(socket) === socket &&
  realpathSync(appEnv) === appEnv && (statSync(appEnv).mode & 0o777) === 0o600, "WORK_PATHS");
const envLine = readFileSync(appEnv,"utf8").split(/\r?\n/).find(line=>line.startsWith("DATABASE_URL="));
check(envLine,"WORK_ENV_URL");
const url = new URL(envLine.slice("DATABASE_URL=".length).trim().replace(/^['"]|['"]$/g,""));
check(url.protocol === "postgresql:" && url.hostname === "127.0.0.1" &&
  url.port === "55921" && url.pathname === "/"+workDb &&
  url.username === "gafus_refactor_local_real", "NO_SHARED_DB_MUTATION");
const credentialsEnv = {
  NODE_ENV: "development" as const, PATH:"/opt/homebrew/bin:/usr/bin:/bin",
  PGCONNECT_TIMEOUT: "5", PGOPTIONS: "-c default_transaction_read_only=on",
};
// Database creation/drop can target ONLY a previously nonexistent random database.
// All reads from the shared WORK snapshot remain enforced read-only separately.
const ownDatabaseAdminEnv = { ...credentialsEnv, PGOPTIONS: "" };
function psql(sql: string, name = workDb) {
  return execFileSync("/opt/homebrew/bin/psql",["-w","-X","-qAt","-h",socket,
    "-p","55921","-d",name,"-v","ON_ERROR_STOP=1","-c",sql],{
    encoding:"utf8",timeout:15000,env:credentialsEnv,
  }).trim();
}
check(psql("SELECT current_setting('data_directory')") ===
  SCRATCH + "/production_snapshot_20261024/data", "PHYSICAL_PG_IDENTITY");
check(psql(`SELECT count(*) FROM pg_database WHERE datname='${dbName}'`) === "0", "DATABASE_COLLISION");
const workBefore = psql(`SELECT (SELECT count(*) FROM "User") || ':' ||
  (SELECT count(*) FROM "FeedPost") || ':' || (SELECT count(*) FROM "FeedMediaAsset")`);
const workUrl = new URL(url.toString()); workUrl.pathname = "/"+dbName;
const sqlDir = await mkdtemp(join(SCRATCH,".feed-v2-owned-schema-"));
const dumpFile = join(sqlDir,"schema.sql");
let created = false;
let db: (FeedDb & {$disconnect(): Promise<void>;user: FeedDb['user']}) | undefined;
let s3: S3Client | undefined;
let ownedObjects: { delete(key:string, signal:AbortSignal):Promise<void> } | undefined;
const ownKeys = new Set<string>();
const objects = await import("../../../../apps/feed-cloud/src/objects");
try {
  execFileSync("/opt/homebrew/opt/postgresql@18/bin/pg_dump",[
    "-w","-h",socket,"-p","55921","-U","asmtv1","-d",workDb,
    "--schema-only","--no-owner","--no-privileges","-f",dumpFile],
    {cwd:ROOT,timeout:60000,env:credentialsEnv});
  check((await stat(dumpFile)).size > 100000,"SCHEMA_COPY");
  execFileSync("/opt/homebrew/opt/postgresql@18/bin/createdb",[
    "-w","-h",socket,"-p","55921","-O",url.username,dbName],
    {cwd:ROOT,timeout:10000,env:ownDatabaseAdminEnv});
  created = true;
  check(psql(`SELECT count(*) FROM pg_database WHERE datname='${dbName}'`) === "1", "OWNED_DATABASE_CREATED");
  execFileSync("/opt/homebrew/opt/postgresql@18/bin/psql", [
    "-X","-w","-h","127.0.0.1","-p","55921","-U",url.username,
    "-d",dbName,"-v","ON_ERROR_STOP=1","-f",dumpFile],
    { cwd:ROOT,timeout:120000, env:{...credentialsEnv,PGPASSWORD:url.password,PGOPTIONS:""},
      stdio:["ignore","pipe","pipe"] });
  check(psql(`SELECT (SELECT count(*) FROM "User") || ':' ||
    (SELECT count(*) FROM "FeedPost") || ':' ||
    (SELECT count(*) FROM "FeedMediaAsset")`,dbName) === "0:0:0", "FRESH_DB_EMPTY");
  process.env.DATABASE_URL=workUrl.toString();
  Object.assign(process.env, {
    NODE_ENV:"development",GAFUS_LOCAL_ISOLATED_API:"1",
    GAFUS_ISOLATED_NONPROD_S3:"enabled",
    GAFUS_ISOLATED_S3_ENDPOINT:"http://127.0.0.1:9000",
    GAFUS_ISOLATED_S3_FEED_BUCKET:bucket,
    GAFUS_ISOLATED_S3_GALLERY_BUCKET:"gafus-refactor-gallery-test",
  });
  const local = isolatedNonprodS3Config("feed");
  check(local && local.bucket === bucket && local.endpoint === "http://127.0.0.1:9000", "PRIVATE_MINIO_ONLY");
  s3 = new S3Client({endpoint:local.endpoint, region:"us-east-1",forcePathStyle:true,
    credentials:{accessKeyId:local.accessKeyId,secretAccessKey:local.secretAccessKey},maxAttempts:1,
    requestChecksumCalculation:"WHEN_REQUIRED",responseChecksumValidation:"WHEN_REQUIRED"});
  await s3.send(new HeadBucketCommand({Bucket:bucket}));
  const require = createRequire(new URL("../../../../packages/prisma/package.json",import.meta.url));
  const Client = require("@prisma/client").PrismaClient as new (opts:{datasources:{db:{url:string}}}) =>
    FeedDb & {$disconnect():Promise<void>};
  db = new Client({datasources:{db:{url:workUrl.toString()}}});
  const owner=randomUUID(), reader=randomUUID();
  await db.user.createMany({data:[owner,reader].map((id,i)=>({id,username:tag+i,
    password:"isolated-fixture-do-not-login",registrationPending:false}))});
  const storage=createFeedStorage({enabled:true,isolatedNonprod:true,...local,cdnBaseUrl:"",cdnSecret:""});
  const feed=createFeedService({db,storage,enabled:()=>true});
  // Core independently verifies real MinIO HEAD for every WebP/MP4 before READY.
  const jobs=createFeedStorageJobs({db,storage});
  const {createFeedCloudWorker}=await import("../../../../apps/feed-cloud/src/worker");
  const {sharpFeedEngine}=await import("../../../../apps/feed-cloud/src/sharp-engine");
  const core={
    claimJobs:(size:number,kind?:"photo"|"video")=>jobs.claim(size,kind),
    completeJob:(id:string,token:string,output?:Parameters<typeof jobs.complete>[2])=>jobs.complete(id,token,output),
    failJob:(id:string,token:string,code?:string)=>jobs.fail(id,token,code),
    renewJob:(id:string,token:string)=>jobs.renew(id,token),
    maintenance:async()=>{throw Error("NO_SHARED_MAINTENANCE");},
  };
  const uploader=objects.createFeedCloudObjects();
  ownedObjects=uploader;
  const metrics: {kind:string;sourceBytes:number|null;outputBytes:number;variantCount:number;
    downloadMs:number;processingMs:number;uploadMs:number;coreVerificationMs:number;totalMs:number;
    cpuUserMs:number;cpuSystemMs:number;rssAtCompletionBytes:number}[]=[];
  const worker=createFeedCloudWorker({core,objects:uploader,engine:sharpFeedEngine,
    onMetrics:value=>metrics.push(value)});
  const dir=await mkdtemp(join(SCRATCH,".feed-v2-e2e-ffmpeg-"));
  try {
    const mediaInput=[{kind:"photo" as const, ext:"png",mime:"image/png" as const,file:join(dir,"photo.png")},
      {kind:"video" as const,ext:"mp4",mime:"video/mp4" as const,file:join(dir,"video.mp4")}];
    execFileSync("ffmpeg",["-hide_banner","-nostdin","-loglevel","error","-y","-f","lavfi","-i",
      photoShape==="portrait" ? "color=c=green:s=1200x2400:d=1" : "color=c=green:s=640x360:d=1",
      "-frames:v","1",mediaInput[0]!.file],{cwd:dir,timeout:20000});
    execFileSync("ffmpeg",["-hide_banner","-nostdin","-loglevel","error","-y","-f","lavfi","-i",
      "testsrc=size=1280x720:rate=24","-f","lavfi","-i","sine=frequency=440:sample_rate=44100",
      "-t",String(videoSeconds),"-threads","2","-c:v","libx264","-pix_fmt","yuv420p","-c:a","aac",
      "-shortest",mediaInput[1]!.file],{cwd:dir,timeout:Math.max(60000,videoSeconds*2500)});
    const receipts:{kind:"photo"|"video",postId:string,mediaId:string}[]=[];
    let video720Ssim: number | null = null;
    for(const input of mediaInput){
      const source=await readFile(input.file);
      const draft=await feed.create(owner,{clientRequestId:randomUUID()});
      const ticket=await feed.reserveUpload(owner,draft.id,{
        clientRequestId:randomUUID(),filename:`upload.${input.ext}`,kind:input.kind,
        declaredMime:input.mime,declaredBytes:source.byteLength,
      });
      check(new URL(ticket.postUrl!).origin === "http://127.0.0.1:9000", "SIGNED_POST_LOOPBACK_ONLY");
      const uploadRow=await db.feedUpload.findUniqueOrThrow({where:{id:ticket.uploadId}});
      check(uploadRow.sourceKey.startsWith(`posts/${owner}/${draft.id}/incoming/`),"OWNER_UPLOAD_KEY");
      ownKeys.add(uploadRow.sourceKey);
      const form=new FormData();
      for(const [key,value] of Object.entries(ticket.postFields!)) form.append(key,value);
      form.append("file",new Blob([source],{type:input.mime}),`upload.${input.ext}`);
      const response=await fetch(ticket.postUrl!,{method:"POST",body:form,signal:AbortSignal.timeout(15000)});
      check(response.status===204,"SIGNED_SOURCE_UPLOAD");
      check((await storage.head(uploadRow.sourceKey))?.bytes===source.length,"SOURCE_IN_MINIO");
      const uploaded=await feed.completeUpload(owner,ticket.uploadId);
      check(uploaded.status==="uploaded","SOURCE_CONFIRMED");
      await feed.saveRevision(owner,draft.id,{clientRequestId:randomUUID(),expectedVersion:draft.version,
        text:`local synthetic ${input.kind}`,attachmentIds:[ticket.mediaId]});
      const published=await feed.publish(owner,draft.id,{clientRequestId:randomUUID()});
      check(published.status==="pending","PUBLICATION_PENDING");
      // Two racing containers may both receive the same wake-up; only one
      // transaction may own the PostgreSQL SKIP LOCKED + attempt-token lease.
      const competing=await Promise.all([jobs.claim(1,input.kind),jobs.claim(1,input.kind)]);
      const claim=competing.flat();
      check(claim.length===1 && claim[0]?.mediaId===ticket.mediaId && claim[0]?.ownerId===owner,"EXCLUSIVE_REAL_PG_LEASE");
      // Enumerate ALL expected output keys in advance so a failed upload is also cleaned.
      const base=`media/v2/${ticket.mediaId}/v1/`;
      for(const key of ["image/s.webp","image/m.webp","image/l.webp","poster.webp",
        "video/360.mp4","video/720.mp4","video/1080.mp4"]) ownKeys.add(base+key);
      check((await worker.process(claim[0]!)).accepted===true,"WORKER_READY_CALLBACK");
      const row=await db.feedMediaAsset.findUniqueOrThrow({where:{id:ticket.mediaId}});
      check(row.status==="ready","MEDIA_READY_SQL");
      // Source deletion is a durable DB job, not a best-effort worker finally.
      // Process its immediate claim and verify the real S3 original is gone.
      const cleanup=await jobs.claim(1,"photo");
      check(cleanup.length===1 && cleanup[0]?.kind==="cleanup_source" &&
        cleanup[0]?.sourceKeys.includes(uploadRow.sourceKey),"DURABLE_IMMEDIATE_ORIGINAL_CLEANUP");
      check((await worker.process(cleanup[0]!)).accepted===true,"ORIGINAL_CLEANUP_ACK");
      check((await storage.head(uploadRow.sourceKey))===null,"ORIGINAL_DELETED_AFTER_READY");
      const visible=await feed.get(reader,draft.id);
      check(visible.status==="published" && visible.attachments.length===1,"VISIBLE_TO_OTHER_USER");
      const asset=visible.attachments[0]!;
      if(input.kind==="photo"){
        check(Boolean(asset.smallUrl&&asset.thumbUrl&&asset.fullUrl),"THREE_SIGNED_WEBPS");
        check(!asset.mp4Urls,"NO_MP4_FOR_PHOTO");
        check(new URL(asset.thumbUrl!).origin === "http://127.0.0.1:9000", "SIGNED_WEBP_LOOPBACK_ONLY");
        const download=await fetch(asset.thumbUrl!,{signal:AbortSignal.timeout(15000),redirect:"error"});
        check(download.status===200,"SIGNED_WEBP_DOWNLOAD");
        const payload=Buffer.from(await download.arrayBuffer());
        check(payload.toString("latin1",0,4)==="RIFF" && payload.toString("latin1",8,12)==="WEBP","WEBP_MAGIC");
        if(photoShape==="portrait") {
          const variants=[{url:asset.smallUrl!,width:180,height:360},
            {url:asset.thumbUrl!,width:360,height:720},
            {url:asset.fullUrl!,width:720,height:1440}];
          for(const variant of variants) {
            const response=await fetch(variant.url,{signal:AbortSignal.timeout(15000),redirect:"error"});
            check(response.status===200,"PORTRAIT_WEBP_SIGNED_DOWNLOAD");
            const info=await sharpFeedEngine.inspect(Buffer.from(await response.arrayBuffer()),50_000_000);
            check(info.format==="webp" && info.width===variant.width && info.height===variant.height,
              "PORTRAIT_WEBP_LONG_EDGE_DIMENSIONS");
          }
        }
        // A signed delivery URL must not imply that the underlying S3 object is public.
        const unsigned=new URL(asset.thumbUrl!); unsigned.search="";
        check((await fetch(unsigned,{signal:AbortSignal.timeout(15000),redirect:"error"})).status===403,
          "PRIVATE_WEBP_UNSIGNED_DENIED");
      }else{
        check(Boolean(asset.mp4Urls?.[360]&&asset.mp4Urls?.[720]&&asset.posterUrl)&&row.mp4Keys.length===2,"TWO_PROGRESSIVE_MP4_URLS");
        check(new URL(asset.mp4Urls![360]).origin === "http://127.0.0.1:9000", "SIGNED_MP4_LOOPBACK_ONLY");
        const download=await fetch(asset.mp4Urls![360],{headers:{Range:"bytes=0-127"},signal:AbortSignal.timeout(15000),redirect:"error"});
        check(download.status===206 && download.headers.get("content-range")?.startsWith("bytes 0-127/"),"SIGNED_MP4_RANGE");
        const payload=Buffer.from(await download.arrayBuffer());
        check(payload.length===128 && payload.toString("latin1",4,8)==="ftyp","VALID_MP4_BYTES");
        const invalidRange=await fetch(asset.mp4Urls![360],{
          headers:{Range:"bytes=999999999999-"},signal:AbortSignal.timeout(15000),redirect:"error"});
        check(invalidRange.status===416,"MP4_INVALID_RANGE_416");
        // Decode the signed 720p output and compare it to the unmodified source.
        // Synthetic SSIM is a regression gate, not a real-user visual-quality benchmark.
        const fullVideo=await fetch(asset.mp4Urls![720]!, {signal:AbortSignal.timeout(30000),redirect:"error"});
        check(fullVideo.status===200,"SIGNED_720_MP4_DOWNLOAD");
        const signed720=join(dir,"signed-roundtrip-720.mp4");
        await writeFile(signed720,Buffer.from(await fullVideo.arrayBuffer()));
        const compare=spawnSync("ffmpeg",["-hide_banner","-nostdin","-i",input.file,
          "-i",signed720,"-filter_complex","[0:v:0][1:v:0]ssim",
          "-an","-f","null","-"],{cwd:dir,encoding:"utf8",timeout:120000,maxBuffer:1024*1024});
        check(compare.status===0,"SSIM_FFMPEG_VALIDATION_FAILED");
        const score=/\bAll:([0-9.]+)/.exec(compare.stderr)?.[1];
        video720Ssim=score?Number(score):null;
        check(video720Ssim!==null && video720Ssim>=0.95,`VIDEO_720_SYNTHETIC_SSIM_${video720Ssim}`);
        const unsigned=new URL(asset.mp4Urls![360]); unsigned.search="";
        check((await fetch(unsigned,{signal:AbortSignal.timeout(15000),redirect:"error"})).status===403,
          "PRIVATE_MP4_UNSIGNED_DENIED");
        try { await s3!.send(new HeadObjectCommand({Bucket:bucket,Key:base+"video/1080.mp4"}));
          check(false,"UNEXPECTED_1080_VARIANT");
        } catch(error) {
          check((error as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode===404,
            "1080_VARIANT_NOT_CREATED");
        }
      }
      receipts.push({kind:input.kind,postId:draft.id,mediaId:ticket.mediaId});
    }
    const list=await feed.list(reader,{sort:"new",pageSize:10});
    check(receipts.every(receipt=>list.items.some(row=>row.id===receipt.postId)),"FEED_LIST_PUBLISHED");
    const dbCount=psql(`SELECT (SELECT count(*) FROM "FeedPost") || ':' ||
      (SELECT count(*) FROM "FeedMediaAsset")`,dbName);
    check(dbCount==="2:2","EXACT_TWO_SYNTHETIC_ROWS");
    console.log("FEED_V2_FRESH_DB_FULL_E2E_PASS",JSON.stringify({
      isolated:true,newDatabaseOnly:true,posts:receipts.length,
      photoWebps:3,photoShape,portraitWebpDimensionsVerified:photoShape==="portrait",
      videoMp4:2,videoSeconds,video720Ssim,realS3SignedGet:true,range206:true,
      noHls:true,privateUnsignedDenied:true,range416:true,no1080Variant:true,sharedWorkUnchanged:true,
      exclusiveParallelPostgresClaims:true,
      originalDeletedAfterReady:true,
      syntheticMetrics:metrics.map(({kind,sourceBytes,outputBytes,variantCount,
        downloadMs,processingMs,uploadMs,coreVerificationMs,totalMs,cpuUserMs,cpuSystemMs,
        rssAtCompletionBytes})=>({kind,sourceBytes,outputBytes,variantCount,
        downloadMs,processingMs,uploadMs,coreVerificationMs,totalMs,cpuUserMs,
        cpuSystemMs,rssAtCompletionBytes})) ,
    }));
  }finally { await rm(dir,{recursive:true,force:false}); }
}finally{
  // Always remove and independently verify ONLY our own exact generated object keys.
  const cleanupFailures:string[]=[];
  if(ownedObjects && s3) for(const key of ownKeys){
    if(!key.startsWith("media/v2/")&&!key.startsWith("posts/"))continue;
    try{
      await ownedObjects.delete(key,new AbortController().signal);
      try{await s3.send(new HeadObjectCommand({Bucket:bucket,Key:key}));
        cleanupFailures.push("OBJECT_SURVIVED_DELETE");
      }catch(error){
        const status=(error as {$metadata?:{httpStatusCode?:number}})?.$metadata?.httpStatusCode;
        if(status!==404)cleanupFailures.push("OBJECT_HEAD_NOT_404");
      }
    }catch{cleanupFailures.push("OBJECT_DELETE_FAILED");}
  }
  if(db) await db.$disconnect();
  if(s3) s3.destroy();
  if(created && /^gafus_feed_v2_ep_[a-f0-9]{20}$/.test(dbName) &&
     psql(`SELECT count(*) FROM pg_database WHERE datname='${dbName}'`) === "1"){
    execFileSync("/opt/homebrew/opt/postgresql@18/bin/dropdb",["-w","-h",socket,
      "-p","55921",dbName],{cwd:ROOT,timeout:30000,env:ownDatabaseAdminEnv});
  }
  await rm(sqlDir,{recursive:true,force:false});
  check(psql(`SELECT count(*) FROM pg_database WHERE datname='${dbName}'`) === "0","OWN_DB_DROPPED");
  check(workBefore === psql(`SELECT (SELECT count(*) FROM "User") || ':' ||
    (SELECT count(*) FROM "FeedPost") || ':' || (SELECT count(*) FROM "FeedMediaAsset")`),
    "WORK_SNAPSHOT_UNTOUCHED");
  check(cleanupFailures.length === 0, "ALL_OWN_S3_OBJECTS_DELETED");
}
