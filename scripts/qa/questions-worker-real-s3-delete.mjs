/** Real local MinIO acceptance: Questions DELETE belongs to existing Worker.
 * Fixed local-only S3 buckets and preapproved loopback ports, no Cloud access.
 */
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {createServer} from 'node:net';
import {createRequire} from 'node:module';
import {existsSync,mkdtempSync,openSync,closeSync,rmSync,mkdirSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const work=join(root,'.gafus-refactoring','architecture-qa-20261103-local');
const bin=join(work,'minio-source','bin','minio');
assert(existsSync(bin),'ISOLATED_PINNED_MINIO_REQUIRED');
const space=spawnSync('df',['-k',root],{encoding:'utf8'});
assert.equal(space.status,0);
assert(Number(space.stdout.trim().split('\n').at(-1).trim().split(/\s+/)[3])>7*1024*1024,
  'KEEP_7_GIB_FREE');
const req=createRequire(join(root,'packages/cdn-upload/package.json'));
const {S3Client,CreateBucketCommand,HeadObjectCommand,PutObjectCommand}=req('@aws-sdk/client-s3');
const {questionsV2CleanupKeys,questionsV2Delete}=await import(join(root,'packages/cdn-upload/dist/index.js'));
assert.equal(typeof questionsV2Delete,'function');
const available=async port=>new Promise(resolve=>{
 const server=createServer();
 server.once('error',()=>resolve(false));
 server.listen(port,'127.0.0.1',()=>server.close(()=>resolve(true)));
});
const port=(await Promise.all([9501,9500,9000].map(async port=>
  await available(port)?port:null))).find(Boolean);
assert(port,'NO_FREE_ALLOWED_ISOLATED_QUESTIONS_S3_PORT');
const scratch=mkdtempSync(join(work,'questions-worker-delete-'));
const data=join(scratch,'objects');mkdirSync(data);
const log=openSync(join(scratch,'minio.log'),'a');
const bucket='gafus-refactor-questions-test';
const accessKeyId='qa'+randomBytes(10).toString('hex');
const secretAccessKey=randomBytes(28).toString('hex');
const origin=`http://127.0.0.1:${port}`;
let processRef,client;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
 const consolePort=await new Promise((resolve,reject)=>{
  const server=createServer();server.once('error',reject);
  server.listen(0,'127.0.0.1',()=>{
    const address=server.address();server.close(()=>resolve(address.port));
  });
 });
 processRef=spawn(bin,['server',data,'--address',`127.0.0.1:${port}`,
   '--console-address',`127.0.0.1:${consolePort}`],{
   cwd:scratch,env:{PATH:process.env.PATH??'/usr/bin:/bin',HOME:scratch,TMPDIR:scratch,
     MINIO_ROOT_USER:accessKeyId,MINIO_ROOT_PASSWORD:secretAccessKey,
     MINIO_BROWSER:'off',MINIO_UPDATE:'off',GOMAXPROCS:'2',GOMEMLIMIT:'512MiB'},
   stdio:['ignore',log,log],
 });
 let ready=false;
 for(let i=0;i<80;i++){
  if(processRef.exitCode!==null)break;
  try{const response=await fetch(`${origin}/minio/health/live`,{
    signal:AbortSignal.timeout(500)});
    if(response.status===200){ready=true;break;}
  }catch{}
  await delay(150);
 }
 assert(ready,'LOCAL_QUESTIONS_MINIO_NOT_READY');
 client=new S3Client({endpoint:origin,region:'us-east-1',forcePathStyle:true,
   maxAttempts:1,credentials:{accessKeyId,secretAccessKey},
   requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED'});
 await client.send(new CreateBucketCommand({Bucket:bucket}));
 const previous={};
 const patch={GAFUS_LOCAL_ISOLATED_API:'1',QUESTIONS_V2_MEDIA_ENABLED:'true',
   QUESTIONS_V2_PUBLIC_BUCKET_VERIFIED:'true',QUESTIONS_V2_S3_ENDPOINT:origin,
   QUESTIONS_V2_S3_BUCKET:bucket,QUESTIONS_V2_S3_REGION:'us-east-1',
   QUESTIONS_V2_S3_ACCESS_KEY_ID:accessKeyId,
   QUESTIONS_V2_S3_SECRET_ACCESS_KEY:secretAccessKey};
 for(const [k,v] of Object.entries(patch)){previous[k]=process.env[k];process.env[k]=v;}
 try{
  const put=async key=>client.send(new PutObjectCommand({Bucket:bucket,Key:key,
    Body:Buffer.from('real-local-s3-test-only'),ContentType:'image/webp'}));
  const head=async key=>client.send(new HeadObjectCommand({Bucket:bucket,Key:key}));
  const assertAbsent=async key=>assert.rejects(()=>head(key),e=>
    e?.$metadata?.httpStatusCode===404);
  const make=kind=>{
    const id=randomUUID(),ownerId='qa_owner';
    return {mediaId:id,ownerId,sourceKey:`questions/v2/${ownerId}/${id}/incoming/source.webp`,
      sourceMime:'image/webp',cleanupKind:kind};
  };
  const readyJob=make('SOURCE'),readyKeys=questionsV2CleanupKeys(readyJob);
  const published=questionsV2CleanupKeys({...readyJob,cleanupKind:'ALL'}).slice(2);
  for(const key of [...readyKeys,...published])await put(key);
  await questionsV2Delete(readyKeys);
  for(const key of readyKeys)await assertAbsent(key);
  for(const key of published)await head(key);
  console.log('REAL_MINIO_READY_SOURCE_DELETE_HEAD_404_PUBLISHED_WEBP_PRESERVED=PASS');
  const removedJob=make('ALL'),removedKeys=questionsV2CleanupKeys(removedJob);
  for(const key of removedKeys)await put(key);
  await questionsV2Delete(removedKeys);
  for(const key of removedKeys)await assertAbsent(key);
  await questionsV2Delete(removedKeys);
  for(const key of removedKeys)await assertAbsent(key);
  console.log('REAL_MINIO_FAILED_OR_DELETED_ALL_KEYS_GONE_IDEMPOTENT=PASS');
  const protectedJob=make('ALL'),protectedKey=questionsV2CleanupKeys(protectedJob)[0];
  await put(protectedKey);
  await assert.rejects(()=>questionsV2Delete([`posts/other/${randomUUID()}/source.webp`]),
    /QUESTIONS_V2_S3_INVALID_KEY/);
  await head(protectedKey);
  console.log('REAL_MINIO_ARBITRARY_OTHER_S3_KEY_DENIED=PASS');
 }finally{
  for(const [k,v] of Object.entries(previous)){
   if(v===undefined)delete process.env[k];else process.env[k]=v;
  }
 }
}finally{
 client?.destroy();
 if(processRef){
  if(processRef.exitCode===null){processRef.kill('SIGTERM');
   await Promise.race([new Promise(resolve=>processRef.once('exit',resolve)),delay(3500)]);}
  if(processRef.exitCode===null)processRef.kill('SIGKILL');
 }
 closeSync(log);
 assert(scratch.startsWith(join(work,'questions-worker-delete-')));
 rmSync(scratch,{recursive:true,force:true});
 console.log('REAL_MINIO_ONLY_TEST_PROCESS_AND_TEMP_DIR_REMOVED=YES');
}
