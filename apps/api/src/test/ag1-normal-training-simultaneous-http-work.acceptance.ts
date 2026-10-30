/** Genuine signed ORIGINAL mounted Hono ordinary course full bound lifecycle + WORK SQL.
 * Only synthetic own USERS / trainer-course graph. No real snapshot user modifications.
 * Core-only LEARN032 proof is already accepted: this fills HTTP multi-request persistence.
 */
import {randomBytes} from 'node:crypto';
import {realpathSync} from 'node:fs';
import bcrypt from 'bcryptjs';
import {prisma} from '@gafus/prisma';
const root='/Users/asmtv1/Desktop/gafus-refactor';
const prefix='ag1_race_normal_'+randomBytes(5).toString('hex');
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
  phase='INITIAL_BOUND_CONCURRENT_GUARDS';
  const url=`/training/day?courseType=${encodeURIComponent(courseType)}&dayOnCourseId=${encodeURIComponent(link.id)}&createIfMissing=false`;
  const initial=await api(url,'GET',learner.token,undefined,true);
  check(initial.status===200&&data(initial.json.data).onlineStepBinding==='STEP_ON_DAY_ID_V1','REAL_BOUND_SNAPSHOT');
  check(data((data(initial.json.data).steps as unknown[])[0]).stepOnDayId===occurrence.id,'PHYSICAL_OCCURRENCE_PAIR');
  const payload={courseId:course.id,dayOnCourseId:link.id,stepIndex:0,expectedStepOnDayId:occurrence.id,expectedStepId:step.id};
  const guarded={...payload,durationSec:90};
  // All promises are constructed without awaiting any response. Real sockets to the
  // original mounted Hono, no app.request/mock/Prisma transaction proxy.
  const [forbidden,stale]=await Promise.all([
    api('/training/step/start','POST',foreign.token,guarded),
    api('/training/step/start','POST',learner.token,{...guarded,expectedStepId:'foreign-'+step.id}),
  ]);
  check(forbidden.status===403&&stale.status===409,'CONCURRENT_FOREIGN403_AND_STALE409');
  check(await prisma.userTraining.count({where:{userId:learner.id}})===0,'CONCURRENT_BAD_PAIR_NO_OWNER_PROGRESS');
  check(await prisma.userTraining.count({where:{userId:foreign.id}})===0,'CONCURRENT_FOREIGN_NO_PROGRESS');
  pass('CONCURRENT_DIFFERENT_JWT_FOREIGN403_STALE409_NO_SQL_EFFECT');
  phase='PARALLEL_START';
  const startResults=await Promise.all([
    api('/training/step/start','POST',learner.token,guarded),
    api('/training/step/start','POST',learner.token,guarded),
  ]);
  console.warn('AG1_RACE_NORMAL_START_HTTP_STATUSES='+startResults.map(x=>x.status).sort().join(','));
  check(startResults.every(r=>r.status===200||r.status===409)&&startResults.some(r=>r.status===200),'TWO_STARTS_NO_500_ONE_SUCCEEDED');
  let sql=await state(learner.id);
  check(sql.status==='IN_PROGRESS'&&sql.steps[0].status==='IN_PROGRESS'&&sql.steps[0].remainingSec===90&&!sql.steps[0].paused,'ONE_BOUND_STARTED_USERSTEP_TIMER90');
  check(await prisma.userStep.count({where:{userTraining:{userId:learner.id,dayOnCourseId:link.id}}})===1,'NO_DUPLICATE_STEP_AFTER_SIMULTANEOUS_START');
  check(await prisma.stepNotification.count({where:{userId:learner.id,stepOnDayId:occurrence.id}})===0,'NO_PUSH_NOTIFICATION_WITHOUT_SUBSCRIPTION');
  pass('ACTUAL_PARALLEL_START_HTTP_SINGLE_SQL_USERSTEP_90_NO_PUSH_EFFECT');
  phase='UNKNOWN_ACK_RECOVERY';
  // An ACK may have been lost: read persisted state first, then send a known
  // replay with different duration. It must NEVER reset an already running timer.
  const recovered=await state(learner.id);
  check(recovered.steps[0].remainingSec===90,'UNKNOWN_ACK_SQL_RECONCILED_BEFORE_REPLAY');
  const replay=await api('/training/step/start','POST',learner.token,{...payload,durationSec:11});
  check(replay.status===200||replay.status===409,'KNOWN_REPLAY_ACK');
  sql=await state(learner.id);
  check(sql.steps[0].remainingSec===90,'START_RETRY_DIFFERENT_DURATION_CANNOT_RESET_90');
  pass('SQL_RECONCILIATION_BEFORE_DIFFERENT_DURATION_START_REPLAY_NO_TIMER_RESET');
  phase='PAUSE_RESUME_OVERLAP';
  const overlap=await Promise.all([
    api('/training/step/pause','POST',learner.token,{...payload,timeLeftSec:37}),
    api('/training/step/resume','POST',learner.token,payload),
  ]);
  console.warn('AG1_RACE_NORMAL_PAUSE_RESUME_HTTP_STATUSES='+overlap.map(x=>x.status).sort().join(','));
  check(overlap[0].status===200&&(overlap[1].status===200||overlap[1].status===409),'PAUSE_RESUME_SERIALIZABLE_RESPONSES');
  sql=await state(learner.id);
  check(sql.steps[0].remainingSec===37&&sql.steps[0].status==='IN_PROGRESS','OVERLAP_PERSISTED_TIMER37');
  const progress=await api(url,'GET',learner.token,undefined,true);
  check(progress.status===200&&data(progress.json.data).onlineStepBinding==='STEP_ON_DAY_ID_V1','RACE_RELOAD_BOUND_GET');
  check(data((data(progress.json.data).steps as unknown[])[0]).status==='IN_PROGRESS','RACE_RELOAD_NO_PREMATURE_COMPLETE');
  pass('ACTUAL_PAUSE_RESUME_OVERLAP_SQL_TIMER37_CONSISTENT_WITH_GET');
  phase='CONCURRENT_COMPLETE';
  const doneResults=await Promise.all([
    api('/training/step/complete/practice','POST',learner.token,payload),
    api('/training/step/complete/practice','POST',learner.token,payload),
  ]);
  console.warn('AG1_RACE_NORMAL_COMPLETE_HTTP_STATUSES='+doneResults.map(x=>x.status).sort().join(','));
  check(doneResults.every(r=>r.status===200||r.status===409)&&doneResults.some(r=>r.status===200),'SIMULTANEOUS_COMPLETE_NO_500_ONE_SUCCEEDED');
  sql=await state(learner.id);
  check(sql.steps.length===1&&sql.steps[0].status==='COMPLETED'&&sql.status==='COMPLETED','SINGLE_COMPLETED_USERSTEP');
  check(await prisma.userStep.count({where:{userTraining:{userId:learner.id,dayOnCourseId:link.id}}})===1,'NO_SECOND_STEP_ON_COMPLETE_RACE');
  const finished=await api(url,'GET',learner.token,undefined,true);
  check(finished.status===200&&data((data(finished.json.data).steps as unknown[])[0]).status==='COMPLETED','FINISH_POST_RACE_GET_RELOAD');
  pass('SIMULTANEOUS_COMPLETE_ONE_DURABLE_COMPLETED_STEP_NO_DOUBLE_ROW');
  phase='FINAL_GUARDS';
  const deniedDone=await Promise.all([
    api('/training/step/complete/practice','POST',foreign.token,payload),
    api('/training/step/complete/practice','POST',learner.token,{...payload,expectedStepOnDayId:'stale'+occurrence.id}),
  ]);
  check(deniedDone[0].status===403&&deniedDone[1].status===409,'FOREIGN_AND_STALE_SIMULTANEOUS_DENIAL');
  check(await prisma.userTraining.count({where:{userId:foreign.id}})===0,'FOREIGN_FINAL_SQL_ABSENT');
  pass('PARALLEL_FOREIGN_AND_STALE_COMPLETE_NO_FOREIGN_PROGRESS');
  await cleanup();
  check(await prisma.user.count()===beforeUsers,'ALL_SYNTHETIC_USERS_RETIRED_AND_ORIGINAL_TOTAL_RESTORED');
  check(await prisma.course.count({where:{type:courseType}})===0,'ONLY_OWN_COURSE_GRAPH_DELETED');
  pass('EXACT_OWN_USER_COURSE_PROGRESS_CLEANUP_ZERO_RESIDUE');
  pass('ORIGINAL_PACKAGED_NORMAL_REAL_TCP_SIMULTANEOUS_REQUEST_RACE_ACCEPTED');
 }finally{await cleanup();}
}
void main().catch(e=>{process.exitCode=1;console.error('AG1_NORMAL_TRAINING_FAIL_PHASE='+phase+';ERROR='+(e instanceof Error&&e.message.startsWith('LEARN_HTTP_')?e.message:(e instanceof Error?e.name:'UNKNOWN')));}).finally(async()=>{await prisma.$disconnect();});
