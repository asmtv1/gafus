#!/usr/bin/env node
/** Immutable encrypted-at-rest PRIVATE S3 archive for sealed Vite maps.
 *
 * This is NOT a public CDN upload and does not call Uptrace or expose
 * sources/symbols in diagnostics. All writes require verified CI and an
 * explicitly approved deployment environment. No credentials in CLI args.
 * S3 policy must independently deny anonymous GetObject/ListBucket.
 */
import {createHash} from 'node:crypto';
import {readFile,lstat,realpath,writeFile} from 'node:fs/promises';
import {join,resolve,relative,sep,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {S3Client,PutObjectCommand,HeadObjectCommand,GetObjectCommand} from '@aws-sdk/client-s3';

const sha=b=>createHash('sha256').update(b).digest('hex');
const HEX=/^[a-f0-9]{64}$/i;
const RELEASE=/^[a-f0-9]{40}$/i;
const BUILD=/^[a-zA-Z0-9_.-]{8,40}$/;
const SERVICES=new Set(['gafus-web','gafus-admin-panel','gafus-trainer-panel']);
const MAX_MAP=64*1024*1024,MAX_COUNT=500;
const allowedRelative=(p)=>typeof p==='string'&&p.endsWith('.js.map')&&
  p.length<=256&&!isAbsolute(p)&&!p.startsWith('./')&&
  !p.split('/').some(part=>part===''||part==='.'||part==='..'||part.startsWith('.'))&&
  /^[a-zA-Z0-9_.\-/]+$/.test(p);
const below=(root,path)=>{
  const rel=relative(root,path);
  return !!rel&&!rel.startsWith('..'+sep)&&rel!=='..'&&!isAbsolute(rel);
};
const fail=(code)=>{throw Error(code);};

export async function planWebSymbolUpload(privateDir){
 const root=await realpath(resolve(privateDir));
 const st=await lstat(root);
 if(!st.isDirectory()||(st.mode&0o077)!==0)
   fail('PRIVATE_MAP_DIRECTORY_INSECURE');
 const manifestFile=join(root,'manifest.json');
 const fStat=await lstat(manifestFile);
 if(!fStat.isFile()||fStat.isSymbolicLink()||(fStat.mode&0o077)!==0||
    fStat.size<30||fStat.size>1024*1024)
   fail('PRIVATE_MANIFEST_INVALID');
 const content=await readFile(manifestFile);
 let manifest;
 try{manifest=JSON.parse(content.toString('utf8'));}
 catch{fail('PRIVATE_MANIFEST_INVALID');}
 if(manifest.schemaVersion!==1||!SERVICES.has(manifest.service)||
   !RELEASE.test(manifest.releaseSha??'')||
   !BUILD.test(manifest.build??'')||
   !Array.isArray(manifest.artifacts)||!manifest.artifacts.length||
   manifest.artifacts.length>MAX_COUNT)
   fail('PRIVATE_MANIFEST_SCHEMA_INVALID');
 const records=[];
 let total=0;
 for(const record of manifest.artifacts){
   if(!allowedRelative(record.privateMap)||!HEX.test(record.mapSha256??'')||
     !HEX.test(record.assetSha256??'')||
     !Number.isSafeInteger(record.mapBytes)||record.mapBytes<2||
     record.mapBytes>MAX_MAP||record.asset!==record.privateMap.slice(0,-4))
     fail('PRIVATE_MAP_RECORD_INVALID');
   const full=resolve(root,record.privateMap);
   if(!below(root,full))fail('PRIVATE_MAP_PATH_FORBIDDEN');
   const canonical=await realpath(full);
   if(!below(root,canonical)||canonical!==full)
     fail('PRIVATE_MAP_SYMLINK_FORBIDDEN');
   const st=await lstat(full);
   if(!st.isFile()||(st.mode&0o077)!==0||st.size!==record.mapBytes)
     fail('PRIVATE_MAP_FILE_INSECURE');
   const bytes=await readFile(full);
   if(sha(bytes)!==record.mapSha256.toLowerCase())
     fail('PRIVATE_MAP_SHA_MISMATCH');
   try{
     const parsed=JSON.parse(bytes.toString());
     if(parsed.version!==3||typeof parsed.mappings!=='string')
       fail('PRIVATE_MAP_V3_REQUIRED');
   }catch{fail('PRIVATE_MAP_JSON_INVALID');}
   records.push({file:full,path:record.privateMap,size:bytes.length,
     sha256:sha(bytes),assetSha256:record.assetSha256.toLowerCase()});
   total+=bytes.length;
 }
 if(new Set(records.map(x=>x.path)).size!==records.length)
   fail('PRIVATE_MAP_DUPLICATES');
 return {root,manifest,manifestBytes:content,manifestHash:sha(content),
   records,total};
}

export function verifyWebSymbolUploadConfig(plan,env=process.env){
 const environment=env.GAFUS_TELEMETRY_ENVIRONMENT;
 if(environment!=='preview'&&environment!=='production')
   fail('SYMBOLS_ENV_NOT_APPROVED');
 if(environment==='production'&&env.GAFUS_WEB_SYMBOLS_PRODUCTION_APPROVED!=='true')
   fail('SYMBOLS_PRODUCTION_NOT_APPROVED');
 if(environment==='preview'&&env.GAFUS_WEB_SYMBOLS_PREVIEW_APPROVED!=='true')
   fail('SYMBOLS_PREVIEW_NOT_APPROVED');
 if(env.CI!=='true'||env.GAFUS_WEB_SYMBOLS_VERIFIED_BUILD!=='true')
   fail('SYMBOLS_CI_RELEASE_NOT_VERIFIED');
 if(env.GAFUS_RELEASE_SHA!==plan.manifest.releaseSha||
   env.VITE_GAFUS_BUILD_ID!==plan.manifest.build)
   fail('SYMBOLS_RELEASE_VERSION_MISMATCH');
 const bucket=env.GAFUS_WEB_SYMBOLS_BUCKET??'';
 const endpoint=env.GAFUS_WEB_SYMBOLS_S3_ENDPOINT??'';
 const accessKey=env.GAFUS_WEB_SYMBOLS_ACCESS_KEY??'';
 const secretKey=env.GAFUS_WEB_SYMBOLS_SECRET_KEY??'';
 if(!/^[a-z0-9][a-z0-9.-]{4,58}$/.test(bucket)||
   bucket.includes('public')||bucket.startsWith('gafus-feed')||
   endpoint!=='https://s3.cloud.ru'||accessKey.length<12||secretKey.length<12)
   fail('SYMBOLS_PRIVATE_BUCKET_CONFIG_INVALID');
 return {environment,bucket,endpoint,accessKey,secretKey};
}

async function verifyUpload(client,bucket,key,bytes,mime){
 const digest=sha(bytes);
 let written=false;
 try{
  await client.send(new PutObjectCommand({
   Bucket:bucket,Key:key,Body:bytes,ContentType:mime,
   ContentLength:bytes.length,CacheControl:'private, max-age=31536000, immutable',
   Metadata:{sha256:digest},IfNoneMatch:'*',
  }));
  written=true;
 }catch(error){
  if(!(error&&typeof error==='object'&&
       (error.$metadata?.httpStatusCode===412||error.name==='PreconditionFailed')))
    throw error;
 }
 const head=await client.send(new HeadObjectCommand({Bucket:bucket,Key:key}));
 if(head.ContentLength!==bytes.length||head.Metadata?.sha256!==digest||
   head.ContentType!==mime)fail('SYMBOLS_HEAD_CHECK_FAILED');
 const get=await client.send(new GetObjectCommand({Bucket:bucket,Key:key}));
 const read=Buffer.from(await get.Body.transformToByteArray());
 if(sha(read)!==digest||read.length!==bytes.length)
   fail('SYMBOLS_GET_READBACK_FAILED');
 return {key,sha256:digest,verified:true,written};
}
export async function uploadPrivateWebSymbols(client,bucket,plan,environment){
 const prefix='symbols/'+environment+'/web/'+plan.manifest.service+'/'+
   plan.manifest.releaseSha+'/'+plan.manifest.build+'/';
 const receipts=[];
 for(const record of plan.records){
  const bytes=await readFile(record.file);
  if(sha(bytes)!==record.sha256)fail('SYMBOLS_CHANGED_DURING_UPLOAD');
  receipts.push(await verifyUpload(client,bucket,prefix+record.path,bytes,'application/json'));
 }
 receipts.push(await verifyUpload(client,bucket,prefix+'manifest.json',
   plan.manifestBytes,'application/json'));
 return receipts;
}
async function main(){
 if(process.argv.length!==4||process.argv[2]!=='--directory')
   fail('SYMBOLS_USAGE');
 const plan=await planWebSymbolUpload(process.argv[3]);
 if(process.env.GAFUS_WEB_SYMBOLS_EXECUTE!=='true'){
  console.log(JSON.stringify({state:'PRIVATE_WEB_SYMBOLS_DRY_RUN',service:plan.manifest.service,
   releaseSha:plan.manifest.releaseSha,maps:plan.records.length,bytes:plan.total}));
  return;
 }
 const settings=verifyWebSymbolUploadConfig(plan);
 const client=new S3Client({endpoint:settings.endpoint,region:'ru-central-1',
   forcePathStyle:true,maxAttempts:2,
   credentials:{accessKeyId:settings.accessKey,secretAccessKey:settings.secretKey}});
 try{
  const receipt=await uploadPrivateWebSymbols(client,settings.bucket,plan,settings.environment);
  const record={
   state:'PRIVATE_WEB_SYMBOLS_UPLOAD_VERIFIED',environment:settings.environment,
   service:plan.manifest.service,releaseSha:plan.manifest.releaseSha,build:plan.manifest.build,
   manifestHash:plan.manifestHash,createdAt:new Date().toISOString(),artifacts:receipt,
  };
  const path=join(plan.root,'private-web-symbol-upload-receipt.json');
  await writeFile(path,JSON.stringify(record,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify({state:record.state,service:record.service,
   files:receipt.length,manifestHash:record.manifestHash}));
 }finally{client.destroy();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(()=>{console.error('PRIVATE_WEB_SYMBOLS_UPLOAD_BLOCKED');process.exitCode=4;});
