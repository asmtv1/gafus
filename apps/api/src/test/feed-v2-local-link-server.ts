/** Project-only Feed V2 verification: full Hono API on a fresh EMPTY local DB. */
import { realpathSync, readFileSync, lstatSync } from "node:fs";
const ROOT = "/Users/asmtv1/Desktop/gafus-refactor";
const scratch = ROOT + "/.local-pg-scratch/feed-media-local-link-20261028";
const required = {
  NODE_ENV:"development",GAFUS_LOCAL_ISOLATED_API:"1",GAFUS_LOCAL_BROWSER_AUTH:"1",GAFUS_WEB4_ISOLATED_MEDIA:"1",
  GAFUS_ISOLATED_NONPROD_S3:"enabled",GAFUS_ISOLATED_S3_ENDPOINT:"http://127.0.0.1:9500",
  GAFUS_ISOLATED_S3_FEED_BUCKET:"gafus-refactor-web4-feed-test",
  GAFUS_ISOLATED_S3_GALLERY_BUCKET:"gafus-refactor-web4-gallery-test",
  GAFUS_ISOLATED_S3_DOCUMENTS_BUCKET:"gafus-refactor-web4-documents-test",
  GAFUS_ISOLATED_S3_QUESTIONS_BUCKET:"gafus-refactor-web4-questions-test",
  GAFUS_LOCAL_MEDIA_HTTP_ACCEPTANCE:"1",CLOUDRU_MEDIA_JOBS_ENABLED:"false",
  FEED_MEDIA_FALLBACK_ENABLED:"false",GALLERY_MEDIA_FALLBACK_ENABLED:"false",
  FEED_ENABLED:"true",FEED_PROCESSOR_READY:"true",CDN_HEALTH_MONITOR_ENABLED:"false",
  API_HOST:"127.0.0.1",API_PORT:"3501",REDIS_URL:"redis://127.0.0.1:55928/1",
} as const;
const fail=(why:string):never=>{throw Error("FEED_V2_LOCAL_LINK_PREFLIGHT_"+why)};
if(realpathSync(process.cwd())!==ROOT+"/apps/api"||realpathSync(ROOT)!==ROOT||realpathSync(scratch)!==scratch)fail("ROOT");
if(Object.entries(required).some(([k,v])=>process.env[k]!==v))fail("ENV");
const url=new URL(process.env.DATABASE_URL??"http://invalid");
if(url.protocol!=="postgresql:"||url.hostname!=="127.0.0.1"||url.port!=="55921"||url.pathname!=="/gafus_feed_local_cloud_jobs_20261028"||url.username!=="gafus_refactor_local_real"||!url.password||url.searchParams.get("schema")!=="public")fail("DATABASE");
for(const key of Object.keys(process.env)){
 if(/^(?:CLOUDRU_S3_|CLOUD_RU_|AWS_|BEGET_|YOOKASSA_|RESEND_|SMTP_|MAIL_|YANDEX_|TELEGRAM_|VK_)/.test(key)&&process.env[key])fail("EXTERNAL_PROVIDER_ENV");
}
for(const n of ["jwt.secret","refresh.secret","feed-hmac.secret"]){
 const p=scratch+"/"+n;const t=lstatSync(p);if(t.isSymbolicLink()||(t.mode&0o777)!==0o600||readFileSync(p,"utf8").trim().length<32)fail("KEYS");
}
const [
 { Hono }, { serve }, { prisma }, { connection:redis },
 { corsMiddleware }, { authMiddleware },
 { authRoutes }, { userRoutes }, { feedRoutes }, { internalFeedRoutes },
] = await Promise.all([
 import("hono"),import("@hono/node-server"),import("@gafus/prisma"),import("@gafus/queues"),
 import("../middleware/cors.js"),import("../middleware/auth.js"),
 import("../routes/v1/auth.js"),import("../routes/v1/user.js"),
 import("../routes/v1/feed.js"),import("../routes/internal/feed.js"),
]);
const app=new Hono();
app.use("*",corsMiddleware);
app.route("/api/v1/auth",authRoutes);
app.use("/api/v1/user",authMiddleware);
app.use("/api/v1/user/*",authMiddleware);
app.route("/api/v1/user",userRoutes);
app.use("/api/v1/feed",authMiddleware);
app.use("/api/v1/feed/*",authMiddleware);
app.route("/api/v1/feed",feedRoutes);
app.route("/internal/feed",internalFeedRoutes);
const names=(await prisma.user.findMany({select:{username:true}})).map(x=>x.username).sort();
const posts=await prisma.feedPost.count();
const isEmpty=names.length===0 && posts===0;
const isOwnTestData=names.length===2 && names.join(",")==="feedv2_local,feedv2_reader" && posts===2;
if(!isEmpty&&!isOwnTestData)fail("FOREIGN_OR_UNEXPECTED_TEST_DB_DATA");
app.get("/__feed_v2_isolated_health",c=>c.json({ready:true,local:true,db:"feed-v2-isolated",s3:"9500",queue:"55928"}));
const server=serve({fetch:app.fetch,hostname:"127.0.0.1",port:3501});
console.log("FEED_V2_LOCAL_HONO_READY_3501");
let ending=false;
const stop=()=>{if(ending)return;ending=true;server.close(()=>{Promise.allSettled([prisma.$disconnect(),redis.quit()]).finally(()=>process.exit(0))})};
process.on("SIGINT",stop);process.on("SIGTERM",stop);
