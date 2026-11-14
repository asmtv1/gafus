#!/usr/bin/env node
/**
 * Explicit, manual acceptance gate for the dedicated PRIVATE Cloud.ru source-map bucket.
 * The only object written is a small non-sensitive random synthetic probe, removed even
 * if anonymous access, HEAD, GET or metadata validation fails. No source maps are sent.
 */
import {randomBytes,createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {
 S3Client,PutObjectCommand,HeadObjectCommand,GetObjectCommand,DeleteObjectCommand
} from '@aws-sdk/client-s3';

export const BUCKET='gafus-symbols-private';
export const ENDPOINT='https://s3.cloud.ru';
const REGION='ru-central-1';
const sha = bytes=>createHash('sha256').update(bytes).digest('hex');
const must=(yes,code)=>{if(!yes)throw Error('PRIVATE_SYMBOLS_S3_'+code);};
export function probeConfig(env=process.env){
 must(env.CI==='true','CI_REQUIRED');
 must(env.GAFUS_TELEMETRY_PRODUCTION_APPROVED==='false','PRODUCTION_MUST_REMAIN_OFF');
 must(env.GAFUS_SYMBOLS_PROBE_ALLOWED==='true','MANUAL_PROBE_APPROVAL_REQUIRED');
 must(env.SYMBOLS_S3_PROBE_CONFIRMATION==='gafus-symbols-private-only','CONFIRMATION_REQUIRED');
 must(env.SYMBOLS_S3_BUCKET===BUCKET,'BUCKET_MISMATCH');
 must(env.SYMBOLS_S3_ENDPOINT===ENDPOINT,'ENDPOINT_MISMATCH');
 must(env.SYMBOLS_S3_REGION===REGION,'REGION_MISMATCH');
 must(/^[0-9a-f-]{36}:[A-Za-z0-9_-]{20,70}$/i.test(env.SYMBOLS_S3_ACCESS_KEY||''),'ACCESS_KEY_MISSING');
 must(typeof env.SYMBOLS_S3_SECRET_KEY==='string'&&
  env.SYMBOLS_S3_SECRET_KEY.length>=20&&!/[\r\n]/.test(env.SYMBOLS_S3_SECRET_KEY),
  'SECRET_KEY_MISSING');
 return {bucket:BUCKET,endpoint:ENDPOINT,region:REGION,
  credentials:{accessKeyId:env.SYMBOLS_S3_ACCESS_KEY,secretAccessKey:env.SYMBOLS_S3_SECRET_KEY}};
}
async function isAnonymousDenied(fetcher,url){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),8000);
 try{
  const response=await fetcher(url,{signal:controller.signal,redirect:'manual',
   headers:{'cache-control':'no-store'}});
  // Strict: a 2xx object or redirect can expose source files. Unexpected
  // statuses (e.g. 429/5xx) are not accepted as evidence of privacy.
  must([400,401,403,404].includes(response.status),'ANONYMOUS_READ_NOT_PROVEN_PRIVATE');
  return response.status;
 }finally{clearTimeout(timeout);}
}
export async function runPrivateSymbolsProbe(client,{
 fetcher=fetch,random=()=>randomBytes(16).toString('hex'),now=new Date()
}={}){
 const key='symbols-privacy-smoke/'+now.toISOString().slice(0,10)+'/'+random()+'.json';
 must(/^symbols-privacy-smoke\/\d{4}-\d{2}-\d{2}\/[0-9a-f]{32}\.json$/.test(key),
   'PROBE_KEY_INVALID');
 const body=Buffer.from(JSON.stringify({kind:'gafus-private-symbols-s3-probe',
  privateSourceMaps:false,nonce:random()})+'\n','utf8');
 const digest=sha(body);
 let written=false;
 try{
  await client.send(new PutObjectCommand({Bucket:BUCKET,Key:key,Body:body,
   ContentLength:body.length,ContentType:'application/json',
   CacheControl:'private, no-store',Metadata:{sha256:digest},IfNoneMatch:'*'}));
  written=true;
  const head=await client.send(new HeadObjectCommand({Bucket:BUCKET,Key:key}));
  must(Number(head.ContentLength)===body.length&&head.Metadata?.sha256===digest,
   'HEAD_MISMATCH');
  const object=await client.send(new GetObjectCommand({Bucket:BUCKET,Key:key}));
  const content=Buffer.from(await object.Body.transformToByteArray());
  must(content.length===body.length&&sha(content)===digest,'READBACK_MISMATCH');
  const objectStatus=await isAnonymousDenied(fetcher,ENDPOINT+'/'+BUCKET+'/'+key);
  const listStatus=await isAnonymousDenied(fetcher,ENDPOINT+'/'+BUCKET+'?list-type=2');
  return {status:'PASS',signedWrite:true,signedHead:true,signedReadback:true,
   anonymousObjectStatus:objectStatus,anonymousListStatus:listStatus,
   sha256Verified:true,objectsPersisted:0};
 }finally{
  if(written){
   // A successful DELETE response alone does not prove that the probe object
   // disappeared. Require a signed HEAD 404 (versioning is disabled).
   await client.send(new DeleteObjectCommand({Bucket:BUCKET,Key:key}));
   try{
    await client.send(new HeadObjectCommand({Bucket:BUCKET,Key:key}));
    must(false,'CLEANUP_NOT_CONFIRMED');
   }catch(error){
    if(error?.message==='PRIVATE_SYMBOLS_S3_CLEANUP_NOT_CONFIRMED'||
      !(error?.$metadata?.httpStatusCode===404||
        error?.name==='NotFound'||error?.name==='NoSuchKey'))
      must(false,'CLEANUP_NOT_CONFIRMED');
   }
  }
 }
}
async function main(){
 const cfg=probeConfig();
 const client=new S3Client({endpoint:cfg.endpoint,region:cfg.region,forcePathStyle:true,
  credentials:cfg.credentials,maxAttempts:2});
 try{
  const result=await runPrivateSymbolsProbe(client);
  console.log(JSON.stringify(result));
 }finally{client.destroy();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(e=>{
  // Deliberately never log raw SDK errors, request URLs or credentials.
  console.error(/^PRIVATE_SYMBOLS_S3_[A-Z_]+$/.test(e?.message||'')?e.message:
   'PRIVATE_SYMBOLS_S3_PROBE_FAILED');
  process.exitCode=1;
 });
