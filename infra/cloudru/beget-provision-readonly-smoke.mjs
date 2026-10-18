/**
 * Manual, approval-gated creation of TWO permanent synthetic read-only smoke
 * WebPs for Beget/CDNvideo; Cloud.ru private buckets only. Never touches user
 * objects, DNS, CDN settings or deploy. Do not print secrets or signed URLs.
 * After successful upload, publish keys and digests via GITHUB_ENV and logs;
 * caller must store them as protected GitHub Environment variables.
 */
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { appendFile } from 'node:fs/promises';
import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const mode=process.argv[2]??'--plan';
if(!['--plan','--run'].includes(mode)||process.argv.length>3)throw Error('UNSUPPORTED_SMOKE_PROVISION_MODE');
const definitions=[
 {scope:'gallery',bucket:'gafus-gallery-private',key:id=>`albums/beget-smoke-${id}/beget-smoke-${id}/photos/${id}/full.webp`,keyVar:'BEGET_GALLERY_SMOKE_FINAL_KEY',hashVar:'BEGET_GALLERY_SMOKE_SHA256',rgb:{r:72,g:142,b:102}},
 {scope:'feed',bucket:'gafus-feed-private',key:id=>`posts/beget-smoke-${id}/beget-smoke-${id}/attachments/${id}/poster.webp`,keyVar:'BEGET_FEED_SMOKE_FINAL_KEY',hashVar:'BEGET_FEED_SMOKE_SHA256',rgb:{r:92,g:96,b:153}},
];
if(mode==='--plan'){
 console.log('SMOKE_FIXTURE_PLAN=two isolated permanent WebPs in existing private Gallery/Feed Cloud.ru buckets; no user media, DNS or deploy changes');
 process.exit(0);
}
const e=process.env;
if(e.BEGET_PERMANENT_SMOKE_CONFIRM!=='approved-two-permanent-production-webps'||e.CLOUDRU_S3_ENDPOINT!=='https://s3.cloud.ru'||!e.GITHUB_ENV)
 throw Error('SMOKE_FIXTURE_PROVISION_NOT_AUTHORIZED');
for(const name of ['CLOUDRU_S3_ACCESS_KEY_ID','CLOUDRU_S3_SECRET_ACCESS_KEY'])
 if(!e[name]||e[name].length<16)throw Error('SMOKE_FIXTURE_CREDENTIAL_MISSING_'+name);
const require=createRequire(new URL('../../apps/gallery-cloud/package.json',import.meta.url));
const sharp=require('sharp');
const s3=new S3Client({endpoint:'https://s3.cloud.ru',region:'ru-central-1',forcePathStyle:true,maxAttempts:1,
 credentials:{accessKeyId:e.CLOUDRU_S3_ACCESS_KEY_ID,secretAccessKey:e.CLOUDRU_S3_SECRET_ACCESS_KEY}});
const created=[];
try{
 // Check both buckets before any change.
 for(const def of definitions){
   const preflight=await s3.send(new HeadObjectCommand({Bucket:def.bucket,Key:def.key('never-existing-'+randomUUID().replaceAll('-',''))}),{abortSignal:AbortSignal.timeout(16000)}).catch(err=>err);
   if(preflight?.$metadata?.httpStatusCode!==404)throw Error('SMOKE_BUCKET_PREFLIGHT_FAILED_'+def.scope);
 }
 for(const def of definitions){
   const id=randomUUID().replaceAll('-','');
   const key=def.key(id);
   const bytes=await sharp({create:{width:16,height:16,channels:3,background:def.rgb}}).webp().toBuffer();
   if(bytes.length<20||bytes.length>5000)throw Error('SMOKE_WEBP_BYTES_UNEXPECTED_'+def.scope);
   const sha=createHash('sha256').update(bytes).digest('hex');
   // Register for cleanup BEFORE PUT: a timed-out PUT may have succeeded.
   created.push({def,key,sha,bytes:bytes.length});
   const put=await s3.send(new PutObjectCommand({Bucket:def.bucket,Key:key,Body:bytes,IfNoneMatch:'*',ContentType:'image/webp',CacheControl:def.scope === 'feed' && e.FEED_BUCKET_PUBLIC === 'true'
     ? 'public, max-age=180, s-maxage=86400, must-revalidate'
     : (def.scope === 'gallery' && e.GALLERY_CDN_REDIRECT_ENABLED === 'true'
         ? 'public, max-age=600' : 'private, max-age=180, must-revalidate')}),{abortSignal:AbortSignal.timeout(18000)});
   if(put.$metadata.httpStatusCode!==200)throw Error('SMOKE_PUT_STATUS_UNEXPECTED_'+def.scope);
   const head=await s3.send(new HeadObjectCommand({Bucket:def.bucket,Key:key}),{abortSignal:AbortSignal.timeout(15000)});
   if(head.$metadata.httpStatusCode!==200||head.ContentLength!==bytes.length||!head.ContentType?.includes('image/webp'))
     throw Error('SMOKE_HEAD_MISMATCH_'+def.scope);
 }
 // Durable fixtures: only publish env and keys after ALL uploads and heads.
 // Existing objects are never reused or overwritten.
 for(const {def,key,sha,bytes} of created){
   await appendFile(e.GITHUB_ENV,`${def.keyVar}=${key}\n${def.hashVar}=${sha}\n`,{encoding:'utf8'});
   console.log(`SMOKE_FIXTURE_CREATED scope=${def.scope} key=${key} sha256=${sha} bytes=${bytes}`);
 }
 console.log('TWO_PERMANENT_SMOKE_FIXTURES_READY=PASS');
}catch(err){
 console.error('SMOKE_FIXTURE_PROVISION_ERROR',err?.name??'ERROR',String(err?.message??'UNKNOWN').slice(0,140));
 for(const {def,key} of created){
   try{await s3.send(new DeleteObjectCommand({Bucket:def.bucket,Key:key}),{abortSignal:AbortSignal.timeout(16000)});console.log('SYNTHETIC_PROVISION_ROLLBACK',def.scope);}
   catch(ex){console.error('SYNTHETIC_PROVISION_ROLLBACK_FAILED',def.scope,ex?.name??'UNKNOWN');}
 }
 process.exitCode=1;
}finally{s3.destroy();}
