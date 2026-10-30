/** Puppeteer end-to-end with a disposable local actor and local MinIO only. */
import 'dotenv/config';
import {config as loadLocalEnv} from 'dotenv';
loadLocalEnv({path:'.env.local',override:true});
import {realpathSync,writeFileSync,mkdirSync,chmodSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {join} from 'node:path';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import puppeteer from 'puppeteer';
const ROOT='/Users/asmtv1/Desktop/gafus-refactor';
const db=new URL(process.env.DATABASE_URL||'');
if(realpathSync(process.cwd())!==ROOT ||
   !['localhost','127.0.0.1'].includes(db.hostname) ||
   db.port!=='5432'||db.pathname!=='/dog_trainer_design_20261012'||
   process.env.NODE_ENV==='production')throw Error('QA_BROWSER_UNSAFE_DB');
const qa='http://127.0.0.1:5507';
const {prisma}=await import('@gafus/prisma');
let userId='',username='',browser:Awaited<ReturnType<typeof puppeteer.launch>>|undefined;
let activePage:Awaited<ReturnType<Awaited<ReturnType<typeof puppeteer.launch>>['newPage']>>|undefined;
const directory=join(ROOT,'.local-pg-scratch/questions-v2-local-20261029');
function assert(v:unknown,msg:string):asserts v{if(!v)throw Error('QA_BROWSER_'+msg);}
try{
  assert((await fetch(qa+'/questions')).status===200,'WEB_UNAVAILABLE');
  username='qa_questions_browser_'+randomBytes(6).toString('hex');
  const password=randomBytes(22).toString('base64url');
  const u=await prisma.user.create({data:{username,password:await bcrypt.hash(password,10),
    role:'USER',passwordSetAt:new Date(),registrationPending:false,
    onboardingTourCompletedAt:new Date()}});
  userId=u.id;
  mkdirSync(directory,{recursive:true,mode:0o700});chmodSync(directory,0o700);
  const localPhoto=join(directory,'synthetic-browser-photo.png');
  writeFileSync(localPhoto,await sharp({create:{width:800,height:500,channels:3,
    background:{r:133,g:168,b:92}}}).png().toBuffer(),{mode:0o600});
  browser=await puppeteer.launch({headless:true,
    executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage();
  activePage=page;
  await page.setViewport({width:1280,height:800});
  const failures:string[]=[],events:string[]=[];
  page.on('pageerror',e=>failures.push('JS_ERROR_'+e.message.slice(0,100)));
  page.on('response',r=>{
    const url=r.url();
    if(url.includes('/api/v1/questions/photos/reservations'))
      events.push('RESERVATION_'+r.status());
    if(url.includes('/api/v1/questions/photos/')&&url.endsWith('/confirm'))
      events.push('CONFIRM_'+r.status());
    if(url.includes('/api/v1/questions') && r.request().method()==='POST' &&
      !url.includes('/photos/'))events.push('QUESTION_POST_'+r.status());
    if(r.status()>=500 && (url.includes('/api/v1/questions')||url.includes('/gafus-refactor-questions-test')))
      failures.push('HTTP_'+r.status());
  });
  await page.goto(qa+'/login',{waitUntil:'networkidle2',timeout:18000});
  await page.waitForSelector('#login-name',{timeout:15000});
  await page.type('#login-name',username);
  await page.type('#login-password',password);
  await page.click('button[type="submit"]');
  await page.waitForFunction(()=>location.pathname==='/courses',{timeout:20000});
  const cookies=await page.cookies(qa+'/api/v1/questions');
  assert(cookies.some(c=>c.name==='gafus_access' && c.httpOnly && !c.secure),
    'HTTPONLY_LOOPBACK_COOKIE_MISSING');
  console.log('QA_QUESTIONS_BROWSER_LOGIN_COOKIE=PASS');
  await page.goto(qa+'/questions/new',{waitUntil:'networkidle2',timeout:18000});
  await page.waitForSelector('#question-title',{timeout:10000});
  // New disposable actors may see the app's onboarding and cookie banners;
  // dismiss these real controls before testing the form beneath them.
  await page.evaluate(()=>{
    for(const label of ['Пропустить','Принять']){
      const button=[...document.querySelectorAll<HTMLButtonElement>('button')]
        .find(node=>node.textContent?.trim()===label);
      button?.click();
    }
  });
  const uploadInput=await page.$('input[type="file"]');
  assert(uploadInput,'FILE_INPUT_MISSING');
  await uploadInput.uploadFile(localPhoto);
  await page.waitForFunction(()=>{
    const grid=document.querySelector('.question-photo-picker');
    return grid && grid.textContent?.includes('1 из 5 фото') &&
      grid.querySelector('.question-photo-slot:not(.question-photo-slot-pending) img');
  },{timeout:25000});
  assert(events.includes('RESERVATION_201') && events.includes('CONFIRM_200'),
    'REAL_UPLOAD_NETWORK_FAILED_'+events.join('_'));
  assert(!failures.length,'REAL_UPLOAD_BROWSER_ERRORS_'+failures.join('_'));
  console.log('QA_QUESTIONS_BROWSER_FILE_INPUT_UPLOAD=PASS');
  await page.type('#question-title','QA isolated photo publishing '+username);
  await page.type('#question-body','Проверка загрузки фотографии в локальном безопасном окружении Refactor.');
  await page.click('button[type="submit"]');
  await page.waitForFunction(()=>location.pathname!=="/questions/new" &&
    /^\/questions\/[a-z0-9_-]+$/i.test(location.pathname),
    {timeout:15000});
  const id=new URL(page.url()).pathname.split('/').at(-1);
  assert(typeof id==='string','QUESTION_NAVIGATION');
  const saved=await prisma.question.findFirst({where:{id,authorId:userId},select:{photos:{select:{id:true}}}});
  assert(saved?.photos.length===1,'QUESTION_PHOTO_BOUND');
  await page.waitForFunction(()=>{
    const image=document.querySelector<HTMLImageElement>('.question-photo-preview-tile img');
    return Boolean(image && image.complete && image.naturalWidth>0);
  },{timeout:25000});
  assert(!failures.length,'BROWSER_NETWORK_ERRORS_'+failures.join('_'));
  console.log('QA_QUESTIONS_BROWSER_PUBLISHED_IMAGE_VISIBLE=PASS');
  // The answer composer is the user's failing screenshot. Exercise its own
  // independent picker, upload and persisted answer/photo binding.
  const composer='form.web4-question-answer-composer';
  await page.waitForSelector(composer+' textarea',{timeout:10000});
  await page.type(composer+' textarea','QA photo answer published through the browser.');
  const answerInput=await page.$(composer+' input[type="file"]');
  assert(answerInput,'ANSWER_PHOTO_INPUT_MISSING');
  await answerInput.uploadFile(localPhoto);
  await page.waitForFunction(()=>{
    const form=document.querySelector('form.web4-question-answer-composer');
    return Boolean(form && form.textContent?.includes('1 из 5 фото') &&
      form.querySelector('.question-photo-slot:not(.question-photo-slot-pending) img'));
  },{timeout:25000});
  assert(events.filter(e=>e==='RESERVATION_201').length===2 &&
    events.filter(e=>e==='CONFIRM_200').length===2,
    'ANSWER_RESERVATION_AND_CONFIRM_'+events.join('_'));
  console.log('QA_QUESTIONS_BROWSER_ANSWER_PHOTO_UPLOADED=PASS');
  await page.click(composer+' button[type="submit"]');
  await page.waitForFunction(()=>document.body.innerText.includes('Ответ отправлен.'),
    {timeout:20000});
  const bound=await prisma.questionAnswer.findMany({where:{questionId:id,authorId:userId},
    select:{id:true,photos:{select:{id:true}}}});
  assert(bound.length===1 && bound[0]?.photos.length===1,'ANSWER_PHOTO_BOUND');
  let answerStatus=await prisma.questionV2MediaTask.findUnique({
    where:{photoId:bound[0]!.photos[0]!.id},select:{status:true}});
  // A queued answer is publishable, but processing must ultimately finish.
  for(let n=0;n<15 && answerStatus?.status!=='READY';n++){
    await new Promise(resolve=>setTimeout(resolve,500));
    answerStatus=await prisma.questionV2MediaTask.findUnique({
      where:{photoId:bound[0]!.photos[0]!.id},select:{status:true}});
  }
  assert(answerStatus?.status==='READY','ANSWER_PHOTO_SHARP_READY');
  // Refresh the detail: the browser must render the finalized answer WebP.
  await page.goto(qa+'/questions/'+id,{waitUntil:'networkidle2',timeout:20000});
  await page.waitForFunction(()=>[...document.querySelectorAll<HTMLImageElement>(
    '.question-photo-preview-tile img')].filter(x=>x.complete && x.naturalWidth>0).length>=2,
    {timeout:25000});
  assert(!failures.length,'BROWSER_NETWORK_ERRORS_'+failures.join('_'));
  console.log('QA_QUESTIONS_BROWSER_ANSWER_IMAGE_VISIBLE=PASS');
  console.log('QA_QUESTIONS_BROWSER_E2E_PASS');
}catch(e){
  console.error('QA_QUESTIONS_BROWSER_E2E_FAIL',e instanceof Error?e.message:'UNKNOWN');
  if(activePage){try{const details=await activePage.evaluate(()=>({path:location.pathname,
    alerts:[...document.querySelectorAll('[role=alert]')].map(x=>x.textContent?.trim()).slice(0,7),
    forms:[...document.querySelectorAll('form')].map(x=>({
      text:x.innerText.slice(0,280),valid:x.checkValidity(),
      disabledSubmit:[...x.querySelectorAll('[type=submit]')].map(e=>(e as HTMLButtonElement).disabled)
    })),body:document.body.innerText.slice(-460)}));
    console.error('QA_QUESTIONS_BROWSER_FAILURE_UI',JSON.stringify(details));
    console.error('QA_QUESTIONS_BROWSER_HTTP_EVENTS',events.join(','));
  }catch{console.error('QA_QUESTIONS_BROWSER_FAILURE_UI_UNAVAILABLE')}}
  process.exitCode=1;
}finally{
  if(browser)await browser.close().catch(()=>undefined);
  try{
    if(userId){
      const tasks=await prisma.questionV2MediaTask.findMany({where:{ownerId:userId}});
      const {isolatedNonprodS3Config}=await import('../../packages/cdn-upload/src/isolatedNonprodS3.ts');
      Object.assign(process.env,{NODE_ENV:'development',GAFUS_LOCAL_ISOLATED_API:'1',
        GAFUS_ISOLATED_NONPROD_S3:'enabled',GAFUS_ISOLATED_S3_ENDPOINT:'http://127.0.0.1:9000',
        GAFUS_ISOLATED_S3_QUESTIONS_BUCKET:'gafus-refactor-questions-test',
        GAFUS_ISOLATED_S3_FEED_BUCKET:'gafus-refactor-feed-test',
        GAFUS_ISOLATED_S3_GALLERY_BUCKET:'gafus-refactor-gallery-test',
        GAFUS_ISOLATED_S3_DOCUMENTS_BUCKET:'gafus-refactor-documents-test'});
      const s3=isolatedNonprodS3Config('questions');
      assert(s3?.bucket==='gafus-refactor-questions-test','CLEANUP_STORAGE');
      const {S3Client,DeleteObjectCommand}=await import('@aws-sdk/client-s3');
      const {questionsV2FinalKeys}=await import('@gafus/feed-cloud');
      const client=new S3Client({endpoint:s3.endpoint,region:'us-east-1',forcePathStyle:true,
        credentials:{accessKeyId:s3.accessKeyId,secretAccessKey:s3.secretAccessKey}});
      try{
        for(const task of tasks){
          const keys=questionsV2FinalKeys(userId,task.mediaId);
          for(const key of new Set([task.sourceKey,keys.small,keys.medium]))
            await client.send(new DeleteObjectCommand({Bucket:s3.bucket,Key:key}));
        }
      }finally{client.destroy();}
      const owner=await prisma.user.findUnique({where:{id:userId},select:{username:true}});
      if(owner?.username===username){
        await prisma.question.deleteMany({where:{authorId:userId}});
        await prisma.questionPhoto.deleteMany({where:{ownerId:userId}});
        await prisma.questionV2MediaTask.deleteMany({where:{ownerId:userId}});
        await prisma.user.delete({where:{id:userId}});
      }
    }
    console.log('QA_QUESTIONS_BROWSER_SYNTHETIC_CLEANUP=PASS');
  }catch{console.error('QA_QUESTIONS_BROWSER_SYNTHETIC_CLEANUP=FAILED');process.exitCode=1;}
  await prisma.$disconnect();
}
