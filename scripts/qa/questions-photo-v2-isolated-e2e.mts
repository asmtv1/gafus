/** Synthetic localhost-only photo upload acceptance, never Cloud.ru. */
import 'dotenv/config';
import {config as loadLocalEnv} from 'dotenv';
loadLocalEnv({path:'.env.local',override:true});
import {randomBytes,randomUUID} from 'node:crypto';
import {realpathSync} from 'node:fs';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
const ROOT='/Users/asmtv1/Desktop/gafus-refactor';
const url=new URL(process.env.DATABASE_URL||'');
if(realpathSync(process.cwd())!==ROOT||
  !['127.0.0.1','localhost'].includes(url.hostname)||url.port!=='5432'||
  url.pathname!=='/dog_trainer_design_20261012'||process.env.NODE_ENV==='production')
  throw Error('LOCAL_QUESTIONS_TEST_SCOPE_REJECTED');
const base=process.env.QUESTIONS_QA_WEB_PROXY==='1'
  ? 'http://127.0.0.1:5507' : 'http://127.0.0.1:3002';
const {prisma}=await import('@gafus/prisma');
let userId='',photoId='',mediaId='',sourceKey='',username='';
let storage:typeof import('@gafus/cdn-upload')|undefined;
const obj=(v:unknown):Record<string,any> => (v&&typeof v==='object'&&!Array.isArray(v)?v:{}) as Record<string,any>;
async function req(path:string,method:string,token:string,body?:object){
  const res=await fetch(base+path,{method,headers:{'Authorization':'Bearer '+token,
    ...(body?{'content-type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15_000)});
  const data=obj(await res.json());
  return {res,data};
}
function assert(v:unknown,label:string):asserts v{if(!v)throw Error('ASSERT_'+label);}
try{
  assert((await fetch(base+'/ready')).status===200,'ISOLATED_HONO_READY');
  username='qav2photo_'+randomBytes(6).toString('hex');
  const password=randomBytes(20).toString('base64url');
  const user=await prisma.user.create({data:{username,password:await bcrypt.hash(password,10),
    passwordSetAt:new Date(),role:'USER',registrationPending:false}});
  userId=user.id;
  const login=await fetch(base+'/api/v1/auth/login',{method:'POST',
    headers:{'content-type':'application/json'},body:JSON.stringify({username,password}),
    signal:AbortSignal.timeout(12_000)});
  const auth=obj(await login.json()),token=obj(auth.data).accessToken;
  assert(login.status===200 && typeof token==='string','LOCAL_LOGIN200');
  console.log('QA_QUESTIONS_LOCAL_LOGIN=PASS');
  const image=await sharp({create:{width:800,height:520,channels:3,
    background:{r:105,g:155,b:85}}}).png().toBuffer();
  const reserved=await req('/api/v1/questions/photos/reservations','POST',token,
    {mime:'image/png',bytes:image.length});
  assert(reserved.res.status===201 && reserved.data.success===true,
    'RESERVATION201_'+reserved.res.status);
  const receipt=obj(reserved.data.data),upload=obj(receipt.upload);
  assert(typeof receipt.id==='string' && upload.method==='POST' &&
    typeof upload.url==='string' && new URL(upload.url).hostname==='127.0.0.1',
    'LOCAL_MINIO_SIGNED_RESERVATION');
  photoId=receipt.id;
  const form=new FormData();
  for(const [key,value] of Object.entries(obj(upload.fields)))
    form.append(key,String(value));
  form.append('file',new Blob([new Uint8Array(image)],{type:'image/png'}),'photo.png');
  const uploaded=await fetch(upload.url,{method:'POST',body:form,signal:AbortSignal.timeout(25_000)});
  assert([200,201,204].includes(uploaded.status),'MINIO_MULTIPART_POST_'+uploaded.status);
  console.log('QA_QUESTIONS_LOCAL_S3_POST=PASS');
  const confirmed=await req('/api/v1/questions/photos/'+photoId+'/confirm','POST',token);
  assert(confirmed.res.status===200 && ['QUEUED','READY','PROCESSING'].includes(obj(confirmed.data.data).status),
    'CONFIRM_QUEUED_'+confirmed.res.status);
  let ready:Record<string,any>={};
  for(let i=0;i<30;i++){
    const status=await req('/api/v1/questions/photos/'+photoId+'/status','GET',token);
    assert(status.res.status===200,'PHOTO_STATUS200');
    ready=obj(status.data.data);
    if(ready.status==='READY')break;
    assert(ready.status!=='FAILED','SHARP_TERMINAL_FAILED');
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  assert(ready.status==='READY','SHARP_READY');
  assert(typeof ready.url==='string' && new URL(ready.url).hostname==='127.0.0.1' &&
    typeof ready.smallUrl==='string','SIGNED_MINIO_WEBP_LINKS');
  const rendered=await fetch(ready.url,{signal:AbortSignal.timeout(10_000)});
  assert(rendered.status===200,'MINIO_WEBP200');
  const webp=Buffer.from(await rendered.arrayBuffer());
  const dimensions=await sharp(webp).metadata();
  assert(dimensions.format==='webp' && dimensions.width===720,'WEBP_720_SHARP');
  console.log('QA_QUESTIONS_LOCAL_SHARP_READY_SIGNED_WEBP_GET=PASS');
  const photo=await prisma.questionPhoto.findUnique({where:{id:photoId}});
  assert(photo?.ownerId===userId && photo.url.startsWith('questions-v2:'),
    'ISOLATED_TASK_AND_MARKER');
  const task=await prisma.questionV2MediaTask.findUnique({where:{photoId}});
  assert(task?.status==='READY','PERSISTENT_READY_TASK');
  mediaId=task.mediaId;sourceKey=task.sourceKey;
  // Exact synthetic owned photo cleanup below.
  console.log('QA_QUESTIONS_LOCAL_E2E_PASS');
}catch(error){
  console.error('QA_QUESTIONS_LOCAL_E2E_FAIL',error instanceof Error?error.message:'UNKNOWN');
  process.exitCode=1;
}finally{
  try{
    if(photoId){
      const photo=await prisma.questionPhoto.findFirst({where:{id:photoId,ownerId:userId}});
      if(photo && !photo.answerId && !photo.questionId)await prisma.questionPhoto.delete({where:{id:photoId}});
      const task=await prisma.questionV2MediaTask.findFirst({where:{photoId,ownerId:userId}});
      if(task){
        const {questionsV2Storage}=await import('@gafus/cdn-upload');
        const {questionsV2FinalKeys}=await import('@gafus/feed-cloud');
        const {DeleteObjectCommand}=await import('@aws-sdk/client-s3');
        // The QA process uses the same exact isolated test provider checks as the Hono launcher.
        const {isolatedNonprodS3Config}=await import('../../packages/cdn-upload/src/isolatedNonprodS3.ts');
        Object.assign(process.env,{NODE_ENV:'development',GAFUS_LOCAL_ISOLATED_API:'1',
          GAFUS_ISOLATED_NONPROD_S3:'enabled',GAFUS_ISOLATED_S3_ENDPOINT:'http://127.0.0.1:9000',
          GAFUS_ISOLATED_S3_QUESTIONS_BUCKET:'gafus-refactor-questions-test',
          GAFUS_ISOLATED_S3_FEED_BUCKET:'gafus-refactor-feed-test',
          GAFUS_ISOLATED_S3_GALLERY_BUCKET:'gafus-refactor-gallery-test',
          GAFUS_ISOLATED_S3_DOCUMENTS_BUCKET:'gafus-refactor-documents-test',
          QUESTIONS_V2_MEDIA_ENABLED:'true',QUESTIONS_V2_PUBLIC_BUCKET_VERIFIED:'true',
          QUESTIONS_V2_S3_ENDPOINT:'http://127.0.0.1:9000',
          QUESTIONS_V2_S3_BUCKET:'gafus-refactor-questions-test'});
        const s3=isolatedNonprodS3Config('questions');
        assert(s3?.bucket==='gafus-refactor-questions-test','CLEANUP_BUCKET');
        process.env.QUESTIONS_V2_S3_ACCESS_KEY_ID=s3.accessKeyId;
        process.env.QUESTIONS_V2_S3_SECRET_ACCESS_KEY=s3.secretAccessKey;
        const {client,bucket}=questionsV2Storage();
        const keys=questionsV2FinalKeys(userId,task.mediaId);
        try{for(const key of [task.sourceKey,keys.small,keys.medium])
          await client.send(new DeleteObjectCommand({Bucket:bucket,Key:key}));}
        finally{client.destroy();}
        await prisma.questionV2MediaTask.delete({where:{mediaId:task.mediaId}});
      }
    }
    if(userId){
      const owned=await prisma.user.findUnique({where:{id:userId},select:{username:true}});
      if(owned?.username===username)await prisma.user.delete({where:{id:userId}});
    }
    console.log('QA_QUESTIONS_LOCAL_SYNTHETIC_CLEANUP=PASS');
  }catch{console.error('QA_QUESTIONS_LOCAL_SYNTHETIC_CLEANUP=FAILED');process.exitCode=1;}
  await prisma.$disconnect();
}
