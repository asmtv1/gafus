#!/usr/bin/env node
/** Immutable source map export to a separately configured PRIVATE S3 bucket.
 * No public CDN, no ACL public-read. Disabled without an approved native CI job.
 * Never print source maps, DSN, presigned URL, S3 keys or credentials. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {S3Client,PutObjectCommand,HeadObjectCommand,GetObjectCommand} from '@aws-sdk/client-s3';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SOURCE=/^[a-f0-9]{40}$/i;
const NAME=/^[a-f0-9]{64}\.map$/;
const BUCKET=/^[a-z0-9][a-z0-9.-]{2,62}$/;
const fail=code=>{throw Error('SYMBOLS_'+code);};
export function planPrivateSymbolUpload(directory){
  const root=path.resolve(directory);
  if(!fs.existsSync(root))fail('PRIVATE_DIR_MISSING');
  const rootInfo=fs.lstatSync(root);
  if(!rootInfo.isDirectory()||rootInfo.isSymbolicLink()||
     (rootInfo.mode&0o077)!==0||rootInfo.uid!==process.getuid())
    fail('PRIVATE_DIR_INSECURE');
  const manifestFile=path.join(root,'private-symbol-manifest.json');
  if(!fs.existsSync(manifestFile))fail('MANIFEST_MISSING');
  const manifestInfo=fs.lstatSync(manifestFile);
  if(!manifestInfo.isFile()||manifestInfo.isSymbolicLink()||
     (manifestInfo.mode&0o077)!==0||manifestInfo.uid!==process.getuid())
    fail('PRIVATE_MANIFEST_INSECURE');
  const bytes=fs.readFileSync(manifestFile);
  if(bytes.length<200||bytes.length>100_000)fail('MANIFEST_SIZE_INVALID');
  let m;try{m=JSON.parse(bytes.toString('utf8'));}catch{fail('MANIFEST_INVALID_JSON');}
  if(m.schemaVersion!==1||m.private!==true||m.retentionClass!=='release-symbols'||
     !['preview','production'].includes(m.environment)||!['ios','android'].includes(m.platform)||
     m.runtimeVersion!=='1.8.0'||!UUID.test(m.updateId)||!SOURCE.test(m.sourceSha)||
     !Number.isSafeInteger(m.revision)||m.revision<1||
     !Array.isArray(m.maps)||m.maps.length<1||m.maps.length>8)fail('IDENTITY_INVALID');
  const prefix=`symbols/${m.environment}/gafus/${m.runtimeVersion}/${m.platform}/${m.updateId}`;
  const records=[];
  const used=new Set();
  for(const item of m.maps){
    if(typeof item.filename!=='string'||!NAME.test(item.filename)||
       item.filename!==`${item.sha256}.map`||used.has(item.filename)||
       !Number.isSafeInteger(item.sizeBytes)||item.sizeBytes<1000||item.sizeBytes>50*1024*1024)
      fail('MAP_RECORD_INVALID');
    used.add(item.filename);
    const file=path.join(root,item.filename);
    if(!fs.existsSync(file))fail('MAP_MISSING');
    const mapStat=fs.lstatSync(file);
    if(!mapStat.isFile()||mapStat.isSymbolicLink()||
       (mapStat.mode&0o077)!==0||mapStat.uid!==process.getuid())
      fail('PRIVATE_MAP_INSECURE');
    const read=fs.readFileSync(file);
    if(read.length!==item.sizeBytes||sha(read)!==item.sha256)fail('MAP_CHANGED');
    records.push({key:`${prefix}/${item.filename}`,file,sha256:item.sha256,
      size:read.length,mime:'application/json'});
  }
  records.push({key:`${prefix}/private-symbol-manifest.json`,file:manifestFile,
    sha256:sha(bytes),size:bytes.length,mime:'application/json'});
  return {environment:m.environment,platform:m.platform,updateId:m.updateId,runtime:m.runtimeVersion,
    sourceSha:m.sourceSha,prefix,records};
}
export function verifyConfig(plan,env){
  const bucket=env.SYMBOLS_S3_BUCKET??'';
  if(!BUCKET.test(bucket)||bucket===env.OTA_S3_BUCKET||bucket===env.FEED_S3_BUCKET)fail('PRIVATE_BUCKET_REQUIRED');
  const endpoint=env.SYMBOLS_S3_ENDPOINT??'';
  let url;try{url=new URL(endpoint);}catch{fail('ENDPOINT_INVALID');}
  // Cloud.ru is the only approved destination. An arbitrary HTTPS host
  // would receive both private symbols and the S3 access-key signature.
  if(endpoint!=='https://s3.cloud.ru'||url.username||url.password||url.search||url.hash)
    fail('ENDPOINT_UNTRUSTED');
  if(!env.SYMBOLS_S3_ACCESS_KEY||!env.SYMBOLS_S3_SECRET_KEY)fail('CREDENTIALS_MISSING');
  if(env.CI!=='true'||env.SYMBOLS_NATIVE_RELEASE_VERIFIED!=='true')fail('VERIFIED_CI_REQUIRED');
  if(plan.environment==='preview'&&env.GAFUS_SYMBOLS_PREVIEW_APPROVED!=='true')fail('PREVIEW_APPROVAL_REQUIRED');
  if(plan.environment==='production'&&env.GAFUS_SYMBOLS_PRODUCTION_APPROVED!=='true')fail('PRODUCTION_APPROVAL_REQUIRED');
  return {bucket,endpoint};
}
export async function uploadPrivateSymbols(client,bucket,plan){
  const report=[];
  for(const record of plan.records){
    const bytes=fs.readFileSync(record.file);
    if(sha(bytes)!==record.sha256)fail('CHANGED_DURING_UPLOAD');
    let written=false;
    try{
      await client.send(new PutObjectCommand({Bucket:bucket,Key:record.key,Body:bytes,
        ContentType:record.mime,ContentLength:bytes.length,
        CacheControl:'private, max-age=31536000, immutable',
        Metadata:{sha256:record.sha256},IfNoneMatch:'*'}));
      written=true;
    }catch(e){
      if(!(e&&typeof e==='object'&&(e.$metadata?.httpStatusCode===412||e.name==='PreconditionFailed')))throw e;
    }
    const head=await client.send(new HeadObjectCommand({Bucket:bucket,Key:record.key}));
    if(Number(head.ContentLength)!==record.size||head.Metadata?.sha256!==record.sha256||head.ContentType!==record.mime)
      fail('S3_HEAD_MISMATCH');
    const downloaded=await client.send(new GetObjectCommand({Bucket:bucket,Key:record.key}));
    const read=Buffer.from(await downloaded.Body.transformToByteArray());
    if(read.length!==record.size||sha(read)!==record.sha256)fail('S3_READBACK_MISMATCH');
    report.push({key:record.key,sha256:record.sha256,size:record.size,written,verified:true});
  }
  return report;
}
async function main(){
  if(process.argv.length!==4||process.argv[2]!=='--directory')fail('USAGE_DIRECTORY_REQUIRED');
  const root=path.resolve(process.argv[3]);
  const plan=planPrivateSymbolUpload(root);
  if(process.env.SYMBOLS_UPLOAD_EXECUTE!=='1'){
    console.log(JSON.stringify({state:'PRIVATE_SYMBOLS_DRY_RUN_NOT_UPLOADED',environment:plan.environment,
      platform:plan.platform,updateId:plan.updateId,count:plan.records.length,
      bytes:plan.records.reduce((n,i)=>n+i.size,0)}));return;
  }
  const config=verifyConfig(plan,process.env);
  const client=new S3Client({endpoint:config.endpoint,region:process.env.SYMBOLS_S3_REGION||'ru-central-1',
    forcePathStyle:true,maxAttempts:2,credentials:{accessKeyId:process.env.SYMBOLS_S3_ACCESS_KEY,
      secretAccessKey:process.env.SYMBOLS_S3_SECRET_KEY}});
  try{
    const report=await uploadPrivateSymbols(client,config.bucket,plan);
    const receipt={state:'IMMUTABLE_PRIVATE_SYMBOLS_VERIFIED',environment:plan.environment,
      platform:plan.platform,runtimeVersion:plan.runtime,updateId:plan.updateId,sourceSha:plan.sourceSha,
      manifestSha256:report.at(-1).sha256, verifiedAt:new Date().toISOString(),report};
    const evidence=path.join(root,'private-symbol-delivery-evidence.json');
    fs.writeFileSync(evidence,JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
    console.log(JSON.stringify({state:receipt.state,platform:receipt.platform,
      updateId:receipt.updateId,count:report.length,manifestSha256:receipt.manifestSha256}));
  }finally{client.destroy();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exitCode=1;});
}
