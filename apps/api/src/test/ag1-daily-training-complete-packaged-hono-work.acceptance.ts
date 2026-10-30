/** Original signed mounted Daily Course HTTP + real WORK full bound timeline.
 * An OLD unused published synthetic date is used; never edit TODAY's schedule.
 */
import {randomBytes} from 'node:crypto';
import {realpathSync} from 'node:fs';
import bcrypt from 'bcryptjs';
import {prisma} from '@gafus/prisma';
const ROOT='/Users/asmtv1/Desktop/gafus-refactor';
const prefix='ag1_daily_http_'+randomBytes(5).toString('hex');
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
  phase='BOUND_DAY_GET';
  const url='/daily-course/day?scheduleId='+encodeURIComponent(sched.id)+'&createIfMissing=false';
  const initial=await api(url,'GET',learner.token,undefined,true);
  check(initial.status===200&&initial.body.success===true,'REGISTERED_DAILY_DAY_GET200');
  const detail=o(initial.body.data);
  check(detail.onlineStepBinding==='BUNDLE_STEP_ID_V1'&&Array.isArray(detail.steps)&&detail.steps.length===1,'DAILY_BOUND_WIRE');
  const display=o(detail.steps[0]);
  check(display.bundleStepId===link.id&&display.id===step.id&&display.status==='NOT_STARTED','DAILY_PHYSICAL_OCCURRENCE_IN_RESPONSE');
  check((await prisma.dailyCourseUserTraining.count({where:{userId:learner.id,scheduleId:sched.id}}))===0,'READ_DID_NOT_INIT_PROGRESS');
  const payload={scheduleId:sched.id,stepIndex:0,expectedBundleStepId:link.id,expectedStepId:step.id};
  const bad=await api('/daily-course/step/start','POST',learner.token,{...payload,expectedBundleStepId:undefined,durationSec:120},true);
  check(bad.status===400&&o(bad.body).code==='INVALID_STEP_BINDING','MISSING_PAIR_400');
  const foreignRead=await api(url,'GET',foreign.token,undefined,true);
  check(foreignRead.status===200&&o(foreignRead.body.data).onlineStepBinding==='BUNDLE_STEP_ID_V1','FOREIGN_LEARNER_CAN_READ_PUBLIC_DAILY');
  check((await prisma.dailyCourseUserTraining.count({where:{userId:foreign.id,scheduleId:sched.id}}))===0,'FOREIGN_NO_SQL_WRITE');
  pass('DAILY_BOUND_GET_READONLY_OWN_AND_FOREIGN_AND_MISSING_PAIR400');
  phase='START';
  const start=await api('/daily-course/step/start','POST',learner.token,{...payload,durationSec:120},true);
  check(start.status===200&&start.body.success===true,'START_HTTP200');
  let state=await db(learner.id);
  check(state.status==='IN_PROGRESS'&&state.steps[0].status==='IN_PROGRESS'&&state.steps[0].remainingSec===120&&!state.steps[0].paused,'START120_WORK_SQL');
  pass('DAILY_START_ORIGINAL_HTTP200_SQL_TIMER120');
  phase='PAUSE';
  const pause=await api('/daily-course/step/pause','POST',learner.token,{...payload,timeLeftSec:53},true);
  check(pause.status===200&&pause.body.success===true,'PAUSE_HTTP200');
  state=await db(learner.id);
  check(state.steps[0].paused&&state.steps[0].remainingSec===53,'PAUSE53_WORK_SQL');
  const paused=await api(url,'GET',learner.token,undefined,true);
  check(paused.status===200&&o(paused.body.data).onlineStepBinding==='BUNDLE_STEP_ID_V1','PAUSE_GET_RELOAD');
  check(o((o(paused.body.data).steps as unknown[])[0]).status==='IN_PROGRESS','PAUSE_SERVER_STATUS');
  pass('DAILY_PAUSE_ORIGINAL_HTTP200_TIMER53_BOUND_RELOAD');
  phase='STALE';
  const stale=await api('/daily-course/step/resume','POST',learner.token,{...payload,expectedStepId:'wrong'+step.id},true);
  check(stale.status===409&&o(stale.body).code==='STALE_STEP_BINDING','STALE_OCCURRENCE409');
  state=await db(learner.id);check(state.steps[0].paused&&state.steps[0].remainingSec===53,'STALE_REJECTED_WITH_NO_WRITE');
  pass('DAILY_STALE409_NO_PROGRESS_WRITE');
  phase='RESUME';
  const resume=await api('/daily-course/step/resume','POST',learner.token,payload,true);
  check(resume.status===200&&resume.body.success===true,'RESUME_HTTP200');
  state=await db(learner.id);
  check(!state.steps[0].paused&&state.steps[0].remainingSec===53,'RESUME_PERSISTED_TIMER53');
  pass('DAILY_RESUME_HTTP200_TIMER_REMAINING53');
  phase='FINISH';
  const finish=await api('/daily-course/step/complete','POST',learner.token,payload,true);
  check(finish.status===200&&finish.body.success===true,'COMPLETE_HTTP200');
  state=await db(learner.id);
  check(state.status==='COMPLETED'&&state.steps[0].status==='COMPLETED','DURABLE_COMPLETE_SQL');
  const reloaded=await api(url,'GET',learner.token,undefined,true);
  check(reloaded.status===200&&o((o(reloaded.body.data).steps as unknown[])[0]).status==='COMPLETED','COMPLETED_DAY_GET');
  pass('DAILY_COMPLETE_HTTP200_SQL_COMPLETED_AND_BOUND_GET_RELOAD');
  phase='REPLAY';
  const repeat=await api('/daily-course/step/complete','POST',learner.token,payload,true);
  check(repeat.status===200||repeat.status===409,'REPLAY_KNOWN_RESPONSE');
  state=await db(learner.id);
  check(state.steps.length===1&&state.steps[0].status==='COMPLETED','REPLAY_NO_DUPLICATE_STEP');
  check(await prisma.dailyCourseUserTraining.count({where:{userId:foreign.id,scheduleId:sched.id}})===0,'FOREIGN_STILL_HAS_NO_PROGRESS');
  pass('DAILY_COMPLETE_REPLAY_SINGLE_OCCURRENCE_FOREIGN_UNTOUCHED');
  phase='CLEANUP';
  await cleanup();
  check(await prisma.user.count()===before,'OWN_SYNTHETIC_USERS_ZERO_RESIDUE');
  check((await prisma.dailyCourseSchedule.count({where:{date:testDate}}))===0,'OWN_TEST_DATE_GRAPH_REMOVED');
  pass('DAILY_OWN_USER_BUNDLE_SCHEDULE_PROGRESS_CLEANUP_ZERO_RESIDUE');
  pass('REGISTERED_ORIGINAL_DAILY_START_PAUSE_RESUME_COMPLETE_SQL_TIMER_RELOAD_ACCEPTED');
 }finally{await cleanup();}
}
void main().catch(e=>{process.exitCode=1;console.error('AG1_DAILY_FAIL_PHASE='+phase+';ERROR='+(e instanceof Error&&e.message.startsWith('DAILY_HTTP_')?e.message:(e instanceof Error?e.name:'UNKNOWN')));}).finally(async()=>{await prisma.$disconnect();});
