/**
 * Safe, bounded, chat-bucket-only Cloud.ru S3 acceptance smoke.
 * Writes exactly one unique owned object and deletes it in finally.
 * Checks anonymous GET/HEAD/Range, CORS, LIST/PUT denial and deletion.
 * All other buckets and jobs are out of scope.
 */
import {execFileSync} from 'node:child_process';
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {Agent,request} from 'node:https';
import {randomUUID} from 'node:crypto';
import {
  S3Client,HeadBucketCommand,PutObjectCommand,GetObjectCommand,
  HeadObjectCommand,DeleteObjectCommand,GetBucketPolicyCommand,GetBucketCorsCommand,
} from '@aws-sdk/client-s3';
import {NodeHttpHandler} from '@smithy/node-http-handler';

const ROOT='/Users/asmtv1/Desktop/gafus-refactor';
const BUCKET='gafus-chat-public';
const expectedProject='4c590727-4133-475b-a4bc-564c90a9e686';
if(realpathSync(process.cwd())!==ROOT ||
 execFileSync('git',['-C',ROOT,'rev-parse','--show-toplevel'],{encoding:'utf8'}).trim()!==ROOT ||
 execFileSync('git',['-C',ROOT,'branch','--show-current'],{encoding:'utf8'}).trim()!=='vite')
  throw Error('PROJECT_SCOPE_NOT_VERIFIED');
if(process.env.GAFUS_CHAT_S3_SMOKE_CONFIRM!=='own-test-object-only')
  throw Error('TEST_OBJECT_MUTATION_REQUIRES_EXPLICIT_CONFIRM');
const credentialsFile=ROOT+'/.local-pg-scratch/cloudru/refactor-api-credentials.json';
if(lstatSync(credentialsFile).isSymbolicLink() || !realpathSync(credentialsFile).startsWith(ROOT+'/'))
  throw Error('CREDENTIAL_PATH_INVALID');
const c=JSON.parse(readFileSync(credentialsFile,'utf8'));
if(c.project_id!==expectedProject||c.service_account!=='gafus-refactor-api')
  throw Error('WRONG_PROJECT_OR_ACCOUNT');
const iface=execFileSync('ipconfig',['getifaddr','en0'],{encoding:'utf8'}).trim();
if(!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(iface))throw Error('MISSING_EN0_IPV4');
const publicUrl='https://gafus-chat-public.s3.cloud.ru';
const key='__chat_s3_acceptance__/'+randomUUID()+'.mp4';
const data=Buffer.from('GAFUS Chat 2 public S3 test video-range synthetic bytes '.repeat(32));
const s3=new S3Client({endpoint:'https://s3.cloud.ru',region:'ru-central-1',forcePathStyle:true,
 credentials:{accessKeyId:c.tenant_id+':'+c.key_id,secretAccessKey:c.key_secret},maxAttempts:1,
 requestHandler:new NodeHttpHandler({httpsAgent:new Agent({localAddress:iface,family:4,keepAlive:false}),connectionTimeout:4500,requestTimeout:9000})});
async function anonymous(method,url,headers={},body) {
 const target=new URL(url);
 return new Promise((resolve,reject)=>{
   const req=request({hostname:target.hostname,path:target.pathname+target.search,method,headers,localAddress:iface,family:4,timeout:8000},res=>{
     const chunks=[];let count=0;
     res.on('data',chunk=>{count+=chunk.length;if(count<=128_000)chunks.push(chunk)});
     res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,bytes:Buffer.concat(chunks)}));
   });
   req.on('error',reject);req.on('timeout',()=>req.destroy(Error('ANONYMOUS_HTTPS_TIMEOUT')));
   req.end(body);
 });
}
const results={scope:BUCKET};
let created=false;let cleaned=false;
try{
  const h=await s3.send(new HeadBucketCommand({Bucket:BUCKET}));
  if(h.$metadata.httpStatusCode!==200)throw Error('BUCKET_HEAD_FAILED');
  const policy=JSON.parse((await s3.send(new GetBucketPolicyCommand({Bucket:BUCKET}))).Policy);
  const statements=policy.Statement;
  if(statements.length!==1 || statements[0].Effect!=='Allow' ||
     statements[0].Principal!=='*' || statements[0].Action!=='s3:GetObject' ||
     statements[0].Resource!=='arn:aws:s3:::gafus-chat-public/*')
    throw Error('BUCKET_PUBLIC_POLICY_UNEXPECTED');
  const cors=(await s3.send(new GetBucketCorsCommand({Bucket:BUCKET}))).CORSRules;
  if(!cors?.some(x=>x.ID==='gafus-chat-v1'))throw Error('MISSING_CHAT_CORS');
  results.bucketPolicy='verified';results.cors='verified';
  const uploaded=await s3.send(new PutObjectCommand({Bucket:BUCKET,Key:key,Body:data,ContentType:'video/mp4',CacheControl:'public,max-age=60',IfNoneMatch:'*'}));
  created=true;results.signedPut=uploaded.$metadata.httpStatusCode;
  if(![200,201].includes(results.signedPut))throw Error('SIGNED_PUT_STATUS_UNEXPECTED');
  const signed=await s3.send(new GetObjectCommand({Bucket:BUCKET,Key:key}));
  results.signedGet=signed.$metadata.httpStatusCode;
  if(!Buffer.from(await signed.Body.transformToByteArray()).equals(data))throw Error('SIGNED_GET_MISMATCH');
  const url=publicUrl+'/'+key;
  const get=await anonymous('GET',url);
  results.anonGet=get.status;
  if(get.status!==200||!get.bytes.equals(data))throw Error('ANONYMOUS_GET_MISMATCH');
  const head=await anonymous('HEAD',url);
  results.anonHead=head.status;
  if(head.status!==200)throw Error('ANONYMOUS_HEAD_FAILED');
  const range=await anonymous('GET',url,{Range:'bytes=0-31'});
  results.anonRange=range.status;
  if(range.status!==206||!range.bytes.equals(data.subarray(0,32))||!String(range.headers['content-range']).startsWith('bytes 0-31/'))
    throw Error('ANONYMOUS_RANGE_FAILED');
  const opt=await anonymous('OPTIONS',url,{
    Origin:'https://gafus.ru','Access-Control-Request-Method':'GET',
    'Access-Control-Request-Headers':'range'});
  results.corsPreflight=opt.status;
  results.corsOrigin=opt.headers['access-control-allow-origin']??null;
  if(![200,204].includes(opt.status)||opt.headers['access-control-allow-origin']!=='https://gafus.ru')
    throw Error('CORS_PREFLIGHT_NOT_WORKING');
  const list=await anonymous('GET',publicUrl+'/?list-type=2');
  results.anonList=list.status;
  if(list.status!==403)throw Error('ANONYMOUS_LIST_NOT_DENIED');
  const denied=await anonymous('PUT',publicUrl+'/__chat_s3_acceptance__/anonymous-write-block-'+randomUUID()+'.txt',
    {'Content-Type':'text/plain','Content-Length':'4'},Buffer.from('fail'));
  results.anonPut=denied.status;
  if(denied.status!==403)throw Error('ANONYMOUS_WRITE_NOT_DENIED');
} finally {
  if(created){
    try{
      await s3.send(new DeleteObjectCommand({Bucket:BUCKET,Key:key}));
      try {await s3.send(new HeadObjectCommand({Bucket:BUCKET,Key:key}));}
      catch(e){cleaned=e.$metadata?.httpStatusCode===404;}
    }catch(e){results.cleanupError=e.name;}
  }
  results.deleted=cleaned;
  console.log(JSON.stringify(results,null,2));
  s3.destroy();
  if(created&&!cleaned)process.exitCode=6;
}
