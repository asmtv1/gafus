/** Genuine signed ORIGINAL mounted Hono ordinary course full bound lifecycle + WORK SQL.
 * Only synthetic own USERS / trainer-course graph. No real snapshot user modifications.
 * Core-only LEARN032 proof is already accepted: this fills HTTP multi-request persistence.
 */
import {randomBytes} from 'node:crypto';
import {realpathSync} from 'node:fs';
import bcrypt from 'bcryptjs';
import {prisma} from '@gafus/prisma';
const root='/Users/asmtv1/Desktop/gafus-refactor';
const prefix='ag1_lifecycle_http_'+randomBytes(5).toString('hex');
const entities:{author?:string;learner?:string;foreign?:string;course?:string;day?:string;link?:string;step?:string;occurrence?:string}={};
let phase='PRECHECK';
function check(x:unknown,k:string):asserts x{if(!x)throw Error('LEARN_HTTP_'+k);}
function data(x:unknown):Record<string,unknown>{return x&&typeof x==='object'&&!Array.isArray(x)?x as Record<string,unknown>:{};}
function pass(k:string){console.warn('AG1_LEARN_NORMAL_REGISTERED_ORIGINAL_HONO_WORK '+k+'=PASS');}
const base='http://127.0.0.1:3001/api/v1';
async function api(path:string,method='GET',token?:string,payload?:unknown,binding=false){
 const r=await fetch(base+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(payload?{'Content-Type':'application/json'}:{}),...(binding?{'X-Gafus-Web-Step-Binding':'1'}:{})},body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(12000)});
 return {status:r.status,json:data(await r.json())};
}
async function actor(suffix:string,role:'TRAINER'|'USER'){
 const pwd=randomBytes(22).toString('base64url');
 const user=await prisma.user.create({data:{username:prefix+'_'+suffix,password:await bcrypt.hash(pwd,10),passwordSetAt:new Date(),registrationPending:false,role}});
 const login=await api('/auth/login','POST',undefined,{username:user.username,password:pwd});
 const token=data(login.json.data).accessToken;
 check(login.status===200&&login.json.success===true&&typeof token==='string','ORIGINAL_SIGNED_JWT_LOGIN');
 return{id:user.id,token};
}
async function cleanup(){
 if(entities.course){
   if(entities.link)await prisma.userTraining.deleteMany({where:{dayOnCourseId:entities.link}});
   await prisma.courseAccess.deleteMany({where:{courseId:entities.course}});
   await prisma.dayOnCourse.deleteMany({where:{courseId:entities.course}});
 }
 if(entities.day)await prisma.stepOnDay.deleteMany({where:{dayId:entities.day}});
 if(entities.step&&entities.author)await prisma.step.deleteMany({where:{id:entities.step,authorId:entities.author}});
 if(entities.day&&entities.author)await prisma.trainingDay.deleteMany({where:{id:entities.day,authorId:entities.author}});
 if(entities.course&&entities.author)await prisma.course.deleteMany({where:{id:entities.course,authorId:entities.author}});
 for(const id of [entities.learner,entities.foreign,entities.author]){
  if(!id)continue;
  const u=await prisma.user.findUnique({where:{id},select:{username:true}});
  if(u?.username.startsWith(prefix))await prisma.user.delete({where:{id}});
 }
}
async function state(learner:string){
 const ut=await prisma.userTraining.findUnique({where:{userId_dayOnCourseId:{userId:learner,dayOnCourseId:entities.link!}},select:{status:true,steps:{select:{status:true,paused:true,remainingSec:true,stepOnDayId:true}}}});
 check(ut&&ut.steps.length===1&&ut.steps[0].stepOnDayId===entities.occurrence,'SINGLE_ACTUAL_SQL_USERSTEP_OCCURRENCE');
 return ut;
}
async function main(){
 phase='ENV';
 check(process.env.AG1_NORMAL_COURSE_PACKAGED_WORK==='1','EXPLICIT_OPTIN');
 check(realpathSync(root)===root&&realpathSync(process.cwd())===root+'/apps/api','EXACT_PROJECT_ONLY');
 const u=new URL(process.env.DATABASE_URL??'');
 check(u.hostname==='127.0.0.1'&&u.port==='55921'&&u.username==='gafus_refactor_local_real'&&u.pathname==='/gafus_refactor_real_work_20261024','RESTRICTED_WORK_ONLY');
 check(process.env.NODE_ENV==='development'&&process.env.GAFUS_LOCAL_ISOLATED_API==='1','NONPROD_ONLY');
 check((await fetch('http://127.0.0.1:3001/ready',{signal:AbortSignal.timeout(4000)})).status===200,'ORIGINAL_HONO_READY');
 const beforeUsers=await prisma.user.count();
 const author=await actor('trainer','TRAINER');entities.author=author.id;
 const learner=await actor('learner','USER');entities.learner=learner.id;
 const foreign=await actor('foreign','USER');entities.foreign=foreign.id;
 try{
  phase='GRAPH';
  const courseType='ag1_life_'+randomBytes(4).toString('hex');
  const course=await prisma.course.create({data:{name:'AG1 HTTP own normal course',type:courseType,trainingLevel:'BEGINNER',duration:'1',logoImg:'',authorId:author.id,isPrivate:true}});entities.course=course.id;
  const day=await prisma.trainingDay.create({data:{title:'Own isolated normal day',authorId:author.id}});entities.day=day.id;
  const link=await prisma.dayOnCourse.create({data:{courseId:course.id,dayId:day.id,order:1}});entities.link=link.id;
  const step=await prisma.step.create({data:{title:'Own physical bound step',authorId:author.id,type:'TRAINING',durationSec:90}});entities.step=step.id;
  const occurrence=await prisma.stepOnDay.create({data:{dayId:day.id,stepId:step.id,order:17}});entities.occurrence=occurrence.id;
  await prisma.courseAccess.create({data:{courseId:course.id,userId:learner.id}});
  pass('REAL_THREE_SIGNED_ACTORS_SYNTHETIC_COURSE_EXACT_STEP_ON_DAY');
  phase='INITIAL_READ';
  const url=`/training/day?courseType=${encodeURIComponent(courseType)}&dayOnCourseId=${encodeURIComponent(link.id)}&createIfMissing=false`;
  const initial=await api(url,'GET',learner.token,undefined,true);
  check(initial.status===200&&initial.json.success===true,'REGISTERED_BOUND_DAY_GET200');
  const detail=data(initial.json.data),steps=detail.steps;
  check(detail.onlineStepBinding==='STEP_ON_DAY_ID_V1'&&Array.isArray(steps)&&steps.length===1,'NEGOTIATED_STEP_BINDING');
  const rendered=data(steps[0]);
  check(rendered.id===step.id&&rendered.stepOnDayId===occurrence.id&&rendered.status==='NOT_STARTED','PHYSICAL_STEP_ID_PAIR_IN_WIRE');
  check(await prisma.userTraining.count({where:{userId:learner.id}})===0,'INITIAL_READ_NO_NEW_MUTATION');
  const invalid=await api('/training/step/start','POST',learner.token,{courseId:course.id,dayOnCourseId:link.id,stepIndex:0,durationSec:90,expectedStepOnDayId:occurrence.id});
  check(invalid.status===400&&data(invalid.json).code==='INVALID_STEP_BINDING','PARTIAL_BINDING_DENY_400');
  const denied=await api('/training/step/start','POST',foreign.token,{courseId:course.id,dayOnCourseId:link.id,stepIndex:0,durationSec:90,expectedStepOnDayId:occurrence.id,expectedStepId:step.id});
  check(denied.status===403,'UNAUTHORIZED_FOREIGN_403');
  check(await prisma.userTraining.count({where:{userId:foreign.id}})===0,'FOREIGN_SQL_UNTOUCHED');
  pass('GET_DAY_EXACT_OCCURRENCE_PAIR_GUEST_DENY_AND_FOREIGN_SQL_ISOLATED');
  const payload={courseId:course.id,dayOnCourseId:link.id,stepIndex:0,expectedStepOnDayId:occurrence.id,expectedStepId:step.id};
  phase='START';
  const start=await api('/training/step/start','POST',learner.token,{...payload,durationSec:90});
  check(start.status===200&&start.json.success===true,'REGISTERED_START_200');
  let sql=await state(learner.id);
  check(sql.status==='IN_PROGRESS'&&sql.steps[0].status==='IN_PROGRESS'&&sql.steps[0].remainingSec===90&&!sql.steps[0].paused,'START_PERSISTED_TIMER90');
  pass('REGISTERED_START200_WORK_IN_PROGRESS_90S');
  phase='PAUSE';
  const pause=await api('/training/step/pause','POST',learner.token,{...payload,timeLeftSec:41});
  check(pause.status===200&&pause.json.success===true,'REGISTERED_PAUSE_200');
  sql=await state(learner.id);
  check(sql.steps[0].status==='IN_PROGRESS'&&sql.steps[0].paused&&sql.steps[0].remainingSec===41,'PAUSE_PERSISTED_41S');
  const pausedRead=await api(url,'GET',learner.token,undefined,true);
  check(pausedRead.status===200&&data(pausedRead.json.data).onlineStepBinding==='STEP_ON_DAY_ID_V1','PAUSE_GET_RELOAD200_BOUND');
  check(data((data(pausedRead.json.data).steps as unknown[])[0]).status==='IN_PROGRESS','PAUSE_RELOAD_SERVER_STATUS');
  pass('REGISTERED_PAUSE200_WORK_41S_AND_BOUND_GET_RELOAD');
  phase='RESUME';
  const resume=await api('/training/step/resume','POST',learner.token,payload);
  check(resume.status===200&&resume.json.success===true,'REGISTERED_RESUME_200');
  sql=await state(learner.id);
  check(!sql.steps[0].paused&&sql.steps[0].remainingSec===41,'RESUME_STABLE_TIMER_RELOAD_SQL');
  pass('REGISTERED_RESUME200_PRESERVES_41S_TIMER');
  phase='STALE';
  const stale=await api('/training/step/complete/practice','POST',learner.token,{...payload,expectedStepId:'stale-'+step.id});
  check(stale.status===409&&data(stale.json).code==='STALE_STEP_BINDING','STALE_EXPECTED_STEP409');
  sql=await state(learner.id);
  check(sql.steps[0].status==='IN_PROGRESS','STALE_NOT_COMMITTED');
  pass('STALE_PAIR_409_NO_MUTATION');
  phase='COMPLETE';
  const finish=await api('/training/step/complete/practice','POST',learner.token,payload);
  check(finish.status===200&&finish.json.success===true,'REGISTERED_FINISH_200');
  sql=await state(learner.id);
  check(sql.steps[0].status==='COMPLETED'&&sql.status==='COMPLETED','COMPLETE_DURABLE_SQL');
  const reload=await api(url,'GET',learner.token,undefined,true);
  check(reload.status===200&&reload.json.success===true,'COMPLETED_DAY_GET200');
  const afterSteps=data(reload.json.data).steps;
  check(Array.isArray(afterSteps)&&data(afterSteps[0]).status==='COMPLETED','COMPLETED_GET_RELOAD_STATUS');
  pass('REGISTERED_FINISH200_WORK_COMPLETED_AND_GET_RELOAD');
  phase='REPLAY';
  const retry=await api('/training/step/complete/practice','POST',learner.token,payload);
  check(retry.status===200||retry.status===409,'RETRY_IS_KNOWN_SUCCESS_OR_INVALID_STATE');
  sql=await state(learner.id);
  check(sql.steps.length===1&&sql.steps[0].status==='COMPLETED','RETRY_NO_DUPLICATE_ROWS');
  pass('FINISH_REPLAY_ONE_USERSTEP_NO_EXTRA_SQL_ROWS');
  await cleanup();
  check(await prisma.user.count()===beforeUsers,'ALL_SYNTHETIC_USERS_RETIRED_AND_ORIGINAL_TOTAL_RESTORED');
  check(await prisma.course.count({where:{type:courseType}})===0,'ONLY_OWN_COURSE_GRAPH_DELETED');
  pass('EXACT_OWN_USER_COURSE_PROGRESS_CLEANUP_ZERO_RESIDUE');
  pass('ORIGINAL_PACKAGED_NORMAL_TRAINING_START_PAUSE_RESUME_FINISH_SQL_TIMER_GET_ACCEPTED');
 }finally{await cleanup();}
}
void main().catch(e=>{process.exitCode=1;console.error('AG1_NORMAL_TRAINING_FAIL_PHASE='+phase+';ERROR='+(e instanceof Error&&e.message.startsWith('LEARN_HTTP_')?e.message:(e instanceof Error?e.name:'UNKNOWN')));}).finally(async()=>{await prisma.$disconnect();});
