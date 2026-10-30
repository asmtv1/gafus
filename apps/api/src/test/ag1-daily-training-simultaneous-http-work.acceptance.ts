/** Original signed mounted Daily Course HTTP + real WORK full bound timeline.
 * An OLD unused published synthetic date is used; never edit TODAY's schedule.
 */
import {randomBytes} from 'node:crypto';
import {realpathSync} from 'node:fs';
import bcrypt from 'bcryptjs';
import {prisma} from '@gafus/prisma';
const ROOT='/Users/asmtv1/Desktop/gafus-refactor';
const prefix='ag1_race_daily_'+randomBytes(5).toString('hex');
const owned:{author?:string;learner?:string;foreign?:string;bundle?:string;step?:string;link?:string;schedule?:string}={};
const testDate=new Date('2020-01-01T00:00:00.000Z');
let phase='GUARD';
function check(x:unknown,name:string):asserts x{if(!x)throw Error('DAILY_HTTP_'+name);}
function o(x:unknown):Record<string,unknown>{return x&&typeof x==='object'&&!Array.isArray(x)?x as Record<string,unknown>:{};}
function pass(x:string){console.warn('AG1_DAILY_ORIGINAL_HONO_WORK '+x+'=PASS');}
async function api(path:string,method='GET',token?:string,payload?:unknown,binding=false){
 const r=await fetch('http://127.0.0.1:3001/api/v1'+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(payload?{'Content-Type':'application/json'}:{}),...(binding?{'X-Gafus-Web-Daily-Binding':'1'}:{})},body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(12000)});
 return {status:r.status,body:o(await r.json())};
}
async function actor(name:string,role:'TRAINER'|'USER'){
 const password=randomBytes(22).toString('base64url');
 const user=await prisma.user.create({data:{username:prefix+'_'+name,password:await bcrypt.hash(password,10),passwordSetAt:new Date(),registrationPending:false,role}});
 const session=await api('/auth/login','POST',undefined,{username:user.username,password});
 const token=o(session.body.data).accessToken;
 check(session.status===200&&typeof token==='string','JWT_LOGIN');
 return{id:user.id,token};
}
async function cleanup(){
 if(owned.schedule){
  const row=await prisma.dailyCourseSchedule.findUnique({where:{id:owned.schedule},select:{date:true,createdById:true}});
  if(row&&row.createdById===owned.author&&row.date.getTime()===testDate.getTime())await prisma.dailyCourseSchedule.delete({where:{id:owned.schedule}});
 }
 if(owned.link)await prisma.dailyCourseBundleStep.deleteMany({where:{id:owned.link,bundleId:owned.bundle}});
 if(owned.bundle)await prisma.dailyCourseBundle.deleteMany({where:{id:owned.bundle,authorId:owned.author}});
 if(owned.step)await prisma.step.deleteMany({where:{id:owned.step,authorId:owned.author}});
 for(const id of [owned.learner,owned.foreign,owned.author]){
  if(!id)continue;const row=await prisma.user.findUnique({where:{id},select:{username:true}});
  if(row?.username.startsWith(prefix))await prisma.user.delete({where:{id}});
 }
}
async function db(userId:string){
 const t=await prisma.dailyCourseUserTraining.findUnique({where:{userId_scheduleId:{userId,scheduleId:owned.schedule!}},select:{status:true,steps:{select:{bundleStepId:true,status:true,paused:true,remainingSec:true}}}});
 check(t&&t.steps.length===1&&t.steps[0].bundleStepId===owned.link,'ONE_STABLE_BUNDLE_OCCURRENCE_SQL');
 return t;
}
async function main(){
 check(process.env.AG1_DAILY_LIFECYCLE_PACKAGED_WORK==='1','OPTIN');
 check(realpathSync(ROOT)===ROOT&&realpathSync(process.cwd())===ROOT+'/apps/api','EXACT_ROOT');
 const u=new URL(process.env.DATABASE_URL??'');
 check(u.hostname==='127.0.0.1'&&u.port==='55921'&&u.username==='gafus_refactor_local_real'&&u.pathname==='/gafus_refactor_real_work_20261024','RESTRICTED_SQL');
 check(process.env.NODE_ENV==='development'&&process.env.GAFUS_LOCAL_ISOLATED_API==='1','NONPROD_ONLY');
 check((await fetch('http://127.0.0.1:3001/ready',{signal:AbortSignal.timeout(4000)})).status===200,'READY');
 check((await prisma.dailyCourseSchedule.count({where:{date:testDate}}))===0,'HISTORICAL_TEST_DATE_FREE');
 const before=await prisma.user.count();
 const author=await actor('trainer','TRAINER');owned.author=author.id;
 const learner=await actor('learner','USER');owned.learner=learner.id;
 const foreign=await actor('other','USER');owned.foreign=foreign.id;
 try{
  phase='OWN_DAILY_GRAPH';
  const step=await prisma.step.create({data:{title:'AG1 historical daily fixture step',authorId:author.id,type:'TRAINING',durationSec:120}});owned.step=step.id;
  const bundle=await prisma.dailyCourseBundle.create({data:{authorId:author.id,title:'AG1 owned isolated daily historical',type:'regular'}});owned.bundle=bundle.id;
  const link=await prisma.dailyCourseBundleStep.create({data:{bundleId:bundle.id,stepId:step.id,order:7}});owned.link=link.id;
  const sched=await prisma.dailyCourseSchedule.create({data:{date:testDate,bundleId:bundle.id,createdById:author.id,isPublished:true}});owned.schedule=sched.id;
  pass('OWN_PUBLISHED_HISTORIC_SCHEDULE_NEVER_EDIT_TODAY_AND_SIGNED_ACTORS');
  phase='CONCURRENT_DAILY_BAD_BINDING';
  const url='/daily-course/day?scheduleId='+encodeURIComponent(sched.id)+'&createIfMissing=false';
  const dayRead=await api(url,'GET',learner.token,undefined,true);
  check(dayRead.status===200&&o(dayRead.body.data).onlineStepBinding==='BUNDLE_STEP_ID_V1','PHYSICAL_DAILY_BOUND_GET');
  const payload={scheduleId:sched.id,stepIndex:0,expectedBundleStepId:link.id,expectedStepId:step.id};
  const denies=await Promise.all([
    api('/daily-course/step/start','POST',learner.token,{...payload,expectedStepId:'bad'+step.id,durationSec:120},true),
    api('/daily-course/step/start','POST',learner.token,{...payload,expectedBundleStepId:undefined,durationSec:120},true),
  ]);
  check(denies[0].status===409&&denies[1].status===400,'DAILY_PARALLEL_STALE409_PARTIAL400');
  check(await prisma.dailyCourseUserTraining.count({where:{userId:learner.id,scheduleId:sched.id}})===0,'DAILY_PARALLEL_BAD_CALLS_NO_SQL');
  pass('DAILY_PARALLEL_STALE409_PARTIAL400_ZERO_PROGRESS');
  phase='PARALLEL_DAILY_START';
  const results=await Promise.all([
    api('/daily-course/step/start','POST',learner.token,{...payload,durationSec:120},true),
    api('/daily-course/step/start','POST',learner.token,{...payload,durationSec:120},true),
  ]);
  console.warn('AG1_RACE_DAILY_START_HTTP_STATUSES='+results.map(r=>r.status).sort().join(','));
  check(results.every(x=>x.status===200||x.status===409)&&results.some(x=>x.status===200),'DAILY_CONCURRENT_START_KNOWN_SUCCESS_OR_CONFLICT');
  let stepState=await db(learner.id);
  check(stepState.steps.length===1&&stepState.steps[0].remainingSec===120,'DAILY_SINGLE_SQL_USERSTEP_TIMER120');
  pass('DAILY_PARALLEL_TWO_STARTS_ONE_SQL_STEP');
  phase='ACK_RECONCILIATION';
  check((await db(learner.id)).steps[0].remainingSec===120,'DAILY_RECONCILE_SQL_BEFORE_KNOWN_RETRY');
  const replay=await api('/daily-course/step/start','POST',learner.token,{...payload,durationSec:120},true);
  check(replay.status===200||replay.status===409,'DAILY_KNOWN_START_REPLAY');
  check((await db(learner.id)).steps[0].remainingSec===120,'DAILY_REPLAY_SINGLE_DURATION');
  pass('DAILY_SQL_BEFORE_ACK_REPLAY_NO_DUPLICATE');
  phase='DAILY_PAUSE_RESUME_OVERLAP';
  const overlap=await Promise.all([
    api('/daily-course/step/pause','POST',learner.token,{...payload,timeLeftSec:48},true),
    api('/daily-course/step/resume','POST',learner.token,payload,true),
  ]);
  console.warn('AG1_RACE_DAILY_PAUSE_RESUME_HTTP_STATUSES='+overlap.map(r=>r.status).sort().join(','));
  check(overlap[0].status===200&&(overlap[1].status===200||overlap[1].status===409),'DAILY_OVERLAP_KNOWN_STATES');
  stepState=await db(learner.id);
  check(stepState.steps[0].remainingSec===48,'DAILY_OVERLAP_TIMER48');
  const reload=await api(url,'GET',learner.token,undefined,true);
  check(reload.status===200&&o((o(reload.body.data).steps as unknown[])[0]).status==='IN_PROGRESS','DAILY_RACE_RELOAD_IN_PROGRESS');
  pass('DAILY_PAUSE_RESUME_OVERLAP_TIMER48_SQL_AND_GET');
  phase='DAILY_PARALLEL_COMPLETE';
  const fin=await Promise.all([
    api('/daily-course/step/complete','POST',learner.token,payload,true),
    api('/daily-course/step/complete','POST',learner.token,payload,true),
  ]);
  console.warn('AG1_RACE_DAILY_COMPLETE_HTTP_STATUSES='+fin.map(r=>r.status).sort().join(','));
  check(fin.every(r=>r.status===200||r.status===409)&&fin.some(r=>r.status===200),'DAILY_DOUBLE_COMPLETE_NO_500');
  stepState=await db(learner.id);
  check(stepState.status==='COMPLETED'&&stepState.steps.length===1&&stepState.steps[0].status==='COMPLETED','DAILY_DOUBLE_COMPLETE_SINGLE_SQL');
  check(await prisma.dailyCourseUserTraining.count({where:{userId:foreign.id,scheduleId:sched.id}})===0,'DAILY_NO_FOREIGN_PROGRESS');
  pass('DAILY_PARALLEL_COMPLETE_ONE_SQL_AND_FOREIGN_UNTOUCHED');
  phase='CLEANUP';
  await cleanup();
  check(await prisma.user.count()===before,'OWN_SYNTHETIC_USERS_ZERO_RESIDUE');
  check((await prisma.dailyCourseSchedule.count({where:{date:testDate}}))===0,'OWN_TEST_DATE_GRAPH_REMOVED');
  pass('DAILY_OWN_USER_BUNDLE_SCHEDULE_PROGRESS_CLEANUP_ZERO_RESIDUE');
  pass('DAILY_ORIGINAL_HONO_TRUE_SIMULTANEOUS_REQUEST_RACE_ACCEPTED');
 }finally{await cleanup();}
}
void main().catch(e=>{process.exitCode=1;console.error('AG1_DAILY_FAIL_PHASE='+phase+';ERROR='+(e instanceof Error&&e.message.startsWith('DAILY_HTTP_')?e.message:(e instanceof Error?e.name:'UNKNOWN')));}).finally(async()=>{await prisma.$disconnect();});
