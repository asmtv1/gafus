/** Original signed Hono -> WORK PG -> local MinIO -> existing Sharp feed-cloud worker -> original Hono READY. */
import { randomBytes, randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import bcrypt from "bcryptjs";
import { DeleteObjectCommand, HeadObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { prisma } from "@gafus/prisma";
import { createFeedStorageJobs } from "@gafus/core/services/feed";
import { createFeedStorageFromEnv } from "@gafus/feed-storage";
import { isolatedNonprodS3Config } from "@gafus/cdn-upload/isolated-nonprod-s3";
const ROOT="/Users/asmtv1/Desktop/gafus-refactor";
const SCRATCH=`${ROOT}/.local-pg-scratch/web4-nonprod-s3`;
const BUCKET="gafus-refactor-web4-feed-test", API="http://127.0.0.1:3501/api/v1";
const PREFIX=`web4_browser120_${randomBytes(8).toString("hex")}`;
let video=Buffer.alloc(0);
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
function ensure(v:unknown,name:string):asserts v{if(!v)throw Error("ASSERT_"+name);}
function pass(v:string){console.warn(`WEB4_FEED_VIDEO120_REAL_${v}=PASS`);}
interface Actor { id:string; username:string; token:string; password:string }
let owner:Actor|undefined,foreign:Actor|undefined;
let postId="",uploadId="",mediaId="",phase="preflight",s3:S3Client|undefined;
const ownKeys=new Set<string>();
async function api(path:string,method:string,token:string,payload?:unknown){
 const r=await fetch(API+path,{method,headers:{Authorization:`Bearer ${token}`,...(payload===undefined?{}:{"Content-Type":"application/json"})},
 ...(payload===undefined?{}:{body:JSON.stringify(payload)}),signal:AbortSignal.timeout(20000)});
 return {status:r.status,data:obj(await r.json())};
}
async function actor(label:string):Promise<Actor>{
 const username=PREFIX+"_"+label,password=randomBytes(24).toString("base64url");
 const u=await prisma.user.create({data:{username,password:await bcrypt.hash(password,10),passwordSetAt:new Date(),role:"USER",registrationPending:false}});
 const r=await fetch(API+"/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password}),signal:AbortSignal.timeout(12000)});
 const response=obj(await r.json());const token=obj(response.data).accessToken;
 ensure(r.status===200&&typeof token==="string"&&token.length>30,"ACTUAL_SIGNED_LOGIN");
 return {id:u.id,username,token,password};
}
async function postForm(url:string,fields:Record<string,string>){
 const form=new FormData();for(const [k,v] of Object.entries(fields))form.append(k,v);
 form.append("file",new File([video],"synthetic.mp4",{type:"video/mp4"}));
 const result=await fetch(url,{method:"POST",body:form,signal:AbortSignal.timeout(15000)});
 ensure(result.status===204,"LOCAL_MINIO_SIGNED_POST204");
}
async function main(){
 ensure(process.env.WEB4_VIDEO120_BROWSER_HTTP==="1","EXPLICIT_ACCEPTANCE_ONLY");
 const cwd=realpathSync(process.cwd());ensure(realpathSync(ROOT)===ROOT&&(cwd===ROOT||cwd.startsWith(ROOT+"/")),"PHYSICAL_ROOT_ONLY");
 const db=new URL(process.env.DATABASE_URL??"");
 ensure(db.hostname==="127.0.0.1"&&db.port==="55921"&&db.pathname==="/gafus_refactor_real_work_20261024"&&db.username==="gafus_refactor_local_real","RESTRICTED_WORK_DB_ONLY");
 Object.assign(process.env,{NODE_ENV:"development",GAFUS_LOCAL_ISOLATED_API:"1", GAFUS_WEB4_ISOLATED_MEDIA:"1", API_PORT:"3501", GAFUS_ISOLATED_NONPROD_S3:"enabled",GAFUS_ISOLATED_S3_ENDPOINT:"http://127.0.0.1:9500",
 GAFUS_ISOLATED_S3_DOCUMENTS_BUCKET:"gafus-refactor-web4-documents-test",GAFUS_ISOLATED_S3_GALLERY_BUCKET:"gafus-refactor-web4-gallery-test",
 GAFUS_ISOLATED_S3_FEED_BUCKET:BUCKET,FEED_ENABLED:"true",FEED_PROCESSOR_READY:"true",
 CLOUDRU_MEDIA_JOBS_ENABLED:"false",GALLERY_MEDIA_FALLBACK_ENABLED:"false",FEED_MEDIA_FALLBACK_ENABLED:"false",
 TMPDIR:SCRATCH+"/"});
 ensure(realpathSync(tmpdir())===SCRATCH&&realpathSync(SCRATCH)===SCRATCH,"PROJECT_SCOPED_WORKER_TMPDIR");
 const fixturePath=SCRATCH+"/web4-browser-120-test.mp4";
 ensure(realpathSync(fixturePath)===fixturePath,"LOCAL_SYNTHETIC_VIDEO_PATH");
 video=await readFile(fixturePath);
 ensure(video.length>0&&video.length<200*1024*1024,"BOUNDED_SYNTHETIC_MP4_SOURCE");
 // Actual 120-second source must be verified by FFprobe, not filename alone.
 const durationText=await (await import("node:child_process")).execFileSync(
   "/opt/homebrew/bin/ffprobe",[
     "-v","error","-show_entries","format=duration", "-of","default=noprint_wrappers=1:nokey=1",fixturePath,
   ],{encoding:"utf8",timeout:10000}).trim();
 const sourceDuration=Number(durationText);
 ensure(Number.isFinite(sourceDuration)&&sourceDuration>=119.5&&sourceDuration<=120.001,
   "ACTUAL_GENERATED_120_SECOND_MP4_DURATION");
 const config=isolatedNonprodS3Config("feed");
 ensure(config?.endpoint==="http://127.0.0.1:9500"&&config.bucket===BUCKET,"PRIVATE_ISOLATED_S3_ONLY");
 s3=new S3Client({endpoint:config.endpoint,region:"us-east-1",forcePathStyle:true,credentials:{accessKeyId:config.accessKeyId,secretAccessKey:config.secretAccessKey},maxAttempts:1,requestChecksumCalculation:"WHEN_REQUIRED",responseChecksumValidation:"WHEN_REQUIRED"});
 ensure((await fetch("http://127.0.0.1:3501/health",{signal:AbortSignal.timeout(3500)})).status===200,"ORIGINAL_HONO_HEALTH");
 owner=await actor("owner");foreign=await actor("foreign");
 pass("GENUINE_TWO_JWT_ACTORS_WORK_SQL_LOCAL_MINIO");
 phase="source-upload";
 const created=await api("/feed/posts","POST",owner.token,{clientRequestId:randomUUID()});
 ensure(created.status===200&&created.data.success===true,"ORIGINAL_HONO_DRAFT_CREATED");
 postId=obj(created.data.data).id as string;ensure(typeof postId==="string","POST_ID");
 const reserved=await api(`/feed/posts/${postId}/uploads`,"POST",owner.token,{filename:"synthetic.mp4",kind:"video",declaredMime:"video/mp4",declaredBytes:video.length,clientRequestId:randomUUID()});
 ensure(reserved.status===200&&reserved.data.success===true,"ORIGINAL_HONO_UPLOAD_RESERVED");
 const upload=obj(reserved.data.data);uploadId=upload.uploadId as string;mediaId=upload.mediaId as string;
 ensure(typeof uploadId==="string"&&typeof mediaId==="string","UPLOAD_MEDIA_IDS");
 const sql=await prisma.feedUpload.findUnique({where:{id:uploadId}});
 ensure(sql?.ownerId===owner.id&&sql.status==="reserved"&&sql.declaredBytes===video.length,"SOURCE_RESERVED_SQL");
 ownKeys.add(sql.sourceKey);
 ensure(typeof upload.postUrl==="string"&&new URL(upload.postUrl).origin==="http://127.0.0.1:9500","PRIVATE_SIGNED_POST_URL");
 await postForm(upload.postUrl,upload.postFields as Record<string,string>);
 const head=await s3.send(new HeadObjectCommand({Bucket:BUCKET,Key:sql.sourceKey}));
 ensure(head.ContentLength===video.length,"ACTUAL_MINIO_SOURCE_HEAD");
 const confirm=await api(`/feed/uploads/${uploadId}/complete`,"POST",owner.token,{});
 ensure(confirm.status===200&&obj(confirm.data.data).status==="uploaded","ORIGINAL_HONO_UPLOADED");
 const revision=await api(`/feed/posts/${postId}/revisions`,"PUT",owner.token,{clientRequestId:randomUUID(),expectedVersion:0,text:"AG1 real feed private HLS video",attachmentIds:[mediaId]});
 ensure(revision.status===200,"ORIGINAL_HONO_REVISION");
 const publish=await api(`/feed/posts/${postId}/publish`,"POST",owner.token,{clientRequestId:randomUUID()});
 ensure(publish.status===200,"ORIGINAL_HONO_PUBLISH_PENDING");
 ensure((await prisma.feedPost.findUnique({where:{id:postId}}))?.status==="pending","UNPROCESSED_NOT_PUBLISHED");
 ensure((await api(`/feed/posts/${postId}`,"GET",foreign.token)).status===404,"UNPROCESSED_FOREIGN404");
 pass("ORIGINAL_HONO_SOURCE_S3_POST_SQL_UPLOADED_REVISION_PENDING_PRIVATE");
 phase="existing-worker";
 const now=new Date();
 const due=await prisma.feedStorageJob.findMany({where:{OR:[{status:"pending",availableAt:{lte:now}},{status:"processing",leaseUntil:{lt:now}}]},select:{id:true,ownerId:true,kind:true,uploadId:true}});
 const videoDue=due.filter(job=>job.kind==="publish_video");
 // Core claim(...,"video") EXCLUDES photo and cleanup jobs. Never touch them.
 ensure(videoDue.length===1&&videoDue[0]?.ownerId===owner.id&&videoDue[0]?.uploadId===uploadId,
   "NO_FOREIGN_VIDEO_JOB_BEFORE_CLAIM");
 const jobs=createFeedStorageJobs({db:prisma});
 const claimed=await jobs.claim(1,"video");
 ensure(claimed.length===1&&claimed[0]?.ownerId===owner.id&&claimed[0]?.uploadId===uploadId&&claimed[0]?.kind==="publish_video","CLAIM_ONLY_OWN_VIDEO_JOB");
 const core={
  claimJobs:(n:number,t?:"photo"|"video")=>jobs.claim(n,t),
  completeJob:(id:string,token:string,output?:Parameters<typeof jobs.complete>[2])=>jobs.complete(id,token,output),
  failJob:(id:string,token:string,code?:string)=>jobs.fail(id,token,code),
  renewJob:(id:string,token:string)=>jobs.renew(id,token),
  maintenance:async(_n:number):Promise<unknown>=>{throw Error("UNRELATED_WORKER_MAINTENANCE_NOT_AUTHORIZED");},
 };
 // Import *existing* Cloud worker at execution only. No real queue/dispatch/HTTP
 // transport: Core's original durable job + physical S3 port are used directly.
 const cloud=await import("../../../feed-cloud/src/"+"worker.ts");
 const objectModule=await import("../../../feed-cloud/src/"+"objects.ts");
 const engine=await import("../../../feed-cloud/src/"+"sharp-engine.ts");
 const worker=cloud.createFeedCloudWorker({core,objects:objectModule.createFeedCloudObjects(),engine:engine.sharpFeedEngine});
 await worker.process(claimed[0]!);
 const media=await prisma.feedMediaAsset.findUnique({where:{id:mediaId}});
 const uploaded=await prisma.feedUpload.findUnique({where:{id:uploadId}});
 const post=await prisma.feedPost.findUnique({where:{id:postId}});
 const completed=await prisma.feedStorageJob.findUnique({where:{id:claimed[0]!.id}});
 console.warn("WEB4_FEED_VIDEO120_SQL_STATES="+JSON.stringify({media:media?.status,upload:uploaded?.status,post:post?.status,job:completed?.status}));
 ensure(media?.status==="ready"&&uploaded?.status==="ready"&&post?.status==="published"&&post.activeRevisionId&&completed?.status==="completed","REAL_FEED_WORKER_SQL_PUBLISHED_READY");
 ensure(media?.durationSeconds!==null&&media?.durationSeconds!==undefined&&
   media.durationSeconds>=119.5&&media.durationSeconds<=120.001,
   "DURABLE_SQL_MEDIA_IS_ACTUALLY_120_SECONDS");
 ensure(media.posterKey&&media.playlistKey&&media.videoSegmentKeys.length>0&&media.videoSegmentKeys.length<=90,
  "DURABLE_HLS_POSTER_PLAYLIST_SEGMENTS");
 const hlsPrefix=`posts/${owner.id}/${postId}/attachments/${mediaId}/`;
 const mediaKeys=[media.posterKey,media.playlistKey,...media.videoSegmentKeys];
 for(const key of mediaKeys){
  ensure(key.startsWith(hlsPrefix),"OWNER_BOUND_PRIVATE_HLS_KEY");
  ownKeys.add(key);
  const meta=await s3.send(new HeadObjectCommand({Bucket:BUCKET,Key:key}));
  ensure(Number(meta.ContentLength)>0,"PHYSICAL_HLS_OBJECT_HEAD");
  const resource=await s3.send(new GetObjectCommand({Bucket:BUCKET,Key:key}));
  const bytes=Buffer.from(await resource.Body!.transformToByteArray());
  if(key===media.posterKey)ensure(meta.ContentType==="image/webp"&&bytes.subarray(0,4).toString("ascii")==="RIFF","POSTER_ACTUAL_WEBP");
  else if(key===media.playlistKey){
    const playlist=bytes.toString("utf8");
    ensure(meta.ContentType==="application/vnd.apple.mpegurl"&&playlist.startsWith("#EXTM3U")&&playlist.includes("#EXT-X-ENDLIST"),"REAL_PRIVATE_HLS_PLAYLIST");
    for(const segment of media.videoSegmentKeys)ensure(playlist.includes(segment.split("/").at(-1)!),"PLAYLIST_SEGMENTS_MATCH_SQL");
  } else ensure(meta.ContentType==="video/mp2t"&&bytes[0]===0x47,"REAL_MPEGTS_SEGMENT");
  ensure((await fetch(`http://127.0.0.1:9500/${BUCKET}/${key}`)).status===403,"HLS_ANONYMOUS403");
 }
 pass("EXISTING_FFMPEG_FEED_CLOUD_WORKER_PRIVATE_HLS_SQL_READY_POST_PUBLISHED");
 phase="signed-local-hls-range";
 // Original video-cloud manifest signer source, physical SQL-proven playlist,
 // existing storage's real AWS SigV4 presigner and real byte-range requests.
 // This is NOT yet the running Hono's ticket route (old dist until handoff).
 const localStorage=createFeedStorageFromEnv();
 const playlist=await localStorage.readPlaylist(media.playlistKey);
 const signer=await import("../../../../packages/feed-cloud/src/"+"playlist.ts");
 const signed=await signer.signFeedHlsManifest({
   manifest:playlist,ownerId:owner.id,postId,mediaId,
   expiresAt:new Date(Date.now()+90_000),allowedCdnHost:"127.0.0.1",
   isolatedNonprodS3:true, isolatedWeb4:true,
   sign:(key:string,expiresAt:Date)=>localStorage.signCdn({key,expiresAt}),
 });
 ensure(signed.playlist.startsWith("#EXTM3U")&&signed.playlist.includes("#EXT-X-ENDLIST"),"SIGNED_HLS_MANIFEST_VOD");
 const urls=signed.playlist.split(/\r?\n/).filter((line:string)=>line.startsWith("http"));
 ensure(urls.length===media.videoSegmentKeys.length,"SIGNED_HLS_SEGMENT_COUNT");
 for(const url of urls){
  ensure(new URL(url).origin==="http://127.0.0.1:9500","ONLY_SIGNED_PRIVATE_HLS_ORIGIN");
  const full=await fetch(url,{signal:AbortSignal.timeout(8000)});
  ensure(full.status===200&&(await full.arrayBuffer()).byteLength>187,"SIGNED_HLS_SEGMENT_HTTP200");
  const range=await fetch(url,{headers:{Range:"bytes=0-187"},signal:AbortSignal.timeout(8000)});
  const data=Buffer.from(await range.arrayBuffer());
  ensure(range.status===206&&data.length===188&&data[0]===0x47,"REAL_PRIVATE_HLS_RANGE206");
  const invalid=new URL(url);invalid.searchParams.set("X-Amz-Signature","0".repeat(64));
  ensure((await fetch(invalid)).status===403,"TAMPERED_S3_HLS_SEGMENT403");
 }
 pass("REAL_SOURCE_SIGNED_PRIVATE_HLS_MANIFEST_SEGMENTS_RANGE206_TAMPER403");
 phase="published-http";
 const visible=await api(`/feed/posts/${postId}`,"GET",foreign.token);
 ensure(visible.status===200&&visible.data.success===true,"ORIGINAL_HONO_FOREIGN_PUBLISHED200");
 const dto=obj(visible.data.data);
 ensure(dto.id===postId,"ORIGINAL_HONO_PUBLIC_POST_ID");
 const attachments=dto.attachments;
 ensure(Array.isArray(attachments)&&attachments.length===1,"READY_MEDIA_ATTACHED_PUBLIC");
 const att=obj(attachments[0]);
 ensure(typeof att.posterUrl==="string","ORIGINAL_HONO_SIGNED_POSTER");
 ensure(new URL(att.posterUrl).origin==="http://127.0.0.1:9500","PRIVATE_LOCAL_POSTER");
 const fetched=await fetch(att.posterUrl,{signal:AbortSignal.timeout(8000)});
 ensure(fetched.status===200&&Buffer.from(await fetched.arrayBuffer()).subarray(0,4).toString("ascii")==="RIFF","ORIGINAL_HONO_VIDEO_POSTER_GET_WEBP");
 pass("ORIGINAL_HONO_FOREIGN_PUBLISHED_READY_SIGNED_VIDEO_POSTER");
 phase="original-hono-hls-ticket-manifest";
 const issued=await api(`/feed/media/${mediaId}/playback`,"POST",foreign.token,{});
 ensure(issued.status===200&&issued.data.success===true,"ORIGINAL_HONO_HLS_TICKET_HTTP200");
 const playback=obj(issued.data.data);
 ensure(typeof playback.ticket==="string"&&typeof playback.manifestUrl==="string" &&
   playback.manifestUrl.startsWith(`/api/v1/feed-playback/${mediaId}?ticket=`),"ORIGINAL_HONO_HLS_TICKET_SHAPE");
 const ticket=playback.ticket as string;
 const privateManifest=await api(`/feed/media/${mediaId}/manifest?ticket=${encodeURIComponent(ticket)}`,"GET",foreign.token);
 ensure(privateManifest.status===200&&privateManifest.data.success===true,"ORIGINAL_HONO_AUTHENTICATED_HLS_MANIFEST_HTTP200");
 const pm=obj(privateManifest.data.data);
 ensure(typeof pm.playlist==="string"&&pm.playlist.includes("#EXT-X-ENDLIST"),"ORIGINAL_HONO_AUTH_MANIFEST_VOD");
 const playbackRaw=await fetch("http://127.0.0.1:3501"+playback.manifestUrl,{signal:AbortSignal.timeout(12000)});
 ensure(playbackRaw.status===200,"ORIGINAL_HONO_ANONYMOUS_TICKET_MANIFEST_HTTP200");
 ensure((playbackRaw.headers.get("cache-control")??"").includes("no-store"),"PLAYBACK_MANIFEST_NOSTORE");
 const manifest=await playbackRaw.text();
 ensure(manifest.startsWith("#EXTM3U")&&manifest.includes("#EXT-X-ENDLIST")&&manifest===pm.playlist,
    "ORIGINAL_HONO_PLAYBACK_HLS_MANIFEST_EQ_AUTH");
 const segmentUrls=manifest.split(/\r?\n/).filter(line=>line.startsWith("http"));
 ensure(segmentUrls.length===media.videoSegmentKeys.length&&segmentUrls.length>=50&&segmentUrls.length<=90,
    "ORIGINAL_HONO_HLS_SIGNED_SEGMENT_COUNT_120SEC");
 for(const segment of segmentUrls){
  ensure(new URL(segment).origin==="http://127.0.0.1:9500","HLS_ORIGINAL_HONO_SEGMENT_LOOPBACK_ONLY");
  const result=await fetch(segment,{headers:{Range:"bytes=0-187"},signal:AbortSignal.timeout(5000)});
  const bytes=Buffer.from(await result.arrayBuffer());
  ensure(result.status===206&&bytes.length===188&&bytes[0]===0x47,"ORIGINAL_HONO_HLS_SEGMENT_REAL_RANGE206");
 }
 const forged=new URL(segmentUrls[0]!);
 forged.searchParams.set("X-Amz-Signature","0".repeat(64));
 ensure((await fetch(forged)).status===403,"ORIGINAL_HONO_FORGED_SEGMENT403");
 const forgedTicket=ticket.slice(0,-3)+"xxx";
 const invalidManifest=await api(`/feed/media/${mediaId}/manifest?ticket=${encodeURIComponent(forgedTicket)}`,"GET",foreign.token);
 ensure(invalidManifest.status===404,"ORIGINAL_HONO_HLS_TICKET_FORGED_DENIED");
 const other=await api(`/feed/media/${mediaId}/manifest?ticket=${encodeURIComponent(ticket)}`,"GET",owner.token);
 ensure(other.status===404,"ORIGINAL_HONO_HLS_TICKET_OTHER_ACTOR_DENIED");
 pass("ORIGINAL_PACKAGED_HONO_120S_HLS_TICKET_MANIFEST_RANGE206_TAMPER403_OWNER_FENCE");
 phase="real-vite5504-hlsjs-browser-playback";
 console.warn("WEB4_BROWSER_STAGE_IMPORT_PLAYWRIGHT");
 const { chromium }=(await import("../../../../.local-browser-mcp/node_modules/playwright/index.js")).default;
 const chrome=ROOT+"/.local-browser-mcp/.cache/browsers/chromium_headless_shell-1247/chrome-headless-shell-mac-arm64/chrome-headless-shell";
 console.warn("WEB4_BROWSER_STAGE_LAUNCH_CHROMIUM");
 const browser=await chromium.launch({headless:true,executablePath:chrome,args:["--no-sandbox","--disable-background-networking","--disable-gpu"],
   env:{PATH:"/opt/homebrew/bin:/usr/bin:/bin",HOME:ROOT+"/.local-browser-mcp/.cache/home",XDG_CACHE_HOME:ROOT+"/.local-browser-mcp/.cache/tmp"}});
 try {
  console.warn("WEB4_BROWSER_STAGE_CREATE_CONTEXT");
  const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:"block",reducedMotion:"reduce"});
  await ctx.route("**/*",async route=>{
   const uri=new URL(route.request().url());
   if(uri.protocol!=="http:"||uri.hostname!=="127.0.0.1"||
    !["3501","5504","9500"].includes(uri.port))return route.abort();
   return route.continue();
  });
  const page=await ctx.newPage();
  const jsFailures:string[]=[],httpFailures:string[]=[];
  // Diagnostic paths only: never print signed URLs, cookie headers or JWT.
  page.on("pageerror",e=>jsFailures.push(e.name));
  page.on("requestfailed",req=>{
    try {const u=new URL(req.url());
      if(u.hostname==="127.0.0.1"&&["3501","5504","9500"].includes(u.port))
        httpFailures.push(`${u.port}${u.pathname.slice(0,90)}`);
    } catch { httpFailures.push("BAD_URL"); }
  });
  const manifestResults:number[]=[],segmentResults:number[]=[];
  page.on("response",res=>{
   const u=new URL(res.url());
   if(u.pathname.startsWith(`/api/v1/feed-playback/${mediaId}`))manifestResults.push(res.status());
   if(u.origin==="http://127.0.0.1:9500"&&u.pathname.endsWith(".ts"))segmentResults.push(res.status());
  });
  console.warn("WEB4_BROWSER_STAGE_GOTO_LOGIN");
  await page.goto("http://127.0.0.1:5504/login",{waitUntil:"domcontentloaded",timeout:20000});
  console.warn("WEB4_BROWSER_STAGE_LOGIN_COOKIE");
  const login=await page.evaluate(async creds=>{
   const response=await fetch("/api/v1/auth/login",{method:"POST",credentials:"include",
     headers:{"content-type":"application/json","x-gafus-auth-transport":"cookie"},
     body:JSON.stringify(creds)});
   return response.status;
  },{username:foreign!.username,password:foreign!.password});
  ensure(login===200,"ACTUAL_VITE_COOKIE_LOGIN_200");
  console.warn("WEB4_BROWSER_STAGE_GOTO_MOMENT_DETAIL");
  const detail=await page.goto(`http://127.0.0.1:5504/moments/${postId}`,{waitUntil:"domcontentloaded",timeout:25000});
  ensure(detail?.status()===200,"REAL_VITE_MOMENT_DETAIL_ROUTE200");
  // Original Vite intentionally keeps signed media out of cached post data.
  // First expand the real protected gallery; only then can a video player exist.
  console.warn("WEB4_BROWSER_STAGE_EXPAND_PROTECTED_MEDIA_GALLERY");
  const expand=page.getByRole("button",{name:"Показать вложения (1)"});
  try {
    await expand.waitFor({state:"visible",timeout:120000});
  } catch {
    console.warn("WEB4_BROWSER_NOT_LOADED_BODY="+JSON.stringify((await page.locator("body").innerText()).slice(0,450)));
    console.warn("WEB4_BROWSER_JS_FAILURE_TYPES="+JSON.stringify(jsFailures.slice(0,8)));
    console.warn("WEB4_BROWSER_HTTP_FAILURE_PATHS="+JSON.stringify(httpFailures.slice(0,10)));
    throw Error("ASSERT_PROTECTED_MOMENT_GALLERY_NOT_LOADED");
  }
  // No sensitive URLs/tokens in the diagnostic: only synthetic page state.
  const pageState=await page.evaluate(()=>({
    visibleText:(document.querySelector("main")?.textContent ?? "").slice(0,450),
    controls:Array.from(document.querySelectorAll("button")).map(b=>b.textContent?.trim().slice(0,60)).filter(Boolean).slice(0,15),
  }));
  console.warn("WEB4_BROWSER_RENDER_STATE="+JSON.stringify(pageState));
  console.warn("WEB4_BROWSER_JS_FAILURE_TYPES="+JSON.stringify(jsFailures.slice(0,8)));
  console.warn("WEB4_BROWSER_HTTP_FAILURE_PATHS="+JSON.stringify(httpFailures.slice(0,10)));
  const browserFolder=ROOT+"/.design-verify/web4-120-browser-3501-20261026-r5";
  const fs=await import("node:fs/promises");
  await fs.mkdir(browserFolder,{recursive:false});
  await page.screenshot({path:browserFolder+"/before-protected-media.png",animations:"disabled"});
  // First login legitimately starts an onboarding tour and a consent sheet.
  // Dismiss them through actual UI, never by deleting overlay DOM or disabling JS.
  console.warn("WEB4_BROWSER_STAGE_DISMISS_FIRST_LOGIN_UI");
  const skipTour=page.getByRole("button",{name:"Пропустить"});
  if(await skipTour.isVisible()) {
    await skipTour.click({timeout:10000});
    await skipTour.waitFor({state:"hidden",timeout:10000});
  }
  const acceptConsent=page.getByRole("button",{name:"Принять"});
  if(await acceptConsent.isVisible()) {
    await acceptConsent.click({timeout:10000});
    await acceptConsent.waitFor({state:"hidden",timeout:10000});
  }
  // Completing the real first-login tour returns to profile; the post is a
  // different route. Revisit it through the browser before exercising media.
  if(new URL(page.url()).pathname !== `/moments/${postId}`) {
    console.warn("WEB4_BROWSER_STAGE_RETURN_FROM_TOUR_PROFILE_TO_MOMENT");
    const backToPost=await page.goto(`http://127.0.0.1:5504/moments/${postId}`,
      {waitUntil:"domcontentloaded",timeout:25000});
    ensure(backToPost?.status()===200,"MOMENT_RETURN_AFTER_TOUR_ROUTE200");
    await expand.waitFor({state:"visible",timeout:120000});
  }
  console.warn("WEB4_BROWSER_STAGE_EXPAND_READY_VIDEO_ATTACHMENT");
  await page.screenshot({path:browserFolder+"/after-first-login-ui-dismiss.png",animations:"disabled"});
  try {
    await expand.waitFor({state:"visible",timeout:25000});
    await expand.click({timeout:12000});
  } catch (error) {
    const message=error instanceof Error?error.message:"";
    console.warn("WEB4_BROWSER_EXPAND_ERROR_CLASS="+JSON.stringify({
      timeout:message.includes("Timeout"),interception:message.includes("intercepts pointer events"),
      detached:message.includes("detached"),invisible:message.includes("not visible"),
      missing:!(await expand.count()),
      tourPresent:(await page.getByText("Быстрый тур",{exact:true}).count())>0,
      cookiePresent:(await page.getByText("Использование cookies",{exact:false}).count())>0,
      body:(await page.locator("body").innerText()).slice(0,200),
    }));
    throw Error("ASSERT_REAL_MEDIA_GALLERY_EXPAND_CLICK_FAILED");
  }
  console.warn("WEB4_BROWSER_STAGE_EXPANDED_PROTECTED_MEDIA");
  const play=page.getByRole("button",{name:"Смотреть видео"});
  console.warn("WEB4_BROWSER_STAGE_WAIT_PLAY_BUTTON");
  await play.waitFor({state:"visible",timeout:30000});
  ensure(manifestResults.length===0,"NO_PREMATURE_PLAYBACK_TICKET_OR_MANIFEST");
  console.warn("WEB4_BROWSER_STAGE_CLICK_PLAY");
  await play.click({timeout:15000});
  console.warn("WEB4_BROWSER_STAGE_WAIT_VIDEO_READY");
  await page.waitForFunction(()=>(document.querySelector("video[aria-label='Видео публикации']") as HTMLVideoElement | null)?.readyState! >= 2,
    undefined,{timeout:45000}).catch(()=>{});
  console.warn("WEB4_BROWSER_STAGE_INSPECT_VIDEO_AND_SEGMENTS");
  const state=await page.locator("video[aria-label='Видео публикации']").evaluate(v=>({ready:(v as HTMLVideoElement).readyState,
    current:(v as HTMLVideoElement).currentTime,visible:!(v as HTMLVideoElement).hidden}));
  await page.screenshot({path:browserFolder+"/real-hlsjs-mobile.png",animations:"disabled"});
  ensure(manifestResults.includes(200)&&segmentResults.includes(206)||
     (manifestResults.includes(200)&&segmentResults.includes(200)),"BROWSER_REAL_HLSJS_SIGNED_HTTP_MANIFEST_AND_SEGMENT");
  ensure(state.visible&&state.ready>=2,"BROWSER_HLSJS_DECODED_VIDEO_READY");
  pass("REAL_WEB_VITE_HLSJS_120S_ACTUAL_BROWSER_AUTH_TICKET_MANIFEST_SEGMENT_DECODED");
  await ctx.close();
 } finally {await browser.close();}
}
async function cleanup(){
 if(owner){
  const uploads=await prisma.feedUpload.findMany({where:{ownerId:owner.id},select:{sourceKey:true}});
  const media=await prisma.feedMediaAsset.findMany({where:{ownerId:owner.id},select:{thumbKey:true,fullKey:true,posterKey:true,playlistKey:true,videoSegmentKeys:true}});
  for(const row of uploads)ownKeys.add(row.sourceKey);
  for(const row of media)for(const key of [row.thumbKey,row.fullKey,row.posterKey,row.playlistKey,...row.videoSegmentKeys])if(key)ownKeys.add(key);
 }
 if(s3&&owner&&postId){
  for(const key of ownKeys){
   if(!key.startsWith(`posts/${owner.id}/${postId}/`)){
    console.error("WEB4_FEED_VIDEO120_CLEANUP_NONOWN_KEY_REFUSED");process.exitCode=1;continue;
   }
   try{await s3.send(new DeleteObjectCommand({Bucket:BUCKET,Key:key}));
    try{await s3.send(new HeadObjectCommand({Bucket:BUCKET,Key:key}));throw Error("DELETE_NOT_VISIBLE");}
    catch(e){ensure((e as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode===404,"S3_OWN_DELETE_HEAD404");}
   }catch{console.error("WEB4_FEED_VIDEO120_S3_CLEANUP_REVIEW_REQUIRED");process.exitCode=1;}
  }
 }
 if(owner)await prisma.feedStorageJob.deleteMany({where:{ownerId:owner.id}});
 for(const user of [owner,foreign])if(user){
  const row=await prisma.user.findUnique({where:{id:user.id},select:{username:true}});
  if(row?.username===user.username&&user.username.startsWith(PREFIX))await prisma.user.delete({where:{id:user.id}});
 }
}
void(async()=>{try{await main();}catch(e){process.exitCode=1;
 console.error(`WEB4_FEED_VIDEO120_FAILED phase=${phase} code=${e instanceof Error&&e.message.startsWith("ASSERT_")?e.message:"REDACTED"}`);
}finally{try{await cleanup();if(owner)pass("OWN_PRIVATE_S3_AND_SQL_CLEANUP");}
 catch{process.exitCode=1;console.error("WEB4_FEED_VIDEO120_SQL_CLEANUP_REVIEW_REQUIRED");}
 s3?.destroy();await prisma.$disconnect();}})();
