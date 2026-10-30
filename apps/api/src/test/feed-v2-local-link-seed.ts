/** Reproducible synthetic ONLY feed posts on dedicated empty local DB + local MinIO. */
import { realpathSync, readFileSync, writeFileSync, existsSync, lstatSync } from "node:fs";
import { randomUUID, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import { prisma } from "@gafus/prisma";
import { createFeedStorage } from "@gafus/feed-storage";
import { isolatedNonprodS3Config } from "@gafus/cdn-upload/isolated-nonprod-s3";
import { createFeedService } from "@gafus/core/services/feed";
import { S3Client, HeadBucketCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
const ROOT="/Users/asmtv1/Desktop/gafus-refactor";
const D=ROOT+"/.local-pg-scratch/feed-media-local-link-20261028";
const requireLocal=(x:unknown)=>{if(!x)throw Error("FEED_SEED_LOCAL_SCOPE_DENIED")};
requireLocal(realpathSync(process.cwd())===ROOT+"/apps/api" && realpathSync(ROOT)===ROOT);
requireLocal(process.env.GAFUS_LOCAL_ISOLATED_API==="1" && process.env.GAFUS_WEB4_ISOLATED_MEDIA==="1" && process.env.GAFUS_ISOLATED_NONPROD_S3==="enabled");
requireLocal(new URL(process.env.DATABASE_URL??"http://invalid").pathname==="/gafus_feed_local_cloud_jobs_20261028");
const creds=isolatedNonprodS3Config("feed");requireLocal(creds?.endpoint==="http://127.0.0.1:9500");
const storage=createFeedStorage({enabled:true,isolatedNonprod:true,...creds!,cdnBaseUrl:"",cdnSecret:""});
const client=new S3Client({endpoint:creds!.endpoint,region:"us-east-1",forcePathStyle:true,credentials:{accessKeyId:creds!.accessKeyId,secretAccessKey:creds!.secretAccessKey},maxAttempts:1});
const account=join(D,"test-account.private.json");
const idList=join(D,"synthetic-posts.private.json");
requireLocal(!existsSync(account)&&!existsSync(idList));
requireLocal((await prisma.user.count())===0 && (await prisma.feedPost.count())===0);
await client.send(new HeadBucketCommand({Bucket:creds!.bucket}));
const owner=randomUUID();const reader=randomUUID();
const pass=readFileSync(join(D,'test-password.private'),'utf8').trim();
await prisma.user.createMany({data:[
 {id:owner,username:"feedv2_local",password:await bcrypt.hash(pass,12),registrationPending:false},
 {id:reader,username:"feedv2_reader",password:await bcrypt.hash(pass,12),registrationPending:false},
]});
const feed=createFeedService({db:prisma,storage,enabled:()=>true});
const files=[{kind:"photo" as const, ext:"png",mime:"image/png" as const,file:join(D,"test-photo.png")},
  {kind:"video" as const,ext:"mp4",mime:"video/mp4" as const,file:join(D,"test-video.mp4")}];
execFileSync('ffmpeg',['-hide_banner','-nostdin','-loglevel','error','-y','-f','lavfi','-i','color=c=green:s=1200x2400:d=1','-frames:v','1',files[0]!.file],{timeout:20000});
execFileSync('ffmpeg',['-hide_banner','-nostdin','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=1280x720:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','10','-threads','2','-c:v','libx264','-preset','superfast','-pix_fmt','yuv420p','-c:a','aac','-shortest',files[1]!.file],{timeout:120000});
const receipts=[];
for(const input of files){
 const source=readFileSync(input.file);
 const draft=await feed.create(owner,{clientRequestId:randomUUID()});
 const ticket=await feed.reserveUpload(owner,draft.id,{clientRequestId:randomUUID(),filename:`source.${input.ext}`,kind:input.kind,declaredMime:input.mime,declaredBytes:source.byteLength});
 requireLocal(new URL(ticket.postUrl!).origin==="http://127.0.0.1:9500");
 const form=new FormData();for(const [k,v] of Object.entries(ticket.postFields!))form.append(k,v);
 form.append("file",new Blob([source],{type:input.mime}),`source.${input.ext}`);
 const response=await fetch(ticket.postUrl!,{method:"POST",body:form,signal:AbortSignal.timeout(25000)});
 requireLocal(response.status===204);
 const uploadRow=await prisma.feedUpload.findUniqueOrThrow({where:{id:ticket.uploadId}});
 requireLocal((await storage.head(uploadRow.sourceKey))?.bytes===source.length);
 requireLocal((await feed.completeUpload(owner,ticket.uploadId)).status==="uploaded");
 await feed.saveRevision(owner,draft.id,{clientRequestId:randomUUID(),expectedVersion:draft.version,text:`Feed V2 local test: ${input.kind}, не production`,attachmentIds:[ticket.mediaId]});
 requireLocal((await feed.publish(owner,draft.id,{clientRequestId:randomUUID()})).status==="pending");
 receipts.push({kind:input.kind,postId:draft.id,mediaId:ticket.mediaId,sourceKey:uploadRow.sourceKey});
}
writeFileSync(account,JSON.stringify({username:"feedv2_local",password:pass,reader:"feedv2_reader"},null,2),{mode:0o600,flag:'wx'});
writeFileSync(idList,JSON.stringify({owner,reader,receipts},null,2),{mode:0o600,flag:'wx'});
requireLocal((await prisma.feedPost.count())===2);
console.log("LOCAL_FEED_V2_SEEDED",JSON.stringify({posts:receipts.map(x=>({kind:x.kind,postId:x.postId})),users:2,database:"dedicated_empty_before_seed",s3:"private_minio_9500"}));
client.destroy();await prisma.$disconnect();
