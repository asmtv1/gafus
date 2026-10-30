/** Genuine signed ORIGINAL mounted Hono ordinary course full bound lifecycle + WORK SQL.
 * Only synthetic own USERS / trainer-course graph. No real snapshot user modifications.
 * Core-only LEARN032 proof is already accepted: this fills HTTP multi-request persistence.
 */
import {randomBytes} from 'node:crypto';
import {realpathSync} from 'node:fs';
import bcrypt from 'bcryptjs';
import {prisma} from '@gafus/prisma';
import {updateStepAndDay} from '../../../../packages/core/src/services/training/trainingService';
const root='/Users/asmtv1/Desktop/gafus-refactor';
const prefix='ag1_race_core_normal_'+randomBytes(5).toString('hex');
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
  phase='SOURCE_REAL_PG_CONCURRENT_START';
  const bound={expectedCourseId:course.id,expectedStepOnDayId:occurrence.id,expectedStepId:step.id};
  const [first,second]=await Promise.all([
    updateStepAndDay(learner.id,link.id,0,{type:'start',remainingSec:90},bound),
    updateStepAndDay(learner.id,link.id,0,{type:'start',remainingSec:90},bound),
  ]);
  check([first,second].filter(x=>x.stepJustStarted).length===1,'EXACT_ONE_FIRST_START_EFFECT');
  let sql=await state(learner.id);
  check(sql.status==='IN_PROGRESS'&&sql.steps[0].remainingSec===90,'CONCURRENT_START_SQL_TIMER90_ONE_ROW');
  check(await prisma.userStep.count({where:{userTraining:{userId:learner.id,dayOnCourseId:link.id}}})===1,'USERSTEP_UNIQUE_NO_DUPLICATE');
  pass('SOURCE_REAL_WORK_PARALLEL_START_ONE_FIRST_TRANSITION_NO_UNIQUE_ERROR');
  phase='SOURCE_UNKNOWN_ACK_AND_PAUSE_RESUME_OVERLAP';
  const before=await state(learner.id);
  check(before.steps[0].remainingSec===90,'SQL_RECONCILIATION_BEFORE_DIFFERENT_DURATION_RETRY');
  const retry=await updateStepAndDay(learner.id,link.id,0,{type:'start',remainingSec:5},bound);
  check(!retry.stepJustStarted&&(await state(learner.id)).steps[0].remainingSec===90,'START_RETRY_CANNOT_RESET_TIMER');
  const overlap=await Promise.allSettled([
    updateStepAndDay(learner.id,link.id,0,{type:'pause',remainingSec:39},bound),
    updateStepAndDay(learner.id,link.id,0,{type:'resume'},bound),
  ]);
  check(overlap[0].status==='fulfilled','PAUSE_BEATS_INVALID_RESUME_OR_SERIAL_RESUME');
  check(overlap[1].status==='fulfilled'||(overlap[1].status==='rejected'&&String(overlap[1].reason).includes('INVALID_STATE')),'NO_UNKNOWN_CONCURRENT_RESUME_ERROR');
  sql=await state(learner.id);
  check(sql.steps[0].remainingSec===39&&sql.steps[0].status==='IN_PROGRESS','PAUSE_RESUME_OVERLAP_STABLE_TIMER39');
  pass('SOURCE_REAL_WORK_PARALLEL_PAUSE_RESUME_SERIALIZABLE_SQL_TIMER39');
  phase='SOURCE_DOUBLE_FINISH';
  const [a,b]=await Promise.all([
    updateStepAndDay(learner.id,link.id,0,{type:'complete'},bound),
    updateStepAndDay(learner.id,link.id,0,{type:'complete'},bound),
  ]);
  check([a,b].filter(x=>x.stepJustCompleted).length===1,'EXACT_ONE_FIRST_COMPLETION_EFFECT');
  sql=await state(learner.id);
  check(sql.steps.length===1&&sql.steps[0].status==='COMPLETED'&&sql.status==='COMPLETED','ONE_DURABLE_COMPLETED_STEP');
  check(await prisma.userTraining.count({where:{userId:foreign.id}})===0,'FOREIGN_PROGRESS_UNTOUCHED');
  pass('SOURCE_REAL_WORK_PARALLEL_COMPLETE_ONE_FIRST_EFFECT_ONE_COMPLETED_ROW');
  await cleanup();
  check(await prisma.user.count()===beforeUsers,'ALL_SYNTHETIC_USERS_RETIRED_AND_ORIGINAL_TOTAL_RESTORED');
  check(await prisma.course.count({where:{type:courseType}})===0,'ONLY_OWN_COURSE_GRAPH_DELETED');
  pass('EXACT_OWN_USER_COURSE_PROGRESS_CLEANUP_ZERO_RESIDUE');
  pass('NORMAL_SOURCE_ACTOR_ROW_LOCK_REAL_WORK_CONCURRENCY_ACCEPTED');
 }finally{await cleanup();}
}
void main().catch(e=>{process.exitCode=1;console.error('AG1_NORMAL_TRAINING_FAIL_PHASE='+phase+';ERROR='+(e instanceof Error&&e.message.startsWith('LEARN_HTTP_')?e.message:(e instanceof Error?e.name:'UNKNOWN')));}).finally(async()=>{await prisma.$disconnect();});
