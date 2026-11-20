/** Real mounted Hono over TCP + disposable PG18/Redis; no API mocks. */
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {writeFileSync,readFileSync} from 'node:fs';
import {once} from 'node:events';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import bcrypt from 'bcryptjs';
import {prisma} from '@gafus/prisma';
const report=process.env.GAFUS_TEST_REPORT_PATH??'';
const sourceFile=fileURLToPath(import.meta.url);
const sourceDir=dirname(sourceFile);
const root=resolve(sourceDir,'../../../..');
const db=new URL(process.env.DATABASE_URL??'http://invalid');
const redis=new URL(process.env.REDIS_URL??'http://invalid');
assert.equal(process.env.GAFUS_QA_AUTH_API_HTTP,'1');
assert.equal(process.env.GAFUS_LOCAL_ISOLATED_API,'1');
assert.equal(process.env.NODE_ENV,'test');
assert.equal(db.protocol,'postgresql:');assert.equal(db.hostname,'127.0.0.1');
assert.equal(db.username,'qahttp');assert.match(db.pathname,/^\/archqa_http_[a-f0-9]{12}$/);
assert.match(db.port,/^\d{4,5}$/);assert.equal(redis.protocol,'redis:');
assert.equal(redis.hostname,'127.0.0.1');assert.match(redis.port,/^\d{4,5}$/);
assert.equal(redis.pathname,'/0');
assert.ok(report.startsWith(root+'/.qa/testing/'));
assert.match(report,/\/qa-[a-z0-9-]+\/tasks\/[a-f0-9]{20}\/tests\.json$/);
assert.ok((process.env.JWT_SECRET??'').length>=32);
assert.ok((process.env.JWT_REFRESH_SECRET??'').length>=32);
for(const flag of ['FEED_ENABLED','GALLERY_ENABLED','CDN_HEALTH_MONITOR_ENABLED'])assert.equal(process.env[flag],'false');
const prefix='qahttp'+randomBytes(5).toString('hex');
const names:string[]=[];
const observations:{name:string,http:{path:string,method:string,status:number,code:string|null}[],sql:Record<string,string|number|boolean|null>}[]=[];
const http:{path:string,method:string,status:number,code:string|null}[]=[];
const actors:Record<string,{id:string,username:string,password:string,role:'USER'|'TRAINER'|'ADMIN',token?:string,refresh?:string}>={};
let base='',server:ReturnType<typeof import('@hono/node-server').serve>|undefined,phase='preflight',error:Error|undefined,dbName='';
const obj=(v:any):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
async function request(path:string,method='GET',token?:string,payload?:any){
  assert.ok(base.startsWith('http://127.0.0.1:'));
  const response=await fetch(base+'/api/v1'+path,{method,headers:{Accept:'application/json',
    ...(token?{Authorization:'Bearer '+token}:{}),...(payload===undefined?{}:{'Content-Type':'application/json'})},
    body:payload===undefined?undefined:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(12000)});
  const json=obj(await response.json().catch(()=>null));
  http.push({path,method,status:response.status,code:typeof json.code==='string'?json.code:null});
  return {status:response.status,json,response};
}
async function caseRun(name:string,fn:()=>Promise<Record<string,string|number|boolean|null>>){
  phase=name;const offset=http.length;const sql=await fn();
  names.push(name);observations.push({name,http:http.slice(offset),sql});console.log('QA_API_HTTP_SQL_PASS',name);
}
const session=(id:string)=>prisma.refreshToken.findMany({where:{userId:id},select:{tokenHash:true,revokedAt:true}});
async function actor(key:string,role:'USER'|'TRAINER'|'ADMIN'){
  const username=prefix+'_'+key,password=randomBytes(24).toString('base64url');
  const row=await prisma.user.create({data:{username,password:await bcrypt.hash(password,10),
    passwordSetAt:new Date(),registrationPending:false,role}});
  actors[key]={id:row.id,username,password,role};return actors[key];
}
try{
  const rows=await prisma.$queryRaw<{db:string}[]>`SELECT current_database() AS db`;
  dbName=rows[0]?.db??'';assert.equal(dbName,db.pathname.slice(1));
  const [{app},{serve}]=await Promise.all([import('../app.js'),import('@hono/node-server')]);
  const running=serve({fetch:app.fetch,hostname:'127.0.0.1',port:0});
  server=running;
  if(!running.listening)await once(running,'listening');
  const address=running.address();assert.ok(address && typeof address!=='string' && address.port>1024);
  base=`http://127.0.0.1:${address.port}`;
  const trainer=await actor('trainer','TRAINER');const learner=await actor('learner','USER');
  const outsider=await actor('outsider','USER');const admin=await actor('admin','ADMIN');
  const course=await prisma.course.create({data:{name:'QA HTTP private course',type:prefix.slice(0,40),
    trainingLevel:'BEGINNER',duration:'1',logoImg:'',authorId:trainer.id,isPrivate:true}});
  const day=await prisma.trainingDay.create({data:{title:'QA HTTP day',authorId:trainer.id}});
  const link=await prisma.dayOnCourse.create({data:{courseId:course.id,dayId:day.id,order:1}});
  const step=await prisma.step.create({data:{title:'QA HTTP step',authorId:trainer.id,type:'TRAINING',durationSec:90}});
  const occurrence=await prisma.stepOnDay.create({data:{dayId:day.id,stepId:step.id,order:1}});
  await prisma.courseAccess.create({data:{courseId:course.id,userId:learner.id}});
  const dayUrl=`/training/day?courseType=${encodeURIComponent(course.type)}&dayOnCourseId=${encodeURIComponent(link.id)}&createIfMissing=false`;
  await caseRun('Anonymous and invalid bearer are denied by identity, private day, profile and admin API',async()=>{
    for(const path of ['/auth/me','/user/profile',dayUrl,'/admin/users']){
      const r=await request(path);assert.equal(r.status,401,path);assert.equal(r.json.success,false);
    }
    assert.equal((await request('/auth/me','GET','qa-invalid-jwt')).status,401);
    assert.equal(await prisma.refreshToken.count(),0);
    return {http401:5,sqlSessions:0};
  });
  await caseRun('Invalid password returns HTTP 401 without SQL refresh session',async()=>{
    const r=await request('/auth/login','POST',undefined,{username:learner.username,password:'wrong'});
    assert.equal(r.status,401);assert.equal(r.json.success,false);
    assert.equal(await prisma.refreshToken.count(),0);
    return {httpStatus:r.status,sqlSessions:0};
  });
  await caseRun('Four authenticated HTTP logins create distinct JWTs and four SQL refresh sessions',async()=>{
    const unique=new Set<string>();
    for(const a of [trainer,learner,outsider,admin]){
      const r=await request('/auth/login','POST',undefined,{username:a.username,password:a.password});
      assert.equal(r.status,200,a.role);assert.equal(r.json.success,true);
      assert.equal(r.json.data?.user?.id,a.id);assert.equal(r.json.data?.user?.role,a.role);
      assert.equal(typeof r.json.data?.accessToken,'string');assert.equal(typeof r.json.data?.refreshToken,'string');
      a.token=r.json.data.accessToken;a.refresh=r.json.data.refreshToken;unique.add(a.token!);
      const rows=await session(a.id);assert.equal(rows.length,1);
      assert.equal(rows[0].tokenHash,createHash('sha256').update(a.refresh!).digest('hex'));
      assert.equal(rows[0].revokedAt,null);
    }
    assert.equal(unique.size,4);assert.equal(await prisma.refreshToken.count(),4);
    return {httpLogin200:4,sqlRefreshSessions:4,uniqueJwt:4};
  });
  await caseRun('Authenticated me and profile responses identify only the request owner',async()=>{
    for(const a of [learner,outsider,trainer]){
      const me=await request('/auth/me','GET',a.token);
      assert.equal(me.status,200);assert.equal(me.json.data?.id,a.id);assert.equal(me.json.data?.role,a.role);
      const profile=await request('/user/profile','GET',a.token);
      assert.equal(profile.status,200);assert.equal(profile.json.success,true);
      assert.equal(profile.json.data?.id,a.id);
      for(const other of [learner,outsider,trainer].filter(o=>o.id!==a.id)){
        assert.notEqual(profile.json.data?.id,other.id);
        assert.notEqual(profile.json.data?.username,other.username);
      }
    }
    assert.equal(await prisma.user.count({where:{id:{in:[learner.id,outsider.id,trainer.id]}}}),3);
    return {httpOwnerIdentity200:3,httpOwnerProfile200:3,sqlActorRows:3};
  });
  await caseRun('Assigned private training day is HTTP 200; foreign learner is HTTP 403 without SQL progress',async()=>{
    const own=await request(dayUrl,'GET',learner.token);
    assert.equal(own.status,200);assert.equal(own.json.success,true);
    const foreign=await request(dayUrl,'GET',outsider.token);
    assert.equal(foreign.status,403);assert.equal(foreign.json.code,'FORBIDDEN');
    assert.equal(await prisma.courseAccess.count({where:{courseId:course.id}}),1);
    assert.equal(await prisma.userTraining.count({where:{dayOnCourseId:link.id}}),0);
    return {httpOwnerDay:own.status,httpForeignDay:foreign.status,sqlCourseGrants:1,sqlTrainingProgress:0};
  });
  await caseRun('USER denied trainer/admin, TRAINER allowed own days only, ADMIN permitted protected user list',async()=>{
    const userTrainer=await request('/trainer/days','GET',learner.token);
    assert.equal(userTrainer.status,403);assert.equal(userTrainer.json.code,'FORBIDDEN');
    const userAdmin=await request('/admin/users','GET',learner.token);assert.equal(userAdmin.status,403);
    const trainerAdmin=await request('/admin/users','GET',trainer.token);assert.equal(trainerAdmin.status,403);
    const trainerDays=await request('/trainer/days','GET',trainer.token);
    assert.equal(trainerDays.status,200);assert.equal(trainerDays.json.success,true);
    const adminPanel=await request('/admin/users','GET',admin.token);
    assert.equal(adminPanel.status,200);assert.equal(adminPanel.json.success,true);
    assert.ok(Array.isArray(adminPanel.json.data?.users));
    const dbRoles=await prisma.user.findMany({where:{id:{in:[trainer.id,learner.id,admin.id]}},select:{role:true}});
    assert.deepEqual(new Set(dbRoles.map(r=>r.role)),new Set(['USER','TRAINER','ADMIN']));
    return {httpUserTrainerDenied:403,httpUserAdminDenied:403,httpTrainerAdminDenied:403,
      httpTrainerDays:200,httpAdminPanel:200,sqlRoles:3};
  });
  await caseRun('Foreign learner POST is denied; assigned learner POST persists exactly one bound SQL progress row',async()=>{
    const body={courseId:course.id,dayOnCourseId:link.id,stepIndex:0,durationSec:90,
      expectedStepOnDayId:occurrence.id,expectedStepId:step.id};
    const foreign=await request('/training/step/start','POST',outsider.token,body);
    assert.equal(foreign.status,403);
    assert.equal(await prisma.userTraining.count({where:{userId:outsider.id,dayOnCourseId:link.id}}),0);
    const own=await request('/training/step/start','POST',learner.token,body);
    assert.equal(own.status,200);assert.equal(own.json.success,true);
    const row=await prisma.userTraining.findUnique({where:{userId_dayOnCourseId:{userId:learner.id,dayOnCourseId:link.id}},
      select:{status:true,steps:{select:{status:true,stepOnDayId:true}}}});
    assert.equal(row?.status,'IN_PROGRESS');assert.equal(row.steps.length,1);
    assert.equal(row.steps[0].status,'IN_PROGRESS');assert.equal(row.steps[0].stepOnDayId,occurrence.id);
    assert.equal(await prisma.userTraining.count({where:{dayOnCourseId:link.id}}),1);
    return {httpForeignDenied:foreign.status,httpOwnerStart:own.status,sqlOwnerProgress:1,sqlForeignProgress:0};
  });
  await caseRun('Logout revokes refresh SQL session, denies bound access JWT, and rejects immediate refresh replay as HTTP 409',async()=>{
    const out=await request('/auth/logout','POST',undefined,{refreshToken:learner.refresh});
    assert.equal(out.status,200);assert.equal(out.json.success,true);
    const stored=await session(learner.id);assert.equal(stored.length,1);assert.ok(stored[0].revokedAt);
    const replay=await request('/auth/refresh','POST',undefined,{refreshToken:learner.refresh});
    assert.equal(replay.status,409);assert.equal(replay.json.code,'REFRESH_CONFLICT');
    const me=await request('/auth/me','GET',learner.token);
    assert.equal(me.status,401);
    return {httpLogout:out.status,httpRefreshDenied:replay.status,httpRevokedAccess:me.status,sqlRevokedSessions:1};
  });
  await caseRun('Fresh login then logout-all invalidates bearer and every owner SQL refresh row but not another user',async()=>{
    const login=await request('/auth/login','POST',undefined,{username:learner.username,password:learner.password});
    assert.equal(login.status,200);assert.equal(login.json.success,true);
    learner.token=login.json.data?.accessToken;learner.refresh=login.json.data?.refreshToken;
    assert.equal((await session(learner.id)).length,2);
    const ready=await request('/auth/me','GET',learner.token);assert.equal(ready.status,200);
    const out=await request('/auth/logout-all','POST',learner.token,{});
    assert.equal(out.status,200);assert.equal(out.json.success,true);
    const stored=await session(learner.id);assert.equal(stored.length,2);assert.ok(stored.every(r=>r.revokedAt));
    const user=await prisma.user.findUniqueOrThrow({where:{id:learner.id},select:{sessionsRevokedAt:true}});
    assert.ok(user.sessionsRevokedAt);
    const old=await request('/auth/me','GET',learner.token);assert.equal(old.status,401);
    const other=await request('/auth/me','GET',outsider.token);
    assert.equal(other.status,200);assert.equal(other.json.data?.id,outsider.id);
    return {httpLogoutAll:out.status,httpOldJwtDenied:old.status,httpOtherUnaffected:other.status,
      sqlRevokedSessions:stored.length,sqlRevokedTimestamp:true};
  });
  assert.equal(await prisma.courseAccess.count({where:{courseId:course.id}}),1);
  assert.equal(await prisma.userTraining.count({where:{dayOnCourseId:link.id}}),1);
}catch(e){error=e instanceof Error?e:new Error(String(e));console.error('QA_HTTP_SQL_FAIL',phase,error.message.slice(0,180))}
finally{
  if(server)await new Promise<void>(done=>server!.close(()=>done()));
  try{await prisma.$disconnect()}catch{}
  try{const {connection}=await import('@gafus/queues');await Promise.race([connection.quit(),new Promise(done=>setTimeout(done,1800))])}catch{}
}
const pass=!error&&names.length===9;
const sourceSha256=createHash('sha256').update(readFileSync(sourceFile)).digest('hex');
const honoAppSha256=createHash('sha256').update(readFileSync(resolve(sourceDir,'../app.ts'))).digest('hex');
const evidence={schema:1,sourceSha256,honoAppSha256,mode:'real-mounted-hono-over-loopback-tcp-disposable-pg18-redis',
  database:dbName,loopback:base,syntheticActors:4,tests:names.length,failedPhase:error?phase:null,
  cases:names.map(name=>({name,status:'passed'})),observations,
  sql:{expectedRefreshRows:5,expectedCourseGrants:1,expectedOwnerProgress:1,expectedForeignProgress:0},
  limitations:'real HTTP, Prisma, JWT and Redis; simulated users/course only, no external provider or migration-chain proof'};
writeFileSync(dirname(report)+'/api-http.json',JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
writeFileSync(report,JSON.stringify({numPassedTests:names.length,numFailedTests:error?1:0,numPendingTests:0,
  testResults:[{name:sourceFile,assertionResults:names.map(name=>({fullName:name,title:name,status:'passed'}))}]},null,2)+'\n',{mode:0o600});
console.log('QA_HTTP_SQL_RESULT',JSON.stringify({passing:names.length,failed:!!error,db:dbName,httpLoopback:base.startsWith('http://127.0.0.1:')}));
process.exit(pass?0:2);
