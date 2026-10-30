/** Only isolated local Feed V2 acceptance. Actual Hono HMAC + PG + MinIO.
 * This poller is a local alternative to remote Cloud.ru triggers during manual testing. */
import {readFileSync,lstatSync,realpathSync} from "node:fs";
import {createFeedCloudInternalClient} from "@gafus/feed-cloud";
import {createFeedCloudObjects} from "../../../feed-cloud/src/objects.js";
import {sharpFeedEngine} from "../../../feed-cloud/src/sharp-engine.js";
import {createFeedCloudWorker} from "../../../feed-cloud/src/worker.js";
const ROOT="/Users/asmtv1/Desktop/gafus-refactor",SCRATCH=ROOT+"/.local-pg-scratch/feed-media-local-link-20261028";
const expected={NODE_ENV:"development",GAFUS_LOCAL_ISOLATED_API:"1",GAFUS_WEB4_ISOLATED_MEDIA:"1",API_PORT:"3501",
 GAFUS_ISOLATED_NONPROD_S3:"enabled",GAFUS_ISOLATED_S3_ENDPOINT:"http://127.0.0.1:9500",
 GAFUS_ISOLATED_S3_FEED_BUCKET:"gafus-refactor-web4-feed-test",GAFUS_ISOLATED_S3_GALLERY_BUCKET:"gafus-refactor-web4-gallery-test"};
if(realpathSync(process.cwd())!==ROOT+"/apps/api"||realpathSync(SCRATCH)!==SCRATCH||
 Object.entries(expected).some(([k,v])=>process.env[k]!==v)||
 new URL(process.env.DATABASE_URL??"http://invalid").pathname!=="/gafus_feed_local_cloud_jobs_20261028")throw Error("FEED_POLLER_SCOPE_DENIED");
const secretFile=SCRATCH+"/feed-hmac.secret";
if(lstatSync(secretFile).isSymbolicLink()||(lstatSync(secretFile).mode&0o777)!==0o600)throw Error("LOCAL_HMAC_DENIED");
const key=Buffer.from(readFileSync(secretFile,"utf8").trim());
if(key.byteLength<32)throw Error("LOCAL_HMAC_INVALID");
const localFetcher:typeof fetch=async (input,init)=>{
 const u=new URL(String(input));
 if(u.protocol!=="https:"||u.hostname!=="127.0.0.1"||u.port||!u.pathname.startsWith("/internal/feed/")||u.search||u.hash)
  throw Error("LOCAL_CORE_PATH_DENIED");
 return fetch("http://127.0.0.1:3501"+u.pathname,init);
};
const core=createFeedCloudInternalClient({baseUrl:"https://127.0.0.1",key,fetcher:localFetcher});
const worker=createFeedCloudWorker({core,objects:createFeedCloudObjects(),engine:sharpFeedEngine,onMetrics:stats=>{
 console.log("LOCAL_FEED_METRIC",JSON.stringify({kind:stats.kind,processingMs:stats.processingMs,outputBytes:stats.outputBytes,variants:stats.variantCount}));
}});
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const runOnce=process.argv.includes("--once");
let stopping=false;
process.on("SIGTERM",()=>{stopping=true});process.on("SIGINT",()=>{stopping=true});
process.chdir(SCRATCH); // private/project-owned worker temporary files, never repo root.
for(;;){
 const health=await fetch("http://127.0.0.1:3501/__feed_v2_isolated_health",{signal:AbortSignal.timeout(6000)});
 if(!health.ok||(await health.json()).db!=="feed-v2-isolated")throw Error("LOCAL_HONO_UNAVAILABLE");
 const s3=await fetch("http://127.0.0.1:9500/minio/health/live",{signal:AbortSignal.timeout(6000)});
 if(!s3.ok)throw Error("LOCAL_S3_UNAVAILABLE");
 await core.maintenance(20);
 let count=0;
 for(const kind of ["photo","video"] as const){
  const jobs=await core.claimJobs(1,kind);
  for(const job of jobs){
   const reply=await worker.process(job);
   if(!reply.accepted)throw Error("LOCAL_WORKER_CALLBACK_NOT_ACCEPTED");
   count++;console.log("LOCAL_FEED_JOB_COMPLETED",job.kind);
  }
 }
 if(runOnce){console.log("LOCAL_FEED_POLL_ONCE_OK",count);break}
 if(stopping)break;
 await wait(count?1000:7000);
}
console.log("LOCAL_FEED_POLLER_STOPPED_SAFELY");
