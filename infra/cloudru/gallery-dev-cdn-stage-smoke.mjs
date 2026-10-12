/**
 * Real Yandex CDN dev-only temporary Cloud.ru Origin smoke.
 * Required rollback: restore original dev origin-group + Host in finally.
 * Never mutate production CDN, original Yandex data or Cloud.ru user keys.
 */
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'dotenv';
import {S3Client,PutObjectCommand,DeleteObjectCommand,HeadObjectCommand} from '@aws-sdk/client-s3';
const folder='b1gjbsvfnd1fl68k43g6';
const id='bc8rorv3vgbgax3xesyn';
const originalGroup='4750779953037546925';
const stagingGroup='6553917069416838651';
const oldHost='d5dt5vq9i144767f94r9.jki8ffxa.apigw.yandexcloud.net';
const stageHost='gafus-gallery-origin-staging.containerapps.ru';
const bucket='gafus-gallery-private';
const e=process.env;
if(e.CLOUDRU_DEV_CDN_TEST_CONFIRM!=='temporary-test-and-rollback' ||
   e.CLOUDRU_S3_ENDPOINT!=='https://s3.cloud.ru')throw Error('DEV_CDN_TEST_NOT_AUTHORIZED');
const secrets=parse(await readFile('.env'));
const cdnSecret=secrets.TF_VAR_cdn_secret;
const originSecret=secrets.TF_VAR_origin_secret;
if(!/^[A-Za-z0-9_-]{6,32}$/.test(cdnSecret??'')||Buffer.byteLength(originSecret??'')<32)
  throw Error('DEV_CDN_SECRETS_NOT_VERIFIED');
const require=createRequire(fileURLToPath(new URL('../../apps/gallery-cloud/package.json',import.meta.url)));
const sharp=require('sharp');
const image=await sharp({create:{width:10,height:10,channels:3,background:{r:15,g:122,b:97}}}).webp().toBuffer();
const key=`albums/__gafus_cloudru_validation__/staging/photos/${randomUUID()}/full.webp`;
const path=`/${key}`;
const expectedHash=createHash('sha256').update(image).digest('hex');
const rollbackFile=join(homedir(),'.codex/cloudru/gallery-dev-cdn-rollback.json');
const cli=args=>{
 const out=spawnSync('yc',args,{encoding:'utf8',timeout:45000,maxBuffer:2*1024*1024});
 if(out.status!==0)throw Error(`YC_CLI_FAILED_${args[0]}_${args[1]??'unknown'}_${out.status}`);
 return out.stdout?JSON.parse(out.stdout):{};
};
const current=()=>cli(['cdn','resource','get','--id',id,'--folder-id',folder,'--format=json']);
const update=(group,host,stage=false)=>cli(['cdn','resource','update','--id',id,'--folder-id',folder,
 '--origin-group-id',group,'--host-header',host,'--origin-protocol','HTTPS',
 ...(stage?['--custom-server-name',stageHost]:['--clear-custom-server-name']),'--format=json']);
const info=()=>{
 const x=current();return {cname:x.cname,group:x.origin_group_id,active:x.active,
  host:x.options?.host_options?.host?.value??null,
  sni:x.options?.custom_server_name?.value??null,
  secureKeyEnabled:x.options?.secure_key?.enabled===true,
  secretHeaderEnabled:x.options?.static_request_headers?.enabled===true,
  queriesIgnored:x.options?.query_params_options?.ignore_query_string?.value===true};
};
const before=info();
if(before.cname!=='gallery-dev.gafus.ru'||before.group!==originalGroup||before.host!==oldHost||
 !before.active||before.sni||!before.secureKeyEnabled||!before.secretHeaderEnabled||!before.queriesIgnored)
 throw Error('DEV_CDN_CONFIGURATION_NOT_MATCHING_EXPECTED');
const staged=cli(['cdn','origin-group','get','--id',stagingGroup,'--folder-id',folder,'--format=json']);
if(staged.origins?.[0]?.source!==stageHost)throw Error('UNTRUSTED_STAGING_ORIGIN_GROUP');
const client=new S3Client({endpoint:'https://s3.cloud.ru',region:'ru-central-1',forcePathStyle:true,maxAttempts:1,
 credentials:{accessKeyId:e.CLOUDRU_S3_ACCESS_KEY_ID,secretAccessKey:e.CLOUDRU_S3_SECRET_ACCESS_KEY}});
let created=false,changed=false,restored=false,testStatus='not-started';
const makeUrl=expiry=>`https://gallery-dev.gafus.ru${path}?md5=${createHash('md5').update(`${expiry}${path} ${cdnSecret}`).digest('base64url')}&expires=${expiry}`;
const get=async(url,method='GET',headers={})=>fetch(url,{method,headers,redirect:'manual',signal:AbortSignal.timeout(20000)});
const stats=[];
async function stageMetrics(){
 try {const r=await get(`https://${stageHost}/__gafus_cloudru_validation__/metrics`,'GET',{'x-gallery-origin-secret':originSecret});
  if(r.status!==200){await r.body?.cancel();return {errorStatus:r.status}};
  return await r.json();
 }catch{return {error:'unavailable'};}
}
try{
 await client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:image,ContentType:'image/webp',IfNoneMatch:'*'}));
 created=true;
 const direct=await get(`https://${stageHost}${path}`,'GET',{'x-gallery-origin-secret':originSecret});
 if(direct.status!==200 || createHash('sha256').update(Buffer.from(await direct.arrayBuffer())).digest('hex')!==expectedHash)
   throw Error('DIRECT_STAGING_ORIGIN_PRECHECK_FAILED');
 await writeFile(rollbackFile,JSON.stringify({resourceId:id,folder,originalGroup,originalHost:oldHost,stagingGroup,testPrefix:'__gafus_cloudru_validation__',phase:'pre-change',startedAt:new Date().toISOString()},null,2),{flag:'w',mode:0o600});
 const stageBefore=await stageMetrics();
 console.log('DEV_CDN_BASELINE_SNAPSHOT_SAVED');
 // Only gallery-dev CDN. Old origin group is left untouched for immediate restore.
 changed=true;
 update(stagingGroup,stageHost,true);
 console.log('DEV_CDN_CHANGED_TO_CLOUDRU_STAGEONLY');
 const after=info();
 if(after.group!==stagingGroup||after.host!==stageHost||after.sni!==stageHost||!after.secureKeyEnabled||!after.secretHeaderEnabled||after.cname!==before.cname)
   throw Error('DEV_CDN_UPDATE_NOT_VERIFIED');
 let cold,hot,warmUrl;
 for(let attempt=0;attempt<40;attempt++){
   const valid=makeUrl(Math.floor(Date.now()/1000)+100);
   const r=await get(valid);
   if(r.status===200){const bytes=Buffer.from(await r.arrayBuffer());
     if(createHash('sha256').update(bytes).digest('hex')!==expectedHash) throw Error('CDN_CONTENT_INTEGRITY_FAILED');
     cold={status:200,body:bytes};warmUrl=valid;break;
   }
   stats.push(r.status);await r.body?.cancel();
   await new Promise(resolve=>setTimeout(resolve,5500));
 }
 if(!cold){console.log('CDN_NO_COLD_200_HTTP_STATUSES',JSON.stringify(Object.fromEntries([...new Set(stats)].map(x=>[x,stats.filter(v=>v===x).length]))));throw Error('DEV_CDN_VALID_URL_NEVER_DELIVERED');}
 // Use the *same* signed URL as the successful cold request; record
 // connection instability without misclassifying an intermittent 504 as HIT.
 // 100 GET samples, 4 concurrent, bounded to <60 seconds for token validity.
 let hit=false;let hitHeader=null;
 const samples=[];
 let next=0;
 async function probe() {
   while(next<100){
     const ordinal=next++;
     const start=Date.now();
     try {
       const r=await get(warmUrl);
       const body=Buffer.from(await r.arrayBuffer());
       const header=['x-cache','x-cache-status','x-cdn-cache','x-cached'].map(k=>r.headers.get(k)).find(Boolean)??null;
       if(header)hitHeader=header;
       const age=Number(r.headers.get('age')??0);
       if(/\bHIT\b/i.test(header??'')||age>0)hit=true;
       samples[ordinal]={status:r.status,ms:Date.now()-start,validBody:r.status===200&&body.equals(cold.body)};
     }catch(error){samples[ordinal]={status:0,ms:Date.now()-start,error:error?.name??'unknown'};}
   }
 }
 await Promise.all(Array.from({length:4},()=>probe()));
 const counts=Object.fromEntries([...new Set(samples.map(x=>x.status))].map(status=>[status,samples.filter(x=>x.status===status).length]));
 const latencies=samples.map(x=>x.ms).sort((a,b)=>a-b);
 console.log('CDN_SAME_SIGNED_URL_100',JSON.stringify({counts,p50:latencies[49],p95:latencies[94],p99:latencies[98],bodyMatches:samples.filter(x=>x.validBody).length,failedOrdinals:samples.map((x,i)=>!x.validBody?i+1:null).filter(Boolean),hitHeader:hitHeader??'not-exposed'}));
 const stageAfter=await stageMetrics();
 console.log('STAGING_ORIGIN_REQUEST_STATS',JSON.stringify({before:stageBefore,after:stageAfter}));
 const allHundredOk = samples.every(x=>x.validBody);
 // Strong live HIT proof even when provider hides X-Cache/Age headers:
 // after a successful warm fetch, temporarily remove exactly this synthetic
 // UUID object from S3 and prove the same signed URL still delivers bytes.
 // The real Origin has no in-memory cache, so a surviving 200 is edge caching.
 if(!warmUrl)throw Error('CDN_WARM_SIGNED_URL_MISSING');
 await client.send(new DeleteObjectCommand({Bucket:bucket,Key:key}));
 created=false;
 let trulyGone=false;
 try{await client.send(new HeadObjectCommand({Bucket:bucket,Key:key}));}
 catch(error){trulyGone=error?.$metadata?.httpStatusCode===404;}
 if(!trulyGone)throw Error('STAGING_ORIGIN_OBJECT_DELETE_UNVERIFIED');
 const cacheAfterDeleteStatuses=[];
 let cacheSurvivesOriginDelete=false;
 for(let attempt=0;attempt<10;attempt++){
   const residual=await get(warmUrl);
   const cachedBytes=Buffer.from(await residual.arrayBuffer());
   cacheAfterDeleteStatuses.push(residual.status);
   if(residual.status===200 && cachedBytes.equals(cold.body)){
     cacheSurvivesOriginDelete=true;
   }
 }
 hit ||= cacheSurvivesOriginDelete;
 const expired=await get(makeUrl(Math.floor(Date.now()/1000)-5));
 const expiredStatus=expired.status;await expired.body?.cancel();
 const tamperedExpiry=Math.floor(Date.now()/1000)+90;
 const badUrl=makeUrl(tamperedExpiry).replace(/md5=[^&]+/,'md5='+('A'.repeat(22)));
 const altered=await get(badUrl);const tamperedStatus=altered.status;await altered.body?.cancel();
 const head=await get(makeUrl(Math.floor(Date.now()/1000)+95),'HEAD');const headOK=head.status===200;await head.body?.cancel();
 const partial=await get(makeUrl(Math.floor(Date.now()/1000)+95),'GET',{range:'bytes=0-3'});
 const partialContent=Buffer.from(await partial.arrayBuffer());
 const rangeOK=partial.status===206&&partialContent.equals(cold.body.subarray(0,4));
 const result={valid200:true,integrity:true,cacheHit:hit,cacheSurvivesOriginDelete,cacheAfterDeleteStatuses,hitHeader:hitHeader??'not-exposed',expiredDenied:[401,403,410].includes(expiredStatus),
  expiredStatus,tamperedDenied:[401,403,410].includes(tamperedStatus),tamperedStatus,head:headOK,range:rangeOK,observedBeforeReadyStatuses:stats.slice(-8)};
 console.log(JSON.stringify({scope:'gallery-dev',stageOrigin:'Cloud.ru staging',...result}));
 testStatus=Object.values([allHundredOk,cacheSurvivesOriginDelete,cacheAfterDeleteStatuses.every(status=>status===200),result.expiredDenied,result.tamperedDenied,headOK,rangeOK]).every(Boolean)?'pass':'partial';
 if(testStatus!=='pass')throw Error('DEV_CDN_FULL_EDGE_HIT_GATE_NOT_PASSED');
} finally {
 if(changed){
  for(let attempt=0;attempt<3;attempt++){
   try{update(originalGroup,oldHost);const x=info();restored=x.group===originalGroup&&x.host===oldHost&&!x.sni&&x.cname===before.cname&&x.secureKeyEnabled;
     if(restored)break;}catch(e){console.error('DEV_CDN_ROLLBACK_RETRY',attempt+1)}
   await new Promise(resolve=>setTimeout(resolve,1800));
  }
  console.log('DEV_CDN_ROLLBACK_VERIFIED='+String(restored));
 }
 try{cli(['cdn','cache','purge','--resource-id',id,'--path',path]);console.log('TEST_KEY_CDN_PURGED=true')}
 catch{console.log('TEST_KEY_CDN_PURGED=unverified')}
 if(created){let deleted=false;try{
  await client.send(new DeleteObjectCommand({Bucket:bucket,Key:key}));
  try{await client.send(new HeadObjectCommand({Bucket:bucket,Key:key}));}catch(e){deleted=e?.$metadata?.httpStatusCode===404;}
 }catch{}console.log('TEST_KEY_S3_DELETED='+String(deleted));if(!deleted)process.exitCode=1;}
 if(restored){try{await unlink(rollbackFile)}catch{}}
 client.destroy();
 if(changed&&!restored)process.exitCode=1;
}
console.log('DEV_CDN_SMOKE_RESULT='+testStatus);
