/** Nonproduction Chat2 new-account S3 ONLY: one synthetic browser POST, verify, cleanup. */
import {readFileSync,lstatSync,statSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {S3Client,HeadObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
import sharp from 'sharp';
import {chat2V2DirectUploadForm,chat2V2CheckOriginal} from '../../packages/cdn-upload/dist/index.js';
const root='/Users/asmtv1/Desktop/gafus-refactor';
const file='.local-pg-scratch/cloudru/chat2-s3-credentials.env';
if(process.cwd()!==root||execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim()!==root||
 execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim()!=='vite'||
 process.env.GAFUS_CHAT2_NEW_ORG_S3_SMOKE!=='owned-synthetic-only')throw Error('SCOPE');
if(lstatSync(file).isSymbolicLink()||(statSync(file).mode&0o777)!==0o600)throw Error('CREDENTIAL_SCOPE');
const c=Object.fromEntries(readFileSync(file,'utf8').trim().split('\n').map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1)]}));
const bucket='gafus-chat2-media-2026';
if(c.CHAT2_S3_BUCKET!==bucket||c.CHAT2_S3_ENDPOINT!=='https://s3.cloud.ru'||
 c.CHAT2_S3_REGION!=='ru-central-1'||
 !c.CHAT2_S3_ACCESS_KEY_ID.startsWith('9d939e53-19e0-43df-b141-9d89b7366ca8:')||
 !/^[A-Za-z0-9_-]{32}$/.test(c.CHAT2_S3_SECRET_ACCESS_KEY))throw Error('NEW_ORG_CREDENTIAL_GUARD');
const id=randomUUID();
const key=`chat2/qa_chat/qa_actor/${id}/incoming/source.jpg`;
const bytes=await sharp({create:{width:64,height:64,channels:3,background:'#668855'}}).jpeg().toBuffer();
const mime='image/jpeg';
process.env.CHAT2_V2_MEDIA_ENABLED='true';
process.env.CHAT2_S3_ENDPOINT=c.CHAT2_S3_ENDPOINT;
process.env.CHAT2_S3_BUCKET=c.CHAT2_S3_BUCKET;
process.env.CHAT2_S3_ACCESS_KEY_ID=c.CHAT2_S3_ACCESS_KEY_ID;
process.env.CHAT2_S3_SECRET_ACCESS_KEY=c.CHAT2_S3_SECRET_ACCESS_KEY;
const s3=new S3Client({endpoint:c.CHAT2_S3_ENDPOINT,region:c.CHAT2_S3_REGION,forcePathStyle:true,
 requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED',maxAttempts:1,
 credentials:{accessKeyId:c.CHAT2_S3_ACCESS_KEY_ID,secretAccessKey:c.CHAT2_S3_SECRET_ACCESS_KEY}});
let uploadStatus=null,verified=false,removed=false,cleanupError=false;
try{
 const form=await chat2V2DirectUploadForm(key,mime,bytes.length);
 const url=new URL(form.url);
 if(url.protocol!=='https:'||url.hostname!=='s3.cloud.ru'||!url.pathname.endsWith('/'+bucket+'/') && url.pathname!=='/'+bucket)throw Error('UNEXPECTED_POST_HOST_OR_PATH');
 const body=new FormData();
 for(const [k,v] of Object.entries(form.fields))body.append(k,v);
 body.append('file',new Blob([bytes],{type:mime}),'synthetic.jpg');
 const response=await fetch(url,{method:'POST',headers:{Origin:'http://localhost:5173'},body,redirect:'error',signal:AbortSignal.timeout(15000)});
 uploadStatus=response.status;
 await response.body?.cancel();
 if(![200,201,204].includes(uploadStatus))throw Error('POST_STATUS_'+uploadStatus);
 const remote=await chat2V2CheckOriginal(key,mime,bytes.length);
 verified=remote.bytes===bytes.length&&remote.mime===mime;
 if(!verified)throw Error('POST_VERIFY_MISMATCH');
} catch(e){console.log(JSON.stringify({phase:'post_upload',status:uploadStatus,error:e instanceof Error?e.message.slice(0,120):'unknown'}));process.exitCode=2}
finally{
 try{
  await s3.send(new DeleteObjectCommand({Bucket:bucket,Key:key}),{abortSignal:AbortSignal.timeout(8500)});
  try{await s3.send(new HeadObjectCommand({Bucket:bucket,Key:key}),{abortSignal:AbortSignal.timeout(8500)})}
  catch(e){if(e.$metadata?.httpStatusCode===404)removed=true}
 }catch{cleanupError=true}
 s3.destroy();
 for(const name of ['CHAT2_S3_ACCESS_KEY_ID','CHAT2_S3_SECRET_ACCESS_KEY'])delete process.env[name];
 console.log(JSON.stringify({test:'new_org_chat2_browser_s3_post',bucket,uniqueSynthetic:true,postStatus:uploadStatus,sizeAndMimeVerified:verified,deletedAndHead404:removed,cleanupError,unrelatedObjectsAffected:false}));
 if(!removed||!verified)process.exitCode=6;
}
