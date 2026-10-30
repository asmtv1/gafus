/** WEB3 isolated real browser→registered Hono→Core→WORK SQL receipt.
 * Own fixture, own ledger, own temporary paid occurrence. Never external API. */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { prisma } from '@gafus/prisma';
import { lockGafusUser, changeGafusBalanceTx, getGafusSettings } from '@gafus/core/services/gafus';
import { chromium } from '../../.local-browser-mcp/node_modules/playwright/index.mjs';
const R='/Users/asmtv1/Desktop/gafus-refactor',lease=R+'/.local-pg-scratch/web3-unified-private.json';
const bearer=process.env.GAFUS_WEB3_AUTH_TRANSPORT==='bearer';
if(bearer&&process.env.GAFUS_WEB3_OWN_HTTP!=='1')throw Error('WEB3_BEARER_HTTP_DENIED');
const db=new URL(process.env.DATABASE_URL??'postgresql://invalid/invalid');
if(process.cwd()!==R+'/apps/api'||process.env.GAFUS_WEB3_REAL_BROWSER!=='1'||
 process.env.GAFUS_LOCAL_ISOLATED_API!=='1'||db.hostname!=='127.0.0.1'||db.port!=='55921'||
 db.pathname!=='/gafus_refactor_real_work_20261024'||db.username!=='gafus_refactor_local_real'||
 !db.password||db.search!=='?schema=public'||!existsSync(lease)||lstatSync(lease).isSymbolicLink())
 throw Error('WEB3_SQL_SCOPE_DENIED');
const v=JSON.parse(readFileSync(lease,'utf8'));
const owner=v.users?.[0],foreign=v.users?.[1];
if(!owner?.username?.startsWith('web3_parity_')||!foreign?.username?.startsWith('web3_parity_')||
 v.courseIds?.length!==2||v.stepIds?.length!==2||v.stepOnDayIds?.length!==2||
 !/^WEB3_PAID_[a-f0-9]{8}$/.test(v.paidType))throw Error('WEB3_SQL_LEASE_INVALID');
const paidDay='c'+createHash('sha256').update('WEB3-paid-occurrence:'+v.courseIds[1]).digest('hex').slice(0,24);
const key='course-step:'+paidDay+':'+v.stepOnDayIds[0];
const ensure=(yes:unknown,why:string)=>{if(!yes)throw Error('WEB3_REAL_SQL_'+why);};
async function main(){
const settings=await getGafusSettings();
let browser:Awaited<ReturnType<typeof chromium.launch>>|null=null;
let created=false;
try{
 const identity=await prisma.$queryRaw<{db:string;actor:string}[]>`SELECT current_database() AS db,current_user AS actor`;
 ensure(identity.length===1&&identity[0]?.db==='gafus_refactor_real_work_20261024'&&
  identity[0]?.actor==='gafus_refactor_local_real','DB_NOT_ISOLATED');
 ensure(settings.economyEnabled&&settings.spendingEnabled&&
  settings.courseStepCost>0&&settings.courseStepCost<=3,'SETTINGS_DENY');
 const linked=await prisma.dayOnCourse.findUnique({where:{id:paidDay}});
 ensure(!linked,'PAID_OCCURRENCE_EXISTS');
 await prisma.dayOnCourse.create({data:{id:paidDay,courseId:v.courseIds[1],dayId:v.dayId,order:0}});
 created=true;
 await prisma.$transaction(async tx=>{
  await lockGafusUser(tx,owner.id);
  await changeGafusBalanceTx(tx,{userId:owner.id,amount:3,kind:'ADMIN_CREDIT',
   idempotencyKey:'web3:synthetic-seed:'+owner.id,sourceEntityType:'WEB3_TEST'});
 });
 const chrome=R+'/.local-browser-mcp/.cache/browsers/chromium_headless_shell-1247/chrome-headless-shell-mac-arm64/chrome-headless-shell';
 browser=await chromium.launch({headless:true,executablePath:chrome,args:['--no-sandbox','--disable-gpu','--disable-background-networking'],
   env:{PATH:'/opt/homebrew/bin:/usr/bin:/bin',HOME:R+'/.local-browser-mcp/.cache/home',XDG_CACHE_HOME:R+'/.local-browser-mcp/.cache/tmp'}});
 const ctx=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'});
 await ctx.route('**/*',r=>{
  const url=new URL(r.request().url());
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!['5173','3001','5183','3103'].includes(url.port))return r.abort();
  return r.continue();
 });
 const page=await ctx.newPage();
 await page.goto(bearer?'http://127.0.0.1:5183/login':'http://127.0.0.1:5173/login',{waitUntil:'domcontentloaded',timeout:20000});
 let token='';
 async function login(user:typeof owner){
  if(bearer){
   // Mobile-compatible protocol: use real Hono login, never print/store token.
   const receipt=await page.evaluate(async u=>{
    const res=await fetch('/api/v1/auth/login',{method:'POST',
     headers:{'content-type':'application/json'},body:JSON.stringify(u)});
    const body=await res.json().catch(()=>null);
    return {status:res.status,token:body?.data?.accessToken??null};
   },{username:user.username,password:user.password});
   ensure(receipt.status===200&&typeof receipt.token==='string'&&
     receipt.token.length>30,'BEARER_LOGIN_'+receipt.status);
   token=receipt.token;
   return;
  }
  const status=await page.evaluate(async u=>{
   const r=await fetch('/api/v1/auth/login',{method:'POST',credentials:'include',
    headers:{'content-type':'application/json','x-gafus-auth-transport':'cookie'},
    body:JSON.stringify(u)});return r.status;
  },{username:user.username,password:user.password});
  ensure(status===200,'COOKIE_LOGIN_'+status);
 }
 await login(owner);
 const read=async(path:string)=>page.evaluate(async arg=>{
  const res=await fetch(arg.path,{method:'GET',credentials:'include',cache:'no-store',
   headers:arg.token?{authorization:'Bearer '+arg.token}:{}});
  return {status:res.status,data:await res.json().catch(()=>null)};
 },{path,token});
 const write=async(path:string,body:unknown)=>page.evaluate(async arg=>{
  const res=await fetch(arg.path,{method:'POST',credentials:'include',
   headers:arg.token?{'content-type':'application/json',authorization:'Bearer '+arg.token}:
    {'content-type':'application/json','x-gafus-auth-transport':'cookie'},
   body:JSON.stringify(arg.body)});
  return {status:res.status,data:await res.json().catch(()=>null)};
 },{path,body,token});
 const paidPath='/api/v1/training/day?'+new URLSearchParams({courseType:v.paidType,dayOnCourseId:paidDay,createIfMissing:'false'});
 const before=await read(paidPath);
 ensure(before.status===200,'PAID_PREVIEW_HTTP_'+before.status);
 const target=before.data?.data?.steps?.find((x:any)=>x.id===v.stepIds[0]);
 ensure(target?.locked===true&&target?.monetizationTarget?.targetId===v.stepOnDayIds[0],
   'PAID_STEP_NOT_REDACTED');
 console.log('WEB3_REAL_PAID_LOCKED_HTTP_GET PASS');
 const unlockPath='/api/v1/gafus/unlock';
 const request=(id:string)=>({clientRequestId:id,target:{type:'COURSE_STEP',dayOnCourseId:paidDay,stepOnDayId:v.stepOnDayIds[0]}});
 const a='web3-http-'+randomUUID(),b='web3-http-'+randomUUID();
 const race=await Promise.all([write(unlockPath,request(a)),write(unlockPath,request(b))]);
 ensure(race.every(x=>x.status===200),'UNLOCK_RACE_HTTP');
 const spent=race.map(x=>x.data?.data?.spent).sort();
 ensure(JSON.stringify(spent)===JSON.stringify([0,settings.courseStepCost].sort()),'UNLOCK_RACE_DOUBLE_CHARGE');
 // The winner of a concurrent pair is nondeterministic. Only the exact
 // debit-committing key has a durable transaction to replay after expiration.
 const committedRequestKey=race[0].data?.data?.spent===settings.courseStepCost?a:b;
 const transactions=await prisma.gafusTransaction.findMany({where:{userId:owner.id,kind:'SPEND',targetKey:key}});
 ensure(transactions.length===1&&transactions[0]?.delta===-settings.courseStepCost,'UNLOCK_LEDGER_COUNT');
 const active=await read(paidPath);
 const granted=active.data?.data?.steps?.find((x:any)=>x.id===v.stepIds[0]);
 ensure(active.status===200&&granted?.locked===false&&
  typeof granted?.description==='string'&&granted.description.length>0,'UNLOCK_GET_PERSISTENCE');
 const replay=await write(unlockPath,request(committedRequestKey));
 ensure(replay.status===200&&replay.data?.data?.replay===true,'SAME_KEY_IDEMPOTENCY');
 const rows=await prisma.gafusTargetAccess.findMany({where:{userId:owner.id,targetKey:key}});
 ensure(rows.length===1,'UNLOCK_ACCESS_COUNT');
 console.log('WEB3_REAL_GAFUS_RACE_IDEMPOTENCY_GET PASS debit='+transactions.length);
 // Simulated historical grant respects DB CHECK (expiresAt > grantedAt).
 // Never alter wall-clock time or shared GafusSettings; mutate ONLY the
 // synthetic lease-owned entitlement created in this test.
 const clock=Date.now();
 await prisma.gafusTargetAccess.update({where:{id:rows[0].id},data:{
   grantedAt:new Date(clock-8*24*3600_000),expiresAt:new Date(clock-24*3600_000),
 }});
 const expired=await read(paidPath);
 const lockedAgain=expired.data?.data?.steps?.find((x:any)=>x.id===v.stepIds[0]);
 ensure(expired.status===200&&lockedAgain?.locked===true,'EXPIRED_ACCESS_NOT_REVOKED');
 const oldReplay=await write(unlockPath,request(committedRequestKey));
 console.log('WEB3_EXPIRED_KEY_RESPONSE',JSON.stringify({status:oldReplay.status,
   code:oldReplay.data?.code??null,replay:oldReplay.data?.data?.replay??null,
   spent:oldReplay.data?.data?.spent??null}));
 ensure(oldReplay.status===200&&oldReplay.data?.data?.replay===true,'OLD_REPLAY_FUTURE_GRANT');
 const renewed=await write(unlockPath,request('web3-renew-'+randomUUID()));
 ensure(renewed.status===200&&renewed.data?.data?.spent===settings.courseStepCost,'NEW_KEY_RENEW');
 ensure(await prisma.gafusTransaction.count({where:{userId:owner.id,kind:'SPEND',targetKey:key}})===2,
  'RENEW_DEBIT_COUNT');
 console.log('WEB3_REAL_GAFUS_EXPIRE_NO_REPLAY_RENEW PASS');
 const freePath='/api/v1/training/day?'+new URLSearchParams({courseType:v.courseType,
   dayOnCourseId:v.dayOnCourseId,createIfMissing:'true'});
 const free=await read(freePath);
 ensure(free.status===200,'EXAM_DAY_GET_'+free.status);
 const exam=free.data?.data?.steps?.find((x:any)=>x.id===v.stepIds[1]);
 ensure(exam?.userStepId&&exam.userStepId.length>=20&&exam.type==='EXAMINATION','EXAM_USERSTEP_BINDING');
 const resultPath='/api/v1/exam/result?userStepId='+exam.userStepId;
 const initial=await read(resultPath);
 console.log('WEB3_EXAM_INITIAL_HTTP',JSON.stringify({status:initial.status,
  code:initial.data?.code??null,success:initial.data?.success??null,
  hasResult:Boolean(initial.data?.data)}));
 ensure(initial.status===404,'EXAM_ABSENT_EXPECTED_404');
 const submitted=await write('/api/v1/exam/submit',{
   userStepId:exam.userStepId,stepId:v.stepIds[1],
   testAnswers:{web3_question_1:1},writtenFeedback:'Тренировка помогла собаке стать спокойнее.'});
 ensure(submitted.status===200,'EXAM_SUBMIT_'+submitted.status);
 const result=await read(resultPath);
 ensure(result.status===200&&result.data?.data?.testAnswers?.web3_question_1===1,
  'EXAM_RESULT_NOT_PERSISTED');
 await page.reload({waitUntil:'domcontentloaded'});
 const again=await read(resultPath);
 ensure(again.status===200&&again.data?.data?.id===result.data.data.id,'EXAM_RELOAD_LOST');
 console.log('WEB3_REAL_EXAM_SUBMIT_GET_RELOAD PASS');
 await login(foreign);
 const denied=await read(resultPath);
 console.log('WEB3_FOREIGN_EXAM_DENIAL',JSON.stringify({
  status:denied.status,code:denied.data?.code??null,
  hasResult:Boolean(denied.data?.data),success:denied.data?.success??null,
 }));
 // A subscription-required response is a denial, not a disclosure. Hono
 // currently returns 402 before owner Core lookup for unknown UserStep.
 ensure([402,403,404].includes(denied.status)&&denied.data?.success===false&&
  !denied.data?.data,'EXAM_FOREIGN_READ_ALLOWED');
 const foreignUnlock=await read(paidPath);
 ensure(foreignUnlock.status===200&&foreignUnlock.data?.data?.steps?.[0]?.locked===true,'GAFUS_FOREIGN_ACCESS');
 console.log('WEB3_REAL_OWNER_FOREIGN_DENY PASS');
 // The same synthetic PAID course is temporarily made PRIVATE. No real
 // course/migration/flag changes; assignment belongs only to this fixture.
 // Existing paid StepOnDay remains the exact owned occurrence.
 await prisma.course.update({where:{id:v.courseIds[1]},data:{isPrivate:true}});
 await prisma.courseAccess.create({data:{courseId:v.courseIds[1],userId:owner.id}});
 await login(owner);
 const privatePath='/api/v1/training/day?'+new URLSearchParams({
   courseType:v.paidType,dayOnCourseId:paidDay,createIfMissing:'true',
 });
 const privateDay=await read(privatePath);
 const assignedExam=privateDay.data?.data?.steps?.find((x:any)=>x.id===v.stepIds[1]);
 ensure(privateDay.status===200&&assignedExam?.userStepId&&
   assignedExam.locked===false,'PRIVATE_ASSIGNED_EXAM_DAY_DENIED');
 const privateExamPath='/api/v1/exam/result?userStepId='+assignedExam.userStepId;
 const privateEmpty=await read(privateExamPath);
 ensure(privateEmpty.status===404,'PRIVATE_ASSIGNED_EXAM_RESULT_DENIED');
 const privateSubmit=await write('/api/v1/exam/submit',{
  userStepId:assignedExam.userStepId,stepId:v.stepIds[1],
  testAnswers:{web3_question_1:1},writtenFeedback:'Собака внимательно выполняла команды.',
 });
 ensure(privateSubmit.status===200,'PRIVATE_ASSIGNED_EXAM_SUBMIT_'+privateSubmit.status);
 const privateSaved=await read(privateExamPath);
 ensure(privateSaved.status===200&&privateSaved.data?.data?.testAnswers?.web3_question_1===1,
   'PRIVATE_ASSIGNED_EXAM_PERSISTENCE');
 await prisma.courseAccess.delete({where:{courseId_userId:{courseId:v.courseIds[1],userId:owner.id}}});
 const revoked=await read(privateExamPath);
 ensure(revoked.status===402&&revoked.data?.success===false&&!revoked.data?.data,
   'PRIVATE_EXAM_REVOKED_NOT_FENCED');
 const bypass=await write(unlockPath,request('web3-private-denied-'+randomUUID()));
 ensure(bypass.status===403&&bypass.data?.success===false,
   'PRIVATE_WITH_GAFUS_BYPASS');
 console.log('WEB3_REAL_PRIVATE_ASSIGNMENT_EXAM_REVOKE_AND_NO_GAFUS_BYPASS PASS');
 await ctx.close();
}finally{
 if(browser)await browser.close();
 if(created){
  const actual=await prisma.dayOnCourse.findUnique({where:{id:paidDay},select:{courseId:true,dayId:true}});
  if(actual?.courseId===v.courseIds[1]&&actual?.dayId===v.dayId){
   await prisma.dayOnCourse.delete({where:{id:paidDay}});
   console.log('WEB3_SQL_PAID_LINK_CLEANUP_OK');
  }else if(actual)throw Error('WEB3_SQL_LINK_CLEANUP_DENIED');
 }
 await prisma.$disconnect();
}
}
void main().catch(error=>{console.error('WEB3_SQL_ACCEPTANCE_FAILED',error instanceof Error?error.message:'unknown');process.exitCode=1;});
