/** Local-only Questions Photo V2 API/Sharp worker for QA. NEVER targets Cloud.ru. */
import 'dotenv/config';
import {config as loadDotEnv} from 'dotenv';
loadDotEnv({path:'.env.local',override:true});
import {realpathSync} from 'node:fs';
import {resolve} from 'node:path';

const ROOT='/Users/asmtv1/Desktop/gafus-refactor';
const MODE=process.argv[2];
if(!['server','worker'].includes(MODE||'')||realpathSync(process.cwd())!==ROOT||
  realpathSync(resolve('.'))!==ROOT||process.env.NODE_ENV==='production')
  throw Error('QUESTIONS_ISOLATED_QA_SCOPE_DENIED');
const db=new URL(process.env.DATABASE_URL||'');
if(!['localhost','127.0.0.1'].includes(db.hostname)||
  db.port!=='5432'||db.pathname!=='/dog_trainer_design_20261012')
  throw Error('QUESTIONS_ISOLATED_QA_DATABASE_DENIED');
const forbidden=['CLOUDRU_S3_ACCESS_KEY_ID','CLOUDRU_S3_SECRET_ACCESS_KEY',
  'GALLERY_S3_ACCESS_KEY_ID','GALLERY_S3_SECRET_ACCESS_KEY',
  'FEED_S3_ACCESS_KEY_ID','FEED_S3_SECRET_ACCESS_KEY'];
if(forbidden.some(key=>process.env[key])||process.env.GAFUS_WEB4_ISOLATED_MEDIA||
  (process.env.QUESTIONS_V2_S3_ENDPOINT &&
   process.env.QUESTIONS_V2_S3_ENDPOINT!=='http://127.0.0.1:9000'))
  throw Error('QUESTIONS_ISOLATED_QA_CLOUD_CREDENTIALS_DENIED');
Object.assign(process.env,{
  NODE_ENV:'development',API_HOST:'127.0.0.1',API_PORT:'3002',
  GAFUS_LOCAL_BROWSER_AUTH:'1',GAFUS_QUESTIONS_ISOLATED_QA:'1',
  GAFUS_LOCAL_ISOLATED_API:'1',
  GAFUS_ISOLATED_NONPROD_S3:'enabled',
  GAFUS_ISOLATED_S3_ENDPOINT:'http://127.0.0.1:9000',
  GAFUS_ISOLATED_S3_DOCUMENTS_BUCKET:'gafus-refactor-documents-test',
  GAFUS_ISOLATED_S3_QUESTIONS_BUCKET:'gafus-refactor-questions-test',
  GAFUS_ISOLATED_S3_GALLERY_BUCKET:'gafus-refactor-gallery-test',
  GAFUS_ISOLATED_S3_FEED_BUCKET:'gafus-refactor-feed-test',
  QUESTIONS_V2_MEDIA_ENABLED:'true', QUESTIONS_V2_PUBLIC_BUCKET_VERIFIED:'true',
  QUESTIONS_V2_PROCESSOR_READY:'true',
  QUESTIONS_V2_S3_ENDPOINT:'http://127.0.0.1:9000',
  QUESTIONS_V2_S3_BUCKET:'gafus-refactor-questions-test',
  QUESTIONS_V2_S3_REGION:'us-east-1',
  QUESTIONS_V2_CDN_BASE_URL:'',CLOUDRU_MEDIA_JOBS_ENABLED:'false',
});
const {isolatedNonprodS3Config}=await import('../../packages/cdn-upload/src/isolatedNonprodS3.ts');
const isolated=isolatedNonprodS3Config('questions');
if(!isolated||isolated.endpoint!=='http://127.0.0.1:9000'||
  isolated.bucket!=='gafus-refactor-questions-test')
  throw Error('QUESTIONS_ISOLATED_QA_STORAGE_DENIED');
process.env.QUESTIONS_V2_S3_ACCESS_KEY_ID=isolated.accessKeyId;
process.env.QUESTIONS_V2_S3_SECRET_ACCESS_KEY=isolated.secretAccessKey;
const {prisma}=await import('@gafus/prisma');
// Refuse to serve/claim until the ADDITIVE Questions V2 local migration exists.
try{await prisma.questionV2MediaTask.count();}
catch{throw Error('QUESTIONS_ISOLATED_QA_LOCAL_MIGRATION_REQUIRED');}
const {questionsV2Storage}=await import('@gafus/cdn-upload');
const {HeadBucketCommand}=await import('@aws-sdk/client-s3');
const {client,bucket}=questionsV2Storage();
try{await client.send(new HeadBucketCommand({Bucket:bucket}),
  {abortSignal:AbortSignal.timeout(5000)});}
finally{client.destroy();}

if(MODE==='server'){
  const port=process.env.QUESTIONS_QA_PORT==='3001'?3001:3002;
  const {app}=await import('../../apps/api/src/app.ts');
  const {serve}=await import('../../apps/api/node_modules/@hono/node-server/dist/index.mjs');
  const server=serve({fetch:app.fetch,port,hostname:'127.0.0.1'});
  console.log(`QUESTIONS_ISOLATED_QA_SERVER_READY port=${port} storage=loopback-minio`);
  const shutdown=()=>{server.close();void prisma.$disconnect().finally(()=>process.exit(0));};
  process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
}else{
  const {createQuestionsV2Queue}=await import('../../apps/api/src/modules/questions/media-v2-jobs.ts');
  const {createQuestionsV2S3Objects}=await import('../../apps/feed-cloud/src/questions-v2-s3-objects.ts');
  const {processQuestionsV2Photo}=await import('../../apps/feed-cloud/src/questions-v2-processor.ts');
  const queue=createQuestionsV2Queue({database:prisma});
  let processing=false,closed=false;
  async function tick(){
    if(processing||closed)return;
    processing=true;
    try{
      const {jobs}=await queue.claimOne();
      for(const job of jobs){
        const objects=createQuestionsV2S3Objects(job);
        try{
          const manifest=await processQuestionsV2Photo(job,objects,AbortSignal.timeout(120000));
          const ack=await queue.complete(job.mediaId,job.attemptToken,manifest);
          if(!ack.accepted)throw Error('QUESTIONS_ISOLATED_QA_COMPLETION_NOT_ACCEPTED');
          console.log('QUESTIONS_ISOLATED_QA_PHOTO_READY');
        }catch{
          await queue.fail(job.mediaId,job.attemptToken,'LOCAL_PROCESSING_FAILED');
          console.error('QUESTIONS_ISOLATED_QA_PHOTO_FAILED');
        }finally{objects.close();}
      }
    }catch{console.error('QUESTIONS_ISOLATED_QA_CLAIM_FAILED');}
    finally{processing=false;}
  }
  console.log('QUESTIONS_ISOLATED_QA_WORKER_READY storage=loopback-minio');
  const timer=setInterval(()=>void tick(),1500);
  void tick();
  const shutdown=()=>{closed=true;clearInterval(timer);void prisma.$disconnect().finally(()=>process.exit(0));};
  process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
}
