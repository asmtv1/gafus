/** Local-only Sharp worker for the real-work COPY of PostgreSQL used by API 3001.
 * Strictly no Cloud.ru endpoint, production credentials or data. */
import { realpathSync } from 'node:fs';

if(realpathSync(process.cwd())!=='/Users/asmtv1/Desktop/gafus-refactor' ||
   process.env.NODE_ENV!=='development' ||
   process.env.GAFUS_LOCAL_ISOLATED_API!=='1' ||
   process.env.GAFUS_ISOLATED_NONPROD_S3===undefined ||
   process.env.QUESTIONS_V2_MEDIA_ENABLED!=='true' ||
   process.env.QUESTIONS_V2_S3_ENDPOINT!=='http://127.0.0.1:9000' ||
   process.env.QUESTIONS_V2_S3_BUCKET!=='gafus-refactor-questions-test' ||
   process.env.GAFUS_ISOLATED_S3_ENDPOINT!=='http://127.0.0.1:9000' ||
   process.env.GAFUS_ISOLATED_S3_QUESTIONS_BUCKET!=='gafus-refactor-questions-test' ||
   ['CLOUDRU_S3_ACCESS_KEY_ID','CLOUDRU_S3_SECRET_ACCESS_KEY','GALLERY_S3_ACCESS_KEY_ID',
    'GALLERY_S3_SECRET_ACCESS_KEY','FEED_S3_ACCESS_KEY_ID','FEED_S3_SECRET_ACCESS_KEY']
     .some(key=>process.env[key])) throw Error('QUESTIONS_REAL_WORK_LOCAL_SCOPE_DENIED');
const db=new URL(process.env.DATABASE_URL??'');
if(db.hostname!=='127.0.0.1'||db.port!=='55921'||
   db.pathname!=='/gafus_refactor_real_work_20261024')
  throw Error('QUESTIONS_REAL_WORK_DATABASE_SCOPE_DENIED');
const {isolatedNonprodS3Config}=await import('../../packages/cdn-upload/src/isolatedNonprodS3.ts');
const isolated=isolatedNonprodS3Config('questions');
if(!isolated||isolated.endpoint!=='http://127.0.0.1:9000'||
   isolated.bucket!=='gafus-refactor-questions-test')
  throw Error('QUESTIONS_REAL_WORK_STORAGE_SCOPE_DENIED');
if(process.env.QUESTIONS_V2_S3_ACCESS_KEY_ID!==isolated.accessKeyId ||
   process.env.QUESTIONS_V2_S3_SECRET_ACCESS_KEY!==isolated.secretAccessKey)
  throw Error('QUESTIONS_REAL_WORK_CREDENTIAL_MISMATCH');
const {prisma}=await import('@gafus/prisma');
await prisma.questionV2MediaTask.count();
const {questionsV2Storage}=await import('@gafus/cdn-upload');
const {HeadBucketCommand}=await import('@aws-sdk/client-s3');
const store=questionsV2Storage();
try{await store.client.send(new HeadBucketCommand({Bucket:store.bucket}),
  {abortSignal:AbortSignal.timeout(5000)});}
finally{store.client.destroy();}
const {createQuestionsV2Queue}=await import('../../apps/api/src/modules/questions/media-v2-jobs.ts');
const {createQuestionsV2S3Objects}=await import('../../apps/feed-cloud/src/questions-v2-s3-objects.ts');
const {processQuestionsV2Photo}=await import('../../apps/feed-cloud/src/questions-v2-processor.ts');
const queue=createQuestionsV2Queue({database:prisma});
let active=false,closing=false;
async function tick(){
  if(active||closing)return;
  active=true;
  try{
    const {jobs}=await queue.claimOne();
    for(const job of jobs){
      const objects=createQuestionsV2S3Objects(job);
      try{
        const manifest=await processQuestionsV2Photo(job,objects,AbortSignal.timeout(120000));
        const done=await queue.complete(job.mediaId,job.attemptToken,manifest);
        if(!done.accepted)throw Error('LOCAL_QUEUE_ACK_REJECTED');
        console.log('QUESTIONS_REAL_WORK_PHOTO_READY');
      }catch(e){
        await queue.fail(job.mediaId,job.attemptToken,'LOCAL_PROCESSING_FAILED');
        console.error('QUESTIONS_REAL_WORK_PHOTO_FAILED',e instanceof Error?e.name:'UNKNOWN');
      }finally{objects.close();}
    }
  }catch(e){console.error('QUESTIONS_REAL_WORK_QUEUE_ERROR',e instanceof Error?e.name:'UNKNOWN');}
  finally{active=false;}
}
console.log('QUESTIONS_REAL_WORK_WORKER_READY database=127.0.0.1:55921 storage=local-minio');
const timer=setInterval(()=>void tick(),1500);
void tick();
const exit=()=>{closing=true;clearInterval(timer);void prisma.$disconnect().finally(()=>process.exit(0));};
process.once('SIGTERM',exit);process.once('SIGINT',exit);
