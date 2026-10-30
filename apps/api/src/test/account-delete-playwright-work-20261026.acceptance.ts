/** Single synthetic owner: REAL Playwright Vite UI -> live Hono DELETE ->
 * restricted WORK PostgreSQL -> source owner-scoped worker -> loopback MinIO.
 * Only code-SEND is intercepted to avoid any external email provider.
 * Never calls the global worker, external CDN, or any production service.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { realpathSync, existsSync, lstatSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { prisma } from '@gafus/prisma';
import { S3Client, HeadObjectCommand, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import { uploadPrivateUserMedia, deletePrivateUserMedia, privateMediaLocation } from '@gafus/cdn-upload';
import { isolatedNonprodS3Config } from '@gafus/cdn-upload/isolated-nonprod-s3';
import { uploadIsolatedAvatar, deleteIsolatedAvatarLocation } from '../../../../packages/cdn-upload/src/isolatedAvatarMedia';
import { processPrivateAccountStorageCleanupForOwner } from '../../../../packages/core/src/services/accountCleanup/worker';
import { chromium } from '../../../../.local-browser-mcp/node_modules/playwright/index.js';

const R = '/Users/asmtv1/Desktop/gafus-refactor';
const suffix = randomBytes(6).toString('hex');
const username = `accepte2e_${suffix}`;
const otherName = `accepte2ectrl_${suffix}`;
const ownArtifacts: Array<{kind:'avatar'|'private'; location:string}> = [];
const actors: Array<{id:string;username:string}> = [];
let ownerId = '';
let accountDeleted = false;
let physicalProof = false;
let stage = 'preflight';
let actorCountBaseline = -1;
const originalPrefix = 'ACCOUNT_BROWSER_REAL_';
function insist(v:unknown,k:string): asserts v { if(!v) throw Error(originalPrefix+k); }
function pass(k:string) { console.warn('ACCOUNT_BROWSER_HONO_WORKER_S3_'+k+'=PASS'); }
const cfg = {} as {documents:NonNullable<ReturnType<typeof isolatedNonprodS3Config>>;questions:NonNullable<ReturnType<typeof isolatedNonprodS3Config>>};
const s3 = () => new S3Client({endpoint:cfg.documents.endpoint,region:'us-east-1',forcePathStyle:true,credentials:{accessKeyId:cfg.documents.accessKeyId,secretAccessKey:cfg.documents.secretAccessKey},maxAttempts:1});
const ownLocKey = (location:string) => location.slice(location.indexOf(':',location.indexOf(':')+1)+1);
async function head(bucket:string,key:string, expected:number) {
 const c=s3();
 try {
  try { const r=await c.send(new HeadObjectCommand({Bucket:bucket,Key:key})); insist(expected===200&&r.$metadata.httpStatusCode===200,'S3_EXPECTED_PRESENT'); }
  catch(e) { insist(expected===404&&(e as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode===404,'S3_EXPECTED_GONE'); }
 } finally {c.destroy();}
}
async function clean() {
 // Never touch any unrecognised account or object. Only unique fixtures here.
 for(const a of ownArtifacts) {
  try { if(a.kind==='avatar') await deleteIsolatedAvatarLocation(a.location);
   else await deletePrivateUserMedia(a.location); }
  catch { console.error('ACCOUNT_BROWSER_OWN_S3_FINALIZER_REVIEW'); process.exitCode=1; }
 }
 ownArtifacts.length=0;
 for(const a of actors) {
  const live=await prisma.user.findUnique({where:{id:a.id},select:{username:true}});
  if(live?.username===a.username && a.username.endsWith(suffix)) await prisma.user.delete({where:{id:a.id}});
 }
 if(ownerId) {
  // Remove only ephemeral receipt jobs created by THIS synthetic owner.
  await prisma.$executeRaw`DELETE FROM "AccountStorageCleanup" WHERE "ownerId"=${ownerId}
    AND "attemptToken" IS NULL AND "scope" IN ('public','gallery','feed','questions','documents')
    AND "status" IN ('pending','done')`;
  await prisma.$executeRaw`DELETE FROM "GalleryStorageJob" WHERE "ownerId"=${ownerId}
    AND "status" IN ('pending','failed') AND "kind"='delete'`;
  await prisma.$executeRaw`DELETE FROM "FeedStorageJob" WHERE "ownerId"=${ownerId}
    AND "status" IN ('pending','failed') AND "kind"='delete_keys'`;
 }
}
async function main() {
 insist(process.env.ACCOUNT_DELETE_PLAYWRIGHT_WORK==='1','EXPLICIT_TEST_ONLY');
 insist(realpathSync(R)===R && realpathSync(process.cwd())===R+'/apps/api','ROOT');
 const u = new URL(process.env.DATABASE_URL??'');
 insist(u.hostname==='127.0.0.1'&&u.port==='55921'&&u.username==='gafus_refactor_local_real'
   &&u.pathname==='/gafus_refactor_real_work_20261024','RESTRICTED_DB_ONLY');
 insist(process.env.NODE_ENV==='development'&&process.env.GAFUS_LOCAL_ISOLATED_API==='1'
  &&process.env.GAFUS_ISOLATED_NONPROD_S3==='enabled','LOCAL_ONLY');
 const docs=isolatedNonprodS3Config('documents'), qs=isolatedNonprodS3Config('questions');
 insist(docs?.endpoint==='http://127.0.0.1:9000'&&qs?.endpoint==='http://127.0.0.1:9000','MINIO_ONLY');
 cfg.documents=docs;cfg.questions=qs;
 insist(privateMediaLocation('documents','users/u/pets/p/documents/test.pdf').startsWith('isodev-private:documents:'),'CURRENT_SOURCE_ALIAS');
 // Only fixed project-owned private TEST buckets; never create arbitrary or Cloud.ru buckets.
 for(const bucket of [docs.bucket,qs.bucket]){
  insist(['gafus-refactor-documents-test','gafus-refactor-questions-test'].includes(bucket),'FIXED_TEST_BUCKET_ONLY');
  const check=s3();
  try {
   try {await check.send(new HeadBucketCommand({Bucket:bucket}));}
   catch(e){
    insist((e as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode===404,'TEST_BUCKET_UNEXPECTED_HEAD_FAILURE');
    try {await check.send(new CreateBucketCommand({Bucket:bucket}));}
    catch(err){insist((err as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode===409,'TEST_BUCKET_CREATE_FAILED');}
    await check.send(new HeadBucketCommand({Bucket:bucket}));
   }
  } finally {check.destroy();}
 }
 pass('FIXED_LOCAL_TEST_BUCKETS_READY');
 const browserBin=R+'/.local-browser-mcp/.cache/browsers/chromium_headless_shell-1247/chrome-headless-shell-mac-arm64/chrome-headless-shell';
 insist(existsSync(browserBin)&&!lstatSync(browserBin).isSymbolicLink(),'OWN_BROWSER');
 insist((await fetch('http://127.0.0.1:3001/ready',{signal:AbortSignal.timeout(3500)})).status===200,'HONO_READY');
 insist((await fetch('http://127.0.0.1:9000/minio/health/ready',{signal:AbortSignal.timeout(3500)})).status===200,'MINIO_READY');
 actorCountBaseline=await prisma.user.count();
 const password=randomBytes(30).toString('base64url');
 const owner=await prisma.user.create({data:{username,password:await bcrypt.hash(password,10),passwordSetAt:new Date(),registrationPending:false,role:'USER',email:`${username}@example.invalid`}});
 ownerId=owner.id;actors.push({id:owner.id,username});
 const other=await prisma.user.create({data:{username:otherName,password:await bcrypt.hash(randomBytes(30).toString('base64url'),10),passwordSetAt:new Date(),registrationPending:false,role:'USER'}});
 actors.push({id:other.id,username:otherName});
 const pet=await prisma.pet.create({data:{ownerId:owner.id,name:'Synthetic E2E pet',type:'DOG',breed:'Test',birthDate:new Date('2024-01-01T00:00:00Z')}});
 const avatarPath=`users/${owner.id}/avatar/${randomUUID()}.png`;
 const png=new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/gm0AAAAASUVORK5CYII=','base64'));
 const avatar=await uploadIsolatedAvatar(new File([png],'avatar.png',{type:'image/png'}),avatarPath);
 ownArtifacts.push({kind:'avatar',location:avatar});
 await prisma.userProfile.create({data:{userId:owner.id,avatarUrl:null}});
 const docPath=`users/${owner.id}/pets/${pet.id}/documents/${randomUUID()}.pdf`;
 const pdf=new Uint8Array([37,80,68,70,45,49,46,55,10,49,10,37,37,69,79,70,10]);
 const doc=await uploadPrivateUserMedia('documents',docPath,pdf,'application/pdf');ownArtifacts.push({kind:'private',location:doc});
 await prisma.petDocument.create({data:{petId:pet.id,ownerId:owner.id,name:'Synthetic doc',mimeType:'application/pdf',sizeBytes:pdf.length,url:doc}});
 const question=await prisma.question.create({data:{authorId:owner.id,clientRequestId:randomUUID(),title:'Synthetic E2E question',body:'Test local',category:'general'}});
 const photoPath=`questions/${owner.id}/${randomUUID()}.png`;
 const photo=await uploadPrivateUserMedia('questions',photoPath,png,'image/png');ownArtifacts.push({kind:'private',location:photo});
 await prisma.questionPhoto.create({data:{ownerId:owner.id,questionId:question.id,url:photo,storagePath:photo}});
 const ownPost=await prisma.feedPost.create({data:{authorId:owner.id,clientRequestId:randomUUID()}});
 const foreignPath=`users/${other.id}/pets/control${randomUUID()}/documents/${randomUUID()}.pdf`;
 const foreign=await uploadPrivateUserMedia('documents',foreignPath,pdf,'application/pdf');ownArtifacts.push({kind:'private',location:foreign});
 for(const [bucket,key] of [[docs.bucket,'documents/uploads/'+docPath],[docs.bucket,'documents/uploads/'+avatarPath],[qs.bucket,'questions/uploads/'+photoPath],[docs.bucket,'documents/uploads/'+foreignPath]])await head(bucket!,key!,200);
 pass('OWN_THREE_S3_PLUS_FOREIGN_CONTROL_HEAD200');
 const code='8'+String(randomBytes(3).readUIntBE(0,3)%100000).padStart(5,'0');
 await prisma.accountDeletionToken.create({data:{userId:owner.id,shortCode:code,expiresAt:new Date(Date.now()+600_000)}});
 stage='browser_launch';
 const browser=await chromium.launch({headless:true,executablePath:browserBin,args:['--no-sandbox','--disable-background-networking'],env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:R+'/.local-browser-mcp/.cache/home',TMPDIR:R+'/.local-browser-mcp/.cache/tmp',XDG_CACHE_HOME:R+'/.local-browser-mcp/.cache/tmp'}});
 let codeIntercepts=0;let realDelete=0;let deleteStatus=0;const pagesErrors:string[]=[];
 try {
  const context=await browser.newContext({viewport:{width:1280,height:800},acceptDownloads:false,serviceWorkers:'block',locale:'ru-RU'});
  await context.route('**/*', async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin!=='http://127.0.0.1:5173')return route.abort('blockedbyclient');
   if(url.pathname==='/api/v1/user/account/deletion-code'&&request.method()==='POST'){
    codeIntercepts++;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true})});
   }
   if(request.method()==='POST'&&!['/api/v1/auth/refresh','/api/v1/auth/login','/api/v1/user/account/delete'].includes(url.pathname))return route.abort('blockedbyclient');
   return route.continue();
  });
  const page=await context.newPage();page.on('pageerror',e=>pagesErrors.push(e.message.slice(0,60)));
  page.on('response',r=>{if(new URL(r.url()).pathname==='/api/v1/user/account/delete'){realDelete++;deleteStatus=r.status();}});
  stage='login_navigation';
  await page.goto('http://127.0.0.1:5173/login',{waitUntil:'domcontentloaded',timeout:25000});
  const cookieReject=page.getByRole('button',{name:'Отклонить'});
  if(await cookieReject.isVisible({timeout:1000}).catch(()=>false))await cookieReject.click();
  stage='login_form';
  await page.locator('#login-name').waitFor({state:'visible',timeout:30000});
  await page.locator('#login-name').fill(username,{timeout:10000});await page.locator('#login-password').fill(password);
  await page.getByRole('button',{name:'Войти',exact:true}).click();
  await page.waitForTimeout(650);
  stage='login_cookie_identity';
  const me=await page.evaluate(async()=>{
   const r=await fetch('/api/v1/auth/me',{credentials:'include'});const j=await r.json().catch(()=>null);return{status:r.status,data:j?.data??null};});
  insist(me.status===200&&(me.data as {id?:string})?.id===owner.id,'REAL_HONO_COOKIE_LOGIN_FROM_WORK_FIXTURE');
  pass('PLAYWRIGHT_REAL_HONO_LOGIN_AND_RESTRICTED_WORK_IDENTITY');
  stage='delete_screen_navigation';
  try {
   await page.goto('http://127.0.0.1:5173/profile/delete-account',{waitUntil:'domcontentloaded',timeout:25000});
  }catch(error) {
   console.error('DELETE_SCREEN_NAVIGATE_ERROR='+String((error as Error).message).slice(0,260));
   throw error;
  }
  stage='delete_screen_code_button';
  try{await page.getByRole('button',{name:'Отправить код на email'}).waitFor({state:'visible',timeout:16000});}
  catch(error){
   const hints=(await page.locator('body').innerText().catch(()=>'' )).slice(0,1100);
   const api=await page.evaluate(async()=>{try{
    const r=await fetch('/api/v1/user/profile',{credentials:'include'});
    const j=await r.json();return {status:r.status,success:j.success,fields:Object.keys(j.data??{}).slice(0,24)};
   }catch{return{status:0,success:false,fields:[]}};});
   console.error('DELETE_SCREEN_DIAGNOSTIC_PATH='+new URL(page.url()).pathname);
   console.error('DELETE_SCREEN_DIAGNOSTIC_TEXT='+JSON.stringify(hints));
   console.error('DELETE_SCREEN_DIAGNOSTIC_PROFILE='+JSON.stringify(api));
   throw error;
  }
  // The deletion preflight must not depend on ability to sign a private
  // avatar URL. Attach the S3 avatar BEFORE the real destructive request so
  // the immutable Core snapshot still must capture it for worker erasure.
  await prisma.userProfile.update({where:{userId:owner.id},data:{avatarUrl:avatar}});
  stage='code_entry';
  await page.getByRole('button',{name:'Отправить код на email'}).click();
  await page.locator('#account-delete-code').fill(code,{timeout:7000});
  await page.getByRole('button',{name:'Продолжить'}).click();
  await page.locator('#account-delete-username').fill(username);
  await page.locator('input[type=checkbox]').check();
  stage='hono_delete';
  await page.getByRole('button',{name:'Удалить навсегда'}).click();
  await page.waitForURL('**/login',{timeout:16000});
  insist(codeIntercepts===1&&realDelete===1&&deleteStatus===200,'ONE_TRUE_HONO_DELETE200_UI_NAVIGATE_LOGIN');
  pass('PLAYWRIGHT_UI_ONE_TRUE_HONO_DELETE_200_AND_LOGOUT');
  insist(pagesErrors.length===0,'NO_BROWSER_JS_ERRORS');
  await context.close();
 }finally{await browser.close();}
 insist(await prisma.user.findUnique({where:{id:owner.id}})===null,'WORK_CASCADE_OWN_USER_DELETED');
 insist((await prisma.pet.count({where:{ownerId:owner.id}}))===0 && (await prisma.feedPost.count({where:{authorId:owner.id}}))===0 && (await prisma.questionPhoto.count({where:{ownerId:owner.id}}))===0,'WORK_CASCADE_PET_FEED_QUESTION');
 insist((await prisma.user.findUnique({where:{id:other.id}}))?.username===otherName,'FOREIGN_USER_PRESERVED');
 accountDeleted=true;pass('ORIGINAL_HONO_WORK_CASCADE_OWN_ONLY');
 const jobs=await prisma.accountStorageCleanup.findMany({where:{ownerId:owner.id},select:{scope:true,status:true}});
 insist(['public','gallery','feed','questions','documents'].every(x=>jobs.some(j=>j.scope===x&&j.status==='pending')),'ALL_FIVE_SCOPE_DURABLE_JOBS');
 await prisma.accountStorageCleanup.updateMany({where:{ownerId:owner.id,scope:{in:['questions','documents']},status:'pending',attempts:0},data:{availableAt:new Date(Date.now()-2000)}});
 stage='owner_scoped_worker';
 await processPrivateAccountStorageCleanupForOwner(owner.id,2);
 const privateJobs=await prisma.accountStorageCleanup.findMany({where:{ownerId:owner.id,scope:{in:['questions','documents']}},select:{scope:true,status:true,attempts:true,errorCode:true}});
 insist(privateJobs.length===2&&privateJobs.every(j=>j.status==='done'&&j.attempts===1&&j.errorCode===null),'OWN_WORKER_TWO_PRIVATE_JOBS_DONE');
 await head(docs.bucket,'documents/uploads/'+docPath,404);
 await head(docs.bucket,'documents/uploads/'+avatarPath,404);
 await head(qs.bucket,'questions/uploads/'+photoPath,404);
 await head(docs.bucket,'documents/uploads/'+foreignPath,200);
 physicalProof=true;pass('OWNER_SCOPED_WORKER_TWO_DONE_OWN_HEAD404_FOREIGN_HEAD200');
}
void main().catch(e=>{process.exitCode=1;console.error('ACCOUNT_BROWSER_FAIL_'+(e instanceof Error&&e.message.startsWith(originalPrefix)?e.message:(e instanceof Error?e.name:'UNKNOWN'))+'_AT_'+stage);})
.finally(async()=>{
 try{await clean();if(actorCountBaseline>=0 && await prisma.user.count()!==actorCountBaseline)throw Error('OWN_SYNTHETIC_USER_COUNT_MISMATCH');
 console.warn('ACCOUNT_BROWSER_OWN_FIXTURES_CLEANED='+(!process.exitCode?'PASS':'CHECK'));
 }catch(e){process.exitCode=1;console.error('ACCOUNT_BROWSER_OWN_FIXTURE_REVIEW_'+(e instanceof Error?e.name:'UNKNOWN'));}
 if(accountDeleted)console.warn('ACCOUNT_BROWSER_REAL_AUDIT_RETAINED');
 if(physicalProof)console.warn('ACCOUNT_BROWSER_S3_PHYSICAL_PROOF_DONE');
 await prisma.$disconnect();
});
