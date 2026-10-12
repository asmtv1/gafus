/**
 * Synthetic-only Feed image + real TS segment through existing dev Yandex CDN.
 * Temporarily borrows gallery-dev.gafus.ru test CDN, preserving its signer,
 * static request headers, TLS cert and domain; automated verified rollback.
 * NOT proof that a separate Feed production CDN has been configured.
 */
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, unlink, mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';
import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
const folder='b1gjbsvfnd1fl68k43g6', cdnId='bc8ru2x6mcqxwcl6a7vj';
const originalGroup='8971053823582171020', originalHost='d5dbaoo0dr812sj1ee7f.764nr5vy.apigw.yandexcloud.net';
const stageGroup='7331777604738481539', stageHost='gafus-feed-origin-staging.containerapps.ru';
const bucket='gafus-feed-private', cdnHost='feed.gafus.ru';
const e=process.env;
if(e.GAFUS_FEED_REAL_CDN_SMOKE_CONFIRM!=='live-feed-synthetic-with-rollback'||e.CLOUDRU_S3_ENDPOINT!=='https://s3.cloud.ru')throw Error('FEED_CDN_SMOKE_NOT_AUTHORIZED');
const env=JSON.parse(await readFile('infra/feed/.secrets/runtime.json','utf8'));
const cdnSecret=env.cdn_secret, headerSecret=env.origin_secret;
if(!/^[A-Za-z0-9_-]{6,32}$/.test(cdnSecret??'')||Buffer.byteLength(headerSecret??'')<32)throw Error('TEST_CDN_CREDENTIALS_MISSING');
const require=createRequire(fileURLToPath(new URL('../../apps/gallery-cloud/package.json',import.meta.url)));
const sharp=require('sharp');
const work=await mkdtemp(join(tmpdir(),'gafus-feed-cdn-'));
const rollbackFile=join(homedir(),'.codex/cloudru/feed-real-cdn-rollback.json');
const s3=new S3Client({endpoint:'https://s3.cloud.ru',region:'ru-central-1',forcePathStyle:true,maxAttempts:1,credentials:{accessKeyId:e.CLOUDRU_S3_ACCESS_KEY_ID,secretAccessKey:e.CLOUDRU_S3_SECRET_ACCESS_KEY}});
const cli=args=>{const x=spawnSync('yc',args,{encoding:'utf8',timeout:50000,maxBuffer:3*1024*1024});if(x.status!==0)throw Error('YC_CLI_FAILURE_'+args.slice(0,2).join('_'));return x.stdout?JSON.parse(x.stdout):{}};
const current=()=>cli(['cdn','resource','get','--id',cdnId,'--folder-id',folder,'--format=json']);
const info=x=>({certificateReady:x.ssl_certificate?.status==='READY',group:x.origin_group_id,host:x.options?.host_options?.host?.value??null,sni:x.options?.custom_server_name?.value??null,
 cname:x.cname,active:x.active,signed:x.options?.secure_key?.enabled===true,staticRequest:x.options?.static_request_headers?.enabled===true,
 headerVerified:x.options?.static_request_headers?.value?.['x-feed-origin-secret']===headerSecret,
 signerVerified:x.options?.secure_key?.key===cdnSecret});
const update=(group,host,isStage)=>cli(['cdn','resource','update','--id',cdnId,'--folder-id',folder,'--origin-group-id',group,
 '--host-header',host,'--origin-protocol','HTTPS',...(isStage?['--custom-server-name',stageHost]:['--clear-custom-server-name']),'--format=json']);
const sign=(path,expiry)=>`https://${cdnHost}${path}?md5=${createHash('md5').update(`${expiry}${path} ${cdnSecret}`).digest('base64url')}&expires=${expiry}`;
const request=(url,method='GET',headers={})=>fetch(url,{method,headers,redirect:'manual',signal:AbortSignal.timeout(15000)});
const metrics=async()=>{try{const r=await request(`https://${stageHost}/__gafus_cloudru_validation__/metrics`,'GET',{'x-feed-origin-secret':headerSecret});return r.status===200?await r.json():{status:r.status}}catch{return {status:'unavailable'}}};
let didSwitch=false,didRestore=false,backupWritten=false,success=false;
const fixtures=[];
const summarize=(x)=>Object.fromEntries([...new Set(x.map(y=>y.status))].map(status=>[status,x.filter(y=>y.status===status).length]));
try{
 const before=info(current());
 if(before.group!==originalGroup||before.host!==originalHost||before.sni||before.cname!==cdnHost||!before.certificateReady||!before.active||!before.signed||!before.staticRequest||!before.headerVerified||!before.signerVerified)throw Error('TEST_CDN_BASELINE_UNEXPECTED');
 const group=cli(['cdn','origin-group','get','--id',stageGroup,'--folder-id',folder,'--format=json']);
 if(group.origins?.[0]?.source!==stageHost)throw Error('UNTRUSTED_FEED_ORIGIN_GROUP');
 const uuid=randomUUID();
 const webp=await sharp({create:{width:16,height:16,channels:3,background:{r:63,g:129,b:57}}}).webp().toBuffer();
 const filename=join(work,'sample.ts');
 execFileSync('ffmpeg',['-hide_banner','-nostdin','-loglevel','error','-y','-f','lavfi','-i','testsrc=size=320x180:rate=24',
  '-t','2','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-an','-f','mpegts',filename],{timeout:45000});
 const video=await readFile(filename);
 if(video.length<188||video.length>1_750_000||video[0]!==0x47||video.length%188!==0)throw Error('BAD_SYNTHETIC_TS');
 const defs=[{type:'poster',key:`posts/__gafus_cloudru_validation__/staging/attachments/${uuid}/poster.webp`,data:webp,mime:'image/webp'},
  {type:'hls-segment',key:`posts/__gafus_cloudru_validation__/staging/attachments/${uuid}/hls/segment-000.ts`,data:video,mime:'video/mp2t'}];
 for(const f of defs){await s3.send(new PutObjectCommand({Bucket:bucket,Key:f.key,Body:f.data,ContentType:f.mime,CacheControl:'private, no-store',IfNoneMatch:'*'}));fixtures.push({...f,exists:true});
  const r=await request(`https://${stageHost}/${f.key}`,'GET',{'x-feed-origin-secret':headerSecret});
  const body=Buffer.from(await r.arrayBuffer());
  if(r.status!==200||!body.equals(f.data))throw Error('DIRECT_FEED_ORIGIN_PRECHECK_'+f.type);
 }
 await writeFile(rollbackFile,JSON.stringify({cdnId,folder,originalGroup,originalHost,stageGroup,createdAt:new Date().toISOString()}),{flag:'wx',mode:0o600});backupWritten=true;
 const beforeCounters=await metrics();
 didSwitch=true;update(stageGroup,stageHost,true);
 const after=info(current());
 if(after.group!==stageGroup||after.host!==stageHost||after.sni!==stageHost||after.cname!==cdnHost||!after.signerVerified||!after.headerVerified)throw Error('STAGING_CDN_UPDATE_DAMAGED_SECURITY');
 console.log('FEED_TEST_CDN_CONNECTED_WITH_ORIGINAL_SIGNATURES=true');
 for(const f of fixtures){
  const path='/'+f.key;const coldFailures=[];let cachedUrl;
  for(let i=0;i<140;i++){
   const url=sign(path,Math.floor(Date.now()/1000)+115);
   try{const r=await request(url);const body=Buffer.from(await r.arrayBuffer());
    if(r.status===200){if(!body.equals(f.data))throw Error('CDN_WRONG_CONTENT_'+f.type);cachedUrl=url;break;}
    coldFailures.push({status:r.status});
   }catch(err){coldFailures.push({status:0,error:err?.name??'unknown'})}
   if((i+1)%10===0)console.log('FEED_CDN_PROPAGATION',JSON.stringify({type:f.type,attempts:i+1,counts:summarize(coldFailures)}));
   await new Promise(resolve=>setTimeout(resolve,4000));
  }
  if(!cachedUrl){console.log('FEED_CDN_COLD_STATUS',JSON.stringify({type:f.type,counts:summarize(coldFailures)}));throw Error('FEED_CDN_COLD_NEVER_READY_'+f.type)}
  const samples=[],workers=4;let idx=0;
  await Promise.all(Array.from({length:workers},async()=>{while(idx<100){const seq=idx++;const time=Date.now();
    try{const r=await request(cachedUrl);const b=Buffer.from(await r.arrayBuffer());samples[seq]={status:r.status,valid:r.status===200&&b.equals(f.data),ms:Date.now()-time}}catch(ex){samples[seq]={status:0,valid:false,ms:Date.now()-time}}
  }}));
  const duration=samples.map(x=>x.ms).sort((a,b)=>a-b);
  console.log('FEED_CDN_100_REQUESTS',JSON.stringify({type:f.type,counts:summarize(samples),valid:samples.filter(x=>x.valid).length,p50:duration[49],p95:duration[94],p99:duration[98],preReady:coldFailures.slice(-6)}));
  if(samples.some(x=>!x.valid))throw Error('FEED_CDN_NOT_STABLE_'+f.type);
  const head=await request(cachedUrl,'HEAD');const headStatus=head.status;await head.body?.cancel();
  const ranged=await request(cachedUrl,'GET',{range:'bytes=0-3'});
  const rangedBytes=Buffer.from(await ranged.arrayBuffer());const rangeOk=ranged.status===206&&rangedBytes.equals(f.data.subarray(0,4));
  // Only our unique synthetic UUID keys are deleted. Prove true CDN HIT.
  await s3.send(new DeleteObjectCommand({Bucket:bucket,Key:f.key}));f.exists=false;
  let absence=false;try{await s3.send(new HeadObjectCommand({Bucket:bucket,Key:f.key}));}catch(ex){absence=ex?.$metadata?.httpStatusCode===404;}
  if(!absence)throw Error('FEED_SOURCE_DELETE_UNCONFIRMED');
  const cached=[];
  for(let i=0;i<10;i++){const r=await request(cachedUrl);const b=Buffer.from(await r.arrayBuffer());cached.push({status:r.status,valid:r.status===200&&b.equals(f.data)});}
  const expires=await request(sign(path,Math.floor(Date.now()/1000)-5));const expired=expires.status;await expires.body?.cancel();
  const forged=await request(sign(path,Math.floor(Date.now()/1000)+75).replace(/md5=[^&]+/,'md5='+('A'.repeat(22))));const tampered=forged.status;await forged.body?.cancel();
  const result={type:f.type,headStatus,rangeOk,originRemoved:absence,
   cachedAfterDelete:cached.filter(x=>x.valid).length,afterDeleteStatuses:summarize(cached),expired,tampered};
  console.log('FEED_CDN_HOT_CACHE_SECURITY',JSON.stringify(result));
  // Edges may be routed across PoPs with distinct caches. Yandex CDN does
  // not promise 100% cache HIT; one verified 200 after S3 HEAD 404 proves a
  // real HIT. However 100/100 must succeed while source S3 is available.
  if(headStatus!==200||!rangeOk||cached.filter(x=>x.valid).length<1||![403,410].includes(expired)||tampered!==403)throw Error('FEED_CDN_HIT_SECURITY_NOT_PROVEN_'+f.type);
 }
 console.log('FEED_CDN_ORIGIN_METRICS',JSON.stringify({before:beforeCounters,after:await metrics()}));
 success=true;
}finally{
 if(didSwitch){for(let i=0;i<4;i++){try{update(originalGroup,originalHost,false);const after=info(current());if(after.group===originalGroup&&after.host===originalHost&&!after.sni&&after.cname===cdnHost&&after.signed&&after.staticRequest&&after.signerVerified&&after.headerVerified){didRestore=true;break;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,1600));}
  console.log('REAL_FEED_CDN_YANDEX_ORIGIN_RESTORED='+didRestore);
 }
 for(const f of fixtures){try{if(f.exists)await s3.send(new DeleteObjectCommand({Bucket:bucket,Key:f.key}));}catch{} }
 for(const f of fixtures){let empty=false;try{await s3.send(new HeadObjectCommand({Bucket:bucket,Key:f.key}));}catch(ex){empty=ex?.$metadata?.httpStatusCode===404;}
  console.log('FEED_SYNTHETIC_S3_REMOVED',JSON.stringify({type:f.type,removed:empty}));if(!empty)process.exitCode=1;}
 if(didRestore){for(const f of fixtures){let purged=false;for(let i=0;i<4;i++){
   try{cli(['cdn','cache','purge','--resource-id',cdnId,'--path','/'+f.key]);purged=true;break;}
   catch{await new Promise(done=>setTimeout(done,1800));}}
   console.log('FEED_CDN_TEST_PATH_PURGED_'+f.type+'='+purged);
   // A cache-purge failure on an unserved test-only key is a cleanup warning:
   // its signer expires within 115 seconds, and the backing S3 key is deleted.
   }
  if(backupWritten)await unlink(rollbackFile).catch(()=>{});
 }else if(didSwitch){process.exitCode=1}
 await rm(work,{recursive:true,force:true});s3.destroy();
 }
 console.log('REAL_FEED_CDN_TEST_RESULT='+ (success?'PASS':'NOT_PASSED'));
