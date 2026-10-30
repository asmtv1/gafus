/** Genuine signed ORIGINAL mounted Hono ordinary course full bound lifecycle + WORK SQL.
 * Only synthetic own USERS / trainer-course graph. No real snapshot user modifications.
 * Core-only LEARN032 proof is already accepted: this fills HTTP multi-request persistence.
 */
import {randomBytes} from 'node:crypto';
import {realpathSync} from 'node:fs';
import bcrypt from 'bcryptjs';
import {prisma} from '@gafus/prisma';
import {pushQueue,connection} from '@gafus/queues';
const ownQueueJobs=new Set<string>();
const extra:{step?:string,link?:string}={};
const root='/Users/asmtv1/Desktop/gafus-refactor';
const prefix='ag1_notif_reorder_'+randomBytes(5).toString('hex');
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
 for(const id of ownQueueJobs){
  try{const job=await pushQueue.getJob(id);if(job)await job.remove();}
  catch(error){console.error('AG1_NOTIF_OWN_JOB_CLEANUP_REVIEW_'+(error instanceof Error?error.name:'UNKNOWN'));process.exitCode=1;}
 }
 if(entities.learner){
  await prisma.stepNotification.deleteMany({where:{userId:entities.learner}});
  await prisma.pushSubscription.deleteMany({where:{userId:entities.learner}});
 }
 if(entities.course){
   if(entities.link)await prisma.userTraining.deleteMany({where:{dayOnCourseId:entities.link}});
   await prisma.courseAccess.deleteMany({where:{courseId:entities.course}});
   await prisma.dayOnCourse.deleteMany({where:{courseId:entities.course}});
 }
 if(entities.day)await prisma.stepOnDay.deleteMany({where:{dayId:entities.day}});
 if(extra.step&&entities.author)await prisma.step.deleteMany({where:{id:extra.step,authorId:entities.author}});
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
 check(process.env.AG1_BOUND_NOTIF_SUBSCRIBED_WORK==='1'&&process.env.REDIS_URL==='redis://127.0.0.1:55927/1','ONLY_PROJECT_ISOLATED_PUSH_QUEUE');
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
  const step=await prisma.step.create({data:{title:'Own physical bound step',authorId:author.id,type:'TRAINING',durationSec:14400}});entities.step=step.id;
  const occurrence=await prisma.stepOnDay.create({data:{dayId:day.id,stepId:step.id,order:17}});entities.occurrence=occurrence.id;
  await prisma.courseAccess.create({data:{courseId:course.id,userId:learner.id}});
  pass('REAL_THREE_SIGNED_ACTORS_SYNTHETIC_COURSE_EXACT_STEP_ON_DAY');
  phase='FAKE_LOCAL_PUSH_SUBSCRIPTION';
  const endpoint=`https://${prefix}.invalid/never-send`; // syntactically valid, unresolvable TLD.
  await prisma.pushSubscription.create({data:{userId:learner.id,endpoint,keys:{p256dh:'synthetic_only',auth:'synthetic_only'}}});
  check((await prisma.pushSubscription.count({where:{userId:learner.id}}))===1,'ONE_NON_DELIVERABLE_OWN_PUSH_SUBSCRIPTION');
  pass('ONE_SYNTHETIC_UNROUTABLE_PUSH_SUBSCRIPTION_PROJECT_REDIS_ONLY');
  const payload={courseId:course.id,dayOnCourseId:link.id,stepIndex:0,expectedStepOnDayId:occurrence.id,expectedStepId:step.id};
  const durationSec=14400; // Four hours: job is not eligible during this acceptance.
  async function row(){return prisma.stepNotification.findMany({where:{userId:learner.id,dayOnCourseId:link.id,stepOnDayId:occurrence.id},select:{id:true,jobId:true,sent:true,paused:true,remainingSec:true,endTs:true,stepIndex:true,originalStepId:true}});}
  async function pollOne(){
   for(let i=0;i<36;i++){
    const x=await row();
    if(x.length===1&&x[0].jobId)return x[0];
    await new Promise(resolve=>setTimeout(resolve,100));
   }
   throw Error('NOTIF_QUEUE_PERSISTENCE_TIMEOUT');
  }
  const getDay=()=>api(`/training/day?courseType=${encodeURIComponent(courseType)}&dayOnCourseId=${encodeURIComponent(link.id)}&createIfMissing=false`,'GET',learner.token,undefined,true);
  const first=await getDay();
  check(first.status===200&&data(first.json.data).onlineStepBinding==='STEP_ON_DAY_ID_V1','REAL_BOUND_DAY_READ');
  check(data((data(first.json.data).steps as unknown[])[0]).stepOnDayId===occurrence.id,'EXPECTED_OWN_OCCURRENCE');
  phase='FOREIGN_STALE_CONCURRENT_NO_EFFECT';
  const bad=await Promise.all([
   api('/training/step/start','POST',foreign.token,{...payload,durationSec}),
   api('/training/step/start','POST',learner.token,{...payload,expectedStepId:'stale'+step.id,durationSec}),
  ]);
  check(bad[0].status===403&&bad[1].status===409,'FOREIGN403_STALE409');
  check((await row()).length===0,'FOREIGN_STALE_CREATE_NO_NOTIFICATION');
  pass('FOREIGN403_STALE409_NO_PUSH_SUBSCRIPTION_CROSS_OWNER_EFFECT');
  phase='TWO_ACTUAL_TCP_STARTS';
  const starts=await Promise.all([
   api('/training/step/start','POST',learner.token,{...payload,durationSec}),
   api('/training/step/start','POST',learner.token,{...payload,durationSec}),
  ]);
  console.warn('AG1_NOTIF_REAL_HONO_CONCURRENT_START_STATUSES='+starts.map(r=>r.status).sort().join(','));
  check(starts.every(r=>r.status===200),'TWO_ORIGINAL_START_HTTP200');
  const notif=await pollOne();
  check(notif.originalStepId===step.id&&notif.stepIndex===0&&!notif.sent&&!notif.paused,'EXACT_IMMUTABLE_STEP_NOTIFICATION_OWN_IDENTITY');
  check(notif.endTs>Math.floor(Date.now()/1000)+14000,'LONG_DELAY_NO_PUSH_DELIVERY');
  check((await row()).length===1,'UNIQUE_SQL_ROW_FOR_CONCURRENT_START');
  check(notif.jobId!==null,'PERSISTED_BULLMQ_JOB_ID');
  ownQueueJobs.add(notif.jobId!);
  const actualJob=await pushQueue.getJob(notif.jobId!);
  check(actualJob&&(await actualJob.getState())==='delayed','ACTUAL_ISOLATED_REDIS_BULLMQ_DELAYED_NOT_EXECUTED');
  check(actualJob.data.notificationId===notif.id,'QUEUE_ENTRY_REFERENCES_EXACT_OWN_SQL_ROW');
  check(await prisma.stepNotification.count({where:{userId:foreign.id}})===0,'FOREIGN_HAS_NO_NOTIFICATIONS');
  pass('REAL_HONO_DOUBLE_START_ONE_DURABLE_NOTIFICATION_ONE_BULLMQ_DELAYED_JOB');
  phase='INSERT_SECOND_OCCURRENCE_AFTER_FIRST_NOTIF';
  const stepB=await prisma.step.create({data:{title:'Second new occurrence bound notification',authorId:author.id,type:'TRAINING',durationSec:14400}});extra.step=stepB.id;
  const linkB=await prisma.stepOnDay.create({data:{dayId:day.id,stepId:stepB.id,order:1}});extra.link=linkB.id;
  const reordered=await api(`/training/day?courseType=${encodeURIComponent(courseType)}&dayOnCourseId=${link.id}&createIfMissing=false`,'GET',learner.token,undefined,true);
  const orderedSteps=data(reordered.json.data).steps;
  check(reordered.status===200&&Array.isArray(orderedSteps)&&orderedSteps.length===2,'REORDERED_DAY_TWO_STEP_GET');
  check(data(orderedSteps[0]).stepOnDayId===linkB.id&&data(orderedSteps[1]).stepOnDayId===occurrence.id,'REORDER_INDEX_CHANGES_IDENTITY_STABLE');
  // The bound Core contract resolves immutable StepOnDayId regardless of obsolete index.
  // An old *valid* identity must affect only A, never the new B occurrence.
  const staleOldIndex=await Promise.all([
    api('/training/step/start','POST',learner.token,{...payload,durationSec,stepIndex:0}),
    api('/training/step/start','POST',foreign.token,{...payload,durationSec,stepIndex:0}),
  ]);
  check(staleOldIndex[0].status===200&&staleOldIndex[1].status===403,'STABLE_OLD_BINDING200_DESPITE_REORDER_FOREIGN403');
  const aAfter=await row();
  check(aAfter.length===1&&aAfter[0].id===notif.id&&aAfter[0].jobId===notif.jobId,'OLD_NOTIFICATION_UNCHANGED_BY_STALE_INDEX');
  check(await prisma.stepNotification.count({where:{userId:learner.id,stepOnDayId:linkB.id}})===0,'NEW_OCCURRENCE_NOT_CREATED_BY_OLD_STALE_ACTION');
  pass('REAL_REORDER_OLD_ID_PAIR200_FOREIGN403_OLD_NOTIFICATION_STAYS_NEW_ABSENT');
  phase='NEW_B_OCCURRENCE_START';
  const payloadB={courseId:course.id,dayOnCourseId:link.id,stepIndex:0,expectedStepOnDayId:linkB.id,expectedStepId:stepB.id};
  const newStart=await api('/training/step/start','POST',learner.token,{...payloadB,durationSec});
  check(newStart.status===200,'NEW_OCCURRENCE_START200');
  let rowB:{id:string;jobId:string|null;originalStepId:string|null}|undefined;
  for(let i=0;i<36;i++){
   const rows=await prisma.stepNotification.findMany({where:{userId:learner.id,dayOnCourseId:link.id,stepOnDayId:linkB.id},select:{id:true,jobId:true,originalStepId:true}});
   if(rows.length===1&&rows[0].jobId){rowB=rows[0];break;}
   await new Promise(r=>setTimeout(r,100));
  }
  check(rowB&&rowB.jobId&&rowB.originalStepId===stepB.id,'NEW_B_OWN_NOTIFICATION_AND_QUEUE_ID');
  ownQueueJobs.add(rowB.jobId);
  check(rowB.id!==notif.id&&rowB.jobId!==notif.jobId,'DISTINCT_A_B_OCCURRENCE_IDENTITY');
  check((await prisma.stepNotification.count({where:{userId:learner.id}}))===2,'EXACT_TWO_SEPARATE_BOUND_NOTIFICATION_ROWS');
  const jobB=await pushQueue.getJob(rowB.jobId);
  check(jobB&&(await jobB.getState())==='delayed'&&jobB.data.notificationId===rowB.id,'OWN_B_DELAYED_QUEUE_EXACT_ID');
  pass('SECOND_OCCURRENCE_UNIQUE_SQL_NOTIFICATION_AND_SEPARATE_DELAYED_BULLMQ_JOB');
  phase='COMPLETE_B_PRESERVE_A';
  const finishB=await api('/training/step/complete/practice','POST',learner.token,payloadB);
  check(finishB.status===200,'COMPLETE_B_HTTP200');
  check(await prisma.stepNotification.count({where:{userId:learner.id,stepOnDayId:linkB.id}})===0,'B_NOTIFICATION_REMOVED_ONLY');
  const keepsA=await row();
  check(keepsA.length===1&&keepsA[0].id===notif.id&&keepsA[0].jobId===notif.jobId,'OLD_A_NOTIFICATION_UNTOUCHED_WHEN_B_COMPLETES');
  check((await pushQueue.getJob(rowB.jobId))===undefined,'B_EXACT_QUEUE_JOB_REMOVED');
  const jobA=await pushQueue.getJob(notif.jobId!);
  check(jobA&&(await jobA.getState())==='delayed','OLD_A_JOB_STILL_DELAYED');
  pass('COMPLETE_NEW_B_CLEARS_ONLY_B_NOTIFICATION_OLD_A_NOT_CHANGED');
  phase='COMPLETE_A_NEW_INDEX';
  const payloadANew={...payload,stepIndex:1};
  const finishA=await api('/training/step/complete/practice','POST',learner.token,payloadANew);
  check(finishA.status===200,'COMPLETE_A_NEW_INDEX_HTTP200');
  const training=await prisma.userTraining.findUnique({where:{userId_dayOnCourseId:{userId:learner.id,dayOnCourseId:link.id}},select:{status:true,steps:{select:{status:true,stepOnDayId:true}}}});
  check(training?.status==='COMPLETED'&&training.steps.length===2&&training.steps.every(x=>x.status==='COMPLETED'),'TWO_UNIQUE_STEPS_COMPLETED_WITH_NEW_INDEX');
  check(await prisma.stepNotification.count({where:{userId:learner.id}})===0,'ALL_ONLY_OWN_PENDING_NOTIFICATIONS_REMOVED');
  check((await pushQueue.getJob(notif.jobId!))===undefined,'OLD_A_QUEUE_CLEARED_BY_EXACT_OCCURRENCE_FINISH');
  pass('OLD_A_COMPLETE_AT_NEW_INDEX_CLEARS_OWN_NOTIFICATION_TWO_COMPLETED_SQL_STEPS');
  await cleanup();
  check(await prisma.user.count()===beforeUsers,'ALL_SYNTHETIC_USERS_RETIRED_AND_ORIGINAL_TOTAL_RESTORED');
  check(await prisma.course.count({where:{type:courseType}})===0,'ONLY_OWN_COURSE_GRAPH_DELETED');
  pass('EXACT_OWN_USER_COURSE_PROGRESS_CLEANUP_ZERO_RESIDUE');
  pass('ORIGINAL_HONO_STALE_REORDER_SECOND_OCCURRENCE_NOTIFICATION_ISOLATION_ACCEPTED');
 }finally{await cleanup();}
}
void main().catch(e=>{process.exitCode=1;console.error('AG1_NORMAL_TRAINING_FAIL_PHASE='+phase+';ERROR='+(e instanceof Error&&e.message.startsWith('LEARN_HTTP_')?e.message:(e instanceof Error?e.name:'UNKNOWN')));}).finally(async()=>{await prisma.$disconnect();await pushQueue.close();connection.disconnect();});
